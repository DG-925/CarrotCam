import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Check,
  Coffee,
  Droplet,
  Hand,
  Heart,
  Loader2,
  Mic,
  MicOff,
  Move,
  Palette,
  PenLine,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  ZoomIn
} from 'lucide-react'
import { listenOnce, toggleHandControl, updateApp } from '@/lib/controller'
import { HAND_COMMANDS, type HandCommand } from '@/lib/hands'
import { useStore } from '@/lib/store'
import { VOICE_COMMANDS, WAKE_WORD } from '@/lib/voice-commands'
import { Dropdown, type DropdownOption } from '@/components/Dropdown'
import { Keys, Segmented, Slider, Switch, ToggleRow } from '@/components/ui'

const COMMAND_ICONS: Record<HandCommand, typeof Hand> = {
  follow: ScanFace,
  snapshot: Camera,
  brb: Coffee,
  hearts: Heart,
  nextFilter: Palette,
  prevFilter: Palette,
  blur: Droplet,
  draw: PenLine,
  reset: RotateCcw
}

function HandsTab(): React.JSX.Element {
  const app = useStore((s) => s.app)
  const hint = useStore((s) => s.handHint)
  const ml = useStore((s) => s.ml)
  const source = useStore((s) => s.source)
  const gestures = app.gestures
  const gestureReactions = useStore((s) => s.effects.overlay.gestures)
  const updateEffects = useStore((s) => s.updateEffects)

  const toggleGesture = (gesture: string, on: boolean): void => {
    const disabled = on ? gestures.disabled.filter((g) => g !== gesture) : [...new Set([...gestures.disabled, gesture])]
    void updateApp({ gestures: { ...gestures, disabled } })
  }

  let status: { tone: string; title: string; body: string; icon: typeof Hand }
  if (!app.handControl) status = { tone: '', title: 'Hand control is off', body: 'Turn it on to zoom and run commands with gestures.', icon: Hand }
  else if (ml?.error) status = { tone: 'err', title: 'Hand tracking could not start', body: ml.error, icon: AlertTriangle }
  else if (source.state !== 'live') status = { tone: '', title: 'Waiting for the camera', body: 'Pick a phone or webcam at the top.', icon: Hand }
  else if (hint) status = { tone: 'live', title: hint, body: 'Your hand is being tracked.', icon: Hand }
  else status = { tone: 'ok', title: 'Watching for your hands', body: 'Raise a hand so the camera can see it.', icon: Check }

  return (
    <div className="controls-layout">
      <div>
        <div className="settings-card">
          <ToggleRow
            title="Control the camera with your hands"
            hint="Gestures are recognized on this PC. No video leaves it."
            icon={
              <span className="row-icon">
                <Hand size={17} />
              </span>
            }
            value={app.handControl}
            onChange={() => void toggleHandControl()}
          />
          <div className={`status-block ${status.tone}`} style={{ marginTop: 8 }}>
            <span className="sicon">
              <status.icon size={20} />
            </span>
            <div style={{ minWidth: 0 }}>
              <b>{status.title}</b>
              <small>{status.body}</small>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <h2>Hold a gesture</h2>
          <p className="sub">Hold one for {(gestures.holdMs / 1000).toFixed(1)} seconds to run it. Switch off the ones you don’t want.</p>
          <div className="gesture-grid">
            {HAND_COMMANDS.map((c) => {
              const on = !gestures.disabled.includes(c.gesture)
              const Icon = COMMAND_ICONS[c.command]
              const seen = app.handControl && on && !!hint?.startsWith(c.pose)
              return (
                <div key={c.gesture} className={`gesture-card ${on ? '' : 'off'} ${seen ? 'seen' : ''}`}>
                  <span className="gicon">
                    <Icon size={18} />
                  </span>
                  <span className="gtext">
                    <b>{c.pose}</b>
                    <small>{c.label}</small>
                  </span>
                  <Switch value={on} onChange={(v) => toggleGesture(c.gesture, v)} label={`${c.pose}: ${c.label}`} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="settings-card">
          <h2>Move the picture</h2>
          <div className="gesture-grid" style={{ marginTop: 10 }}>
            {[
              { icon: ZoomIn, b: 'Pinch with both hands', s: 'Pull apart to zoom in, push together to zoom out' },
              { icon: Move, b: 'Pinch with one hand', s: 'Drag to move around while zoomed in' },
              { icon: PenLine, b: 'Point while drawing', s: 'Your index finger draws (rock on to start)' }
            ].map((g) => (
              <div key={g.b} className="gesture-card">
                <span className="gicon">
                  <g.icon size={18} />
                </span>
                <span className="gtext">
                  <b>{g.b}</b>
                  <small>{g.s}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="settings-card">
          <h2>Options</h2>
          <Slider
            label="Hold time"
            value={gestures.holdMs}
            min={400}
            max={1500}
            step={50}
            defaultValue={700}
            format={(v) => `${(v / 1000).toFixed(2)} s`}
            onChange={(v) => void updateApp({ gestures: { ...gestures, holdMs: Math.round(v) } })}
          />
          <p className="hint">Shorter is quicker; longer avoids running commands by accident.</p>
          <ToggleRow
            title="Gesture reactions"
            hint="When hand control is off, a thumbs up or peace sign plays an animation"
            value={gestureReactions}
            onChange={(v) => updateEffects((e) => void (e.overlay.gestures = v))}
          />
        </div>
        <div className="settings-card">
          <h2>Tips</h2>
          <ul className="hint" style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>Keep your whole hand in the picture, about half a meter from the camera.</li>
            <li>Good light helps a lot, especially on webcams.</li>
            <li>After a command, change your gesture to run another.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function useMicrophones(): { id: string; label: string }[] {
  const [mics, setMics] = useState<{ id: string; label: string }[]>([])
  useEffect(() => {
    const load = (): void =>
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) =>
          setMics(
            list
              .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
              .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
          )
        )
        .catch(() => setMics([]))
    load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => navigator.mediaDevices.removeEventListener('devicechange', load)
  }, [])
  return mics
}

function VoiceTab(): React.JSX.Element {
  const settings = useStore((s) => s.app.voice)
  const voice = useStore((s) => s.voice)
  const mics = useMicrophones()
  const set = (patch: Partial<typeof settings>): void => void updateApp({ voice: { ...settings, ...patch } })
  const listening = voice.listenUntil > Date.now()

  let status: { tone: string; title: string; body: string; icon: typeof Mic }
  if (!settings.enabled) status = { tone: '', title: 'Voice control is off', body: 'Turn it on to control CarrotCam by talking.', icon: MicOff }
  else if (voice.status === 'loading') status = { tone: '', title: 'Starting…', body: 'Loading the speech model. This takes a few seconds.', icon: Loader2 }
  else if (voice.status === 'error') status = { tone: 'err', title: 'Voice control needs attention', body: voice.error ?? 'Something went wrong.', icon: AlertTriangle }
  else if (listening) status = { tone: 'live', title: 'Listening…', body: 'Say a command now.', icon: Mic }
  else
    status = {
      tone: 'ok',
      title: settings.wakeWord ? 'Say “Carrot” and a command' : 'Say a command',
      body: settings.wakeWord ? 'For example: “Carrot, take a photo”.' : 'For example: “take a photo”.',
      icon: Mic
    }

  const micOptions: DropdownOption<string>[] = [
    { value: 'default', label: 'System default', description: 'The microphone Windows uses', icon: Mic },
    ...mics.map((m) => ({ value: m.id, label: m.label, icon: Mic }))
  ]
  const groups = [...new Set(VOICE_COMMANDS.map((c) => c.group))]

  return (
    <div className="controls-layout">
      <div>
        <div className="settings-card">
          <ToggleRow
            title="Control CarrotCam with your voice"
            hint="Speech is understood on this PC, offline. Nothing you say is recorded or sent anywhere."
            icon={
              <span className="row-icon">
                <Mic size={17} />
              </span>
            }
            value={settings.enabled}
            onChange={(v) => set({ enabled: v })}
          />
          <div className={`status-block ${status.tone}`} style={{ marginTop: 8 }}>
            <span className="sicon">
              <status.icon size={20} className={voice.status === 'loading' && settings.enabled ? 'spin' : undefined} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>{status.title}</b>
              <small>{status.body}</small>
              {settings.enabled && voice.status === 'listening' && (
                <div className="level" aria-hidden>
                  <span style={{ width: `${Math.round(voice.level * 100)}%` }} />
                </div>
              )}
            </div>
            {settings.enabled && voice.status === 'error' && (
              <button className="btn sm" onClick={() => set({ enabled: true, micId: settings.micId })}>
                Try again
              </button>
            )}
          </div>
        </div>

        <div className="settings-card">
          <h2>What you can say</h2>
          <p className="sub">
            Start with “{WAKE_WORD[0].toUpperCase() + WAKE_WORD.slice(1)}”, or press <Keys keys={['Ctrl', 'Alt', 'Space']} /> and just say the command.
          </p>
          <div className="cmd-groups">
            {groups.map((g) => (
              <div key={g} className="cmd-group">
                <h4>{g}</h4>
                {VOICE_COMMANDS.filter((c) => c.group === g).map((c) => (
                  <div key={c.command} className="cmd">
                    <q>{c.phrases[0]}</q>
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="settings-card">
          <h2>Options</h2>
          <label className="field-label">Microphone</label>
          <Dropdown compact value={settings.micId ?? 'default'} options={micOptions} onChange={(v) => set({ micId: v === 'default' ? null : v })} />
          <ToggleRow
            title="Say “Carrot” first"
            hint="Avoids commands by accident during calls"
            value={settings.wakeWord}
            onChange={(v) => set({ wakeWord: v })}
          />
          <div className="row">
            <div className="label">
              <b>Listen for one command</b>
              <small>Works from any app</small>
            </div>
            <Keys keys={['Ctrl', 'Alt', 'Space']} />
          </div>
          <button className="btn sm block" style={{ marginTop: 6 }} disabled={!settings.enabled || voice.status !== 'listening'} onClick={() => listenOnce()}>
            <Mic size={14} /> Listen now
          </button>
        </div>

        <div className="settings-card">
          <h2>Heard</h2>
          {voice.heard.length === 0 ? (
            <p className="hint" style={{ marginTop: 6 }}>
              What CarrotCam hears shows up here, so you can check it understood you.
            </p>
          ) : (
            <div className="heard-list" style={{ marginTop: 8 }}>
              {voice.heard.map((h) => (
                <div key={h.at} className="heard">
                  {h.ran ? <Check size={15} color="var(--green)" /> : <span style={{ width: 15 }} />}
                  <span className="htext" title={h.text}>
                    “{h.text}”{!h.ran && <span className="hint"> · {h.command ? 'say “Carrot” first' : 'not a command'}</span>}
                  </span>
                  <span className="htime">{new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="hint" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 4px' }}>
          <ShieldCheck size={15} style={{ marginTop: 2 }} /> Voice control uses the open-source Vosk speech model, built into CarrotCam. English only for now.
        </p>
      </div>
    </div>
  )
}

export function ControlsPage(): React.JSX.Element {
  const tab = useStore((s) => s.controlsTab)
  const set = useStore((s) => s.set)
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Controls</h1>
            <p>Run CarrotCam hands-free, with gestures or your voice.</p>
          </div>
          <div style={{ width: 240 }}>
            <Segmented<'hands' | 'voice'>
              value={tab}
              onChange={(v) => set({ controlsTab: v })}
              options={[
                {
                  value: 'hands',
                  label: (
                    <>
                      <Hand size={14} /> Hands
                    </>
                  )
                },
                {
                  value: 'voice',
                  label: (
                    <>
                      <Mic size={14} /> Voice
                    </>
                  )
                }
              ]}
            />
          </div>
        </div>
        {tab === 'hands' ? <HandsTab /> : <VoiceTab />}
      </div>
    </div>
  )
}
