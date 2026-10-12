import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authGetUser = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn((url: string) => (
  url.includes('admin') ? { from } : { auth: { getUser: authGetUser } }
)))

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
  process.env.CORPORATE_AUTHORIZATION_READY = 'true'
  authGetUser.mockReset()
  from.mockReset()
  createClient.mockClear()
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('supabase-session fail-closed', () => {
  it('nega requisição sem bearer token', async () => {
    const response = createResponse()

    await supabaseSession(request({ headers: {} }), response)

    expect(response.statusCode).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('nega token Supabase inválido', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid token') })
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(401)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
  })

  it('continua negando mesmo com flag futura, perfil ativo e cargo enviado pelo cliente', async () => {
    authGetUser.mockResolvedValue({ data: {
      user: {
        id: 'auth-user-1',
        email: 'ana@example.com',
        identities: [{ provider: 'azure' }],
      },
    }, error: null })
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        id: 'auth-user-1', email: 'ana@example.com', active: true, role: 'diretor',
      }, error: null }) }) }),
    })
    const response = createResponse()

    await supabaseSession(request(), response)

    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' })
    expect(from).not.toHaveBeenCalled()
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('não permite que claims editáveis no body provem identidade Microsoft', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'auth-user-1', user_metadata: {
      tid: 'tenant-1', oid: 'object-1', role: 'diretor',
    } } }, error: null })
    const response = createResponse()

    await supabaseSession(request({ body: {
      tid: 'tenant-1', oid: 'object-1', role: 'diretor', email: 'ana@example.com',
    } }), response)

    expect(response.statusCode).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })
})
