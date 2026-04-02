import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Box, Flex, Text, HStack } from '@chakra-ui/react'
import { LuDownload, LuRefreshCw } from 'react-icons/lu'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { GroupChatView } from './components/GroupChatView'
import { CreateGroupModal } from './components/CreateGroupModal'
import { TorStatusBar } from './components/TorStatusBar'
import { InviteModal } from './components/InviteModal'
import { ConnectModal } from './components/ConnectModal'
import { Onboarding } from './components/Onboarding'
import { LockScreen } from './components/LockScreen'
import { RecoveryPhraseModal } from './components/RecoveryPhraseModal'
import { TitleBar } from './components/TitleBar'
import { SettingsView } from './components/SettingsView'

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
  type: 'image/png' | 'image/jpeg' | 'image/gif' | 'video/mp4'
  name: string
  data: string // base64 data URL
}

export interface Message {
  id: string
  content: string
  attachment?: Attachment
  timestamp: number
  direction: 'sent' | 'received'
}

export interface TorStatusData {
  status: 'connecting' | 'connected' | 'error'
  onionAddress: string | null
  socksPort: number
  error?: string
}

export interface UserProfile {
  username: string
  avatar: string | null
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

type AppPhase = 'checking' | 'setup' | 'locked' | 'ready'

export default function App(): React.ReactElement | null {
  const [phase, setPhase] = useState<AppPhase>('checking')
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [torStatus, setTorStatus] = useState<TorStatusData>({
    status: 'connecting',
    onionAddress: null,
    socksPort: 9150
  })
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [typingContacts, setTypingContacts] = useState<Record<string, boolean>>({})
  const [useTwemoji, setUseTwemoji] = useState(true)
  const [myPublicKey, setMyPublicKey] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupMessages, setGroupMessages] = useState<Record<string, GroupMessage[]>>({})
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [groupUnreadCounts, setGroupUnreadCounts] = useState<Record<string, number>>({})
  const [updateState, setUpdateState] = useState<'idle' | 'available' | 'downloaded'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [blockedKeys, setBlockedKeys] = useState<string[]>([])
  const [pendingContacts, setPendingContacts] = useState<Record<string, PendingContact>>({})
  // contactId -> set of message IDs that are queued (sent offline, not yet delivered)
  const [queuedMessageIds, setQueuedMessageIds] = useState<Record<string, Set<string>>>({})

  // Refs so the effect doesn't need these as dependencies (avoids tearing down listeners on every selection change)
  const selectedContactIdRef = useRef(selectedContactId)
  const selectedGroupIdRef = useRef(selectedGroupId)
  useEffect(() => { selectedContactIdRef.current = selectedContactId }, [selectedContactId])
  useEffect(() => { selectedGroupIdRef.current = selectedGroupId }, [selectedGroupId])

  const refreshContacts = useCallback(async () => {
    const list = await window.acuate.listContacts()
    setContacts(list as Contact[])
  }, [])

  const refreshGroups = useCallback(async () => {
    const list = await window.acuate.listGroups()
    setGroups(list as Group[])
  }, [])

  const loadMessages = useCallback(async (contactId: string) => {
    const msgs = await window.acuate.getMessages(contactId)
    setMessages(prev => ({ ...prev, [contactId]: msgs as Message[] }))
  }, [])

  const loadGroupMessages = useCallback(async (groupId: string) => {
    const msgs = await window.acuate.getGroupMessages(groupId)
    setGroupMessages(prev => ({ ...prev, [groupId]: msgs as GroupMessage[] }))
  }, [])

