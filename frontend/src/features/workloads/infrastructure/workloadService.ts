import type { WorkloadVersion } from '../types'
import { getWorkloadForDate } from '../domain'
import { demoWorkloadVersions } from '../../../demo/fixtures/demoData'
import { isIsoDate } from '../../../shared/lib/date'
import { createBrowserStorage, type StorageLike } from '../../../shared/infrastructure/storage/browserStorage'

const WORKLOAD_STORAGE_KEY = 'sma:workloads:v1'

type WorkloadStorage = {
  version: 1
  versions: WorkloadVersion[]
}

type WorkloadDependencies = {
  storage: StorageLike
  createId?: () => string
  now?: () => string
  initialVersions?: WorkloadVersion[]
}

function validMinutes(minutes: number) {
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60
}

export class LocalWorkloadService {
  private readonly storage: StorageLike
  private readonly createId: () => string
  private readonly now: () => string
  private readonly initialVersions: WorkloadVersion[]

  constructor({ storage, createId, now, initialVersions }: WorkloadDependencies) {
    this.storage = storage
    this.createId = createId ?? (() => crypto.randomUUID())
    this.now = now ?? (() => new Date().toISOString())
    this.initialVersions = initialVersions ?? []
  }

  private read(): WorkloadStorage {
    try {
      const raw = this.storage.getItem(WORKLOAD_STORAGE_KEY)
      if (!raw) return { version: 1, versions: [...this.initialVersions] }
      const parsed = JSON.parse(raw) as Partial<WorkloadStorage> & { requests?: unknown }
      if (parsed.version !== 1 || !Array.isArray(parsed.versions)) throw new Error('Estrutura de carga inválida.')
      return { version: 1, versions: parsed.versions }
    } catch (error) {
      console.error('Não foi possível ler as cargas locais.', error)
      return { version: 1, versions: [...this.initialVersions] }
    }
  }

  private write(storage: WorkloadStorage) {
    const serialized = JSON.stringify(storage)
    this.storage.setItem(WORKLOAD_STORAGE_KEY, serialized)
    if (this.storage.getItem(WORKLOAD_STORAGE_KEY) !== serialized) throw new Error('Não foi possível confirmar a gravação da carga.')
  }

  async listVersions(collaboratorId: string) {
    return this.read().versions.filter((version) => version.collaboratorId === collaboratorId).sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
  }

  async getCurrent(collaboratorId: string, date: string) {
    return getWorkloadForDate(await this.listVersions(collaboratorId), date) ?? null
  }

  async createInitial(collaboratorId: string, dailyMinutes: number, effectiveFrom: string) {
    if (!validMinutes(dailyMinutes)) throw new Error('Informe uma carga diária válida.')
    if (!isIsoDate(effectiveFrom)) throw new Error('Informe uma data de início válida.')
    const storage = this.read()
    if (storage.versions.some((version) => version.collaboratorId === collaboratorId)) throw new Error('O colaborador já possui carga horária cadastrada.')
    const timestamp = this.now()
    const version: WorkloadVersion = {
      id: this.createId(), collaboratorId, dailyMinutes, effectiveFrom, status: 'APPROVED', createdAt: timestamp, approvedAt: timestamp,
    }
    storage.versions.push(version)
    this.write(storage)
    return version
  }
}

export const workloadService = new LocalWorkloadService({
  storage: createBrowserStorage(), initialVersions: demoWorkloadVersions,
})
