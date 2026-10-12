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

  it('solicita o perfil ao BFF sem acessar o Supabase no navegador', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ profile: existingProfile }) })

    await expect(getCorporateProfile()).resolves.toEqual(existingProfile)
    expect(fetchMock).toHaveBeenCalledWith('/api/provision', {
      method: 'POST',
      credentials: 'include',
    })
  })

  it('propaga a mensagem de erro retornada pelo BFF', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Sessão Microsoft ausente.' }) })

    await expect(getCorporateProfile()).rejects.toThrow('Sessão Microsoft ausente.')
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
