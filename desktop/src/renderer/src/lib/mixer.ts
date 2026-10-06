// Audio mixer for recordings: desktop audio, microphone and video sources,
// each with its own volume and level meter, mixed into one audio track.
// Sound sources only run while something needs them (a recording, or the
// mixer being on screen), so an idle CarrotCam uses no audio at all.
import type { MixerChannel } from '@shared/app'

export type ChannelId = 'mic' | 'desktop' | 'media'

interface Channel {
  gain: GainNode
  analyser: AnalyserNode
  stream: MediaStream | null
  input: AudioNode | null
  error: string | null
}

const buf = new Float32Array(2048)

class Mixer {
  private ctx: AudioContext | null = null
  private dest: MediaStreamAudioDestinationNode | null = null
  private channels = new Map<ChannelId, Channel>()
  private holds = new Set<string>()
  private settings: Record<ChannelId, MixerChannel> = {
    mic: { on: true, volume: 1 },
    desktop: { on: false, volume: 0.8 },
    media: { on: true, volume: 0.8 }
  }
  private micId: string | null = null
  private opening: Promise<void> | null = null
  /** called when a channel starts, stops or fails (for the UI) */
  onChange: () => void = () => {}

  /** The audio graph; video sources attach to it as soon as they play. */
  context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' })
      this.dest = this.ctx.createMediaStreamDestination()
      for (const id of ['mic', 'desktop', 'media'] as ChannelId[]) {
        const gain = this.ctx.createGain()
        const analyser = this.ctx.createAnalyser()
        analyser.fftSize = 2048
        gain.connect(analyser)
        analyser.connect(this.dest)
        this.channels.set(id, { gain, analyser, stream: null, input: null, error: null })
      }
      this.applyGains()
    }
    return this.ctx
  }

  configure(settings: Record<ChannelId, MixerChannel>, micId: string | null): void {
    const micChanged = micId !== this.micId
    this.settings = settings
    this.micId = micId
    this.applyGains()
    if (this.holds.size) void this.refresh(micChanged)
  }

  private applyGains(): void {
    for (const [id, ch] of this.channels) {
      const s = this.settings[id]
      ch.gain.gain.value = s.on ? s.volume : 0
    }
  }

  /** Something needs audio (a recording, the mixer UI); returns when the inputs are open. */
  async hold(reason: string): Promise<void> {
    this.holds.add(reason)
    this.context()
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {})
    await this.refresh(false)
  }

  release(reason: string): void {
    this.holds.delete(reason)
    if (!this.holds.size) {
      this.closeInput('mic')
      this.closeInput('desktop')
      this.onChange()
    }
  }

  /** The mixed audio track (null when every channel is off). */
  track(): MediaStreamTrack | null {
    const any = (Object.keys(this.settings) as ChannelId[]).some((id) => this.settings[id].on)
    return any ? (this.dest?.stream.getAudioTracks()[0] ?? null) : null
  }

  /** Video file sources: their sound goes only into the mix (not the speakers). */
  attachMedia(el: HTMLMediaElement): () => void {
    const ctx = this.context()
    let node: MediaElementAudioSourceNode | null = null
    try {
      node = ctx.createMediaElementSource(el)
      node.connect(this.channels.get('media')!.gain)
    } catch {
      /* element without audio */
    }
    return () => node?.disconnect()
  }

  /** Level in dB (-60..0) per channel, for the meters. */
  levels(): Record<ChannelId, number> {
    const out = { mic: -60, desktop: -60, media: -60 }
    for (const [id, ch] of this.channels) {
      ch.analyser.getFloatTimeDomainData(buf)
      let peak = 0
      for (let i = 0; i < buf.length; i += 2) peak = Math.max(peak, Math.abs(buf[i]))
      out[id] = Math.max(-60, 20 * Math.log10(peak || 1e-6))
    }
    return out
  }

  error(id: ChannelId): string | null {
    return this.channels.get(id)?.error ?? null
  }

  live(id: ChannelId): boolean {
    return !!this.channels.get(id)?.input
  }

  private async refresh(micChanged: boolean): Promise<void> {
    if (this.opening) await this.opening
    this.opening = (async () => {
      if (micChanged) this.closeInput('mic')
      if (this.settings.mic.on && !this.live('mic')) await this.openMic()
      if (!this.settings.mic.on) this.closeInput('mic')
      if (this.settings.desktop.on && !this.live('desktop')) await this.openDesktop()
      if (!this.settings.desktop.on) this.closeInput('desktop')
      this.onChange()
    })()
    await this.opening
    this.opening = null
  }

  private async openMic(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: this.micId ? { exact: this.micId } : undefined, echoCancellation: true, noiseSuppression: true }
      })
      this.connect('mic', stream)
    } catch (err) {
      this.fail('mic', (err as Error)?.name === 'NotAllowedError' ? 'Microphone access was blocked' : 'No microphone found')
    }
  }

  private async openDesktop(): Promise<void> {
    try {
      // Windows: the sound of the whole PC (needs a video request too, which we drop)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop' } },
        video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 16, maxHeight: 16, maxFrameRate: 1 } }
      } as unknown as MediaStreamConstraints)
      stream.getVideoTracks().forEach((t) => t.stop())
      if (!stream.getAudioTracks().length) throw new Error('no audio')
      this.connect('desktop', stream)
    } catch {
      this.fail('desktop', 'Desktop audio is not available on this PC')
    }
  }

  private connect(id: ChannelId, stream: MediaStream): void {
    const ch = this.channels.get(id)!
    this.closeInput(id)
    const input = this.context().createMediaStreamSource(stream)
    input.connect(ch.gain)
    ch.stream = stream
    ch.input = input
    ch.error = null
  }

  private fail(id: ChannelId, message: string): void {
    const ch = this.channels.get(id)
    if (ch) ch.error = message
  }

  private closeInput(id: ChannelId): void {
    const ch = this.channels.get(id)
    if (!ch) return
    ch.input?.disconnect()
    ch.stream?.getTracks().forEach((t) => t.stop())
    ch.input = null
    ch.stream = null
  }
}

export const mixer = new Mixer()
