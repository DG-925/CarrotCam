// Shown once after updating to a version listed here.
export interface WhatsNew {
  version: string
  items: { icon: 'layout' | 'gallery' | 'mic' | 'hand' | 'gauge' | 'phone' | 'sources' | 'mixer'; title: string; body: string }[]
}

export const WHATS_NEW: WhatsNew[] = [
  {
    version: '1.6.0',
    items: [
      {
        icon: 'mic',
        title: 'Live captions in Arabic',
        body: 'Controls → Voice → Live captions → العربية. A one-time download (about 330 MB), then it works offline.'
      }
    ]
  },
  {
    version: '1.5.0',
    items: [
      {
        icon: 'sources',
        title: 'Cut yourself out over your screen',
        body: 'In Sources, select the CarrotCam camera and turn on "Cut me out": just you over your code or slides, with a soft shadow. No box.'
      },
      {
        icon: 'mic',
        title: 'Live captions',
        body: 'Press Captions under the picture: what you say shows as subtitles in your video, for calls and recordings. Works offline.'
      }
    ]
  },
  {
    version: '1.4.0',
    items: [
      {
        icon: 'sources',
        title: 'Sources: your screen in the picture',
        body: 'Add a window (like VS Code), a full screen, images, videos, web pages, text, colors or a second camera. Drag and resize them right on the preview.'
      },
      {
        icon: 'layout',
        title: 'Scenes',
        body: 'Save layouts like "Just me" or "Me + screen" and switch with Ctrl + Alt + 1…9, your phone, or "Carrot, next scene".'
      },
      {
        icon: 'mixer',
        title: 'Audio mixer for recordings',
        body: 'Record your PC sound together with your microphone, each with its own volume and level meter.'
      }
    ]
  },
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
