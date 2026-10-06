// Scenes store: the user's scenes and sources (saved on this PC).
import { create } from 'zustand'
import {
  NO_CROP,
  cameraSource,
  defaultScenes,
  newId,
  sanitizeScenes,
  type Rect,
  type Scene,
  type SceneSource,
  type ScenesState,
  type SourceKind,
  type SourceSettings
} from '@shared/scenes'

const KEY = 'carrotcam.scenes.v1'

function load(): ScenesState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitizeScenes(JSON.parse(raw)) : defaultScenes()
  } catch {
    return defaultScenes()
  }
}

export type SourceStatus = { state: 'loading' | 'live' | 'error'; message?: string }

export const KIND_LABEL: Record<SourceKind, string> = {
  camera: 'CarrotCam camera',
  screen: 'Screen',
  window: 'Window',
  image: 'Image',
  video: 'Video',
  web: 'Web page',
  text: 'Text',
  color: 'Color',
  device: 'Camera'
}

interface ScenesStore extends ScenesState {
  selected: string | null
  /** media size of each running source (by media key) */
  sizes: Record<string, { w: number; h: number }>
  status: Record<string, SourceStatus>
  /** sources waiting for their media size to get a good first position */
  toFit: string[]

  activeScene: () => Scene
  setActive: (id: string) => void
  addScene: (name?: string, copy?: boolean) => void
  renameScene: (id: string, name: string) => void
  deleteScene: (id: string) => void
  moveScene: (id: string, step: number) => void
  addSource: (kind: SourceKind, name: string, settings?: SourceSettings, rect?: Rect) => SceneSource
  updateSource: (id: string, patch: Partial<Omit<SceneSource, 'settings'>> & { settings?: Partial<SourceSettings> }) => void
  removeSource: (id: string) => void
  moveSource: (id: string, step: number) => void
  select: (id: string | null) => void
}

export const useScenes = create<ScenesStore>((set, get) => ({
  ...load(),
  selected: null,
  sizes: {},
  status: {},
  toFit: [],

  activeScene: () => {
    const s = get()
    return s.scenes.find((x) => x.id === s.active) ?? s.scenes[0]
  },

  setActive: (id) => {
    if (get().scenes.some((s) => s.id === id)) set({ active: id, selected: null })
  },

  addScene: (name, copy = false) => {
    const current = get().activeScene()
    const scene: Scene = copy
      ? { id: newId(), name: name ?? `${current.name} copy`, sources: current.sources.map((s) => ({ ...structuredClone(s), id: newId() })) }
      : { id: newId(), name: name ?? `Scene ${get().scenes.length + 1}`, sources: [cameraSource()] }
    set({ scenes: [...get().scenes, scene].slice(0, 20), active: scene.id, selected: null })
  },

  renameScene: (id, name) =>
    set({ scenes: get().scenes.map((s) => (s.id === id ? { ...s, name: name.trim().slice(0, 40) || s.name } : s)) }),

  deleteScene: (id) => {
    const scenes = get().scenes.filter((s) => s.id !== id)
    if (!scenes.length) return
    set({ scenes, active: get().active === id ? scenes[0].id : get().active, selected: null })
  },

  moveScene: (id, step) => {
    const scenes = [...get().scenes]
    const i = scenes.findIndex((s) => s.id === id)
    const j = i + step
    if (i < 0 || j < 0 || j >= scenes.length) return
    ;[scenes[i], scenes[j]] = [scenes[j], scenes[i]]
    set({ scenes })
  },

  addSource: (kind, name, settings = {}, rect) => {
    const src: SceneSource = {
      id: newId(),
      kind,
      name: name.slice(0, 60),
      visible: true,
      locked: false,
      rect: rect ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
      crop: { ...NO_CROP },
      opacity: 1,
      radius: kind === 'device' ? 16 : 0,
      settings
    }
    const active = get().active
    set({
      scenes: get().scenes.map((s) => (s.id === active ? { ...s, sources: [...s.sources, src].slice(-30) } : s)),
      selected: src.id,
      toFit: rect ? get().toFit : [...get().toFit, src.id]
    })
    return src
  },

  updateSource: (id, patch) =>
    set({
      scenes: get().scenes.map((sc) => ({
        ...sc,
        sources: sc.sources.map((s) =>
          s.id === id ? { ...s, ...patch, settings: patch.settings ? { ...s.settings, ...patch.settings } : s.settings } : s
        )
      }))
    }),

  removeSource: (id) =>
    set({
      scenes: get().scenes.map((sc) => ({ ...sc, sources: sc.sources.filter((s) => s.id !== id || s.kind === 'camera') })),
      selected: get().selected === id ? null : get().selected
    }),

  moveSource: (id, step) => {
    const active = get().active
    set({
      scenes: get().scenes.map((sc) => {
        if (sc.id !== active) return sc
        const list = [...sc.sources]
        const i = list.findIndex((s) => s.id === id)
        const j = i + step
        if (i < 0 || j < 0 || j >= list.length) return sc
        ;[list[i], list[j]] = [list[j], list[i]]
        return { ...sc, sources: list }
      })
    })
  },

  select: (id) => set({ selected: id })
}))

// save (debounced); runtime fields are not saved
let saveTimer: ReturnType<typeof setTimeout> | null = null
useScenes.subscribe((s, p) => {
  if (s.scenes === p.scenes && s.active === p.active) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const { scenes, active } = useScenes.getState()
      localStorage.setItem(KEY, JSON.stringify({ scenes, active }))
    } catch {
      /* storage full */
    }
  }, 300)
})

/** Which running media a source uses (several sources can share one capture). */
export function mediaKey(s: SceneSource): string | null {
  switch (s.kind) {
    case 'camera':
      return 'camera'
    case 'screen':
    case 'window':
      return s.settings.captureId ? `cap:${s.settings.captureId}` : null
    case 'image':
      return s.settings.fileId ? `img:${s.settings.fileId}` : null
    case 'video':
      return s.settings.fileId ? `vid:${s.settings.fileId}` : null
    case 'web':
      return `web:${s.id}`
    case 'text':
      return `txt:${s.id}`
    case 'device':
      return s.settings.deviceId ? `dev:${s.settings.deviceId}` : null
    case 'color':
      return null
  }
}

/** Ready-made places for a source (output fractions); aspect is the source's w/h. */
export function layoutRect(where: 'full' | 'fit' | 'left' | 'right' | 'corner-br' | 'corner-bl' | 'corner-tr' | 'corner-tl' | 'center', aspect: number, outAspect: number): Rect {
  const fit = (maxW: number, maxH: number): { w: number; h: number } => {
    let w = maxW
    let h = (w * outAspect) / aspect
    if (h > maxH) {
      h = maxH
      w = (h * aspect) / outAspect
    }
    return { w, h }
  }
  const m = 0.03
  switch (where) {
    case 'full':
      return { x: 0, y: 0, w: 1, h: 1 }
    case 'fit': {
      const { w, h } = fit(1, 1)
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
    }
    case 'center': {
      const { w, h } = fit(0.6, 0.6)
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
    }
    case 'left': {
      const { w, h } = fit(0.5, 1)
      return { x: 0.5 - w, y: (1 - h) / 2, w, h }
    }
    case 'right': {
      const { w, h } = fit(0.5, 1)
      return { x: 0.5, y: (1 - h) / 2, w, h }
    }
    default: {
      const { w, h } = fit(0.28, 0.4)
      const right = where.endsWith('r')
      const bottom = where.includes('-b')
      const my = m * outAspect
      return { x: right ? 1 - w - m : m, y: bottom ? 1 - h - my : my, w, h }
    }
  }
}
