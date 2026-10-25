import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authGetUser = vi.hoisted(() => vi.fn())
const profileQuery = vi.hoisted(() => ({
  data: null as unknown,
  error: null as unknown,
  lastFilter: null as { column: string; value: string } | null,
  selected: null as string | null,
}))
const accessQuery = vi.hoisted(() => ({
  data: [] as unknown,
  error: null as unknown,
  filters: [] as Array<{ column: string; value: unknown }>,
}))
const from = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn((_url: string, _key: string, _options?: Record<string, unknown>) => ({
  auth: { getUser: authGetUser },
  from,
})))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

import supabaseSession from '../../api/supabase-session.js'

function createResponse() {
  const response = {
    body: undefined as unknown,
    statusCode: 200,
    json(body: unknown) { response.body = body },
    redirect() { undefined },
    setHeader() { undefined },
    status(statusCode: number) { response.statusCode = statusCode; return response },
  }
  return response
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    query: {},
    headers: { authorization: 'Bearer supabase-token' },
    body: { role: 'diretor', email: 'attacker@example.com' },
    ...overrides,
  }
}

const validProfile = {
  id: 'auth-user-1',
  email: 'ana@example.com',
  full_name: 'Ana Silva',
  role: 'colaborador',
  active: true,
}

const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  SESSION_DEBUG: process.env.SESSION_DEBUG,
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'admin-key'
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_ANON_KEY
  delete process.env.SESSION_DEBUG
  authGetUser.mockReset()
  from.mockReset()
  createClient.mockClear()
  profileQuery.data = validProfile
  profileQuery.error = null
  profileQuery.lastFilter = null
  profileQuery.selected = null
  accessQuery.data = [{ module: 'BANCO_1', role: null }]
  accessQuery.error = null
  accessQuery.filters = []
  from.mockImplementation((table: string) => table === 'profile_module_access' ? ({
    select: vi.fn(() => {
      const chain = {
        eq: vi.fn((column: string, value: unknown) => {
          accessQuery.filters.push({ column, value })
          return chain
        }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: accessQuery.data, error: accessQuery.error }),
      }
      return chain
    }),
  }) : ({
    select: vi.fn((columns: string) => {
      profileQuery.selected = columns
      return {
      eq: vi.fn((column: string, value: string) => ({
        maybeSingle: vi.fn(async () => {
          profileQuery.lastFilter = { column, value }
          return { data: profileQuery.data, error: profileQuery.error }
        }),
      })),
      }
    }),
  }))
  authGetUser.mockResolvedValue({ data: { user: {
    id: 'auth-user-1',
    email: 'ana@example.com',
    app_metadata: { provider: 'azure' },
  } }, error: null })
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('supabase-session corporate profile contract', () => {
  it('returns the authenticated Azure collaborator profile, ignoring client body claims', async () => {
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ profile: { ...validProfile, modules: [{ module: 'BANCO_1', role: validProfile.role }] } })
    expect(profileQuery.lastFilter).toEqual({ column: 'id', value: 'auth-user-1' })
    expect(profileQuery.selected).toBe('id,email,full_name,role,active')
    expect(from).toHaveBeenCalledWith('profiles')
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient.mock.calls[0]?.[1]).toBe('anon-key')
    expect(createClient.mock.calls[1]?.[1]).toBe('admin-key')
    expect(createClient.mock.calls[1]?.[2]).toMatchObject({
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  it.each([
    ['diretor', 'diretor'],
    ['supervisor', 'supervisor'],
  ])('preserves the database role %s', async (role, expectedRole) => {
    profileQuery.data = { ...validProfile, role }
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ profile: { ...validProfile, role: expectedRole, modules: [{ module: 'BANCO_1', role: expectedRole }] } })
  })

  it('returns 401 for missing or invalid bearer tokens', async () => {
    const missing = createResponse()
    await supabaseSession(request({ headers: {} }), missing)
    expect(missing.statusCode).toBe(401)
    expect(createClient).not.toHaveBeenCalled()

    authGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid token') })
    const invalid = createResponse()
    await supabaseSession(request(), invalid)
    expect(invalid.statusCode).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns 405 for unsupported methods', async () => {
    const response = createResponse()
    await supabaseSession(request({ method: 'POST' }), response)
    expect(response.statusCode).toBe(405)
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['non-Azure identity', { user: { id: 'auth-user-1', app_metadata: { provider: 'email' } } }, validProfile],
    ['missing profile', { user: { id: 'auth-user-1', app_metadata: { provider: 'azure' } } }, null],
    ['inactive profile', { user: { id: 'auth-user-1', app_metadata: { provider: 'azure' } } }, { ...validProfile, active: false }],
    ['unknown role', { user: { id: 'auth-user-1', app_metadata: { provider: 'azure' } } }, { ...validProfile, role: 'owner' }],
  ])('returns 403 for %s', async (_case, user, profile) => {
    authGetUser.mockResolvedValueOnce({ data: user, error: null })
    profileQuery.data = profile
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(403)
  })

  it('returns 403 when profile lookup is ambiguous', async () => {
    profileQuery.error = { code: 'PGRST116', message: 'multiple rows returned' }
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(403)
  })

  it('returns safe diagnostics for unexpected profile database failures', async () => {
    profileQuery.error = {
      code: 'XX000',
      message: 'secret=should-not-escape; Bearer supabase-token',
      details: 'admin-key should-not-escape',
      hint: 'supabase-token should-not-escape',
    }
    const response = createResponse()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(500)
    expect(response.body).toMatchObject({ stage: 'profile_query', code: 'XX000' })
    expect((response.body as { requestId?: string }).requestId).toEqual(expect.any(String))
    expect(response.body).not.toHaveProperty('message')
    expect(response.body).not.toHaveProperty('hint')
    expect(JSON.stringify(response.body)).not.toContain('should-not-escape')
    const logs = JSON.stringify(errorLog.mock.calls)
    expect(logs).not.toContain('supabase-token')
    expect(logs).not.toContain('admin-key')
    expect(logs).toContain('should-not-escape')
    errorLog.mockRestore()
  })

  it('logs unexpected exception messages only after redacting bearer and configured keys', async () => {
    from.mockImplementationOnce(() => {
      throw new Error('request failed for Bearer supabase-token using admin-key')
    })
    const response = createResponse()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(500)
    expect(response.body).not.toHaveProperty('message')
    const logs = JSON.stringify(errorLog.mock.calls)
    expect(logs).not.toContain('supabase-token')
    expect(logs).not.toContain('admin-key')
    expect(logs).toContain('request failed')
    errorLog.mockRestore()
  })

  it('accepts the production profile shape without auth_user_id or squad_id', async () => {
    profileQuery.data = validProfile
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ profile: { ...validProfile, modules: [{ module: 'BANCO_1', role: validProfile.role }] } })
  })

  it('does not request or return columns outside the CorporateProfile contract', async () => {
    profileQuery.data = { ...validProfile, auth_user_id: 'auth-user-1', squad_id: 'squad-1', microsoft_object_id: 'oid' }
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.body).toEqual({ profile: { ...validProfile, modules: [{ module: 'BANCO_1', role: validProfile.role }] } })
    expect(profileQuery.selected).toBe('id,email,full_name,role,active')
  })

  it('returns 500 with stage=config when server env vars are missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(500)
    expect(response.body).toMatchObject({ stage: 'config' })
  })

  it('does not accept public VITE-prefixed values as server configuration', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    process.env.VITE_SUPABASE_URL = 'https://public.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'public-anon-key'
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(500)
    expect(response.body).toMatchObject({ stage: 'config' })
    expect(JSON.stringify(response.body)).not.toContain('public-anon-key')
  })

  it('returns the banks released for the user, with per-bank role overrides', async () => {
    accessQuery.data = [
      { module: 'BANCO_2', role: 'supervisor' },
      { module: 'BANCO_1', role: null },
      { module: 'BANCO_9', role: 'diretor' },
      { module: 'BANCO_2', role: 'dono' },
    ]
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(200)
    expect((response.body as { profile: { modules: unknown } }).profile.modules).toEqual([
      { module: 'BANCO_1', role: 'colaborador' },
      { module: 'BANCO_2', role: 'colaborador' },
    ])
    expect(accessQuery.filters).toEqual([{ column: 'profile_id', value: 'auth-user-1' }, { column: 'active', value: true }])
  })

  it('returns an empty module list when the user has no bank released', async () => {
    accessQuery.data = []
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(200)
    expect((response.body as { profile: { modules: unknown } }).profile.modules).toEqual([])
  })

  it('falls back to Banco 1 only while the access table migration is not applied', async () => {
    accessQuery.error = { code: 'PGRST205', message: 'Could not find the table' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(200)
    expect((response.body as { profile: { modules: unknown } }).profile.modules).toEqual([{ module: 'BANCO_1', role: 'colaborador' }])
    warn.mockRestore()
  })

  it('returns 500 with stage module_access_query for other access lookup failures', async () => {
    accessQuery.error = { code: '42501', message: 'permission denied' }
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(500)
    expect(response.body).toMatchObject({ stage: 'module_access_query', code: '42501' })
    errorLog.mockRestore()
  })
})
