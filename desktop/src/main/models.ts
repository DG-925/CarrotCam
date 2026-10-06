// Speech models for live captions in other languages. English ships inside
// the app; others are downloaded once from the "voice-models" GitHub
// pre-release and kept in the user's app data folder.
import { app, net } from 'electron'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import log from 'electron-log/main'
import { GITHUB_REPO } from '@shared/app'

export const DOWNLOADABLE: Record<string, { file: string; approxMb: number }> = {
  ar: { file: 'vosk-model-ar.tar.gz', approxMb: 320 }
}

export function modelsDir(): string {
  const dir = join(app.getPath('userData'), 'voice-models')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** The downloaded file for a language, or null (also used by the media:// protocol). */
export function modelPath(lang: string): string | null {
  if (!DOWNLOADABLE[lang]) return null
  const file = join(modelsDir(), `${lang}.tar.gz`)
  return existsSync(file) ? file : null
}

export function modelStatus(lang: string): { installed: boolean; sizeMb: number; downloading: boolean } {
  const file = modelPath(lang)
  return {
    installed: !!file,
    sizeMb: file ? Math.round(statSync(file).size / 1e6) : (DOWNLOADABLE[lang]?.approxMb ?? 0),
    downloading: active.has(lang)
  }
}

const active = new Map<string, AbortController>()

export async function downloadModel(lang: string, progress: (p: { lang: string; percent: number; done?: boolean; error?: string }) => void): Promise<boolean> {
  const info = DOWNLOADABLE[lang]
  if (!info) return false
  if (active.has(lang)) return true
  const ctrl = new AbortController()
  active.set(lang, ctrl)
  const final = join(modelsDir(), `${lang}.tar.gz`)
  const part = `${final}.part`
  try {
    const url = `https://github.com/${GITHUB_REPO}/releases/download/voice-models/${info.file}`
    const res = await net.fetch(url, { signal: ctrl.signal })
    if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`)
    const total = Number(res.headers.get('content-length')) || info.approxMb * 1e6
    const out = createWriteStream(part)
    const reader = res.body.getReader()
    let got = 0
    let lastSent = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      got += value.byteLength
      if (!out.write(value)) await new Promise((r) => out.once('drain', r))
      const pct = Math.min(99, Math.floor((got / total) * 100))
      if (pct !== lastSent) {
        lastSent = pct
        progress({ lang, percent: pct })
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    renameSync(part, final)
    progress({ lang, percent: 100, done: true })
    return true
  } catch (err) {
    rmSync(part, { force: true })
    const message = ctrl.signal.aborted ? 'Download cancelled' : String((err as Error)?.message ?? err)
    log.warn('[models] download failed', lang, message)
    progress({ lang, percent: 0, error: message })
    return false
  } finally {
    active.delete(lang)
  }
}

export function cancelModelDownload(lang: string): void {
  active.get(lang)?.abort()
}

export function deleteModel(lang: string): void {
  const file = modelPath(lang)
  if (file) rmSync(file, { force: true })
}
