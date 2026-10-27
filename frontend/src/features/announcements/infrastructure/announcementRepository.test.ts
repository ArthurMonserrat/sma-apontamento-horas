// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import { BANCO1_ANNOUNCEMENTS_TABLE, BANCO1_ANNOUNCEMENT_HIDDEN_TABLE, BANCO1_ANNOUNCEMENT_READS_TABLE, SupabaseAnnouncementRepository } from './announcementRepository'

const ME = 'hugo'
let fake: FakeSupabase
let repository: SupabaseAnnouncementRepository

function row(id: string, extra: Record<string, unknown> = {}) {
  return { id, title: `Aviso ${id}`, message: 'Mensagem', urgency: 'alerta', recipient_type: 'all', team_id: null, recipient_id: null, author_id: 'diretor', author_name: 'Fernando Almeida', created_at: `2026-10-2${id}T12:00:00Z`, ...extra }
}

beforeEach(() => {
  fake = createFakeSupabase()
  fake.tables.set(BANCO1_ANNOUNCEMENTS_TABLE, [row('1'), row('2', { recipient_type: 'team', team_id: 't1', urgency: 'urgente' }), row('3', { recipient_type: 'individual', recipient_id: ME })])
  fake.tables.set(BANCO1_ANNOUNCEMENT_HIDDEN_TABLE, [{ announcement_id: '1', profile_id: ME }])
  repository = new SupabaseAnnouncementRepository(() => fake.client, () => ME)
  vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
})

describe('SupabaseAnnouncementRepository', () => {
  it('lista os avisos do banco, mais novos primeiro, com autor e ocultos do usuário', async () => {
    const list = await repository.list()
    expect(list.map((item) => item.id)).toEqual(['3', '2', '1'])
    expect(list[0]).toMatchObject({ titulo: 'Aviso 3', autor: 'Fernando Almeida', autorId: 'diretor', tipo_destinatario: 'individual', alvo_referencia: ME, oculto_por: [] })
    expect(list[1]).toMatchObject({ tipo: 'urgente', urgencia: 'urgente', tipo_destinatario: 'team', alvo_referencia: 't1' })
    expect(list[2].oculto_por).toEqual([ME])
  })

  it('publica só com os campos do destino; o banco define autor e data', async () => {
    await repository.create({ titulo: ' Fechamento ', mensagem: ' Revise ', urgencia: 'info', tipoDestinatario: 'team', alvoReferencia: 't1', autor: 'ignorado' })
    const inserted = fake.calls.find((call) => call.op === 'insert' && call.table === BANCO1_ANNOUNCEMENTS_TABLE)!.payload
    expect(inserted).toEqual({ title: 'Fechamento', message: 'Revise', urgency: 'info', recipient_type: 'team', team_id: 't1', recipient_id: null })
    await expect(repository.create({ titulo: 'X', mensagem: 'Y', urgencia: 'info', tipoDestinatario: 'individual', alvoReferencia: null, autor: '' })).rejects.toThrow('Escolha o destinatário do aviso.')
  })

  it('mostra erro quando o banco recusa o destino', async () => {
    fake.failNext({ code: '42501', message: 'new row violates row-level security policy for table "banco1_announcements"' })
    await expect(repository.create({ titulo: 'X', mensagem: 'Y', urgencia: 'info', tipoDestinatario: 'all', alvoReferencia: null, autor: '' })).rejects.toThrow('Você não tem permissão para esta operação.')
  })

  it('exclui pelo banco e avisa quando não tem permissão (nenhuma linha apagada)', async () => {
    await expect(repository.remove('1')).resolves.toBe(true)
    expect(fake.tables.get(BANCO1_ANNOUNCEMENTS_TABLE)!.map((item) => item.id)).toEqual(['2', '3'])
    await expect(repository.remove('nao-existe')).rejects.toThrow('Você não pode excluir este aviso.')
  })

  it('oculta só para o usuário', async () => {
    await repository.hide('2', ME)
    expect(fake.tables.get(BANCO1_ANNOUNCEMENT_HIDDEN_TABLE)).toContainEqual(expect.objectContaining({ announcement_id: '2', profile_id: ME }))
  })
})

describe('SupabaseAnnouncementRepository - lidos', () => {
  it('marca lidos sem duplicar e traz o status na lista; autor conta como lido', async () => {
    fake.tables.set(BANCO1_ANNOUNCEMENT_READS_TABLE, [{ announcement_id: '2', profile_id: ME }])
    let list = await repository.list()
    expect(list.map((item) => [item.id, item.lido])).toEqual([['3', false], ['2', true], ['1', false]])
    await repository.markRead(['3', '2', '3'], ME)
    expect(fake.tables.get(BANCO1_ANNOUNCEMENT_READS_TABLE)!.filter((item) => item.profile_id === ME)).toHaveLength(2)
    list = await repository.list()
    expect(list.find((item) => item.id === '3')?.lido).toBe(true)
    const own = new SupabaseAnnouncementRepository(() => fake.client, () => 'diretor')
    expect((await own.list()).every((item) => item.lido)).toBe(true)
  })

  it('sem a tabela de lidos não mostra contador (todos contam como lidos)', async () => {
    const original = fake.client.from.bind(fake.client)
    vi.spyOn(fake.client, 'from').mockImplementation(((table: string) => table === BANCO1_ANNOUNCEMENT_READS_TABLE
      ? { select: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'not found' } }) }
      : original(table)) as never)
    expect((await repository.list()).every((item) => item.lido)).toBe(true)
  })
})
