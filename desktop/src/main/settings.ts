import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { defaultAppSettings, type AppSettings, type MixerChannel } from '@shared/app'

const THEMES = ['system', 'dark', 'light']
const EFFICIENCY = ['auto', 'on', 'off']

function channel(c: Partial<MixerChannel> | undefined, d: MixerChannel): MixerChannel {
  const v = Number(c?.volume)
  return { on: typeof c?.on === 'boolean' ? c.on : d.on, volume: Number.isFinite(v) ? Math.min(1.5, Math.max(0, v)) : d.volume }
}

/** Keeps values in range, so a bad file or patch can't break the app. */
function sanitize(s: AppSettings): AppSettings {
  const d = defaultAppSettings
  const holdMs = Number(s.gestures?.holdMs)
  return {
    ...s,
    theme: THEMES.includes(s.theme) ? s.theme : d.theme,
    efficiency: EFFICIENCY.includes(s.efficiency) ? s.efficiency : d.efficiency,
    gestures: {
      holdMs: Number.isFinite(holdMs) ? Math.min(2000, Math.max(300, Math.round(holdMs))) : d.gestures.holdMs,
      disabled: Array.isArray(s.gestures?.disabled) ? s.gestures.disabled.filter((g) => typeof g === 'string').slice(0, 32) : []
    },
    voice: {
      enabled: !!s.voice?.enabled,
      wakeWord: s.voice?.wakeWord !== false,
      micId: typeof s.voice?.micId === 'string' ? s.voice.micId : null
    },
    lastSeenVersion: typeof s.lastSeenVersion === 'string' ? s.lastSeenVersion : '',
    mixer: {
      mic: channel(s.mixer?.mic, d.mixer.mic),
      desktop: channel(s.mixer?.desktop, d.mixer.desktop),
      media: channel(s.mixer?.media, d.mixer.media)
    }
  }
}

/** Tiny JSON store for app level settings (effects live in the renderer). */
class SettingsStore extends EventEmitter {
  private file = join(app.getPath('userData'), 'settings.json')
  private data: AppSettings = structuredClone(defaultAppSettings)
  private timer: NodeJS.Timeout | null = null

  load(): AppSettings {
    try {
      if (existsSync(this.file)) {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>
        this.data = {
          ...structuredClone(defaultAppSettings),
          ...saved,
          output: { ...defaultAppSettings.output, ...saved.output },
          stream: { ...defaultAppSettings.stream, ...saved.stream },
          gestures: { ...defaultAppSettings.gestures, ...saved.gestures },
          voice: { ...defaultAppSettings.voice, ...saved.voice },
          mixer: saved.mixer ?? {
            ...defaultAppSettings.mixer,
            mic: { ...defaultAppSettings.mixer.mic, on: saved.recordAudio ?? true }
          }
        }
        // v2: the old settings screen made it easy to pick heavy phone
        // encoder settings (VP8/60 fps/40 Mbps); reset to smooth defaults once.
        if ((saved.settingsVersion ?? 1) < 2) {
          this.data.stream = { ...defaultAppSettings.stream }
          this.data.settingsVersion = 2
        }
      }
    } catch {
      this.data = structuredClone(defaultAppSettings)
    }
    this.data = sanitize(this.data)
    // the virtual camera is always on
    this.data.vcamEnabled = true
    return this.data
  }

  get(): AppSettings {
    return this.data
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.data = sanitize({ ...this.data, ...patch, vcamEnabled: true })
    this.emit('change', this.data, patch)
    this.scheduleSave()
    return this.data
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 300)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2))
      renameSync(tmp, this.file)
    } catch {
      /* disk full or read-only profile, keep running with in-memory settings */
    }
  }
}

export const settings = new SettingsStore()
