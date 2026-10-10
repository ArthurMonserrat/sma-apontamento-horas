import { describe, expect, it, vi } from 'vitest'
import type { AuditEvent } from '../../audit/types'
import type { AssignmentSnapshot } from '../../squads/types'
import type { CreateTimeEntryData } from '../types'
import {
  LEGACY_V1_TIME_ENTRY_STORAGE_KEY,
  LEGACY_V2_TIME_ENTRY_STORAGE_KEY,
  LEGACY_V3_TIME_ENTRY_STORAGE_KEY,
  LocalStorageTimeEntryService,
  TIME_ENTRY_STORAGE_KEY,
  type StorageLike,
} from './timeEntryService'

class MemoryStorage implements StorageLike {
  protected values = new Map<string, string>()
  readonly writes = new Map<string, number>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
    this.writes.set(key, (this.writes.get(key) ?? 0) + 1)
  }
}

class CorruptingV4Storage extends MemoryStorage {
  setItem(key: string, value: string) {
    super.setItem(key, key === TIME_ENTRY_STORAGE_KEY ? '{invalid-v4' : value)
  }
}

class CorruptingV2Storage extends MemoryStorage {
  setItem(key: string, value: string) {
    super.setItem(key, key === LEGACY_V2_TIME_ENTRY_STORAGE_KEY
      ? JSON.stringify({ version: 2, entriesByCollaborator: {} })
      : value)
  }
}

const collaboratorId = 'demo-collaborator-001'
const assignment: AssignmentSnapshot = {
  squadId: 'squad-automation',
  squadName: 'Engenharia de Automação',
  supervisorId: 'supervisor-demo-001',
  supervisorName: 'Jeen Carlos E. Azevedo',
}

const validData: CreateTimeEntryData = {
  entryDate: '2026-07-13',
  clientName: 'Cliente Industrial Alfa',
  projectCode: 'Ab-001/2.03',
  activityId: 'activity-project-design',
  disciplineCode: '—',
  documentTypeCode: '—',
  durationMinutes: 60,
  details: 'Teste de persistência',
}

describe('dados opcionais de LD e contratada', () => {
  it('preserva contratada, LD e detalhamento vazio na criação, recarga, edição e duplicação', async () => {
    const storage = new MemoryStorage()
    let id = 0
    const service = buildService(storage, { createId: () => `ld-${++id}` })
    const ldDocument = { valeNumber: 'ZZ-001', title: 'Título elétrico', documentTypeCode: 'ZZ-2', disciplineName: 'MECÂNICA', fileName: 'teste.xlsm' }
    const entry = await service.create(collaboratorId, { ...validData, contractorNumber: '  ab-00/1  02.3  ', disciplineCode: 'M', documentTypeCode: 'ZZ-2', ldDocument, details: '' })
    expect(entry.contractorNumber).toBe('ab-00/1  02.3')
    expect((await buildService(storage).getById(collaboratorId, entry.id))?.ldDocument).toEqual(ldDocument)
    const edited = await service.update(collaboratorId, entry.id, 1, { ...entry, disciplineCode: 'G' }, 'Ajustar disciplina')
    const copy = await service.duplicate(collaboratorId, entry.id, edited.version, {})
    expect(copy.contractorNumber).toBe('ab-00/1  02.3')
    expect(copy.ldDocument).toEqual(ldDocument)
    expect(copy.details).toBe('')
    expect(copy.disciplineCode).toBe('G')
    expect((await buildService(storage).listByDate(collaboratorId, validData.entryDate))).toHaveLength(2)
  })

  it('rejeita tipo fora do catálogo sem origem LD e contratada longa', async () => {
    const service = buildService(new MemoryStorage())
    await expect(service.create(collaboratorId, { ...validData, documentTypeCode: 'ZZ' })).rejects.toThrow()
    await expect(service.create(collaboratorId, { ...validData, contractorNumber: 'a'.repeat(161) })).rejects.toThrow()
  })
})

function v2Entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-v2-entry-1',
    collaboratorId,
    entryDate: '2026-07-13',
    clientId: 'client-industrial-alpha',
    projectCode: 'LEG-001',
    activityId: 'activity-project-design',
    durationMinutes: 60,
    details: 'Registro legado v2',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
    progressPercent: 80,
    projectDocumentId: 'LD-001',
    ...overrides,
  }
}

