import React, { useState, useEffect, useRef } from 'react'
import { Box, Flex, Text, HStack } from '@chakra-ui/react'
import { LuGlobe, LuX, LuExternalLink } from 'react-icons/lu'
import { C } from '../theme'

// Built-in sites that auto-load embeds without prompting
const BUILTIN_AUTO_DOMAINS = new Set([
  'github.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'wikipedia.org',
  'stackoverflow.com',
  'npmjs.com',
  'developer.mozilla.org',
])

export interface EmbedSettings {
  enabled: boolean
  allowDomains: string[]  // user-added auto-load domains
  blockDomains: string[]  // domains to never embed
}

function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be' || u.hostname === 'www.youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null
    }
    if (u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com') {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null
      return u.searchParams.get('v')
    }
  } catch { return null }
  return null
}

function YouTubeEmbed({ videoId, isSent, onLoad }: { videoId: string; isSent: boolean; onLoad?: () => void }): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Use Electron's <webview> tag — gets its own browser context so YouTube loads correctly
    const webview = document.createElement('webview' as 'div') as HTMLElement
    webview.setAttribute('src', `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=0`)
    webview.setAttribute('allowpopups', '')
    webview.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#000;'
    container.appendChild(webview)
    // Height is set by CSS aspect-ratio box so scroll can adjust immediately
    onLoad?.()
    return () => { if (container.contains(webview)) container.removeChild(webview) }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box
      mt="6px"
      borderRadius="10px"
      overflow="hidden"
      bg="black"
      border={`1px solid ${isSent ? 'rgba(255,255,255,0.1)' : C.border}`}
      maxW="100%"
      sx={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <Box position="relative" w="100%" style={{ paddingTop: '56.25%' }}>
        <Box ref={containerRef} position="absolute" top={0} left={0} w="100%" h="100%" />
      </Box>
    </Box>
  )
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function isBlocked(url: string, blockDomains: string[]): boolean {
  const domain = getDomain(url)
  return blockDomains.some(d => domain === d || domain.endsWith('.' + d))
}

function shouldAutoLoad(url: string, allowDomains: string[]): boolean {
  const domain = getDomain(url)
  if (BUILTIN_AUTO_DOMAINS.has(domain) || [...BUILTIN_AUTO_DOMAINS].some(d => domain.endsWith('.' + d))) return true
  return allowDomains.some(d => domain === d || domain.endsWith('.' + d))
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"']+/g
  return [...new Set(text.match(urlRegex) ?? [])]
}

interface EmbedData {
  title?: string
  description?: string
  image?: string
  siteName?: string
  favicon?: string
}

interface LinkEmbedProps {
  url: string
  isSent: boolean
  embedSettings: EmbedSettings
  onLoad?: () => void
}

export function LinkEmbed({ url, isSent, embedSettings, onLoad }: LinkEmbedProps): React.ReactElement | null {
  if (!embedSettings.enabled) return null
  if (isBlocked(url, embedSettings.blockDomains)) return null

  const videoId = getYouTubeVideoId(url)
  if (videoId) return <YouTubeEmbed videoId={videoId} isSent={isSent} onLoad={onLoad} />
  return <MetadataEmbed url={url} isSent={isSent} embedSettings={embedSettings} onLoad={onLoad} />
}

