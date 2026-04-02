import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Flex, Text, VStack, HStack, Button, Input } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import {
  LuMessageSquare, LuImage, LuCheck,
  LuGithub, LuExternalLink, LuShield,
  LuBell, LuSmile, LuCamera, LuX, LuShieldCheck, LuRefreshCw, LuTriangleAlert,
  LuLink, LuPlus, LuBan
} from 'react-icons/lu'
import { C } from '../theme'

const MotionBox = motion(Box)

interface RetentionOption {
  label: string
  days: number | null
}

const RETENTION_OPTIONS: RetentionOption[] = [
  { label: 'Forever', days: null },
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
]

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Text
      fontSize="11px" fontWeight="600" color={C.textFaint}
      textTransform="uppercase" letterSpacing="0.8px" mb={3}
    >
      {children}
    </Text>
  )
}

function RetentionPicker({
  label, icon, value, onChange
}: {
  label: string
  icon: React.ReactElement
  value: number | null
  onChange: (days: number | null) => void
}): React.ReactElement {
  const selectedLabel = value === null
    ? 'Kept forever'
    : `Deleted after ${RETENTION_OPTIONS.find(o => o.days === value)?.label ?? `${value} days`}`

  return (
    <Box bg={C.elevated} borderRadius="14px" border={`1px solid ${C.border}`} p={5}>
      <HStack spacing={3} mb={4}>
        <Flex
          w="36px" h="36px" borderRadius="10px"
          bg={C.accentGlow} border={`1px solid ${C.accent}20`}
          align="center" justify="center" flexShrink={0}
        >
          {icon}
        </Flex>
        <Box>
          <Text fontSize="sm" fontWeight="600" color={C.textPrimary} letterSpacing="-0.1px">
            {label}
          </Text>
          <Text fontSize="xs" color={C.textMuted} mt="1px">{selectedLabel}</Text>
        </Box>
      </HStack>

      <Flex gap="6px" flexWrap="wrap">
        {RETENTION_OPTIONS.map(opt => {
          const isSelected = opt.days === value
          return (
            <Flex
              key={String(opt.days)}
              as="button"
              onClick={() => onChange(opt.days)}
              px="12px" py="6px"
              borderRadius="8px"
              border={`1px solid ${isSelected ? C.accent : C.border}`}
              bg={isSelected ? C.accentGlow : 'transparent'}
              color={isSelected ? C.accent : C.textSecondary}
              fontSize="xs" fontWeight={isSelected ? '600' : '400'}
              cursor="pointer"
              sx={{ transition: 'all 0.12s' }}
              _hover={{ borderColor: C.accent, color: C.accent, bg: C.accentSubtle }}
              align="center" gap="5px"
            >
              {isSelected && <LuCheck size={10} />}
              {opt.label}
            </Flex>
          )
        })}
      </Flex>
    </Box>
  )
}

