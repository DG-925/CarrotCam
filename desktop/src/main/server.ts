// Phone connection server: WebSocket signaling + LAN discovery (mDNS and a
// UDP broadcast fallback). Video itself flows peer-to-peer over WebRTC.
import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { createSocket, type Socket } from 'node:dgram'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { Bonjour, type Service } from 'bonjour-service'
import log from 'electron-log/main'
import type { ConnectedDevice, ServerInfo } from '@shared/app'
import {
  DISCOVERY_PORT,
  DISCOVERY_PROBE,
  MDNS_TYPE,
  PROTOCOL_VERSION,
  type PcToPhone,
  type PhoneToPc
} from '@shared/protocol'

interface Session {
  ws: WebSocket
  device: ConnectedDevice
  alive: boolean
}

interface TrustStore {
  pcId: string
  devices: Record<string, { token: string; name: string; lastSeen: number }>
}

const VIRTUAL_ADAPTER = /(vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Bluetooth|Tailscale|ZeroTier|vpn|TAP)/i

export function lanAddresses(): string[] {
  const result: { address: string; score: number }[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== 'IPv4' || ni.internal) continue
      let score = VIRTUAL_ADAPTER.test(name) ? 0 : 10
      if (/^(Wi-?Fi|WLAN|Wireless)/i.test(name)) score += 3
      if (/^Ethernet/i.test(name)) score += 2
      if (ni.address.startsWith('192.168.')) score += 2
      if (ni.address.startsWith('169.254.')) score -= 8
      if (/^(192\.168\.(42|44|98)\.|172\.20\.10\.|10\.42\.)/.test(ni.address) || /(NDIS|USB|iPhone|Apple)/i.test(name)) score += 20
      result.push({ address: ni.address, score })
    }
  }
  return result.sort((a, b) => b.score - a.score).map((r) => r.address)
}

export class PhoneServer extends EventEmitter {
  private wss: WebSocketServer | null = null
  private udp: Socket | null = null
  private bonjour: Bonjour | null = null
  private mdns: Service | null = null
  private sessions = new Map<string, Session>()
  private heartbeat: NodeJS.Timeout | null = null
  private failures = new Map<string, { count: number; until: number }>()
  private trust: TrustStore
  private trustFile = join(app.getPath('userData'), 'trusted-devices.json')
  private pairCode = PhoneServer.newCode()
  port = 0

  constructor() {
    super()
    this.trust = this.loadTrust()
  }

