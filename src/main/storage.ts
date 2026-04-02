import * as fs from 'fs'
import * as path from 'path'
import { encryptData, decryptData } from './crypto'

export interface Identity {
  publicKey: string
  secretKey: string
  hiddenServiceKey: string | null
  localPort: number
}

export interface Contact {
  id: string
  nickname: string
  avatar: string | null
  publicKey: string
  role: 'client' | 'server'
  onionAddress?: string
  port?: number
  createdAt: number
}

export interface Attachment {
  type: string
  name: string
  data: string // base64 data URL — only populated in memory, never stored inline
}

export interface Message {
  id: string
  content: string
  attachment?: Attachment       // fully hydrated in memory
  attachmentId?: string         // persisted reference (= message id)
  attachmentName?: string
  attachmentType?: string
  timestamp: number
  direction: 'sent' | 'received'
}

export interface Profile {
  username: string
  avatar: string | null
}

export interface StorageSettings {
  messageRetentionDays: number | null  // null = keep forever
  mediaRetentionDays: number | null    // null = keep forever
  desktopNotifications: boolean        // default true
  twemoji: boolean                     // default true
  blockedPublicKeys: string[]          // public keys the user has blocked
  requireApproval: boolean             // default false
}

export interface PendingContact {
  id: string           // contactId (same as it would be as a Contact)
  nickname: string     // will be "Peer XXXXXXXX" initially, updated when profile arrives
  avatar: string | null
  publicKey: string
  requestedAt: number
}

export interface GroupMember {
  contactId: string      // matches a Contact.id
  publicKey: string
  onionAddress: string
  port: number
  nickname: string
  avatar: string | null
}

export interface Group {
  id: string
  name: string
  avatar: string | null
  members: GroupMember[]  // all members including self
  myContactId: string     // which contactId represents "me" in this group (empty string = creator)
  createdAt: number
}

export interface GroupMessage {
  id: string
  groupId: string
  senderId: string        // publicKey of sender
  senderNickname: string
  content: string
  attachment?: Attachment
  attachmentId?: string
  attachmentName?: string
  attachmentType?: string
  timestamp: number
  direction: 'sent' | 'received' | 'system'
  systemEvent?: string    // e.g. 'member_added', 'votekick_started', 'member_kicked'
}