function ToggleRow({
  icon, label, description, value, onChange
}: {
  icon: React.ReactElement
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}): React.ReactElement {
  return (
    <HStack
      px={5} py={4} spacing={3} align="center"
      cursor="pointer" onClick={() => onChange(!value)}
      _hover={{ bg: C.hover }}
      sx={{ transition: 'background 0.12s' }}
    >
      <Flex
        w="36px" h="36px" borderRadius="10px"
        bg={value ? C.accentGlow : C.card}
        border={`1px solid ${value ? C.accent + '20' : C.border}`}
        align="center" justify="center" flexShrink={0}
        sx={{ transition: 'all 0.15s' }}
      >
        {icon}
      </Flex>
      <Box flex={1}>
        <Text fontSize="sm" fontWeight="500" color={C.textPrimary} letterSpacing="-0.1px">
          {label}
        </Text>
        <Text fontSize="xs" color={C.textMuted} mt="1px">{description}</Text>
      </Box>
      {/* Custom pill toggle */}
      <Box
        w="38px" h="22px" borderRadius="full" flexShrink={0}
        bg={value ? C.accent : C.card}
        border={`1px solid ${value ? C.accent : C.border}`}
        position="relative"
        sx={{ transition: 'all 0.18s' }}
      >
        <Box
          position="absolute"
          top="3px"
          left={value ? '19px' : '3px'}
          w="16px" h="16px" borderRadius="full"
          bg="white"
          boxShadow="0 1px 4px rgba(0,0,0,0.3)"
          sx={{ transition: 'left 0.18s' }}
        />
      </Box>
    </HStack>
  )
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function stringToColor(str: string): string {
  const colors = ['#6c63ff', '#34d399', '#f59e0b', '#f87171', '#38bdf8', '#a78bfa', '#fb7185']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function DomainList({ description, value, onChange, placeholder, accentColor }: {
  description: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  accentColor?: string
}): React.ReactElement {
  const [input, setInput] = useState('')
  const accent = accentColor ?? C.accent

  const add = () => {
    const domain = input.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    if (!domain || value.includes(domain)) { setInput(''); return }
    onChange([...value, domain])
    setInput('')
  }

  return (
    <Box>
      <Text fontSize="11px" color={C.textMuted} mb="8px">{description}</Text>
      <HStack mb="8px" spacing="6px">
        <Input
          size="sm" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder ?? 'example.com'}
          bg={C.card} border={`1px solid ${C.border}`} borderRadius="8px"
          color={C.textPrimary} _placeholder={{ color: C.textFaint }}
          _focus={{ borderColor: accent, boxShadow: `0 0 0 1px ${accent}` }}
        />
        <Flex
          as="button" flexShrink={0}
          w="30px" h="30px" borderRadius="8px"
          bg={accent} color="white"
          align="center" justify="center"
          cursor="pointer" onClick={add}
          _hover={{ opacity: 0.85 }}
          sx={{ transition: 'opacity 0.12s' }}
        >
          <LuPlus size={13} />
        </Flex>
      </HStack>
      {value.length === 0 ? (
        <Text fontSize="11px" color={C.textFaint} fontStyle="italic">None added</Text>
      ) : (
        <Flex flexWrap="wrap" gap="6px">
          {value.map(d => (
            <HStack key={d} spacing="4px" px="10px" py="4px"
              bg={C.card} border={`1px solid ${C.border}`} borderRadius="20px">
              <Text fontSize="11px" color={C.textSecondary}>{d}</Text>
              <Box
                as="button" cursor="pointer"
                color={C.textFaint} _hover={{ color: C.textMuted }}
                onClick={() => onChange(value.filter(x => x !== d))}
                sx={{ transition: 'color 0.1s' }}
              >
                <LuX size={10} />
              </Box>
            </HStack>
          ))}
        </Flex>
      )}
    </Box>
  )
}

interface ContactInfo {
  id: string
  nickname: string
  avatar: string | null
  publicKey: string
}

export function SettingsView(): React.ReactElement {
  const [messageRetention, setMessageRetention] = useState<number | null>(null)
  const [mediaRetention, setMediaRetention] = useState<number | null>(null)
  const [desktopNotifications, setDesktopNotifications] = useState(true)
  const [twemoji, setTwemoji] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)
  const [embedsEnabled, setEmbedsEnabled] = useState(true)
  const [embedAllowDomains, setEmbedAllowDomains] = useState<string[]>([])
  const [embedBlockDomains, setEmbedBlockDomains] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenDone, setRegenDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [blockedKeys, setBlockedKeys] = useState<string[]>([])
  const [allContacts, setAllContacts] = useState<ContactInfo[]>([])

  // Profile state
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const refreshBlocked = useCallback(async () => {
    const keys = await window.acuate.getBlockedKeys()
    setBlockedKeys(keys)
  }, [])

  useEffect(() => {
    Promise.all([
      window.acuate.getSettings(),
      window.acuate.getProfile(),
      window.acuate.getBlockedKeys(),
      window.acuate.listContacts(),
    ]).then(([s, p, blocked, contacts]) => {
      setMessageRetention(s.messageRetentionDays)
      setMediaRetention(s.mediaRetentionDays)
      setDesktopNotifications(s.desktopNotifications)
      setTwemoji(s.twemoji)
      setRequireApproval(s.requireApproval)
      setEmbedsEnabled(s.embedsEnabled)
      setEmbedAllowDomains(s.embedAllowDomains)
      setEmbedBlockDomains(s.embedBlockDomains)
      if (p) {
        setUsername(p.username)
        setAvatar(p.avatar)
      }
      setBlockedKeys(blocked)
      setAllContacts(contacts.map(c => ({ id: c.id, nickname: c.nickname, avatar: c.avatar, publicKey: c.publicKey })))
      setLoading(false)
    })
  }, [])

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result
      if (typeof result === 'string') setAvatar(result)
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }, [])

  const handleSave = useCallback(async () => {
    await Promise.all([
      window.acuate.saveSettings({
        messageRetentionDays: messageRetention,
        mediaRetentionDays: mediaRetention,
        desktopNotifications,
        twemoji,
        requireApproval,
        embedsEnabled,
        embedAllowDomains,
        embedBlockDomains,
      }),
      window.acuate.saveProfile({ username: username.trim() || 'Anonymous', avatar }),
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [messageRetention, mediaRetention, desktopNotifications, twemoji, requireApproval, embedsEnabled, embedAllowDomains, embedBlockDomains, username, avatar])

  if (loading) return (
    <Flex flex={1} align="center" justify="center" bg={C.panel}>
      <Text fontSize="sm" color={C.textMuted}>Loading…</Text>
    </Flex>
  )

  return (
    <MotionBox
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      display="flex" flexDirection="column" h="full" bg={C.panel}
    >
      {/* ── Header ── */}
      <Box
        px={6} py="14px"
        bg={C.surface} borderBottom={`1px solid ${C.borderFaint}`}
        flexShrink={0}
      >
        <HStack spacing={3}>
          <Flex
            w="36px" h="36px" borderRadius="10px"
            bg={C.accentGlow} border={`1px solid ${C.accent}20`}
            align="center" justify="center"
          >
            <LuShield size={16} color={C.accent} />
          </Flex>
          <Box>
            <Text fontWeight="600" color={C.textPrimary} fontSize="sm" letterSpacing="-0.2px">
              Settings
            </Text>
            <Text fontSize="xs" color={C.textMuted} mt="1px">Privacy &amp; data</Text>
          </Box>
        </HStack>
      </Box>

      {/* ── Content ── */}
      <Box flex={1} overflowY="auto" px={6} py={6}>
        <VStack spacing={8} align="stretch" maxW="560px">

          {/* Profile */}
          <Box>
            <SectionLabel>Profile</SectionLabel>
            <Box bg={C.elevated} borderRadius="14px" border={`1px solid ${C.border}`} p={5}>
              <HStack spacing={4} align="center">
                {/* Avatar */}
                <Box position="relative" flexShrink={0}>
                  <Flex
                    w="64px" h="64px" borderRadius="full"
                    bg={stringToColor(username || 'A')}
                    align="center" justify="center"
                    fontSize="20px" fontWeight="700" color="white"
                    overflow="hidden"
                  >
                    {avatar
                      ? <Box as="img" src={avatar} w="full" h="full" objectFit="cover" display="block" />
                      : getInitials(username || 'A')
                    }
                  </Flex>
                  {/* Camera overlay button */}
                  <Flex
                    position="absolute" bottom="0" right="0"
                    w="22px" h="22px" borderRadius="full"
                    bg={C.accent} border={`2px solid ${C.elevated}`}
                    align="center" justify="center"
                    cursor="pointer"
                    onClick={() => avatarInputRef.current?.click()}
                    _hover={{ bg: C.accentHover }}
                    sx={{ transition: 'background 0.15s' }}
                  >
                    <LuCamera size={10} color="white" />
                  </Flex>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleAvatarChange}
                  />
                </Box>

                {/* Username + remove avatar */}
                <Box flex={1}>
                  <Text fontSize="xs" color={C.textMuted} mb="6px" fontWeight="500">Username</Text>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Your name"
                    maxLength={32}
                    size="sm"
                    bg={C.card}
                    border={`1px solid ${C.border}`}
                    borderRadius="9px"
                    color={C.textPrimary}
                    _placeholder={{ color: C.textFaint }}
                    _hover={{ borderColor: C.borderMid }}
                    _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}` }}
                  />
                  {avatar && (
                    <Flex
                      align="center" gap="5px" mt="8px"
                      cursor="pointer" onClick={() => setAvatar(null)}
                      color={C.textFaint} _hover={{ color: C.textMuted }}
                      sx={{ transition: 'color 0.12s' }}
                      w="fit-content"
                    >
                      <LuX size={10} />
                      <Text fontSize="11px">Remove photo</Text>
                    </Flex>
                  )}
                </Box>
              </HStack>
            </Box>
          </Box>

          {/* Preferences */}
          <Box>
            <SectionLabel>Preferences</SectionLabel>
            <Box
              bg={C.elevated} borderRadius="14px"
              border={`1px solid ${C.border}`} overflow="hidden"
            >
              <ToggleRow
                icon={<LuBell size={15} color={desktopNotifications ? C.accent : C.textMuted} />}
                label="Desktop notifications"
                description="Show a notification when a message arrives"
                value={desktopNotifications}
                onChange={setDesktopNotifications}
              />
              <Box borderTop={`1px solid ${C.borderFaint}`} />
              <ToggleRow
                icon={<LuSmile size={15} color={twemoji ? C.accent : C.textMuted} />}
                label="Twemoji"
                description="Use Twitter-style emoji in messages"
                value={twemoji}
                onChange={setTwemoji}
              />
              <Box borderTop={`1px solid ${C.borderFaint}`} />
              <ToggleRow
                icon={<LuShieldCheck size={15} color={requireApproval ? C.accent : C.textMuted} />}
                label="Require contact approval"
                description="Manually approve new contacts before they can message you"
                value={requireApproval}
                onChange={setRequireApproval}
              />
            </Box>
          </Box>

          {/* Embeds */}
          <Box>
            <SectionLabel>Link Embeds</SectionLabel>
            <Box bg={C.elevated} borderRadius="14px" border={`1px solid ${C.border}`} overflow="hidden">
              <ToggleRow
                icon={<LuLink size={15} color={embedsEnabled ? C.accent : C.textMuted} />}
                label="Enable link embeds"
                description="Show previews and media players for links in messages"
                value={embedsEnabled}
                onChange={setEmbedsEnabled}
              />
              {embedsEnabled && (
                <>
                  <Box borderTop={`1px solid ${C.borderFaint}`} />
                  <Box px={5} py={4}>
                    <DomainList
                      description="Auto-load domains — embeds load instantly without prompting (in addition to built-ins like GitHub, Reddit)"
                      value={embedAllowDomains}
                      onChange={setEmbedAllowDomains}
                      placeholder="example.com"
                      accentColor={C.accent}
                    />
                  </Box>
                  <Box borderTop={`1px solid ${C.borderFaint}`} />
                  <Box px={5} py={4}>
                    <DomainList
                      description="Blocked domains — embeds are never shown for these sites"
                      value={embedBlockDomains}
                      onChange={setEmbedBlockDomains}
                      placeholder="example.com"
                      accentColor={C.red}
                    />
                  </Box>
                </>
              )}
            </Box>
          </Box>

          {/* Blocked Users */}
          <Box>
            <SectionLabel>Blocked Users</SectionLabel>
            <Box bg={C.elevated} borderRadius="14px" border={`1px solid ${C.border}`} overflow="hidden">
              {blockedKeys.length === 0 ? (
                <Flex px={5} py={4} align="center" gap={3}>
                  <Flex
                    w="36px" h="36px" borderRadius="10px" flexShrink={0}
                    bg={C.card} border={`1px solid ${C.border}`}
                    align="center" justify="center"
                  >
                    <LuBan size={15} color={C.textFaint} />
                  </Flex>
                  <Text fontSize="sm" color={C.textMuted}>No blocked users</Text>
                </Flex>
              ) : (
                blockedKeys.map((key, i) => {
                  const contact = allContacts.find(c => c.publicKey === key)
                  const label = contact?.nickname ?? `${key.slice(0, 12)}…`
                  const av = contact?.avatar ?? null
                  const bg = stringToColor(label)
                  return (
                    <React.Fragment key={key}>
                      {i > 0 && <Box borderTop={`1px solid ${C.borderFaint}`} />}
                      <HStack px={5} py="11px" spacing={3}>
                        <Flex
                          w="34px" h="34px" borderRadius="full" flexShrink={0}
                          bg={bg} align="center" justify="center"
                          fontSize="11px" fontWeight="700" color="white" overflow="hidden"
                        >
                          {av
                            ? <Box as="img" src={av} w="full" h="full" objectFit="cover" display="block" />
                            : getInitials(label)
                          }
                        </Flex>
                        <Box flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="500" color={C.textPrimary} isTruncated>
                            {label}
                          </Text>
                          {!contact && (
                            <Text fontSize="10px" color={C.textFaint} fontFamily="monospace">
                              Unknown contact
                            </Text>
                          )}
                        </Box>
                        <Flex
                          as="button" cursor="pointer"
                          px="10px" h="28px" borderRadius="8px"
                          border={`1px solid ${C.border}`} bg={C.card}
                          align="center" justify="center" gap="5px"
                          color={C.textSecondary} fontSize="xs" fontWeight="500"
                          _hover={{ bg: '#34d39912', borderColor: '#34d39935', color: '#34d399' }}
                          sx={{ transition: 'all 0.12s' }}
                          onClick={async () => {
                            if (contact) await window.acuate.unblockContact(contact.id)
                            await refreshBlocked()
                          }}
                        >
                          <LuShieldCheck size={12} />
                          <Text>Unblock</Text>
                        </Flex>
                      </HStack>
                    </React.Fragment>
                  )
                })
              )}
            </Box>
          </Box>

          {/* Data retention */}
          <Box>
            <SectionLabel>Data Retention</SectionLabel>
            <VStack spacing={3} align="stretch">
              <RetentionPicker
                label="Messages"
                icon={<LuMessageSquare size={15} color={C.accent} />}
                value={messageRetention}
                onChange={setMessageRetention}
              />
              <RetentionPicker
                label="Media &amp; attachments"
                icon={<LuImage size={15} color={C.accent} />}
                value={mediaRetention}
                onChange={setMediaRetention}
              />
            </VStack>
            <Box
              mt={3} px={4} py="10px"
              bg={C.elevated} borderRadius="10px"
              border={`1px solid ${C.border}`}
            >
              <Text fontSize="xs" color={C.textMuted} lineHeight="1.7">
                Retention is enforced each time the app starts. Messages and media older than
                the selected period are permanently deleted from your device. This cannot be undone.
              </Text>
            </Box>
          </Box>

          {/* Identity */}
          <Box>
            <SectionLabel>Identity</SectionLabel>
            <Box bg={C.elevated} borderRadius="14px" border={`1px solid ${C.border}`} p={5}>
              <HStack spacing={3} mb={3} align="flex-start">
                <Flex
                  w="36px" h="36px" borderRadius="10px" flexShrink={0}
                  bg="#f8714714" border="1px solid #f8714730"
                  align="center" justify="center"
                >
                  <LuRefreshCw size={15} color={C.red} />
                </Flex>
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="500" color={C.textPrimary} letterSpacing="-0.1px">
                    Regenerate onion address
                  </Text>
                  <Text fontSize="xs" color={C.textMuted} mt="2px" lineHeight="1.6">
                    Creates a new .onion address. Anyone you invited will need your new invite code to reconnect.
                  </Text>
                </Box>
              </HStack>

              {!regenConfirm && !regenDone && (
                <Button
                  size="sm" variant="outline"
                  borderColor={C.red} color={C.red}
                  borderRadius="9px"
                  _hover={{ bg: '#f8714714' }}
                  onClick={() => setRegenConfirm(true)}
                >
                  Regenerate
                </Button>
              )}

              {regenConfirm && !regenDone && (
                <Box mt={1} p={3} bg="#f8714710" borderRadius="10px" border="1px solid #f8714728">
                  <HStack spacing="6px" mb={3}>
                    <LuTriangleAlert size={13} color={C.red} />
                    <Text fontSize="xs" color={C.red} fontWeight="500">
                      This cannot be undone. Confirm to proceed.
                    </Text>
                  </HStack>
                  <HStack spacing="8px">
                    <Button
                      size="sm" bg={C.red} color="white" borderRadius="9px"
                      _hover={{ bg: '#f45656' }}
                      isLoading={regenLoading}
                      onClick={async () => {
                        setRegenLoading(true)
                        const result = await window.acuate.regenOnionAddress()
                        setRegenLoading(false)
                        if (result.success) {
                          setRegenConfirm(false)
                          setRegenDone(true)
                          setTimeout(() => setRegenDone(false), 4000)
                        }
                      }}
                    >
                      Yes, regenerate
                    </Button>
                    <Button
                      size="sm" variant="ghost" color={C.textMuted} borderRadius="9px"
                      _hover={{ bg: C.hover }}
                      onClick={() => setRegenConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </HStack>
                </Box>
              )}

              {regenDone && (
                <HStack spacing="6px" mt={1}>
                  <LuCheck size={13} color="#34d399" />
                  <Text fontSize="xs" color="#34d399" fontWeight="500">
                    New onion address generated. Share your invite code to reconnect.
                  </Text>
                </HStack>
              )}
            </Box>
          </Box>

          {/* Save button */}
          <Button
            onClick={handleSave}
            leftIcon={saved ? <LuCheck size={14} /> : undefined}
            bg={saved ? C.green : C.accent}
            color="white"
            _hover={{ bg: saved ? C.green : C.accentHover, transform: 'translateY(-1px)' }}
            _active={{ transform: 'scale(0.97)' }}
            borderRadius="11px"
            h="40px"
            boxShadow={saved ? `0 4px 16px ${C.green}35` : `0 4px 16px ${C.accent}35`}
            sx={{ transition: 'all 0.2s' }}
          >
            {saved ? 'Saved!' : 'Save settings'}
          </Button>

          {/* About */}
          <Box>
            <SectionLabel>About</SectionLabel>
            <Box
              bg={C.elevated} borderRadius="14px"
              border={`1px solid ${C.border}`} overflow="hidden"
            >
              <HStack px={5} py={4} borderBottom={`1px solid ${C.borderFaint}`} spacing={3}>
                <Flex
                  w="36px" h="36px" borderRadius="10px"
                  bg={C.accentGlow} border={`1px solid ${C.accent}20`}
                  align="center" justify="center" flexShrink={0}
                >
                  <LuShield size={15} color={C.accent} />
                </Flex>
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="600" color={C.textPrimary} letterSpacing="-0.1px">
                    Acuate.chat
                  </Text>
                  <Text fontSize="xs" color={C.textMuted} mt="1px">Version 1.0.1</Text>
                </Box>
              </HStack>

              <HStack
                as="a"
                href="https://github.com/zephyrbyt/acuatechat"
                target="_blank"
                rel="noopener noreferrer"
                px={5} py={4} spacing={3}
                cursor="pointer"
                _hover={{ bg: C.hover }}
                sx={{ transition: 'background 0.12s' }}
              >
                <Flex
                  w="36px" h="36px" borderRadius="10px"
                  bg={C.card} border={`1px solid ${C.border}`}
                  align="center" justify="center" flexShrink={0}
                >
                  <LuGithub size={16} color={C.textSecondary} />
                </Flex>
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="500" color={C.textPrimary} letterSpacing="-0.1px">
                    View on GitHub
                  </Text>
                  <Text fontSize="xs" color={C.textMuted} mt="1px">
                    github.com/zephyrbyt/acuatechat
                  </Text>
                </Box>
                <LuExternalLink size={14} color={C.textFaint} />
              </HStack>
            </Box>
          </Box>

        </VStack>
      </Box>
    </MotionBox>
  )
}
