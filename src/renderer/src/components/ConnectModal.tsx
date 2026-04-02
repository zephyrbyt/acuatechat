import React, { useState, useCallback } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalBody,
  VStack, HStack, Box, Text, Button, Input, Textarea, Flex
} from '@chakra-ui/react'
import { LuX, LuUserPlus, LuTriangleAlert, LuGlobe } from 'react-icons/lu'
import type { Contact } from '../App'
import { C } from '../theme'

interface ConnectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (contact: Contact) => void
}

export function ConnectModal({ isOpen, onClose, onSuccess }: ConnectModalProps): React.ReactElement {
  const [inviteCode, setInviteCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = useCallback(() => {
    if (loading) return
    setInviteCode(''); setNickname(''); setError(null); onClose()
  }, [loading, onClose])

  const handleConnect = useCallback(async () => {
    const code = inviteCode.trim()
    if (!code) { setError('Please enter an invite code'); return }
    setLoading(true); setError(null)
    try {
      const result = await window.acuate.connect(code, nickname.trim())
      if (result.success && result.contact) {
        setInviteCode(''); setNickname(''); setError(null); onSuccess(result.contact as Contact)
      } else {
        setError(result.error ?? 'Failed to connect')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [inviteCode, nickname, onSuccess])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleConnect()
  }, [handleConnect])

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" isCentered>
      <ModalOverlay bg="rgba(8,8,14,0.85)" backdropFilter="blur(8px)" />
      <ModalContent bg={C.elevated} border={`1px solid ${C.border}`} borderRadius="20px" mx={4}
        boxShadow="0 25px 80px rgba(0,0,0,0.6)">

        <Flex px={5} pt={5} pb={4} borderBottom={`1px solid ${C.borderFaint}`} align="center" justify="space-between">
          <HStack spacing={3}>
            <Flex w="32px" h="32px" borderRadius="9px" bg={C.accentGlow} align="center" justify="center">
              <LuUserPlus size={15} color={C.accent} />
            </Flex>
            <Text fontWeight="600" color={C.textPrimary} fontSize="md">Add Contact</Text>
          </HStack>
          <Flex as="button" onClick={handleClose} w="28px" h="28px" borderRadius="8px"
            bg="transparent" _hover={{ bg: C.hover }} align="center" justify="center"
            cursor={loading ? 'not-allowed' : 'pointer'} opacity={loading ? 0.4 : 1}>
            <LuX size={15} color={C.textSecondary} />
          </Flex>
        </Flex>

        <ModalBody px={5} py={5}>
          <VStack spacing={4} align="stretch">
            <Text fontSize="sm" color={C.textSecondary} lineHeight="1.6">
              Paste the invite code shared by the person you want to chat with.
            </Text>

            <VStack spacing={1} align="stretch">
              <Text fontSize="xs" fontWeight="600" color={C.textSecondary}
                textTransform="uppercase" letterSpacing="0.5px">Their invite code</Text>
              <Textarea
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste invite code here…"
                isDisabled={loading}
                bg={C.surface} border={`1px solid ${C.border}`} borderRadius="10px"
                color={C.accent} fontFamily="mono" fontSize="xs"
                rows={4} resize="none"
                _placeholder={{ color: C.textMuted, fontFamily: 'body' }}
                _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }}
                lineHeight="1.6"
              />
            </VStack>

            <VStack spacing={1} align="stretch">
              <HStack>
                <Text fontSize="xs" fontWeight="600" color={C.textSecondary}
                  textTransform="uppercase" letterSpacing="0.5px">Nickname</Text>
                <Text fontSize="xs" color={C.textMuted}>(optional)</Text>
              </HStack>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Give them a nickname…"
                isDisabled={loading}
                bg={C.surface} border={`1px solid ${C.border}`} borderRadius="10px"
                color={C.textPrimary}
                _placeholder={{ color: C.textMuted }}
                _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }}
                maxLength={50}
              />
            </VStack>

            {error && (
              <HStack spacing={2} bg="#f8714715" border={`1px solid ${C.red}30`}
                borderRadius="10px" px={3} py="10px">
                <LuTriangleAlert size={14} color={C.red} style={{ flexShrink: 0 }} />
                <Text fontSize="sm" color={C.red}>{error}</Text>
              </HStack>
            )}

            <HStack spacing={2} bg={C.surface} border={`1px solid ${C.borderFaint}`}
              borderRadius="10px" px={3} py="10px">
              <LuGlobe size={13} color={C.textMuted} style={{ flexShrink: 0 }} />
              <Text fontSize="xs" color={C.textSecondary} lineHeight="1.5">
                Connection is routed through Tor. This may take 30–60 seconds.
              </Text>
            </HStack>

            <HStack spacing={3} justify="flex-end" pt={1}>
              <Button variant="ghost" onClick={handleClose} isDisabled={loading}
                color={C.textSecondary} _hover={{ bg: C.hover, color: C.textPrimary }}>
                Cancel
              </Button>
              <Button onClick={handleConnect} isLoading={loading} loadingText="Connecting…"
                isDisabled={!inviteCode.trim()} borderRadius="10px">
                Connect
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
