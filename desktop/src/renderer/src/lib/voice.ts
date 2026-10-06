// Offline voice commands with Vosk (Kaldi compiled to WebAssembly).
//
// The microphone is resampled to 16 kHz and fed to a recognizer limited to the
// phrases in voice-commands.ts. Say "Carrot, <command>", or press
// Ctrl + Alt + Space and say just the command within a few seconds.
import { parseHeard, voiceGrammar, type Heard } from './voice-commands'

type VoskModule = typeof import('vosk-browser')
type Model = Awaited<ReturnType<VoskModule['createModel']>>
type Recognizer = InstanceType<Model['KaldiRecognizer']>

export type VoiceStatus = 'off' | 'loading' | 'listening' | 'error'

export interface VoiceEvents {
  status: (status: VoiceStatus, error?: string) => void
  heard: (h: Heard) => void
  /** microphone level 0..1, a few times a second (for the meter) */
  level?: (v: number) => void
}

const SAMPLE_RATE = 16000
const models = new Map<string, Promise<Model>>()

/** Where a language's model is: English ships with the app, others were downloaded (media://model/…). */
function modelUrl(lang: string): string {
  return lang === 'en' ? new URL('vosk/model.tar.gz', location.href).toString() : `media://model/${lang}.tar.gz`
}

/**
 * vosk-browser starts its worker from a blob: URL, which would inherit the
 * page's Content-Security-Policy (no eval). We ship the same worker as a file
 * (scripts/fetch-assets.mjs) and swap the URL while the model is created.
 */
async function createModelWithFileWorker(vosk: VoskModule, url: string): Promise<Model> {
  const RealWorker = window.Worker
  const workerUrl = new URL('vosk/vosk-worker.js', location.href).toString()
  window.Worker = class extends RealWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(String(url).startsWith('blob:') ? workerUrl : url, options)
    }
  }
  try {
    // the worker is created synchronously inside createModel
    return vosk.createModel(url, -1)
  } finally {
    window.Worker = RealWorker
  }
}

export function loadModel(lang = 'en'): Promise<Model> {
  let p = models.get(lang)
  if (!p) {
    p = import('vosk-browser')
      .then((vosk) => createModelWithFileWorker(vosk, modelUrl(lang)))
      .catch((err) => {
        models.delete(lang)
        throw err
      })
    models.set(lang, p)
  }
  return p
}

/** Frees a language's model (e.g. after switching the captions language). */
export function unloadModel(lang: string): void {
  const p = models.get(lang)
  models.delete(lang)
  void p?.then((m) => m.terminate()).catch(() => {})
}

export class VoiceControl {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private node: ScriptProcessorNode | null = null
  private recognizer: Recognizer | null = null
  private token = 0
  private levelAt = 0
  private peak = 0

  constructor(private ev: VoiceEvents) {}

  get running(): boolean {
    return !!this.recognizer
  }

  async start(micId: string | null): Promise<void> {
    const token = ++this.token
    this.teardown()
    this.ev.status('loading')
    try {
      const [model, stream] = await Promise.all([
        loadModel(),
        navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: micId ? { exact: micId } : undefined,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
      ])
      if (token !== this.token) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const recognizer = new model.KaldiRecognizer(SAMPLE_RATE, JSON.stringify(voiceGrammar()))
      recognizer.on('result', (msg) => {
        if (msg.event !== 'result') return
        const text = msg.result.text?.trim()
        if (text) this.ev.heard(parseHeard(text))
      })
      // Chrome resamples the microphone for us: the recognizer wants 16 kHz
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      const source = ctx.createMediaStreamSource(stream)
      const node = ctx.createScriptProcessor(4096, 1, 1)
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0)
        recognizer.acceptWaveformFloat(data, SAMPLE_RATE)
        this.meter(data)
      }
      source.connect(node)
      // a ScriptProcessor only runs while connected to the output; it writes silence
      node.connect(ctx.destination)
      this.stream = stream
      this.ctx = ctx
      this.node = node
      this.recognizer = recognizer
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (token === this.token) {
          this.teardown()
          this.ev.status('error', 'The microphone was disconnected')
        }
      })
      this.ev.status('listening')
    } catch (err) {
      if (token !== this.token) return
      this.teardown()
      const e = err as Error
      const message =
        e?.name === 'NotAllowedError'
          ? 'Microphone access was blocked'
          : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError'
            ? 'No microphone found'
            : `Voice control could not start: ${e?.message ?? e}`
      this.ev.status('error', message)
    }
  }

  stop(): void {
    this.token++
    this.teardown()
    this.ev.status('off')
  }

  private meter(data: Float32Array): void {
    if (!this.ev.level) return
    let peak = 0
    for (let i = 0; i < data.length; i += 8) peak = Math.max(peak, Math.abs(data[i]))
    this.peak = Math.max(peak, this.peak * 0.7)
    const now = performance.now()
    if (now - this.levelAt > 250) {
      this.levelAt = now
      this.ev.level(Math.min(1, this.peak * 2.5))
    }
  }

  private teardown(): void {
    if (this.node) this.node.onaudioprocess = null
    this.node?.disconnect()
    void this.ctx?.close().catch(() => {})
    this.stream?.getTracks().forEach((t) => t.stop())
    this.recognizer?.remove()
    this.node = null
    this.ctx = null
    this.stream = null
    this.recognizer = null
  }
}
