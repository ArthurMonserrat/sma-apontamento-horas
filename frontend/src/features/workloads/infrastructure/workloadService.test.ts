import { describe, expect, it } from 'vitest'
import { LocalWorkloadService } from './workloadService'
import type { StorageLike } from '../../../shared/infrastructure/storage/browserStorage'

class MemoryStorage implements StorageLike {
  private values: Map<string, string>

  constructor(initial: Record<string, string> = {}) {
    this.values = new Map(Object.entries(initial))
  }

  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function buildService(storage = new MemoryStorage()) {
  return new LocalWorkloadService({
    storage,
    createId: (() => { let id = 0; return () => `id-${++id}` })(),
    now: () => '2026-07-20T12:00:00.000Z',
  })
}

describe('carga horária administrativa', () => {
  it('permite primeiro cadastro quando a carga está ausente e impede duplicidade', async () => {
    const service = buildService()
    expect(await service.getCurrent('collaborator-1', '2026-07-20')).toBeNull()
    const created = await service.createInitial('collaborator-1', 480, '2026-07-20')
    expect(created).toMatchObject({ dailyMinutes: 480, effectiveFrom: '2026-07-20', status: 'APPROVED' })
    await expect(service.createInitial('collaborator-1', 360, '2026-07-20')).rejects.toThrow('já possui')
  })

  it('ignora solicitações antigas e não expõe API para mudança de carga pelo colaborador', async () => {
    const legacyStorage = new MemoryStorage({
      'sma:workloads:v1': JSON.stringify({
        version: 1,
        versions: [],
        requests: [{ id: 'legacy-request', status: 'PENDING' }],
      }),
    })
    const service = buildService(legacyStorage)

    expect(await service.listVersions('collaborator-1')).toEqual([])
    expect('listRequests' in service).toBe(false)
    expect('requestChange' in service).toBe(false)
    expect('applyApprovedRequest' in service).toBe(false)
    expect('rejectRequest' in service).toBe(false)
  })

  it('não persiste solicitações legadas ao cadastrar a carga administrativa', async () => {
    const legacyStorage = new MemoryStorage({
      'sma:workloads:v1': JSON.stringify({
        version: 1,
        versions: [],
        requests: [{ id: 'legacy-request', status: 'PENDING' }],
      }),
    })
    const service = buildService(legacyStorage)

    await service.createInitial('collaborator-1', 480, '2026-07-20')
    expect(JSON.parse(legacyStorage.getItem('sma:workloads:v1') ?? '{}')).not.toHaveProperty('requests')
  })
})
