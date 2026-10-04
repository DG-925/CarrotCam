import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { defaultAppSettings, type AppSettings } from '@shared/app'

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
          stream: { ...defaultAppSettings.stream, ...saved.stream }
        }
      }
    } catch {
      this.data = structuredClone(defaultAppSettings)
    }
    return this.data
  }

  get(): AppSettings {
    return this.data
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch }
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
