import { create } from 'zustand'
import { cloneEffects, defaultEffects, mergeEffects, type EffectSettings } from '@shared/effects'
import {
  defaultAppSettings,
  type AppSettings,
  type ConnectedDevice,
  type DriverStatus,
  type ServerInfo,
  type UpdateState
} from '@shared/app'
import type { PhoneStatus } from '@shared/protocol'
import type { EngineStats } from '@/engine/types'
import type { Preset } from './presets'

export type Page = 'studio' | 'devices' | 'settings'
export type PanelTab =
  | 'looks'
  | 'adjust'
  | 'filters'
  | 'effects'
  | 'background'
  | 'retouch'
  | 'lighting'
  | 'framing'
  | 'overlays'

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  title: string
  body?: string
  action?: { label: string; run: () => void }
}

export interface SourceState {
  id: string | null
  label: string
  kind: 'phone' | 'camera' | null
  state: 'idle' | 'connecting' | 'live' | 'error'
  error?: string
}

export interface LinkStats {
  bitrate: number // kbps
  fps: number
  rtt: number // ms
  codec: string
  width: number
  height: number
  lost: number
  state: string
}

export interface CameraInfo {
  id: string
  label: string
}

const EFFECTS_KEY = 'carrotcam.effects.v1'
const PRESETS_KEY = 'carrotcam.presets.v1'

function loadEffects(): EffectSettings {
  try {
    const raw = localStorage.getItem(EFFECTS_KEY)
    const e = raw ? mergeEffects(JSON.parse(raw)) : cloneEffects(defaultEffects)
    e.privacy = 'off' // never start in privacy mode
    return e
  } catch {
    return cloneEffects(defaultEffects)
  }
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as Preset[]).map((p) => ({ ...p, effects: mergeEffects(p.effects) }))
  } catch {
    return []
  }
}

interface StoreState {
  ready: boolean
  app: AppSettings
  dark: boolean
  page: Page
  tab: PanelTab
  effects: EffectSettings
  userPresets: Preset[]
  activePreset: string | null
  devices: ConnectedDevice[]
  phoneStatus: Record<string, PhoneStatus>
  linkStats: Record<string, LinkStats>
  cameras: CameraInfo[]
  source: SourceState
  stats: EngineStats | null
  vcam: { running: boolean; inUse: boolean; available: boolean; error: string | null }
  driver: DriverStatus | null
  server: (ServerInfo & { trusted?: { id: string; name: string; lastSeen: number }[] }) | null
  update: UpdateState
  recording: { active: boolean; startedAt: number }
  compare: boolean
  ml: { ready: boolean; delegate: string; error?: string } | null
  toasts: Toast[]
  gpu: string

  set: (patch: Partial<StoreState>) => void
  setPage: (page: Page) => void
  setTab: (tab: PanelTab) => void
  updateEffects: (fn: (e: EffectSettings) => void) => void
  replaceEffects: (e: EffectSettings, presetId?: string | null) => void
  saveUserPreset: (name: string) => void
  deleteUserPreset: (id: string) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
}

let toastId = 1
let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  app: defaultAppSettings,
  dark: true,
  page: 'studio',
  tab: 'looks',
  effects: loadEffects(),
  userPresets: loadPresets(),
  activePreset: null,
  devices: [],
  phoneStatus: {},
  linkStats: {},
  cameras: [],
  source: { id: null, label: 'No camera', kind: null, state: 'idle' },
  stats: null,
  vcam: { running: false, inUse: false, available: false, error: null },
  driver: null,
  server: null,
  update: { state: 'idle' },
  recording: { active: false, startedAt: 0 },
  compare: false,
  ml: null,
  toasts: [],
  gpu: '',

  set: (patch) => set(patch),
  setPage: (page) => set({ page }),
  setTab: (tab) => set({ tab }),

  updateEffects: (fn) => {
    const next = cloneEffects(get().effects)
    fn(next)
    set({ effects: next, activePreset: null })
  },

  replaceEffects: (e, presetId = null) => {
    const next = cloneEffects(e)
    next.privacy = get().effects.privacy
    // keep the user's own name tag text when applying presets
    next.overlay.nameTag.name = get().effects.overlay.nameTag.name
    next.overlay.nameTag.title = get().effects.overlay.nameTag.title
    set({ effects: next, activePreset: presetId })
  },

  saveUserPreset: (name) => {
    const preset: Preset = {
      id: `user:${Date.now().toString(36)}`,
      name: name.trim().slice(0, 32) || 'My look',
      emoji: '⭐',
      effects: cloneEffects(get().effects)
    }
    const userPresets = [...get().userPresets, preset]
    set({ userPresets, activePreset: preset.id })
    localStorage.setItem(PRESETS_KEY, JSON.stringify(userPresets))
  },

  deleteUserPreset: (id) => {
    const userPresets = get().userPresets.filter((p) => p.id !== id)
    set({ userPresets })
    localStorage.setItem(PRESETS_KEY, JSON.stringify(userPresets))
  },

  toast: (t) => {
    const toast = { ...t, id: toastId++ }
    set({ toasts: [...get().toasts.slice(-3), toast] })
    setTimeout(() => get().dismissToast(toast.id), t.kind === 'error' ? 7000 : 4200)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) })
}))

// persist effects (debounced)
useStore.subscribe((state, prev) => {
  if (state.effects === prev.effects) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(EFFECTS_KEY, JSON.stringify(useStore.getState().effects))
    } catch {
      /* storage full */
    }
  }, 300)
})

export const toast = (t: Omit<Toast, 'id'>): void => useStore.getState().toast(t)
