/// <reference types="vite/client" />

declare module 'twemoji-parser' {
  export interface TwemojiEntity {
    url: string
    indices: [number, number]
    text: string
    type: string
  }
  export function parse(text: string, options?: { assetType?: 'png' | 'svg' }): TwemojiEntity[]
  export function toCodePoints(unicodeSurrogates: string): string[]
}

interface TorStatusData {
  status: 'connecting' | 'connected' | 'error'
  onionAddress: string | null
  socksPort: number
  error?: string
}

interface Contact {
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

interface Attachment {
  type: string
  name: string
  data: string
}

interface Message {
  id: string
  content: string
  attachment?: Attachment
  timestamp: number
  direction: 'sent' | 'received'
}

interface ConnectResult {
  success: boolean
  contact?: Contact
  error?: string
}

interface SendResult {
  success: boolean
  id?: string
  timestamp?: number
  error?: string
}

interface Profile {
  username: string
  avatar: string | null
}

interface AuthStatus {
  hasIdentity: boolean
}

interface AuthResult {
  success: boolean
  recoveryPhrase?: string
  error?: string
}

interface GroupMember {
  contactId: string
  publicKey: string
  onionAddress: string
  port: number
  nickname: string
  avatar: string | null
}

interface Group {
  id: string
  name: string
  avatar: string | null
  members: GroupMember[]
  myContactId: string
  createdAt: number
}

interface PendingContact {
  id: string
  nickname: string
  avatar: string | null
  publicKey: string
  requestedAt: number
}

interface GroupMessage {
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

interface Window {
  acuate: {
    getAuthStatus: () => Promise<AuthStatus>
    setupPassphrase: (passphrase: string) => Promise<AuthResult>
    unlock: (passphrase: string) => Promise<AuthResult>
    recover: (phrase: string, newPassphrase: string) => Promise<AuthResult>
    getTorStatus: () => Promise<TorStatusData>
    getInviteCode: () => Promise<string | null>
    regenOnionAddress: () => Promise<{ success: boolean; onionAddress?: string; error?: string }>
    getMyPublicKey: () => Promise<string | null>
    connect: (inviteCode: string, nickname: string) => Promise<ConnectResult>
    sendMessage: (contactId: string, content: string) => Promise<SendResult>
    getMessages: (contactId: string) => Promise<Message[]>
    listContacts: () => Promise<Contact[]>
    deleteContact: (contactId: string) => Promise<void>
    getPendingContacts: () => Promise<Record<string, PendingContact>>
    approveContact: (contactId: string) => Promise<{ success: boolean; contact?: Contact; error?: string }>
    rejectContact: (contactId: string) => Promise<void>
    onContactPending: (callback: (data: { contact: PendingContact }) => void) => () => void
    blockContact: (contactId: string) => Promise<void>
    unblockContact: (contactId: string) => Promise<void>
    getBlockedKeys: () => Promise<string[]>
    getProfile: () => Promise<Profile | null>
    saveProfile: (profile: Profile) => Promise<void>
    onChatMessage: (
      callback: (data: { contactId: string; id: string; content: string; attachment?: Attachment; timestamp: number }) => void
    ) => () => void
    onPeerConnected: (callback: (data: { contactId: string; contact?: Contact }) => void) => () => void
    onPeerDisconnected: (callback: (data: { contactId: string }) => void) => () => void
    sendTyping: (contactId: string, typing: boolean) => void
    onPeerTyping: (callback: (data: { contactId: string; typing: boolean }) => void) => () => void
    onPeerProfile: (callback: (data: { contactId: string; username: string; avatar: string | null }) => void) => () => void
    onTorStatusChange: (callback: (data: TorStatusData) => void) => () => void
    onAppReady: (callback: () => void) => () => void
    getSettings: () => Promise<{ messageRetentionDays: number | null; mediaRetentionDays: number | null; desktopNotifications: boolean; twemoji: boolean; requireApproval: boolean }>
    saveSettings: (settings: { messageRetentionDays: number | null; mediaRetentionDays: number | null; desktopNotifications: boolean; twemoji: boolean; requireApproval: boolean }) => Promise<void>
    windowMinimize: () => void
    windowMaximize: () => void
    windowClose: () => void
    listGroups: () => Promise<Group[]>
    createGroup: (name: string, memberContactIds: string[]) => Promise<{ success: boolean; group?: Group; error?: string }>
    deleteGroup: (groupId: string) => Promise<void>
    addGroupMembers: (groupId: string, newContactIds: string[]) => Promise<{ success: boolean; group?: Group; error?: string }>
    getGroupMessages: (groupId: string) => Promise<GroupMessage[]>
    sendGroupMessage: (groupId: string, content: string) => Promise<SendResult>
    onGroupMessage: (callback: (data: { groupId: string; id: string; senderId: string; senderNickname: string; content: string; attachment?: Attachment; timestamp: number; direction?: string; systemEvent?: string }) => void) => () => void
    onGroupSynced: (callback: (data: { groupId: string; count: number }) => void) => () => void
    onGroupInvited: (callback: (data: { group: Group }) => void) => () => void
    onGroupUpdated: (callback: (data: { group: Group }) => void) => () => void
    votekick: (groupId: string, targetPublicKey: string) => Promise<{ success: boolean; error?: string }>
    voteCast: (groupId: string, voteId: string) => Promise<{ success: boolean; error?: string }>
    installUpdate: () => void
    onUpdateAvailable: (callback: (data: { version: string }) => void) => () => void
    onUpdateDownloaded: (callback: (data: { version: string }) => void) => () => void
  }
}
