// WebRTC receiver for one phone. Signaling goes through the main process
// WebSocket server; media flows directly phone -> PC on the LAN.
import { IPC } from '@shared/app'
import type { PcToPhone, PhoneToPc, StreamConfig } from '@shared/protocol'
import type { LinkStats } from '@/lib/store'
import { invoke } from '@/lib/ipc'

type Codec = 'h264' | 'vp8' | 'vp9'

export class PhoneLink {
  private pc: RTCPeerConnection | null = null
  private pendingIce: RTCIceCandidateInit[] = []
  private waiter: { resolve: (t: MediaStreamTrack) => void; reject: (e: Error) => void } | null = null
  private statsTimer: ReturnType<typeof setInterval> | null = null
  private last = { bytes: 0, ts: 0 }
  track: MediaStreamTrack | null = null
  private config: StreamConfig | null = null
  onStats: (s: LinkStats) => void = () => {}
  onEnded: () => void = () => {}

  constructor(
    readonly deviceId: string,
    private opts: { lowLatency: boolean; codec: Codec }
  ) {}

  private send(msg: PcToPhone): void {
    void invoke(IPC.serverSend, this.deviceId, msg)
  }

  /** Asks the phone to start streaming and resolves with the incoming video track. */
  start(config: StreamConfig, timeoutMs = 20000): Promise<MediaStreamTrack> {
    this.closePeer()
    this.config = config
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null
        reject(new Error('The phone did not start streaming. Is the CarrotCam app open?'))
      }, timeoutMs)
      this.waiter = {
        resolve: (t) => {
          clearTimeout(timer)
          resolve(t)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        }
      }
      this.send({ t: 'start', config })
    })
  }

  stop(): void {
    this.send({ t: 'stop' })
    this.closePeer()
  }

  command(action: string, value?: unknown): void {
    this.send({ t: 'cmd', action, value })
  }

  async handle(msg: PhoneToPc): Promise<void> {
    if (msg.t === 'offer') await this.onOffer(msg.sdp)
    else if (msg.t === 'ice') {
      const c: RTCIceCandidateInit = { candidate: msg.candidate, sdpMid: msg.sdpMid, sdpMLineIndex: msg.sdpMLineIndex }
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(c).catch(() => {})
      else this.pendingIce.push(c)
    }
  }

  private async onOffer(sdp: string): Promise<void> {
    this.closePeer(false)
    const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' })
    this.pc = pc
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({
          t: 'ice',
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex
        })
      }
    }
    pc.ontrack = (e) => {
      if (e.track.kind !== 'video') return
      const receiver = e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null; playoutDelayHint?: number }
      if (this.opts.lowLatency) {
        try {
          receiver.jitterBufferTarget = 0
        } catch {
          /* unsupported */
        }
        try {
          receiver.playoutDelayHint = 0
        } catch {
          /* unsupported */
        }
      }
      this.track = e.track
      e.track.onended = () => this.onEnded()
      this.waiter?.resolve(e.track)
      this.waiter = null
    }
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return
      if (pc.connectionState === 'failed') {
        this.waiter?.reject(new Error('Could not connect to the phone (network or firewall).'))
        this.waiter = null
        this.onEnded()
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        this.onEnded()
      }
    }

    await pc.setRemoteDescription({ type: 'offer', sdp })
    this.preferCodec(pc)
    const answer = await pc.createAnswer()
    answer.sdp = this.tuneBitrate(answer.sdp ?? '')
    await pc.setLocalDescription(answer)
    this.send({ t: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' })
    for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {})
    this.startStats()
  }

  /**
   * On a LAN there is no reason to start at WebRTC's default 300 kbps and ramp
   * up for several seconds: tell the phone's encoder to start high.
   */
  private tuneBitrate(sdp: string): string {
    const max = this.config?.bitrate ?? 10000
    const start = Math.round(Math.min(max * 0.7, 8000))
    const min = Math.round(Math.min(1500, max * 0.3))
    const video = /^a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\//gm
    const pts = new Set<string>()
    for (const m of sdp.matchAll(video)) pts.add(m[1])
    return sdp.replace(/^a=fmtp:(\d+) ([^\r\n]*)/gm, (line, pt: string, params: string) =>
      pts.has(pt) && !params.includes('x-google-start-bitrate')
        ? `a=fmtp:${pt} ${params};x-google-start-bitrate=${start};x-google-min-bitrate=${min};x-google-max-bitrate=${max}`
        : line
    )
  }

  private preferCodec(pc: RTCPeerConnection): void {
    const caps = RTCRtpReceiver.getCapabilities('video')
    if (!caps) return
    const order: Record<Codec, string[]> = {
      h264: ['video/H264', 'video/VP8', 'video/VP9'],
      vp8: ['video/VP8', 'video/H264', 'video/VP9'],
      vp9: ['video/VP9', 'video/VP8', 'video/H264']
    }
    const rank = (mime: string): number => {
      const i = order[this.opts.codec].indexOf(mime)
      return i < 0 ? 10 : i
    }
    const codecs = [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType))
    for (const t of pc.getTransceivers()) {
      if (t.receiver.track?.kind === 'video') {
        try {
          t.setCodecPreferences(codecs)
        } catch {
          /* keep defaults */
        }
      }
    }
  }

  private startStats(): void {
    if (this.statsTimer) clearInterval(this.statsTimer)
    this.last = { bytes: 0, ts: 0 }
    this.statsTimer = setInterval(async () => {
      const pc = this.pc
      if (!pc) return
      const report = await pc.getStats().catch(() => null)
      if (!report) return
      const s: LinkStats = { bitrate: 0, fps: 0, rtt: 0, codec: '', width: 0, height: 0, lost: 0, state: pc.connectionState }
      const codecs = new Map<string, string>()
      report.forEach((r) => {
        if (r.type === 'codec') codecs.set(r.id, String(r.mimeType ?? '').replace('video/', ''))
      })
      report.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          if (this.last.ts) s.bitrate = Math.round(((r.bytesReceived - this.last.bytes) * 8) / (r.timestamp - this.last.ts))
          this.last = { bytes: r.bytesReceived, ts: r.timestamp }
          s.fps = Math.round(r.framesPerSecond ?? 0)
          s.width = r.frameWidth ?? 0
          s.height = r.frameHeight ?? 0
          s.lost = r.packetsLost ?? 0
          s.codec = codecs.get(r.codecId) ?? ''
        } else if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
          s.rtt = Math.round((r.currentRoundTripTime ?? 0) * 1000)
        }
      })
      this.onStats(s)
    }, 1000)
  }

  private closePeer(clearTrack = true): void {
    if (this.statsTimer) clearInterval(this.statsTimer)
    this.statsTimer = null
    this.pendingIce = []
    if (this.pc) {
      this.pc.onconnectionstatechange = null
      this.pc.ontrack = null
      this.pc.close()
    }
    this.pc = null
    if (clearTrack) this.track = null
  }

  dispose(): void {
    this.waiter?.reject(new Error('Phone disconnected'))
    this.waiter = null
    this.closePeer()
  }
}
