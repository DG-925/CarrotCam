// Installs the CarrotCam DirectShow virtual camera for the current user.
//
// The DLL is copied to %LOCALAPPDATA%\CarrotCam\driver\<hash>\ and registered
// with `regsvr32 /n /i:user`, which needs no administrator rights. Using a
// content-addressed folder means an app update never has to overwrite a DLL
// that Discord/Chrome/Zoom currently have loaded.
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import log from 'electron-log/main'
import type { DriverStatus, OutputFormat } from '@shared/app'

const run = promisify(execFile)
const CLSID = '{73EEB1BE-1807-4FBB-AB20-AA1364E1A8D2}'
const DLL = 'CarrotCamVCam.dll'

export function bundledDriverDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'vcam')
    : join(app.getAppPath(), 'resources', 'vcam')
}

export function senderDllPath(): string {
  return join(bundledDriverDir(), 'x64', DLL)
}

function driverRoot(): string {
  return join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'CarrotCam', 'driver')
}

function bundledHash(): string | null {
  const dll = join(bundledDriverDir(), 'x64', DLL)
  if (!existsSync(dll)) return null
  return createHash('sha256').update(readFileSync(dll)).digest('hex').slice(0, 12)
}

async function registeredPath(view: '64' | '32'): Promise<string | null> {
  try {
    const { stdout } = await run('reg', [
      'query',
      `HKCU\\Software\\Classes\\CLSID\\${CLSID}\\InprocServer32`,
      '/ve',
      `/reg:${view}`
    ])
    const m = stdout.match(/REG_SZ\s+(.+)\s*$/m)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

export async function driverStatus(): Promise<DriverStatus> {
  if (process.platform !== 'win32') {
    return { supported: false, installed: false, upToDate: false, path: null }
  }
  const path = await registeredPath('64')
  const hash = bundledHash()
  const installed = !!path && existsSync(path)
  return {
    supported: true,
    installed,
    upToDate: installed && !!hash && path!.toLowerCase().includes(hash),
    path
  }
}

function regsvr32(arch: 'x64' | 'x86'): string {
  const windir = process.env.WINDIR ?? 'C:\\Windows'
  return arch === 'x64' ? join(windir, 'System32', 'regsvr32.exe') : join(windir, 'SysWOW64', 'regsvr32.exe')
}

export async function installDriver(): Promise<DriverStatus> {
  const hash = bundledHash()
  if (!hash) {
    return { supported: true, installed: false, upToDate: false, path: null, error: 'Driver files are missing from this build.' }
  }
  const target = join(driverRoot(), hash)
  try {
    for (const arch of ['x64', 'x86'] as const) {
      const src = join(bundledDriverDir(), arch, DLL)
      if (!existsSync(src)) continue
      const dir = join(target, arch)
      mkdirSync(dir, { recursive: true })
      const dest = join(dir, DLL)
      if (!existsSync(dest)) copyFileSync(src, dest)
      if (arch === 'x86' && !existsSync(regsvr32('x86'))) continue
      await run(regsvr32(arch), ['/s', '/n', '/i:user', dest])
    }
    log.info('[driver] registered', target)
  } catch (err) {
    log.error('[driver] install failed', err)
    return { ...(await driverStatus()), error: String(err) }
  }
  cleanupOldDrivers(hash)
  return driverStatus()
}

export async function uninstallDriver(): Promise<DriverStatus> {
  for (const [arch, view] of [['x64', '64'], ['x86', '32']] as const) {
    const path = await registeredPath(view)
    if (path && existsSync(path)) {
      try {
        await run(regsvr32(arch), ['/s', '/u', '/n', '/i:user', path])
      } catch (err) {
        log.warn('[driver] unregister failed', arch, err)
      }
    }
  }
  return driverStatus()
}

/** Removes driver folders from previous versions (skips ones still in use). */
function cleanupOldDrivers(keep: string): void {
  try {
    for (const name of readdirSync(driverRoot())) {
      if (name === keep) continue
      try {
        rmSync(join(driverRoot(), name), { recursive: true, force: true })
      } catch {
        /* still loaded by a camera app, try again next launch */
      }
    }
  } catch {
    /* nothing to clean */
  }
}

/** Format announced by the camera while the app is not running. */
export async function writeDriverFormat(format: OutputFormat): Promise<void> {
  if (process.platform !== 'win32') return
  const key = 'HKCU\\Software\\CarrotCam\\VirtualCamera'
  const values: [string, number][] = [
    ['Width', format.width],
    ['Height', format.height],
    ['FrameRate', format.fps]
  ]
  for (const [name, value] of values) {
    try {
      await run('reg', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f'])
    } catch (err) {
      log.warn('[driver] could not write format', err)
    }
  }
}

/** Installs or refreshes the driver at startup when needed. */
export async function ensureDriver(): Promise<DriverStatus> {
  const status = await driverStatus()
  if (!status.supported || status.upToDate) return status
  return installDriver()
}
