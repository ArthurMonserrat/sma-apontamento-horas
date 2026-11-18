import { describe, expect, it } from 'vitest'
import { createEmptyCorporateHistoryState } from './useTimeEntryHistory'

describe('estado vazio do histórico corporativo', () => {
  it('não transforma a ausência de apontamentos em erro demonstrativo', () => {
    expect(createEmptyCorporateHistoryState()).toEqual({
      rows: [],
      nextCursor: null,
      total: 0,
      periodSummary: null,
      periodEvents: [],
      isLoading: false,
      error: null,
    })
  })
})