  // Check auth state on mount
  useEffect(() => {
    window.acuate.getAuthStatus().then(({ hasIdentity }) => {
      setPhase(hasIdentity ? 'locked' : 'setup')
    })
  }, [])

  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null)

  // Called by LockScreen after successful unlock/setup IPC (which already awaits initializeApp)
  const handleUnlocked = useCallback((phrase?: string) => {
    if (phrase) setRecoveryPhrase(phrase)
    setPhase('ready')
    window.acuate.getProfile().then(p => setProfile(p as UserProfile | null))
    window.acuate.getTorStatus().then(status => setTorStatus(status as TorStatusData))
    window.acuate.getSettings().then(s => setUseTwemoji(s.twemoji))
    window.acuate.getMyPublicKey().then(k => setMyPublicKey(k))
    window.acuate.getBlockedKeys().then(keys => setBlockedKeys(keys))
    window.acuate.getPendingContacts().then(p => setPendingContacts(p))
    refreshContacts()
    refreshGroups()
  }, [refreshContacts, refreshGroups])

  useEffect(() => {
    if (phase !== 'ready') return

    // Re-poll once after a short delay to catch any connections that completed
    // before listeners were registered, then poll periodically to stay in sync
    const initialPoll = setTimeout(() => refreshContacts(), 500)
    const periodicPoll = setInterval(() => refreshContacts(), 2000)

    const removeTorListener = window.acuate.onTorStatusChange((data) => {
      setTorStatus(data as TorStatusData)
    })

    const removeMsgListener = window.acuate.onChatMessage((data) => {
      const { contactId, id, content, attachment, timestamp } = data
      const newMsg: Message = { id, content, attachment: attachment as Attachment | undefined, timestamp, direction: 'received' }
      setMessages(prev => ({
        ...prev,
        [contactId]: [...(prev[contactId] ?? []), newMsg]
      }))
      setUnreadCounts(prev => ({
        ...prev,
        [contactId]: selectedContactIdRef.current === contactId ? 0 : (prev[contactId] ?? 0) + 1
      }))
      // If this contact isn't in our list yet (peer:connected was missed), refresh now
      setContacts(prev => {
        const known = prev.some(c => c.id === contactId)
        if (!known) setTimeout(() => refreshContacts(), 0)
        return prev
      })
    })

    const removePeerConnected = window.acuate.onPeerConnected(({ contactId, contact }) => {
      // Clear queued indicator — messages are now delivered
      setQueuedMessageIds(prev => {
        if (!prev[contactId]) return prev
        const next = { ...prev }
        delete next[contactId]
        return next
      })
      // If the event includes a new contact, add it to state immediately so the
      // UI updates without waiting for the async refreshContacts() round-trip
      if (contact) {
        setContacts(prev => {
          if (prev.some(c => c.id === contactId)) return prev
          return [...prev, { ...contact, online: true }]
        })
      }
      // Still refresh to get accurate online status from p2pServer,
      // and again after profile exchange completes (~500ms)
      refreshContacts()
      setTimeout(() => refreshContacts(), 600)
    })

    const removePeerDisconnected = window.acuate.onPeerDisconnected(({ contactId }) => {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, online: false } : c))
    })

    const removePeerProfile = window.acuate.onPeerProfile(({ contactId, username, avatar }) => {
      setContacts(prev => {
        if (prev.some(c => c.id === contactId)) {
          return prev.map(c => c.id === contactId ? { ...c, nickname: username, avatar } : c)
        }
        return prev
      })
      // If contact wasn't in state yet (profile arrived before peer:connected was processed),
      // refresh to pick them up
      refreshContacts()
    })

    const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {}
    const removePeerTyping = window.acuate.onPeerTyping(({ contactId, typing }) => {
      setTypingContacts(prev => ({ ...prev, [contactId]: typing }))
      // Auto-clear after 4s in case the stop event is missed
      if (typing) {
        clearTimeout(typingTimers[contactId])
        typingTimers[contactId] = setTimeout(() => {
          setTypingContacts(prev => ({ ...prev, [contactId]: false }))
        }, 4000)
      } else {
        clearTimeout(typingTimers[contactId])
      }
    })

    const removeGroupMessage = window.acuate.onGroupMessage((data) => {
      const { groupId, id, senderId, senderNickname, content, attachment, timestamp, direction, systemEvent } = data
      const isSystem = direction === 'system'
      const newMsg: GroupMessage = {
        id, groupId, senderId, senderNickname, content,
        attachment: attachment as Attachment | undefined, timestamp,
        direction: isSystem ? 'system' : 'received',
        systemEvent,
      }
      setGroupMessages(prev => ({
        ...prev,
        [groupId]: [...(prev[groupId] ?? []), newMsg]
      }))
      if (!isSystem) {
        setGroupUnreadCounts(prev => ({
          ...prev,
          [groupId]: selectedGroupId === groupId ? 0 : (prev[groupId] ?? 0) + 1
        }))
      }
    })

    const removeGroupSynced = window.acuate.onGroupSynced(({ groupId }) => {
      loadGroupMessages(groupId)
    })

    const removeGroupInvited = window.acuate.onGroupInvited(({ group }) => {
      setGroups(prev => prev.some(g => g.id === group.id) ? prev : [...prev, group as Group])
    })

    const removeGroupUpdated = window.acuate.onGroupUpdated(({ group }) => {
      setGroups(prev => prev.map(g => g.id === group.id ? group as Group : g))
    })

    const removeUpdateAvailable = window.acuate.onUpdateAvailable(({ version }) => {
      setUpdateVersion(version)
      setUpdateState('available')
    })

    const removeUpdateDownloaded = window.acuate.onUpdateDownloaded(({ version }) => {
      setUpdateVersion(version)
      setUpdateState('downloaded')
    })

    const removePendingListener = window.acuate.onContactPending((data) => {
      setPendingContacts(prev => ({ ...prev, [data.contact.id]: data.contact }))
    })

    return () => {
      clearTimeout(initialPoll)
      clearInterval(periodicPoll)
      Object.values(typingTimers).forEach(clearTimeout)
      removeTorListener()
      removeMsgListener()
      removePeerConnected()
      removePeerDisconnected()
      removePeerProfile()
      removePeerTyping()
      removeGroupMessage()
      removeGroupSynced()
      removeGroupInvited()
      removeGroupUpdated()
      removeUpdateAvailable()
      removeUpdateDownloaded()
      removePendingListener()
    }
  }, [phase, refreshContacts, loadGroupMessages])

  const handleSelectContact = useCallback(async (contactId: string) => {
    setSelectedContactId(contactId)
    setUnreadCounts(prev => ({ ...prev, [contactId]: 0 }))
    if (!messages[contactId]) {
      await loadMessages(contactId)
    }
  }, [messages, loadMessages])

  const handleSendMessage = useCallback(async (content: string, attachment?: Attachment) => {
    if (!selectedContactId) return
    const payload = attachment ? JSON.stringify({ text: content, attachment }) : content
    const result = await window.acuate.sendMessage(selectedContactId, payload)
    if (result.success && result.id && result.timestamp) {
      const newMsg: Message = {
        id: result.id,
        content,
        attachment,
        timestamp: result.timestamp,
        direction: 'sent'
      }
      setMessages(prev => ({
        ...prev,
        [selectedContactId]: [...(prev[selectedContactId] ?? []), newMsg]
      }))
      // If contact is offline, mark message as queued
      const isOnline = contacts.find(c => c.id === selectedContactId)?.online ?? false
      if (!isOnline) {
        setQueuedMessageIds(prev => {
          const existing = new Set(prev[selectedContactId])
          existing.add(result.id!)
          return { ...prev, [selectedContactId]: existing }
        })
      }
    }
  }, [selectedContactId, contacts])

  const handleSelectGroup = useCallback(async (groupId: string) => {
    setSelectedGroupId(groupId)
    setSelectedContactId(null)
    setGroupUnreadCounts(prev => ({ ...prev, [groupId]: 0 }))
    if (!groupMessages[groupId]) {
      await loadGroupMessages(groupId)
    }
  }, [groupMessages, loadGroupMessages])

  const handleSendGroupMessage = useCallback(async (content: string, attachment?: Attachment) => {
    if (!selectedGroupId) return
    const payload = attachment ? JSON.stringify({ text: content, attachment }) : content
    const result = await window.acuate.sendGroupMessage(selectedGroupId, payload)
    if (result.success && result.id && result.timestamp) {
      // Get our public key from the group member list
      const group = groups.find(g => g.id === selectedGroupId)
      const mySelf = group?.members.find(m => m.contactId === group.myContactId)
      const newMsg: GroupMessage = {
        id: result.id,
        groupId: selectedGroupId,
        senderId: mySelf?.publicKey ?? '',
        senderNickname: profile?.username ?? 'Me',
        content,
        attachment,
        timestamp: result.timestamp,
        direction: 'sent'
      }
      setGroupMessages(prev => ({
        ...prev,
        [selectedGroupId]: [...(prev[selectedGroupId] ?? []), newMsg]
      }))
    }
  }, [selectedGroupId, groups, profile])

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    await window.acuate.deleteGroup(groupId)
    if (selectedGroupId === groupId) setSelectedGroupId(null)
    await refreshGroups()
    setGroupMessages(prev => {
      const next = { ...prev }
      delete next[groupId]
      return next
    })
  }, [selectedGroupId, refreshGroups])

  const handleCreateGroup = useCallback(async (name: string, memberContactIds: string[]) => {
    const result = await window.acuate.createGroup(name, memberContactIds)
    setShowCreateGroup(false)
    if (result.success) await refreshGroups()
  }, [refreshGroups])

  const handleAddGroupMembers = useCallback(async (groupId: string, newContactIds: string[]) => {
    const result = await window.acuate.addGroupMembers(groupId, newContactIds)
    if (result.success && result.group) {
      setGroups(prev => prev.map(g => g.id === groupId ? result.group as Group : g))
    }
  }, [])

  const handleVotekick = useCallback(async (groupId: string, targetPublicKey: string) => {
    await window.acuate.votekick(groupId, targetPublicKey)
  }, [])

  const handleVoteCast = useCallback(async (groupId: string, voteId: string) => {
    await window.acuate.voteCast(groupId, voteId)
  }, [])

  const handleDeleteContact = useCallback(async (contactId: string) => {
    await window.acuate.deleteContact(contactId)
    if (selectedContactId === contactId) setSelectedContactId(null)
    await refreshContacts()
    setMessages(prev => {
      const next = { ...prev }
      delete next[contactId]
      return next
    })
  }, [selectedContactId, refreshContacts])

  const handleBlockContact = useCallback(async (contactId: string) => {
    await window.acuate.blockContact(contactId)
    const keys = await window.acuate.getBlockedKeys()
    setBlockedKeys(keys)
  }, [])

  const handleUnblockContact = useCallback(async (contactId: string) => {
    await window.acuate.unblockContact(contactId)
    const keys = await window.acuate.getBlockedKeys()
    setBlockedKeys(keys)
  }, [])

  const handleApproveContact = useCallback(async (contactId: string) => {
    const result = await window.acuate.approveContact(contactId)
    setPendingContacts(prev => {
      const next = { ...prev }
      delete next[contactId]
      return next
    })
    if (result.success) await refreshContacts()
  }, [refreshContacts])

  const handleRejectContact = useCallback(async (contactId: string) => {
    await window.acuate.rejectContact(contactId)
    setPendingContacts(prev => {
      const next = { ...prev }
      delete next[contactId]
      return next
    })
  }, [])

  const handleConnectSuccess = useCallback(async (newContact?: Contact) => {
    setShowConnectModal(false)
    if (newContact) {
      // Add directly to state immediately — don't wait for IPC round-trip
      setContacts(prev => {
        if (prev.some(c => c.id === newContact.id)) return prev
        return [...prev, { ...newContact, online: false }]
      })
    }
    await refreshContacts()
  }, [refreshContacts])

  const selectedContact = contacts.find(c => c.id === selectedContactId) ?? null
  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null

  // Phase gates
  if (phase === 'checking') return (
    <Flex direction="column" h="100vh" bg="#111318"><TitleBar /></Flex>
  )
  if (phase === 'setup' || phase === 'locked') return (
    <Flex direction="column" h="100vh" bg="#111318" overflow="hidden">
      <TitleBar />
      <LockScreen mode={phase === 'setup' ? 'setup' : 'unlock'} onUnlocked={handleUnlocked} />
    </Flex>
  )

  // phase === 'ready'
  if (profile === undefined) return (
    <Flex direction="column" h="100vh" bg="#111318"><TitleBar /></Flex>
  )

  if (profile === null) {
    return (
      <Flex direction="column" h="100vh" bg="#111318" overflow="hidden">
        <TitleBar />
        <Onboarding onComplete={(p) => setProfile(p)} />
      </Flex>
    )
  }

  return (
    <Flex direction="column" h="100vh" bg="#111318" overflow="hidden">
      <TitleBar />
      <Flex flex={1} overflow="hidden">
        <Sidebar
          contacts={contacts}
          selectedContactId={selectedContactId}
          unreadCounts={unreadCounts}
          profile={profile}
          groups={groups}
          selectedGroupId={selectedGroupId}
          groupUnreadCounts={groupUnreadCounts}
          blockedKeys={blockedKeys}
          pendingContacts={pendingContacts}
          onApproveContact={handleApproveContact}
          onRejectContact={handleRejectContact}
          onSelectContact={(id) => { setShowSettings(false); setSelectedGroupId(null); handleSelectContact(id) }}
          onDeleteContact={handleDeleteContact}
          onBlockContact={handleBlockContact}
          onUnblockContact={handleUnblockContact}
          onSelectGroup={(id: string) => { setShowSettings(false); handleSelectGroup(id) }}
          onDeleteGroup={handleDeleteGroup}
          onShowInvite={() => setShowInviteModal(true)}
          onShowConnect={() => setShowConnectModal(true)}
          onShowCreateGroup={() => setShowCreateGroup(true)}
          onShowSettings={() => {
            if (showSettings) window.acuate.getSettings().then(s => setUseTwemoji(s.twemoji))
            setShowSettings(s => !s)
          }}
          showingSettings={showSettings}
        />
        <Box flex={1} display="flex" flexDirection="column" overflow="hidden" bg="#16181f">
          {showSettings ? (
            <SettingsView />
          ) : selectedGroup ? (
            <GroupChatView
              group={selectedGroup}
              messages={groupMessages[selectedGroupId!] ?? []}
              contacts={contacts}
              onlineContactIds={contacts.filter(c => c.online).map(c => c.id)}
              myPublicKey={myPublicKey}
              onSendMessage={handleSendGroupMessage}
              onAddMembers={handleAddGroupMembers}
              onVotekick={handleVotekick}
              onVoteCast={handleVoteCast}
              useTwemoji={useTwemoji}
            />
          ) : selectedContact ? (
            <ChatView
              contact={selectedContact}
              messages={messages[selectedContactId!] ?? []}
              isBlocked={blockedKeys.includes(selectedContact.publicKey)}
              queuedIds={queuedMessageIds[selectedContactId!] ?? new Set()}
              onSendMessage={handleSendMessage}
              isContactTyping={typingContacts[selectedContactId!] ?? false}
              onTyping={(typing) => selectedContactId && window.acuate.sendTyping(selectedContactId, typing)}
              useTwemoji={useTwemoji}
            />
          ) : (
            <Flex
              flex={1}
              align="center"
              justify="center"
              direction="column"
              gap={5}
              bg="#111318"
            >
              {/* Layered glow rings */}
              <Box position="relative">
                <Box
                  position="absolute" inset="-20px" borderRadius="full"
                  bg="radial-gradient(circle, #6c63ff12 0%, transparent 70%)"
                />
                <Flex
                  w="64px" h="64px" borderRadius="20px"
                  bg="#20232e" border="1px solid #2e3140"
                  align="center" justify="center"
                  boxShadow="0 8px 32px rgba(108,99,255,0.12)"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </Flex>
              </Box>
              <Box textAlign="center">
                <Box fontSize="sm" fontWeight="600" color="#e8eaf0" mb="6px" letterSpacing="-0.2px">
                  Select a conversation
                </Box>
                <Box fontSize="xs" color="#555870" maxW="220px" lineHeight="1.8">
                  Choose a contact from the sidebar or share your invite code to start chatting.
                </Box>
              </Box>
            </Flex>
          )}
        </Box>
      </Flex>
      {updateState !== 'idle' && (
        <HStack
          px={4} py="8px" spacing={3}
          bg={updateState === 'downloaded' ? '#34d39914' : '#6c63ff14'}
          borderTop={`1px solid ${updateState === 'downloaded' ? '#34d39930' : '#6c63ff30'}`}
          justify="space-between"
        >
          <HStack spacing={2}>
            {updateState === 'downloaded' ? <LuRefreshCw size={13} color="#34d399" /> : <LuDownload size={13} color="#6c63ff" />}
            <Text fontSize="xs" color={updateState === 'downloaded' ? '#34d399' : '#6c63ff'}>
              {updateState === 'downloaded'
                ? `v${updateVersion} ready to install`
                : `v${updateVersion} is downloading…`}
            </Text>
          </HStack>
          <HStack spacing={3}>
            {updateState === 'downloaded' && (
              <Box
                as="button" fontSize="xs" fontWeight="600" color="#34d399"
                cursor="pointer" onClick={() => window.acuate.installUpdate()}
                _hover={{ opacity: 0.8 }} sx={{ transition: 'opacity 0.12s' }}
              >
                Restart &amp; install
              </Box>
            )}
            <Box
              as="button" fontSize="xs" color="#555870"
              cursor="pointer" onClick={() => setUpdateState('idle')}
              _hover={{ color: '#888' }} sx={{ transition: 'color 0.12s' }}
            >
              Dismiss
            </Box>
          </HStack>
        </HStack>
      )}
      <TorStatusBar torStatus={torStatus} />

      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
      <ConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={handleConnectSuccess}
      />
      {recoveryPhrase && (
        <RecoveryPhraseModal
          phrase={recoveryPhrase}
          onConfirmed={() => setRecoveryPhrase(null)}
        />
      )}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onCreate={handleCreateGroup}
        contacts={contacts}
      />
    </Flex>
  )
}
