import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Box, Flex, Text, VStack, HStack, Tooltip, Button } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuLock, LuMessageSquare, LuDownload, LuUsers, LuUserPlus, LuWifiOff, LuUserMinus, LuUserCheck, LuShieldAlert, LuUserX, LuThumbsUp } from 'react-icons/lu'
import type { Attachment, Contact, Group, GroupMessage } from '../App'
import { MessageInput } from './MessageInput'
import { VideoPlayer } from './VideoPlayer'
import { LinkEmbed, extractUrls, EmbedSettings } from './LinkEmbed'
import { MessageText, ExternalLinkWarning, useLinkWarning } from './MessageContent'
import { C } from '../theme'

const MotionBox = motion(Box)

function stringToColor(str: string): string {
  const colors = ['#6c63ff', '#34d399', '#f59e0b', '#f87171', '#38bdf8', '#a78bfa', '#fb7185']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateHeader(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

function shouldShowDateHeader(messages: GroupMessage[], index: number): boolean {
  if (index === 0) return true
  return new Date(messages[index].timestamp).toDateString() !== new Date(messages[index - 1].timestamp).toDateString()
}

function AttachmentPreview({ attachment, isSent, onLoad }: { attachment: Attachment; isSent: boolean; onLoad?: () => void }): React.ReactElement {
  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = attachment.data
    a.download = attachment.name
    a.click()
  }, [attachment])

  if (attachment.type === 'video/mp4') {
    return <VideoPlayer src={attachment.data} name={attachment.name} onLoad={onLoad} />
  }

  if (attachment.type === 'image/gif') {
    return (
      <Box borderRadius="10px" overflow="hidden" maxW="100%">
        <Box as="img" src={attachment.data} alt={attachment.name} maxW="100%" maxH="280px" display="block" objectFit="contain"
          onLoad={onLoad} />
      </Box>
    )
  }

  return (
    <Box borderRadius="10px" overflow="hidden" maxW="100%" cursor="pointer" onClick={handleDownload} title="Click to download">
      <Box as="img" src={attachment.data} alt={attachment.name} maxW="100%" maxH="280px" display="block" objectFit="cover"
        onLoad={onLoad} />
    </Box>
  )
}

function SystemMessage({ message, myPublicKey, onVoteCast }: {
  message: GroupMessage
  myPublicKey: string | null
  onVoteCast?: (groupId: string, voteId: string) => Promise<void>
}): React.ReactElement {
  const event = message.systemEvent
  const [voted, setVoted] = useState(false)

  if (event === 'votekick_pending') {
    let parsed: { voteId: string; targetPublicKey: string; initiatorNickname: string; targetNickname: string } | null = null
    try { parsed = JSON.parse(message.content) } catch { /* ignore */ }
    if (!parsed) return <></>

    const isTarget = parsed.targetPublicKey === myPublicKey
    const accentColor = '#f59e0b'

    return (
      <Flex justify="center" my="8px" px={6}>
        <Box
          px="14px" py="10px"
          bg={`${accentColor}0d`}
          border={`1px solid ${accentColor}30`}
          borderRadius="12px"
          maxW="460px"
          w="full"
        >
          <HStack spacing="7px" mb="8px">
            <LuShieldAlert size={13} color={accentColor} />
            <Text fontSize="12px" color={accentColor} fontWeight="600">Vote to Kick</Text>
          </HStack>
          <Text fontSize="12px" color={C.textMuted} lineHeight="1.5" mb={isTarget ? 0 : '10px'}>
            <Text as="span" color={C.text} fontWeight="500">{parsed.initiatorNickname}</Text>
            {' started a vote to remove '}
            <Text as="span" color="#f87171" fontWeight="500">{parsed.targetNickname}</Text>
            {' from the group.'}
          </Text>
          {!isTarget && (
            <HStack spacing="8px">
              <Button
                size="xs"
                bg={voted ? '#34d39920' : '#34d39930'}
                color="#34d399"
                border="1px solid #34d39940"
                borderRadius="8px"
                px="10px"
                _hover={{ bg: '#34d39940' }}
                leftIcon={<LuThumbsUp size={10} />}
                isDisabled={voted}
                onClick={async () => {
                  if (!voted && onVoteCast) {
                    setVoted(true)
                    await onVoteCast(message.groupId, parsed!.voteId)
                  }
                }}
              >
                {voted ? 'Voted' : 'Vote Yes'}
              </Button>
            </HStack>
          )}
          {isTarget && (
            <Text fontSize="11px" color={C.textMuted} fontStyle="italic">You are the subject of this vote.</Text>
          )}
        </Box>
      </Flex>
    )
  }

  const icon =
    event === 'member_added'  ? <LuUserCheck size={12} color="#34d399" /> :
    event === 'member_kicked' ? <LuUserX size={12} color="#f87171" /> :
                                <LuUsers size={12} color={C.textMuted} />

  const accentColor =
    event === 'member_added'  ? '#34d399' :
    event === 'member_kicked' ? '#f87171' :
                                C.textMuted

  return (
    <Flex justify="center" my="6px" px={6}>
      <HStack
        spacing="7px" px="12px" py="7px"
        bg={`${accentColor}0d`}
        border={`1px solid ${accentColor}25`}
        borderRadius="10px"
        maxW="420px"
      >
        {icon}
        <Text fontSize="11px" color={accentColor} fontWeight="500" lineHeight="1.4" textAlign="center">
          {message.content}
        </Text>
      </HStack>
    </Flex>
  )
}

