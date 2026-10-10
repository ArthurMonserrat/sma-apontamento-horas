import { describe, expect, it, vi } from 'vitest'
import type { AuditEvent } from '../features/audit/types'
import { demoCollaborator } from '../demo/fixtures/demoData'
import { LocalProfileService } from './profileService'
import type { StorageLike } from '../shared/infrastructure/storage/browserStorage'
import { LocalStorageTimeEntryService } from './timeEntryService'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const entryData = {
  entryDate: '2026-07-20', clientName: 'Cliente Industrial Alfa', projectCode: 'SMA-001',
  activityId: 'activity-project-design', disciplineCode: '—' as const, documentTypeCode: '—' as const,
  durationMinutes: 60, details: 'Atividade executada',
}
const signatureBase64 = 'data:image/png;base64,QUJDREVGRw=='

describe('perfil e squad ativa', () => {
  it('carrega perfil ativo com localidade controlada', async () => {
    const service = new LocalProfileService({ storage: new MemoryStorage() })
    const profile = await service.getById(demoCollaborator.id)
    expect(profile).toMatchObject({ active: true, activeSquadId: 'squad-automation', location: { city: 'São Paulo', stateCode: 'SP' } })
  })

  it('troca squad, resolve supervisor automaticamente e registra auditoria', async () => {
    const events: AuditEvent[] = []
    const service = new LocalProfileService({ storage: new MemoryStorage(), now: () => '2026-07-20T12:00:00.000Z', audit: { record: async (event) => { events.push(event) } } })
    const updated = await service.changeActiveSquad(demoCollaborator.id, 'squad-electrical')
    expect(updated.activeSquadId).toBe('squad-electrical')
    expect(service.resolveAssignment(demoCollaborator.id)).toMatchObject({ squadId: 'squad-electrical', squadName: 'Engenharia Elétrica', supervisorId: 'supervisor-demo-001' })
    expect(events.map((event) => event.type)).toEqual(['SQUAD_CHANGED'])
  })

  it('troca afeta somente novos apontamentos e preserva pendente antigo', async () => {
    const profileStorage = new MemoryStorage()
    const profileService = new LocalProfileService({ storage: profileStorage })
    const entryService = new LocalStorageTimeEntryService({
      storage: new MemoryStorage(), createId: (() => { let id = 0; return () => `entry-${++id}` })(),
      now: () => '2026-07-20T12:00:00.000Z', resolveAssignment: (collaboratorId) => profileService.resolveAssignment(collaboratorId),
    })
    const first = await entryService.create(demoCollaborator.id, entryData)
    await profileService.changeActiveSquad(demoCollaborator.id, 'squad-electrical')
    const second = await entryService.create(demoCollaborator.id, { ...entryData, projectCode: 'SMA-002' })

    expect(first.assignmentSnapshot?.squadId).toBe('squad-automation')
    expect(second.assignmentSnapshot?.squadId).toBe('squad-electrical')
    expect((await entryService.getById(demoCollaborator.id, first.id))?.assignmentSnapshot?.squadId).toBe('squad-automation')
  })

  it('preserva troca de squad confirmada quando a auditoria falha', async () => {
    const storage = new MemoryStorage()
    const onPostCommitError = vi.fn()
    const service = new LocalProfileService({
      storage,
      audit: { record: async () => { throw new Error('audit failure') } },
      onPostCommitError,
    })

    await expect(service.changeActiveSquad(demoCollaborator.id, 'squad-electrical')).resolves.toMatchObject({ activeSquadId: 'squad-electrical' })
    await expect(service.getById(demoCollaborator.id)).resolves.toMatchObject({ activeSquadId: 'squad-electrical' })
    expect(onPostCommitError).toHaveBeenCalledOnce()
  })

  it('salva assinatura digital no perfil do colaborador', async () => {
    const service = new LocalProfileService({ storage: new MemoryStorage() })

    await expect(service.updateSignature(demoCollaborator.id, signatureBase64)).resolves.toMatchObject({ assinaturaBase64: signatureBase64 })
    await expect(service.getById(demoCollaborator.id)).resolves.toMatchObject({ assinaturaBase64: signatureBase64 })
  })

  it('rejeita assinatura digital fora do formato de imagem data URL', async () => {
    const service = new LocalProfileService({ storage: new MemoryStorage() })

    await expect(service.updateSignature(demoCollaborator.id, 'data:image/png;base64,AB=CD'))
      .rejects.toThrow('A assinatura deve ser uma imagem PNG ou JPEG em formato data URL.')
  })

  it('rejeita assinatura maior que o limite antes de persistir', async () => {
    const service = new LocalProfileService({ storage: new MemoryStorage() })
    const prefix = 'data:image/png;base64,'
    const oversizedSignature = `${prefix}${'A'.repeat(300_001 - prefix.length)}`

    await expect(service.updateSignature(demoCollaborator.id, oversizedSignature))
      .rejects.toThrow('A assinatura deve ter no máximo 300.000 caracteres.')
    await expect(service.getById(demoCollaborator.id)).resolves.not.toHaveProperty('assinaturaBase64')
  })
})
