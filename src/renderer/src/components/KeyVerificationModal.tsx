import React, { useState, useEffect, useCallback } from 'react'
import { Box, Flex, Text, VStack, HStack } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuShieldCheck, LuCopy, LuCheck, LuX, LuShieldAlert } from 'react-icons/lu'
import { C } from '../theme'

const MotionBox = motion(Box)

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Consistent fingerprint for a single key — shown per-user
async function keyFingerprint(key: string): Promise<string> {
  const hex = await sha256Hex(key)
  return hex.slice(0, 16).match(/.{4}/g)?.join(' ') ?? hex
}

// Session code — hash of both keys sorted, so both users get the same value
async function sessionCode(keyA: string, keyB: string): Promise<string> {
  const [first, second] = [keyA, keyB].sort()
  const hex = await sha256Hex(first + '|' + second)
  return hex.slice(0, 40).match(/.{5}/g)?.join(' · ') ?? hex
}

interface KeyVerificationModalProps {
  isOpen: boolean
  myPublicKey: string
  contactPublicKey: string
  contactName: string
  onClose: () => void
}

interface FingerprintRowProps {
  label: string
  fingerprint: string | null
}

function FingerprintRow({ label, fingerprint }: FingerprintRowProps): React.ReactElement {
  return (
    <Box
      px={4} py="12px"
      bg={C.card} border={`1px solid ${C.border}`}
      borderRadius="10px"
      flex={1}
    >
      <Text fontSize="10px" fontWeight="600" color={C.textFaint} textTransform="uppercase" letterSpacing="0.7px" mb="6px">
        {label}
      </Text>
      {fingerprint ? (
        <Text
          fontSize="13px" fontWeight="600" color={C.textPrimary}
          fontFamily="monospace" letterSpacing="0.05em" lineHeight="1.5"
        >
          {fingerprint}
        </Text>
      ) : (
        <Box h="20px" bg={C.elevated} borderRadius="4px" w="80%" />
      )}
    </Box>
  )
}

export function KeyVerificationModal({ isOpen, myPublicKey, contactPublicKey, contactName, onClose }: KeyVerificationModalProps): React.ReactElement {
  const [myFp, setMyFp] = useState<string | null>(null)
  const [theirFp, setTheirFp] = useState<string | null>(null)
  const [session, setSession] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    keyFingerprint(myPublicKey).then(setMyFp)
    keyFingerprint(contactPublicKey).then(setTheirFp)
    sessionCode(myPublicKey, contactPublicKey).then(setSession)
  }, [myPublicKey, contactPublicKey])

  const handleCopy = useCallback(() => {
    if (!session) return
    navigator.clipboard.writeText(session)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [session])

  return (
    <AnimatePresence>
      {isOpen && (
        <Box position="fixed" inset={0} zIndex={500} display="flex" alignItems="center" justifyContent="center">
          {/* Backdrop */}
          <MotionBox
            position="absolute" inset={0} bg="rgba(0,0,0,0.6)"
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
            borderRadius="20px" boxShadow="0 24px 64px rgba(0,0,0,0.7)"
            w="440px" overflow="hidden"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <Flex px={6} pt={6} pb={5} align="center" gap={3} borderBottom={`1px solid ${C.borderFaint}`}>
              <Flex
                w="40px" h="40px" borderRadius="12px" flexShrink={0}
                bg="#34d39914" border="1px solid #34d39930"
                align="center" justify="center"
              >
                <LuShieldCheck size={18} color="#34d399" />
              </Flex>
              <Box flex={1}>
                <Text fontWeight="600" color={C.textPrimary} fontSize="sm" letterSpacing="-0.2px">
                  Verify Encryption
                </Text>
                <Text fontSize="xs" color={C.textMuted} mt="1px">
                  Confirm your chat with {contactName} is authentic
                </Text>
              </Box>
              <Flex
                w="28px" h="28px" borderRadius="8px" cursor="pointer"
                align="center" justify="center"
                color={C.textMuted} _hover={{ bg: C.hover, color: C.textSecondary }}
                onClick={onClose} sx={{ transition: 'all 0.12s' }}
              >
                <LuX size={14} />
              </Flex>
            </Flex>

            <Box px={6} py={5}>
              {/* Individual key fingerprints */}
              <Text fontSize="11px" fontWeight="600" color={C.textFaint} textTransform="uppercase" letterSpacing="0.7px" mb={3}>
                Key Fingerprints
              </Text>
              <HStack spacing={3} mb={5} align="stretch">
                <FingerprintRow label="You" fingerprint={myFp} />
                <FingerprintRow label={contactName} fingerprint={theirFp} />
              </HStack>

              {/* Session code */}
              <Text fontSize="11px" fontWeight="600" color={C.textFaint} textTransform="uppercase" letterSpacing="0.7px" mb={3}>
                Session Code
              </Text>
              <Box
                px={4} py={4}
                bg={C.card} border="1px solid #34d39922"
                borderRadius="12px" mb={4} position="relative"
              >
                {session ? (
                  <Text
                    fontSize="14px" fontWeight="700" color="#34d399"
                    fontFamily="monospace" letterSpacing="0.08em" lineHeight="1.8"
                    wordBreak="break-all"
                  >
                    {session}
                  </Text>
                ) : (
                  <VStack spacing={2} align="stretch">
                    {[1, 0.85, 0.6].map((w, i) => (
                      <Box key={i} h="16px" bg={C.elevated} borderRadius="4px" w={`${w * 100}%`} />
                    ))}
                  </VStack>
                )}
                <Flex
                  position="absolute" top={3} right={3}
                  as="button" cursor="pointer"
                  w="28px" h="28px" borderRadius="7px"
                  align="center" justify="center"
                  bg={copied ? '#34d39920' : C.elevated}
                  border={`1px solid ${copied ? '#34d39935' : C.border}`}
                  color={copied ? '#34d399' : C.textMuted}
                  _hover={{ bg: C.hover, color: C.textSecondary }}
                  onClick={handleCopy}
                  sx={{ transition: 'all 0.15s' }}
                  title="Copy session code"
                >
                  {copied ? <LuCheck size={12} /> : <LuCopy size={12} />}
                </Flex>
              </Box>

              {/* Instruction */}
              <Box
                px={4} py="10px"
                bg="#f59e0b0a" border="1px solid #f59e0b20"
                borderRadius="10px"
              >
                <HStack spacing="8px" align="flex-start">
                  <LuShieldAlert size={13} color="#f59e0b" style={{ marginTop: '1px', flexShrink: 0 }} />
                  <Text fontSize="xs" color={C.textMuted} lineHeight="1.7">
                    Call or meet {contactName} and read the <Text as="span" color="#f59e0b" fontWeight="500">Session Code</Text> aloud.
                    If they see the same code, your connection is genuine and has not been intercepted.
                  </Text>
                </HStack>
              </Box>
            </Box>
          </MotionBox>
        </Box>
      )}
    </AnimatePresence>
  )
}
