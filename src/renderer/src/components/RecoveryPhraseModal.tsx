import React, { useState, useCallback, useMemo } from 'react'
import {
  Modal, ModalOverlay, ModalContent, ModalBody,
  Button, Text, Box, SimpleGrid, Flex, Input, VStack, HStack
} from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuKey, LuDownload, LuCopy, LuCheck, LuTriangleAlert, LuArrowRight, LuArrowLeft } from 'react-icons/lu'
import { C } from '../theme'

const MotionBox = motion(Box)

interface RecoveryPhraseModalProps {
  phrase: string
  onConfirmed: () => void
}

export function RecoveryPhraseModal({ phrase, onConfirmed }: RecoveryPhraseModalProps): React.ReactElement {
  const words = useMemo(() => phrase.split(' '), [phrase])
  const [step, setStep] = useState<'show' | 'confirm'>('show')
  const [challengeIndex, setChallengeIndex] = useState(() => Math.floor(Math.random() * phrase.split(' ').length))
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(phrase)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [phrase])

  const handleDownload = useCallback(() => {
    const content = [
      'Acuate.chat Recovery Phrase',
      '==========================',
      '',
      ...phrase.split(' ').map((word, i) => `${String(i + 1).padStart(2, '0')}. ${word}`),
      '',
      'Keep this file somewhere safe and private.',
      'Anyone with these words can access your account.',
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'acuate-chat-recovery.txt'; a.click()
    URL.revokeObjectURL(url)
  }, [phrase])

  const handleConfirm = useCallback(() => {
    if (input.trim().toLowerCase() === words[challengeIndex]) {
      onConfirmed()
    } else {
      setError(true); setInput('')
    }
  }, [input, words, challengeIndex, onConfirmed])

  return (
    <Modal isOpen onClose={() => {}} closeOnOverlayClick={false} closeOnEsc={false} isCentered size="lg">
      <ModalOverlay bg="rgba(8,8,14,0.9)" backdropFilter="blur(8px)" />
      <ModalContent bg={C.elevated} border={`1px solid ${C.border}`} borderRadius="20px" mx={4}
        boxShadow="0 25px 80px rgba(0,0,0,0.6)">

        {/* Header */}
        <Flex px={5} pt={5} pb={4} borderBottom={`1px solid ${C.borderFaint}`} align="center" gap={3}>
          <Flex w="32px" h="32px" borderRadius="9px" bg={`${C.amber}18`} border={`1px solid ${C.amber}35`}
            align="center" justify="center" flexShrink={0}>
            <LuKey size={15} color={C.amber} />
          </Flex>
          <Box>
            <Text fontWeight="600" color={C.textPrimary} fontSize="md">
              {step === 'show' ? 'Save Your Recovery Phrase' : 'Confirm Your Phrase'}
            </Text>
            <Text fontSize="xs" color={C.textMuted}>
              Step {step === 'show' ? '1' : '2'} of 2
            </Text>
          </Box>
        </Flex>

        <ModalBody px={5} py={5}>
          <AnimatePresence mode="wait">
            {step === 'show' ? (
              <MotionBox key="show" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <VStack spacing={5} align="stretch">
                  <Text fontSize="sm" color={C.textSecondary} lineHeight="1.6">
                    Write these 12 words down and store them somewhere safe. This is the{' '}
                    <Text as="span" color={C.amber} fontWeight="600">only way</Text> to recover your
                    account if you forget your passphrase.
                  </Text>

                  {/* Word grid */}
                  <Box bg={C.surface} borderRadius="14px" border={`1px solid ${C.border}`} p={4}>
                    <SimpleGrid columns={3} spacing={2}>
                      {words.map((word, i) => (
                        <HStack key={i} bg={C.card} borderRadius="8px" px={3} py="7px"
                          border={`1px solid ${C.borderFaint}`} spacing={2}>
                          <Text fontSize="10px" color={C.textMuted} w="14px" flexShrink={0} fontWeight="600">
                            {i + 1}
                          </Text>
                          <Text fontSize="sm" color={C.textPrimary} fontWeight="500" fontFamily="mono">
                            {word}
                          </Text>
                        </HStack>
                      ))}
                    </SimpleGrid>
                  </Box>

                  {/* Actions */}
                  <HStack spacing={2}>
                    <Button variant="ghost" size="sm" leftIcon={<LuCopy size={13} />}
                      color={copied ? C.green : C.textSecondary}
                      _hover={{ color: C.textPrimary, bg: C.hover }}
                      onClick={handleCopy} flex={1}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button variant="ghost" size="sm" leftIcon={<LuDownload size={13} />}
                      color={C.textSecondary} _hover={{ color: C.textPrimary, bg: C.hover }}
                      onClick={handleDownload} flex={1}>
                      Download file
                    </Button>
                  </HStack>

                  <HStack spacing={2} bg="#fbbf2412" border={`1px solid ${C.amber}30`}
                    borderRadius="10px" px={3} py="10px">
                    <LuTriangleAlert size={14} color={C.amber} style={{ flexShrink: 0 }} />
                    <Text fontSize="xs" color={C.amber} lineHeight="1.5">
                      Never share this phrase. Anyone with it can access your account.
                    </Text>
                  </HStack>

                  <Button w="full" borderRadius="11px" rightIcon={<LuArrowRight size={15} />}
                    onClick={() => setStep('confirm')}>
                    I've saved it
                  </Button>
                </VStack>
              </MotionBox>
            ) : (
              <MotionBox key="confirm" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <VStack spacing={5} align="stretch">
                  <Text fontSize="sm" color={C.textSecondary} lineHeight="1.6">
                    Enter word{' '}
                    <Text as="span" color={C.textPrimary} fontWeight="600">#{challengeIndex + 1}</Text>{' '}
                    from your recovery phrase to confirm you've saved it.
                  </Text>

                  <VStack spacing={1} align="stretch">
                    <Text fontSize="xs" fontWeight="600" color={C.textSecondary}
                      textTransform="uppercase" letterSpacing="0.5px">
                      Word #{challengeIndex + 1}
                    </Text>
                    <Input
                      value={input}
                      onChange={(e) => { setInput(e.target.value); setError(false) }}
                      onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                      placeholder={`Enter word #${challengeIndex + 1}`}
                      bg={C.surface} borderRadius="10px" fontFamily="mono"
                      border={`1px solid ${error ? C.red : C.border}`}
                      color={C.textPrimary} _placeholder={{ color: C.textMuted }}
                      _focus={{ borderColor: error ? C.red : C.accent, boxShadow: 'none' }}
                      autoFocus
                    />
                    {error && (
                      <Text fontSize="sm" color={C.red}>
                        Incorrect — check your phrase and try again.
                      </Text>
                    )}
                  </VStack>

                  <HStack spacing={3}>
                    <Button variant="ghost" leftIcon={<LuArrowLeft size={14} />}
                      onClick={() => { setStep('show'); setInput(''); setError(false); setChallengeIndex(Math.floor(Math.random() * words.length)) }}
                      color={C.textSecondary} _hover={{ bg: C.hover, color: C.textPrimary }}>
                      Back
                    </Button>
                    <Button flex={1} borderRadius="11px" isDisabled={!input.trim()}
                      onClick={handleConfirm}>
                      Confirm
                    </Button>
                  </HStack>
                </VStack>
              </MotionBox>
            )}
          </AnimatePresence>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
