// Main-thread facade over the render + ML workers.
import type { EffectSettings, Reaction } from '@shared/effects'
import type { LayerSpec } from '@shared/scenes'
import type { EngineStats, FromRender, HandData, ToRender } from './types'
import RenderWorker from './render.worker?worker'
import MlWorker from './ml.worker?worker'

// Chrome's insertable streams ("breakout box"); TS only ships the worker typing.
type TrackProcessorCtor = new (init: { track: MediaStreamTrack; maxBufferSize?: number }) => {
  readable: ReadableStream<VideoFrame>
}
const TrackProcessor = (globalThis as unknown as { MediaStreamTrackProcessor: TrackProcessorCtor })
  .MediaStreamTrackProcessor

export interface EngineEvents {
  stats?: (s: EngineStats) => void
  ready?: (gpu: string) => void
  error?: (message: string) => void
  gesture?: (name: string) => void
  hands?: (hands: HandData[], aspect: number) => void
  ml?: (s: { ready: boolean; delegate: string; error?: string }) => void
  thumbs?: (t: { bitmap: ImageBitmap; ids: string[]; cellW: number; cellH: number; cols: number }) => void
}

export class Engine {
  readonly canvas: HTMLCanvasElement
  private render: Worker
  private ml: Worker
  private width: number
  private height: number
  private fps = 30
  private vcamOn = false
  private snapshotWaiters: ((b: Blob) => void)[] = []
  events: EngineEvents = {}

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'engine-canvas'
    this.canvas.width = width
    this.canvas.height = height

    this.render = new RenderWorker({ name: 'carrotcam-render' })
    this.ml = new MlWorker({ name: 'carrotcam-ml' })
    const channel = new MessageChannel()
    this.ml.postMessage({ t: 'port', port: channel.port2 }, [channel.port2])

    const offscreen = this.canvas.transferControlToOffscreen()
    const base = new URL('./', location.href).toString()
    this.post({ t: 'init', canvas: offscreen, width, height, mlPort: channel.port1, base }, [offscreen, channel.port1])

