import React, { useState } from 'react'
import {
  Box, Flex, Text, Input, VStack, HStack, Checkbox
} from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuX, LuUsers } from 'react-icons/lu'
import type { Contact } from '../App'
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

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, memberContactIds: string[]) => Promise<void>
  contacts: Contact[]
}

export function CreateGroupModal({ isOpen, onClose, onCreate, contacts }: CreateGroupModalProps): React.ReactElement | null {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleContact = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError('Group name is required'); return }
    if (selected.size === 0) { setError('Select at least one contact'); return }
    setLoading(true)
    setError('')
    try {
      await onCreate(name.trim(), Array.from(selected))
      setName('')
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setSelected(new Set())
    setError('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <Box position="fixed" inset={0} zIndex={300} display="flex" alignItems="center" justifyContent="center">
          {/* Backdrop */}
          <Box position="absolute" inset={0} bg="rgba(0,0,0,0.6)" onClick={handleClose} />

          <MotionBox
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.15 }}
            position="relative" zIndex={1}
            bg={C.panel} border={`1px solid ${C.border}`}
            borderRadius="20px" boxShadow="0 24px 64px rgba(0,0,0,0.7)"
            w="400px" maxH="80vh" display="flex" flexDirection="column"
            overflow="hidden"
          >
            {/* Header */}
            <Flex px={6} pt={5} pb={4} align="center" justify="space-between" borderBottom={`1px solid ${C.borderFaint}`}>
              <HStack spacing={3}>
                <Flex w="32px" h="32px" borderRadius="9px" bg={C.accentGlow} align="center" justify="center">
                  <LuUsers size={15} color={C.accent} />
                </Flex>
                <Text fontWeight="600" color={C.textPrimary} fontSize="sm" letterSpacing="-0.2px">
                  New Group
                </Text>
              </HStack>
              <Flex
                w="28px" h="28px" borderRadius="8px" align="center" justify="center"
                cursor="pointer" color={C.textMuted} _hover={{ bg: C.hover, color: C.textSecondary }}
                onClick={handleClose} sx={{ transition: 'all 0.12s' }}
              >
                <LuX size={14} />
              </Flex>
            </Flex>

            {/* Body */}
            <VStack spacing={4} px={6} py={5} align="stretch" flex={1} overflowY="auto">
              {/* Group name */}
              <Box>
                <Text fontSize="xs" fontWeight="600" color={C.textMuted} textTransform="uppercase" letterSpacing="0.6px" mb="8px">
                  Group Name
                </Text>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Team Chat"
                  bg={C.elevated}
                  border={`1px solid ${C.border}`}
                  borderRadius="10px"
                  color={C.textPrimary}
                  fontSize="sm"
                  _placeholder={{ color: C.textMuted }}
                  _hover={{ borderColor: C.borderMid }}
                  _focus={{ borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}40`, bg: C.elevated }}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </Box>

              {/* Contact picker */}
              <Box>
                <Text fontSize="xs" fontWeight="600" color={C.textMuted} textTransform="uppercase" letterSpacing="0.6px" mb="8px">
                  Add Members
                </Text>
                {contacts.length === 0 ? (
                  <Flex py={6} align="center" justify="center" direction="column" gap={2}>
                    <Text fontSize="sm" color={C.textMuted}>No contacts yet</Text>
                    <Text fontSize="xs" color={C.textFaint}>Add contacts first to create a group</Text>
                  </Flex>
                ) : (
                  <VStack spacing="2px" align="stretch">
                    {contacts.map(contact => (
                      <Flex
                        key={contact.id}
                        px={3} py="10px" borderRadius="10px" cursor="pointer"
                        bg={selected.has(contact.id) ? C.accentGlow : 'transparent'}
                        border={`1px solid ${selected.has(contact.id) ? C.accent + '30' : 'transparent'}`}
                        _hover={{ bg: selected.has(contact.id) ? C.accentGlow : C.hover }}
                        align="center" gap={3}
                        onClick={() => toggleContact(contact.id)}
                        sx={{ transition: 'all 0.1s' }}
                      >
                        <Flex
                          w="34px" h="34px" borderRadius="full" flexShrink={0}
                          bg={stringToColor(contact.nickname)} align="center" justify="center"
                          fontSize="12px" fontWeight="600" color="white" overflow="hidden"
                        >
                          {contact.avatar
                            ? <Box as="img" src={contact.avatar} w="full" h="full" objectFit="cover" display="block" />
                            : getInitials(contact.nickname)
                          }
                        </Flex>
                        <Box flex={1}>
                          <Text fontSize="sm" fontWeight="500" color={C.textPrimary} noOfLines={1}>{contact.nickname}</Text>
                          <Text fontSize="xs" color={contact.online ? C.green : C.textMuted}>
                            {contact.online ? 'Online' : 'Offline'}
                          </Text>
                        </Box>
                        <Checkbox
                          isChecked={selected.has(contact.id)}
                          onChange={() => toggleContact(contact.id)}
                          colorScheme="purple"
                          onClick={e => e.stopPropagation()}
                        />
                      </Flex>
                    ))}
                  </VStack>
                )}
              </Box>

              {error && (
                <Text fontSize="xs" color={C.red}>{error}</Text>
              )}
            </VStack>

            {/* Footer */}
            <Flex px={6} py={4} borderTop={`1px solid ${C.borderFaint}`} gap={3}>
              <Flex
                flex={1} h="38px" borderRadius="10px"
                bg={C.elevated} border={`1px solid ${C.border}`}
                align="center" justify="center" cursor="pointer"
                _hover={{ bg: C.hover }} onClick={handleClose}
                sx={{ transition: 'all 0.12s' }}
              >
                <Text fontSize="sm" fontWeight="500" color={C.textSecondary}>Cancel</Text>
              </Flex>
              <Flex
                flex={1} h="38px" borderRadius="10px"
                bg={loading || !name.trim() || selected.size === 0 ? C.elevated : C.accent}
                border={`1px solid ${loading || !name.trim() || selected.size === 0 ? C.border : C.accent}`}
                align="center" justify="center"
                cursor={loading || !name.trim() || selected.size === 0 ? 'not-allowed' : 'pointer'}
                opacity={loading || !name.trim() || selected.size === 0 ? 0.5 : 1}
                onClick={loading ? undefined : handleCreate}
                sx={{ transition: 'all 0.12s' }}
              >
                <Text fontSize="sm" fontWeight="600" color="white">
                  {loading ? 'Creating…' : `Create${selected.size > 0 ? ` (${selected.size + 1})` : ''}`}
                </Text>
              </Flex>
            </Flex>
          </MotionBox>
        </Box>
      )}
    </AnimatePresence>
  )
}
