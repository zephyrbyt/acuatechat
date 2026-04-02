import React, { useState, useCallback, useEffect } from 'react'
import { Box, Flex, Text, Button, Input, VStack, InputGroup, InputRightElement, IconButton } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuEye, LuEyeOff, LuShield, LuArrowLeft, LuArrowRight, LuLock } from 'react-icons/lu'
import { C } from '../theme'

const MotionBox = motion(Box)
const MotionFlex = motion(Flex)

type LockMode = 'unlock' | 'setup'
type RecoveryStep = 'phrase' | 'newpass'

interface LockScreenProps {
  mode: LockMode
  onUnlocked: (recoveryPhrase?: string) => void
}

export function LockScreen({ mode, onUnlocked }: LockScreenProps): React.ReactElement {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [recovering, setRecovering] = useState(false)
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('phrase')
  const [recoveryPhrase, setRecoveryPhrase] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [newPassConfirm, setNewPassConfirm] = useState('')

  useEffect(() => { setError(null) }, [passphrase, confirm, recoveryPhrase, newPassphrase, newPassConfirm])

  const handleSubmit = useCallback(async () => {
    if (isLoading) return
    setError(null)
    if (mode === 'setup') {
      if (passphrase.length < 8) { setError('Passphrase must be at least 8 characters'); return }
      if (passphrase !== confirm) { setError('Passphrases do not match'); return }
    }
    if (!passphrase) return
    setIsLoading(true)
    try {
      const result = mode === 'setup'
        ? await window.acuate.setupPassphrase(passphrase)
        : await window.acuate.unlock(passphrase)
      if (result.success) {
        onUnlocked(result.recoveryPhrase)
      } else {
        setError(result.error ?? 'Failed')
      }
    } finally {
      setIsLoading(false)
    }
  }, [passphrase, confirm, mode, isLoading, onUnlocked])

  const handleRecoveryNext = useCallback(() => {
    if (!recoveryPhrase.trim()) return
    setError(null)
    setRecoveryStep('newpass')
  }, [recoveryPhrase])

  const handleRecoverySubmit = useCallback(async () => {
    if (isLoading) return
    setError(null)
    if (newPassphrase.length < 8) { setError('Passphrase must be at least 8 characters'); return }
    if (newPassphrase !== newPassConfirm) { setError('Passphrases do not match'); return }
    setIsLoading(true)
    try {
      const result = await window.acuate.recover(recoveryPhrase.trim().toLowerCase(), newPassphrase)
      if (result.success) {
        onUnlocked(undefined)
      } else {
        setError(result.error ?? 'Failed')
        if (result.error?.toLowerCase().includes('incorrect') || result.error?.toLowerCase().includes('invalid')) {
          setRecoveryStep('phrase')
        }
      }
    } finally {
      setIsLoading(false)
    }
  }, [recoveryPhrase, newPassphrase, newPassConfirm, isLoading, onUnlocked])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    if (recovering) {
      recoveryStep === 'phrase' ? handleRecoveryNext() : handleRecoverySubmit()
    } else {
      handleSubmit()
    }
  }, [recovering, recoveryStep, handleRecoveryNext, handleRecoverySubmit, handleSubmit])

  return (
    <Flex flex={1} w="100%" align="center" justify="center" bg={C.base} position="relative" overflow="hidden">
      {/* Ambient background orbs */}
      <Box position="absolute" top="-20%" left="-10%" w="600px" h="600px" borderRadius="full"
        bg={`radial-gradient(circle, ${C.accent}18 0%, transparent 65%)`} pointerEvents="none" />
      <Box position="absolute" bottom="-15%" right="-10%" w="500px" h="500px" borderRadius="full"
        bg={`radial-gradient(circle, #3ecf8e10 0%, transparent 65%)`} pointerEvents="none" />

      <AnimatePresence mode="wait">
        {recovering ? (
          <MotionBox
            key="recovery"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            w="100%" maxW="420px" mx={4}
          >
            <RecoveryCard
              step={recoveryStep}
              recoveryPhrase={recoveryPhrase}
              newPassphrase={newPassphrase}
              newPassConfirm={newPassConfirm}
              error={error}
              isLoading={isLoading}
              onPhraseChange={setRecoveryPhrase}
              onNewPassChange={setNewPassphrase}
              onConfirmChange={setNewPassConfirm}
              onNext={handleRecoveryNext}
              onSubmit={handleRecoverySubmit}
              onBack={() => { setRecovering(false); setRecoveryStep('phrase'); setRecoveryPhrase(''); setNewPassphrase(''); setNewPassConfirm(''); setError(null) }}
              onBackToPhrase={() => { setRecoveryStep('phrase'); setError(null) }}
              onKeyDown={handleKeyDown}
            />
          </MotionBox>
        ) : (
          <MotionBox
            key="lock"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            w="100%" maxW="420px" mx={4}
          >
            <Box
              bg={C.elevated}
              borderRadius="24px"
              border={`1px solid ${C.border}`}
              p={8}
              boxShadow="0 32px 80px rgba(0,0,0,0.5)"
            >
              <VStack spacing={7} align="stretch">
                {/* Logo + heading */}
                <VStack spacing={3} align="center">
                  <MotionFlex
                    w="56px" h="56px" borderRadius="16px"
                    bg={C.accentGlow} border={`1px solid ${C.accent}40`}
                    align="center" justify="center"
                    initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  >
                    <LuLock size={24} color={C.accent} />
                  </MotionFlex>
                  <VStack spacing={1}>
                    <Text fontSize="xl" fontWeight="700" color={C.textPrimary} letterSpacing="-0.3px">
                      {mode === 'setup' ? 'Protect Your Identity' : 'Welcome back'}
                    </Text>
                    <Text fontSize="sm" color={C.textSecondary} textAlign="center" lineHeight="1.6">
                      {mode === 'setup'
                        ? 'Set a passphrase to encrypt your identity and messages stored on this device.'
                        : 'Enter your passphrase to unlock Acuate.chat.'}
                    </Text>
                  </VStack>
                </VStack>

                {/* Fields */}
                <VStack spacing={3} align="stretch">
                  <VStack spacing={1} align="stretch">
                    <Text fontSize="xs" fontWeight="600" color={C.textSecondary} textTransform="uppercase" letterSpacing="0.5px">
                      Passphrase
                    </Text>
                    <InputGroup>
                      <Input
                        type={showPass ? 'text' : 'password'}
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={mode === 'setup' ? 'Choose a strong passphrase' : 'Enter your passphrase'}
                        bg={C.surface}
                        border={`1px solid ${C.border}`}
                        borderRadius="10px"
                        color={C.textPrimary}
                        _placeholder={{ color: C.textMuted }}
                        _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }}
                        _hover={{ borderColor: C.textMuted }}
                        pr="3rem"
                        autoFocus
                      />
                      <InputRightElement>
                        <IconButton
                          aria-label="Toggle visibility" size="sm" variant="ghost"
                          color={C.textMuted} _hover={{ color: C.textSecondary, bg: 'transparent' }}
                          onClick={() => setShowPass(v => !v)}
                          icon={showPass ? <LuEyeOff size={15} /> : <LuEye size={15} />}
                        />
                      </InputRightElement>
                    </InputGroup>
                  </VStack>

                  {mode === 'setup' && (
                    <VStack spacing={1} align="stretch">
                      <Text fontSize="xs" fontWeight="600" color={C.textSecondary} textTransform="uppercase" letterSpacing="0.5px">
                        Confirm Passphrase
                      </Text>
                      <Input
                        type={showPass ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Repeat your passphrase"
                        bg={C.surface}
                        border={`1px solid ${C.border}`}
                        borderRadius="10px"
                        color={C.textPrimary}
                        _placeholder={{ color: C.textMuted }}
                        _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }}
                        _hover={{ borderColor: C.textMuted }}
                      />
                    </VStack>
                  )}

                  <AnimatePresence>
                    {error && (
                      <MotionBox
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                        bg="#f8714715" border={`1px solid ${C.red}40`} borderRadius="8px" px={3} py={2}
                      >
                        <Text fontSize="sm" color={C.red}>{error}</Text>
                      </MotionBox>
                    )}
                  </AnimatePresence>
                </VStack>

                <Button
                  onClick={handleSubmit} isDisabled={!passphrase || isLoading}
                  isLoading={isLoading} loadingText="Deriving key…"
                  size="lg" w="full" borderRadius="12px"
                  bg={C.accent} color="white" fontWeight="600"
                  _hover={{ bg: C.accentHover }} _disabled={{ opacity: 0.4 }}
                >
                  {mode === 'setup' ? 'Create Account' : 'Unlock'}
                </Button>

                {mode === 'unlock' && (
                  <Button variant="ghost" size="sm" color={C.textMuted} _hover={{ color: C.textSecondary }}
                    onClick={() => setRecovering(true)}
                  >
                    Forgot passphrase?
                  </Button>
                )}

                {mode === 'setup' && (
                  <Text fontSize="xs" color={C.textMuted} textAlign="center" lineHeight="1.6">
                    Your passphrase is never stored. A recovery phrase will be shown next.
                  </Text>
                )}
              </VStack>
            </Box>

            {/* Branding below card */}
            <Flex justify="center" mt={6} gap={2} align="center">
              <LuShield size={12} color={C.textMuted} />
              <Text fontSize="xs" color={C.textMuted}>Acuate.chat · E2EE over Tor</Text>
            </Flex>
          </MotionBox>
        )}
      </AnimatePresence>
    </Flex>
  )
}

