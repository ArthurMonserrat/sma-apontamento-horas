import type { AuditEvent } from '../features/audit/types'
import type { CollaboratorProfile } from '../features/profile/types'
import type { AssignmentSnapshot } from '../features/squads/types'
import { demoCollaborator, demoSquads, demoSupervisors } from '../mocks/demoData'
import { auditService } from './auditService'
import { createBrowserStorage, type StorageLike } from './storage'
import { defaultPostCommitErrorHandler, runPostCommitEffect, type PostCommitErrorHandler } from './postCommit'

const PROFILE_STORAGE_KEY = 'sma:collaborator-profile:v1'
export const PROFILE_UPDATED_EVENT = 'sma:profile-updated'

export type UpdateProfileInput = {
  name: string
  email: string
  jobTitle: string
  activeSquadId: string
}

export interface ProfileService {
  getById(collaboratorId: string): Promise<CollaboratorProfile | null>
  updateProfile(collaboratorId: string, input: UpdateProfileInput): Promise<CollaboratorProfile>
  updateSignature(collaboratorId: string, assinaturaBase64: string): Promise<CollaboratorProfile>
  changeActiveSquad(collaboratorId: string, squadId: string): Promise<CollaboratorProfile>
  resolveAssignment(collaboratorId: string): AssignmentSnapshot | null
}

type ProfileDependencies = {
  storage: StorageLike
  now?: () => string
  audit?: { record(event: AuditEvent): Promise<void> }
  onPostCommitError?: PostCommitErrorHandler
}

const MAX_SIGNATURE_DATA_URL_LENGTH = 300_000
const SIGNATURE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/

function isProfile(value: unknown): value is CollaboratorProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Record<string, unknown>
  const location = profile.location as Record<string, unknown> | undefined
  return typeof profile.id === 'string' && typeof profile.name === 'string' && typeof profile.email === 'string'
    && typeof profile.jobTitle === 'string' && typeof profile.active === 'boolean' && typeof profile.activeSquadId === 'string'
    && Boolean(location) && location?.countryCode === 'BR' && typeof location.stateCode === 'string'
    && typeof location.city === 'string' && typeof location.timeZone === 'string'
}

function validateSignature(assinaturaBase64: string) {
  if (assinaturaBase64.length > MAX_SIGNATURE_DATA_URL_LENGTH || !SIGNATURE_DATA_URL_PATTERN.test(assinaturaBase64)) {
    throw new Error('Assinatura digital inválida.')
  }
}

function notifyProfileUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT))
}

export class LocalProfileService implements ProfileService {
  private readonly storage: StorageLike
  private readonly now: () => string
  private readonly audit?: { record(event: AuditEvent): Promise<void> }
  private readonly onPostCommitError: PostCommitErrorHandler

  constructor({ storage, now, audit, onPostCommitError }: ProfileDependencies) {
    this.storage = storage
    this.now = now ?? (() => new Date().toISOString())
    this.audit = audit
    this.onPostCommitError = onPostCommitError ?? defaultPostCommitErrorHandler
  }

  private read() {
    try {
      const raw = this.storage.getItem(PROFILE_STORAGE_KEY)
      if (!raw) return demoCollaborator
      const parsed = JSON.parse(raw) as unknown
      return isProfile(parsed) ? parsed : demoCollaborator
    } catch (error) {
      console.error('Não foi possível ler o perfil local.', error)
      return demoCollaborator
    }
  }

  async getById(collaboratorId: string) {
    const profile = this.read()
    return profile.id === collaboratorId ? profile : null
  }

  async updateProfile(collaboratorId: string, input: UpdateProfileInput) {
    const current = this.read()
    if (current.id !== collaboratorId) throw new Error('Perfil profissional não encontrado.')
    const name = input.name.trim()
    const email = input.email.trim()
    const jobTitle = input.jobTitle.trim()
    if (!name) throw new Error('Informe o nome.')
    if (!email) throw new Error('Informe o e-mail.')
    if (!jobTitle) throw new Error('Informe o cargo.')
    const squad = demoSquads.find((item) => item.id === input.activeSquadId && item.active)
    if (!squad) throw new Error('A squad selecionada não está disponível.')
    const updated: CollaboratorProfile = { ...current, name, email, jobTitle, activeSquadId: input.activeSquadId }
    this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated))
    notifyProfileUpdated()
    return updated
  }

  async updateSignature(collaboratorId: string, assinaturaBase64: string) {
    const current = this.read()
    if (current.id !== collaboratorId) throw new Error('Perfil profissional não encontrado.')
    validateSignature(assinaturaBase64)
    const updated: CollaboratorProfile = { ...current, assinaturaBase64 }
    this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated))
    notifyProfileUpdated()
    return updated
  }

  resolveAssignment(collaboratorId: string) {
    const profile = this.read()
    if (profile.id !== collaboratorId || !profile.active) return null
    const squad = demoSquads.find((item) => item.id === profile.activeSquadId && item.active)
    const supervisor = squad ? demoSupervisors.find((item) => item.id === squad.supervisorId && item.active) : null
    if (!squad || !supervisor) return null
    return { squadId: squad.id, squadName: squad.name, supervisorId: supervisor.id, supervisorName: supervisor.name }
  }

  async changeActiveSquad(collaboratorId: string, squadId: string) {
    const current = this.read()
    if (current.id !== collaboratorId) throw new Error('Perfil profissional não encontrado.')
    const squad = demoSquads.find((item) => item.id === squadId && item.active)
    const supervisor = squad ? demoSupervisors.find((item) => item.id === squad.supervisorId && item.active) : null
    if (!squad || !supervisor) throw new Error('A squad selecionada não está disponível.')
    if (current.activeSquadId === squadId) return current
    const updated = { ...current, activeSquadId: squadId }
    this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated))
    notifyProfileUpdated()
    if (this.audit) await runPostCommitEffect('Não foi possível registrar a auditoria da troca de squad confirmada.', () => this.audit!.record({
      id: crypto.randomUUID(), type: 'SQUAD_CHANGED', occurredAt: this.now(), actorId: collaboratorId, actorRole: 'COLLABORATOR',
      entityType: 'CollaboratorProfile', entityId: collaboratorId, previousValue: current.activeSquadId, newValue: squadId,
      metadata: { supervisorId: supervisor.id },
    }), this.onPostCommitError)
    return updated
  }
}

export const profileService = new LocalProfileService({ storage: createBrowserStorage(), audit: auditService })
