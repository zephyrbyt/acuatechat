import { app, BrowserWindow, ipcMain, shell, Menu, Notification, nativeImage, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { TorController } from './tor'
import { P2PServer } from './server'
import { Storage, Contact, Profile, StorageSettings, Group, GroupMember, GroupMessage, PendingContact } from './storage'
import {
  generateKeyPair,
  buildInviteCode,
  parseInviteCode,
  deriveStorageKey,
  encryptData,
  decryptData,
  generateGroupKey,
  encryptGroupPayload,
  decryptGroupPayload,
  lockIdentity,
  unlockIdentity,
  generateRecoveryPhrase,
  validateRecoveryPhrase,
  encryptIdentityWithPhrase,
  decryptIdentityWithPhrase,
  type LockedIdentity,
  type RecoveryLockedIdentity
} from './crypto'

let mainWindow: BrowserWindow | null = null
let torController: TorController | null = null
let p2pServer: P2PServer | null = null
let storage: Storage | null = null
let torStatus: {
  status: 'connecting' | 'connected' | 'error'
  onionAddress: string | null
  socksPort: number
  error?: string
} = {
  status: 'connecting',
  onionAddress: null,
  socksPort: 9150
}

// Whether the app is fully initialised (post-unlock)
let appReady = false

// Vote tallies: voteId -> { groupId, targetPublicKey, voterPublicKeys }
const kickVotes = new Map<string, { groupId: string; targetPublicKey: string; voters: Set<string> }>()

// Offline message queue: contactId -> messages pending delivery
const offlineQueue = new Map<string, Array<{ id: string; content: string; timestamp: number }>>()

// contactIds that are pending approval — keep connection open until profile arrives, then disconnect
const pendingApprovalIds = new Set<string>()

function postSystemMessage(groupId: string, content: string, systemEvent: string): void {
  if (!storage) return
  const msg: GroupMessage = {
    id: uuidv4(), groupId, senderId: '', senderNickname: '',
    content, timestamp: Date.now(), direction: 'system', systemEvent,
  }
  storage.addGroupMessage(groupId, msg)
  sendToRenderer('group:message', {
    groupId, id: msg.id, senderId: '', senderNickname: '',
    content, timestamp: msg.timestamp, direction: 'system', systemEvent,
  })
}

function applyKick(voteId: string, groupId: string, targetPublicKey: string): void {
  if (!storage || !p2pServer) return
  const groups = storage.getGroups()
  const group = groups[groupId]
  if (!group) return
  const target = group.members.find(m => m.publicKey === targetPublicKey)
  group.members = group.members.filter(m => m.publicKey !== targetPublicKey)
  storage.saveGroups(groups)
  sendToRenderer('group:updated', { group })
  kickVotes.delete(voteId)
  if (target) postSystemMessage(groupId, `${target.nickname} was removed from the group.`, 'member_kicked')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 500,
    backgroundColor: '#08080e',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

// --- Passphrase / identity helpers ---

function identityFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'identity.locked')
}

function hasLockedIdentity(userDataPath: string): boolean {
  return fs.existsSync(identityFilePath(userDataPath))
}

function readLockedIdentity(userDataPath: string): LockedIdentity | null {
  try {
    const raw = fs.readFileSync(identityFilePath(userDataPath), 'utf8')
    return JSON.parse(raw) as LockedIdentity
  } catch {
    return null
  }
}

function writeLockedIdentity(userDataPath: string, locked: LockedIdentity): void {
  fs.writeFileSync(identityFilePath(userDataPath), JSON.stringify(locked, null, 2), 'utf8')
}

function recoveryFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'identity.recovery')
}

function readRecoveryIdentity(userDataPath: string): RecoveryLockedIdentity | null {
  try {
    const raw = fs.readFileSync(recoveryFilePath(userDataPath), 'utf8')
    return JSON.parse(raw) as RecoveryLockedIdentity
  } catch {
    return null
  }
}

function writeRecoveryIdentity(userDataPath: string, locked: RecoveryLockedIdentity): void {
  fs.writeFileSync(recoveryFilePath(userDataPath), JSON.stringify(locked, null, 2), 'utf8')
}

// --- Post-unlock app initialisation ---

