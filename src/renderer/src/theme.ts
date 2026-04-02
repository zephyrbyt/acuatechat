import { extendTheme, type ThemeConfig } from '@chakra-ui/react'

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false
}

// Design tokens — charcoal dark, not pure black. Spacious, professional.
export const C = {
  // Backgrounds — layered charcoal
  base:        '#111318',   // outermost bg
  surface:     '#16181f',   // sidebar, panels
  panel:       '#1c1e27',   // chat area bg
  elevated:    '#20232e',   // cards, inputs
  card:        '#252836',   // hover cards, popovers
  hover:       '#2a2d3a',   // hover states
  active:      '#2f3344',   // active/pressed

  // Borders
  border:      '#2e3140',
  borderFaint: '#232635',
  borderMid:   '#363a50',

  // Accent — vivid indigo/violet
  accent:      '#6c63ff',
  accentHover: '#7b73ff',
  accentDim:   '#4f48d6',
  accentGlow:  '#6c63ff1a',
  accentSubtle:'#6c63ff0d',

  // Status
  green:       '#34d399',
  greenGlow:   '#34d39918',
  red:         '#f87171',
  amber:       '#fbbf24',

  // Text
  textPrimary:   '#e8eaf0',
  textSecondary: '#9094a8',
  textMuted:     '#555870',
  textFaint:     '#3a3d52',
}

export const theme = extendTheme({
  config,
  fonts: {
    heading: `'Inter', system-ui, -apple-system, sans-serif`,
    body:    `'Inter', system-ui, -apple-system, sans-serif`,
    mono:    `'JetBrains Mono', 'Fira Code', monospace`,
  },
  styles: {
    global: {
      body: {
        bg: C.base,
        color: C.textPrimary,
        fontFamily: `'Inter', system-ui, sans-serif`,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      },
      '*': { boxSizing: 'border-box' },
      '::-webkit-scrollbar': { width: '3px', height: '3px' },
      '::-webkit-scrollbar-track': { background: 'transparent' },
      '::-webkit-scrollbar-thumb': { background: C.border, borderRadius: '4px' },
      '::-webkit-scrollbar-thumb:hover': { background: C.borderMid },
    }
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: '500',
        borderRadius: '10px',
        fontSize: 'sm',
        _focus: { boxShadow: 'none' }
      },
      variants: {
        solid: {
          bg: C.accent,
          color: 'white',
          _hover: { bg: C.accentHover },
          _active: { bg: C.accentDim },
          _disabled: { opacity: 0.4, cursor: 'not-allowed' }
        },
        ghost: {
          color: C.textSecondary,
          _hover: { bg: C.hover, color: C.textPrimary }
        },
        outline: {
          borderColor: C.border,
          color: C.textPrimary,
          _hover: { bg: C.hover }
        }
      },
      defaultProps: { variant: 'solid' }
    },
    Input: {
      variants: {
        outline: {
          field: {
            bg: C.elevated,
            borderColor: C.border,
            color: C.textPrimary,
            borderRadius: '10px',
            _placeholder: { color: C.textMuted },
            _hover: { borderColor: C.borderMid },
            _focus: { borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}40` }
          }
        }
      },
      defaultProps: { variant: 'outline' }
    },
    Textarea: {
      variants: {
        outline: {
          bg: C.elevated,
          borderColor: C.border,
          color: C.textPrimary,
          borderRadius: '10px',
          _placeholder: { color: C.textMuted },
          _hover: { borderColor: C.borderMid },
          _focus: { borderColor: C.accent, boxShadow: `0 0 0 1px ${C.accent}40` }
        }
      },
      defaultProps: { variant: 'outline' }
    },
    Modal: {
      baseStyle: {
        dialog: {
          bg: C.elevated,
          border: `1px solid ${C.border}`,
          borderRadius: '16px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)'
        },
        overlay: { bg: 'rgba(10,11,16,0.88)', backdropFilter: 'blur(10px)' },
        header: { color: C.textPrimary, fontWeight: '600', fontSize: 'md' },
        closeButton: {
          color: C.textSecondary,
          _hover: { bg: C.hover, color: C.textPrimary },
          borderRadius: '8px'
        }
      }
    },
    Tooltip: {
      baseStyle: {
        bg: C.card,
        color: C.textPrimary,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        fontSize: 'xs',
        px: 3,
        py: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
      }
    }
  },
  semanticTokens: {
    colors: {
      'chakra-body-bg':   { default: C.base, _dark: C.base },
      'chakra-body-text': { default: C.textPrimary, _dark: C.textPrimary }
    }
  }
})
