import React, { useState } from 'react'
import { Box, Flex, Text, HStack } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuExternalLink } from 'react-icons/lu'
import { TwemojiText } from './TwemojiText'
import { C } from '../theme'

const MotionBox = motion(Box)

const URL_REGEX = /https?:\/\/[^\s<>"']+/g

function splitByUrls(text: string): Array<{ type: 'text' | 'url'; value: string }> {
  const parts: Array<{ type: 'text' | 'url'; value: string }> = []
  let lastIndex = 0
  const re = new RegExp(URL_REGEX.source, 'g')
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'url', value: match[0] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: text }]
}

interface MessageTextProps {
  text: string
  isSent: boolean
  useTwemoji: boolean
  fontSize?: string
  color: string
  onLinkClick: (url: string) => void
}

export function MessageText({ text, isSent, useTwemoji, fontSize = '14px', color, onLinkClick }: MessageTextProps): React.ReactElement {
  const segments = splitByUrls(text)
  const hasUrls = segments.some(s => s.type === 'url')

  if (!hasUrls) {
    return useTwemoji
      ? <TwemojiText text={text} fontSize={fontSize} lineHeight={1.6} color={color} />
      : <span style={{ fontSize, lineHeight: '1.6', color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</span>
  }

  const linkColor = isSent ? 'rgba(255,255,255,0.75)' : C.accent

  return (
    <span style={{ fontSize, lineHeight: '1.6', color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
          <span
            key={i}
            style={{
              color: linkColor,
              textDecoration: 'underline',
              textDecorationColor: linkColor,
              textUnderlineOffset: '2px',
              cursor: 'pointer',
              WebkitAppRegion: 'no-drag' as unknown as undefined,
            }}
            onClick={(e) => { e.stopPropagation(); onLinkClick(seg.value) }}
          >
            {seg.value}
          </span>
        ) : useTwemoji ? (
          <TwemojiText key={i} text={seg.value} fontSize={fontSize} lineHeight={1.6} color={color} />
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </span>
  )
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

interface ExternalLinkWarningProps {
  url: string | null
  onClose: () => void
  onConfirm: () => void
}

export function ExternalLinkWarning({ url, onClose, onConfirm }: ExternalLinkWarningProps): React.ReactElement {
  const domain = url ? getDomain(url) : ''

  return (
    <AnimatePresence>
      {url && (
        <Box position="fixed" inset={0} zIndex={500} display="flex" alignItems="center" justifyContent="center">
          {/* Backdrop */}
          <MotionBox
            position="absolute" inset={0} bg="rgba(0,0,0,0.55)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Panel */}
          <MotionBox
            position="relative" zIndex={1}
            bg={C.panel} border={`1px solid ${C.border}`}
            borderRadius="18px" boxShadow="0 24px 64px rgba(0,0,0,0.7)"
            w="360px" p={6}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <Flex
              w="44px" h="44px" borderRadius="12px" mb={4}
              bg="#f59e0b14" border="1px solid #f59e0b30"
              align="center" justify="center"
            >
              <LuExternalLink size={18} color="#f59e0b" />
            </Flex>

            <Text fontSize="sm" fontWeight="600" color={C.textPrimary} mb="6px">
              Opening external link
            </Text>
            <Text fontSize="xs" color={C.textMuted} lineHeight="1.7" mb={4}>
              You're about to leave Acuate.chat and open{' '}
              <Text as="span" color={C.textSecondary} fontWeight="500">{domain}</Text>
              {' '}in your browser.
            </Text>

            <Box px={3} py="8px" mb={5} bg={C.elevated} borderRadius="8px" border={`1px solid ${C.border}`}>
              <Text fontSize="11px" color={C.textMuted} isTruncated>{url}</Text>
            </Box>

            <HStack spacing={3}>
              <Flex
                flex={1} h="38px" borderRadius="10px"
                bg={C.elevated} border={`1px solid ${C.border}`}
                align="center" justify="center" cursor="pointer"
                _hover={{ bg: C.hover }} onClick={onClose}
                sx={{ transition: 'all 0.12s' }}
              >
                <Text fontSize="sm" fontWeight="500" color={C.textSecondary}>Cancel</Text>
              </Flex>
              <Flex
                flex={1} h="38px" borderRadius="10px"
                bg="#f59e0b18" border="1px solid #f59e0b35"
                align="center" justify="center" cursor="pointer" gap={2}
                _hover={{ bg: '#f59e0b28' }} onClick={onConfirm}
                sx={{ transition: 'all 0.12s' }}
              >
                <LuExternalLink size={13} color="#f59e0b" />
                <Text fontSize="sm" fontWeight="600" color="#f59e0b">Open</Text>
              </Flex>
            </HStack>
          </MotionBox>
        </Box>
      )}
    </AnimatePresence>
  )
}

// Hook that manages the warning modal state — keeps ChatView/GroupChatView tidy
export function useLinkWarning(): {
  pendingUrl: string | null
  handleLinkClick: (url: string) => void
  handleConfirm: () => void
  handleClose: () => void
} {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  const handleLinkClick = (url: string) => setPendingUrl(url)
  const handleConfirm = () => {
    if (pendingUrl) window.open(pendingUrl, '_blank')
    setPendingUrl(null)
  }
  const handleClose = () => setPendingUrl(null)

  return { pendingUrl, handleLinkClick, handleConfirm, handleClose }
}
