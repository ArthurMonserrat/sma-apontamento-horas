import { describe, expect, it } from 'vitest'
import { normalizeExternalProjectCodes } from '../../supabase/functions/sync-banco1-projects/catalog'

describe('importação dos códigos de projeto', () => {
  it('extrai somente pro_st_apelido, sem cliente ou descrição', () => {
    expect(normalizeExternalProjectCodes([{ pro_st_apelido: ' OBRA-2 ', cliente: 'Sigiloso' }, { pro_st_apelido: 'OBRA-1' }, { pro_st_apelido: 'OBRA-2' }])).toEqual(['OBRA-1', 'OBRA-2'])
  })
  it('recusa catálogo vazio ou códigos inválidos para não substituir dados válidos', () => {
    expect(() => normalizeExternalProjectCodes([])).toThrow()
    expect(() => normalizeExternalProjectCodes([{ pro_st_apelido: null }])).toThrow()
    expect(() => normalizeExternalProjectCodes([{ pro_st_apelido: 'x'.repeat(81) }])).toThrow()
  })
})
