import React, { useState, useMemo } from 'react'
import { Box, VStack, HStack, Text, Flex, Tooltip, Input, InputGroup, InputLeftElement } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuSearch, LuShare2, LuUserPlus, LuUsers, LuTrash2, LuSettings, LuUsersRound, LuPlus, LuBan, LuShieldCheck, LuUserCheck, LuUserX } from 'react-icons/lu'
import type { Contact, Group, UserProfile } from '../App'
import { C } from '../theme'

const MotionBox = motion(Box)

function stringToColor(str: string): string {
  const colors = ['#6c63ff', '#34d399', '#f59e0b', '#f87171', '#38bdf8', '#a78bfa', '#fb7185']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function Avatar({ name, size, src }: { name: string; size: number; src?: string | null }): React.ReactElement {
  return (
    <Flex
      w={`${size}px`} h={`${size}px`} borderRadius="full"
      bg={stringToColor(name)} align="center" justify="center"
      fontSize={`${Math.floor(size * 0.38)}px`} fontWeight="600"
      color="white" flexShrink={0} overflow="hidden"
      letterSpacing="-0.5px"
    >
      {src
        ? <Box as="img" src={src} w="full" h="full" objectFit="cover" display="block" />
        : getInitials(name)
      }
    </Flex>
  )
}

function ContactItem({ contact, isSelected, unread, isBlocked, onSelect, onDelete, onBlock, onUnblock }: {
  contact: Contact; isSelected: boolean; unread: number; isBlocked: boolean
  onSelect: () => void; onDelete: () => void; onBlock: () => void; onUnblock: () => void
}): React.ReactElement {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowMenu(true)
  }

  return (
    <>
      <MotionBox
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        mx="8px"
        borderRadius="12px"
        bg={isSelected ? C.active : 'transparent'}
        border={`1px solid ${isSelected ? C.borderMid : 'transparent'}`}
        _hover={{ bg: isSelected ? C.active : C.hover }}
        cursor="pointer"
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        sx={{ transition: 'all 0.12s' }}
      >
        <HStack spacing={3} px={3} py="11px" align="center">
          {/* Avatar with status dot */}
          <Box position="relative" flexShrink={0}>
            <Avatar name={contact.nickname} size={40} src={contact.avatar} />
            <Box
              position="absolute" bottom="1px" right="1px"
              w="10px" h="10px" borderRadius="full"
              bg={contact.online ? C.green : C.textFaint}
              border={`2px solid ${isSelected ? C.active : C.surface}`}
            />
          </Box>

          {/* Text */}
          <Box flex={1} overflow="hidden">
            <HStack justify="space-between" align="center">
              <Text
                fontSize="sm" fontWeight={unread > 0 ? '600' : '500'}
                color={C.textPrimary} noOfLines={1} flex={1}
                letterSpacing="-0.1px"
              >
                {contact.nickname}
              </Text>
              <Text fontSize="10px" color={C.textMuted} flexShrink={0} ml={1}>
                {formatTime(contact.createdAt)}
              </Text>
            </HStack>
            <HStack justify="space-between" align="center" mt="3px">
              <Text fontSize="xs" color={isBlocked ? C.red : contact.online ? C.green : C.textMuted} fontWeight="400">
                {isBlocked ? 'Blocked' : contact.online ? 'Online' : 'Offline'}
              </Text>
              {unread > 0 && (
                <Flex
                  minW="19px" h="19px" px="5px" borderRadius="full"
                  bg={C.accent} align="center" justify="center" flexShrink={0}
                >
                  <Text fontSize="10px" fontWeight="700" color="white" lineHeight={1}>
                    {unread > 99 ? '99+' : unread}
                  </Text>
                </Flex>
              )}
            </HStack>
          </Box>
        </HStack>
      </MotionBox>

      {/* Context menu */}
      {showMenu && (
        <Box position="fixed" inset={0} zIndex={200} onClick={() => setShowMenu(false)}>
          <MotionBox
            initial={{ opacity: 0, scale: 0.93, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.1 }}
            position="fixed"
            top={`${menuPos.y}px`} left={`${menuPos.x}px`}
            bg={C.card} border={`1px solid ${C.border}`}
            borderRadius="12px" boxShadow="0 16px 48px rgba(0,0,0,0.6)"
            overflow="hidden" minW="160px"
            onClick={(e: React.MouseEvent) => e.stopPropagation()} zIndex={201}
          >
            {isBlocked ? (
              <Flex
                px={4} py="10px" cursor="pointer" align="center" gap="10px"
                _hover={{ bg: '#34d39910' }} color="#34d399"
                onClick={() => { setShowMenu(false); onUnblock() }}
              >
                <LuShieldCheck size={14} />
                <Text fontSize="sm" fontWeight="500">Unblock</Text>
              </Flex>
            ) : (
              <Flex
                px={4} py="10px" cursor="pointer" align="center" gap="10px"
                _hover={{ bg: '#f8714710' }} color={C.red}
                onClick={() => { setShowMenu(false); onBlock() }}
              >
                <LuBan size={14} />
                <Text fontSize="sm" fontWeight="500">Block</Text>
              </Flex>
            )}
            <Flex
              px={4} py="10px" cursor="pointer" align="center" gap="10px"
              _hover={{ bg: '#f8714710' }} color={C.red}
              onClick={() => { setShowMenu(false); onDelete() }}
            >
              <LuTrash2 size={14} />
              <Text fontSize="sm" fontWeight="500">Delete contact</Text>
            </Flex>
          </MotionBox>
        </Box>
      )}
    </>
  )
}

