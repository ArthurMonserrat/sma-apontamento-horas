import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusBadge, type StatusTone } from './StatusBadge'

const tones: StatusTone[] = ['neutral', 'info', 'pending', 'warning', 'success', 'danger', 'cancelled']

describe('badge semântico de status', () => {
  it('renderiza texto e identificador visual para todos os tons suportados', () => {
    for (const tone of tones) {
      const markup = renderToStaticMarkup(<StatusBadge tone={tone}>Status {tone}</StatusBadge>)

      expect(markup).toContain(`data-status-tone="${tone}"`)
      expect(markup).toContain(`status-badge--${tone}`)
      expect(markup).toContain(`Status ${tone}`)
    }
  })

  it('oferece espaçamento regular sem alterar a semântica do badge', () => {
    const markup = renderToStaticMarkup(<StatusBadge tone="success" size="regular">Aprovado</StatusBadge>)

    expect(markup).toContain('px-3 py-1.5')
    expect(markup).toContain('data-status-tone="success"')
  })
})
