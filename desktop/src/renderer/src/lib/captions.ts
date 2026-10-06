// Live captions: what you say, as subtitles in the video. Speech is
// recognized offline with the same Vosk model as voice control (free speech
// instead of a fixed list of commands), so nothing leaves the PC.
import type { AppSettings } from '@shared/app'
import { loadModel, unloadModel } from './voice'

type Settings = AppSettings['captions']
type Model = Awaited<ReturnType<typeof loadModel>>
type Recognizer = InstanceType<Model['KaldiRecognizer']>

export type CaptionsStatus = 'off' | 'loading' | 'on' | 'error'

const SAMPLE_RATE = 16000
const MAX_CHARS = 46 // per line
const CLEAR_AFTER_MS = 3500

export interface CaptionsEvents {
  status: (s: CaptionsStatus, error?: string) => void
  /** the caption picture changed (null: nothing to show) */
  picture: (bitmap: ImageBitmap | null, rect: { x: number; y: number; w: number; h: number }) => void
  /** the latest finished sentence (for the transcript) */
  sentence?: (text: string) => void
}

/** Splits text into lines of at most MAX_CHARS, keeping words whole. */
export function wrapLines(text: string, max = MAX_CHARS): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

export class Captions {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private node: ScriptProcessorNode | null = null
  private recognizer: Recognizer | null = null
  private token = 0
  private done = '' // finished words still on screen
  private partial = ''
  private lastShown = ''
  private clearTimer: ReturnType<typeof setTimeout> | null = null
  private drawTimer: ReturnType<typeof setTimeout> | null = null
  private settings: Settings = { enabled: false, size: 'medium', position: 'bottom', language: 'en' }
  private lang = 'en'
  private outputHeight = 720
  private outputAspect = 16 / 9

  constructor(private ev: CaptionsEvents) {}

  get running(): boolean {
    return !!this.recognizer
  }

  configure(settings: Settings, output: { width: number; height: number }): void {
    const changedLook = settings.size !== this.settings.size || settings.position !== this.settings.position
    this.settings = settings
    this.outputHeight = output.height
    this.outputAspect = output.width / output.height
    if (changedLook) {
      this.lastShown = ''
      this.schedule()
    }
  }

  async start(micId: string | null, lang = 'en'): Promise<void> {
    const token = ++this.token
    this.teardown()
    // the English model stays loaded for voice commands; other languages are freed when not used
    if (this.lang !== lang && this.lang !== 'en') unloadModel(this.lang)
    this.lang = lang
    this.ev.status('loading')
    try {
      const [model, stream] = await Promise.all([
        loadModel(lang),
        navigator.mediaDevices.getUserMedia({
          audio: { deviceId: micId ? { exact: micId } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
      ])
      if (token !== this.token) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const recognizer = new model.KaldiRecognizer(SAMPLE_RATE)
      recognizer.on('partialresult', (msg) => {
        if (msg.event !== 'partialresult') return
        const text = msg.result.partial?.trim() ?? ''
        if (text === this.partial) return
        this.partial = text
        this.touch()
      })
      recognizer.on('result', (msg) => {
        if (msg.event !== 'result') return
        const text = msg.result.text?.trim() ?? ''
        this.partial = ''
        if (text && !(this.lang === 'en' && (text === 'the' || text === 'huh'))) {
          this.done = `${this.done} ${text}`.trim()
          this.ev.sentence?.(text)
        }
        this.touch()
      })
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      const source = ctx.createMediaStreamSource(stream)
      const node = ctx.createScriptProcessor(4096, 1, 1)
      node.onaudioprocess = (e) => recognizer.acceptWaveformFloat(e.inputBuffer.getChannelData(0), SAMPLE_RATE)
      source.connect(node)
      node.connect(ctx.destination)
      this.stream = stream
      this.ctx = ctx
      this.node = node
      this.recognizer = recognizer
      this.ev.status('on')
    } catch (err) {
      if (token !== this.token) return
      this.teardown()
      const e = err as Error
      this.ev.status('error', e?.name === 'NotAllowedError' ? 'Microphone access was blocked' : e?.name === 'NotFoundError' ? 'No microphone found' : `Captions could not start: ${e?.message ?? e}`)
    }
  }

  stop(): void {
    this.token++
    this.teardown()
    if (this.lang !== 'en') unloadModel(this.lang)
    this.lang = 'en'
    this.done = ''
    this.partial = ''
    this.lastShown = ''
    this.ev.picture(null, { x: 0, y: 0, w: 1, h: 1 })
    this.ev.status('off')
  }

  /** New words: show them now, and clear the captions after a pause. */
  private touch(): void {
    if (this.clearTimer) clearTimeout(this.clearTimer)
    this.clearTimer = setTimeout(() => {
      this.done = ''
      this.partial = ''
      this.schedule()
    }, CLEAR_AFTER_MS)
    this.schedule()
  }

  private schedule(): void {
    if (this.drawTimer) return
    this.drawTimer = setTimeout(() => {
      this.drawTimer = null
      this.draw()
    }, 80)
  }

  private draw(): void {
    if (!this.recognizer) return
    const all = wrapLines(`${this.done} ${this.partial}`.trim())
    // keep what is said now and the line before it; drop older lines for good
    if (all.length > 2) this.done = wrapLines(this.done).slice(-1).join(' ')
    const lines = all.slice(-2)
    const key = lines.join('\n')
    if (key === this.lastShown) return
    this.lastShown = key
    if (!lines.length) {
      this.ev.picture(null, { x: 0, y: 0, w: 1, h: 1 })
      return
    }
    const scale = this.outputHeight / 720
    const size = { small: 26, medium: 34, large: 44 }[this.settings.size] * scale
    const font = `600 ${size}px 'Segoe UI Variable Text', 'Segoe UI', Tahoma, Inter, system-ui, sans-serif`
    const measure = new OffscreenCanvas(1, 1).getContext('2d')!
    measure.font = font
    const padX = size * 0.6
    const padY = size * 0.35
    const lineH = size * 1.3
    const width = Math.ceil(Math.max(...lines.map((l) => measure.measureText(l).width)) + padX * 2)
    const height = Math.ceil(lines.length * lineH + padY * 2)
    const canvas = new OffscreenCanvas(width, height)
    const g = canvas.getContext('2d')!
    g.fillStyle = 'rgba(8, 8, 10, 0.72)'
    g.beginPath()
    g.roundRect(0, 0, width, height, size * 0.3)
    g.fill()
    g.font = font
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    // Arabic reads right to left
    g.direction = /[\u0600-\u06FF]/.test(key) ? 'rtl' : 'ltr'
    lines.forEach((l, i) => g.fillText(l, width / 2, padY + lineH * (i + 0.5)))
    const outW = this.outputHeight * this.outputAspect
    const w = width / outW
    const h = height / this.outputHeight
    const margin = 0.06
    const rect = { x: (1 - w) / 2, y: this.settings.position === 'top' ? margin : 1 - h - margin, w, h }
    this.ev.picture(canvas.transferToImageBitmap(), rect)
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
    if (this.clearTimer) clearTimeout(this.clearTimer)
  }
}
