import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { app } from 'electron'

export interface TorStatus {
  status: 'connecting' | 'connected' | 'error'
  onionAddress: string | null
  socksPort: number
  error?: string
}

interface ProtocolInfo {
  authMethods: string[]
  cookieFile: string | null
  torVersion: string
}

export class TorController extends EventEmitter {
  private socket: net.Socket | null = null
  private controlPort = 0
  private _socksPort = 9150
  private responseBuffer = ''
  private pendingResolvers: Array<(lines: string[]) => void> = []
  private accumulatedLines: string[] = []
  private torProcess: ChildProcess | null = null

  /** Resolve the bundled tor binary path from resources/ */
  private getBundledTorPath(): string | null {
    const exe = process.platform === 'win32' ? 'tor.exe' : 'tor'
    const candidates = [
      path.join(process.resourcesPath ?? '', exe),
      path.join(app.getAppPath(), '..', 'resources', exe),
      path.join(app.getAppPath(), 'resources', exe),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    return null
  }

  /** Launch the bundled Tor binary with an ephemeral control port */
  private async launchBundledTor(): Promise<void> {
    const torBin = this.getBundledTorPath()
    if (!torBin) throw new Error('Bundled tor binary not found')

    const dataDir = path.join(app.getPath('userData'), 'tor-data')
    fs.mkdirSync(dataDir, { recursive: true })

    // Use fixed ports so we know where to connect
    const socksPort = 19050
    const controlPort = 19051

    this.torProcess = spawn(torBin, [
      '--SocksPort', String(socksPort),
      '--ControlPort', String(controlPort),
      '--CookieAuthentication', '0',
      '--DataDirectory', dataDir,
      '--Log', 'notice stdout',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    this.torProcess.stdout?.on('data', (d) => console.log('[tor]', d.toString().trim()))
    this.torProcess.stderr?.on('data', (d) => console.error('[tor]', d.toString().trim()))
    this.torProcess.on('exit', (code) => console.log('[tor] exited with code', code))

    // Wait for Tor to be ready (bootstrap 100%)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tor launch timeout')), 60000)
      this.torProcess!.stdout?.on('data', (d: Buffer) => {
        if (d.toString().includes('Bootstrapped 100%')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      this.torProcess!.on('exit', () => {
        clearTimeout(timeout)
        reject(new Error('Tor process exited during startup'))
      })
    })

    this.controlPort = controlPort
    this._socksPort = socksPort
  }

  get socksPort(): number {
    return this._socksPort
  }

  async connect(): Promise<void> {
    // 1. Try Tor Browser (9151) then system Tor (9051)
    const externalPorts = [{ control: 9151, socks: 9150 }, { control: 9051, socks: 9050 }]
    for (const { control, socks } of externalPorts) {
      try {
        await this.tryConnect(control)
        this.controlPort = control
        this._socksPort = socks
        return
      } catch {
        // try next
      }
    }

    // 2. Try the bundled binary
    const bundledPath = this.getBundledTorPath()
    if (bundledPath) {
      console.log('No external Tor found — launching bundled binary:', bundledPath)
      await this.launchBundledTor()
      await this.tryConnect(this.controlPort)
      return
    }

    throw new Error(
      'Tor not found. Install Tor Browser, system Tor, or place tor.exe in resources/.'
    )
  }

  /** Kill the bundled Tor process if we spawned it */
  killBundled(): void {
    if (this.torProcess) {
      this.torProcess.kill()
      this.torProcess = null
    }
  }

  private tryConnect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      const timeout = setTimeout(() => {
        socket.destroy()
        reject(new Error(`Timeout connecting to port ${port}`))
      }, 3000)

      socket.connect(port, '127.0.0.1', () => {
        clearTimeout(timeout)
        this.socket = socket
        this.setupSocketHandlers()
        resolve()
      })

      socket.once('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return
    this.socket.setEncoding('utf8')
    this.socket.on('data', (data: string) => {
      this.responseBuffer += data
      this.processBuffer()
    })
    this.socket.on('error', (err) => {
      this.emit('error', err)
    })
    this.socket.on('close', () => {
      this.emit('close')
    })
  }

  private processBuffer(): void {
    const lines = this.responseBuffer.split('\r\n')
    this.responseBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line) continue
      this.accumulatedLines.push(line)

      // A reply is complete when we get a line starting with 3-digit code + space (not dash)
      const match = line.match(/^(\d{3}) /)
      if (match) {
        const complete = [...this.accumulatedLines]
        this.accumulatedLines = []
        const resolver = this.pendingResolvers.shift()
        if (resolver) {
          resolver(complete)
        }
      }
    }
  }

  async sendCommand(cmd: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'))
        return
      }
      this.pendingResolvers.push(resolve)
      this.socket.write(cmd + '\r\n', (err) => {
        if (err) {
          this.pendingResolvers.pop()
          reject(err)
        }
      })
    })
  }

  async authenticate(): Promise<void> {
    const info = await this.getProtocolInfo()
    await this.doAuthenticate(info)

    // Determine SOCKS port
    try {
      const lines = await this.sendCommand('GETINFO net/listeners/socks')
      for (const line of lines) {
        const m = line.match(/net\/listeners\/socks="127\.0\.0\.1:(\d+)"/)
        if (m) {
          this._socksPort = parseInt(m[1], 10)
          break
        }
      }
    } catch {
      // use default based on control port
    }
  }

  private async getProtocolInfo(): Promise<ProtocolInfo> {
    const lines = await this.sendCommand('PROTOCOLINFO 1')
    let authMethods: string[] = []
    let cookieFile: string | null = null
    let torVersion = ''

    for (const line of lines) {
      if (line.startsWith('250-AUTH METHODS=')) {
        const methodPart = line.slice('250-AUTH METHODS='.length)
        const cookieMatch = methodPart.match(/COOKIEFILE="([^"]+)"/)
        if (cookieMatch) cookieFile = cookieMatch[1]
        const methodsList = methodPart.split(' ')[0]
        authMethods = methodsList.split(',')
      } else if (line.startsWith('250-VERSION Tor=')) {
        const m = line.match(/Tor="([^"]+)"/)
        if (m) torVersion = m[1]
      }
    }

    return { authMethods, cookieFile, torVersion }
  }

  private async doAuthenticate(info: ProtocolInfo): Promise<void> {
    const { authMethods, cookieFile } = info

    if (authMethods.includes('NULL')) {
      const lines = await this.sendCommand('AUTHENTICATE ""')
      if (!lines.some(l => l.startsWith('250'))) {
        throw new Error('NULL authentication failed')
      }
      return
    }

    if (authMethods.includes('SAFECOOKIE') && cookieFile) {
      try {
        await this.safeCookieAuth(cookieFile)
        return
      } catch (e) {
        console.warn('SAFECOOKIE failed, reconnecting for COOKIE fallback:', e)
        // Must reconnect — Tor's control connection is now in SAFECOOKIE state
        // and will reject a plain COOKIE AUTHENTICATE on the same socket.
        this.socket?.destroy()
        this.socket = null
        await this.tryConnect(this.controlPort)
      }
    }

    if ((authMethods.includes('COOKIE') || authMethods.includes('SAFECOOKIE')) && cookieFile) {
      const cookiePath = cookieFile.replace(/\\\\/g, '\\') // normalise any double-backslashes
      const cookie = fs.readFileSync(cookiePath)
      const hex = cookie.toString('hex')
      const lines = await this.sendCommand(`AUTHENTICATE ${hex}`)
      if (!lines.some(l => l.startsWith('250'))) {
        throw new Error('COOKIE authentication failed')
      }
      return
    }

    throw new Error(`No supported auth method. Available: ${info.authMethods.join(', ')}`)
  }

  private async safeCookieAuth(cookieFile: string): Promise<void> {
    const cookie = fs.readFileSync(cookieFile)
    const clientNonce = crypto.randomBytes(32)
    const clientNonceHex = clientNonce.toString('hex')

    const challengeLines = await this.sendCommand(`AUTHCHALLENGE SAFECOOKIE ${clientNonceHex}`)
    let serverHashHex = ''
    let serverNonceHex = ''

    for (const line of challengeLines) {
      const m = line.match(/SERVERHASH=([0-9a-fA-F]+) SERVERNONCE=([0-9a-fA-F]+)/)
      if (m) {
        serverHashHex = m[1]
        serverNonceHex = m[2]
        break
      }
    }

    if (!serverHashHex || !serverNonceHex) {
      throw new Error('Invalid AUTHCHALLENGE response')
    }

    const serverNonce = Buffer.from(serverNonceHex, 'hex')
    const keyMaterial = Buffer.concat([cookie, clientNonce, serverNonce])

    // Verify server hash (non-fatal on localhost — MITM not possible)
    const serverKey = 'Tor safe cookie authentication server-to-controller hash'
    const expectedServerHash = crypto.createHmac('sha256', keyMaterial).update(serverKey).digest()
    if (expectedServerHash.toString('hex') !== serverHashHex.toLowerCase()) {
      throw new Error('Server hash verification failed — cookie file mismatch')
    }

    // Compute client hash
    const clientKey = 'Tor safe cookie authentication controller-to-server hash'
    const clientHash = crypto.createHmac('sha256', keyMaterial).update(clientKey).digest()
    const clientHashHex = clientHash.toString('hex')

    const authLines = await this.sendCommand(`AUTHENTICATE ${clientHashHex}`)
    if (!authLines.some(l => l.startsWith('250'))) {
      throw new Error('SAFECOOKIE authentication failed')
    }
  }

  async createHiddenServiceForPort(
    localPort: number,
    savedKey: string | null
  ): Promise<{ onionAddress: string; privateKey: string }> {
    let cmd: string
    if (savedKey) {
      cmd = `ADD_ONION ${savedKey} Port=${localPort},127.0.0.1:${localPort}`
    } else {
      cmd = `ADD_ONION NEW:ED25519-V3 Port=${localPort},127.0.0.1:${localPort}`
    }

    const lines = await this.sendCommand(cmd)
    let serviceId = ''
    let privateKey = ''

    for (const line of lines) {
      const idMatch = line.match(/ServiceID=([a-z2-7]+)/i)
      if (idMatch) serviceId = idMatch[1]
      const keyMatch = line.match(/PrivateKey=(.+)/)
      if (keyMatch) privateKey = keyMatch[1].trim()
    }

    if (!serviceId) {
      const errLine = lines.find(l => l.startsWith('5'))
      throw new Error(`Failed to create hidden service: ${errLine ?? lines.join('; ')}`)
    }

    const onionAddress = `${serviceId}.onion`
    return { onionAddress, privateKey }
  }

  async deleteHiddenService(onionAddress: string): Promise<void> {
    // Strip .onion suffix to get just the service ID
    const serviceId = onionAddress.replace(/\.onion$/, '')
    try {
      await this.sendCommand(`DEL_ONION ${serviceId}`)
    } catch {
      // ignore — service may already be gone
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
  }
}
