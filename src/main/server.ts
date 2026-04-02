import * as net from 'net'
import { EventEmitter } from 'events'
import { SocksClient } from 'socks'
import { v4 as uuidv4 } from 'uuid'
import { encryptMessage, decryptMessage } from './crypto'

interface FrameParser {
  buffer: Buffer
}

function writeFrame(socket: net.Socket, obj: unknown): void {
  const json = JSON.stringify(obj)
  const jsonBuf = Buffer.from(json, 'utf8')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(jsonBuf.length, 0)
  socket.write(Buffer.concat([lenBuf, jsonBuf]))
}

function createFrameParser(onFrame: (data: unknown) => void): {
  push: (chunk: Buffer) => void
} {
  const state: FrameParser = { buffer: Buffer.alloc(0) }
  return {
    push(chunk: Buffer) {
      state.buffer = Buffer.concat([state.buffer, chunk])
      while (true) {
        if (state.buffer.length < 4) break
        const len = state.buffer.readUInt32BE(0)
        if (state.buffer.length < 4 + len) break
        const jsonBuf = state.buffer.slice(4, 4 + len)
        state.buffer = state.buffer.slice(4 + len)
        try {
          const obj = JSON.parse(jsonBuf.toString('utf8'))
          onFrame(obj)
        } catch {
          // skip malformed frame
        }
      }
    }
  }
}

export interface PeerConnection {
  contactId: string
  socket: net.Socket
  theirPublicKey: string
  mySecretKey: string
  handshakeDone: boolean
}

export class P2PServer extends EventEmitter {
  private server: net.Server | null = null
  private connections: Map<string, PeerConnection> = new Map()
  private myPublicKey: string
  private mySecretKey: string
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private stopped = false
  private _listeningPort = 0
  private contactLookup: ((pubkey: string) => string | null) | null = null
  private profileProvider: (() => { username: string; avatar: string | null }) | null = null
  private contactInfoProvider: (() => { onionAddress: string; port: number; nickname: string } | null) | null = null
  // Group message backlog provider: returns messages for a group since a given timestamp
  private groupSyncProvider: ((groupId: string, since: number) => import('./storage').GroupMessage[]) | null = null

  constructor(myPublicKey: string, mySecretKey: string) {
    super()
    this.myPublicKey = myPublicKey
    this.mySecretKey = mySecretKey
  }

  setContactLookup(fn: (pubkey: string) => string | null): void {
    this.contactLookup = fn
  }

  setProfileProvider(fn: () => { username: string; avatar: string | null }): void {
    this.profileProvider = fn
  }

  setContactInfoProvider(fn: () => { onionAddress: string; port: number; nickname: string } | null): void {
    this.contactInfoProvider = fn
  }

  setGroupSyncProvider(fn: (groupId: string, since: number) => import('./storage').GroupMessage[]): void {
    this.groupSyncProvider = fn
  }

  get publicKey(): string { return this.myPublicKey }
  get listeningPort(): number { return this._listeningPort }

