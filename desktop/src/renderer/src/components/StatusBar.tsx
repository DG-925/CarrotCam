import { BatteryCharging, BatteryLow, BatteryMedium, Gauge, Hand, Mic, MicOff } from 'lucide-react'
import { useElapsed } from '@/hooks/useElapsed'
import { useStore } from '@/lib/store'
import { isUsbDevice } from '@/lib/usb'

function SourceStatus(): React.JSX.Element {
  const source = useStore((s) => s.source)
  const device = useStore((s) => (source.kind === 'phone' && source.id ? s.devices.find((d) => `phone:${d.id}` === source.id) : undefined))
  const ps = useStore((s) => (device ? s.phoneStatus[device.id] : undefined))

  let tone = ''
  let text = 'No camera. Pick a phone or webcam at the top.'
  if (source.state === 'connecting') {
    tone = 'warn'
    text = `${source.label} · connecting…`
  } else if (source.state === 'error') {
    tone = 'err'
    text = `${source.label} · ${source.error ?? 'something went wrong'}`
  } else if (source.state === 'live') {
    tone = 'ok'
    text =
      source.kind === 'phone'
        ? `${source.label} · connected by ${device && isUsbDevice(device) ? 'USB' : 'Wi-Fi'}`
        : /cam|camera/i.test(source.label)
          ? `${source.label} · on`
          : `${source.label} · webcam`
  }
  const Battery = ps?.charging ? BatteryCharging : (ps?.battery ?? 100) < 25 ? BatteryLow : BatteryMedium
  return (
    <>
      <span className="item">
        <span className={`sdot ${tone}`} />
        {text}
      </span>
      {ps?.battery !== undefined && source.state === 'live' && (
        <span className="item muted">
          <Battery size={14} />
          {Math.round(ps.battery)}%
        </span>
      )}
    </>
  )
}

export function StatusBar(): React.JSX.Element {
  const recording = useStore((s) => s.recording)
  const handControl = useStore((s) => s.app.handControl)
  const voiceOn = useStore((s) => s.app.voice.enabled)
  const voice = useStore((s) => s.voice.status)
  const efficient = useStore((s) => s.efficient)
  const efficiency = useStore((s) => s.app.efficiency)
  const set = useStore((s) => s.set)
  const elapsed = useElapsed(recording.startedAt)

  const voiceText =
    voice === 'listening' ? 'Voice: say “Carrot…”' : voice === 'loading' ? 'Voice: starting…' : voice === 'error' ? 'Voice: needs attention' : 'Voice off'

  return (
    <footer className="statusbar">
      <SourceStatus />
      {recording.active && (
        <span className="item" style={{ color: 'var(--red-text)' }}>
          <span className="sdot rec" />
          Recording {elapsed}
        </span>
      )}
      <span className="grow" />
      {voiceOn && (
        <button className="item" onClick={() => set({ page: 'controls', controlsTab: 'voice' })}>
          {voice === 'error' ? <MicOff size={14} color="var(--red)" /> : <Mic size={14} />}
          {voiceText}
        </button>
      )}
      {voiceOn && <span className="sep" />}
      <button className="item" onClick={() => set({ page: 'controls', controlsTab: 'hands' })}>
        <Hand size={14} />
        {handControl ? 'Hand control on' : 'Hand control off'}
      </button>
      <span className="sep" />
      <button className="item" onClick={() => set({ page: 'settings', settingsSection: 'performance' })}>
        <Gauge size={14} color={efficient ? 'var(--green)' : undefined} />
        {efficient ? `Efficiency mode on${efficiency === 'auto' ? ' (auto)' : ''}` : 'Full quality'}
      </button>
    </footer>
  )
}
