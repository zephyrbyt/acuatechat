import { contextBridge, ipcRenderer } from 'electron'

// Buffer peer:connected events that arrive before the renderer subscribes
const peerConnectedBuffer: Array<{ contactId: string; contact?: Contact }> = []
let peerConnectedCallback: ((data: { contactId: string; contact?: Contact }) => void) | null = null
ipcRenderer.on('peer:connected', (_event, data: { contactId: string; contact?: Contact }) => {
  if (peerConnectedCallback) {
    peerConnectedCallback(data)
  } else {
    peerConnectedBuffer.push(data)
  }
})

export interface TorStatusData {
  status: 'connecting' | 'connected' | 'error'
  onionAddress: string | null
  socksPort: number
  error?: string
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
  online?: boolean
}

export interface Attachment {
  type: string
  name: string
  data: string
}

export interface Message {
  id: string
  content: string
  attachment?: Attachment
  timestamp: number
  direction: 'sent' | 'received'
}

export interface ConnectResult {
  success: boolean
  contact?: Contact
  error?: string
}

export interface SendResult {
  success: boolean
  id?: string
  timestamp?: number
  error?: string
}

export interface Profile {
  username: string
  avatar: string | null
}

export interface AuthStatus {
  hasIdentity: boolean
}

export interface AuthResult {
  success: boolean
  recoveryPhrase?: string
  error?: string
}

export interface GroupMember {
  contactId: string
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
  members: GroupMember[]
  myContactId: string
  createdAt: number
}

export interface PendingContact {
  id: string
  nickname: string
  avatar: string | null
  publicKey: string
  requestedAt: number
}

export interface GroupMessage {
  id: string
  groupId: string
  senderId: string
  senderNickname: string
  content: string
  attachment?: Attachment
  timestamp: number
  direction: 'sent' | 'received' | 'system'
  systemEvent?: string
}