export class Storage {
  private userDataPath: string
  private messagesDir: string
  private attachmentsDir: string
  private groupMessagesDir: string
  private groupAttachmentsDir: string
  private storageKey: Uint8Array | null = null

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath
    this.messagesDir = path.join(userDataPath, 'messages')
    this.attachmentsDir = path.join(userDataPath, 'attachments')
    this.groupMessagesDir = path.join(userDataPath, 'group_messages')
    this.groupAttachmentsDir = path.join(userDataPath, 'group_attachments')
    fs.mkdirSync(this.messagesDir, { recursive: true })
    fs.mkdirSync(this.attachmentsDir, { recursive: true })
    fs.mkdirSync(this.groupMessagesDir, { recursive: true })
    fs.mkdirSync(this.groupAttachmentsDir, { recursive: true })
  }

  setStorageKey(key: Uint8Array): void {
    this.storageKey = key
  }

  // --- Raw encrypted file I/O (for small single-record files) ---

  private readEncrypted<T>(filePath: string): T | null {
    try {
      if (!fs.existsSync(filePath)) return null
      const raw = fs.readFileSync(filePath, 'utf8').trim()
      if (!this.storageKey) return JSON.parse(raw) as T
      const plaintext = decryptData(raw, this.storageKey)
      if (!plaintext) return null
      return JSON.parse(plaintext) as T
    } catch {
      return null
    }
  }

  private writeEncrypted(filePath: string, data: unknown): void {
    const json = JSON.stringify(data)
    if (!this.storageKey) {
      fs.writeFileSync(filePath, json, 'utf8')
      return
    }
    const encrypted = encryptData(json, this.storageKey)
    fs.writeFileSync(filePath, encrypted, 'utf8')
  }

  // --- Append-only log helpers ---

  private logFilePath(contactId: string): string {
    return path.join(this.messagesDir, `${contactId}.log.enc`)
  }

  private attachmentFilePath(contactId: string, msgId: string): string {
    const dir = path.join(this.attachmentsDir, contactId)
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, `${msgId}.enc`)
  }

  // Read all persisted (non-hydrated) messages from a contact's log
  private readLog(contactId: string): Omit<Message, 'attachment'>[] {
    const filePath = this.logFilePath(contactId)
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf8')
    const results: Omit<Message, 'attachment'>[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        let plaintext: string | null
        if (this.storageKey) {
          plaintext = decryptData(trimmed, this.storageKey)
        } else {
          plaintext = Buffer.from(trimmed, 'base64').toString('utf8')
        }
        if (!plaintext) continue
        const msg = JSON.parse(plaintext) as Omit<Message, 'attachment'>
        results.push(msg)
      } catch {
        // skip corrupt/partial line
      }
    }
    return results
  }

  // Rewrite the log from a set of messages (used when pruning)
  private writeLog(contactId: string, messages: Omit<Message, 'attachment'>[]): void {
    const filePath = this.logFilePath(contactId)
    if (messages.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return
    }
    const lines = messages.map(msg => {
      const json = JSON.stringify(msg)
      return this.storageKey ? encryptData(json, this.storageKey) : Buffer.from(json).toString('base64')
    })
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
  }

  // --- Contacts ---

  getContacts(): Record<string, Contact> {
    return this.readEncrypted<Record<string, Contact>>(
      path.join(this.userDataPath, 'contacts.enc')
    ) ?? {}
  }

  saveContacts(contacts: Record<string, Contact>): void {
    this.writeEncrypted(path.join(this.userDataPath, 'contacts.enc'), contacts)
  }

  addContact(contact: Contact): void {
    const contacts = this.getContacts()
    contacts[contact.id] = contact
    this.saveContacts(contacts)
  }

  removeContact(contactId: string): void {
    const contacts = this.getContacts()
    delete contacts[contactId]
    this.saveContacts(contacts)
  }

  // --- Pending contacts ---

  getPendingContacts(): Record<string, PendingContact> {
    return this.readEncrypted<Record<string, PendingContact>>(
      path.join(this.userDataPath, 'pending.enc')
    ) ?? {}
  }

  savePendingContacts(pending: Record<string, PendingContact>): void {
    this.writeEncrypted(path.join(this.userDataPath, 'pending.enc'), pending)
  }

  addPendingContact(contact: PendingContact): void {
    const pending = this.getPendingContacts()
    pending[contact.id] = contact
    this.savePendingContacts(pending)
  }

  removePendingContact(contactId: string): void {
    const pending = this.getPendingContacts()
    delete pending[contactId]
    this.savePendingContacts(pending)
  }

  // --- Messages (append-only log + separate attachment files) ---

  getMessages(contactId: string): Message[] {
    const persisted = this.readLog(contactId)
    return persisted.map(msg => {
      if (!msg.attachmentId) return msg as Message
      const data = this.getAttachment(contactId, msg.attachmentId)
      if (!data) return msg as Message
      return {
        ...msg,
        attachment: {
          type: msg.attachmentType ?? 'application/octet-stream',
          name: msg.attachmentName ?? msg.attachmentId,
          data,
        }
      } as Message
    })
  }

  addMessage(contactId: string, message: Message): void {
    // Store attachment separately, keep only metadata in the log
    const persistedMsg: Omit<Message, 'attachment'> = {
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      direction: message.direction,
    }

    if (message.attachment) {
      const attachPath = this.attachmentFilePath(contactId, message.id)
      const dataJson = JSON.stringify(message.attachment.data)
      const encrypted = this.storageKey
        ? encryptData(dataJson, this.storageKey)
        : Buffer.from(dataJson).toString('base64')
      fs.writeFileSync(attachPath, encrypted, 'utf8')
      persistedMsg.attachmentId = message.id
      persistedMsg.attachmentName = message.attachment.name
      persistedMsg.attachmentType = message.attachment.type
    } else if (message.attachmentId) {
      // Already stripped (e.g. from migration) — carry the reference fields through
      persistedMsg.attachmentId = message.attachmentId
      persistedMsg.attachmentName = message.attachmentName
      persistedMsg.attachmentType = message.attachmentType
    }

    const json = JSON.stringify(persistedMsg)
    const line = this.storageKey
      ? encryptData(json, this.storageKey)
      : Buffer.from(json).toString('base64')
    fs.appendFileSync(this.logFilePath(contactId), line + '\n', 'utf8')
  }

  getAttachment(contactId: string, msgId: string): string | null {
    try {
      const filePath = path.join(this.attachmentsDir, contactId, `${msgId}.enc`)
      if (!fs.existsSync(filePath)) return null
      const raw = fs.readFileSync(filePath, 'utf8').trim()
      let dataJson: string | null
      if (this.storageKey) {
        dataJson = decryptData(raw, this.storageKey)
      } else {
        dataJson = Buffer.from(raw, 'base64').toString('utf8')
      }
      if (!dataJson) return null
      return JSON.parse(dataJson) as string
    } catch {
      return null
    }
  }

  deleteContactMessages(contactId: string): void {
    const logPath = this.logFilePath(contactId)
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath)
    const attachDir = path.join(this.attachmentsDir, contactId)
    if (fs.existsSync(attachDir)) {
      fs.rmSync(attachDir, { recursive: true, force: true })
    }
  }

  // --- Settings ---

  getSettings(): StorageSettings {
    const saved = this.readEncrypted<Partial<StorageSettings>>(
      path.join(this.userDataPath, 'settings.enc')
    ) ?? {}
    return {
      messageRetentionDays: saved.messageRetentionDays ?? null,
      mediaRetentionDays: saved.mediaRetentionDays ?? null,
      desktopNotifications: saved.desktopNotifications ?? true,
      twemoji: saved.twemoji ?? true,
      blockedPublicKeys: saved.blockedPublicKeys ?? [],
      requireApproval: saved.requireApproval ?? false,
    }
  }

  isBlocked(publicKey: string): boolean {
    return this.getSettings().blockedPublicKeys.includes(publicKey)
  }

  blockPublicKey(publicKey: string): void {
    const settings = this.getSettings()
    if (!settings.blockedPublicKeys.includes(publicKey)) {
      settings.blockedPublicKeys.push(publicKey)
      this.saveSettings(settings)
    }
  }

  unblockPublicKey(publicKey: string): void {
    const settings = this.getSettings()
    settings.blockedPublicKeys = settings.blockedPublicKeys.filter(k => k !== publicKey)
    this.saveSettings(settings)
  }

  saveSettings(settings: StorageSettings): void {
    this.writeEncrypted(path.join(this.userDataPath, 'settings.enc'), settings)
  }

  // --- Retention pruning ---

  pruneExpired(): void {
    const settings = this.getSettings()
    const now = Date.now()
    const msgCutoff = settings.messageRetentionDays !== null
      ? now - settings.messageRetentionDays * 86400000
      : null
    const mediaCutoff = settings.mediaRetentionDays !== null
      ? now - settings.mediaRetentionDays * 86400000
      : null

    if (msgCutoff === null && mediaCutoff === null) return

    let entries: string[] = []
    try { entries = fs.readdirSync(this.messagesDir) } catch { return }

    for (const entry of entries) {
      if (!entry.endsWith('.log.enc')) continue
      const contactId = entry.slice(0, -'.log.enc'.length)
      const messages = this.readLog(contactId)

      // Determine which messages survive message retention
      const surviving = msgCutoff !== null
        ? messages.filter(m => m.timestamp >= msgCutoff)
        : messages

      // Determine which attachment IDs survive media retention
      const survivingAttachIds = new Set(
        surviving
          .filter(m => m.attachmentId && (mediaCutoff === null || m.timestamp >= mediaCutoff))
          .map(m => m.attachmentId as string)
      )

      // Rewrite log if any messages were dropped
      if (surviving.length !== messages.length) {
        this.writeLog(contactId, surviving)
      }

      // Delete expired attachment files
      const attachDir = path.join(this.attachmentsDir, contactId)
      if (!fs.existsSync(attachDir)) continue
      try {
        for (const file of fs.readdirSync(attachDir)) {
          const msgId = file.endsWith('.enc') ? file.slice(0, -4) : file
          if (!survivingAttachIds.has(msgId)) {
            fs.unlinkSync(path.join(attachDir, file))
          }
        }
      } catch { /* ignore */ }
    }
  }

  // --- Profile ---

  getProfile(): Profile | null {
    return this.readEncrypted<Profile>(path.join(this.userDataPath, 'profile.enc'))
  }

  saveProfile(profile: Profile): void {
    this.writeEncrypted(path.join(this.userDataPath, 'profile.enc'), profile)
  }

  // --- Groups ---

  getGroups(): Record<string, Group> {
    return this.readEncrypted<Record<string, Group>>(
      path.join(this.userDataPath, 'groups.enc')
    ) ?? {}
  }

  saveGroups(groups: Record<string, Group>): void {
    this.writeEncrypted(path.join(this.userDataPath, 'groups.enc'), groups)
  }

  addGroup(group: Group): void {
    const groups = this.getGroups()
    groups[group.id] = group
    this.saveGroups(groups)
  }

  removeGroup(groupId: string): void {
    const groups = this.getGroups()
    delete groups[groupId]
    this.saveGroups(groups)
  }

  // --- Group messages (append-only log, same pattern as DM messages) ---

  private groupLogFilePath(groupId: string): string {
    return path.join(this.groupMessagesDir, `${groupId}.log.enc`)
  }

  private groupAttachmentFilePath(groupId: string, msgId: string): string {
    const dir = path.join(this.groupAttachmentsDir, groupId)
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, `${msgId}.enc`)
  }

  private readGroupLog(groupId: string): Omit<GroupMessage, 'attachment'>[] {
    const filePath = this.groupLogFilePath(groupId)
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf8')
    const results: Omit<GroupMessage, 'attachment'>[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        let plaintext: string | null
        if (this.storageKey) {
          plaintext = decryptData(trimmed, this.storageKey)
        } else {
          plaintext = Buffer.from(trimmed, 'base64').toString('utf8')
        }
        if (!plaintext) continue
        const msg = JSON.parse(plaintext) as Omit<GroupMessage, 'attachment'>
        results.push(msg)
      } catch {
        // skip corrupt/partial line
      }
    }
    return results
  }

  getGroupMessages(groupId: string): GroupMessage[] {
    const persisted = this.readGroupLog(groupId)
    return persisted.map(msg => {
      if (!msg.attachmentId) return msg as GroupMessage
      const data = this.getGroupAttachment(groupId, msg.attachmentId)
      if (!data) return msg as GroupMessage
      return {
        ...msg,
        attachment: {
          type: msg.attachmentType ?? 'application/octet-stream',
          name: msg.attachmentName ?? msg.attachmentId,
          data,
        }
      } as GroupMessage
    })
  }

  addGroupMessage(groupId: string, message: GroupMessage): void {
    const persistedMsg: Omit<GroupMessage, 'attachment'> = {
      id: message.id,
      groupId: message.groupId,
      senderId: message.senderId,
      senderNickname: message.senderNickname,
      content: message.content,
      timestamp: message.timestamp,
      direction: message.direction,
    }

    if (message.attachment) {
      const attachPath = this.groupAttachmentFilePath(groupId, message.id)
      const dataJson = JSON.stringify(message.attachment.data)
      const encrypted = this.storageKey
        ? encryptData(dataJson, this.storageKey)
        : Buffer.from(dataJson).toString('base64')
      fs.writeFileSync(attachPath, encrypted, 'utf8')
      persistedMsg.attachmentId = message.id
      persistedMsg.attachmentName = message.attachment.name
      persistedMsg.attachmentType = message.attachment.type
    } else if (message.attachmentId) {
      persistedMsg.attachmentId = message.attachmentId
      persistedMsg.attachmentName = message.attachmentName
      persistedMsg.attachmentType = message.attachmentType
    }

    const json = JSON.stringify(persistedMsg)
    const line = this.storageKey
      ? encryptData(json, this.storageKey)
      : Buffer.from(json).toString('base64')
    fs.appendFileSync(this.groupLogFilePath(groupId), line + '\n', 'utf8')
  }

  getGroupAttachment(groupId: string, msgId: string): string | null {
    try {
      const filePath = path.join(this.groupAttachmentsDir, groupId, `${msgId}.enc`)
      if (!fs.existsSync(filePath)) return null
      const raw = fs.readFileSync(filePath, 'utf8').trim()
      let dataJson: string | null
      if (this.storageKey) {
        dataJson = decryptData(raw, this.storageKey)
      } else {
        dataJson = Buffer.from(raw, 'base64').toString('utf8')
      }
      if (!dataJson) return null
      return JSON.parse(dataJson) as string
    } catch {
      return null
    }
  }

  deleteGroupMessages(groupId: string): void {
    const logPath = this.groupLogFilePath(groupId)
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath)
    const attachDir = path.join(this.groupAttachmentsDir, groupId)
    if (fs.existsSync(attachDir)) {
      fs.rmSync(attachDir, { recursive: true, force: true })
    }
  }

  // Check if a group message with this id already exists (for dedup on sync)
  groupMessageExists(groupId: string, msgId: string): boolean {
    const messages = this.readGroupLog(groupId)
    return messages.some(m => m.id === msgId)
  }

  // --- Migration ---

  migrateLegacyFiles(): void {
    // Remove old plaintext files
    for (const f of [
      path.join(this.userDataPath, 'contacts.json'),
      path.join(this.userDataPath, 'profile.json'),
    ]) {
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }
    try {
      for (const entry of fs.readdirSync(this.messagesDir)) {
        if (entry.endsWith('.json')) {
          fs.unlinkSync(path.join(this.messagesDir, entry))
        }
      }
    } catch { /* ignore */ }

    // Migrate old single-file message arrays (.enc) to append-only log (.log.enc)
    try {
      for (const entry of fs.readdirSync(this.messagesDir)) {
        if (!entry.endsWith('.enc') || entry.endsWith('.log.enc')) continue
        const contactId = entry.slice(0, -4)
        const oldPath = path.join(this.messagesDir, entry)
        const newPath = this.logFilePath(contactId)

        // If a log already exists for this contact, just remove the old file
        if (fs.existsSync(newPath)) {
          fs.unlinkSync(oldPath)
          continue
        }

        const messages = this.readEncrypted<Message[]>(oldPath)
        if (messages && messages.length > 0) {
          for (const msg of messages) {
            this.addMessage(contactId, msg)
          }
        }
        fs.unlinkSync(oldPath)
      }
    } catch { /* ignore migration errors */ }
  }
}
