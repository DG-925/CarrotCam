// What you can say to CarrotCam. Recognition runs with a fixed grammar (only
// these phrases), which keeps it accurate with a small offline model.

export type VoiceCommand =
  | 'snapshot'
  | 'recordStart'
  | 'recordStop'
  | 'blurOn'
  | 'blurOff'
  | 'brb'
  | 'privacyOn'
  | 'privacyOff'
  | 'freeze'
  | 'followOn'
  | 'followOff'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'nextFilter'
  | 'prevFilter'
  | 'noFilter'
  | 'hearts'
  | 'confetti'
  | 'fireworks'
  | 'balloons'
  | 'thumbs'
  | 'rain'
  | 'mirror'
  | 'switchCamera'
  | 'drawOn'
  | 'drawOff'
  | 'drawClear'

export const WAKE_WORD = 'carrot'

export interface VoiceCommandInfo {
  command: VoiceCommand
  /** what we show in the app */
  label: string
  group: 'Capture' | 'Privacy' | 'Camera' | 'Looks' | 'Reactions' | 'Drawing'
  /** phrases that run it (lower case, no punctuation) */
  phrases: string[]
}

export const VOICE_COMMANDS: VoiceCommandInfo[] = [
  { command: 'snapshot', label: 'Take a snapshot', group: 'Capture', phrases: ['take a photo', 'take a picture', 'snapshot'] },
  { command: 'recordStart', label: 'Start recording', group: 'Capture', phrases: ['start recording', 'record'] },
  { command: 'recordStop', label: 'Stop recording', group: 'Capture', phrases: ['stop recording'] },
  { command: 'brb', label: 'Be right back screen', group: 'Privacy', phrases: ['be right back'] },
  { command: 'privacyOn', label: 'Hide the camera (privacy blur)', group: 'Privacy', phrases: ['privacy on', 'hide me'] },
  { command: 'freeze', label: 'Freeze the picture', group: 'Privacy', phrases: ['freeze'] },
  { command: 'privacyOff', label: 'Show the camera again', group: 'Privacy', phrases: ['privacy off', 'i am back', 'show me'] },
  { command: 'blurOn', label: 'Blur the background', group: 'Camera', phrases: ['blur background', 'blur the background'] },
  { command: 'blurOff', label: 'Remove the background blur', group: 'Camera', phrases: ['remove blur', 'stop blur', 'no background'] },
  { command: 'followOn', label: 'Follow me on', group: 'Camera', phrases: ['follow me'] },
  { command: 'followOff', label: 'Follow me off', group: 'Camera', phrases: ['stop following'] },
  { command: 'zoomIn', label: 'Zoom in', group: 'Camera', phrases: ['zoom in'] },
  { command: 'zoomOut', label: 'Zoom out', group: 'Camera', phrases: ['zoom out'] },
  { command: 'zoomReset', label: 'Reset the zoom', group: 'Camera', phrases: ['reset zoom', 'reset the zoom'] },
  { command: 'mirror', label: 'Mirror the picture', group: 'Camera', phrases: ['mirror'] },
  { command: 'switchCamera', label: 'Switch camera', group: 'Camera', phrases: ['switch camera', 'flip camera'] },
  { command: 'nextFilter', label: 'Next filter', group: 'Looks', phrases: ['next filter'] },
  { command: 'prevFilter', label: 'Previous filter', group: 'Looks', phrases: ['previous filter', 'last filter'] },
  { command: 'noFilter', label: 'No filter', group: 'Looks', phrases: ['no filter', 'remove filter'] },
  { command: 'hearts', label: 'Hearts', group: 'Reactions', phrases: ['hearts', 'send hearts', 'i love you'] },
  { command: 'confetti', label: 'Confetti', group: 'Reactions', phrases: ['confetti', 'celebrate'] },
  { command: 'fireworks', label: 'Fireworks', group: 'Reactions', phrases: ['fireworks'] },
  { command: 'balloons', label: 'Balloons', group: 'Reactions', phrases: ['balloons'] },
  { command: 'thumbs', label: 'Thumbs up', group: 'Reactions', phrases: ['thumbs up', 'like'] },
  { command: 'rain', label: 'Rain', group: 'Reactions', phrases: ['rain', 'make it rain'] },
  { command: 'drawOn', label: 'Start drawing', group: 'Drawing', phrases: ['start drawing'] },
  { command: 'drawOff', label: 'Stop drawing', group: 'Drawing', phrases: ['stop drawing'] },
  { command: 'drawClear', label: 'Erase the drawing', group: 'Drawing', phrases: ['clear drawing', 'erase drawing', 'erase'] }
]

const BY_PHRASE = new Map<string, VoiceCommand>()
for (const c of VOICE_COMMANDS) for (const p of c.phrases) BY_PHRASE.set(p, c.command)

/** The grammar handed to the recognizer: every phrase with and without the wake word. */
export function voiceGrammar(): string[] {
  const out: string[] = []
  for (const p of BY_PHRASE.keys()) out.push(`${WAKE_WORD} ${p}`, p)
  out.push(WAKE_WORD, '[unk]')
  return out
}

export interface Heard {
  text: string
  /** the command it runs, if any */
  command: VoiceCommand | null
  /** said with the wake word in front */
  wake: boolean
}

/** Matches what the recognizer heard to a command. */
export function parseHeard(raw: string): Heard {
  const text = raw.toLowerCase().replace(/\[unk\]/g, ' ').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
  const wake = text === WAKE_WORD || text.startsWith(`${WAKE_WORD} `)
  const rest = wake ? text.slice(WAKE_WORD.length).trim() : text
  return { text, command: BY_PHRASE.get(rest) ?? null, wake }
}