function GroupMessageBubble({ message, index, useTwemoji, onMediaLoad, members, embedSettings, onLinkClick }: { message: GroupMessage; index: number; useTwemoji: boolean; onMediaLoad?: () => void; members: Group['members']; embedSettings: EmbedSettings; onLinkClick: (url: string) => void }): React.ReactElement {
  const isSent = message.direction === 'sent'
  const hasText = message.content.trim().length > 0
  const hasAttachment = !!message.attachment
  const senderMember = !isSent ? members.find(m => m.publicKey === message.senderId) : undefined
  const senderAvatar = senderMember?.avatar ?? null

  return (
    <MotionBox
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: Math.min(index * 0.012, 0.08) }}
    >
      <Flex justify={isSent ? 'flex-end' : 'flex-start'} w="full" px={6} mb="2px" align="flex-end" gap="8px">
        {/* Avatar — shown only for received messages */}
        {!isSent && (
          <Flex
            w="28px" h="28px" borderRadius="full" flexShrink={0}
            bg={stringToColor(message.senderNickname)}
            align="center" justify="center"
            fontSize="10px" fontWeight="700" color="white" overflow="hidden"
            mb="18px" // align with bubble bottom (above timestamp)
          >
            {senderAvatar
              ? <Box as="img" src={senderAvatar} w="full" h="full" objectFit="cover" display="block" />
              : getInitials(message.senderNickname)
            }
          </Flex>
        )}
        <Box maxW="65%">
          {!isSent && (
            <Text fontSize="10px" color={stringToColor(message.senderNickname)} fontWeight="600" mb="3px" px="2px">
              {message.senderNickname}
            </Text>
          )}
          <Box
            bg={isSent ? C.accent : C.elevated}
            color={isSent ? 'white' : C.textPrimary}
            px={hasAttachment ? '12px' : '16px'}
            py={hasAttachment ? '12px' : '10px'}
            borderRadius={isSent ? '18px 18px 5px 18px' : '18px 18px 18px 5px'}
            wordBreak="break-word"
            whiteSpace="pre-wrap"
            boxShadow={isSent ? `0 4px 16px ${C.accent}35` : `0 2px 8px rgba(0,0,0,0.2)`}
            overflow="hidden"
          >
            {hasAttachment && (
              <Box mb={hasText ? '10px' : 0}>
                <AttachmentPreview attachment={message.attachment!} isSent={isSent} onLoad={onMediaLoad} />
              </Box>
            )}
            {hasText && (
              <Box px={hasAttachment ? 1 : 0} pb={hasAttachment ? 1 : 0}>
                <MessageText
                  text={message.content}
                  isSent={isSent}
                  useTwemoji={useTwemoji}
                  fontSize="14px"
                  color={isSent ? 'white' : C.textPrimary}
                  onLinkClick={onLinkClick}
                />
              </Box>
            )}
          </Box>
          {extractUrls(message.content).map(url => (
            <LinkEmbed key={url} url={url} isSent={isSent} embedSettings={embedSettings} onLoad={onMediaLoad} />
          ))}
          <Text fontSize="10px" color={C.textMuted} mt="4px" textAlign={isSent ? 'right' : 'left'} px="2px">
            {formatTimestamp(message.timestamp)}
          </Text>
        </Box>
      </Flex>
    </MotionBox>
  )
}

