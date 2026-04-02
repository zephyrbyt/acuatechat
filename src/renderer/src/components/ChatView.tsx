import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Box, Flex, Text, VStack, HStack } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuLock, LuMessageSquare, LuDownload, LuBan, LuWifiOff, LuClock, LuShieldCheck } from 'react-icons/lu'
import type { Attachment, Contact, Message } from '../App'
import { MessageInput } from './MessageInput'
import { VideoPlayer } from './VideoPlayer'
import { LinkEmbed, extractUrls, EmbedSettings } from './LinkEmbed'
import { MessageText, ExternalLinkWarning, useLinkWarning } from './MessageContent'
import { KeyVerificationModal } from './KeyVerificationModal'
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

function shouldShowDateHeader(messages: Message[], index: number): boolean {
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
        <Box as="img" src={attachment.data} alt={attachment.name}
          maxW="100%" maxH="280px" display="block" objectFit="contain"
          onLoad={onLoad} />
      </Box>
    )
  }

  return (
    <Box borderRadius="10px" overflow="hidden" maxW="100%" cursor="pointer"
      onClick={handleDownload} title="Click to download">
      <Box as="img" src={attachment.data} alt={attachment.name}
        maxW="100%" maxH="280px" display="block" objectFit="cover"
        onLoad={onLoad} />
    </Box>
  )
}

function MessageBubble({ message, index, useTwemoji, onMediaLoad, contactAvatar, contactName, isQueued, embedSettings, onLinkClick }: { message: Message; index: number; useTwemoji: boolean; onMediaLoad?: () => void; contactAvatar?: string | null; contactName?: string; isQueued?: boolean; embedSettings: EmbedSettings; onLinkClick: (url: string) => void }): React.ReactElement {
  const isSent = message.direction === 'sent'
  const hasText = message.content.trim().length > 0
  const hasAttachment = !!message.attachment

  return (
    <MotionBox
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: Math.min(index * 0.012, 0.08) }}
    >
      <Flex
        justify={isSent ? 'flex-end' : 'flex-start'}
        w="full" px={6} mb="2px" align="flex-end" gap="8px"
      >
        {!isSent && (
          <Flex
            w="28px" h="28px" borderRadius="full" flexShrink={0}
            bg={stringToColor(contactName ?? '?')}
            align="center" justify="center"
            fontSize="10px" fontWeight="700" color="white" overflow="hidden"
            mb="18px"
          >
            {contactAvatar
              ? <Box as="img" src={contactAvatar} w="full" h="full" objectFit="cover" display="block" />
              : getInitials(contactName ?? '?')
            }
          </Flex>
        )}
        <Box maxW="65%">
          <Box
            bg={isSent ? C.accent : C.elevated}
            color={isSent ? 'white' : C.textPrimary}
            px={hasAttachment ? '12px' : '16px'}
            py={hasAttachment ? '12px' : '10px'}
            borderRadius={isSent
              ? '18px 18px 5px 18px'
              : '18px 18px 18px 5px'
            }
            wordBreak="break-word"
            whiteSpace="pre-wrap"
            boxShadow={isSent
              ? `0 4px 16px ${C.accent}35`
              : `0 2px 8px rgba(0,0,0,0.2)`
            }
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
          {isSent && isQueued ? (
            <HStack spacing="4px" justify="flex-end" mt="4px" px="2px">
              <LuClock size={9} color={C.textFaint} />
              <Text fontSize="10px" color={C.textFaint}>Queued</Text>
            </HStack>
          ) : (
            <Text
              fontSize="10px" color={C.textMuted} mt="4px"
              textAlign={isSent ? 'right' : 'left'} px="2px"
            >
              {formatTimestamp(message.timestamp)}
            </Text>
          )}
        </Box>
      </Flex>
    </MotionBox>
  )
}

interface ChatViewProps {
  contact: Contact
  messages: Message[]
  isBlocked: boolean
  queuedIds: Set<string>
  onSendMessage: (content: string, attachment?: Attachment) => Promise<void>
  isContactTyping: boolean
  onTyping: (typing: boolean) => void
  useTwemoji: boolean
  embedSettings: EmbedSettings
  myPublicKey: string | null
}

