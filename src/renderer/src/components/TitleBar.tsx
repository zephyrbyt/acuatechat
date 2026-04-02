import React, { useState } from 'react'
import { Flex, Text, Box, HStack } from '@chakra-ui/react'
import { C } from '../theme'
import icon from '../assets/icon.jpg'

export function TitleBar(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false)

  const handleMaximize = () => {
    window.acuate.windowMaximize()
    setIsMaximized(v => !v)
  }

  return (
    <Flex
      h="36px"
      bg={C.surface}
      borderBottom={`1px solid ${C.borderFaint}`}
      align="center"
      justify="space-between"
      flexShrink={0}
      sx={{ WebkitAppRegion: 'drag', userSelect: 'none' } as React.CSSProperties}
      px={0}
    >
      {/* Left: app identity */}
      <HStack spacing={0} pl="14px">
        {/* Logo mark */}
        <img src={icon} alt="" style={{ width: '18px', height: '18px', borderRadius: '4px', marginRight: '8px', objectFit: 'cover' }} />
        <Text
          fontSize="12px" fontWeight="600"
          color={C.textSecondary} letterSpacing="0.1px"
        >
          Acuate
        </Text>
        <Text fontSize="12px" fontWeight="400" color={C.textMuted} ml="1px">
          .chat
        </Text>
      </HStack>

      {/* Right: window controls */}
      <HStack
        spacing={0}
        sx={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        h="full"
      >
        <WinBtn onClick={() => window.acuate.windowMinimize()} hoverBg="#ffffff10" title="Minimise">
          <svg width="10" height="1" viewBox="0 0 10 1">
            <line x1="0" y1="0.5" x2="10" y2="0.5" stroke={C.textMuted} strokeWidth="1.2" />
          </svg>
        </WinBtn>

        <WinBtn onClick={handleMaximize} hoverBg="#ffffff10" title="Maximise">
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2.5" y="0.5" width="7" height="7" rx="1" stroke={C.textMuted} strokeWidth="1.1" />
              <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill={C.surface} stroke={C.textMuted} strokeWidth="1.1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1.5" stroke={C.textMuted} strokeWidth="1.1" />
            </svg>
          )}
        </WinBtn>

        <WinBtn onClick={() => window.acuate.windowClose()} hoverBg="#e8142555" title="Close" isClose>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke={C.textMuted} strokeWidth="1.3" strokeLinecap="round" />
            <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke={C.textMuted} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </WinBtn>
      </HStack>
    </Flex>
  )
}

function WinBtn({ onClick, hoverBg, title, children, isClose }: {
  onClick: () => void
  hoverBg: string
  title: string
  isClose?: boolean
  children: React.ReactNode
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  return (
    <Flex
      as="button"
      onClick={onClick}
      title={title}
      w="40px" h="36px"
      align="center" justify="center"
      bg={hovered ? hoverBg : 'transparent'}
      cursor="pointer"
      sx={{ transition: 'background 0.1s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      borderRadius={isClose ? '0' : '0'}
    >
      {children}
    </Flex>
  )
}
