import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authGetUser = vi.hoisted(() => vi.fn())
const profileQuery = vi.hoisted(() => ({
  data: null as unknown,
  error: null as unknown,
  lastFilter: null as { column: string; value: string } | null,
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
  squad_id: null,
  active: true,
  created_at: '2026-10-20T12:00:00Z',
  updated_at: '2026-10-20T12:00:00Z',
}

const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  CORPORATE_AUTHORIZATION_READY: process.env.CORPORATE_AUTHORIZATION_READY,
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'admin-key'
  process.env.CORPORATE_AUTHORIZATION_READY = 'false'
  authGetUser.mockReset()
  from.mockReset()
  createClient.mockClear()
  profileQuery.data = validProfile
  profileQuery.error = null
  profileQuery.lastFilter = null
  from.mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn((column: string, value: string) => ({
        maybeSingle: vi.fn(async () => {
          profileQuery.lastFilter = { column, value }
          return { data: profileQuery.data, error: profileQuery.error }
        }),
      })),
    })),
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
    expect(response.body).toEqual({ profile: validProfile })
    expect(profileQuery.lastFilter).toEqual({ column: 'id', value: 'auth-user-1' })
    expect(from).toHaveBeenCalledWith('profiles')
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient.mock.calls[0]?.[1]).toBe('anon-key')
    expect(createClient.mock.calls[1]?.[1]).toBe('anon-key')
    expect(createClient.mock.calls[1]?.[2]).toMatchObject({
      global: { headers: { Authorization: 'Bearer supabase-token' } },
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
    expect(response.body).toEqual({ profile: { ...validProfile, role: expectedRole } })
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

  it('returns 500 for unexpected profile database failures', async () => {
    profileQuery.error = { code: 'XX000', message: 'database unavailable' }
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(500)
  })
})
