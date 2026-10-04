import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import * as controller from './lib/controller'
import { initController } from './lib/controller'
import { useStore } from './lib/store'

// debugging handle (used by the dev screenshot/eval hooks)
Object.assign(window, { __cc: { useStore, controller } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

initController().catch((err) => {
  console.error('CarrotCam failed to start', err)
  useStore.getState().toast({ kind: 'error', title: 'CarrotCam failed to start', body: String(err?.message ?? err) })
})
