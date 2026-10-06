// Snapshots and recordings: the Gallery's file access, the media:// protocol
// that serves them to the renderer, and recordings streamed straight to disk.
import { app, protocol, shell } from 'electron'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, type WriteStream } from 'node:fs'
import { basename, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import log from 'electron-log/main'
import type { CaptureItem } from '@shared/app'
import { modelPath } from './models'

type Kind = CaptureItem['kind']

const PHOTO = /\.(png|jpe?g|webp)$/i
const VIDEO = /\.(mp4|webm|mkv)$/i
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gz: 'application/gzip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska'
}

export function captureDir(kind: Kind): string {
  const dir = join(app.getPath(kind === 'photo' ? 'pictures' : 'videos'), 'CarrotCam')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolves a capture by kind + file name, refusing anything outside the CarrotCam folders. */
export function capturePath(kind: Kind, name: string): string | null {
  if (kind !== 'photo' && kind !== 'video') return null
  const clean = basename(String(name))
  if (!clean || clean !== name || !(kind === 'photo' ? PHOTO : VIDEO).test(clean)) return null
  const dir = captureDir(kind)
  const file = normalize(join(dir, clean))
  return file.startsWith(dir + sep) ? file : null
}

export function listCaptures(limit = 400): CaptureItem[] {
  const out: CaptureItem[] = []
  for (const kind of ['photo', 'video'] as const) {
    let names: string[] = []
    try {
      names = readdirSync(captureDir(kind))
    } catch {
      continue
    }
    for (const name of names) {
      if (!(kind === 'photo' ? PHOTO : VIDEO).test(name)) continue
      const path = join(captureDir(kind), name)
      try {
        const st = statSync(path)
        if (!st.isFile() || st.size === 0) continue
        out.push({ name, kind, size: st.size, mtime: st.mtimeMs, path, url: `media://capture/${kind}/${encodeURIComponent(name)}` })
      } catch {
        /* removed meanwhile */
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

/** Moves a capture to the Recycle Bin (recoverable). */
export async function deleteCapture(kind: Kind, name: string): Promise<boolean> {
  const file = capturePath(kind, name)
  if (!file || !existsSync(file)) return false
  try {
    await shell.trashItem(file)
    return true
  } catch (err) {
    log.warn('[captures] delete failed', err)
    return false
  }
}

export async function openCapture(kind: Kind, name: string): Promise<void> {
  const file = capturePath(kind, name)
  if (file) await shell.openPath(file)
}

export async function openCaptureFolder(kind: Kind): Promise<void> {
  await shell.openPath(captureDir(kind))
}

// ---- media:// protocol --------------------------------------------------------------

export const MEDIA_SCHEME = {
  scheme: 'media',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}

/** Serves captures to the renderer, with Range support so videos can seek. */
export function serveMedia(): void {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    const [kind, ...rest] = url.pathname.replace(/^\/+/, '').split('/')
    // media://capture/<kind>/<name>, or media://model/<lang>.tar.gz (downloaded speech models)
    const lang = url.hostname === 'model' ? /^([a-z]{2})\.tar\.gz$/.exec(kind)?.[1] : undefined
    const file =
      url.hostname === 'capture' ? capturePath(kind as Kind, decodeURIComponent(rest.join('/'))) : lang ? modelPath(lang) : null
    if (!file || !existsSync(file)) return new Response('Not found', { status: 404 })
    const size = statSync(file).size
    const type = MIME[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      let end = range[1] && range[2] ? Number(range[2]) : size - 1
      start = Math.min(start, size - 1)
      end = Math.min(Math.max(end, start), size - 1)
      const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    }
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream
    return new Response(body, {
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
    })
  })
}

// ---- recordings streamed to disk --------------------------------------------------
// MediaRecorder hands over a chunk every second; writing each one straight to
// the file keeps memory flat however long the recording is.

const recordings = new Map<number, { stream: WriteStream; path: string }>()
let nextId = 1

function uniqueFile(kind: Kind, ext: string): string {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '')
  const dir = captureDir(kind)
  let file = join(dir, `CarrotCam ${stamp}.${ext}`)
  for (let i = 2; existsSync(file); i++) file = join(dir, `CarrotCam ${stamp} (${i}).${ext}`)
  return file
}

export function recordOpen(ext: string): number {
  const safeExt = /^(mp4|webm)$/.test(ext) ? ext : 'webm'
  const path = uniqueFile('video', safeExt)
  const id = nextId++
  const stream = createWriteStream(path)
  stream.on('error', (err) => log.error('[record] write failed', err))
  recordings.set(id, { stream, path })
  return id
}

export function recordWrite(id: number, data: ArrayBuffer): boolean {
  const r = recordings.get(id)
  if (!r) return false
  r.stream.write(Buffer.from(data))
  return true
}

export function recordClose(id: number): Promise<string | null> {
  const r = recordings.get(id)
  if (!r) return Promise.resolve(null)
  recordings.delete(id)
  return new Promise((resolve) => r.stream.end(() => resolve(r.path)))
}

/** Finishes any recording still open (app quitting mid-recording). */
export function closeAllRecordings(): void {
  for (const [id] of recordings) void recordClose(id)
}

/** Unique file for a snapshot (or a short recording saved in one go). */
export function newCaptureFile(kind: Kind, ext: string): string {
  return uniqueFile(kind, ext)
}
