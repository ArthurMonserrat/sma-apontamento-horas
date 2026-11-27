import { describe, expect, it } from 'vitest'
import { normalizeExternalProjects } from '../../supabase/functions/sync-banco1-projects/catalog'

describe('importação dos códigos de projeto', () => {
  it('preserva código e título reduzido sem importar o cliente', () => {
    expect(normalizeExternalProjects([
      { pro_st_apelido: ' OBRA-2 ', pro_st_descricao: ' Teste ', cliente: 'Sigiloso' },
      { pro_st_apelido: 'OBRA-1' },
      { pro_st_apelido: 'OBRA-2', pro_st_descricao: 'Outro título' },
    ])).toEqual([
      { code: 'OBRA-1', title: null },
      { code: 'OBRA-2', title: 'Teste' },
    ])
  })
  it('recusa catálogo vazio ou códigos inválidos para não substituir dados válidos', () => {
    expect(() => normalizeExternalProjects([])).toThrow()
    expect(() => normalizeExternalProjects([{ pro_st_apelido: null }])).toThrow()
    expect(() => normalizeExternalProjects([{ pro_st_apelido: 'x'.repeat(81) }])).toThrow()
    expect(() => normalizeExternalProjects([{ pro_st_apelido: 'OK', pro_st_descricao: 'x'.repeat(161) }])).toThrow()
  })
})