const api = {
  // Auth / unlock
  getAuthStatus: (): Promise<AuthStatus> =>
    ipcRenderer.invoke('auth:status'),

  setupPassphrase: (passphrase: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:setup', passphrase),

  unlock: (passphrase: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:unlock', passphrase),

  recover: (phrase: string, newPassphrase: string): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:recover', phrase, newPassphrase),

  // Invoke (renderer -> main)
  getTorStatus: (): Promise<TorStatusData> =>
    ipcRenderer.invoke('tor:status'),

  getInviteCode: (): Promise<string | null> =>
    ipcRenderer.invoke('identity:invite-code'),

  regenOnionAddress: (): Promise<{ success: boolean; onionAddress?: string; error?: string }> =>
    ipcRenderer.invoke('identity:regen-onion'),

  getMyPublicKey: (): Promise<string | null> =>
    ipcRenderer.invoke('identity:pubkey'),

  connect: (inviteCode: string, nickname: string): Promise<ConnectResult> =>
    ipcRenderer.invoke('chat:connect', inviteCode, nickname),

  sendMessage: (contactId: string, content: string): Promise<SendResult> =>
    ipcRenderer.invoke('chat:send', contactId, content),

  getMessages: (contactId: string): Promise<Message[]> =>
    ipcRenderer.invoke('chat:messages', contactId),

  listContacts: (): Promise<Contact[]> =>
    ipcRenderer.invoke('contacts:list'),

  deleteContact: (contactId: string): Promise<void> =>
    ipcRenderer.invoke('contacts:delete', contactId),

  getPendingContacts: (): Promise<Record<string, PendingContact>> =>
    ipcRenderer.invoke('contacts:pending'),

  approveContact: (contactId: string): Promise<{ success: boolean; contact?: Contact; error?: string }> =>
    ipcRenderer.invoke('contacts:approve', contactId),

  rejectContact: (contactId: string): Promise<void> =>
    ipcRenderer.invoke('contacts:reject', contactId),

  onContactPending: (callback: (data: { contact: PendingContact }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { contact: PendingContact }) => callback(data)
    ipcRenderer.on('contact:pending', listener)
    return () => ipcRenderer.removeListener('contact:pending', listener)
  },

  blockContact: (contactId: string): Promise<void> =>
    ipcRenderer.invoke('contacts:block', contactId),

  unblockContact: (contactId: string): Promise<void> =>
    ipcRenderer.invoke('contacts:unblock', contactId),

  getBlockedKeys: (): Promise<string[]> =>
    ipcRenderer.invoke('contacts:blocked'),

  getProfile: (): Promise<Profile | null> =>
    ipcRenderer.invoke('profile:get'),

  saveProfile: (profile: Profile): Promise<void> =>
    ipcRenderer.invoke('profile:save', profile),

  getSettings: (): Promise<{ messageRetentionDays: number | null; mediaRetentionDays: number | null; desktopNotifications: boolean; twemoji: boolean; requireApproval: boolean }> =>
    ipcRenderer.invoke('settings:get'),

  saveSettings: (settings: { messageRetentionDays: number | null; mediaRetentionDays: number | null; desktopNotifications: boolean; twemoji: boolean; requireApproval: boolean }): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),

  // Listen (main -> renderer)
  onChatMessage: (
    callback: (data: { contactId: string; id: string; content: string; attachment?: Attachment; timestamp: number }) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { contactId: string; id: string; content: string; attachment?: Attachment; timestamp: number }) => callback(data)
    ipcRenderer.on('chat:message', listener)
    return () => ipcRenderer.removeListener('chat:message', listener)
  },

  onPeerConnected: (callback: (data: { contactId: string; contact?: Contact }) => void) => {
    peerConnectedCallback = callback
    // Flush any events that arrived before the renderer subscribed
    const buffered = peerConnectedBuffer.splice(0)
    for (const data of buffered) callback(data)
    return () => { peerConnectedCallback = null }
  },

  onPeerDisconnected: (callback: (data: { contactId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { contactId: string }) => callback(data)
    ipcRenderer.on('peer:disconnected', listener)
    return () => ipcRenderer.removeListener('peer:disconnected', listener)
  },

  sendTyping: (contactId: string, typing: boolean): void =>
    ipcRenderer.send('chat:typing', contactId, typing),

  onPeerTyping: (callback: (data: { contactId: string; typing: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { contactId: string; typing: boolean }) => callback(data)
    ipcRenderer.on('peer:typing', listener)
    return () => ipcRenderer.removeListener('peer:typing', listener)
  },

  onPeerProfile: (callback: (data: { contactId: string; username: string; avatar: string | null }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { contactId: string; username: string; avatar: string | null }) => callback(data)
    ipcRenderer.on('peer:profile', listener)
    return () => ipcRenderer.removeListener('peer:profile', listener)
  },

  onTorStatusChange: (callback: (data: TorStatusData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: TorStatusData) => callback(data)
    ipcRenderer.on('tor:status-change', listener)
    return () => ipcRenderer.removeListener('tor:status-change', listener)
  },

  onAppReady: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('app:ready', listener)
    return () => ipcRenderer.removeListener('app:ready', listener)
  },

  // Window controls
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),

  // Auto-updater
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdateAvailable: (callback: (data: { version: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.removeListener('update:available', listener)
  },
  onUpdateDownloaded: (callback: (data: { version: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data)
    ipcRenderer.on('update:downloaded', listener)
    return () => ipcRenderer.removeListener('update:downloaded', listener)
  },

  // Groups
  listGroups: (): Promise<Group[]> =>
    ipcRenderer.invoke('group:list'),

  createGroup: (name: string, memberContactIds: string[]): Promise<{ success: boolean; group?: Group; error?: string }> =>
    ipcRenderer.invoke('group:create', name, memberContactIds),

  deleteGroup: (groupId: string): Promise<void> =>
    ipcRenderer.invoke('group:delete', groupId),

  addGroupMembers: (groupId: string, newContactIds: string[]): Promise<{ success: boolean; group?: Group; error?: string }> =>
    ipcRenderer.invoke('group:add-members', groupId, newContactIds),

  votekick: (groupId: string, targetPublicKey: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('group:votekick', groupId, targetPublicKey),

  voteCast: (groupId: string, voteId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('group:vote-cast', groupId, voteId),

  getGroupMessages: (groupId: string): Promise<GroupMessage[]> =>
    ipcRenderer.invoke('group:messages', groupId),

  sendGroupMessage: (groupId: string, content: string): Promise<SendResult> =>
    ipcRenderer.invoke('group:send', groupId, content),

  onGroupMessage: (
    callback: (data: { groupId: string; id: string; senderId: string; senderNickname: string; content: string; attachment?: Attachment; timestamp: number; direction?: string; systemEvent?: string }) => void
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { groupId: string; id: string; senderId: string; senderNickname: string; content: string; attachment?: Attachment; timestamp: number; direction?: string; systemEvent?: string }) => callback(data)
    ipcRenderer.on('group:message', listener)
    return () => ipcRenderer.removeListener('group:message', listener)
  },

  onGroupSynced: (callback: (data: { groupId: string; count: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { groupId: string; count: number }) => callback(data)
    ipcRenderer.on('group:synced', listener)
    return () => ipcRenderer.removeListener('group:synced', listener)
  },

  onGroupInvited: (callback: (data: { group: Group }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { group: Group }) => callback(data)
    ipcRenderer.on('group:invited', listener)
    return () => ipcRenderer.removeListener('group:invited', listener)
  },

  onGroupUpdated: (callback: (data: { group: Group }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { group: Group }) => callback(data)
    ipcRenderer.on('group:updated', listener)
    return () => ipcRenderer.removeListener('group:updated', listener)
  },
}

contextBridge.exposeInMainWorld('acuate', api)

declare global {
  interface Window {
    acuate: typeof api
  }
}