async function initializeApp(userDataPath: string, secretKey: string, publicKey: string, hiddenServiceKey: string | null, localPort: number): Promise<void> {
  storage = new Storage(userDataPath)

  // Derive storage key from the secret key and give it to storage
  const storageKey = deriveStorageKey(secretKey)
  storage.setStorageKey(storageKey)

  // Clean up legacy plaintext files and migrate to append-only log format
  storage.migrateLegacyFiles()

  // Enforce retention policy
  storage.pruneExpired()

  p2pServer = new P2PServer(publicKey, secretKey)

  // Allow server to resolve inbound public keys to existing stored contact IDs
  p2pServer.setContactLookup((pubkey: string) => {
    const contacts = storage!.getContacts()
    const match = Object.values(contacts).find(c => c.publicKey === pubkey)
    return match ? match.id : null
  })

  // Provide group message backlog for sync requests from peers (content encrypted for wire)
  p2pServer.setGroupSyncProvider((groupId: string, since: number) => {
    const groups = storage!.getGroups()
    const groupKey = groups[groupId]?.groupKey
    return storage!.getGroupMessages(groupId).filter(m => m.timestamp > since).map(m => {
      if (m.direction === 'system' || !groupKey) return m
      const encContent = encryptGroupPayload(m.content, groupKey)
      const encAttachment = m.attachment
        ? { ...m.attachment, data: encryptGroupPayload(m.attachment.data, groupKey) }
        : m.attachment
      return { ...m, content: encContent, attachment: encAttachment }
    })
  })

  // Provide our own onion address + port so peers can save us as a contact
  p2pServer.setContactInfoProvider(() => {
    if (!torStatus.onionAddress) return null
    const profile = storage!.getProfile()
    return {
      onionAddress: torStatus.onionAddress,
      port: p2pServer!.listeningPort,
      nickname: profile?.username ?? 'Anonymous',
    }
  })

  // Provide our profile to send to peers after handshake
  p2pServer.setProfileProvider(() => {
    const profile = storage!.getProfile()
    return { username: profile?.username ?? 'Anonymous', avatar: profile?.avatar ?? null }
  })

  p2pServer.on('peer:connected', ({ contactId, theirPublicKey, role }: { contactId: string; theirPublicKey: string; role: 'client' | 'server' }) => {
    let newContactData: Contact | undefined
    if (role === 'server') {
      const contacts = storage!.getContacts()
      if (!contacts[contactId]) {
        const settings = storage!.getSettings()
        if (settings.requireApproval) {
          // Deduplicate by public key — don't create a new entry if already pending
          const existingPending = Object.values(storage!.getPendingContacts())
            .find(p => p.publicKey === theirPublicKey)
          if (existingPending) {
            p2pServer!.disconnectContact(contactId)
            return
          }
          const pendingContact: PendingContact = {
            id: contactId,
            nickname: `Peer ${contactId.slice(0, 8)}`,
            avatar: null,
            publicKey: theirPublicKey,
            requestedAt: Date.now()
          }
          storage!.addPendingContact(pendingContact)
          // Stay connected briefly so peer:profile can arrive with real name/avatar,
          // then disconnect. pendingApprovalIds tracks which IDs to disconnect on profile.
          pendingApprovalIds.add(contactId)
          sendToRenderer('contact:pending', { contact: pendingContact })
          // Fallback disconnect after 5s if profile never arrives
          setTimeout(() => {
            if (pendingApprovalIds.has(contactId)) {
              pendingApprovalIds.delete(contactId)
              p2pServer!.disconnectContact(contactId)
            }
          }, 5000)
          return
        }
        const newContact: Contact = {
          id: contactId,
          nickname: `Peer ${contactId.slice(0, 8)}`,
          avatar: null,
          publicKey: theirPublicKey,
          role: 'server',
          createdAt: Date.now()
        }
        storage!.addContact(newContact)
        newContactData = newContact
      }
    }
    sendToRenderer('peer:connected', { contactId, contact: newContactData })

    // Drain any queued messages for this peer
    const queued = offlineQueue.get(contactId)
    if (queued && queued.length > 0) {
      for (const msg of queued) {
        p2pServer!.sendMessage(contactId, msg.content, msg.id, msg.timestamp)
      }
      offlineQueue.delete(contactId)
    }

    // For each group this peer is a member of: send invite if they may not have it,
    // then request a sync for messages they may have missed
    const groups = storage!.getGroups()
    for (const group of Object.values(groups)) {
      const peerIsMember = group.members.some(m => m.publicKey === theirPublicKey)
      if (!peerIsMember) continue
      // Always re-send the invite so offline-at-creation peers receive the group
      p2pServer!.sendGroupInvite(contactId, group)
      const myMessages = storage!.getGroupMessages(group.id)
      const lastTs = myMessages.length > 0
        ? Math.max(...myMessages.map(m => m.timestamp))
        : 0
      p2pServer!.requestGroupSync(contactId, group.id, lastTs)
    }
  })

  p2pServer.on('peer:contact-info', ({ contactId, theirPublicKey, onionAddress, port, nickname }: {
    contactId: string; theirPublicKey: string; onionAddress: string; port: number; nickname?: string
  }) => {
    if (!storage) return
    const contacts = storage.getContacts()
    // Only save if not already a known contact
    if (!contacts[contactId]) {
      const newContact: Contact = {
        id: contactId,
        nickname: nickname ?? `Peer ${contactId.slice(0, 8)}`,
        avatar: null,
        publicKey: theirPublicKey,
        role: 'client',
        onionAddress,
        port,
        createdAt: Date.now()
      }
      storage.addContact(newContact)
      sendToRenderer('peer:connected', { contactId, contact: newContact })
    } else {
      // Update their address in case it changed
      contacts[contactId].onionAddress = onionAddress
      contacts[contactId].port = port
      storage.saveContacts(contacts)
      // Notify renderer so it refreshes with updated address
      sendToRenderer('peer:connected', { contactId, contact: contacts[contactId] })
    }
  })

  p2pServer.on('peer:disconnected', ({ contactId }: { contactId: string }) => {
    sendToRenderer('peer:disconnected', { contactId })
  })

  p2pServer.on('peer:typing', ({ contactId, typing }: { contactId: string; typing: boolean }) => {
    sendToRenderer('peer:typing', { contactId, typing })
  })

  p2pServer.on('peer:profile', ({ contactId, username, avatar }: { contactId: string; username: string; avatar: string | null }) => {
    // If this is a pending-approval contact, update their entry with real name/avatar then disconnect
    if (pendingApprovalIds.has(contactId)) {
      pendingApprovalIds.delete(contactId)
      const pending = storage!.getPendingContacts()
      if (pending[contactId]) {
        pending[contactId].nickname = username
        pending[contactId].avatar = avatar
        storage!.savePendingContacts(pending)
        sendToRenderer('contact:pending', { contact: pending[contactId] })
      }
      p2pServer!.disconnectContact(contactId)
      return
    }
    const contacts = storage!.getContacts()
    if (contacts[contactId]) {
      contacts[contactId].nickname = username
      contacts[contactId].avatar = avatar
      storage!.saveContacts(contacts)
    }
    sendToRenderer('peer:profile', { contactId, username, avatar })
  })

  p2pServer.on('message', ({ contactId, id, content, timestamp }: {
    contactId: string
    id: string
    content: string
    timestamp: number
  }) => {
    // Drop messages from blocked contacts
    const senderContact = storage!.getContacts()[contactId]
    if (senderContact && storage!.isBlocked(senderContact.publicKey)) return

    // Parse attachment if present
    let text = content
    let attachment: { type: string; name: string; data: string } | undefined
    try {
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && parsed.attachment) {
        text = parsed.text ?? ''
        attachment = parsed.attachment
      }
    } catch { /* plain text */ }
    storage!.addMessage(contactId, { id, content: text, attachment, timestamp, direction: 'received' })
    sendToRenderer('chat:message', { contactId, id, content: text, attachment, timestamp })

    // Desktop notification when window is not focused and setting is enabled
    if (!mainWindow?.isFocused() && Notification.isSupported() && storage!.getSettings().desktopNotifications) {
      const contacts = storage!.getContacts()
      const contact = contacts[contactId]
      const sender = contact?.nickname ?? 'Someone'
      const body = attachment
        ? (text ? text : `Sent ${attachment.type.startsWith('video') ? 'a video' : 'an image'}`)
        : (text || '…')

      let icon: Electron.NativeImage | undefined
      if (contact?.avatar) {
        try {
          // Avatar is stored as a base64 data URL — strip the prefix and decode
          const base64 = contact.avatar.replace(/^data:[^;]+;base64,/, '')
          icon = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'))
        } catch { /* fall through without icon */ }
      }

      new Notification({
        title: sender,
        body,
        icon,
        silent: false,
      }).show()
    }
  })

  p2pServer.on('group:message', ({
    groupId, id, senderId, senderNickname, content, attachment, timestamp
  }: {
    fromContactId?: string; groupId: string; id: string; senderId: string
    senderNickname: string; content: string
    attachment?: { type: string; name: string; data: string }; timestamp: number
  }) => {
    // Only accept if we're actually in this group
    const groups = storage!.getGroups()
    if (!groups[groupId]) return

    // Dedup — may arrive from multiple peers
    if (storage!.groupMessageExists(groupId, id)) return

    // Decrypt content and attachment data using the group key
    const groupKey = groups[groupId].groupKey
    const decryptedContent = groupKey ? (decryptGroupPayload(content, groupKey) ?? content) : content
    const decryptedAttachment = (attachment && groupKey)
      ? { ...attachment, data: decryptGroupPayload(attachment.data, groupKey) ?? attachment.data }
      : attachment

    let text = decryptedContent
    let attach: { type: string; name: string; data: string } | undefined = decryptedAttachment
    try {
      const parsed = JSON.parse(decryptedContent)
      if (parsed && typeof parsed === 'object' && parsed.attachment) {
        text = parsed.text ?? ''
        attach = parsed.attachment
      }
    } catch { /* plain text */ }

    const msg: GroupMessage = {
      id, groupId, senderId, senderNickname,
      content: text, attachment: attach, timestamp, direction: 'received'
    }
    storage!.addGroupMessage(groupId, msg)

    // Fan-forward to other online group members (relay role) — forward original encrypted wire payload
    const group = groups[groupId]
    const contacts = storage!.getContacts()
    for (const member of group.members) {
      const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
      if (!contact) continue
      if (contact.publicKey === senderId) continue  // don't send back to sender
      if (!p2pServer!.isConnected(contact.id)) continue
      p2pServer!.sendGroupMessage(
        contact.id, groupId, id, senderId, senderNickname, content, timestamp, attachment
      )
    }

    sendToRenderer('group:message', { groupId, id, senderId, senderNickname, content: text, attachment: attach, timestamp })

    // Desktop notification
    if (!mainWindow?.isFocused() && Notification.isSupported() && storage!.getSettings().desktopNotifications) {
      const body = attach
        ? (text ? text : `Sent ${attach.type.startsWith('video') ? 'a video' : 'an image'}`)
        : (text || '…')
      new Notification({
        title: `${senderNickname} (${groups[groupId]?.name ?? 'Group'})`,
        body,
        silent: false,
      }).show()
    }
  })

  p2pServer.on('group:invite', ({ group }: { fromContactId?: string; group: Group }) => {
    const existing = storage!.getGroups()
    const hadGroup = !!existing[group.id]
    // Always save — may contain updated member list
    storage!.addGroup(group)
    if (hadGroup) {
      // Existing group updated (e.g. new member added) — tell renderer to refresh
      sendToRenderer('group:updated', { group })
    } else {
      sendToRenderer('group:invited', { group })
    }
  })

  p2pServer.on('group:sync', ({
    groupId, messages
  }: {
    fromContactId?: string; groupId: string
    messages: GroupMessage[]
  }) => {
    const groups = storage!.getGroups()
    if (!groups[groupId]) return

    const syncGroupKey = groups[groupId].groupKey
    let newCount = 0
    for (const msg of messages) {
      if (storage!.groupMessageExists(groupId, msg.id)) continue
      const isSystem = msg.direction === 'system'
      // Decrypt wire-encrypted content from the sync response
      const plainContent = (!isSystem && syncGroupKey)
        ? (decryptGroupPayload(msg.content, syncGroupKey) ?? msg.content)
        : msg.content
      const plainAttachment = (msg.attachment && syncGroupKey && !isSystem)
        ? { ...msg.attachment, data: decryptGroupPayload(msg.attachment.data, syncGroupKey) ?? msg.attachment.data }
        : msg.attachment
      storage!.addGroupMessage(groupId, { ...msg, content: plainContent, attachment: plainAttachment, direction: isSystem ? 'system' : 'received' })
      sendToRenderer('group:message', {
        groupId: msg.groupId,
        id: msg.id,
        senderId: msg.senderId,
        senderNickname: msg.senderNickname,
        content: plainContent,
        attachment: plainAttachment,
        timestamp: msg.timestamp,
        direction: isSystem ? 'system' : 'received',
        systemEvent: msg.systemEvent,
      })
      newCount++
    }
    if (newCount > 0) {
      sendToRenderer('group:synced', { groupId, count: newCount })
    }
  })

  p2pServer.on('group:votekick', ({
    fromContactId, groupId, voteId, targetPublicKey, initiatorPublicKey, initiatorNickname
  }: {
    fromContactId: string; groupId: string; voteId: string; targetPublicKey: string; initiatorPublicKey: string; initiatorNickname: string
  }) => {
    const groups = storage!.getGroups()
    const group = groups[groupId]
    if (!group) return

    const myPublicKey = p2pServer!.publicKey
    // If we're the target, just show the system message but don't tally
    if (targetPublicKey === myPublicKey) {
      const target = group.members.find(m => m.publicKey === targetPublicKey)
      if (target && !kickVotes.has(voteId)) {
        postSystemMessage(groupId, JSON.stringify({ voteId, targetPublicKey, initiatorNickname, targetNickname: target.nickname }), 'votekick_pending')
      }
      return
    }

    const isNewVote = !kickVotes.has(voteId)
    if (isNewVote) {
      kickVotes.set(voteId, { groupId, targetPublicKey, voters: new Set([initiatorPublicKey]) })
      // Show vote prompt embed so this user can cast their vote
      const target = group.members.find(m => m.publicKey === targetPublicKey)
      if (target) {
        postSystemMessage(groupId, JSON.stringify({ voteId, targetPublicKey, initiatorNickname, targetNickname: target.nickname }), 'votekick_pending')
      }
    } else {
      kickVotes.get(voteId)!.voters.add(initiatorPublicKey)
    }

    // Forward to other online members (don't echo back to sender)
    const contacts = storage!.getContacts()
    for (const member of group.members) {
      if (member.publicKey === myPublicKey || member.publicKey === targetPublicKey) continue
      const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
      if (!contact || !p2pServer!.isConnected(contact.id)) continue
      if (contact.id === fromContactId) continue
      p2pServer!.sendVotekick(contact.id, groupId, voteId, targetPublicKey, initiatorPublicKey, initiatorNickname)
    }
  })

  p2pServer.on('group:votecast', ({
    fromContactId, groupId, voteId, voterPublicKey
  }: {
    fromContactId: string; groupId: string; voteId: string; voterPublicKey: string
  }) => {
    const entry = kickVotes.get(voteId)
    if (!entry || entry.groupId !== groupId) return

    entry.voters.add(voterPublicKey)

    const groups = storage!.getGroups()
    const group = groups[groupId]
    if (!group) return

    const myPublicKey = p2pServer!.publicKey
    const nonTargetCount = group.members.filter(m => m.publicKey !== entry.targetPublicKey).length
    if (nonTargetCount > 0 && entry.voters.size * 2 > nonTargetCount) {
      applyKick(voteId, groupId, entry.targetPublicKey)
      const contacts = storage!.getContacts()
      for (const member of group.members) {
        if (member.publicKey === myPublicKey || member.publicKey === entry.targetPublicKey) continue
        const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
        if (!contact || !p2pServer!.isConnected(contact.id)) continue
        p2pServer!.sendGroupKick(contact.id, groupId, entry.targetPublicKey)
      }
      return
    }

    // Forward VOTE_CAST to others so everyone tallies
    const contacts = storage!.getContacts()
    for (const member of group.members) {
      if (member.publicKey === myPublicKey || member.publicKey === entry.targetPublicKey) continue
      const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
      if (!contact || !p2pServer!.isConnected(contact.id)) continue
      if (contact.id === fromContactId) continue
      p2pServer!.sendVoteCast(contact.id, groupId, voteId, voterPublicKey)
    }
  })

  p2pServer.on('group:kick', ({ groupId, targetPublicKey }: { fromContactId: string; groupId: string; targetPublicKey: string }) => {
    // Find matching voteId for cleanup (or just apply with a dummy id — applyKick handles missing gracefully)
    const voteId = [...kickVotes.entries()].find(([, v]) => v.groupId === groupId && v.targetPublicKey === targetPublicKey)?.[0] ?? ''
    applyKick(voteId, groupId, targetPublicKey)
  })

  const actualPort = await p2pServer.startServer(localPort)

  // If port changed, re-lock and save identity with updated port
  if (actualPort !== localPort) {
    // We don't have the passphrase here anymore; port change persists next lock cycle
    // Store updated port in a separate sidecar so we pick it up next unlock
    const portFile = path.join(userDataPath, 'localport.dat')
    fs.writeFileSync(portFile, String(actualPort), 'utf8')
  }

  torController = new TorController()
  torStatus = { status: 'connecting', onionAddress: null, socksPort: 9150 }
  sendToRenderer('tor:status-change', torStatus)

  try {
    await torController.connect()
    torStatus.socksPort = torController.socksPort
    await torController.authenticate()

    const { onionAddress, privateKey } = await torController.createHiddenServiceForPort(
      actualPort,
      hiddenServiceKey
    )

    // If we got a new hidden service key, persist it encrypted with the storage key.
    if (!hiddenServiceKey && privateKey) {
      const hsKeyFile = path.join(userDataPath, 'hskey.dat')
      const hsStorageKey = deriveStorageKey(secretKey)
      fs.writeFileSync(hsKeyFile, encryptData(privateKey, hsStorageKey), 'utf8')
    }

    torStatus = { status: 'connected', onionAddress, socksPort: torController.socksPort }
    sendToRenderer('tor:status-change', torStatus)

    // Reconnect to client contacts
    const contacts = storage.getContacts()
    for (const contact of Object.values(contacts)) {
      if (contact.role === 'client' && contact.onionAddress && contact.port) {
        p2pServer.connectToContact(
          contact.id,
          contact.onionAddress,
          contact.port,
          contact.publicKey,
          torController.socksPort
        ).catch(console.error)
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    torStatus = { status: 'error', onionAddress: null, socksPort: 9150, error: errorMsg }
    sendToRenderer('tor:status-change', torStatus)
  }

  appReady = true
}

// --- IPC: Auto-updater ---
ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall()
})

