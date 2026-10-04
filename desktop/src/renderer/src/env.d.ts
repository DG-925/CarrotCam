/// <reference types="vite/client" />
import type { CarrotApi } from '../../preload'

declare global {
  interface Window {
    carrot: CarrotApi
  }
}

export {}
