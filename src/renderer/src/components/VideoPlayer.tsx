import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import {
  LuPlay, LuPause, LuVolume2, LuVolumeX,
  LuMaximize, LuMinimize, LuDownload
} from 'react-icons/lu'
import { C } from '../theme'

function formatDuration(secs: number): string {
  if (!isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface VideoPlayerProps {
  src: string
  name: string
  onLoad?: () => void
}

export function VideoPlayer({ src, name, onLoad }: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubberRef = useRef<HTMLDivElement>(null)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)

  // ── Playback ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play() } else { v.pause() }
  }, [])

  // ── Volume ────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }, [])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const val = parseFloat(e.target.value)
    v.volume = val
    setVolume(val)
    if (val === 0) { v.muted = true; setMuted(true) }
    else if (v.muted) { v.muted = false; setMuted(false) }
  }, [])

  // ── Scrubber ──────────────────────────────────────────────────────────────
  const seekTo = useCallback((clientX: number) => {
    const v = videoRef.current
    const bar = scrubberRef.current
    if (!v || !bar || !duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = ratio * duration
    setCurrentTime(ratio * duration)
  }, [duration])

  const handleScrubberMouseDown = useCallback((e: React.MouseEvent) => {
    setScrubbing(true)
    seekTo(e.clientX)
  }, [seekTo])

  useEffect(() => {
    if (!scrubbing) return
    const onMove = (e: MouseEvent) => seekTo(e.clientX)
    const onUp = () => setScrubbing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [scrubbing, seekTo])

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 2500)
  }, [playing])

  useEffect(() => () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current) }, [])

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = src
    a.download = name
    a.click()
  }, [src, name])

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <Box
      ref={containerRef}
      borderRadius="12px"
      overflow="hidden"
      bg="#000"
      position="relative"
      maxW="100%"
      cursor={playing && !showControls ? 'none' : 'default'}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) setShowControls(false) }}
      onMouseEnter={() => setShowControls(true)}
    >
      {/* Video element */}
      <Box
        as="video"
        ref={videoRef}
        src={src}
        maxW="100%"
        maxH={fullscreen ? '100vh' : '320px'}
        w="100%"
        display="block"
        sx={{ outline: 'none' }}
        onClick={togglePlay}
        onLoadedMetadata={(e: React.SyntheticEvent<HTMLVideoElement>) => {
          setDuration(e.currentTarget.duration)
          onLoad?.()
        }}
        onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement>) => {
          if (!scrubbing) setCurrentTime(e.currentTarget.currentTime)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setShowControls(true) }}
      />

      {/* Controls overlay */}
      <Box
        position="absolute" bottom={0} left={0} right={0}
        px="12px" pt="32px" pb="10px"
        background="linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)"
        sx={{
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.22s',
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        {/* Scrubber */}
        <Box
          ref={scrubberRef}
          h="4px" w="100%" borderRadius="full"
          bg="rgba(255,255,255,0.2)"
          mb="10px" cursor="pointer" position="relative"
          onMouseDown={handleScrubberMouseDown}
          _hover={{ h: '5px' }}
          sx={{ transition: 'height 0.1s' }}
        >
          <Box
            position="absolute" left={0} top={0} h="100%" borderRadius="full"
            bg={C.accent} w={`${progress * 100}%`}
            sx={{ transition: scrubbing ? 'none' : 'width 0.1s' }}
          />
          {/* Thumb */}
          <Box
            position="absolute" top="50%" transform="translate(-50%, -50%)"
            left={`${progress * 100}%`}
            w="12px" h="12px" borderRadius="full" bg="white"
            boxShadow="0 1px 4px rgba(0,0,0,0.5)"
            sx={{ opacity: showControls ? 1 : 0, transition: 'opacity 0.15s' }}
          />
        </Box>

        {/* Controls row */}
        <Flex align="center" gap={2}>
          {/* Play/Pause */}
          <Flex
            as="button" w="28px" h="28px" borderRadius="full"
            align="center" justify="center" flexShrink={0}
            color="white" cursor="pointer"
            _hover={{ bg: 'rgba(255,255,255,0.15)' }}
            onClick={togglePlay}
            sx={{ transition: 'background 0.12s' }}
          >
            {playing ? <LuPause size={14} /> : <LuPlay size={14} />}
          </Flex>

          {/* Mute */}
          <Flex
            as="button" w="28px" h="28px" borderRadius="full"
            align="center" justify="center" flexShrink={0}
            color="white" cursor="pointer"
            _hover={{ bg: 'rgba(255,255,255,0.15)' }}
            onClick={toggleMute}
            sx={{ transition: 'background 0.12s' }}
          >
            {muted || volume === 0 ? <LuVolumeX size={13} /> : <LuVolume2 size={13} />}
          </Flex>

          {/* Volume slider */}
          <Box w="60px" flexShrink={0}>
            <input
              type="range" min={0} max={1} step={0.02}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              style={{
                width: '100%',
                accentColor: C.accent,
                cursor: 'pointer',
                height: '3px',
              }}
            />
          </Box>

          {/* Time */}
          <Text fontSize="10px" color="rgba(255,255,255,0.7)" flexShrink={0} ml={1} letterSpacing="0.2px">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </Text>

          <Box flex={1} />

          {/* Download */}
          <Flex
            as="button" w="28px" h="28px" borderRadius="full"
            align="center" justify="center" flexShrink={0}
            color="rgba(255,255,255,0.6)" cursor="pointer"
            _hover={{ bg: 'rgba(255,255,255,0.15)', color: 'white' }}
            onClick={handleDownload}
            sx={{ transition: 'all 0.12s' }}
          >
            <LuDownload size={13} />
          </Flex>

          {/* Fullscreen */}
          <Flex
            as="button" w="28px" h="28px" borderRadius="full"
            align="center" justify="center" flexShrink={0}
            color="rgba(255,255,255,0.6)" cursor="pointer"
            _hover={{ bg: 'rgba(255,255,255,0.15)', color: 'white' }}
            onClick={toggleFullscreen}
            sx={{ transition: 'all 0.12s' }}
          >
            {fullscreen ? <LuMinimize size={13} /> : <LuMaximize size={13} />}
          </Flex>
        </Flex>
      </Box>

      {/* Big play button overlay when paused */}
      {!playing && (
        <Flex
          position="absolute" inset={0}
          align="center" justify="center"
          onClick={togglePlay}
          cursor="pointer"
          sx={{ pointerEvents: 'auto' }}
        >
          <Flex
            w="48px" h="48px" borderRadius="full"
            bg="rgba(0,0,0,0.55)" backdropFilter="blur(4px)"
            align="center" justify="center"
            border="1.5px solid rgba(255,255,255,0.25)"
            _hover={{ bg: 'rgba(0,0,0,0.72)' }}
            sx={{ transition: 'background 0.15s' }}
          >
            <LuPlay size={18} color="white" style={{ marginLeft: 2 }} />
          </Flex>
        </Flex>
      )}
    </Box>
  )
}
