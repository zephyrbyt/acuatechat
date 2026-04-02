import React from 'react'
import { Box, HStack, Text, Tooltip } from '@chakra-ui/react'
import type { TorStatusData } from '../App'
import { C } from '../theme'

function truncateOnion(onion: string): string {
  if (onion.length <= 20) return onion
  return onion.slice(0, 10) + '…' + onion.slice(-8)
}

export function TorStatusBar({ torStatus }: { torStatus: TorStatusData }): React.ReactElement {
  const { status, onionAddress, error } = torStatus

  const dotColor = {
    connecting: C.amber,
    connected: C.green,
    error: C.red
  }[status]

  const statusText = {
    connecting: 'Connecting…',
    connected: 'Connected',
    error: 'Connection error'
  }[status]

  return (
    <Box
      h="26px"
      bg={C.surface}
      borderTop={`1px solid ${C.borderFaint}`}
      px={5}
      flexShrink={0}
    >
      <HStack h="full" justify="space-between">
        <HStack spacing="8px">
          {/* Status dot */}
          <Box position="relative" w="6px" h="6px" flexShrink={0}>
            {status === 'connected' && (
              <Box
                position="absolute" inset={0} borderRadius="full" bg={dotColor}
                sx={{
                  animation: 'statusPulse 3s ease-in-out infinite',
                  '@keyframes statusPulse': {
                    '0%, 100%': { opacity: 0.2, transform: 'scale(1)' },
                    '50%': { opacity: 0, transform: 'scale(2.6)' }
                  }
                }}
              />
            )}
            <Box position="absolute" inset={0} borderRadius="full" bg={dotColor} />
          </Box>

          <Text fontSize="11px" color={C.textMuted} fontWeight="400">
            {statusText}
          </Text>

          {status === 'connected' && onionAddress && (
            <>
              <Box w="1px" h="9px" bg={C.borderFaint} />
              <Tooltip label={onionAddress} placement="top">
                <Text
                  fontSize="11px" color={C.textFaint}
                  fontFamily="mono" cursor="default"
                  sx={{ userSelect: 'none' }}
                >
                  {truncateOnion(onionAddress)}
                </Text>
              </Tooltip>
            </>
          )}

          {status === 'error' && error && (
            <>
              <Box w="1px" h="9px" bg={C.borderFaint} />
              <Tooltip label={error} placement="top" maxW="400px">
                <Text fontSize="11px" color={C.red} cursor="default" noOfLines={1} maxW="260px">
                  {error.length > 50 ? error.slice(0, 50) + '…' : error}
                </Text>
              </Tooltip>
            </>
          )}
        </HStack>

        <Text fontSize="11px" color={C.textFaint}>v0.1.0</Text>
      </HStack>
    </Box>
  )
}
