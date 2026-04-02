import React, { useState, useRef, useCallback } from 'react'
import { Box, Flex, Text, Button, Input, VStack, HStack } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LuCamera, LuArrowRight, LuArrowLeft, LuShield, LuLock, LuGlobe,
  LuUsers, LuMessageSquare, LuEyeOff, LuKey
} from 'react-icons/lu'
import type { UserProfile } from '../App'
import { C } from '../theme'

const MotionBox = motion(Box)
const MotionFlex = motion(Flex)

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void
}

type Step = 'welcome' | 'slide1' | 'slide2' | 'slide3' | 'profile'

const SLIDES: {
  key: Step
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  body: string
  detail: Array<{ icon: React.ElementType; label: string; desc: string }>
}[] = [
  {
    key: 'slide1',
    icon: LuShield,
    iconColor: C.accent,
    iconBg: C.accentGlow,
    title: 'End-to-end encrypted',
    body: 'Every message is encrypted on your device before it leaves. Only the person you are talking to can read it — not us, not anyone else.',
    detail: [
      { icon: LuLock, label: 'NaCl box encryption', desc: 'Curve25519 key exchange + XSalsa20-Poly1305 authenticated encryption' },
      { icon: LuKey, label: 'Your keys, your identity', desc: 'A unique cryptographic keypair is generated locally and never leaves your device' },
    ],
  },
  {
    key: 'slide2',
    icon: LuGlobe,
    iconColor: '#3ecf8e',
    iconBg: '#3ecf8e18',
    title: 'Anonymous over Tor',
    body: 'All traffic is routed through the Tor network. Your IP address is never exposed to the person you are chatting with or to any third party.',
    detail: [
      { icon: LuEyeOff, label: 'No IP exposure', desc: 'Connections are made through .onion addresses — location is hidden on both ends' },
      { icon: LuGlobe, label: 'No central servers', desc: 'Messages travel peer-to-peer through Tor hidden services, bypassing any server' },
    ],
  },
  {
    key: 'slide3',
    icon: LuUsers,
    iconColor: C.amber,
    iconBg: `${C.amber}18`,
    title: 'How connecting works',
    body: 'To chat with someone, one person shares their invite code and the other enters it. That is all — no phone numbers, no email, no accounts.',
    detail: [
      { icon: LuMessageSquare, label: 'Share your code', desc: 'Generate a one-time invite code from the sidebar and send it to whoever you want to chat with' },
      { icon: LuUsers, label: 'They enter your code', desc: 'Once entered, a secure Tor connection is established automatically. Messages can flow both ways' },
    ],
  },
]

