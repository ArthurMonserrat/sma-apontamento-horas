import type { DemoRole, DemoSession } from '../features/session/types'
import { demoCollaborator } from '../demo/fixtures/demoData'

const SESSION_KEY = 'sma:demo-session:v2'
const LEGACY_SESSION_KEY = 'sma:demo-session:v1'
const MIGRATION_KEY = 'sma:demo-session:migration:v2'
const MIGRATION_DONE = 'done'

const DEMO_IDENTITIES: Record<DemoRole, Pick<DemoSession, 'id' | 'name'>> = {
  COLLABORATOR: { id: demoCollaborator.id, name: demoCollaborator.name },
  SUPERVISOR: { id: 'demo-supervisor-001', name: 'Jeen Carlos E. Azevedo' },
  DIRECTOR_ADMIN: { id: 'demo-director-admin-001', name: 'Diretoria' },
}

const DEMO_ROLES = new Set<DemoRole>(['COLLABORATOR', 'SUPERVISOR', 'DIRECTOR_ADMIN'])

export interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DemoSessionService {
  restore(): DemoSession | null
  signIn(role: DemoRole): DemoSession
  signInWithMicrosoft(input: { id: string; name: string; email: string; role: DemoRole }): DemoSession
  signOut(): void
}

export function createBrowserSessionStorage(): SessionStorage {
  try {
    if (typeof window !== 'undefined') return window.localStorage
  } catch {
    // Alguns navegadores bloqueiam o getter por política de segurança.
  }
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isDemoSession(value: unknown): value is DemoSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return isNonEmptyString(candidate.id)
    && isNonEmptyString(candidate.name)
    && typeof candidate.role === 'string'
    && DEMO_ROLES.has(candidate.role as DemoRole)
    && isNonEmptyString(candidate.createdAt)
    && isNonEmptyString(candidate.explicitLoginAt)
    && (candidate.isDemo === true || candidate.authProvider === 'microsoft')
    && candidate.version === 2
}

export class LocalDemoSessionService implements DemoSessionService {
  private readonly storage: SessionStorage
  private readonly now: () => string

  constructor(
    storage: SessionStorage = createBrowserSessionStorage(),
    now = () => new Date().toISOString(),
  ) {
    this.storage = storage
    this.now = now
  }

  restore(): DemoSession | null {
    const rawSession = this.read(SESSION_KEY)
    if (rawSession !== null) {
      try {
        const session: unknown = JSON.parse(rawSession)
        if (isDemoSession(session)) return session
      } catch {
        // Payloads antigos ou corrompidos são tratados como sessão ausente.
      }
      this.remove(SESSION_KEY)
    }

    this.invalidateLegacySessionOnce()
    return null
  }

  signIn(role: DemoRole): DemoSession {
    const timestamp = this.now()
    const session: DemoSession = {
      ...DEMO_IDENTITIES[role],
      role,
      createdAt: timestamp,
      explicitLoginAt: timestamp,
      isDemo: true,
      version: 2,
    }
    this.write(SESSION_KEY, JSON.stringify(session))
    return session
  }

  signInWithMicrosoft({ id, name, email, role }: { id: string; name: string; email: string; role: DemoRole }): DemoSession {
    const timestamp = this.now()
    const session: DemoSession = {
      id,
      name,
      email,
      role,
      createdAt: timestamp,
      explicitLoginAt: timestamp,
      isDemo: false,
      version: 2,
      authProvider: 'microsoft',
    }
    this.write(SESSION_KEY, JSON.stringify(session))
    return session
  }

  signOut() {
    this.remove(SESSION_KEY)
  }

  private invalidateLegacySessionOnce() {
    if (this.read(MIGRATION_KEY) === MIGRATION_DONE) return
    if (this.read(LEGACY_SESSION_KEY) === null) return
    this.remove(LEGACY_SESSION_KEY)
    this.write(MIGRATION_KEY, MIGRATION_DONE)
  }

  private read(key: string) {
    try {
      return this.storage.getItem(key)
    } catch {
      return null
    }
  }

  private remove(key: string) {
    try {
      this.storage.removeItem(key)
    } catch {
      // Falhas de storage são tratadas como sessão ausente.
    }
  }

  private write(key: string, value: string) {
    try {
      this.storage.setItem(key, value)
    } catch {
      // A sessão em memória continua utilizável quando o storage está indisponível.
    }
  }
}

export const demoSessionService = new LocalDemoSessionService()
