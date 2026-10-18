import { describe, expect, it, vi } from 'vitest'
import { SupabaseTimeEntryService } from './supabaseTimeEntryService'

function query(result: { data?: unknown, error?: { message: string } | null, count?: number }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'range', 'insert', 'update', 'upsert', 'maybeSingle', 'single']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      void args
      return builder
    })
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }))
  return builder
}

describe('SupabaseTimeEntryService', () => {
  it('mapeia todos os campos persistidos sem usar localStorage ou horários inventados', async () => {
    const entryQuery = query({ data: [{
      id: 'entry-1',
      profile_id: 'profile-1',
      date: '2026-10-18',
      start_time: null,
      end_time: null,
      duration_minutes: 90,
      client_name: 'Cliente A',
      project_code: 'CONTR-1',
      contractor_number: 'CONTR-1',
      ld_document: { valeNumber: 'LD-1', title: 'Doc', documentTypeCode: 'RN', disciplineName: 'Engenharia', fileName: 'doc.pdf' },
      activity_id: 'activity-1',
      discipline_code: 'E',
      document_type_code: 'RN',
      assignment_snapshot: { squadId: 'squad-1', squadName: 'Squad A', supervisorId: 'sup-1', supervisorName: 'Supervisor' },
      description: 'Detalhes',
      status: 'pending',
      version: 1,
      created_at: '2026-10-18T10:00:00Z',
      updated_at: '2026-10-18T10:00:00Z',
      last_edit_reason: null,
      source_entry_id: null,
      cancelled_at: null,
      cancel_reason: null,
    }], count: 1 })
    const client = { from: vi.fn(() => entryQuery) }
    const service = new SupabaseTimeEntryService(client as never)

    const page = await service.list({ collaboratorId: 'profile-1', startDate: '2026-10-01', endDate: '2026-10-31', pageSize: 25 })

    expect(page.items[0]).toMatchObject({
      id: 'entry-1',
      collaboratorId: 'profile-1',
      clientName: 'Cliente A',
      durationMinutes: 90,
      status: 'PENDING',
      assignmentSnapshot: { squadId: 'squad-1' },
    })
    expect(page.items[0]).not.toHaveProperty('startTime')
    expect(entryQuery.insert).not.toHaveBeenCalled()
  })

  it('não transforma erro do Data API em sucesso local', async () => {
    const entryQuery = query({ error: { message: 'permission denied' } })
    const service = new SupabaseTimeEntryService({ from: vi.fn(() => entryQuery) } as never)

    await expect(service.listByDate('profile-1', '2026-10-18')).rejects.toThrow('permission denied')
  })

  it('preserva o significado de ACTIVE como qualquer registro não cancelado', async () => {
    const entryQuery = query({ data: [] })
    const service = new SupabaseTimeEntryService({ from: vi.fn(() => entryQuery) } as never)

    await service.list({ collaboratorId: 'profile-1', startDate: '2026-10-01', endDate: '2026-10-31', pageSize: 25, filters: { status: 'ACTIVE' } })

    expect(entryQuery.neq).toHaveBeenCalledWith('status', 'cancelled')
    expect(entryQuery.eq).not.toHaveBeenCalledWith('status', 'pending')
  })
})
