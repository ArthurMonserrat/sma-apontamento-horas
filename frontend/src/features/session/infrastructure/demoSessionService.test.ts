import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DemoRole, DemoSession } from '../types'
import { createBrowserSessionStorage, LocalDemoSessionService, type SessionStorage } from './demoSessionService'

const SESSION_KEY = 'sma:demo-session:v2'
const LEGACY_SESSION_KEY = 'sma:demo-session:v1'
const MIGRATION_KEY = 'sma:demo-session:migration:v2'
const NOW = '2026-07-21T15:30:00.000Z'

const DOMAIN_DATA = {
  'sma:time-entries:v4': '{"version":4,"entriesByCollaborator":{}}',
  'sma:time-entries:v3': '[{"id":"entry-1"}]',
  'sma:collaborator-profile:v1': '{"name":"Perfil editado"}',
  'sma:time-off-requests:v1': '[{"id":"leave-1"}]',
  'sma:workloads:v1': '[{"id":"workload-1"}]',
  'sma:day-approvals:v1': '[{"id":"approval-1"}]',
  'sma-theme': 'dark',
} as const

class MemorySessionStorage implements SessionStorage {
  private readonly values = new Map<string, string>()
  readonly reads: string[] = []
  readonly removals: string[] = []

  getItem(key: string) {
    this.reads.push(key)
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.removals.push(key)
    this.values.delete(key)
  }
}

function createService() {
  const storage = new MemorySessionStorage()
  return { storage, service: new LocalDemoSessionService(storage, () => NOW) }
}

function seedDomainData(storage: SessionStorage) {
  for (const [key, value] of Object.entries(DOMAIN_DATA)) storage.setItem(key, value)
}

function expectDomainDataPreserved(storage: SessionStorage) {
  for (const [key, value] of Object.entries(DOMAIN_DATA)) expect(storage.getItem(key)).toBe(value)
}

function validSession(overrides: Partial<DemoSession> = {}): DemoSession {
  return {
    id: 'demo-collaborator-001',
    name: 'Colaborador',
    role: 'COLLABORATOR',
    createdAt: NOW,
    explicitLoginAt: NOW,
    isDemo: true,
    version: 2,
    ...overrides,
  }
}

describe('LocalDemoSessionService', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('invalida v1 uma vez e não cria sessão automaticamente', () => {
    const { storage, service } = createService()
    storage.setItem(LEGACY_SESSION_KEY, JSON.stringify({ active: true, collaboratorId: 'demo-collaborator-001' }))

    expect(service.restore()).toBeNull()
    expect(storage.getItem(LEGACY_SESSION_KEY)).toBeNull()
    expect(storage.getItem(MIGRATION_KEY)).toBe('done')

    const legacyReadsAfterMigration = storage.reads.filter((key) => key === LEGACY_SESSION_KEY).length
    const legacyRemovalsAfterMigration = storage.removals.filter((key) => key === LEGACY_SESSION_KEY).length

    expect(service.restore()).toBeNull()
    expect(storage.reads.filter((key) => key === LEGACY_SESSION_KEY)).toHaveLength(legacyReadsAfterMigration)
    expect(storage.removals.filter((key) => key === LEGACY_SESSION_KEY)).toHaveLength(legacyRemovalsAfterMigration)
  })

  it.each<DemoRole>(['COLLABORATOR', 'SUPERVISOR', 'DIRECTOR_ADMIN'])('persiste sessão explícita %s', (role) => {
    const { storage, service } = createService()

    const created = service.signIn(role)

    expect(created).toMatchObject({ role, createdAt: NOW, explicitLoginAt: NOW, isDemo: true, version: 2 })
    expect(created.id).toBeTruthy()
    expect(created.name).toBeTruthy()
    expect(JSON.parse(storage.getItem(SESSION_KEY) ?? 'null')).toEqual(created)
    expect(service.restore()).toEqual(created)
  })

  it('restaura v2 válida sem consultar nem invalidar v1', () => {
    const { storage, service } = createService()
    const session = validSession()
    const legacy = JSON.stringify({ active: true, collaboratorId: 'demo-collaborator-001' })
    storage.setItem(SESSION_KEY, JSON.stringify(session))
    storage.setItem(LEGACY_SESSION_KEY, legacy)

    expect(service.restore()).toEqual(session)
    expect(storage.reads).not.toContain(LEGACY_SESSION_KEY)
    expect(storage.getItem(LEGACY_SESSION_KEY)).toBe(legacy)
    expect(storage.getItem(MIGRATION_KEY)).toBeNull()
  })

  it.each(['{json-inválido', ''])('descarta JSON v2 inválido de forma controlada', (rawSession) => {
    const { storage, service } = createService()
    storage.setItem(SESSION_KEY, rawSession)

    expect(service.restore()).toBeNull()
    expect(storage.getItem(SESSION_KEY)).toBeNull()
  })

  it.each([
    validSession({ role: 'INVALID_ROLE' as DemoRole }),
    { ...validSession(), version: 1 },
    { ...validSession(), isDemo: false },
    { ...validSession(), explicitLoginAt: '' },
  ])('descarta payload v2 que não satisfaz o contrato', (payload) => {
    const { storage, service } = createService()
    storage.setItem(SESSION_KEY, JSON.stringify(payload))

    expect(service.restore()).toBeNull()
    expect(storage.getItem(SESSION_KEY)).toBeNull()
  })

  it('preserva dados funcionais ao invalidar a sessão v1', () => {
    const { storage, service } = createService()
    seedDomainData(storage)
    storage.setItem(LEGACY_SESSION_KEY, JSON.stringify({ active: true, collaboratorId: 'demo-collaborator-001' }))

    service.restore()

    expectDomainDataPreserved(storage)
  })

  it('logout remove somente a sessão v2', () => {
    const { storage, service } = createService()
    seedDomainData(storage)
    storage.setItem(LEGACY_SESSION_KEY, 'legacy-data')
    storage.setItem(MIGRATION_KEY, 'done')
    service.signIn('COLLABORATOR')

    service.signOut()

    expect(storage.getItem(SESSION_KEY)).toBeNull()
    expect(storage.getItem(LEGACY_SESSION_KEY)).toBe('legacy-data')
    expect(storage.getItem(MIGRATION_KEY)).toBe('done')
    expectDomainDataPreserved(storage)
    expect(storage.removals).toEqual([SESSION_KEY])
  })

  it('não derruba a inicialização quando o getter de localStorage lança', () => {
    const browser = Object.defineProperty({}, 'localStorage', {
      get: () => { throw new Error('SecurityError') },
    })
    vi.stubGlobal('window', browser)

    expect(() => createBrowserSessionStorage()).not.toThrow()
    expect(createBrowserSessionStorage().getItem(SESSION_KEY)).toBeNull()
  })

  it('trata falha de leitura como sessão ausente', () => {
    const storage: SessionStorage = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => undefined,
      removeItem: () => undefined,
    }

    expect(new LocalDemoSessionService(storage, () => NOW).restore()).toBeNull()
  })

  it('retorna a sessão em memória quando a persistência do login falha', () => {
    const storage: SessionStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => undefined,
    }

    expect(new LocalDemoSessionService(storage, () => NOW).signIn('SUPERVISOR')).toMatchObject({
      role: 'SUPERVISOR',
      explicitLoginAt: NOW,
      version: 2,
    })
  })

  it('não lança quando a remoção da sessão no logout falha', () => {
    const storage: SessionStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => { throw new Error('SecurityError') },
    }
    const service = new LocalDemoSessionService(storage, () => NOW)

    expect(() => service.signOut()).not.toThrow()
  })
})