function MetadataEmbed({ url, isSent, embedSettings, onLoad }: LinkEmbedProps): React.ReactElement | null {
  // 'cache-check' = waiting for cache lookup before deciding state
  const [state, setState] = useState<'cache-check' | 'idle' | 'loading' | 'loaded' | 'dismissed'>('cache-check')
  const [data, setData] = useState<EmbedData | null>(null)

  // Notify parent to re-scroll whenever we transition to a visible state
  useEffect(() => {
    if (state === 'idle' || state === 'loaded') onLoad?.()
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: check cache first, then determine whether to auto-load or prompt
  useEffect(() => {
    let cancelled = false
    window.acuate.embedCacheGet(url).then(cached => {
      if (cancelled) return
      if (cached) {
        setData(cached)
        setState('loaded')
      } else {
        setState(shouldAutoLoad(url, embedSettings.allowDomains) ? 'loading' : 'idle')
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Fetch metadata when state transitions to 'loading'
  useEffect(() => {
    if (state !== 'loading') return
    let cancelled = false
    window.acuate.fetchEmbed(url).then(result => {
      if (cancelled) return
      if (result) {
        setData(result)
        setState('loaded')
        window.acuate.embedCacheSet(url, result)
      } else {
        setState('dismissed')
      }
    })
    return () => { cancelled = true }
  }, [state, url])

  if (state === 'cache-check' || state === 'dismissed') return null

  const domain = getDomain(url)

  // Prompt for unknown sites
  if (state === 'idle') {
    return (
      <Box
        mt="6px"
        px="12px" py="8px"
        bg={isSent ? 'rgba(0,0,0,0.2)' : C.card}
        border={`1px solid ${isSent ? 'rgba(255,255,255,0.1)' : C.border}`}
        borderRadius="10px"
        maxW="100%"
      >
        <HStack spacing="8px" justify="space-between">
          <HStack spacing="6px" minW={0}>
            <LuGlobe size={12} color={isSent ? 'rgba(255,255,255,0.5)' : C.textMuted} style={{ flexShrink: 0 }} />
            <Text fontSize="11px" color={isSent ? 'rgba(255,255,255,0.6)' : C.textMuted} isTruncated>
              Load preview for <Box as="span" color={isSent ? 'rgba(255,255,255,0.85)' : C.textSecondary} fontWeight="500">{domain}</Box>?
            </Text>
          </HStack>
          <HStack spacing="6px" flexShrink={0}>
            <Box
              as="button"
              fontSize="11px" fontWeight="500"
              color={isSent ? 'rgba(255,255,255,0.85)' : C.accent}
              px="8px" py="3px"
              borderRadius="6px"
              bg={isSent ? 'rgba(255,255,255,0.12)' : C.accentSubtle}
              cursor="pointer"
              _hover={{ opacity: 0.8 }}
              onClick={() => setState('loading')}
              sx={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              Load
            </Box>
            <Box
              as="button"
              cursor="pointer"
              color={isSent ? 'rgba(255,255,255,0.4)' : C.textMuted}
              _hover={{ opacity: 0.7 }}
              onClick={() => setState('dismissed')}
              sx={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <LuX size={12} />
            </Box>
          </HStack>
        </HStack>
      </Box>
    )
  }

  // Loading state
  if (state === 'loading') {
    return (
      <Box
        mt="6px" px="12px" py="8px"
        bg={isSent ? 'rgba(0,0,0,0.2)' : C.card}
        border={`1px solid ${isSent ? 'rgba(255,255,255,0.08)' : C.border}`}
        borderRadius="10px"
      >
        <Text fontSize="11px" color={isSent ? 'rgba(255,255,255,0.4)' : C.textMuted}>
          Loading preview...
        </Text>
      </Box>
    )
  }

  // Loaded embed card
  if (state === 'loaded' && data) {
    return (
      <Box
        mt="6px"
        bg={isSent ? 'rgba(0,0,0,0.2)' : C.card}
        border={`1px solid ${isSent ? 'rgba(255,255,255,0.1)' : C.border}`}
        borderRadius="10px"
        overflow="hidden"
        maxW="100%"
        cursor="pointer"
        onClick={() => window.open(url, '_blank')}
        sx={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        _hover={{ borderColor: isSent ? 'rgba(255,255,255,0.2)' : C.borderMid }}
        transition="border-color 0.15s"
      >
        {data.image && (
          <Box
            as="img"
            src={data.image}
            w="100%" maxH="160px"
            objectFit="cover"
            display="block"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none' }}
          />
        )}
        <Box px="12px" py="10px">
          <HStack spacing="6px" mb="4px">
            {data.favicon && (
              <Box
                as="img"
                src={data.favicon}
                w="14px" h="14px"
                borderRadius="3px"
                flexShrink={0}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <Text fontSize="10px" color={isSent ? 'rgba(255,255,255,0.5)' : C.textMuted} isTruncated>
              {data.siteName ?? domain}
            </Text>
            <LuExternalLink size={10} color={isSent ? 'rgba(255,255,255,0.3)' : C.textFaint} style={{ flexShrink: 0, marginLeft: 'auto' }} />
          </HStack>
          {data.title && (
            <Text
              fontSize="12px" fontWeight="600" lineHeight="1.4"
              color={isSent ? 'rgba(255,255,255,0.9)' : C.textPrimary}
              noOfLines={2}
            >
              {data.title}
            </Text>
          )}
          {data.description && (
            <Text
              fontSize="11px" lineHeight="1.5" mt="3px"
              color={isSent ? 'rgba(255,255,255,0.55)' : C.textSecondary}
              noOfLines={2}
            >
              {data.description}
            </Text>
          )}
        </Box>
      </Box>
    )
  }

  return null
}