function RecoveryCard({
  step, recoveryPhrase, newPassphrase, newPassConfirm, error, isLoading,
  onPhraseChange, onNewPassChange, onConfirmChange,
  onNext, onSubmit, onBack, onBackToPhrase, onKeyDown
}: {
  step: RecoveryStep
  recoveryPhrase: string
  newPassphrase: string
  newPassConfirm: string
  error: string | null
  isLoading: boolean
  onPhraseChange: (v: string) => void
  onNewPassChange: (v: string) => void
  onConfirmChange: (v: string) => void
  onNext: () => void
  onSubmit: () => void
  onBack: () => void
  onBackToPhrase: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}): React.ReactElement {
  return (
    <Box bg={C.elevated} borderRadius="24px" border={`1px solid ${C.border}`} p={8}
      boxShadow="0 32px 80px rgba(0,0,0,0.5)">
      <VStack spacing={6} align="stretch">
        <VStack spacing={3} align="center">
          <Flex w="56px" h="56px" borderRadius="16px" bg={`${C.amber}15`} border={`1px solid ${C.amber}40`}
            align="center" justify="center">
            <LuShield size={24} color={C.amber} />
          </Flex>
          <VStack spacing={1}>
            <Text fontSize="xl" fontWeight="700" color={C.textPrimary} letterSpacing="-0.3px">Account Recovery</Text>
            <Text fontSize="sm" color={C.textSecondary} textAlign="center">
              {step === 'phrase' ? 'Enter your 12-word recovery phrase.' : 'Set a new passphrase.'}
            </Text>
          </VStack>
        </VStack>

        <AnimatePresence mode="wait">
          {step === 'phrase' ? (
            <MotionBox key="phrase" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <VStack spacing={3} align="stretch">
                <Text fontSize="xs" fontWeight="600" color={C.textSecondary} textTransform="uppercase" letterSpacing="0.5px">Recovery Phrase</Text>
                <Box
                  as="textarea"
                  value={recoveryPhrase}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onPhraseChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="word1 word2 word3 … word12"
                  bg={C.surface}
                  border={`1px solid ${C.border}`}
                  borderRadius="10px"
                  color={C.textPrimary}
                  fontFamily="mono"
                  fontSize="sm"
                  p={3}
                  h="90px"
                  resize="none"
                  outline="none"
                  width="100%"
                  _focus={{ borderColor: C.accent }}
                  sx={{ '&::placeholder': { color: C.textMuted }, '&:focus': { borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` } }}
                  autoFocus
                />
                {error && <Text fontSize="sm" color={C.red}>{error}</Text>}
                <Button onClick={onNext} isDisabled={!recoveryPhrase.trim()} rightIcon={<LuArrowRight size={15} />}>
                  Next
                </Button>
              </VStack>
            </MotionBox>
          ) : (
            <MotionBox key="newpass" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <VStack spacing={3} align="stretch">
                <VStack spacing={1} align="stretch">
                  <Text fontSize="xs" fontWeight="600" color={C.textSecondary} textTransform="uppercase" letterSpacing="0.5px">New Passphrase</Text>
                  <Input type="password" value={newPassphrase} onChange={(e) => onNewPassChange(e.target.value)}
                    onKeyDown={onKeyDown} placeholder="At least 8 characters"
                    bg={C.surface} border={`1px solid ${C.border}`} borderRadius="10px"
                    color={C.textPrimary} _placeholder={{ color: C.textMuted }}
                    _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }} autoFocus />
                </VStack>
                <VStack spacing={1} align="stretch">
                  <Text fontSize="xs" fontWeight="600" color={C.textSecondary} textTransform="uppercase" letterSpacing="0.5px">Confirm</Text>
                  <Input type="password" value={newPassConfirm} onChange={(e) => onConfirmChange(e.target.value)}
                    onKeyDown={onKeyDown} placeholder="Repeat passphrase"
                    bg={C.surface} border={`1px solid ${C.border}`} borderRadius="10px"
                    color={C.textPrimary} _placeholder={{ color: C.textMuted }}
                    _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }} />
                </VStack>
                {error && <Text fontSize="sm" color={C.red}>{error}</Text>}
                <Flex gap={2}>
                  <Button variant="ghost" onClick={onBackToPhrase} leftIcon={<LuArrowLeft size={14} />} flexShrink={0}>Back</Button>
                  <Button flex={1} onClick={onSubmit} isLoading={isLoading} loadingText="Recovering…"
                    isDisabled={!newPassphrase || !newPassConfirm}>
                    Recover Account
                  </Button>
                </Flex>
              </VStack>
            </MotionBox>
          )}
        </AnimatePresence>

        <Button variant="ghost" size="sm" color={C.textMuted} _hover={{ color: C.textSecondary }}
          leftIcon={<LuArrowLeft size={13} />} onClick={onBack}>
          Back to unlock
        </Button>
      </VStack>
    </Box>
  )
}
