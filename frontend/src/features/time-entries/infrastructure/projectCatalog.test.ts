import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import { listProjectCodes } from './projectCatalog'

let fake: FakeSupabase
beforeEach(() => { fake = createFakeSupabase() })

describe('catálogo de projetos do Banco 1', () => {
  it('lê apenas os códigos disponíveis na tabela local', async () => {
    fake.tables.set('banco1_project_catalog', [
      { code: 'OBRA-2' }, { code: 'OBRA-1' },
    ])
    expect(await listProjectCodes(fake.client)).toEqual(['OBRA-1', 'OBRA-2'])
  })
  it('pagina o catálogo para não omitir projetos após o primeiro milhar', async () => {
    fake.tables.set('banco1_project_catalog', Array.from({ length: 1001 }, (_, index) => ({ code: `P-${String(index).padStart(4, '0')}` })))
    expect(await listProjectCodes(fake.client)).toHaveLength(1001)
    expect(fake.calls.filter((call) => call.table === 'banco1_project_catalog' && call.op === 'select')).toHaveLength(2)
  })
})
