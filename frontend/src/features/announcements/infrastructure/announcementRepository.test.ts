// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import { BANCO1_ANNOUNCEMENTS_TABLE, BANCO1_ANNOUNCEMENT_HIDDEN_TABLE, SupabaseAnnouncementRepository } from './announcementRepository'

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
