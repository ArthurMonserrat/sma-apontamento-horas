import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCorporateProfile, mapCorporateRole } from './authService'

const existingProfile = {
  id: 'profile-1',
  email: 'ana@example.com',
  full_name: 'Ana Silva',
  role: 'colaborador' as const,
  squad_id: null,
  active: true,
}

describe('getCorporateProfile', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('solicita o perfil ao endpoint Supabase usando somente o bearer da sessão', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ profile: existingProfile }) })

    await expect(getCorporateProfile('supabase-token')).resolves.toEqual(existingProfile)
    expect(fetchMock).toHaveBeenCalledWith('/api/supabase-session', {
      method: 'GET',
      headers: { Authorization: 'Bearer supabase-token' },
    })
  })

  it('propaga a mensagem de erro retornada pelo BFF', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Sessão Microsoft ausente.' }) })

    await expect(getCorporateProfile('supabase-token')).rejects.toThrow('Sessão Microsoft ausente.')
  })

  it.each([401, 403, 500])('preserva o status HTTP %s para a camada de sessão encerrar novas tentativas', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: 'Falha de validação do perfil.' }) })

    await expect(getCorporateProfile('supabase-token')).rejects.toMatchObject({ status })
  })

  it('não consulta o endpoint sem token Supabase', async () => {
    await expect(getCorporateProfile('')).rejects.toThrow('Sessão Supabase ausente.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

})

describe('mapCorporateRole', () => {
  it.each([
    ['colaborador', 'COLLABORATOR'],
    ['supervisor', 'SUPERVISOR'],
    ['diretor', 'DIRECTOR_ADMIN'],
  ] as const)('converte %s para %s', (input, expected) => {
    expect(mapCorporateRole(input)).toBe(expected)
  })

  it('nega cargos corporativos desconhecidos em vez de conceder colaborador', () => {
    expect(mapCorporateRole('cargo-invalido' as never)).toBeNull()
  })
})
