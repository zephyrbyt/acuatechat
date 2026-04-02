import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Box, Flex, Textarea, Text } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuSend, LuPaperclip, LuX, LuFileVideo, LuImage, LuSmile } from 'react-icons/lu'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import type { Attachment } from '../App'
import { SlashCommandMenu, SlashCommand } from './SlashCommandMenu'
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
  slashCommands?: SlashCommand[]
}

export function MessageInput({
  onSend,
  onTyping,
  isDisabled = false,
  placeholder = 'Type a message…',
  slashCommands = [],
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

  const [showPicker, setShowPicker] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)

  const showSlashMenu = value.startsWith('/') && !value.includes(' ') && slashCommands.length > 0
  const slashQuery = showSlashMenu ? value.slice(1) : ''
  const filteredSlash = slashQuery
    ? slashCommands.filter(c => c.command.startsWith(slashQuery.toLowerCase()))
    : slashCommands

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    cmd.onSelect()
    handleValueChange('')
    setSlashIndex(0)
    textareaRef.current?.focus()
  }, [handleValueChange])

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    const textarea = textareaRef.current
    const native = emoji.native
    if (!textarea) { handleValueChange(value + native); return }
    const start = textarea.selectionStart ?? value.length
    const end = textarea.selectionEnd ?? value.length
    const next = value.slice(0, start) + native + value.slice(end)
    handleValueChange(next)
    setShowPicker(false)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + native.length, start + native.length)
    })
  }, [value, handleValueChange])

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
    if (showSlashMenu && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex(i => Math.min(i + 1, filteredSlash.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        handleValueChange('')
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && filteredSlash[slashIndex]) {
        e.preventDefault()
        handleSlashSelect(filteredSlash[slashIndex])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [showSlashMenu, filteredSlash, slashIndex, handleSend, handleSlashSelect, handleValueChange])

  const canSend = (value.trim().length > 0 || !!attachment) && !isDisabled && !isSending
  const isVideo = attachment?.type === 'video/mp4'

  return (
    <Box
      px={6} py={4}
      bg={C.surface}
      borderTop={`1px solid ${C.borderFaint}`}
      flexShrink={0}
      position="relative"
    >
      {/* Slash command menu */}
      <AnimatePresence>
        {showSlashMenu && (
          <motion.div
            style={{ position: 'absolute', bottom: '100%', left: '24px', right: '24px', marginBottom: '8px', zIndex: 100 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <SlashCommandMenu
              commands={slashCommands}
              query={slashQuery}
              selectedIndex={slashIndex}
              onSelect={handleSlashSelect}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji picker */}
      <AnimatePresence>
        {showPicker && (
          <>
            <Box
              position="fixed" inset={0} zIndex={99}
              onClick={() => setShowPicker(false)}
            />
            <motion.div
              style={{ position: 'absolute', bottom: '100%', right: '24px', marginBottom: '8px', zIndex: 100, filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.6))' }}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
                theme="dark"
                previewPosition="none"
                skinTonePosition="search"
                set="native"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
        align="center" gap={3}
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

        {/* Emoji */}
        <Flex
          as="button"
          onClick={() => !isDisabled && setShowPicker(p => !p)}
          w="32px" h="32px" borderRadius="9px" flexShrink={0}
          align="center" justify="center"
          color={showPicker ? C.accent : C.textMuted}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.3 : 1}
          bg={showPicker ? C.accentGlow : 'transparent'}
          _hover={isDisabled ? {} : { color: C.textSecondary, bg: C.hover }}
          sx={{ transition: 'all 0.12s' }}
          title="Emoji"
        >
          <LuSmile size={17} />
        </Flex>

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