// --- IPC: Window controls ---
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// --- IPC: Pending contacts ---

ipcMain.handle('contacts:pending', () => {
  return storage?.getPendingContacts() ?? {}
})

ipcMain.handle('contacts:approve', async (_e, contactId: string) => {
  if (!storage || !p2pServer || !torController) return { success: false, error: 'Not ready' }
  const pending = storage.getPendingContacts()
  const pc = pending[contactId]
  if (!pc) return { success: false, error: 'Not found' }
  // Move to real contacts
  const newContact: Contact = {
    id: pc.id,
    nickname: pc.nickname,
    avatar: pc.avatar,
    publicKey: pc.publicKey,
    role: 'server',
    createdAt: pc.requestedAt,
  }
  storage.addContact(newContact)
  storage.removePendingContact(contactId)
  // We can't re-connect to them since they connected to us (role=server).
  // They will reconnect on their own since they're the client.
  // Just notify renderer that contact was approved.
  sendToRenderer('peer:connected', { contactId, contact: newContact })
  return { success: true, contact: newContact }
})

ipcMain.handle('contacts:reject', (_e, contactId: string) => {
  if (!storage) return
  storage.removePendingContact(contactId)
})

// --- IPC: Passphrase / unlock ---

// Renderer asks: "does a locked identity exist yet?"
ipcMain.handle('auth:status', () => {
  const userDataPath = app.getPath('userData')
  return { hasIdentity: hasLockedIdentity(userDataPath) }
})

