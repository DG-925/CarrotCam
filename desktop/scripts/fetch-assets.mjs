// Copies the MediaPipe WASM runtime and downloads the ML models used by the
// effects engine and the voice commands into src/renderer/public so they ship
// inside the app (CarrotCam works fully offline after install).
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'src', 'renderer', 'public')
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')

const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models'
const models = {
  'selfie_segmenter_landscape.tflite':
    'image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
  'face_landmarker.task': 'face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  'gesture_recognizer.task':
    'gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task'
}

// Vosk small English model (Apache 2.0), packed as the tar.gz vosk-browser loads
const VOICE_MODEL = 'vosk-model-small-en-us-0.15.tar.gz'
const VOICE_MODEL_URLS = [
  `https://raw.githubusercontent.com/ccoreilly/vosk-browser/gh-pages/models/${VOICE_MODEL}`,
  `https://ccoreilly.github.io/vosk-browser/models/${VOICE_MODEL}`
]

async function download(urls, dest, label) {
  let lastError
  for (const url of urls) {
    try {
      process.stdout.write(`Downloading ${label}... `)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await writeFile(dest, Buffer.from(await res.arrayBuffer()))
      console.log('done')
      return
    } catch (err) {
      console.log(`failed (${err.message})`)
      lastError = err
    }
  }
  throw new Error(`Failed to download ${label}: ${lastError?.message}`)
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function main() {
  const mpDir = join(publicDir, 'mediapipe')
  await mkdir(mpDir, { recursive: true })
  for (const file of ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']) {
    await copyFile(join(wasmSrc, file), join(mpDir, file))
  }

  const modelDir = join(publicDir, 'models')
  await mkdir(modelDir, { recursive: true })
  for (const [name, path] of Object.entries(models)) {
    const dest = join(modelDir, name)
    if (await exists(dest)) continue
    await download([`${MODEL_BASE}/${path}`], dest, name)
  }

  const voiceDir = join(publicDir, 'vosk')
  await mkdir(voiceDir, { recursive: true })
  // vosk-browser ships its worker inline (base64) and starts it from a blob:
  // URL, which inherits the page's Content-Security-Policy. The speech engine
  // needs eval, so we run it from a real file instead: only that worker gets
  // it, the app keeps its strict policy.
  const vosk = await readFile(join(root, 'node_modules', 'vosk-browser', 'dist', 'vosk.js'), 'utf8')
  const inline = /createBase64WorkerFactory\('([A-Za-z0-9+/=]+)'/.exec(vosk)
  if (!inline) throw new Error('vosk-browser worker not found (did the package change?)')
  const workerSource = Buffer.from(inline[1], 'base64').toString('utf8')
  await writeFile(join(voiceDir, 'vosk-worker.js'), workerSource.slice(workerSource.indexOf('\n', 10) + 1))
  const voiceDest = join(voiceDir, 'model.tar.gz')
  if (!(await exists(voiceDest))) await download(VOICE_MODEL_URLS, voiceDest, 'voice model')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
