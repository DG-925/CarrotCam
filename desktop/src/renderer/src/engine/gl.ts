// Minimal WebGL2 helpers for the render worker.
import { VS } from './shaders'

export type Uniforms = Record<string, WebGLUniformLocation | null>

export interface Program {
  prog: WebGLProgram
  u: Uniforms
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Shader compile error: ${info}`)
  }
  return sh
}

export function program(gl: WebGL2RenderingContext, fs: string): Program {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`)
  }
  const u: Uniforms = {}
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i)
    if (!info) continue
    const name = info.name.replace(/\[0\]$/, '')
    u[name] = gl.getUniformLocation(prog, info.name)
  }
  return { prog, u }
}

export function texture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  opts: { internal?: number; format?: number; type?: number; filter?: number } = {}
): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  const filter = opts.filter ?? gl.LINEAR
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  if (w > 0 && h > 0) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      opts.internal ?? gl.RGBA8,
      w,
      h,
      0,
      opts.format ?? gl.RGBA,
      opts.type ?? gl.UNSIGNED_BYTE,
      null
    )
  }
  return tex
}

export class Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  constructor(
    private gl: WebGL2RenderingContext,
    public w: number,
    public h: number,
    filter?: number
  ) {
    this.tex = texture(gl, w, h, { filter })
    this.fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  bind(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbo)
    this.gl.viewport(0, 0, this.w, this.h)
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex)
    this.gl.deleteFramebuffer(this.fbo)
  }
}

/** Ring of pixel-pack buffers for stall-free GPU -> CPU readback. */
export class AsyncReader {
  private pbos: WebGLBuffer[] = []
  private fences: (WebGLSync | null)[] = []
  private next = 0
  constructor(
    private gl: WebGL2RenderingContext,
    public bytes: number,
    count = 3
  ) {
    for (let i = 0; i < count; i++) {
      const b = gl.createBuffer()!
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b)
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ)
      this.pbos.push(b)
      this.fences.push(null)
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  }

  /** Queues a readback of the currently bound read framebuffer. Returns false when the ring is full. */
  read(w: number, h: number): boolean {
    const gl = this.gl
    const i = this.next
    if (this.fences[i]) return false
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[i])
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    this.fences[i] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    gl.flush()
    this.next = (i + 1) % this.pbos.length
    return true
  }

  /** Delivers every finished readback (oldest first) into buffers from `alloc`. */
  collect(alloc: () => ArrayBuffer | null, deliver: (buf: ArrayBuffer) => void): void {
    const gl = this.gl
    for (let n = 0; n < this.pbos.length; n++) {
      const i = (this.next + n) % this.pbos.length
      const fence = this.fences[i]
      if (!fence) continue
      const status = gl.clientWaitSync(fence, 0, 0)
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) continue
      const buf = alloc()
      if (!buf) return // keep it pending until a buffer comes back
      gl.deleteSync(fence)
      this.fences[i] = null
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[i])
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, new Uint8Array(buf, 0, this.bytes))
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      deliver(buf)
    }
  }

  /** True while a readback is still in flight. */
  pending(): boolean {
    return this.fences.some((f) => f !== null)
  }

  dispose(): void {
    for (const f of this.fences) if (f) this.gl.deleteSync(f)
    for (const b of this.pbos) this.gl.deleteBuffer(b)
    this.pbos = []
    this.fences = []
  }
}