    this.render.onmessage = (e: MessageEvent<FromRender>) => this.onMessage(e.data)
    this.render.onerror = (e) => this.events.error?.(`Render worker crashed: ${e.message}`)
    this.ml.onerror = (e) => this.events.ml?.({ ready: false, delegate: 'none', error: e.message })
  }

  private post(msg: ToRender, transfer: Transferable[] = []): void {
    this.render.postMessage(msg, transfer)
  }

  private onMessage(msg: FromRender): void {
    switch (msg.t) {
      case 'vcamFrame':
        if (this.vcamOn && msg.width === this.width && msg.height === this.height) {
          window.carrot.vcam.send(new Uint8Array(msg.buffer))
        }
        // hand the buffer back for reuse (null tells the worker it was consumed)
        if (msg.buffer.byteLength) this.post({ t: 'return', buffer: msg.buffer }, [msg.buffer])
        else this.post({ t: 'return', buffer: null })
        break
      case 'stats':
        this.events.stats?.(msg.stats)
        break
      case 'snapshot':
        this.snapshotWaiters.splice(0).forEach((fn) => fn(msg.blob))
        break
      case 'thumbs':
        this.events.thumbs?.(msg)
        break
      case 'gesture':
        this.events.gesture?.(msg.name)
        break
      case 'hands':
        this.events.hands?.(msg.hands, msg.aspect)
        break
      case 'ml':
        this.events.ml?.(msg)
        break
      case 'ready':
        this.events.ready?.(msg.gpu)
        break
      case 'error':
        this.events.error?.(msg.message)
        break
      case 'log':
        console.log(`[engine] ${msg.message}`)
        break
    }
  }

  setSource(track: MediaStreamTrack | null, id: string | null = null): void {
    if (!track) {
      this.post({ t: 'source', stream: null, id: null })
      return
    }
    const processor = new TrackProcessor({ track, maxBufferSize: 2 })
    this.post({ t: 'source', stream: processor.readable, id }, [processor.readable as unknown as Transferable])
  }

  /** Pen position (source uv) from hand control while drawing. */
  setInk(pointer: [number, number] | null, drawing: boolean): void {
    this.post({ t: 'ink', pointer, drawing })
  }

  clearInk(): void {
    this.post({ t: 'inkClear' })
  }

  /** Hand control: zoom / move / commands with hand gestures. */
  setHandControl(enabled: boolean): void {
    this.post({ t: 'handControl', enabled })
  }

  setEffects(effects: EffectSettings): void {
    this.post({ t: 'settings', effects })
  }

  setOutput(width: number, height: number, fps: number): void {
    const changed = width !== this.width || height !== this.height || fps !== this.fps
    this.width = width
    this.height = height
    this.fps = fps
    this.post({ t: 'output', width, height })
    if (changed && this.vcamOn) this.setVcam(true)
  }

  /** Starts/stops publishing to the CarrotCam virtual camera. */
  setVcam(enabled: boolean): boolean {
    const vcam = window.carrot.vcam
    if (enabled) {
      vcam.stop()
      this.vcamOn = vcam.start(this.width, this.height, this.fps)
    } else {
      vcam.stop()
      this.vcamOn = false
    }
    this.post({ t: 'vcam', enabled: this.vcamOn })
    return this.vcamOn
  }

  get vcamRunning(): boolean {
    return this.vcamOn
  }

  setCompare(value: number | null): void {
    this.post({ t: 'compare', value: value ?? -1 })
  }

  snapshot(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Snapshot timed out')), 4000)
      this.snapshotWaiters.push((b) => {
        clearTimeout(timer)
        resolve(b)
      })
      this.post({ t: 'snapshot' })
    })
  }

  react(kind: Reaction): void {
    this.post({ t: 'reaction', kind })
  }

  setLut(size: number, data: Uint8Array | null): void {
    if (data) this.post({ t: 'lut', size, data }, [data.buffer])
    else this.post({ t: 'lut', size: 2, data: null })
  }

  async setBackgroundImage(blob: Blob | null): Promise<void> {
    if (!blob) {
      this.post({ t: 'bgImage', bitmap: null })
      return
    }
    const bitmap = await createImageBitmap(blob, { resizeWidth: 1920, resizeQuality: 'high' })
    this.post({ t: 'bgImage', bitmap }, [bitmap])
  }

  // ---- scenes ----
  setScene(layers: LayerSpec[] | null): void {
    this.post({ t: 'scene', layers })
  }

  /** Streams a source's video into the scene (screen, window, video file, camera). */
  setLayerTrack(key: string, track: MediaStreamTrack): void {
    const processor = new TrackProcessor({ track, maxBufferSize: 1 })
    this.post({ t: 'layerStream', key, stream: processor.readable }, [processor.readable as unknown as Transferable])
  }

  setLayerImage(key: string, bitmap: ImageBitmap): void {
    this.post({ t: 'layerImage', key, bitmap }, [bitmap])
  }

  /** Raw BGRA pixels (web pages), optionally only the part that changed. */
  setLayerPixels(key: string, frame: { fw: number; fh: number; x: number; y: number; w: number; h: number; data: ArrayBuffer }): void {
    this.post({ t: 'layerPixels', key, ...frame }, [frame.data])
  }

  dropLayer(key: string): void {
    this.post({ t: 'layerDrop', key })
  }

  /** Efficiency mode for slower PCs. */
  setEfficient(efficient: boolean): void {
    this.post({ t: 'perf', efficient })
  }

  requestThumbs(ids: string[]): void {
    this.post({ t: 'thumbs', ids })
  }

  setStandbyText(text: string): void {
    this.post({ t: 'standbyText', text })
  }

  captureStream(fps = 30): MediaStream {
    return this.canvas.captureStream(fps)
  }
}