  private static newCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
  }

  private loadTrust(): TrustStore {
    try {
      if (existsSync(this.trustFile)) {
        const t = JSON.parse(readFileSync(this.trustFile, 'utf8')) as TrustStore
        if (t.pcId) return t
      }
    } catch {
      /* corrupted, start fresh */
    }
    return { pcId: randomUUID(), devices: {} }
  }

  private saveTrust(): void {
    try {
      writeFileSync(this.trustFile, JSON.stringify(this.trust, null, 2))
    } catch (err) {
      log.warn('[server] could not save trusted devices', err)
    }
  }

  get pcName(): string {
    return hostname()
  }

  async start(preferredPort: number): Promise<void> {
    for (let port = preferredPort; port < preferredPort + 10; port++) {
      try {
        await this.listen(port)
        this.port = port
        break
      } catch (err) {
        log.warn(`[server] port ${port} unavailable`, err)
      }
    }
    if (!this.wss) throw new Error('Could not open a port for phone connections')
    this.startDiscovery()
    this.heartbeat = setInterval(() => this.tick(), 5000)
    log.info(`[server] listening on ${this.port}`)
    this.emit('info')
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port, host: '0.0.0.0', maxPayload: 4 * 1024 * 1024 })
      wss.once('listening', () => {
        this.wss = wss
        wss.on('connection', (ws, req) => this.onConnection(ws, req.socket.remoteAddress ?? ''))
        resolve()
      })
      wss.once('error', (err) => {
        wss.close()
        reject(err)
      })
    })
  }

  private startDiscovery(): void {
    try {
      this.bonjour = new Bonjour()
      this.mdns = this.bonjour.publish({
        name: `CarrotCam ${this.pcName}`.slice(0, 60),
        type: MDNS_TYPE,
        port: this.port,
        txt: { id: this.trust.pcId, name: this.pcName, v: String(PROTOCOL_VERSION) }
      })
      this.mdns.on('error', (err: unknown) => log.warn('[mdns] error', err))
    } catch (err) {
      log.warn('[mdns] unavailable', err)
    }

    try {
      const udp = createSocket({ type: 'udp4', reuseAddr: true })
      udp.on('message', (msg, rinfo) => {
        if (!msg.toString('utf8').startsWith(DISCOVERY_PROBE)) return
        const reply = JSON.stringify({
          app: 'carrotcam',
          v: PROTOCOL_VERSION,
          id: this.trust.pcId,
          name: this.pcName,
          port: this.port
        })
        udp.send(reply, rinfo.port, rinfo.address)
      })
      udp.on('error', (err) => log.warn('[udp] error', err))
      udp.bind(DISCOVERY_PORT, () => {
        try {
          udp.setBroadcast(true)
        } catch {
          /* ignore */
        }
      })
      this.udp = udp
    } catch (err) {
      log.warn('[udp] discovery unavailable', err)
    }
  }

  info(): ServerInfo {
    const addresses = lanAddresses()
    const params = new URLSearchParams({
      h: addresses.join(','),
      p: String(this.port),
      c: this.pairCode,
      n: this.pcName,
      id: this.trust.pcId
    })
    return {
      running: !!this.wss,
      port: this.port,
      pcName: this.pcName,
      pcId: this.trust.pcId,
      addresses,
      pairCode: this.pairCode,
      qr: `carrotcam://pair?${params.toString()}`
    }
  }

  regenerateCode(): ServerInfo {
    this.pairCode = PhoneServer.newCode()
    this.emit('info')
    return this.info()
  }

  devices(): ConnectedDevice[] {
    return [...this.sessions.values()].map((s) => s.device)
  }

  trustedDevices(): { id: string; name: string; lastSeen: number }[] {
    return Object.entries(this.trust.devices).map(([id, d]) => ({ id, name: d.name, lastSeen: d.lastSeen }))
  }

  send(deviceId: string, msg: PcToPhone): boolean {
    const s = this.sessions.get(deviceId)
    if (!s || s.ws.readyState !== WebSocket.OPEN) return false
    s.ws.send(JSON.stringify(msg))
    return true
  }

  kick(deviceId: string): void {
    this.sessions.get(deviceId)?.ws.close(4001, 'disconnected by pc')
  }

  forget(deviceId: string): void {
    delete this.trust.devices[deviceId]
    this.saveTrust()
    this.kick(deviceId)
  }

  private tick(): void {
    for (const s of this.sessions.values()) {
      if (!s.alive) {
        s.ws.terminate()
        continue
      }
      s.alive = false
      try {
        s.ws.ping()
      } catch {
        /* closing */
      }
    }
  }

  private blocked(address: string): boolean {
    const f = this.failures.get(address)
    return !!f && f.count >= 5 && Date.now() < f.until
  }

  private recordFailure(address: string): void {
    const f = this.failures.get(address) ?? { count: 0, until: 0 }
    f.count = Date.now() > f.until && f.count >= 5 ? 1 : f.count + 1
    f.until = Date.now() + 60_000
    this.failures.set(address, f)
  }

  private onConnection(ws: WebSocket, address: string): void {
    const addr = address.replace(/^::ffff:/, '')
    let session: Session | null = null
    const helloTimeout = setTimeout(() => ws.close(4000, 'hello timeout'), 10_000)

    ws.on('pong', () => {
      if (session) session.alive = true
    })

    ws.on('message', (raw) => {
      let msg: PhoneToPc
      try {
        msg = JSON.parse(raw.toString()) as PhoneToPc
      } catch {
        return
      }
      if (!session) {
        if (msg.t !== 'hello') return
        clearTimeout(helloTimeout)
        session = this.authenticate(ws, addr, msg)
        return
      }
      if (msg.t === 'pong') {
        session.alive = true
        return
      }
      this.emit('message', session.device.id, msg)
    })

    ws.on('close', () => {
      clearTimeout(helloTimeout)
      if (session && this.sessions.get(session.device.id) === session) {
        this.sessions.delete(session.device.id)
        log.info('[server] phone disconnected', session.device.info.name)
        this.emit('devices')
      }
    })
    ws.on('error', (err) => log.warn('[server] socket error', err.message))
  }

  private authenticate(ws: WebSocket, address: string, hello: Extract<PhoneToPc, { t: 'hello' }>): Session | null {
    const deny = (reason: 'bad_code' | 'version' | 'busy'): null => {
      ws.send(JSON.stringify({ t: 'denied', reason } satisfies PcToPhone))
      setTimeout(() => ws.close(4003, reason), 200)
      return null
    }
    if (!hello.info?.id || typeof hello.info.id !== 'string') return deny('version')
    if (hello.v > PROTOCOL_VERSION + 5) return deny('version')
    if (this.blocked(address)) return deny('busy')

    const known = this.trust.devices[hello.info.id]
    const tokenOk =
      !!known &&
      typeof hello.token === 'string' &&
      hello.token.length === known.token.length &&
      timingSafeEqual(Buffer.from(hello.token), Buffer.from(known.token))
    const codeOk = typeof hello.code === 'string' && hello.code === this.pairCode
    if (!tokenOk && !codeOk) {
      this.recordFailure(address)
      return deny('bad_code')
    }

    const token = tokenOk ? known!.token : randomBytes(24).toString('hex')
    this.trust.devices[hello.info.id] = {
      token,
      name: String(hello.info.name ?? 'Phone').slice(0, 64),
      lastSeen: Date.now()
    }
    this.saveTrust()
    if (codeOk) this.pairCode = PhoneServer.newCode() // one-time code
    this.failures.delete(address)

    // A reconnecting phone replaces its previous session.
    const previous = this.sessions.get(hello.info.id)
    if (previous) previous.ws.close(4002, 'replaced')

    const session: Session = {
      ws,
      alive: true,
      device: {
        id: hello.info.id,
        info: {
          id: hello.info.id,
          name: String(hello.info.name ?? 'Phone').slice(0, 64),
          model: String(hello.info.model ?? '').slice(0, 64),
          platform: String(hello.info.platform ?? '').slice(0, 16),
          app: String(hello.info.app ?? '').slice(0, 16),
          transport: hello.info.transport === 'usb' ? 'usb' : 'wifi'
        },
        address,
        connectedAt: Date.now()
      }
    }
    this.sessions.set(hello.info.id, session)
    ws.send(
      JSON.stringify({
        t: 'welcome',
        pcId: this.trust.pcId,
        pcName: this.pcName,
        token,
        app: app.getVersion()
      } satisfies PcToPhone)
    )
    log.info('[server] phone connected', session.device.info.name, address)
    this.emit('devices')
    if (codeOk) this.emit('info')
    return session
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    for (const s of this.sessions.values()) s.ws.close(1001, 'pc shutting down')
    this.sessions.clear()
    try {
      this.mdns?.stop?.()
      this.bonjour?.destroy()
    } catch {
      /* ignore */
    }
    this.udp?.close()
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()))
    this.wss = null
  }
}