function v1Entry(overrides: Record<string, unknown> = {}) {
  const { projectCode: _projectCode, ...entry } = v2Entry()
  return {
    ...entry,
    projectId: 'project-alpha-automation',
    ...overrides,
  }
}

function v3Entry(overrides: Record<string, unknown> = {}) {
  return {
    ...v2Entry(),
    disciplineCode: '—',
    documentTypeCode: '—',
    assignmentSnapshot: assignment,
    ...overrides,
  }
}

function v4Entry(overrides: Record<string, unknown> = {}) {
  const { clientId, ...entry } = v3Entry(overrides)
  return { ...entry, clientName: clientId === 'client-energy-beta' ? 'Cliente Energia Beta' : clientId === 'client-industrial-alpha' ? 'Cliente Industrial Alfa' : clientId }
}

function buildService(storage: StorageLike, overrides: Record<string, unknown> = {}) {
  return new LocalStorageTimeEntryService({
    storage,
    createId: () => 'stable-entry-id',
    now: () => '2026-07-20T12:00:00.000Z',
    resolveAssignment: () => assignment,
    mutationPolicy: { canMutate: async () => true },
    ...overrides,
  })
}

describe('migração segura de apontamentos até v4', () => {
  it('migra o clientId conhecido da v3 para clientName na v4 e preserva a v3', async () => {
    const storage = new MemoryStorage()
    const originalV3 = JSON.stringify({ version: 3, entriesByCollaborator: { [collaboratorId]: [v3Entry()] } })
    storage.setItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY, originalV3)

    const firstRead = await buildService(storage).listByDate(collaboratorId, '2026-07-13')
    const secondRead = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(TIME_ENTRY_STORAGE_KEY).toBe('apontamentos_sma')
    expect(firstRead).toHaveLength(1)
    expect(firstRead[0]).toMatchObject({ clientName: 'Cliente Industrial Alfa' })
    expect(firstRead[0]).not.toHaveProperty('clientId')
    expect(secondRead).toEqual(firstRead)
    expect(storage.getItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY)).toBe(originalV3)
    expect(storage.writes.get(TIME_ENTRY_STORAGE_KEY)).toBe(1)
  })

  it('preserva clientId desconhecido como clientName ao migrar a v3', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY, JSON.stringify({ version: 3, entriesByCollaborator: { [collaboratorId]: [v3Entry({ clientId: 'cliente-legado' })] } }))

    const [entry] = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(entry.clientName).toBe('cliente-legado')
  })
  it('migra diretamente de v1 para v2 e v3 uma única vez sem alterar o backup', async () => {
    const storage = new MemoryStorage()
    const originalV1 = JSON.stringify({
      version: 1,
      entriesByCollaborator: { [collaboratorId]: [v1Entry()] },
    })
    storage.setItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY, originalV1)

    const firstRead = await buildService(storage).listByDate(collaboratorId, '2026-07-13')
    const persistedV2 = storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)
    const persistedV3 = storage.getItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY)
    const persistedV4 = storage.getItem(TIME_ENTRY_STORAGE_KEY)
    const secondRead = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(firstRead).toHaveLength(1)
    expect(firstRead[0].projectCode).toBe('ALF-001')
    expect(secondRead).toEqual(firstRead)
    expect(storage.getItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY)).toBe(originalV1)
    expect(storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)).toBe(persistedV2)
    expect(storage.getItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY)).toBe(persistedV3)
    expect(storage.getItem(TIME_ENTRY_STORAGE_KEY)).toBe(persistedV4)
    expect(storage.writes.get(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)).toBe(1)
    expect(storage.writes.get(LEGACY_V3_TIME_ENTRY_STORAGE_KEY)).toBe(1)
    expect(storage.writes.get(TIME_ENTRY_STORAGE_KEY)).toBe(1)
  })

  it('preserva um projectId desconhecido como projectCode na migração de v1', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 1,
      entriesByCollaborator: {
        [collaboratorId]: [v1Entry({ projectId: '  projeto-legado-42  ' })],
      },
    }))

    const [migrated] = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(migrated.projectCode).toBe('projeto-legado-42')
  })

  it('trata JSON v1 inválido sem apagar o backup nem publicar versões seguintes', async () => {
    const storage = new MemoryStorage()
    const invalidV1 = '{invalid'
    storage.setItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY, invalidV1)
    const onStorageError = vi.fn()

    await expect(buildService(storage, { onStorageError }).listByDate(collaboratorId, '2026-07-13')).resolves.toEqual([])
    expect(storage.getItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY)).toBe(invalidV1)
    expect(storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(TIME_ENTRY_STORAGE_KEY)).toBeNull()
    expect(onStorageError).toHaveBeenCalledOnce()
  })

  it('não publica v3 quando a v2 relida diverge da conversão de v1', async () => {
    const storage = new CorruptingV2Storage()
    const originalV1 = JSON.stringify({
      version: 1,
      entriesByCollaborator: { [collaboratorId]: [v1Entry()] },
    })
    storage.setItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY, originalV1)
    const onStorageError = vi.fn()

    await expect(buildService(storage, { onStorageError }).listByDate(collaboratorId, '2026-07-13')).resolves.toEqual([])
    expect(storage.getItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY)).toBe(originalV1)
    expect(storage.getItem(TIME_ENTRY_STORAGE_KEY)).toBeNull()
    expect(onStorageError).toHaveBeenCalledOnce()
  })

  it('preserva registro v3 antigo sem updatedAt usando fallback vazio', async () => {
    const storage = new MemoryStorage()
    const legacyWithoutUpdatedAt = v3Entry({ version: 2, updatedAt: undefined })
    storage.setItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 3,
      entriesByCollaborator: { [collaboratorId]: [legacyWithoutUpdatedAt] },
    }))

    const [preserved] = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(preserved).toMatchObject({ id: 'legacy-v2-entry-1', version: 2, updatedAt: '' })
  })

  it('migra campos preservados, preenche não aplicável e remove campos descontinuados', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 2,
      entriesByCollaborator: { [collaboratorId]: [v2Entry()] },
    }))

    const [migrated] = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(migrated).toMatchObject({
      id: 'legacy-v2-entry-1',
      projectCode: 'LEG-001',
      disciplineCode: '—',
      documentTypeCode: '—',
      assignmentSnapshot: assignment,
    })
    expect(migrated).not.toHaveProperty('progressPercent')
    expect(migrated).not.toHaveProperty('projectDocumentId')
  })

  it('não inventa squad para colaborador legado desconhecido', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 2,
      entriesByCollaborator: { stranger: [v2Entry({ collaboratorId: 'stranger' })] },
    }))

    const [migrated] = await buildService(storage).listByDate('stranger', '2026-07-13')

    expect(migrated.assignmentSnapshot).toBeNull()
  })

  it('é idempotente e não duplica ao criar a v4', async () => {
    const storage = new MemoryStorage()
    const originalV2 = JSON.stringify({ version: 2, entriesByCollaborator: { [collaboratorId]: [v2Entry()] } })
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, originalV2)

    const firstRead = await buildService(storage).listByDate(collaboratorId, '2026-07-13')
    const persistedV4 = storage.getItem(TIME_ENTRY_STORAGE_KEY)
    const secondRead = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(firstRead).toHaveLength(1)
    expect(secondRead).toHaveLength(1)
    expect(storage.getItem(TIME_ENTRY_STORAGE_KEY)).toBe(persistedV4)
    expect(storage.writes.get(TIME_ENTRY_STORAGE_KEY)).toBe(1)
    expect(storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)).toBe(originalV2)
  })

  it('não mistura registros legados quando v4 válida já existe', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, JSON.stringify({ version: 2, entriesByCollaborator: { [collaboratorId]: [v2Entry()] } }))
    storage.setItem(TIME_ENTRY_STORAGE_KEY, JSON.stringify({ version: 4, entriesByCollaborator: { [collaboratorId]: [v4Entry({ id: 'v4-only', projectCode: 'V4-ONLY' })] } }))

    const entries = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(entries.map((entry) => entry.projectCode)).toEqual(['V4-ONLY'])
    expect(storage.writes.get(TIME_ENTRY_STORAGE_KEY)).toBe(1)
  })

  it('preserva registros válidos quando outro registro v2 é inválido', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 2,
      entriesByCollaborator: { [collaboratorId]: [v2Entry(), v2Entry({ id: 'invalid', durationMinutes: 'x' })] },
    }))

    const entries = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('legacy-v2-entry-1')
  })

  it('descarta individualmente data, duração e versão inválidas sem perder o registro válido', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 2,
      entriesByCollaborator: {
        [collaboratorId]: [
          v2Entry(),
          v2Entry({ id: 'invalid-date', entryDate: '2026-02-30' }),
          v2Entry({ id: 'invalid-duration', durationMinutes: 1441 }),
          v2Entry({ id: 'invalid-version', version: 0 }),
        ],
      },
    }))

    const entries = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(entries.map((entry) => entry.id)).toEqual(['legacy-v2-entry-1'])
  })

  it('trata JSON inválido sem quebrar nem alterar a v2', async () => {
    const storage = new MemoryStorage()
    const invalidV2 = '{invalid'
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, invalidV2)
    const onStorageError = vi.fn()

    await expect(buildService(storage, { onStorageError }).listByDate(collaboratorId, '2026-07-13')).resolves.toEqual([])
    expect(storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)).toBe(invalidV2)
    expect(storage.getItem(TIME_ENTRY_STORAGE_KEY)).toBeNull()
    expect(onStorageError).toHaveBeenCalledOnce()
  })

  it('só conclui depois de gravar, reler e validar a v4', async () => {
    const storage = new CorruptingV4Storage()
    const originalV2 = JSON.stringify({ version: 2, entriesByCollaborator: { [collaboratorId]: [v2Entry()] } })
    storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, originalV2)
    const onStorageError = vi.fn()

    const entries = await buildService(storage, { onStorageError }).listByDate(collaboratorId, '2026-07-13')

    expect(entries).toEqual([])
    expect(storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)).toBe(originalV2)
    expect(onStorageError).toHaveBeenCalledOnce()
  })
})

