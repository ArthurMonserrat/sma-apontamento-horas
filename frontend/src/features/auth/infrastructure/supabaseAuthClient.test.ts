import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseAuthClient } from './supabaseAuthClient'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ auth: {} })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

describe('createSupabaseAuthClient', () => {
  beforeEach(() => createClientMock.mockClear())

  it('cria o cliente com PKCE e persistência de sessão', () => {
    const client = createSupabaseAuthClient({
      url: 'https://project.supabase.co',
      anonKey: 'anon-key',
      redirectTo: 'https://app.example/auth/callback',
      enabled: true,
    })

    expect(client).toBeTruthy()
    expect(createClientMock).toHaveBeenCalledWith('https://project.supabase.co', 'anon-key', {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  })

  it('não cria cliente quando a configuração pública está incompleta', () => {
    expect(createSupabaseAuthClient({ url: '', anonKey: '', redirectTo: '', enabled: false })).toBeNull()
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
