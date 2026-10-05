// Shown once after updating to a version listed here.
export interface WhatsNew {
  version: string
  items: { icon: 'layout' | 'gallery' | 'mic' | 'hand' | 'gauge' | 'phone'; title: string; body: string }[]
}

export const WHATS_NEW: WhatsNew[] = [
  {
    version: '1.3.0',
    items: [
      {
        icon: 'layout',
        title: 'A new, cleaner design',
        body: 'A bigger picture, controls under it and every effect one click away on the right.'
      },
      {
        icon: 'mic',
        title: 'Voice control',
        body: 'Say "Carrot, take a photo" or "Carrot, blur background". It works offline: nothing you say leaves your PC.'
      },
      {
        icon: 'gallery',
        title: 'Gallery',
        body: 'Your snapshots and recordings in one place, ready to open, copy or delete.'
      },
      {
        icon: 'hand',
        title: 'Hand controls you can tune',
        body: 'Turn single gestures off and set how long to hold them in Controls.'
      },
      {
        icon: 'gauge',
        title: 'Efficiency mode',
        body: 'Lighter processing on slower PCs. It turns itself on when it is needed.'
      }
    ]
  }
]