describe('comandos e consultas de apontamento', () => {
  it('grava apontamentos na chave compartilhada apontamentos_sma', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage)

    await service.create(collaboratorId, validData)

    expect(TIME_ENTRY_STORAGE_KEY).toBe('apontamentos_sma')
    expect(storage.getItem(TIME_ENTRY_STORAGE_KEY)).toContain('stable-entry-id')
    expect(storage.getItem('sma:time-entries:v3')).toBeNull()
  })

  it('cria múltiplos registros para um período e preserva o lançamento único', async () => {
    const storage = new MemoryStorage()
    let nextId = 0
    const service = buildService(storage, { createId: () => `batch-${++nextId}` })

    await service.create(collaboratorId, { ...validData, entryDate: '2026-07-13', endDate: '2026-07-15' })
    const batchEntries = await service.listByRange(collaboratorId, '2026-07-13', '2026-07-15')

    expect(batchEntries.map((entry) => entry.entryDate)).toEqual(['2026-07-13', '2026-07-14', '2026-07-15'])

    const single = await service.create(collaboratorId, { ...validData, entryDate: '2026-07-18', endDate: '2026-07-18' })
    expect(single.entryDate).toBe('2026-07-18')
    expect(await service.listByDate(collaboratorId, '2026-07-18')).toHaveLength(1)
  })

  it('usa a política de competência do intervalo para o lançamento em lote', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage, {
      mutationPolicy: {
        canMutate: async () => false,
        canMutateRange: async () => true,
      },
    })

    await expect(service.create(collaboratorId, { ...validData, endDate: '2026-07-15' })).resolves.toMatchObject({ status: 'PENDING' })
    await expect(service.create(collaboratorId, validData)).rejects.toThrow('somente leitura')
  })

  it('migra leitura da chave v3 antiga para apontamentos_sma', async () => {
    const storage = new MemoryStorage()
    storage.setItem('sma:time-entries:v3', JSON.stringify({
      version: 3,
      entriesByCollaborator: { [collaboratorId]: [v3Entry({ id: 'legacy-v3-entry' })] },
    }))

    const entries = await buildService(storage).listByDate(collaboratorId, '2026-07-13')

    expect(entries).toEqual([expect.objectContaining({ id: 'legacy-v3-entry' })])
    expect(storage.getItem(TIME_ENTRY_STORAGE_KEY)).toContain('legacy-v3-entry')
  })

  it('cria com snapshot, trim externo e preservação dos caracteres internos', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage)

    const created = await service.create(collaboratorId, {
      ...validData,
      projectCode: '  Ab-00  1/2.03  ',
      details: '  Entrega concluída  ',
    })

    expect(created).toMatchObject({
      id: 'stable-entry-id',
      projectCode: 'Ab-00  1/2.03',
      details: 'Entrega concluída',
      assignmentSnapshot: assignment,
      status: 'PENDING',
      version: 1,
    })
  })

  it('recusa criação sem squad ativa', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage, { resolveAssignment: () => null })
    await expect(service.create(collaboratorId, validData)).rejects.toThrow('squad ativa')
  })

  it('edita preservando identidade e criação, incrementa versão e exige motivo', async () => {
    const storage = new MemoryStorage()
    const timestamps = ['2026-07-20T12:00:00.000Z', '2026-07-20T13:00:00.000Z']
    const service = buildService(storage, { now: () => timestamps.shift() ?? '2026-07-20T13:00:00.000Z' })
    const created = await service.create(collaboratorId, validData)

    await expect(service.update(collaboratorId, created.id, created.version, { ...validData, durationMinutes: 120 }, '  ')).rejects.toThrow('motivo')
    const updated = await service.update(collaboratorId, created.id, created.version, { ...validData, durationMinutes: 120 }, 'Detalhamento corrigido')

    expect(updated).toMatchObject({
      id: created.id,
      createdAt: '2026-07-20T12:00:00.000Z',
      updatedAt: '2026-07-20T13:00:00.000Z',
      durationMinutes: 120,
      version: 2,
      lastEditReason: 'Detalhamento corrigido',
      status: 'PENDING',
    })
  })

  it('recusa conflito de versão', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage)
    const created = await service.create(collaboratorId, validData)
    await expect(service.update(collaboratorId, created.id, 99, validData, 'Correção')).rejects.toThrow('versão')
  })

  it('duplica com novo ID, versão 1, snapshot atual e referência à origem', async () => {
    const storage = new MemoryStorage()
    let nextId = 0
    const service = buildService(storage, { createId: () => `id-${++nextId}` })
    const created = await service.create(collaboratorId, validData)

    const duplicate = await service.duplicate(collaboratorId, created.id, created.version, {
      entryDate: '2026-07-14',
      durationMinutes: 90,
    })

    expect(duplicate.id).not.toBe(created.id)
    expect(duplicate).toMatchObject({ sourceEntryId: created.id, entryDate: '2026-07-14', durationMinutes: 90, version: 1, status: 'PENDING', assignmentSnapshot: assignment })
  })

  it('cancela logicamente, preserva o registro e o retira do saldo', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage)
    const created = await service.create(collaboratorId, validData)
    await expect(service.cancel(collaboratorId, created.id, created.version, '  ')).rejects.toThrow('motivo')

    const cancelled = await service.cancel(collaboratorId, created.id, created.version, 'Lançamento duplicado')
    const summary = await service.getDailySummary(collaboratorId, validData.entryDate, [])

    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Lançamento duplicado', version: 2 })
    expect(await service.listByDate(collaboratorId, validData.entryDate)).toHaveLength(1)
    expect(summary.workedMinutes).toBe(0)
  })

  it('bloqueia mutação quando a política informa dia aprovado', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage, { mutationPolicy: { canMutate: async () => false } })
    await expect(service.create(collaboratorId, validData)).rejects.toThrow('somente leitura')
  })

  it('bloqueia criação quando a data possui evento integral', async () => {
    const storage = new MemoryStorage()
    const dateGuard = {
      getBlock: vi.fn(async () => ({
        blocked: true as const,
        message: 'Esta data está coberta por férias integrais e não permite apontamentos.',
      })),
    }
    const service = buildService(storage, { dateGuard })

    await expect(service.create(collaboratorId, validData)).rejects.toThrow('férias integrais')
    await expect(service.listByDate(collaboratorId, validData.entryDate)).resolves.toEqual([])
    expect(dateGuard.getBlock).toHaveBeenCalledWith(collaboratorId, validData.entryDate)
  })

  it('preserva registro conflitante e impede edição, duplicação e cancelamento pelo colaborador', async () => {
    const storage = new MemoryStorage()
    let blocked = false
    const dateGuard = {
      getBlock: async () => blocked
        ? { blocked: true as const, message: 'Esta data está coberta por férias integrais e não permite apontamentos.' }
        : { blocked: false as const },
    }
    const service = buildService(storage, { dateGuard })
    const created = await service.create(collaboratorId, validData)
    blocked = true

    await expect(service.update(collaboratorId, created.id, created.version, validData, 'Correção')).rejects.toThrow('férias integrais')
    await expect(service.duplicate(collaboratorId, created.id, created.version, {})).rejects.toThrow('férias integrais')
    await expect(service.cancel(collaboratorId, created.id, created.version, 'Conflito')).rejects.toThrow('férias integrais')
    await expect(service.getById(collaboratorId, created.id)).resolves.toMatchObject({ status: 'PENDING', version: 1, durationMinutes: 60 })
  })

  it('isola propriedade e não permite editar registro de outro colaborador', async () => {
    const storage = new MemoryStorage()
    const service = buildService(storage)
    const created = await service.create(collaboratorId, validData)

    await expect(service.update('other', created.id, 1, validData, 'Tentativa indevida')).rejects.toThrow('não encontrado')
    await expect(service.listByDate('other', validData.entryDate)).resolves.toEqual([])
  })

  it('pagina e filtra sem expor registros de outro colaborador', async () => {
    const storage = new MemoryStorage()
    let nextId = 0
    const service = buildService(storage, { createId: () => `entry-${++nextId}` })
    await service.create(collaboratorId, validData)
    await service.create(collaboratorId, { ...validData, entryDate: '2026-07-14', clientName: 'Cliente Energia Beta', projectCode: 'BET-001' })
    await service.create(collaboratorId, { ...validData, entryDate: '2026-07-15', projectCode: 'SMA-003' })

    const firstPage = await service.list({ collaboratorId, startDate: '2026-07-01', endDate: '2026-07-31', pageSize: 2 })
    const filtered = await service.list({ collaboratorId, startDate: '2026-07-01', endDate: '2026-07-31', pageSize: 10, filters: { clientName: 'energia' } })

    expect(firstPage.items).toHaveLength(2)
    expect(firstPage.nextCursor).toBe('2')
    expect((await service.list({ collaboratorId, startDate: '2026-07-01', endDate: '2026-07-31', pageSize: 2, cursor: firstPage.nextCursor ?? undefined })).items).toHaveLength(1)
    expect(filtered.items.map((item) => item.projectCode)).toEqual(['BET-001'])
  })

  it('persiste e relê após nova instância do service', async () => {
    const storage = new MemoryStorage()
    await buildService(storage).create(collaboratorId, validData)
    const [reloaded] = await buildService(storage).listByDate(collaboratorId, validData.entryDate)
    expect(reloaded.projectCode).toBe(validData.projectCode)
  })

  it('registra auditoria para criação, edição, duplicação e cancelamento', async () => {
    const storage = new MemoryStorage()
    const events: AuditEvent[] = []
    let nextId = 0
    const service = buildService(storage, {
      createId: () => `id-${++nextId}`,
      audit: { record: async (event: AuditEvent) => { events.push(event) } },
    })
    const created = await service.create(collaboratorId, validData)
    const updated = await service.update(collaboratorId, created.id, 1, validData, 'Ajuste')
    await service.duplicate(collaboratorId, updated.id, 2, {})
    await service.cancel(collaboratorId, updated.id, 2, 'Cancelamento')

    expect(events.map((event) => event.type)).toEqual([
      'TIME_ENTRY_CREATED',
      'TIME_ENTRY_EDITED',
      'TIME_ENTRY_DUPLICATED',
      'TIME_ENTRY_CANCELLED',
    ])
  })

  it('preserva a mutação confirmada quando a auditoria falha depois da gravação', async () => {
    const storage = new MemoryStorage()
    const auditError = new Error('Auditoria indisponível')
    const onAuditError = vi.fn()
    const service = buildService(storage, {
      audit: { record: async () => { throw auditError } },
      onAuditError,
    })

    const created = await service.create(collaboratorId, validData)

    await expect(service.listByDate(collaboratorId, validData.entryDate)).resolves.toHaveLength(1)
    expect(created.id).toBe('stable-entry-id')
    expect(onAuditError).toHaveBeenCalledWith('Não foi possível registrar a auditoria da mutação confirmada.', auditError)
  })
})
