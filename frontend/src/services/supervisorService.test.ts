import { describe, expect, it } from 'vitest'
import { LocalStorageSupervisorService } from './supervisorService'
import type { StorageLike } from '../shared/infrastructure/storage/browserStorage'
import { TIME_ENTRY_STORAGE_KEY } from './timeEntryService'
import { TIME_OFF_STORAGE_KEY } from './timeOffService'

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

const seedEntries = [
  {
    id: 'entry-001',
    collaboratorId: 'collaborator-001',
    collaboratorName: 'Ana Lima',
    entryDate: '2026-07-28',
    projectCode: 'SM&A-001',
    durationMinutes: 480,
    activityName: 'Projeto',
  },
  {
    id: 'entry-002',
    collaboratorId: 'collaborator-002',
    collaboratorName: 'Bruno Dias',
    entryDate: '2026-07-29',
    projectCode: 'SM&A-002',
    durationMinutes: 360,
    activityName: 'Revisao',
  },
]

describe('LocalStorageSupervisorService', () => {
  it('lista apontamentos mockados como pendentes inicialmente', async () => {
    const service = new LocalStorageSupervisorService(createMemoryStorage(), () => '2026-07-30T12:00:00.000Z', seedEntries)

    await expect(service.getSummary()).resolves.toEqual({ pending: 2, approved: 0, rejected: 0 })
    await expect(service.listEntries()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'entry-001', status: 'PENDING' }),
      expect.objectContaining({ id: 'entry-002', status: 'PENDING' }),
    ]))
  })

  it('persiste aprovacao e rejeicao no storage local', async () => {
    const storage = createMemoryStorage()
    const service = new LocalStorageSupervisorService(storage, () => '2026-07-30T12:00:00.000Z', seedEntries)

    await service.approve('entry-001', 'supervisor-001')
    await service.reject('entry-002', 'supervisor-001', 'Ajustar projeto informado.')

    await expect(service.getSummary()).resolves.toEqual({ pending: 0, approved: 1, rejected: 1 })
    await expect(service.listEntries()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'entry-001', status: 'APPROVED', decidedBy: 'supervisor-001' }),
      expect.objectContaining({ id: 'entry-002', status: 'REJECTED', rejectionReason: 'Ajustar projeto informado.' }),
    ]))
  })

  it('aprova e rejeita apontamentos selecionados em lote', async () => {
    const service = new LocalStorageSupervisorService(createMemoryStorage(), () => '2026-07-30T12:00:00.000Z', seedEntries)

    await service.approveMany(['entry-001'], 'supervisor-001')
    await service.rejectMany(['entry-002'], 'supervisor-001', 'Ajustar projeto informado.')

    await expect(service.getSummary()).resolves.toEqual({ pending: 0, approved: 1, rejected: 1 })
  })

  it('exige motivo para rejeitar', async () => {
    const service = new LocalStorageSupervisorService(createMemoryStorage(), () => '2026-07-30T12:00:00.000Z', seedEntries)

    expect(() => service.reject('entry-001', 'supervisor-001', '   ')).toThrow(/motivo/)
  })

  it('lista apontamentos reais gravados na mesma chave local do colaborador', async () => {
    const storage = createMemoryStorage()
    storage.setItem(TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 4,
      entriesByCollaborator: {
        'collaborator-real-001': [{
          id: 'real-entry-001',
          collaboratorId: 'collaborator-real-001',
          entryDate: '2026-07-31',
          clientName: 'Cliente Real',
          projectCode: 'SM&A-REAL-001',
          activityId: 'activity-real',
          disciplineCode: 'A',
          documentTypeCode: 'RN',
          durationMinutes: 300,
          details: 'Apontamento real do colaborador',
          assignmentSnapshot: null,
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-07-31T12:00:00.000Z',
          updatedAt: '2026-07-31T12:00:00.000Z',
        }],
      },
    }))
    const service = new LocalStorageSupervisorService(storage, () => '2026-07-31T12:00:00.000Z', [])

    await expect(service.listEntries()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'real-entry-001',
        collaboratorId: 'collaborator-real-001',
        projectCode: 'SM&A-REAL-001',
        status: 'PENDING',
      }),
    ]))
  })

  it('lista ausencias gravadas na chave compartilhada para aprovacao do supervisor', async () => {
    const storage = createMemoryStorage()
    storage.setItem(TIME_OFF_STORAGE_KEY, JSON.stringify([{
      id: 'absence-001',
      colaborador: 'Ana Lima',
      colaboradorId: 'demo-collaborator-001',
      tipo: 'Atestado Medico',
      dataInicio: '2026-08-03',
      dataRetorno: '2026-08-04',
      justificativa: 'Consulta e repouso.',
      status: 'Pendente',
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    }]))
    const service = new LocalStorageSupervisorService(storage, () => '2026-08-01T12:00:00.000Z', [], [])

    await expect(service.listTimeOffRequests('demo-supervisor-001')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'absence-001',
        collaboratorName: 'Ana Lima',
        absenceType: 'Atestado Medico',
        startDate: '2026-08-03',
        endDate: '2026-08-04',
        reason: 'Consulta e repouso.',
        status: 'PENDING',
      }),
    ]))
  })

  it('sincroniza a decisão do supervisor com o registro de apontamento do colaborador', async () => {
    const storage = createMemoryStorage()
    storage.setItem(TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 4,
      entriesByCollaborator: {
        'collaborator-real-001': [{
          id: 'real-entry-002',
          collaboratorId: 'collaborator-real-001',
          entryDate: '2026-07-31',
          clientName: 'Cliente Real',
          projectCode: 'SM&A-REAL-002',
          activityId: 'activity-real',
          disciplineCode: 'A',
          documentTypeCode: 'RN',
          durationMinutes: 300,
          details: 'Apontamento pendente',
          assignmentSnapshot: null,
          status: 'PENDING',
          version: 1,
          createdAt: '2026-07-31T12:00:00.000Z',
          updatedAt: '2026-07-31T12:00:00.000Z',
        }],
      },
    }))
    const service = new LocalStorageSupervisorService(storage, () => '2026-07-31T13:00:00.000Z', [])

    await service.approve('real-entry-002', 'supervisor-001')

    const persisted = JSON.parse(storage.getItem(TIME_ENTRY_STORAGE_KEY) ?? '{}')
    expect(persisted.entriesByCollaborator['collaborator-real-001'][0]).toMatchObject({
      id: 'real-entry-002',
      status: 'APPROVED',
      updatedAt: '2026-07-31T13:00:00.000Z',
    })
    await expect(service.listEntries()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'real-entry-002', status: 'APPROVED' }),
    ]))
  })
})
