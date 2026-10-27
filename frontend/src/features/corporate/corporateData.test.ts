import { afterEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { corporateDataError, getCorporateDataClient, isCorporateDataActive, setCorporateDataClientForTests, setCorporateDataSession, toCorporatePerson } from './corporateData'

afterEach(() => {
  setCorporateDataSession(null)
  setCorporateDataClientForTests(undefined)
})

describe('corporateData', () => {
  it('só usa o banco de dados com sessão corporativa marcada', () => {
    const client = {} as SupabaseClient
    setCorporateDataClientForTests(client)
    expect(isCorporateDataActive()).toBe(false)
    setCorporateDataSession('user-1')
    expect(getCorporateDataClient()).toBe(client)
    setCorporateDataSession(null)
    expect(getCorporateDataClient()).toBeNull()
  })

  it('monta o nome pela conta quando o perfil não tem nome completo', () => {
    expect(toCorporatePerson({ id: '1', full_name: null, email: 'Hugo.Barbosa@sma-eng.com.br', module_role: 'colaborador', team_id: null, team_name: null, supervisor_id: null, supervisor_name: null }))
      .toMatchObject({ name: 'Hugo Barbosa', email: 'hugo.barbosa@sma-eng.com.br', role: 'colaborador' })
    expect(toCorporatePerson({ id: '2', full_name: 'Ana Paula Souza', email: 'a@x', module_role: 'diretor', team_id: 't', team_name: 'Equipe', supervisor_id: 's', supervisor_name: ' Sup ' }))
      .toMatchObject({ name: 'Ana Paula Souza', role: 'diretor', teamName: 'Equipe', supervisorName: 'Sup' })
  })

  it('traduz erros do banco', () => {
    expect(corporateDataError({ code: '23514', message: 'Informe o motivo do cancelamento.' }, 'x').message).toBe('Informe o motivo do cancelamento.')
    expect(corporateDataError({ code: '42501', message: 'permission denied for table banco1_time_entries' }, 'x').message).toBe('Você não tem permissão para esta operação.')
    expect(corporateDataError({ code: 'PGRST301', message: 'JWT expired' }, 'x').message).toBe('Sua sessão expirou. Entre novamente.')
    expect(corporateDataError({ code: '08006', message: 'connection failure' }, 'Falhou').message).toBe('Falhou')
    expect(corporateDataError(null, 'Falhou').message).toBe('Falhou')
  })
})
