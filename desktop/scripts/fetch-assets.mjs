// Copies the MediaPipe WASM runtime and downloads the ML models used by the
// effects engine into src/renderer/public so they ship inside the app
// (CarrotCam works fully offline after install).
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
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
    process.stdout.write(`Downloading ${name}... `)
    const res = await fetch(`${MODEL_BASE}/${path}`)
    if (!res.ok) throw new Error(`Failed to download ${name}: HTTP ${res.status}`)
    await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    console.log('done')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
