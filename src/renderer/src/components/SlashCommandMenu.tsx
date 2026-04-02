import React from 'react'
import { Box, Flex, Text, VStack } from '@chakra-ui/react'
import { C } from '../theme'

export interface SlashCommand {
  command: string
  description: string
  icon: React.ReactElement
  onSelect: () => void
}

interface SlashCommandMenuProps {
  commands: SlashCommand[]
  query: string
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
}

export function SlashCommandMenu({ commands, query, selectedIndex, onSelect }: SlashCommandMenuProps): React.ReactElement | null {
  const filtered = query
    ? commands.filter(c => c.command.startsWith(query.toLowerCase()))
    : commands

  if (filtered.length === 0) return null

  return (
    <Box
      position="absolute" bottom="100%" left={0} right={0} mb={2} zIndex={100}
      bg={C.panel} border={`1px solid ${C.border}`}
      borderRadius="14px" overflow="hidden"
      boxShadow="0 8px 40px rgba(0,0,0,0.55)"
    >
      <Box px={4} py="8px" borderBottom={`1px solid ${C.borderFaint}`}>
        <Text fontSize="10px" fontWeight="600" color={C.textFaint} textTransform="uppercase" letterSpacing="0.8px">
          Commands
        </Text>
      </Box>
      <VStack spacing={0} align="stretch" py="4px">
        {filtered.map((cmd, i) => {
          const active = i === selectedIndex
          return (
            <Flex
              key={cmd.command}
              px={3} py="9px" gap={3} align="center"
              cursor="pointer"
              bg={active ? C.accentGlow : 'transparent'}
              _hover={{ bg: active ? C.accentGlow : C.hover }}
              onClick={() => onSelect(cmd)}
              sx={{ transition: 'background 0.1s' }}
            >
              <Flex
                w="32px" h="32px" borderRadius="9px" flexShrink={0}
                align="center" justify="center"
                bg={active ? C.accent + '22' : C.elevated}
                border={`1px solid ${active ? C.accent + '35' : C.border}`}
                sx={{ transition: 'all 0.1s' }}
              >
                {cmd.icon}
              </Flex>
              <Box flex={1}>
                <Text fontSize="sm" fontWeight="600" color={active ? C.accent : C.textPrimary} letterSpacing="-0.1px">
                  /{cmd.command}
                </Text>
                <Text fontSize="11px" color={C.textMuted} mt="1px">{cmd.description}</Text>
              </Box>
              {active && (
                <Text fontSize="10px" color={C.textFaint} flexShrink={0}>↵ enter</Text>
              )}
            </Flex>
          )
        })}
      </VStack>
    </Box>
  )
}
