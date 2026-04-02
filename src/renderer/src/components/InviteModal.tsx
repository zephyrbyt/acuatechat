import React, { useState, useEffect, useCallback } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalBody,
  VStack, HStack, Box, Text, Button, Flex, Spinner, useClipboard
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { LuX, LuShare2, LuCopy, LuCheck, LuCircleAlert, LuLock } from 'react-icons/lu'
import { QRCodeSVG } from 'qrcode.react'
import { C } from '../theme'

const MotionBox = motion(Box)

interface InviteModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InviteModal({ isOpen, onClose }: InviteModalProps): React.ReactElement {
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { hasCopied, onCopy } = useClipboard(inviteCode ?? '')

  const fetchCode = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const code = await window.acuate.getInviteCode()
      if (code) setInviteCode(code)
      else setError('Tor is not connected yet. Please wait and try again.')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isOpen) fetchCode() }, [isOpen, fetchCode])

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay bg="rgba(8,8,14,0.85)" backdropFilter="blur(8px)" />
      <ModalContent bg={C.elevated} border={`1px solid ${C.border}`} borderRadius="20px" mx={4}
        boxShadow="0 25px 80px rgba(0,0,0,0.6)">

        {/* Header */}
        <Flex px={5} pt={5} pb={4} borderBottom={`1px solid ${C.borderFaint}`} align="center" justify="space-between">
          <HStack spacing={3}>
            <Flex w="32px" h="32px" borderRadius="9px" bg={C.accentGlow} align="center" justify="center">
              <LuShare2 size={15} color={C.accent} />
            </Flex>
            <Text fontWeight="600" color={C.textPrimary} fontSize="md">Share Your Code</Text>
          </HStack>
          <Flex as="button" onClick={onClose} w="28px" h="28px" borderRadius="8px"
            bg="transparent" _hover={{ bg: C.hover }} align="center" justify="center" cursor="pointer">
            <LuX size={15} color={C.textSecondary} />
          </Flex>
        </Flex>

        <ModalBody px={5} py={5}>
          {loading ? (
            <Flex justify="center" align="center" py={12} direction="column" gap={3}>
              <Spinner color={C.accent} size="md" thickness="2px" />
              <Text color={C.textSecondary} fontSize="sm">Waiting for Tor…</Text>
            </Flex>
          ) : error ? (
            <VStack spacing={4} py={4}>
              <Flex w="48px" h="48px" borderRadius="14px" bg="#f8714715"
                border={`1px solid ${C.red}30`} align="center" justify="center">
                <LuCircleAlert size={22} color={C.red} />
              </Flex>
              <Text fontSize="sm" color={C.red} textAlign="center">{error}</Text>
              <Button onClick={fetchCode} size="sm">Try again</Button>
            </VStack>
          ) : inviteCode ? (
            <VStack spacing={5} align="stretch">
              <Text fontSize="sm" color={C.textSecondary} lineHeight="1.6">
                Share this code with someone to establish an encrypted connection over Tor.
              </Text>

              {/* QR */}
              <Flex justify="center">
                <Box bg="white" p={4} borderRadius="16px" boxShadow="0 4px 20px rgba(0,0,0,0.3)">
                  <QRCodeSVG value={inviteCode} size={172} level="M" includeMargin={false} />
                </Box>
              </Flex>

              {/* Code */}
              <Box>
                <Text fontSize="10px" fontWeight="600" color={C.textMuted} textTransform="uppercase"
                  letterSpacing="0.6px" mb={2}>Invite Code</Text>
                <Box bg={C.surface} border={`1px solid ${C.border}`} borderRadius="10px" p={3}
                  maxH="76px" overflowY="auto" sx={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
                  <Text fontFamily="mono" color={C.accent} fontSize="xs" wordBreak="break-all"
                    lineHeight="1.6">{inviteCode}</Text>
                </Box>
              </Box>

              <Button onClick={onCopy} w="full" borderRadius="11px"
                bg={hasCopied ? C.green : C.accent}
                _hover={{ bg: hasCopied ? C.green : C.accentHover }}
                leftIcon={hasCopied ? <LuCheck size={15} /> : <LuCopy size={15} />}>
                {hasCopied ? 'Copied!' : 'Copy code'}
              </Button>

              <HStack spacing={2} bg={C.surface} border={`1px solid ${C.borderFaint}`}
                borderRadius="10px" px={3} py="10px">
                <LuLock size={13} color={C.textMuted} style={{ flexShrink: 0 }} />
                <Text fontSize="xs" color={C.textSecondary} lineHeight="1.5">
                  Contains your .onion address and public key. Only share with people you trust.
                </Text>
              </HStack>
            </VStack>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