// First run: create identity + set passphrase
ipcMain.handle('auth:setup', async (_event, passphrase: string) => {
  if (appReady) return { success: false, error: 'Already initialised' }
  if (!passphrase || passphrase.length < 8) {
    return { success: false, error: 'Passphrase must be at least 8 characters' }
  }

  const userDataPath = app.getPath('userData')

  // Check for sidecar data from a previous partial init (port, hs key)
  let localPort = 7867
  let hiddenServiceKey: string | null = null
  const portFile = path.join(userDataPath, 'localport.dat')
  const hsKeyFile = path.join(userDataPath, 'hskey.dat')
  if (fs.existsSync(portFile)) localPort = parseInt(fs.readFileSync(portFile, 'utf8'), 10) || 7867

  const kp = generateKeyPair()
  if (fs.existsSync(hsKeyFile)) {
    const hsStorageKey = deriveStorageKey(kp.secretKey)
    hiddenServiceKey = decryptData(fs.readFileSync(hsKeyFile, 'utf8').trim(), hsStorageKey)
  }
  const identityJson = JSON.stringify({
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
    hiddenServiceKey,
    localPort
  })

  const recoveryPhrase = generateRecoveryPhrase()

  const locked = await lockIdentity(identityJson, passphrase)
  writeLockedIdentity(userDataPath, locked)

  const recoveryLocked = encryptIdentityWithPhrase(identityJson, recoveryPhrase)
  writeRecoveryIdentity(userDataPath, recoveryLocked)

  await initializeApp(userDataPath, kp.secretKey, kp.publicKey, hiddenServiceKey, localPort)
  return { success: true, recoveryPhrase }
})

