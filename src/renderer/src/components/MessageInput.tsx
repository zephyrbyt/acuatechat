import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Box, Flex, Textarea, Text } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { LuSend, LuPaperclip, LuX, LuFileVideo, LuImage } from 'react-icons/lu'
import type { Attachment } from '../App'
import { C } from '../theme'

const MotionBox = motion(Box)

const ACCEPTED = 'image/png,image/jpeg,image/gif,video/mp4'
const MAX_BYTES = 10 * 1024 * 1024

interface MessageInputProps {
  onSend: (content: string, attachment?: Attachment) => Promise<void>
  onTyping?: (typing: boolean) => void
  isDisabled?: boolean
  placeholder?: string
  contactName?: string
}

export function MessageInput({
  onSend,
  onTyping,
  isDisabled = false,
  placeholder = 'Type a message…',
}: MessageInputProps): React.ReactElement {
  const [value, setValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        onTyping?.(false)
        isTypingRef.current = false
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    if (!file) return

    if (file.size > MAX_BYTES) {
      setFileError(`File too large — max 10 MB (this file is ${(file.size / 1024 / 1024).toFixed(1)} MB)`)
      return
    }

    setFileError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setAttachment({ type: file.type as Attachment['type'], name: file.name, data: ev.target.result })
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const clearAttachment = useCallback(() => {
    setAttachment(null)
    setFileError(null)
  }, [])

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    if (isTypingRef.current) {
      onTyping?.(false)
      isTypingRef.current = false
    }
  }, [onTyping])

  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue)
    if (!onTyping || isDisabled) return
    if (newValue.trim().length > 0) {
      if (!isTypingRef.current) { onTyping(true); isTypingRef.current = true }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(stopTyping, 3000)
    } else {
      stopTyping()
    }
  }, [onTyping, isDisabled, stopTyping])

  const handleSend = useCallback(async () => {
    const content = value.trim()
    if ((!content && !attachment) || isSending || isDisabled) return
    stopTyping()
    setIsSending(true)
    const pendingAttachment = attachment
    setValue('')
    setAttachment(null)
    setFileError(null)
    try {
      await onSend(content, pendingAttachment ?? undefined)
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }, [value, attachment, isSending, isDisabled, onSend, stopTyping])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const canSend = (value.trim().length > 0 || !!attachment) && !isDisabled && !isSending
  const isVideo = attachment?.type === 'video/mp4'

  return (
    <Box
      px={6} py={4}
      bg={C.surface}
      borderTop={`1px solid ${C.borderFaint}`}
      flexShrink={0}
    >
      {/* Attachment preview */}
      {attachment && (
        <Box mb={3} display="inline-block" position="relative">
          <Box
            borderRadius="12px" overflow="hidden"
            border={`1px solid ${C.border}`} bg={C.elevated}
            position="relative"
          >
            {isVideo ? (
              <Flex
                w="160px" h="90px" bg={C.card}
                align="center" justify="center" direction="column" gap={2}
              >
                <LuFileVideo size={24} color={C.textMuted} />
                <Text fontSize="xs" color={C.textMuted} noOfLines={1} maxW="130px" px={2}>
                  {attachment.name}
                </Text>
              </Flex>
            ) : (
              <Box
                as="img" src={attachment.data} alt={attachment.name}
                w="160px" h="90px" objectFit="cover" display="block"
              />
            )}
          </Box>
          {/* Remove button */}
          <Flex
            position="absolute" top="-7px" right="-7px"
            w="20px" h="20px" borderRadius="full"
            bg={C.card} border={`1px solid ${C.border}`}
            align="center" justify="center" cursor="pointer"
            onClick={clearAttachment} zIndex={1}
            _hover={{ bg: C.hover }}
            boxShadow="0 2px 8px rgba(0,0,0,0.3)"
          >
            <LuX size={10} color={C.textSecondary} />
          </Flex>
          <Text fontSize="10px" color={C.textMuted} mt="5px" noOfLines={1} maxW="160px">
            {attachment.name}
          </Text>
        </Box>
      )}

      {/* File error */}
      {fileError && (
        <Flex
          align="center" gap={2} mb={3} px={3} py="8px"
          bg={`${C.red}0f`} border={`1px solid ${C.red}25`} borderRadius="10px"
        >
          <Text fontSize="xs" color={C.red} flex={1}>{fileError}</Text>
          <Box cursor="pointer" onClick={() => setFileError(null)} color={C.red} opacity={0.7}>
            <LuX size={12} />
          </Box>
        </Flex>
      )}

      {/* Input row */}
      <Flex
        align="flex-end" gap={3}
        bg={C.elevated}
        borderRadius="14px"
        border={`1px solid ${C.border}`}
        sx={{
          '&:focus-within': {
            borderColor: C.borderMid,
            boxShadow: `0 0 0 3px ${C.accent}15`
          },
          transition: 'box-shadow 0.15s, border-color 0.15s'
        }}
        px={4} py="10px"
      >
        {/* Attach */}
        <Flex
          as="button"
          onClick={() => !isDisabled && fileInputRef.current?.click()}
          w="32px" h="32px" borderRadius="9px" flexShrink={0}
          align="center" justify="center"
          color={attachment ? C.accent : C.textMuted}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.3 : 1}
          _hover={isDisabled ? {} : { color: C.textSecondary, bg: C.hover }}
          sx={{ transition: 'all 0.12s' }}
          title="Attach file"
        >
          {attachment ? <LuImage size={17} /> : <LuPaperclip size={17} />}
        </Flex>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          isDisabled={isDisabled || isSending}
          resize="none"
          minH="unset"
          maxH="130px"
          rows={1}
          border="none"
          _focus={{ boxShadow: 'none', border: 'none' }}
          _disabled={{ opacity: 0.35, cursor: 'not-allowed' }}
          bg="transparent"
          color={C.textPrimary}
          _placeholder={{ color: C.textMuted }}
          fontSize="sm"
          lineHeight="1.6"
          letterSpacing="-0.1px"
          flex={1}
          p={0}
          overflowY="auto"
          sx={{ '&::-webkit-scrollbar': { display: 'none' } }}
        />

        {/* Send button */}
        <MotionBox
          flexShrink={0}
          animate={{ scale: canSend ? 1 : 0.88, opacity: canSend ? 1 : 0.3 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          <Flex
            as="button"
            onClick={handleSend}
            w="36px" h="36px" borderRadius="10px"
            bg={canSend ? C.accent : C.hover}
            align="center" justify="center"
            cursor={canSend ? 'pointer' : 'not-allowed'}
            boxShadow={canSend ? `0 4px 14px ${C.accent}45` : 'none'}
            sx={{ transition: 'all 0.15s' }}
            _hover={canSend ? { bg: C.accentHover, transform: 'translateY(-1px)' } : {}}
            _active={canSend ? { transform: 'scale(0.93)' } : {}}
          >
            <LuSend size={15} color={canSend ? 'white' : C.textMuted} style={{ marginLeft: '-1px' }} />
          </Flex>
        </MotionBox>
      </Flex>
    </Box>
  )
}
