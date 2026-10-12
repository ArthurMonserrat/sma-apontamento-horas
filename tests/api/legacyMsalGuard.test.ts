import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertLegacyMsalEnabled } from '../../server/legacyMsalGuard.js'

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

const originalNodeEnv = process.env.NODE_ENV
const originalLegacyFlag = process.env.ENABLE_LEGACY_MSAL

beforeEach(() => {
  process.env.NODE_ENV = 'production'
  delete process.env.ENABLE_LEGACY_MSAL
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  if (originalLegacyFlag === undefined) delete process.env.ENABLE_LEGACY_MSAL
  else process.env.ENABLE_LEGACY_MSAL = originalLegacyFlag
})

describe('assertLegacyMsalEnabled', () => {
  it('bloqueia chamada direta em produção antes de qualquer cookie ou redirect', () => {
    const response = createResponse()

    expect(assertLegacyMsalEnabled({ method: 'GET', query: {}, headers: {} }, response)).toBe(false)
    expect(response.statusCode).toBe(404)
    expect(response.body).toEqual({ error: 'Legacy authentication is disabled.' })
  })

  it('bloqueia ambiente não produtivo sem opt-in explícito', () => {
    process.env.NODE_ENV = 'development'
    const response = createResponse()

    expect(assertLegacyMsalEnabled({ method: 'GET', query: {}, headers: {} }, response)).toBe(false)
    expect(response.statusCode).toBe(404)
  })

  it('permite somente ambiente não produtivo com flag explícita', () => {
    process.env.NODE_ENV = 'development'
    process.env.ENABLE_LEGACY_MSAL = 'true'

    expect(assertLegacyMsalEnabled({ method: 'GET', query: {}, headers: {} }, createResponse())).toBe(true)
  })
})