function GroupItem({ group, isSelected, unread, onSelect, onDelete }: {
  group: Group; isSelected: boolean; unread: number
  onSelect: () => void; onDelete: () => void
}): React.ReactElement {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowMenu(true)
  }

  return (
    <>
      <MotionBox
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        mx="8px"
        borderRadius="12px"
        bg={isSelected ? C.active : 'transparent'}
        border={`1px solid ${isSelected ? C.borderMid : 'transparent'}`}
        _hover={{ bg: isSelected ? C.active : C.hover }}
        cursor="pointer"
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        sx={{ transition: 'all 0.12s' }}
      >
        <HStack spacing={3} px={3} py="11px" align="center">
          <Flex
            w="40px" h="40px" borderRadius="full" flexShrink={0}
            bg={stringToColor(group.name)} align="center" justify="center"
            fontSize="14px" fontWeight="600" color="white" letterSpacing="-0.5px"
          >
            {group.avatar
              ? <Box as="img" src={group.avatar} w="full" h="full" objectFit="cover" display="block" />
              : getInitials(group.name)
            }
          </Flex>
          <Box flex={1} overflow="hidden">
            <HStack justify="space-between" align="center">
              <Text fontSize="sm" fontWeight={unread > 0 ? '600' : '500'} color={C.textPrimary} noOfLines={1} flex={1} letterSpacing="-0.1px">
                {group.name}
              </Text>
              <Text fontSize="10px" color={C.textMuted} flexShrink={0} ml={1}>
                {formatTime(group.createdAt)}
              </Text>
            </HStack>
            <HStack justify="space-between" align="center" mt="3px">
              <Text fontSize="xs" color={C.textMuted} fontWeight="400">
                {group.members.length} members
              </Text>
              {unread > 0 && (
                <Flex minW="19px" h="19px" px="5px" borderRadius="full" bg={C.accent} align="center" justify="center" flexShrink={0}>
                  <Text fontSize="10px" fontWeight="700" color="white" lineHeight={1}>
                    {unread > 99 ? '99+' : unread}
                  </Text>
                </Flex>
              )}
            </HStack>
          </Box>
        </HStack>
      </MotionBox>
      {showMenu && (
        <Box position="fixed" inset={0} zIndex={200} onClick={() => setShowMenu(false)}>
          <MotionBox
            initial={{ opacity: 0, scale: 0.93, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.1 }}
            position="fixed"
            top={`${menuPos.y}px`} left={`${menuPos.x}px`}
            bg={C.card} border={`1px solid ${C.border}`}
            borderRadius="12px" boxShadow="0 16px 48px rgba(0,0,0,0.6)"
            overflow="hidden" minW="160px"
            onClick={(e: React.MouseEvent) => e.stopPropagation()} zIndex={201}
          >
            <Flex
              px={4} py="10px" cursor="pointer" align="center" gap="10px"
              _hover={{ bg: '#f8714710' }} color={C.red}
              onClick={() => { setShowMenu(false); onDelete() }}
            >
              <LuTrash2 size={14} />
              <Text fontSize="sm" fontWeight="500">Delete group</Text>
            </Flex>
          </MotionBox>
        </Box>
      )}
    </>
  )
}