// Returning user: unlock with passphrase
ipcMain.handle('auth:unlock', async (_event, passphrase: string) => {
  if (appReady) return { success: false, error: 'Already unlocked' }

  const userDataPath = app.getPath('userData')
  const locked = readLockedIdentity(userDataPath)
  if (!locked) return { success: false, error: 'No identity found' }

  let identityJson: string | null = null
  try {
    identityJson = await unlockIdentity(locked, passphrase)
  } catch {
    return { success: false, error: 'Failed to decrypt' }
  }
  if (!identityJson) return { success: false, error: 'Wrong passphrase' }

  let identity: { publicKey: string; secretKey: string; hiddenServiceKey: string | null; localPort: number }
  try {
    identity = JSON.parse(identityJson)
  } catch {
    return { success: false, error: 'Corrupted identity' }
  }

  // Merge sidecar updates (new hs key, port change since last lock)
  const portFile = path.join(userDataPath, 'localport.dat')
  const hsKeyFile = path.join(userDataPath, 'hskey.dat')
  if (fs.existsSync(portFile)) {
    const p = parseInt(fs.readFileSync(portFile, 'utf8'), 10)
    if (!isNaN(p)) identity.localPort = p
  }
  if (fs.existsSync(hsKeyFile) && !identity.hiddenServiceKey) {
    const hsStorageKey = deriveStorageKey(identity.secretKey)
    identity.hiddenServiceKey = decryptData(fs.readFileSync(hsKeyFile, 'utf8').trim(), hsStorageKey)
  }

  // Re-lock with merged data so sidecars aren't needed next time
  const merged = await lockIdentity(JSON.stringify(identity), passphrase)
  writeLockedIdentity(userDataPath, merged)
  if (fs.existsSync(portFile)) fs.unlinkSync(portFile)
  if (fs.existsSync(hsKeyFile)) fs.unlinkSync(hsKeyFile)

  await initializeApp(userDataPath, identity.secretKey, identity.publicKey, identity.hiddenServiceKey, identity.localPort)
  return { success: true }
})

// Recovery: decrypt with phrase, re-lock with new passphrase, then unlock
ipcMain.handle('auth:recover', async (_event, phrase: string, newPassphrase: string) => {
  if (appReady) return { success: false, error: 'Already unlocked' }
  if (!newPassphrase || newPassphrase.length < 8) {
    return { success: false, error: 'New passphrase must be at least 8 characters' }
  }
  if (!validateRecoveryPhrase(phrase)) {
    return { success: false, error: 'Invalid recovery phrase' }
  }

  const userDataPath = app.getPath('userData')
  const recoveryLocked = readRecoveryIdentity(userDataPath)
  if (!recoveryLocked) return { success: false, error: 'No recovery data found' }

  const identityJson = decryptIdentityWithPhrase(recoveryLocked, phrase)
  if (!identityJson) return { success: false, error: 'Recovery phrase is incorrect' }

  let identity: { publicKey: string; secretKey: string; hiddenServiceKey: string | null; localPort: number }
  try {
    identity = JSON.parse(identityJson)
  } catch {
    return { success: false, error: 'Corrupted recovery data' }
  }

  // Re-lock with the new passphrase and update the recovery blob too
  const newLocked = await lockIdentity(identityJson, newPassphrase)
  writeLockedIdentity(userDataPath, newLocked)
  const newRecovery = encryptIdentityWithPhrase(identityJson, phrase)
  writeRecoveryIdentity(userDataPath, newRecovery)

  await initializeApp(userDataPath, identity.secretKey, identity.publicKey, identity.hiddenServiceKey, identity.localPort)
  return { success: true }
})

// --- IPC: App ---

ipcMain.handle('tor:status', () => torStatus)

