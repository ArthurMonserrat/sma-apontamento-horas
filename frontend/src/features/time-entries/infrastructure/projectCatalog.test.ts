import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import { filterProjectCatalog, formatProjectCatalogLabel, listProjectCatalog } from './projectCatalog'

let fake: FakeSupabase
beforeEach(() => { fake = createFakeSupabase() })

describe('catálogo de projetos do Banco 1', () => {
  it('formata e filtra por código ou título reduzido', () => {
    const projects = [{ code: '25V151E', title: 'Teste' }, { code: '18603', title: 'Outra obra' }]
    expect(formatProjectCatalogLabel(projects[0])).toBe('25V151E — Teste')
    expect(filterProjectCatalog(projects, 'teste')).toEqual([projects[0]])
    expect(filterProjectCatalog(projects, '18603')).toEqual([projects[1]])
  })

  it('lê código e título reduzido disponíveis na tabela local', async () => {
    fake.tables.set('banco1_project_catalog', [
      { code: 'OBRA-2', title: 'Teste 2' }, { code: 'OBRA-1', title: null },
    ])
    expect(await listProjectCatalog(fake.client)).toEqual([
      { code: 'OBRA-1', title: null },
      { code: 'OBRA-2', title: 'Teste 2' },
    ])
  })
  it('pagina o catálogo para não omitir projetos após o primeiro milhar', async () => {
    fake.tables.set('banco1_project_catalog', Array.from({ length: 1001 }, (_, index) => ({ code: `P-${String(index).padStart(4, '0')}` })))
    expect(await listProjectCatalog(fake.client)).toHaveLength(1001)
    expect(fake.calls.filter((call) => call.table === 'banco1_project_catalog' && call.op === 'select')).toHaveLength(2)
  })

  it('mantém o catálogo utilizável enquanto a coluna de título ainda não foi aplicada', async () => {
    fake.tables.set('banco1_project_catalog', [{ code: 'OBRA-1' }])
    fake.failNext({ code: 'PGRST204', message: "Could not find the 'title' column" })
    expect(await listProjectCatalog(fake.client)).toEqual([{ code: 'OBRA-1', title: null }])
    expect(fake.calls.filter((call) => call.table === 'banco1_project_catalog' && call.op === 'select')).toHaveLength(1)
  })
})
