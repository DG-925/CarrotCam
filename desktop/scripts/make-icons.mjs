// Renders the CarrotCam logo to every icon size the desktop and mobile apps
// need (Windows .ico, tray, Android mipmaps + adaptive icon, iOS app icon).
// Usage: node scripts/make-icons.mjs
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(root, '..')

const leaves = `
  <path d="M560 236c-52 14-96 60-104 120 56 4 112-24 140-76" fill="#4ade80"/>
  <path d="M470 216c10 50 22 88 36 132-46-10-88-46-98-96" fill="#22c55e"/>`
const lens = `
  <circle cx="512" cy="560" r="250" fill="#1a120d"/>
  <circle cx="512" cy="560" r="250" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="10"/>
  <circle cx="512" cy="560" r="160" fill="url(#lens)"/>
  <circle cx="456" cy="504" r="48" fill="#ffecd2"/>
  <circle cx="574" cy="618" r="18" fill="#ffecd2" fill-opacity="0.6"/>`
const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffa64d"/>
      <stop offset="0.55" stop-color="#ff6f1f"/>
      <stop offset="1" stop-color="#ff4a2b"/>
    </linearGradient>
    <radialGradient id="lens" cx="0.4" cy="0.38" r="0.75">
      <stop offset="0" stop-color="#ffb066"/>
      <stop offset="0.6" stop-color="#ff7a1a"/>
      <stop offset="1" stop-color="#c2410c"/>
    </radialGradient>
  </defs>`

const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
  <rect x="32" y="32" width="960" height="960" rx="230" fill="url(#bg)"/>${lens}${leaves}</svg>`
// iOS wants a full-bleed square (it applies its own mask)
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
  <rect width="1024" height="1024" fill="url(#bg)"/>${lens}${leaves}</svg>`
// Android adaptive foreground: content inside the 66% safe zone
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
  <g transform="translate(512 512) scale(0.62) translate(-512 -540)">${lens}${leaves}</g></svg>`

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
}

function ico(svg, sizes) {
  const images = sizes.map((s) => png(svg, s))
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((img, i) => {
    const s = sizes[i]
    const e = 6 + i * 16
    header.writeUInt8(s >= 256 ? 0 : s, e)
    header.writeUInt8(s >= 256 ? 0 : s, e + 1)
    header.writeUInt8(0, e + 2)
    header.writeUInt8(0, e + 3)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(img.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += img.length
  })
  return Buffer.concat([header, ...images])
}

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

// desktop
write(join(root, 'build', 'icon.ico'), ico(full, [16, 20, 24, 32, 40, 48, 64, 128, 256]))
write(join(root, 'build', 'icon.png'), png(full, 512))
write(join(root, 'build', 'logo.svg'), full)

// android
const android = join(repo, 'mobile', 'android', 'app', 'src', 'main', 'res')
if (existsSync(android)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [d, k] of Object.entries(dens)) {
    write(join(android, `mipmap-${d}`, 'ic_launcher.png'), png(full, Math.round(48 * k)))
    write(join(android, `mipmap-${d}`, 'ic_launcher_foreground.png'), png(foreground, Math.round(108 * k)))
  }
  write(
    join(android, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
  )
  write(
    join(android, 'drawable', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#FFA64D" android:centerColor="#FF6F1F" android:endColor="#FF4A2B"/>
</shape>
`
  )
}

// ios
const iosIcons = join(repo, 'mobile', 'ios', 'Runner', 'Assets.xcassets', 'AppIcon.appiconset')
if (existsSync(iosIcons)) {
  write(join(iosIcons, 'Icon-1024.png'), png(square, 1024))
  write(
    join(iosIcons, 'Contents.json'),
    JSON.stringify(
      {
        images: [{ filename: 'Icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
        info: { author: 'xcode', version: 1 }
      },
      null,
      2
    )
  )
}

// in-app logo for the phone
const mobileAssets = join(repo, 'mobile', 'assets')
if (existsSync(join(repo, 'mobile'))) write(join(mobileAssets, 'logo.png'), png(full, 512))

console.log('Icons generated')