ipcMain.handle('identity:regen-onion', async () => {
  if (!torController || !p2pServer || !storage) return { success: false, error: 'Not ready' }
  const userDataPath = app.getPath('userData')
  try {
    // Remove the old hidden service from Tor
    if (torStatus.onionAddress) {
      await torController.deleteHiddenService(torStatus.onionAddress)
    }
    // Delete stored hs key so a new one is generated
    const hsKeyFile = path.join(userDataPath, 'hskey.dat')
    if (fs.existsSync(hsKeyFile)) fs.unlinkSync(hsKeyFile)

    // Create a fresh hidden service
    const port = p2pServer.listeningPort
    const { onionAddress, privateKey } = await torController.createHiddenServiceForPort(port, null)

    // Persist new key encrypted with the storage key
    const hsStorageKey = storage!.getStorageKey()!
    fs.writeFileSync(hsKeyFile, encryptData(privateKey, hsStorageKey), 'utf8')

    torStatus = { status: 'connected', onionAddress, socksPort: torController.socksPort }
    sendToRenderer('tor:status-change', torStatus)

    return { success: true, onionAddress }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('identity:pubkey', () => p2pServer?.publicKey ?? null)

ipcMain.handle('identity:invite-code', () => {
  if (!storage || !appReady) return null
  // Read identity from locked file to get public key
  const userDataPath = app.getPath('userData')
  const locked = readLockedIdentity(userDataPath)
  if (!locked || !torStatus.onionAddress) return null
  // publicKey is needed — get it from p2pServer (it holds it)
  const publicKey = p2pServer?.publicKey
  if (!publicKey) return null
  const portFile = path.join(userDataPath, 'localport.dat')
  let localPort = 7867
  // Get port from storage context (p2pServer knows actual port)
  const actualPort = p2pServer?.listeningPort ?? localPort
  if (fs.existsSync(portFile)) localPort = parseInt(fs.readFileSync(portFile, 'utf8'), 10) || localPort
  return buildInviteCode(torStatus.onionAddress, actualPort, publicKey)
})

ipcMain.handle('chat:connect', async (_event, inviteCode: string, nickname: string) => {
  if (typeof inviteCode !== 'string' || inviteCode.length > 1024) return { success: false, error: 'Invalid invite code' }
  if (typeof nickname !== 'string') return { success: false, error: 'Invalid nickname' }
  nickname = nickname.slice(0, 64)
  try {
    const parsed = parseInviteCode(inviteCode)
    if (!parsed) return { success: false, error: 'Invalid invite code' }
    if (torStatus.status !== 'connected' || !p2pServer || !torController) {
      return { success: false, error: 'Tor is not connected' }
    }

    const myPublicKey = p2pServer.publicKey
    if (parsed.publicKey === myPublicKey) {
      return { success: false, error: 'Cannot connect to yourself' }
    }

    const contacts = storage!.getContacts()
    const existing = Object.values(contacts).find(c => c.publicKey === parsed.publicKey)
    if (existing) {
      // Contact already exists — update their address in case they regenerated their onion
      const updated: Contact = {
        ...existing,
        role: 'client',
        onionAddress: parsed.onionAddress,
        port: parsed.port,
      }
      storage!.addContact(updated)
      p2pServer.stopReconnecting(existing.id)
      p2pServer.disconnectContact(existing.id)
      p2pServer.connectToContact(
        existing.id, parsed.onionAddress, parsed.port, parsed.publicKey, torController.socksPort
      ).catch(console.error)
      return { success: true, contact: updated }
    }

    const contactId = uuidv4()
    const contact: Contact = {
      id: contactId,
      nickname: nickname.trim() || `Peer ${contactId.slice(0, 8)}`,
      avatar: null,
      publicKey: parsed.publicKey,
      role: 'client',
      onionAddress: parsed.onionAddress,
      port: parsed.port,
      createdAt: Date.now()
    }
    storage!.addContact(contact)
    p2pServer.connectToContact(
      contactId, parsed.onionAddress, parsed.port, parsed.publicKey, torController.socksPort
    ).catch(console.error)

    return { success: true, contact }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.on('chat:typing', (_event, contactId: string, typing: boolean) => {
  p2pServer?.sendTyping(contactId, typing)
})

ipcMain.handle('chat:send', (_event, contactId: string, content: string) => {
  if (typeof contactId !== 'string' || contactId.length > 128) return { success: false, error: 'Invalid contact' }
  if (typeof content !== 'string' || content.length > 65536) return { success: false, error: 'Message too long' }
  if (!p2pServer || !storage) return { success: false, error: 'Server not initialized' }

  const id = uuidv4()
  const timestamp = Date.now()

  let text = content
  let attachment: { type: string; name: string; data: string } | undefined
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && parsed.attachment) {
      text = parsed.text ?? ''
      attachment = parsed.attachment
    }
  } catch { /* plain text */ }

  // Always persist immediately so the message appears in the chat
  storage.addMessage(contactId, { id, content: text, attachment, timestamp, direction: 'sent' })

  if (p2pServer.isConnected(contactId)) {
    p2pServer.sendMessage(contactId, content, id, timestamp)
  } else {
    // Queue for delivery when peer comes online (cap at 500 per contact)
    if (!offlineQueue.has(contactId)) offlineQueue.set(contactId, [])
    const q = offlineQueue.get(contactId)!
    if (q.length < 500) q.push({ id, content, timestamp })
  }

  return { success: true, id, timestamp }
})

ipcMain.handle('chat:messages', (_event, contactId: string) => {
  return storage?.getMessages(contactId) ?? []
})

ipcMain.handle('contacts:list', () => {
  const contacts = storage?.getContacts() ?? {}
  const connected = p2pServer?.getConnectedContactIds() ?? []
  return Object.values(contacts).map(c => ({ ...c, online: connected.includes(c.id) }))
})

ipcMain.handle('contacts:delete', (_event, contactId: string) => {
  p2pServer?.disconnectContact(contactId)
  storage?.removeContact(contactId)
  storage?.deleteContactMessages(contactId)
})

ipcMain.handle('contacts:block', (_e, contactId: string) => {
  if (!storage) return
  const contact = storage.getContacts()[contactId]
  if (contact) {
    storage.blockPublicKey(contact.publicKey)
    p2pServer?.disconnectContact(contactId)
  }
})

ipcMain.handle('contacts:unblock', (_e, contactId: string) => {
  if (!storage) return
  const contact = storage.getContacts()[contactId]
  if (contact) storage.unblockPublicKey(contact.publicKey)
})

ipcMain.handle('contacts:blocked', () => {
  return storage?.getSettings().blockedPublicKeys ?? []
})

ipcMain.handle('profile:get', () => storage?.getProfile() ?? null)
ipcMain.handle('profile:save', (_e, profile: Profile) => {
  if (!profile || typeof profile.username !== 'string') return
  profile.username = profile.username.slice(0, 64)
  if (profile.avatar !== null && typeof profile.avatar === 'string' && profile.avatar.length > 1048576) return
  storage?.saveProfile(profile)
  // Broadcast updated profile to all connected peers
  p2pServer?.broadcastProfile(profile.username, profile.avatar)
})

ipcMain.handle('settings:get', () =>
  storage?.getSettings() ?? { messageRetentionDays: null, mediaRetentionDays: null }
)
ipcMain.handle('settings:save', (_e, settings: StorageSettings) => {
  storage?.saveSettings(settings)
})

// --- IPC: Groups ---

ipcMain.handle('group:list', () => {
  if (!storage) return []
  return Object.values(storage.getGroups())
})

ipcMain.handle('group:create', (_event, name: string, memberContactIds: string[]) => {
  if (typeof name !== 'string') return { success: false, error: 'Invalid name' }
  name = name.slice(0, 64)
  if (!Array.isArray(memberContactIds) || memberContactIds.length > 100) return { success: false, error: 'Invalid members' }
  if (!storage || !p2pServer) return { success: false, error: 'Not initialized' }

  const contacts = storage.getContacts()
  const myPublicKey = p2pServer.publicKey
  const profile = storage.getProfile()
  const myNickname = profile?.username ?? 'Me'

  const members: GroupMember[] = []

  // Add self — no onion/port needed for self, use empty strings
  members.push({
    contactId: '',
    publicKey: myPublicKey,
    onionAddress: '',
    port: 0,
    nickname: myNickname,
    avatar: profile?.avatar ?? null,
  })

  for (const contactId of memberContactIds) {
    const c = contacts[contactId]
    if (!c) continue
    members.push({
      contactId: c.id,
      publicKey: c.publicKey,
      onionAddress: c.onionAddress ?? '',
      port: c.port ?? 0,
      nickname: c.nickname,
      avatar: c.avatar,
    })
  }

  const group: Group = {
    id: uuidv4(),
    name: name.trim() || 'Group',
    avatar: null,
    members,
    myContactId: '',
    createdAt: Date.now(),
    groupKey: generateGroupKey(),
  }

  storage.addGroup(group)

  // Send invite to all currently-connected members
  const allContacts = storage.getContacts()
  for (const member of group.members) {
    if (member.publicKey === myPublicKey) continue
    const contact = Object.values(allContacts).find(c => c.publicKey === member.publicKey)
    if (!contact) continue
    if (!p2pServer.isConnected(contact.id)) continue
    p2pServer.sendGroupInvite(contact.id, group)
  }

  return { success: true, group }
})

ipcMain.handle('group:add-members', (_event, groupId: string, newContactIds: string[]) => {
  if (!storage || !p2pServer) return { success: false, error: 'Not initialized' }

  const groups = storage.getGroups()
  const group = groups[groupId]
  if (!group) return { success: false, error: 'Group not found' }

  const contacts = storage.getContacts()
  const existingPubkeys = new Set(group.members.map(m => m.publicKey))
  const addedNicknames: string[] = []

  for (const contactId of newContactIds) {
    const c = contacts[contactId]
    if (!c || existingPubkeys.has(c.publicKey)) continue
    group.members.push({
      contactId: c.id,
      publicKey: c.publicKey,
      onionAddress: c.onionAddress ?? '',
      port: c.port ?? 0,
      nickname: c.nickname,
      avatar: c.avatar,
    })
    existingPubkeys.add(c.publicKey)
    addedNicknames.push(c.nickname)
  }

  storage.saveGroups(groups)

  // Post system messages for newly added members
  const profile = storage.getProfile()
  const adderName = profile?.username ?? 'Someone'
  for (const nickname of addedNicknames) {
    postSystemMessage(groupId, `${adderName} added ${nickname} to the group.`, 'member_added')
  }

  // Send the updated group invite to ALL members (including new ones) so everyone has the latest member list
  for (const member of group.members) {
    if (member.publicKey === p2pServer.publicKey) continue
    const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
    if (!contact || !p2pServer.isConnected(contact.id)) continue
    p2pServer.sendGroupInvite(contact.id, group)
  }

  return { success: true, group }
})

ipcMain.handle('group:votekick', (_event, groupId: string, targetPublicKey: string) => {
  if (!storage || !p2pServer) return { success: false, error: 'Not initialized' }
  const groups = storage.getGroups()
  const group = groups[groupId]
  if (!group) return { success: false, error: 'Group not found' }

  const myPublicKey = p2pServer.publicKey
  if (targetPublicKey === myPublicKey) return { success: false, error: 'Cannot kick yourself' }

  const profile = storage.getProfile()
  const myNickname = profile?.username ?? 'Someone'

  const voteId = uuidv4()
  kickVotes.set(voteId, { groupId, targetPublicKey, voters: new Set([myPublicKey]) })

  const target = group.members.find(m => m.publicKey === targetPublicKey)
  const targetNickname = target?.nickname ?? 'Unknown'

  // Post vote prompt embed for the initiator (they already voted Yes implicitly)
  postSystemMessage(groupId, JSON.stringify({ voteId, targetPublicKey, initiatorNickname: myNickname, targetNickname }), 'votekick_pending')

  // Check if majority already met (e.g. 2-person group where initiator is sole non-target)
  const nonTargetCount = group.members.filter(m => m.publicKey !== targetPublicKey).length
  if (nonTargetCount > 0 && 1 * 2 > nonTargetCount) {
    applyKick(voteId, groupId, targetPublicKey)
    const contacts = storage.getContacts()
    for (const member of group.members) {
      if (member.publicKey === myPublicKey || member.publicKey === targetPublicKey) continue
      const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
      if (!contact || !p2pServer.isConnected(contact.id)) continue
      p2pServer.sendGroupKick(contact.id, groupId, targetPublicKey)
    }
    return { success: true }
  }

  // Broadcast VOTE_KICK to all online group members (including target so they see the embed)
  const contacts = storage.getContacts()
  for (const member of group.members) {
    if (member.publicKey === myPublicKey) continue
    const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
    if (!contact || !p2pServer.isConnected(contact.id)) continue
    p2pServer.sendVotekick(contact.id, groupId, voteId, targetPublicKey, myPublicKey, myNickname)
  }

  return { success: true }
})

ipcMain.handle('group:vote-cast', (_event, groupId: string, voteId: string) => {
  if (!storage || !p2pServer) return { success: false, error: 'Not initialized' }
  const entry = kickVotes.get(voteId)
  if (!entry || entry.groupId !== groupId) return { success: false, error: 'Vote not found' }

  const myPublicKey = p2pServer.publicKey
  if (entry.voters.has(myPublicKey)) return { success: true } // already voted
  entry.voters.add(myPublicKey)

  const groups = storage.getGroups()
  const group = groups[groupId]
  if (!group) return { success: false, error: 'Group not found' }

  // Broadcast our vote to all online members (except target)
  const contacts = storage.getContacts()
  for (const member of group.members) {
    if (member.publicKey === myPublicKey || member.publicKey === entry.targetPublicKey) continue
    const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
    if (!contact || !p2pServer.isConnected(contact.id)) continue
    p2pServer.sendVoteCast(contact.id, groupId, voteId, myPublicKey)
  }

  const nonTargetCount = group.members.filter(m => m.publicKey !== entry.targetPublicKey).length
  if (nonTargetCount > 0 && entry.voters.size * 2 > nonTargetCount) {
    applyKick(voteId, groupId, entry.targetPublicKey)
    for (const member of group.members) {
      if (member.publicKey === myPublicKey || member.publicKey === entry.targetPublicKey) continue
      const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
      if (!contact || !p2pServer.isConnected(contact.id)) continue
      p2pServer.sendGroupKick(contact.id, groupId, entry.targetPublicKey)
    }
  }

  return { success: true }
})

ipcMain.handle('group:delete', (_event, groupId: string) => {
  if (!storage) return
  storage.removeGroup(groupId)
  storage.deleteGroupMessages(groupId)
})

ipcMain.handle('group:messages', (_event, groupId: string) => {
  return storage?.getGroupMessages(groupId) ?? []
})

ipcMain.handle('group:send', (_event, groupId: string, content: string) => {
  if (typeof groupId !== 'string' || groupId.length > 128) return { success: false, error: 'Invalid group' }
  if (typeof content !== 'string' || content.length > 65536) return { success: false, error: 'Message too long' }
  if (!storage || !p2pServer) return { success: false, error: 'Not initialized' }

  const groups = storage.getGroups()
  const group = groups[groupId]
  if (!group) return { success: false, error: 'Group not found' }

  const id = uuidv4()
  const timestamp = Date.now()
  const myPublicKey = p2pServer.publicKey
  const profile = storage.getProfile()
  const senderNickname = profile?.username ?? 'Me'

  let text = content
  let attachment: { type: string; name: string; data: string } | undefined
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && parsed.attachment) {
      text = parsed.text ?? ''
      attachment = parsed.attachment
    }
  } catch { /* plain text */ }

  const msg: GroupMessage = {
    id, groupId, senderId: myPublicKey, senderNickname,
    content: text, attachment, timestamp, direction: 'sent'
  }
  storage.addGroupMessage(groupId, msg)

  // Encrypt content for the wire using the group key
  const wireContent = group.groupKey ? encryptGroupPayload(content, group.groupKey) : content
  const wireAttachment = (attachment && group.groupKey)
    ? { ...attachment, data: encryptGroupPayload(attachment.data, group.groupKey) }
    : attachment

  // Send to all connected group members
  const contacts = storage.getContacts()
  for (const member of group.members) {
    if (member.publicKey === myPublicKey) continue
    const contact = Object.values(contacts).find(c => c.publicKey === member.publicKey)
    if (!contact) continue
    if (!p2pServer.isConnected(contact.id)) continue
    p2pServer.sendGroupMessage(
      contact.id, groupId, id, myPublicKey, senderNickname, wireContent, timestamp, wireAttachment
    )
  }

  return { success: true, id, timestamp }
})

// --- IPC: Embed metadata cache ---

ipcMain.handle('embed:cache:get', (_e, url: string) => storage?.getEmbedCacheEntry(url) ?? null)
ipcMain.handle('embed:cache:set', (_e, url: string, data: object) => { storage?.setEmbedCacheEntry(url, data as any) })

// --- IPC: Link embed metadata fetching (routed through Tor for privacy) ---

ipcMain.handle('embed:fetch', async (_event, url: string): Promise<{
  title?: string; description?: string; image?: string; siteName?: string; favicon?: string
} | null> => {
  if (!torController || torStatus.status !== 'connected') return null
  try {
    const { SocksClient } = await import('socks')
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname
    const port = parsedUrl.port ? parseInt(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80)
    const path = parsedUrl.pathname + parsedUrl.search

    const { socket } = await SocksClient.createConnection({
      proxy: { host: '127.0.0.1', port: torController.socksPort, type: 5 },
      command: 'connect',
      destination: { host: hostname, port },
      timeout: 15000
    })

    const html = await new Promise<string>((resolve, reject) => {
      let raw = ''
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error('timeout')) }, 15000)

      if (parsedUrl.protocol === 'https:') {
        const tls = require('tls')
        const tlsSocket = tls.connect({ socket, servername: hostname, rejectUnauthorized: true })
        tlsSocket.write(`GET ${path || '/'} HTTP/1.1\r\nHost: ${hostname}\r\nUser-Agent: Mozilla/5.0\r\nAccept: text/html\r\nConnection: close\r\n\r\n`)
        tlsSocket.on('data', (d: Buffer) => {
          raw += d.toString('utf8', 0, Math.min(d.length, 50000))
          if (raw.length > 100000) { clearTimeout(timeout); tlsSocket.destroy(); resolve(raw) }
        })
        tlsSocket.on('end', () => { clearTimeout(timeout); resolve(raw) })
        tlsSocket.on('error', (e: Error) => { clearTimeout(timeout); reject(e) })
      } else {
        socket.write(`GET ${path || '/'} HTTP/1.1\r\nHost: ${hostname}\r\nUser-Agent: Mozilla/5.0\r\nAccept: text/html\r\nConnection: close\r\n\r\n`)
        socket.on('data', (d: Buffer) => {
          raw += d.toString('utf8', 0, Math.min(d.length, 50000))
          if (raw.length > 100000) { clearTimeout(timeout); socket.destroy(); resolve(raw) }
        })
        socket.on('end', () => { clearTimeout(timeout); resolve(raw) })
        socket.on('error', (e: Error) => { clearTimeout(timeout); reject(e) })
      }
    })

    const body = html.split('\r\n\r\n').slice(1).join('\r\n\r\n')
    const getMeta = (prop: string): string | undefined => {
      const m = body.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
              ?? body.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))
      return m?.[1]
    }
    const getTag = (tag: string): string | undefined => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'))
      return m?.[1]?.trim()
    }
    const getFavicon = (): string | undefined => {
      const m = body.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
              ?? body.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)
      if (!m) return `${parsedUrl.protocol}//${hostname}/favicon.ico`
      const href = m[1]
      if (href.startsWith('http')) return href
      if (href.startsWith('//')) return `${parsedUrl.protocol}${href}`
      return `${parsedUrl.protocol}//${hostname}${href.startsWith('/') ? '' : '/'}${href}`
    }

    const title = getMeta('og:title') ?? getMeta('twitter:title') ?? getTag('title')
    const description = getMeta('og:description') ?? getMeta('twitter:description') ?? getMeta('description')
    const image = getMeta('og:image') ?? getMeta('twitter:image')
    const siteName = getMeta('og:site_name') ?? hostname.replace(/^www\./, '')
    const favicon = getFavicon()

    if (!title && !description) return null
    return { title, description, image, siteName, favicon }
  } catch {
    return null
  }
})

app.whenReady().then(async () => {
  app.setAppUserModelId('Acuate.chat')
  Menu.setApplicationMenu(null)

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
      },
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Auto-updater: check for updates silently after window is ready
  if (!process.env.ELECTRON_RENDERER_URL) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      sendToRenderer('update:available', { version: info.version })
    })

    autoUpdater.on('update-downloaded', (info) => {
      sendToRenderer('update:downloaded', { version: info.version })
    })

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err.message)
    })

    // Delay check so the window has time to mount
    setTimeout(() => { autoUpdater.checkForUpdates().catch(console.error) }, 5000)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  p2pServer?.stop()
  torController?.disconnect()
})