export function ChatView({ contact, messages, isBlocked, queuedIds, onSendMessage, isContactTyping, onTyping, useTwemoji, embedSettings, myPublicKey }: ChatViewProps): React.ReactElement {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { pendingUrl, handleLinkClick, handleConfirm, handleClose } = useLinkWarning()
  const [showKeysModal, setShowKeysModal] = useState(false)

  const slashCommands = React.useMemo(() => {
    if (!myPublicKey || !contact.publicKey) return []
    return [
      {
        command: 'keys',
        description: 'Verify encryption keys to confirm your connection is authentic',
        icon: <LuShieldCheck size={14} color={C.accent} />,
        onSelect: () => setShowKeysModal(true),
      },
    ]
  }, [myPublicKey, contact.publicKey])

  const contentRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  useEffect(() => {
    scrollToBottom(false)
  }, [messages, scrollToBottom])

  // Scroll to bottom whenever content height grows (images, embeds, videos loading in)
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => scrollToBottom(false))
    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom])

  return (
    <Flex direction="column" h="full" bg={C.panel}>

      {/* ── Header ── */}
      <Box
        px={6} py="13px"
        bg={C.surface}
        borderBottom={`1px solid ${C.borderFaint}`}
        flexShrink={0}
      >
        <HStack spacing={3} align="center">
          {/* Avatar */}
          <Box position="relative" flexShrink={0}>
            <Flex
              w="40px" h="40px" borderRadius="full"
              bg={stringToColor(contact.nickname)}
              align="center" justify="center"
              fontSize="14px" fontWeight="600" color="white"
              overflow="hidden" letterSpacing="-0.5px"
            >
              {contact.avatar
                ? <Box as="img" src={contact.avatar} w="full" h="full" objectFit="cover" display="block" />
                : getInitials(contact.nickname)
              }
            </Flex>
            <Box
              position="absolute" bottom="1px" right="1px"
              w="10px" h="10px" borderRadius="full"
              bg={contact.online ? C.green : C.textFaint}
              border={`2.5px solid ${C.surface}`}
            />
          </Box>

          {/* Name + status */}
          <Box flex={1}>
            <Text
              fontWeight="600" color={C.textPrimary}
              fontSize="sm" letterSpacing="-0.2px"
            >
              {contact.nickname}
            </Text>
            <Text fontSize="xs" color={contact.online ? C.green : C.textMuted} mt="1px">
              {contact.online ? 'Active now' : 'Offline'}
            </Text>
          </Box>

          {/* Encrypted indicator — subtle icon only */}
          <LuLock size={13} color={C.textFaint} />
        </HStack>
      </Box>

      {/* ── Offline banner ── */}
      <AnimatePresence>
        {!isBlocked && !contact.online && (
          <Box
            px={5} py="8px"
            bg="#f59e0b14" borderBottom={`1px solid #f59e0b22`}
            flexShrink={0}
          >
            <HStack spacing="8px">
              <LuWifiOff size={12} color="#f59e0b" />
              <Text fontSize="xs" color="#f59e0b" lineHeight={1.5}>
                <Text as="span" fontWeight="500">{contact.nickname}</Text> is offline — messages will be delivered when they reconnect
              </Text>
            </HStack>
          </Box>
        )}
      </AnimatePresence>

      {/* ── Messages ── */}
      <Box ref={scrollContainerRef} flex={1} overflowY="auto" py={6} bg={C.panel}>
        {messages.length === 0 ? (
          <Flex h="full" align="center" justify="center" direction="column" gap={4} px={8}>
            <Flex
              w="56px" h="56px" borderRadius="16px"
              bg={C.elevated} border={`1px solid ${C.border}`}
              align="center" justify="center"
            >
              <LuMessageSquare size={22} color={C.textMuted} />
            </Flex>
            <Box textAlign="center">
              <Text fontSize="sm" fontWeight="500" color={C.textSecondary}>
                No messages yet
              </Text>
              <Text fontSize="xs" color={C.textMuted} mt="4px" lineHeight="1.7" maxW="200px">
                Send a message to get the conversation started.
              </Text>
            </Box>
          </Flex>
        ) : (
          <VStack ref={contentRef} spacing={0} align="stretch">
            {messages.map((msg, index) => (
              <React.Fragment key={msg.id}>
                {shouldShowDateHeader(messages, index) && (
                  <Flex justify="center" my={5}>
                    <Box
                      bg={C.elevated} border={`1px solid ${C.border}`}
                      color={C.textMuted} fontSize="11px"
                      px="12px" py="4px" borderRadius="full"
                      fontWeight="500" letterSpacing="0.1px"
                    >
                      {formatDateHeader(msg.timestamp)}
                    </Box>
                  </Flex>
                )}
                <MessageBubble message={msg} index={index} useTwemoji={useTwemoji} onMediaLoad={scrollToBottom} contactAvatar={contact.avatar} contactName={contact.nickname} isQueued={queuedIds.has(msg.id)} embedSettings={embedSettings} onLinkClick={handleLinkClick} />
              </React.Fragment>
            ))}
          </VStack>
        )}
      </Box>

      {/* ── Typing indicator ── */}
      <AnimatePresence>
        {isContactTyping && (
          <MotionBox
            key="typing"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
            px={7} pb="4px" bg={C.panel}
          >
            <Flex align="center" gap="8px">
              <Flex gap="3px" align="center">
                {[0, 1, 2].map(i => (
                  <Box
                    key={i} w="5px" h="5px" borderRadius="full" bg={C.textMuted}
                    sx={{
                      animation: 'typingBounce 1.2s ease-in-out infinite',
                      animationDelay: `${i * 0.18}s`,
                      '@keyframes typingBounce': {
                        '0%, 60%, 100%': { transform: 'translateY(0)' },
                        '30%': { transform: 'translateY(-4px)' },
                      },
                    }}
                  />
                ))}
              </Flex>
              <Text fontSize="xs" color={C.textMuted}>
                {contact.nickname} is typing…
              </Text>
            </Flex>
          </MotionBox>
        )}
      </AnimatePresence>

      {isBlocked ? (
        <Flex
          px={5} py="13px" flexShrink={0}
          bg={C.surface} borderTop={`1px solid ${C.borderFaint}`}
          align="center" justify="center" gap="8px"
        >
          <LuBan size={14} color={C.red} />
          <Text fontSize="sm" color={C.textMuted}>
            You have blocked <Text as="span" color={C.textSecondary} fontWeight="500">{contact.nickname}</Text>. Right-click to unblock.
          </Text>
        </Flex>
      ) : (
        <MessageInput
          onSend={onSendMessage}
          onTyping={onTyping}
          placeholder={`Message ${contact.nickname}…`}
          contactName={contact.nickname}
          slashCommands={slashCommands}
        />
      )}

      <ExternalLinkWarning url={pendingUrl} onClose={handleClose} onConfirm={handleConfirm} />

      {myPublicKey && contact.publicKey && (
        <KeyVerificationModal
          isOpen={showKeysModal}
          myPublicKey={myPublicKey}
          contactPublicKey={contact.publicKey}
          contactName={contact.nickname}
          onClose={() => setShowKeysModal(false)}
        />
      )}
    </Flex>
  )
}
