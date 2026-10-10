import { describe, expect, it } from 'vitest'
import { createResilientStorage, type StorageLike } from './browserStorage'

describe('storage resiliente', () => {
  it('usa memória quando o getter do storage primário lança', () => {
    const storage = createResilientStorage(() => { throw new DOMException('Bloqueado', 'SecurityError') })

    storage.setItem('key', 'value')

    expect(storage.getItem('key')).toBe('value')
  })

  it('mantém leitura e escrita da sessão quando operações do primário lançam', () => {
    const primary: StorageLike = {
      getItem: () => { throw new DOMException('Bloqueado', 'SecurityError') },
      setItem: () => { throw new DOMException('Bloqueado', 'SecurityError') },
    }
    const storage = createResilientStorage(() => primary)

    expect(storage.getItem('missing')).toBeNull()
    storage.setItem('theme', 'dark')
    expect(storage.getItem('theme')).toBe('dark')
  })

  it('espelha no fallback os valores lidos com sucesso do primário', () => {
    let reads = 0
    const primary: StorageLike = {
      getItem: () => {
        reads += 1
        if (reads > 1) throw new DOMException('Bloqueado', 'SecurityError')
        return 'persisted'
      },
      setItem: () => undefined,
    }
    const storage = createResilientStorage(() => primary)

    expect(storage.getItem('key')).toBe('persisted')
    expect(storage.getItem('key')).toBe('persisted')
  })

  it('prioriza a escrita em memória quando apenas setItem falha no primário', () => {
    const primary: StorageLike = {
      getItem: () => 'old-value',
      setItem: () => { throw new DOMException('Quota excedida', 'QuotaExceededError') },
    }
    const storage = createResilientStorage(() => primary)

    expect(storage.getItem('key')).toBe('old-value')
    storage.setItem('key', 'new-value')

    expect(storage.getItem('key')).toBe('new-value')
  })
})
