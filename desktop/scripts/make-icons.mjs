// Builds every app icon from the CarrotCam logo (brand/carrot.png):
// Windows .ico + tray, in-app logo, Android launcher (legacy + adaptive),
// iOS app icon and the phone app's in-app logo.
// Usage: node scripts/make-icons.mjs
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(root, '..')
const source = join(repo, 'brand', 'carrot.png')
const logo = `data:image/png;base64,${readFileSync(source).toString('base64')}`
const CREAM = '#FFF3E6'

/** The logo on a canvas: `scale` = logo size relative to the canvas, optional background. */
function svg({ scale = 1, background = null, radius = 0 }) {
  const size = 1024
  const s = size * scale
  const o = (size - s) / 2
  const bg = background ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}">${bg}
    <image x="${o}" y="${o}" width="${s}" height="${s}" href="${logo}" xlink:href="${logo}"/></svg>`
}

function png(svgText, size) {
  return new Resvg(svgText, { fitTo: { mode: 'width', value: size } }).render().asPng()
}

function ico(svgText, sizes) {
  const images = sizes.map((s) => png(svgText, s))
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

const bare = svg({ scale: 1 })

// desktop: transparent carrot reads best on the taskbar and in the tray
write(join(root, 'build', 'icon.ico'), ico(bare, [16, 20, 24, 32, 40, 48, 64, 128, 256]))
write(join(root, 'build', 'icon.png'), png(bare, 512))
write(join(root, 'src', 'renderer', 'public', 'logo.png'), png(bare, 256))
// placeholder card of the virtual camera driver (embedded as a resource)
write(join(repo, 'native', 'vcam', 'src', 'dll', 'logo.png'), png(bare, 256))

// android
const android = join(repo, 'mobile', 'android', 'app', 'src', 'main', 'res')
if (existsSync(android)) {
  const legacy = svg({ scale: 0.74, background: CREAM, radius: 230 })
  const foreground = svg({ scale: 0.56 })
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [d, k] of Object.entries(dens)) {
    write(join(android, `mipmap-${d}`, 'ic_launcher.png'), png(legacy, Math.round(48 * k)))
    write(join(android, `mipmap-${d}`, 'ic_launcher_foreground.png'), png(foreground, Math.round(108 * k)))
  }
  write(
    join(android, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
  )
  write(
    join(android, 'drawable', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="${CREAM}"/>
</shape>
`
  )
}

// ios (full-bleed square, iOS applies its own mask)
const iosIcons = join(repo, 'mobile', 'ios', 'Runner', 'Assets.xcassets', 'AppIcon.appiconset')
if (existsSync(iosIcons)) {
  write(join(iosIcons, 'Icon-1024.png'), png(svg({ scale: 0.72, background: CREAM }), 1024))
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

// phone in-app logo
if (existsSync(join(repo, 'mobile'))) {
  write(join(repo, 'mobile', 'assets', 'logo.png'), png(bare, 512))
}

console.log('Icons generated from brand/carrot.png')
