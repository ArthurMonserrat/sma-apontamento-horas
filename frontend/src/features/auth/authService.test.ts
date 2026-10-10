import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCorporateProfile, mapCorporateRole } from './authService'

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('../../config/supabaseClient', () => ({ supabase: mockSupabase }))

const existingProfile = {
  id: 'profile-1',
  email: 'ana@example.com',
  full_name: 'Ana Silva',
  role: 'colaborador' as const,
  squad_id: null,
  active: true,
}

describe('getCorporateProfile', () => {
  beforeEach(() => mockSupabase.from.mockReset())

  it('retorna o perfil corporativo existente', async () => {
    const single = vi.fn().mockResolvedValue({ data: existingProfile, error: null })
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    mockSupabase.from.mockReturnValue({ select })

    await expect(getCorporateProfile('ana@example.com', 'Ana Silva')).resolves.toEqual(existingProfile)
    expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('email', 'ana@example.com')
  })

  it('provisiona automaticamente um novo colaborador quando o perfil não existe', async () => {
    const lookupSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    const eq = vi.fn(() => ({ single: lookupSingle }))
    const selectLookup = vi.fn(() => ({ eq }))
    const created = { ...existingProfile, id: 'profile-new', email: 'novo@example.com', full_name: 'Novo Usuário' }
    const insertSingle = vi.fn().mockResolvedValue({ data: created, error: null })
    const selectInsert = vi.fn(() => ({ single: insertSingle }))
    const insert = vi.fn(() => ({ select: selectInsert }))
    mockSupabase.from
      .mockReturnValueOnce({ select: selectLookup })
      .mockReturnValueOnce({ insert })

    await expect(getCorporateProfile(' novo@example.com ', ' Novo Usuário ')).resolves.toEqual(created)
    expect(insert).toHaveBeenCalledWith([{ email: 'novo@example.com', full_name: 'Novo Usuário', role: 'colaborador', active: true }])
  })

  it('propaga erros diferentes de perfil não encontrado', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'forbidden' } })
    const eq = vi.fn(() => ({ single }))
    mockSupabase.from.mockReturnValue({ select: vi.fn(() => ({ eq })) })

    await expect(getCorporateProfile('ana@example.com', 'Ana Silva')).rejects.toMatchObject({ code: '42501' })
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
})
