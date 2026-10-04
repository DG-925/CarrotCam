// CarrotCam phone <-> PC protocol (JSON over WebSocket, video over WebRTC).
// Keep in sync with mobile/lib/services/protocol.dart.

export const PROTOCOL_VERSION = 1
export const DEFAULT_PORT = 47820
export const DISCOVERY_PORT = 47821
export const DISCOVERY_PROBE = 'CARROTCAM_DISCOVER'
export const MDNS_TYPE = 'carrotcam'

export interface PhoneInfo {
  id: string
  name: string
  model: string
  platform: 'android' | 'ios' | string
  app: string
  transport?: 'usb' | 'wifi'
}

export interface PhoneStatus {
  battery?: number
  charging?: boolean
  facing?: 'front' | 'back'
  torch?: boolean
  zoom?: number
  maxZoom?: number
  width?: number
  height?: number
  fps?: number
  cameras?: { id: string; label: string; facing: 'front' | 'back' }[]
  cameraId?: string
  thermal?: string
}

export interface StreamConfig {
  width: number
  height: number
  fps: number
  bitrate: number // kbps
}

export type PhoneToPc =
  | { t: 'hello'; v: number; info: PhoneInfo; code?: string; token?: string }
  | { t: 'offer'; sdp: string; sid?: number }
  | { t: 'answer'; sdp: string }
  | { t: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; sid?: number }
  | { t: 'status'; status: PhoneStatus }
  | { t: 'remote'; action: string; value?: unknown }
  | { t: 'pong' }
  | { t: 'bye' }

export type PcToPhone =
  | { t: 'welcome'; pcId: string; pcName: string; token: string; app: string }
  | { t: 'denied'; reason: 'bad_code' | 'version' | 'busy' }
  | { t: 'start'; config: StreamConfig }
  | { t: 'stop' }
  | { t: 'answer'; sdp: string; sid?: number }
  | { t: 'offer'; sdp: string }
  | { t: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; sid?: number }
  | { t: 'cmd'; action: string; value?: unknown }
  | { t: 'state'; state: RemoteState }
  | { t: 'ping' }

/** Small state snapshot the phone remote panel renders. */
export interface RemoteState {
  active: boolean
  vcam: boolean
  filter: string
  background: string
  autoFrame: boolean
  spotlight: boolean
  retouch: boolean
  privacy: string
  recording: boolean
}