  async startServer(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleIncomingConnection(socket)
      })

      this.server.listen(port, '127.0.0.1', () => {
        const addr = this.server!.address() as net.AddressInfo
        this._listeningPort = addr.port
        resolve(addr.port)
      })

      this.server.on('error', reject)
    })
  }

  private handleIncomingConnection(socket: net.Socket): void {
    let contactId: string | null = null
    let handshakeDone = false
    let theirPublicKey = ''

    const parser = createFrameParser((frame: unknown) => {
      const obj = frame as Record<string, unknown>
      if (!handshakeDone) {
        if (obj.type === 'HELLO' && typeof obj.pubkey === 'string') {
          theirPublicKey = obj.pubkey
          handshakeDone = true

          // Find or create contact id based on public key
          contactId = this.findContactIdByPublicKey(theirPublicKey) ?? `server-${uuidv4()}`

          const conn: PeerConnection = {
            contactId,
            socket,
            theirPublicKey,
            mySecretKey: this.mySecretKey,
            handshakeDone: true
          }
          this.connections.set(contactId, conn)

          // Send our HELLO then our profile
          writeFrame(socket, { type: 'HELLO', pubkey: this.myPublicKey, version: 1 })
          if (this.profileProvider) {
            const p = this.profileProvider()
            writeFrame(socket, { type: 'PROFILE', username: p.username, avatar: p.avatar })
          }
          this.emit('peer:connected', { contactId, theirPublicKey, role: 'server' as const })
        }
        return
      }

      if (!contactId) return

      // Profile exchange (plaintext, public info)
      if (obj.type === 'PROFILE' && typeof obj.username === 'string') {
        this.emit('peer:profile', {
          contactId,
          username: obj.username,
          avatar: typeof obj.avatar === 'string' ? obj.avatar : null
        })
        return
      }

      // Contact info — sender is telling us their onion address/port so we can save them
      if (obj.type === 'CONTACT_INFO' && typeof obj.onionAddress === 'string' && typeof obj.port === 'number') {
        this.emit('peer:contact-info', {
          contactId,
          theirPublicKey,
          onionAddress: obj.onionAddress,
          port: obj.port,
          nickname: typeof obj.nickname === 'string' ? obj.nickname : undefined,
        })
        return
      }

      // Typing indicator
      if (obj.type === 'TYPING') {
        this.emit('peer:typing', { contactId, typing: obj.typing === true })
        return
      }

      // Group invite — peer is sharing a group they created or were invited to
      if (obj.type === 'GROUP_INVITE' && obj.group && typeof (obj.group as Record<string, unknown>).id === 'string') {
        this.emit('group:invite', { fromContactId: contactId, group: obj.group })
        return
      }

      // Votekick — a peer is requesting a vote to kick a member
      if (obj.type === 'VOTE_KICK' && typeof obj.groupId === 'string' && typeof obj.targetPublicKey === 'string' && typeof obj.initiatorPublicKey === 'string') {
        this.emit('group:votekick', { fromContactId: contactId, groupId: obj.groupId, voteId: obj.voteId, targetPublicKey: obj.targetPublicKey, initiatorPublicKey: obj.initiatorPublicKey, initiatorNickname: obj.initiatorNickname })
        return
      }

      // Vote cast — a peer voted yes on a kick
      if (obj.type === 'VOTE_CAST' && typeof obj.groupId === 'string' && typeof obj.voteId === 'string' && typeof obj.voterPublicKey === 'string') {
        this.emit('group:votecast', { fromContactId: contactId, groupId: obj.groupId, voteId: obj.voteId, voterPublicKey: obj.voterPublicKey })
        return
      }

      // Group kick — majority reached, remove the member
      if (obj.type === 'GROUP_KICK' && typeof obj.groupId === 'string' && typeof obj.targetPublicKey === 'string') {
        this.emit('group:kick', { fromContactId: contactId, groupId: obj.groupId, targetPublicKey: obj.targetPublicKey })
        return
      }

      // Group message (plaintext envelope, content encrypted inside)
      if (obj.type === 'GROUP_MSG' && typeof obj.groupId === 'string') {
        this.emit('group:message', {
          fromContactId: contactId,
          groupId: obj.groupId,
          id: obj.id,
          senderId: obj.senderId,
          senderNickname: obj.senderNickname,
          content: obj.content,
          attachment: obj.attachment,
          timestamp: obj.ts,
        })
        return
      }

      // Sync request: peer reconnected and wants messages for a group since timestamp
      if (obj.type === 'SYNC_REQUEST' && typeof obj.groupId === 'string' && typeof obj.since === 'number') {
        if (this.groupSyncProvider) {
          const messages = this.groupSyncProvider(obj.groupId as string, obj.since as number)
          writeFrame(socket, { type: 'SYNC_RESPONSE', groupId: obj.groupId, messages })
        }
        return
      }

      // Sync response: messages from a peer after our sync request
      if (obj.type === 'SYNC_RESPONSE' && typeof obj.groupId === 'string' && Array.isArray(obj.messages)) {
        this.emit('group:sync', {
          fromContactId: contactId,
          groupId: obj.groupId,
          messages: obj.messages,
        })
        return
      }

      // Encrypted frame
      if (typeof obj.nonce === 'string' && typeof obj.data === 'string') {
        const plaintext = decryptMessage(obj.nonce, obj.data, theirPublicKey, this.mySecretKey)
        if (!plaintext) return
        try {
          const msg = JSON.parse(plaintext) as Record<string, unknown>
          if (msg.type === 'msg') {
            this.emit('message', {
              contactId,
              id: msg.id as string,
              content: msg.content as string,
              timestamp: msg.ts as number
            })
          }
        } catch {
          // skip
        }
      }
    })

    socket.on('data', (chunk: Buffer) => parser.push(chunk))

    socket.on('close', () => {
      if (contactId) {
        this.connections.delete(contactId)
        this.emit('peer:disconnected', { contactId })
      }
    })

    socket.on('error', () => {
      if (contactId) {
        this.connections.delete(contactId)
      }
    })
  }

  private findContactIdByPublicKey(pubkey: string): string | null {
    for (const [id, conn] of this.connections) {
      if (conn.theirPublicKey === pubkey) return id
    }
    return this.contactLookup ? this.contactLookup(pubkey) : null
  }

  async connectToContact(
    contactId: string,
    onionAddress: string,
    port: number,
    theirPublicKey: string,
    socksPort: number
  ): Promise<void> {
    if (this.connections.has(contactId)) return
    this.reconnectAttempts.set(contactId, 0)
    await this.doConnect(contactId, onionAddress, port, theirPublicKey, socksPort)
  }

  private async doConnect(
    contactId: string,
    onionAddress: string,
    port: number,
    theirPublicKey: string,
    socksPort: number
  ): Promise<void> {
    if (this.stopped) return
    if (this.connections.has(contactId)) return

    try {
      const { socket } = await SocksClient.createConnection({
        proxy: {
          host: '127.0.0.1',
          port: socksPort,
          type: 5
        },
        command: 'connect',
        destination: {
          host: onionAddress,
          port: port
        },
        timeout: 30000
      })

      let handshakeDone = false

      // Send our HELLO
      writeFrame(socket, { type: 'HELLO', pubkey: this.myPublicKey, version: 1 })

      const parser = createFrameParser((frame: unknown) => {
        const obj = frame as Record<string, unknown>
        if (!handshakeDone) {
          if (obj.type === 'HELLO' && typeof obj.pubkey === 'string') {
            handshakeDone = true
            const conn: PeerConnection = {
              contactId,
              socket,
              theirPublicKey: obj.pubkey,
              mySecretKey: this.mySecretKey,
              handshakeDone: true
            }
            this.connections.set(contactId, conn)
            this.reconnectAttempts.set(contactId, 0)
            // Send our profile
            if (this.profileProvider) {
              const p = this.profileProvider()
              writeFrame(socket, { type: 'PROFILE', username: p.username, avatar: p.avatar })
            }
            // Send our contact info so the server side can save us as a contact immediately
            if (this.contactInfoProvider) {
              const info = this.contactInfoProvider()
              if (info) writeFrame(socket, { type: 'CONTACT_INFO', onionAddress: info.onionAddress, port: info.port, nickname: info.nickname })
            }
            this.emit('peer:connected', { contactId, theirPublicKey: obj.pubkey, role: 'client' as const })
          }
          return
        }

        // Profile exchange (plaintext, public info)
        if (obj.type === 'PROFILE' && typeof obj.username === 'string') {
          this.emit('peer:profile', {
            contactId,
            username: obj.username,
            avatar: typeof obj.avatar === 'string' ? obj.avatar : null
          })
          return
        }

        // Votekick
        if (obj.type === 'VOTE_KICK' && typeof obj.groupId === 'string' && typeof obj.targetPublicKey === 'string' && typeof obj.initiatorPublicKey === 'string') {
          this.emit('group:votekick', { fromContactId: contactId, groupId: obj.groupId, voteId: obj.voteId, targetPublicKey: obj.targetPublicKey, initiatorPublicKey: obj.initiatorPublicKey, initiatorNickname: obj.initiatorNickname })
          return
        }

        // Vote cast
        if (obj.type === 'VOTE_CAST' && typeof obj.groupId === 'string' && typeof obj.voteId === 'string' && typeof obj.voterPublicKey === 'string') {
          this.emit('group:votecast', { fromContactId: contactId, groupId: obj.groupId, voteId: obj.voteId, voterPublicKey: obj.voterPublicKey })
          return
        }

        // Group kick
        if (obj.type === 'GROUP_KICK' && typeof obj.groupId === 'string' && typeof obj.targetPublicKey === 'string') {
          this.emit('group:kick', { fromContactId: contactId, groupId: obj.groupId, targetPublicKey: obj.targetPublicKey })
          return
        }

        // Group message
        if (obj.type === 'GROUP_MSG' && typeof obj.groupId === 'string') {
          this.emit('group:message', {
            fromContactId: contactId,
            groupId: obj.groupId,
            id: obj.id,
            senderId: obj.senderId,
            senderNickname: obj.senderNickname,
            content: obj.content,
            attachment: obj.attachment,
            timestamp: obj.ts,
          })
          return
        }

        // Sync request
        if (obj.type === 'SYNC_REQUEST' && typeof obj.groupId === 'string' && typeof obj.since === 'number') {
          if (this.groupSyncProvider) {
            const messages = this.groupSyncProvider(obj.groupId as string, obj.since as number)
            writeFrame(socket, { type: 'SYNC_RESPONSE', groupId: obj.groupId, messages })
          }
          return
        }

        // Sync response
        if (obj.type === 'SYNC_RESPONSE' && typeof obj.groupId === 'string' && Array.isArray(obj.messages)) {
          this.emit('group:sync', {
            fromContactId: contactId,
            groupId: obj.groupId,
            messages: obj.messages,
          })
          return
        }

        if (typeof obj.nonce === 'string' && typeof obj.data === 'string') {
          const plaintext = decryptMessage(obj.nonce, obj.data, theirPublicKey, this.mySecretKey)
          if (!plaintext) return
          try {
            const msg = JSON.parse(plaintext) as Record<string, unknown>
            if (msg.type === 'msg') {
              this.emit('message', {
                contactId,
                id: msg.id as string,
                content: msg.content as string,
                timestamp: msg.ts as number
              })
            }
          } catch {
            // skip
          }
        }
      })

      socket.on('data', (chunk: Buffer) => parser.push(chunk))

      socket.on('close', () => {
        this.connections.delete(contactId)
        this.emit('peer:disconnected', { contactId })
        if (!this.stopped) {
          this.scheduleReconnect(contactId, onionAddress, port, theirPublicKey, socksPort)
        }
      })

      socket.on('error', () => {
        this.connections.delete(contactId)
        if (!this.stopped) {
          this.scheduleReconnect(contactId, onionAddress, port, theirPublicKey, socksPort)
        }
      })
    } catch {
      if (!this.stopped) {
        this.scheduleReconnect(contactId, onionAddress, port, theirPublicKey, socksPort)
      }
    }
  }

  private scheduleReconnect(
    contactId: string,
    onionAddress: string,
    port: number,
    theirPublicKey: string,
    socksPort: number
  ): void {
    if (this.reconnectTimers.has(contactId)) return
    const attempts = this.reconnectAttempts.get(contactId) ?? 0
    const delays = [5000, 10000, 20000, 40000, 60000]
    const delay = delays[Math.min(attempts, delays.length - 1)]
    this.reconnectAttempts.set(contactId, attempts + 1)

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(contactId)
      this.doConnect(contactId, onionAddress, port, theirPublicKey, socksPort)
    }, delay)
    this.reconnectTimers.set(contactId, timer)
  }

  sendMessage(
    contactId: string,
    content: string,
    id?: string,
    timestamp?: number
  ): { success: boolean; id?: string; timestamp?: number; error?: string } {
    const conn = this.connections.get(contactId)
    if (!conn || !conn.handshakeDone) {
      return { success: false, error: 'Not connected to peer' }
    }

    const msgId = id ?? uuidv4()
    const msgTs = timestamp ?? Date.now()
    const plaintext = JSON.stringify({ type: 'msg', id: msgId, content, ts: msgTs })

    try {
      const { nonce, data } = encryptMessage(plaintext, conn.theirPublicKey, this.mySecretKey)
      writeFrame(conn.socket, { nonce, data })
      return { success: true, id: msgId, timestamp: msgTs }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  // Send a group invite (full group metadata) to a specific peer
  sendGroupInvite(contactId: string, group: import('./storage').Group): void {
    const conn = this.connections.get(contactId)
    if (!conn?.handshakeDone) return
    writeFrame(conn.socket, { type: 'GROUP_INVITE', group })
  }

  // Send a group message to a specific connected peer
  sendGroupMessage(
    contactId: string,
    groupId: string,
    id: string,
    senderId: string,
    senderNickname: string,
    content: string,
    ts: number,
    attachment?: { type: string; name: string; data: string }
  ): void {
    const conn = this.connections.get(contactId)
    if (!conn?.handshakeDone) return
    writeFrame(conn.socket, {
      type: 'GROUP_MSG', groupId, id, senderId, senderNickname, content, ts, attachment
    })
  }

  // Ask a connected peer for group messages we missed since a given timestamp
  requestGroupSync(contactId: string, groupId: string, since: number): void {
    const conn = this.connections.get(contactId)
    if (!conn?.handshakeDone) return
    writeFrame(conn.socket, { type: 'SYNC_REQUEST', groupId, since })
  }

  sendVotekick(contactId: string, groupId: string, voteId: string, targetPublicKey: string, initiatorPublicKey: string, initiatorNickname: string): void {
    const conn = this.connections.get(contactId)
    if (!conn?.handshakeDone) return
    writeFrame(conn.socket, { type: 'VOTE_KICK', groupId, voteId, targetPublicKey, initiatorPublicKey, initiatorNickname })
  }

  sendVoteCast(contactId: string, groupId: string, voteId: string, voterPublicKey: string): void {
    const conn = this.connections.get(contactId)
    if (!conn?.handshakeDone) return
    writeFrame(conn.socket, { type: 'VOTE_CAST', groupId, voteId, voterPublicKey })
  }

  sendGroupKick(contactId: string, groupId: string, targetPublicKey: string): void {
    const conn = this.connections.get(contactId)
    if (!conn?.handshakeDone) return
    writeFrame(conn.socket, { type: 'GROUP_KICK', groupId, targetPublicKey })
  }

  broadcastProfile(username: string, avatar: string | null): void {
    for (const [, conn] of this.connections) {
      if (conn.handshakeDone) {
        writeFrame(conn.socket, { type: 'PROFILE', username, avatar })
      }
    }
  }

  sendTyping(contactId: string, isTyping: boolean): void {
    const conn = this.connections.get(contactId)
    if (conn?.handshakeDone) {
      writeFrame(conn.socket, { type: 'TYPING', typing: isTyping })
    }
  }

  isConnected(contactId: string): boolean {
    return this.connections.has(contactId)
  }

  getConnectedContactIds(): string[] {
    return Array.from(this.connections.keys())
  }

  stopReconnecting(contactId: string): void {
    const timer = this.reconnectTimers.get(contactId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(contactId)
    }
    this.reconnectAttempts.delete(contactId)
  }

  disconnectContact(contactId: string): void {
    this.stopReconnecting(contactId)
    const conn = this.connections.get(contactId)
    if (conn) {
      conn.socket.destroy()
      this.connections.delete(contactId)
    }
  }

  remapContactId(oldId: string, newId: string): void {
    const conn = this.connections.get(oldId)
    if (!conn) return
    conn.contactId = newId
    this.connections.delete(oldId)
    this.connections.set(newId, conn)
  }

  stop(): void {
    this.stopped = true
    for (const [, timer] of this.reconnectTimers) {
      clearTimeout(timer)
    }
    this.reconnectTimers.clear()
    for (const [, conn] of this.connections) {
      conn.socket.destroy()
    }
    this.connections.clear()
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }
}