interface SidebarProps {
  contacts: Contact[]; selectedContactId: string | null
  unreadCounts: Record<string, number>; profile: UserProfile
  groups: Group[]; selectedGroupId: string | null
  groupUnreadCounts: Record<string, number>
  blockedKeys: string[]
  pendingContacts: Record<string, PendingContact>
  onApproveContact: (id: string) => void
  onRejectContact: (id: string) => void
  onSelectContact: (id: string) => void; onDeleteContact: (id: string) => void
  onBlockContact: (id: string) => void; onUnblockContact: (id: string) => void
  onSelectGroup: (id: string) => void; onDeleteGroup: (id: string) => void
  onShowInvite: () => void; onShowConnect: () => void
  onShowCreateGroup: () => void
  onShowSettings: () => void; showingSettings: boolean
}

export function Sidebar({
  contacts, selectedContactId, unreadCounts, profile,
  groups, selectedGroupId, groupUnreadCounts,
  blockedKeys, pendingContacts, onApproveContact, onRejectContact,
  onSelectContact, onDeleteContact, onBlockContact, onUnblockContact,
  onSelectGroup, onDeleteGroup,
  onShowInvite, onShowConnect, onShowCreateGroup,
  onShowSettings, showingSettings
}: SidebarProps): React.ReactElement {
  const [search, setSearch] = useState('')

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter(c => c.nickname.toLowerCase().includes(q))
  }, [contacts, search])

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter(g => g.name.toLowerCase().includes(q))
  }, [groups, search])

  return (
    <Box
      w="290px" flexShrink={0}
      bg={C.surface}
      borderRight={`1px solid ${C.borderFaint}`}
      display="flex" flexDirection="column" h="full"
    >
      {/* ── Profile header ── */}
      <Box px={4} pt={5} pb={4} borderBottom={`1px solid ${C.borderFaint}`}>
        <HStack spacing={3} align="center" mb={4}>
          <Box position="relative" flexShrink={0}>
            <Avatar name={profile.username} size={42} src={profile.avatar} />
            <Box
              position="absolute" bottom="1px" right="1px"
              w="11px" h="11px" borderRadius="full"
              bg={C.green} border={`2.5px solid ${C.surface}`}
            />
          </Box>
          <Box flex={1} overflow="hidden">
            <Text
              fontSize="sm" fontWeight="600" color={C.textPrimary}
              noOfLines={1} letterSpacing="-0.2px"
            >
              {profile.username}
            </Text>
            <HStack spacing="5px" mt="2px">
              <Box w="6px" h="6px" borderRadius="full" bg={C.green} />
              <Text fontSize="xs" color={C.green} fontWeight="400">Online</Text>
            </HStack>
          </Box>
          <Tooltip label="Settings" placement="right">
            <Flex
              w="32px" h="32px" borderRadius="9px" flexShrink={0}
              align="center" justify="center" cursor="pointer"
              bg={showingSettings ? C.accentGlow : 'transparent'}
              color={showingSettings ? C.accent : C.textMuted}
              border={`1px solid ${showingSettings ? C.accent + '30' : 'transparent'}`}
              _hover={{ bg: C.hover, color: C.textSecondary }}
              onClick={onShowSettings}
              sx={{ transition: 'all 0.12s' }}
            >
              <LuSettings size={15} />
            </Flex>
          </Tooltip>
        </HStack>

        {/* Action buttons */}
        <HStack spacing="8px">
          <Flex
            flex={1} h="36px" borderRadius="10px"
            bg={C.elevated} border={`1px solid ${C.border}`}
            align="center" justify="center" gap="7px" cursor="pointer"
            _hover={{ bg: C.hover, borderColor: C.borderMid }}
            onClick={onShowInvite}
            sx={{ transition: 'all 0.12s' }}
          >
            <LuShare2 size={13} color={C.accent} />
            <Text fontSize="xs" fontWeight="500" color={C.textSecondary}>Share invite</Text>
          </Flex>
          <Tooltip label="Add contact" placement="bottom">
            <Flex
              w="36px" h="36px" borderRadius="10px" flexShrink={0}
              bg={C.elevated} border={`1px solid ${C.border}`}
              align="center" justify="center" cursor="pointer"
              _hover={{ bg: C.hover, borderColor: C.accent }}
              onClick={onShowConnect}
              sx={{ transition: 'all 0.12s' }}
            >
              <LuUserPlus size={15} color={C.accent} />
            </Flex>
          </Tooltip>
          <Tooltip label="New group" placement="bottom">
            <Flex
              w="36px" h="36px" borderRadius="10px" flexShrink={0}
              bg={C.elevated} border={`1px solid ${C.border}`}
              align="center" justify="center" cursor="pointer"
              _hover={{ bg: C.hover, borderColor: C.accent }}
              onClick={onShowCreateGroup}
              sx={{ transition: 'all 0.12s' }}
            >
              <LuPlus size={15} color={C.accent} />
            </Flex>
          </Tooltip>
        </HStack>
      </Box>

      {/* ── Search ── */}
      <Box px={3} py={3}>
        <InputGroup size="sm">
          <InputLeftElement pointerEvents="none" pl="10px" h="full">
            <LuSearch size={13} color={C.textMuted} />
          </InputLeftElement>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            bg={C.elevated}
            border={`1px solid ${C.border}`}
            borderRadius="10px"
            color={C.textPrimary}
            fontSize="sm"
            h="36px"
            _placeholder={{ color: C.textMuted }}
            _hover={{ borderColor: C.borderMid }}
            _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}40`, bg: C.elevated }}
            pl="34px"
          />
        </InputGroup>
      </Box>

      {/* ── Requests section ── */}
      {Object.keys(pendingContacts).length > 0 && (
        <Box px={4} pb="6px">
          <HStack spacing="6px" align="center">
            <Text fontSize="11px" fontWeight="600" color={C.textFaint} textTransform="uppercase" letterSpacing="0.8px">
              Requests
            </Text>
            <Flex
              minW="17px" h="17px" px="4px" borderRadius="full"
              bg={C.accent} align="center" justify="center"
            >
              <Text fontSize="10px" fontWeight="700" color="white" lineHeight={1}>
                {Object.keys(pendingContacts).length}
              </Text>
            </Flex>
          </HStack>
        </Box>
      )}
      {Object.keys(pendingContacts).length > 0 && (
        <VStack spacing="2px" align="stretch" mb={2}>
          {Object.values(pendingContacts).map(pc => (
            <Box
              key={pc.id}
              mx="8px"
              borderRadius="12px"
              bg={C.elevated}
              border={`1px solid ${C.border}`}
              px={3} py="10px"
            >
              <HStack spacing={3} align="center">
                <Flex
                  w="40px" h="40px" borderRadius="full" flexShrink={0}
                  bg={C.textFaint} align="center" justify="center"
                  fontSize="14px" fontWeight="600" color="white"
                  overflow="hidden"
                >
                  {pc.avatar
                    ? <img src={pc.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : pc.nickname.slice(0, 2).toUpperCase()}
                </Flex>
                <Box flex={1} overflow="hidden">
                  <Text fontSize="sm" fontWeight="500" color={C.textPrimary} noOfLines={1} letterSpacing="-0.1px">
                    {pc.nickname}
                  </Text>
                  <Text fontSize="xs" color={C.textMuted} fontWeight="400">Wants to connect</Text>
                </Box>
                <HStack spacing="6px">
                  <Tooltip label="Approve" placement="top">
                    <Flex
                      w="28px" h="28px" borderRadius="8px" flexShrink={0}
                      bg="#34d39918" border="1px solid #34d39930"
                      align="center" justify="center" cursor="pointer"
                      _hover={{ bg: '#34d39930' }}
                      onClick={() => onApproveContact(pc.id)}
                      sx={{ transition: 'all 0.12s' }}
                    >
                      <LuUserCheck size={13} color="#34d399" />
                    </Flex>
                  </Tooltip>
                  <Tooltip label="Reject" placement="top">
                    <Flex
                      w="28px" h="28px" borderRadius="8px" flexShrink={0}
                      bg="#f8714718" border="1px solid #f8714730"
                      align="center" justify="center" cursor="pointer"
                      _hover={{ bg: '#f8714730' }}
                      onClick={() => onRejectContact(pc.id)}
                      sx={{ transition: 'all 0.12s' }}
                    >
                      <LuUserX size={13} color={C.red} />
                    </Flex>
                  </Tooltip>
                </HStack>
              </HStack>
            </Box>
          ))}
        </VStack>
      )}

      {/* ── Groups section ── */}
      {filteredGroups.length > 0 && (
        <Box px={4} pb="6px">
          <Text fontSize="11px" fontWeight="600" color={C.textFaint} textTransform="uppercase" letterSpacing="0.8px">
            Groups · {filteredGroups.length}
          </Text>
        </Box>
      )}
      {filteredGroups.length > 0 && (
        <VStack spacing="2px" align="stretch" mb={2}>
          {filteredGroups.map(group => {
            const isSelected = selectedGroupId === group.id
            const unread = groupUnreadCounts[group.id] ?? 0
            return (
              <GroupItem
                key={group.id}
                group={group}
                isSelected={isSelected}
                unread={unread}
                onSelect={() => onSelectGroup(group.id)}
                onDelete={() => onDeleteGroup(group.id)}
              />
            )
          })}
        </VStack>
      )}

      {/* ── Section label ── */}
      <Box px={4} pb="6px">
        <Text
          fontSize="11px" fontWeight="600"
          color={C.textFaint} textTransform="uppercase" letterSpacing="0.8px"
        >
          All Messages {contacts.length > 0 && `· ${contacts.length}`}
        </Text>
      </Box>

      {/* ── Contact list ── */}
      <Box flex={1} overflowY="auto" pb={2}>
        <AnimatePresence>
          {filteredContacts.length === 0 ? (
            <MotionBox
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Flex direction="column" align="center" justify="center" py={12} gap={3} px={4}>
                <Flex
                  w="44px" h="44px" borderRadius="12px"
                  bg={C.elevated} border={`1px solid ${C.border}`}
                  align="center" justify="center"
                >
                  <LuUsers size={18} color={C.textMuted} />
                </Flex>
                <Box textAlign="center">
                  <Text fontSize="sm" fontWeight="500" color={C.textSecondary}>
                    {search ? 'No contacts found' : 'No contacts yet'}
                  </Text>
                  {!search && (
                    <Text fontSize="xs" color={C.textMuted} mt="4px" lineHeight="1.6">
                      Share your invite code to connect
                    </Text>
                  )}
                </Box>
              </Flex>
            </MotionBox>
          ) : (
            <VStack spacing="2px" align="stretch">
              {filteredContacts.map(contact => (
                <ContactItem
                  key={contact.id}
                  contact={contact}
                  isSelected={selectedContactId === contact.id}
                  unread={unreadCounts[contact.id] ?? 0}
                  isBlocked={blockedKeys.includes(contact.publicKey)}
                  onSelect={() => onSelectContact(contact.id)}
                  onDelete={() => onDeleteContact(contact.id)}
                  onBlock={() => onBlockContact(contact.id)}
                  onUnblock={() => onUnblockContact(contact.id)}
                />
              ))}
            </VStack>
          )}
        </AnimatePresence>
      </Box>
    </Box>
  )
}