export function Onboarding({ onComplete }: OnboardingProps): React.ReactElement {
  const [step, setStep] = useState<Step>('welcome')
  const [slideDir, setSlideDir] = useState<1 | -1>(1)
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [avatarHovered, setAvatarHovered] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const FLOW: Step[] = ['welcome', 'slide1', 'slide2', 'slide3', 'profile']

  const goTo = useCallback((target: Step, dir: 1 | -1 = 1) => {
    setSlideDir(dir)
    setStep(target)
  }, [])

  const goNext = useCallback(() => {
    const idx = FLOW.indexOf(step)
    if (idx < FLOW.length - 1) goTo(FLOW[idx + 1], 1)
  }, [step, goTo])

  const goBack = useCallback(() => {
    const idx = FLOW.indexOf(step)
    if (idx > 0) goTo(FLOW[idx - 1], -1)
  }, [step, goTo])

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') setAvatar(ev.target.result)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleSubmit = useCallback(async () => {
    const name = username.trim()
    if (!name || isSaving) return
    setIsSaving(true)
    try {
      const profileData: UserProfile = { username: name, avatar }
      await window.acuate.saveProfile(profileData)
      onComplete(profileData)
    } finally {
      setIsSaving(false)
    }
  }, [username, avatar, isSaving, onComplete])

  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -40 }),
  }

  const slideTransition = { duration: 0.28, ease: 'easeOut' }

  const currentSlide = SLIDES.find(s => s.key === step)
  const slideIndex = FLOW.indexOf(step) // 0=welcome,1,2,3,4=profile
  const isInfoSlide = currentSlide !== undefined

  return (
    <Flex flex={1} w="100%" align="center" justify="center" bg={C.base} position="relative" overflow="hidden">
      {/* Background orbs */}
      <Box position="absolute" top="-15%" left="-5%" w="700px" h="700px" borderRadius="full"
        bg={`radial-gradient(circle, ${C.accent}15 0%, transparent 60%)`} pointerEvents="none" />
      <Box position="absolute" bottom="-20%" right="-10%" w="600px" h="600px" borderRadius="full"
        bg={`radial-gradient(circle, ${C.green}0c 0%, transparent 65%)`} pointerEvents="none" />

      <AnimatePresence mode="wait" custom={slideDir}>

        {step === 'welcome' && (
          <MotionBox
            key="welcome"
            custom={slideDir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
            w="100%" maxW="460px" mx={4}
          >
            <Box bg={C.elevated} borderRadius="24px" border={`1px solid ${C.border}`}
              p={8} boxShadow="0 32px 80px rgba(0,0,0,0.5)">
              <VStack spacing={7} align="stretch">
                <VStack spacing={4} align="center">
                  <MotionFlex
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 180 }}
                    w="72px" h="72px" borderRadius="20px"
                    bg={C.accentGlow} border={`1px solid ${C.accent}50`}
                    align="center" justify="center"
                  >
                    <LuShield size={32} color={C.accent} />
                  </MotionFlex>
                  <VStack spacing={2} align="center">
                    <Text fontSize="2xl" fontWeight="800" color={C.textPrimary} letterSpacing="-0.5px">
                      Acuate.chat
                    </Text>
                    <Text fontSize="sm" color={C.textSecondary} textAlign="center" lineHeight="1.7" maxW="300px">
                      Private, peer-to-peer messaging over Tor. No accounts, no servers, no metadata.
                    </Text>
                  </VStack>
                </VStack>

                {/* Quick feature pills */}
                <HStack spacing={2} justify="center" flexWrap="wrap">
                  {[
                    { icon: LuLock, label: 'E2EE' },
                    { icon: LuGlobe, label: 'Tor' },
                    { icon: LuEyeOff, label: 'No logs' },
                    { icon: LuUsers, label: 'P2P' },
                  ].map(({ icon: Icon, label }) => (
                    <HStack key={label} spacing={1} bg={C.card} border={`1px solid ${C.borderFaint}`}
                      borderRadius="full" px={3} py="5px">
                      <Icon size={11} color={C.accent} />
                      <Text fontSize="xs" fontWeight="600" color={C.textSecondary}>{label}</Text>
                    </HStack>
                  ))}
                </HStack>

                <Button size="lg" w="full" borderRadius="12px" onClick={goNext}
                  rightIcon={<LuArrowRight size={16} />}>
                  Get started
                </Button>

                <Text fontSize="xs" color={C.textMuted} textAlign="center">
                  Your data never leaves this device without your consent.
                </Text>
              </VStack>
            </Box>
          </MotionBox>
        )}

        {isInfoSlide && currentSlide && (
          <MotionBox
            key={step}
            custom={slideDir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
            w="100%" maxW="460px" mx={4}
          >
            <Box bg={C.elevated} borderRadius="24px" border={`1px solid ${C.border}`}
              p={8} boxShadow="0 32px 80px rgba(0,0,0,0.5)">
              <VStack spacing={6} align="stretch">

                {/* Progress dots */}
                <HStack spacing={2} justify="center">
                  {[1, 2, 3].map(i => (
                    <Box key={i} h="3px" borderRadius="full" transition="all 0.25s"
                      bg={slideIndex === i ? C.accent : C.border}
                      w={slideIndex === i ? '24px' : '8px'} />
                  ))}
                </HStack>

                {/* Icon + heading */}
                <VStack spacing={4} align="center">
                  <MotionFlex
                    key={step + '-icon'}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.05, type: 'spring', stiffness: 200 }}
                    w="64px" h="64px" borderRadius="18px"
                    bg={currentSlide.iconBg} border={`1px solid ${currentSlide.iconColor}40`}
                    align="center" justify="center"
                  >
                    <currentSlide.icon size={28} color={currentSlide.iconColor} />
                  </MotionFlex>
                  <VStack spacing={2} align="center">
                    <Text fontSize="xl" fontWeight="700" color={C.textPrimary} letterSpacing="-0.3px">
                      {currentSlide.title}
                    </Text>
                    <Text fontSize="sm" color={C.textSecondary} textAlign="center" lineHeight="1.7" maxW="340px">
                      {currentSlide.body}
                    </Text>
                  </VStack>
                </VStack>

                {/* Detail cards */}
                <VStack spacing={2} align="stretch">
                  {currentSlide.detail.map(({ icon: Icon, label, desc }) => (
                    <Flex key={label} align="flex-start" gap={3} px={4} py={3}
                      bg={C.card} borderRadius="12px" border={`1px solid ${C.borderFaint}`}>
                      <Flex w="32px" h="32px" borderRadius="9px" bg={`${currentSlide.iconColor}18`}
                        align="center" justify="center" flexShrink={0} mt="1px">
                        <Icon size={14} color={currentSlide.iconColor} />
                      </Flex>
                      <Box>
                        <Text fontSize="sm" fontWeight="600" color={C.textPrimary}>{label}</Text>
                        <Text fontSize="xs" color={C.textMuted} lineHeight="1.5" mt="2px">{desc}</Text>
                      </Box>
                    </Flex>
                  ))}
                </VStack>

                {/* Nav */}
                <HStack spacing={3}>
                  <Button variant="ghost" onClick={goBack} leftIcon={<LuArrowLeft size={14} />}
                    color={C.textSecondary} _hover={{ bg: C.hover, color: C.textPrimary }}
                    flexShrink={0}>
                    Back
                  </Button>
                  <Button flex={1} borderRadius="12px" onClick={goNext}
                    rightIcon={<LuArrowRight size={15} />}>
                    {slideIndex === 3 ? 'Set up profile' : 'Next'}
                  </Button>
                </HStack>
              </VStack>
            </Box>
          </MotionBox>
        )}

        {step === 'profile' && (
          <MotionBox
            key="profile"
            custom={slideDir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
            w="100%" maxW="400px" mx={4}
          >
            <Box bg={C.elevated} borderRadius="24px" border={`1px solid ${C.border}`}
              p={8} boxShadow="0 32px 80px rgba(0,0,0,0.5)">
              <VStack spacing={7} align="stretch">
                <VStack spacing={1} align="center">
                  <Text fontSize="xl" fontWeight="700" color={C.textPrimary} letterSpacing="-0.3px">
                    Set up your profile
                  </Text>
                  <Text fontSize="sm" color={C.textSecondary} textAlign="center">
                    This is only stored locally on your device.
                  </Text>
                </VStack>

                {/* Avatar picker */}
                <VStack spacing={3} align="center">
                  <Box
                    as="button"
                    onClick={() => fileInputRef.current?.click()}
                    onMouseEnter={() => setAvatarHovered(true)}
                    onMouseLeave={() => setAvatarHovered(false)}
                    position="relative" w="88px" h="88px" borderRadius="full"
                    overflow="hidden" cursor="pointer"
                    border={`2px solid ${avatarHovered ? C.accent : C.border}`}
                    transition="border-color 0.2s"
                    flexShrink={0}
                  >
                    {avatar ? (
                      <Box as="img" src={avatar} w="full" h="full" objectFit="cover" display="block" />
                    ) : (
                      <Flex w="full" h="full" bg={C.card} align="center" justify="center"
                        fontSize="xl" fontWeight="700" color={C.textSecondary}>
                        {username.trim() ? getInitials(username.trim()) : <LuCamera size={22} color={C.textMuted} />}
                      </Flex>
                    )}
                    <Flex
                      position="absolute" inset={0} bg="rgba(0,0,0,0.55)"
                      align="center" justify="center"
                      opacity={avatarHovered ? 1 : 0}
                      transition="opacity 0.15s"
                    >
                      <LuCamera size={20} color="white" />
                    </Flex>
                  </Box>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                  <Text fontSize="xs" color={C.textMuted}>Click to add a photo (optional)</Text>
                </VStack>

                {/* Name */}
                <VStack spacing={1} align="stretch">
                  <Text fontSize="xs" fontWeight="600" color={C.textSecondary} textTransform="uppercase" letterSpacing="0.5px">
                    Display name
                  </Text>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.slice(0, 30))}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="What should people call you?"
                    bg={C.surface} border={`1px solid ${C.border}`} borderRadius="10px"
                    color={C.textPrimary} _placeholder={{ color: C.textMuted }}
                    _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }}
                    autoFocus
                  />
                  <Text fontSize="xs" color={C.textMuted} textAlign="right">{username.length}/30</Text>
                </VStack>

                <HStack spacing={3}>
                  <Button variant="ghost" onClick={goBack} leftIcon={<LuArrowLeft size={14} />}
                    color={C.textSecondary} _hover={{ bg: C.hover, color: C.textPrimary }}
                    flexShrink={0}>
                    Back
                  </Button>
                  <Button flex={1}
                    onClick={handleSubmit} isDisabled={!username.trim() || isSaving}
                    isLoading={isSaving} loadingText="Setting up…"
                    borderRadius="12px"
                  >
                    Continue
                  </Button>
                </HStack>
              </VStack>
            </Box>
          </MotionBox>
        )}

      </AnimatePresence>
    </Flex>
  )
}
