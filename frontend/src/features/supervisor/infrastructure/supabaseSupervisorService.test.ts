import { describe, expect, it, vi } from 'vitest'
import { SupabaseSupervisorService } from './supabaseSupervisorService'

function builder(result: { data?: unknown, error?: { message: string } | null }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'maybeSingle', 'single']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: result.data ?? null, error: result.error ?? null }))
  return chain
}

describe('SupabaseSupervisorService', () => {
  it('usa RPC transacional para decidir e não atualiza status por PATCH amplo', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'entry-1', status: 'approved', version: 2 }], error: null })
    const service = new SupabaseSupervisorService({ from: vi.fn(() => builder({ data: { version: 1 } })), rpc } as never)

    await service.approve('entry-1', 'supervisor-1')

    expect(rpc).toHaveBeenCalledWith('decide_time_entry', {
      target_entry_id: 'entry-1',
      expected_version: 1,
      decision: 'approved',
      p_rejection_reason: null,
    })
  })

  it('rejeita motivo vazio antes de chamar o backend', async () => {
    const rpc = vi.fn()
    const service = new SupabaseSupervisorService({ from: vi.fn(() => builder({ data: [] })), rpc } as never)

    await expect(service.reject('entry-1', 'supervisor-1', '   ')).rejects.toThrow('Informe o motivo da rejeição.')
    expect(rpc).not.toHaveBeenCalled()
  })
})
