import React from 'react'
import { parse } from 'twemoji-parser'

interface TwemojiTextProps {
  text: string
  fontSize?: string
  lineHeight?: string | number
  color?: string
}

// Renders a string with native emoji replaced by Twemoji SVG images.
// Non-emoji text segments are rendered as plain spans.
export function TwemojiText({ text, fontSize = '14px', lineHeight = 1.6, color }: TwemojiTextProps): React.ReactElement {
  const entities = parse(text, { assetType: 'svg' })

  if (entities.length === 0) {
    return (
      <span style={{ fontSize, lineHeight: String(lineHeight), color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {text}
      </span>
    )
  }

  const parts: React.ReactNode[] = []
  let cursor = 0

  for (const entity of entities) {
    // Text before this emoji
    if (entity.indices[0] > cursor) {
      parts.push(
        <span key={`text-${cursor}`}>
          {text.slice(cursor, entity.indices[0])}
        </span>
      )
    }
    // The emoji itself
    parts.push(
      <img
        key={`emoji-${entity.indices[0]}`}
        src={entity.url}
        alt={entity.text}
        draggable={false}
        style={{
          display: 'inline-block',
          width: '1.2em',
          height: '1.2em',
          verticalAlign: '-0.2em',
          margin: '0 0.05em',
          objectFit: 'contain',
        }}
      />
    )
    cursor = entity.indices[1]
  }

  // Remaining text after last emoji
  if (cursor < text.length) {
    parts.push(
      <span key={`text-${cursor}`}>
        {text.slice(cursor)}
      </span>
    )
  }

  return (
    <span style={{ fontSize, lineHeight: String(lineHeight), color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {parts}
    </span>
  )
}