interface GroupChatViewProps {
  group: Group
  messages: GroupMessage[]
  contacts: Contact[]
  onlineContactIds: string[]
  myPublicKey: string | null
  onSendMessage: (content: string, attachment?: Attachment) => Promise<void>
  onAddMembers: (groupId: string, contactIds: string[]) => Promise<void>
  onVotekick: (groupId: string, targetPublicKey: string) => Promise<void>
  onVoteCast: (groupId: string, voteId: string) => Promise<void>
  useTwemoji: boolean
  embedSettings: EmbedSettings
}

function stringToColor2(str: string): string {
  const colors = ['#6c63ff', '#34d399', '#f59e0b', '#f87171', '#38bdf8', '#a78bfa', '#fb7185']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function AddMembersModal({ group, contacts, onlineContactIds, onAdd, onClose }: {
  group: Group
  contacts: Contact[]
  onlineContactIds: string[]
  onAdd: (ids: string[]) => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const existingPubkeys = new Set(group.members.map(m => m.publicKey))
  const eligible = contacts.filter(c => !existingPubkeys.has(c.publicKey))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleAdd = async () => {
    if (selected.size === 0) return
    setLoading(true)
    try { await onAdd(Array.from(selected)) } finally { setLoading(false) }
  }

  return (
    <Box position="fixed" inset={0} zIndex={300} display="flex" alignItems="center" justifyContent="center">
      <Box position="absolute" inset={0} bg="rgba(0,0,0,0.6)" onClick={onClose} />
      <Box
        position="relative" zIndex={1}
        bg={C.panel} border={`1px solid ${C.border}`}
        borderRadius="20px" boxShadow="0 24px 64px rgba(0,0,0,0.7)"
        w="380px" maxH="70vh" display="flex" flexDirection="column" overflow="hidden"
      >
        <Flex px={6} pt={5} pb={4} align="center" justify="space-between" borderBottom={`1px solid ${C.borderFaint}`}>
          <Text fontWeight="600" color={C.textPrimary} fontSize="sm">Add Members</Text>
          <Flex w="28px" h="28px" borderRadius="8px" align="center" justify="center" cursor="pointer"
            color={C.textMuted} _hover={{ bg: C.hover, color: C.textSecondary }} onClick={onClose} sx={{ transition: 'all 0.12s' }}>
            <Text fontSize="lg" lineHeight={1}>×</Text>
          </Flex>
        </Flex>
        <VStack spacing="2px" align="stretch" px={4} py={4} flex={1} overflowY="auto">
          {eligible.length === 0 ? (
            <Text fontSize="sm" color={C.textMuted} textAlign="center" py={6}>All contacts are already in this group</Text>
          ) : eligible.map(c => (
            <Flex
              key={c.id} px={3} py="10px" borderRadius="10px" cursor="pointer" align="center" gap={3}
              bg={selected.has(c.id) ? C.accentGlow : 'transparent'}
              border={`1px solid ${selected.has(c.id) ? C.accent + '30' : 'transparent'}`}
              _hover={{ bg: selected.has(c.id) ? C.accentGlow : C.hover }}
              onClick={() => toggle(c.id)} sx={{ transition: 'all 0.1s' }}
            >
              <Box position="relative" flexShrink={0}>
                <Flex w="34px" h="34px" borderRadius="full" bg={stringToColor2(c.nickname)}
                  align="center" justify="center" fontSize="12px" fontWeight="600" color="white" overflow="hidden">
                  {c.avatar ? <Box as="img" src={c.avatar} w="full" h="full" objectFit="cover" display="block" /> : getInitials(c.nickname)}
                </Flex>
                <Box position="absolute" bottom="1px" right="1px" w="9px" h="9px" borderRadius="full"
                  bg={onlineContactIds.includes(c.id) ? C.green : C.textFaint} border={`2px solid ${C.panel}`} />
              </Box>
              <Box flex={1}>
                <Text fontSize="sm" fontWeight="500" color={C.textPrimary} noOfLines={1}>{c.nickname}</Text>
                <Text fontSize="xs" color={onlineContactIds.includes(c.id) ? C.green : C.textMuted}>
                  {onlineContactIds.includes(c.id) ? 'Online' : 'Offline'}
                </Text>
              </Box>
              <Box w="18px" h="18px" borderRadius="5px" border={`2px solid ${selected.has(c.id) ? C.accent : C.borderMid}`}
                bg={selected.has(c.id) ? C.accent : 'transparent'} flexShrink={0} sx={{ transition: 'all 0.1s' }}
                display="flex" alignItems="center" justifyContent="center">
                {selected.has(c.id) && <Box w="6px" h="6px" borderRadius="2px" bg="white" />}
              </Box>
            </Flex>
          ))}
        </VStack>
        <Flex px={6} py={4} borderTop={`1px solid ${C.borderFaint}`} gap={3}>
          <Flex flex={1} h="38px" borderRadius="10px" bg={C.elevated} border={`1px solid ${C.border}`}
            align="center" justify="center" cursor="pointer" _hover={{ bg: C.hover }} onClick={onClose} sx={{ transition: 'all 0.12s' }}>
            <Text fontSize="sm" fontWeight="500" color={C.textSecondary}>Cancel</Text>
          </Flex>
          <Flex flex={1} h="38px" borderRadius="10px"
            bg={loading || selected.size === 0 ? C.elevated : C.accent}
            border={`1px solid ${loading || selected.size === 0 ? C.border : C.accent}`}
            align="center" justify="center"
            cursor={loading || selected.size === 0 ? 'not-allowed' : 'pointer'}
            opacity={loading || selected.size === 0 ? 0.5 : 1}
            onClick={loading ? undefined : handleAdd} sx={{ transition: 'all 0.12s' }}>
            <Text fontSize="sm" fontWeight="600" color="white">
              {loading ? 'Adding…' : `Add${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </Text>
          </Flex>
        </Flex>
      </Box>
    </Box>
  )
}

function VotekickModal({ group, myPublicKey, onKick, onClose }: {
  group: Group
  myPublicKey: string | null
  onKick: (targetPublicKey: string) => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const kickable = group.members.filter(m => m.publicKey !== myPublicKey)
  const [confirm, setConfirm] = useState<string | null>(null) // publicKey pending confirm
  const [loading, setLoading] = useState(false)

  const handleKick = async (pubkey: string) => {
    setLoading(true)
    try { await onKick(pubkey) } finally {
      setLoading(false)
      onClose()
    }
  }

  return (
    <Box position="fixed" inset={0} zIndex={300} display="flex" alignItems="center" justifyContent="center">
      <Box position="absolute" inset={0} bg="rgba(0,0,0,0.6)" onClick={onClose} />
      <Box
        position="relative" zIndex={1}
        bg={C.panel} border={`1px solid ${C.border}`}
        borderRadius="20px" boxShadow="0 24px 64px rgba(0,0,0,0.7)"
        w="360px" maxH="70vh" display="flex" flexDirection="column" overflow="hidden"
      >
        <Flex px={6} pt={5} pb={4} align="center" justify="space-between" borderBottom={`1px solid ${C.borderFaint}`}>
          <Text fontWeight="600" color={C.textPrimary} fontSize="sm">Vote to Kick</Text>
          <Flex w="28px" h="28px" borderRadius="8px" align="center" justify="center" cursor="pointer"
            color={C.textMuted} _hover={{ bg: C.hover, color: C.textSecondary }} onClick={onClose} sx={{ transition: 'all 0.12s' }}>
            <Text fontSize="lg" lineHeight={1}>×</Text>
          </Flex>
        </Flex>

        {confirm ? (() => {
          const target = group.members.find(m => m.publicKey === confirm)!
          return (
            <Box px={6} py={5}>
              <Text fontSize="sm" color={C.textSecondary} mb={5} lineHeight="1.7">
                Start a vote to kick <Text as="span" fontWeight="600" color={C.textPrimary}>{target.nickname}</Text>?
                A majority of members must agree.
              </Text>
              <Flex gap={3}>
                <Flex flex={1} h="38px" borderRadius="10px" bg={C.elevated} border={`1px solid ${C.border}`}
                  align="center" justify="center" cursor="pointer" _hover={{ bg: C.hover }} onClick={() => setConfirm(null)} sx={{ transition: 'all 0.12s' }}>
                  <Text fontSize="sm" fontWeight="500" color={C.textSecondary}>Cancel</Text>
                </Flex>
                <Flex flex={1} h="38px" borderRadius="10px"
                  bg={loading ? C.elevated : '#f8717120'}
                  border={`1px solid ${loading ? C.border : '#f8717140'}`}
                  align="center" justify="center"
                  cursor={loading ? 'not-allowed' : 'pointer'}
                  opacity={loading ? 0.5 : 1}
                  onClick={loading ? undefined : () => handleKick(confirm)}
                  sx={{ transition: 'all 0.12s' }}>
                  <Text fontSize="sm" fontWeight="600" color="#f87171">{loading ? 'Voting…' : 'Start vote'}</Text>
                </Flex>
              </Flex>
            </Box>
          )
        })() : (
          <VStack spacing="2px" align="stretch" px={4} py={4} flex={1} overflowY="auto">
            {kickable.length === 0 ? (
              <Text fontSize="sm" color={C.textMuted} textAlign="center" py={6}>No other members to kick</Text>
            ) : kickable.map(m => (
              <Flex key={m.publicKey} px={3} py="10px" borderRadius="10px" cursor="pointer" align="center" gap={3}
                _hover={{ bg: C.hover }} onClick={() => setConfirm(m.publicKey)} sx={{ transition: 'all 0.1s' }}>
                <Flex w="34px" h="34px" borderRadius="full" bg={stringToColor2(m.nickname)}
                  align="center" justify="center" fontSize="12px" fontWeight="600" color="white" overflow="hidden" flexShrink={0}>
                  {m.avatar ? <Box as="img" src={m.avatar} w="full" h="full" objectFit="cover" display="block" /> : getInitials(m.nickname)}
                </Flex>
                <Text flex={1} fontSize="sm" fontWeight="500" color={C.textPrimary} noOfLines={1}>{m.nickname}</Text>
                <LuUserMinus size={13} color={C.textFaint} />
              </Flex>
            ))}
          </VStack>
        )}
      </Box>
    </Box>
  )
}

export function GroupChatView({ group, messages, contacts, onlineContactIds, myPublicKey, onSendMessage, onAddMembers, onVotekick, onVoteCast, useTwemoji, embedSettings }: GroupChatViewProps): React.ReactElement {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [showVotekick, setShowVotekick] = useState(false)
  const { pendingUrl, handleLinkClick, handleConfirm, handleClose } = useLinkWarning()

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Resolve online status by matching publicKey against live contacts list
  const isMemberOnline = useCallback((m: Group['members'][number]): boolean => {
    if (myPublicKey && m.publicKey === myPublicKey) return true // self always online
    const contact = contacts.find(c => c.publicKey === m.publicKey)
    if (!contact) return false
    return onlineContactIds.includes(contact.id)
  }, [contacts, onlineContactIds, myPublicKey])

  // Which members (excluding self) are offline
  const offlineMembers = group.members.filter(m => {
    if (myPublicKey && m.publicKey === myPublicKey) return false // self
    return !isMemberOnline(m)
  })
  const hasOffline = offlineMembers.length > 0

  const handleAddMembers = async (ids: string[]) => {
    await onAddMembers(group.id, ids)
    setShowAddMembers(false)
  }

  return (
    <Flex direction="column" h="full" bg={C.panel}>
      {/* ── Header ── */}
      <Box px={6} py="13px" bg={C.surface} borderBottom={`1px solid ${C.borderFaint}`} flexShrink={0}>
        <HStack spacing={3} align="center">
          <Flex
            w="40px" h="40px" borderRadius="full"
            bg={stringToColor(group.name)}
            align="center" justify="center"
            fontSize="14px" fontWeight="600" color="white"
            overflow="hidden" letterSpacing="-0.5px" flexShrink={0}
          >
            {group.avatar
              ? <Box as="img" src={group.avatar} w="full" h="full" objectFit="cover" display="block" />
              : getInitials(group.name)
            }
          </Flex>
          <Box flex={1}>
            <Text fontWeight="600" color={C.textPrimary} fontSize="sm" letterSpacing="-0.2px">
              {group.name}
            </Text>
            <HStack spacing="6px" mt="2px" flexWrap="wrap">
              {group.members.map(m => {
                const isSelf = !!(myPublicKey && m.publicKey === myPublicKey)
                const isOnline = isMemberOnline(m)
                return (
                  <Tooltip key={m.publicKey} label={`${m.nickname}${isSelf ? ' (you)' : isOnline ? '' : ' · offline'}`} placement="bottom">
                    <Box position="relative" cursor="default">
                      <Flex
                        w="20px" h="20px" borderRadius="full"
                        bg={stringToColor2(m.nickname)} align="center" justify="center"
                        fontSize="8px" fontWeight="700" color="white" overflow="hidden"
                      >
                        {m.avatar ? <Box as="img" src={m.avatar} w="full" h="full" objectFit="cover" display="block" /> : getInitials(m.nickname)}
                      </Flex>
                      <Box
                        position="absolute" bottom="-1px" right="-1px"
                        w="7px" h="7px" borderRadius="full"
                        bg={isOnline ? C.green : C.textFaint}
                        border={`1.5px solid ${C.surface}`}
                      />
                    </Box>
                  </Tooltip>
                )
              })}
            </HStack>
          </Box>
          <Tooltip label="Add members" placement="left">
            <Flex
              w="30px" h="30px" borderRadius="8px" align="center" justify="center"
              cursor="pointer" color={C.textMuted}
              _hover={{ bg: C.hover, color: C.textSecondary }}
              onClick={() => setShowAddMembers(true)}
              sx={{ transition: 'all 0.12s' }}
            >
              <LuUserPlus size={14} />
            </Flex>
          </Tooltip>
          {group.members.length > 2 && (
            <Tooltip label="Vote to kick" placement="left">
              <Flex
                w="30px" h="30px" borderRadius="8px" align="center" justify="center"
                cursor="pointer" color={C.textMuted}
                _hover={{ bg: '#f8717115', color: '#f87171' }}
                onClick={() => setShowVotekick(true)}
                sx={{ transition: 'all 0.12s' }}
              >
                <LuUserMinus size={14} />
              </Flex>
            </Tooltip>
          )}
          <LuLock size={13} color={C.textFaint} />
        </HStack>
      </Box>

      {/* ── Offline warning bar ── */}
      <AnimatePresence>
        {hasOffline && (
          <Box
            px={5} py="8px"
            bg="#f59e0b14" borderBottom={`1px solid #f59e0b22`}
            flexShrink={0}
          >
            <HStack spacing="8px">
              <LuWifiOff size={12} color="#f59e0b" />
              <Text fontSize="xs" color="#f59e0b" lineHeight={1.5}>
                {offlineMembers.map(m => m.nickname).join(', ')} {offlineMembers.length === 1 ? 'is' : 'are'} offline — messages will be delivered when they reconnect
              </Text>
            </HStack>
          </Box>
        )}
      </AnimatePresence>

      {/* ── Messages ── */}
      <Box ref={scrollContainerRef} flex={1} overflowY="auto" py={6} bg={C.panel}>
        {messages.length === 0 ? (
          <Flex h="full" align="center" justify="center" direction="column" gap={4} px={8}>
            <Flex w="56px" h="56px" borderRadius="16px" bg={C.elevated} border={`1px solid ${C.border}`} align="center" justify="center">
              <LuMessageSquare size={22} color={C.textMuted} />
            </Flex>
            <Box textAlign="center">
              <Text fontSize="sm" fontWeight="500" color={C.textSecondary}>No messages yet</Text>
              <Text fontSize="xs" color={C.textMuted} mt="4px" lineHeight="1.7" maxW="200px">
                Send a message to start the group conversation.
              </Text>
            </Box>
          </Flex>
        ) : (
          <VStack spacing={0} align="stretch">
            {messages.map((msg, index) => (
              <React.Fragment key={msg.id}>
                {shouldShowDateHeader(messages, index) && (
                  <Flex justify="center" my={5}>
                    <Box bg={C.elevated} border={`1px solid ${C.border}`} color={C.textMuted} fontSize="11px" px="12px" py="4px" borderRadius="full" fontWeight="500" letterSpacing="0.1px">
                      {formatDateHeader(msg.timestamp)}
                    </Box>
                  </Flex>
                )}
                {msg.direction === 'system'
                  ? <SystemMessage message={msg} myPublicKey={myPublicKey} onVoteCast={onVoteCast} />
                  : <GroupMessageBubble message={msg} index={index} useTwemoji={useTwemoji} onMediaLoad={scrollToBottom} members={group.members} embedSettings={embedSettings} onLinkClick={handleLinkClick} />
                }
              </React.Fragment>
            ))}
          </VStack>
        )}
      </Box>

      <MessageInput
        onSend={onSendMessage}
        onTyping={() => {}}
        isDisabled={false}
        placeholder={`Message ${group.name}…`}
        contactName={group.name}
      />

      {showAddMembers && (
        <AddMembersModal
          group={group}
          contacts={contacts}
          onlineContactIds={onlineContactIds}
          onAdd={handleAddMembers}
          onClose={() => setShowAddMembers(false)}
        />
      )}
      {showVotekick && (
        <VotekickModal
          group={group}
          myPublicKey={myPublicKey}
          onKick={(pubkey) => onVotekick(group.id, pubkey)}
          onClose={() => setShowVotekick(false)}
        />
      )}

      <ExternalLinkWarning url={pendingUrl} onClose={handleClose} onConfirm={handleConfirm} />
    </Flex>
  )
}
