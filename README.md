<div align="center">
  <img src="desktop/build/icon.png" width="120" alt="CarrotCam logo" />
  <h1>CarrotCam</h1>
  <p><b>Turn your phone into a buttery-smooth studio webcam for your PC.</b><br/>
  Studio lighting, retouch, filters, effects and auto framing — running on your GPU — with its own virtual camera for Discord, Zoom, Teams, Meet, OBS and every browser.</p>
</div>

---

## What's inside

| | |
|---|---|
| **`desktop/`** | Windows app (Electron + React + WebGL2). Effects studio, phone server, virtual camera sender, auto-updates. |
| **`mobile/`** | Phone app (Flutter, Android + iOS). Streams the camera to the PC over WebRTC, remote control, self-updates. |
| **`native/vcam/`** | The **CarrotCam** virtual camera driver (DirectShow source filter, C++). Registers per-user — no admin rights. |
| **`.github/workflows/`** | CI + one-tag release pipeline that publishes the installer, APK and IPA to GitHub Releases. |

## Features

**Camera & connection**
- Phone → PC over **WebRTC** on Wi-Fi **or a USB cable** (USB tethering — no Wi-Fi needed; hardware H.264/VP8/VP9, up to 4K / 60 fps)
- Pair by **QR code**, 6-digit code, **auto-discovery** (mDNS + UDP broadcast) or manual IP; paired phones **reconnect automatically** (also as soon as you plug the cable in)
- Pick the camera from the title-bar dropdown; the **Phones** popup lives there too
- Use any webcam plugged into the PC as a source too
- **CarrotCam virtual camera is always on** and its driver is **installed automatically** by the installer — shows up in Discord, Zoom, Teams, Google Meet, OBS, Chrome, Edge… and shows the CarrotCam logo card when the app is closed

**Studio (all GPU, off the UI thread → stays smooth even when minimized)**
- **Adjust:** exposure, brightness, contrast, highlights, shadows, temperature, tint, hue, saturation, vibrance, sharpness, vignette, grain, fade, **auto enhance**
- **Filters:** 45 live-preview looks (Carrot, Cinematic, Teal & Orange, Golden Hour, Tokyo Night, Noir…) with **search** and categories + import your own **.cube LUTs**
- **Backdrop:** background blur, virtual backgrounds (built-in or your images — remove the ones you added any time), studio backdrop, solid color / green screen, color pop
- **Retouch:** smooth skin, face light, brighten eyes, whiten teeth, slim face, enlarge eyes
- **Lighting:** face-tracking **spotlight**, studio subject light, directional key light, **night boost** with temporal denoise
- **Framing:** **auto framing / center stage**, zoom, pan (drag & scroll on the preview), rotate, straighten, mirror, flip
- **Hand control:** pinch with both hands and pull apart to **zoom**, pinch with one hand and drag to **move**, and hold a gesture for commands — ✋ reset, ✌️ snapshot, 👍/👎 next/previous filter, ☝️ Follow Me, ✊ background blur, 🤟 hearts
- **Effects:** glitch, VHS, pixel, comic, sketch, halftone, thermal, night vision, poster, chromatic, twin
- **Overlays:** animated name tag (lower third), clock, LIVE / ON AIR badge, rounded border, **reactions** (hearts, confetti, fireworks…) and **gesture reactions** (👍 ✌️ 🤟 ☝️ ✋)
- **Privacy:** blur everything, “Be right back” card, freeze frame — with global hotkeys
- One-tap **Looks** presets (incl. **Follow Me**: the camera follows your face, background stays sharp) + save your own
- Snapshots (saved + copied to clipboard) and **recording** (MP4/WebM, optional mic)
- Before/after compare slider, full-screen preview, dark / light / system themes (Settings → Appearance), tray mode, start with Windows

## Using it

1. Install **CarrotCam for Windows** from the [latest release](https://github.com/DG-925/CarrotCam/releases/latest) (`CarrotCam-Setup-x.y.z.exe`).
2. Install the phone app: Android `CarrotCam-x.y.z.apk` from the same release (iOS: sideload the unsigned IPA with AltStore/Sideloadly).
3. **Wi-Fi:** put both on the same Wi-Fi, open the camera dropdown → **Phones** on the PC and scan the QR code with the phone.
   **USB:** plug the phone in, turn on **USB tethering** (Android — the app has a shortcut) or **Personal Hotspot** (iPhone), and open CarrotCam on the phone.
4. In Discord/Zoom/Meet/… pick **CarrotCam** as your camera.

### Global shortcuts
| Action | Keys |
|---|---|
| Privacy blur | `Ctrl` `Alt` `P` |
| Be right back | `Ctrl` `Alt` `B` |
| Freeze frame | `Ctrl` `Alt` `F` |
| Snapshot | `Ctrl` `Alt` `S` |

## Developing

Requirements: Windows 10/11, Node 22+, Visual Studio 2022+ with C++ tools, Flutter (stable), Android SDK.

```powershell
# 1. virtual camera driver -> desktop/resources/vcam
./native/vcam/build.ps1

# 2. desktop app (postinstall downloads the ML models)
cd desktop
npm install
npm run dev           # hot reload
npm run dist          # installer in desktop/dist

# 3. phone app
cd ../mobile
flutter run           # or: flutter build apk --release
```

> Running from VS Code's terminal? Unset `ELECTRON_RUN_AS_NODE` first.

## Releasing (updates for everyone)

1. One-time: add these repository secrets so every APK is signed with the same key (required for in-app updates):
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
2. Bump the version and push a tag:
   ```bash
   git tag v1.1.0 && git push origin v1.1.0
   ```
3. GitHub Actions builds the Windows installer, Android APK and iOS IPA and attaches them to the release.
   The desktop app (electron-updater) and the Android app pick the update up automatically.

## How it works

```
 Phone camera ──WebRTC (H.264, LAN)──▶ PC  ┐
 PC webcams ──────────────────────────────▶ MediaStreamTrackProcessor
                                             │ (VideoFrames, transferred)
                       ┌─────────────────────▼──────────────────────┐
                       │ Render worker (WebGL2, OffscreenCanvas)    │
                       │ framing → denoise → mask → blur → look →   │◀── ML worker (MediaPipe:
                       │ stylize → overlays → preview + BGR pack    │    segmentation, face mesh,
                       └───────────┬───────────────────────┬────────┘    gestures)
                                   │ async PBO readback    │
                                   ▼                       ▼
                         CarrotCam virtual camera     Preview / recording
                         (shared memory → DirectShow)
```

## Credits & licenses

- Virtual camera based on [softcam](https://github.com/tshino/softcam) (MIT)
- Face, segmentation and gesture models: [MediaPipe](https://developers.google.com/mediapipe) (Apache 2.0)
- CarrotCam itself: MIT
