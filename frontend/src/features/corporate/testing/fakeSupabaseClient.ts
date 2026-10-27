import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase falso, em memória, só para testes.
 * Imita o suficiente do PostgREST (filtros, ordenação, range, count) e das regras
 * de banco1_time_entries (versão, cancelamento, decisão) para testar os serviços.
 */
type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type RpcHandler = (args: Record<string, unknown>, tables: Map<string, Row[]>) => { data: unknown; error: { message: string; code?: string } | null }

export type FakeSupabase = {
  client: SupabaseClient
  tables: Map<string, Row[]>
  rpcs: Map<string, RpcHandler>
  calls: Array<{ table?: string; rpc?: string; op: string; payload?: unknown }>
  failNext: (error: { message: string; code?: string }) => void
}

let sequence = 0
const nextId = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`

export function createFakeSupabase(): FakeSupabase {
  const tables = new Map<string, Row[]>()
  const rpcs = new Map<string, RpcHandler>()
  const calls: FakeSupabase['calls'] = []
  let pendingError: { message: string; code?: string } | null = null
  const takeError = () => { const error = pendingError; pendingError = null; return error }
  const rowsOf = (table: string) => { if (!tables.has(table)) tables.set(table, []); return tables.get(table)! }

  function builder(table: string) {
    const filters: Filter[] = []
    const orders: Array<{ column: string; ascending: boolean }> = []
    let range: [number, number] | null = null
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Row | Row[] | null = null
    let wantCount = false
    let single = false

    const run = () => {
      const error = takeError()
      if (error) return { data: null, error, count: null }
      const all = rowsOf(table)
      if (op === 'insert') {
        const now = new Date().toISOString()
        const inserted = (Array.isArray(payload) ? payload : [payload!]).map((row) => ({
          id: nextId(), version: 1, created_at: now, updated_at: now, cancelled_at: null, cancel_reason: null,
          rejection_reason: null, decided_at: null, decided_by: null, last_edit_reason: null, source_entry_id: null,
          contractor_number: null, ld_document: null, team_id: null, ...row,
        }))
        all.push(...inserted)
        calls.push({ table, op: 'insert', payload })
        return { data: inserted, error: null, count: null }
      }
      let matched = all.filter((row) => filters.every((filter) => filter(row)))
      if (op === 'update') {
        matched = matched.filter((row) => row.status !== 'APPROVED' && row.status !== 'CANCELLED')
        matched.forEach((row) => {
          Object.assign(row, payload, { version: Number(row.version) + 1, updated_at: new Date().toISOString() })
          if (row.status === 'CANCELLED') row.cancelled_at = new Date().toISOString()
        })
        calls.push({ table, op: 'update', payload })
        return { data: matched.map((row) => ({ ...row })), error: null, count: null }
      }
      for (const order of [...orders].reverse()) {
        matched = [...matched].sort((left, right) => {
          const a = String(left[order.column] ?? ''); const b = String(right[order.column] ?? '')
          return order.ascending ? a.localeCompare(b) : b.localeCompare(a)
        })
      }
      const count = matched.length
      if (range) matched = matched.slice(range[0], range[1] + 1)
      calls.push({ table, op: 'select' })
      const data = matched.map((row) => ({ ...row }))
      return { data: single ? data[0] ?? null : data, error: null, count: wantCount ? count : null }
    }

    const api = {
      select(_columns?: string, options?: { count?: string }) { if (options?.count) wantCount = true; return api },
      insert(rows: Row | Row[]) { op = 'insert'; payload = rows; return api },
      update(values: Row) { op = 'update'; payload = values; return api },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return api },
      neq(column: string, value: unknown) { filters.push((row) => row[column] !== value); return api },
      gte(column: string, value: string) { filters.push((row) => String(row[column]) >= value); return api },
      lte(column: string, value: string) { filters.push((row) => String(row[column]) <= value); return api },
      ilike(column: string, pattern: string) {
        const needle = pattern.replace(/^%|%$/g, '').replace(/\\(.)/g, '$1').toLowerCase()
        filters.push((row) => String(row[column] ?? '').toLowerCase().includes(needle)); return api
      },
      order(column: string, options?: { ascending?: boolean }) { orders.push({ column, ascending: options?.ascending ?? true }); return api },
      range(from: number, to: number) { range = [from, to]; return api },
      maybeSingle() { single = true; return Promise.resolve(run()) },
      then(resolve: (value: ReturnType<typeof run>) => unknown, reject?: (reason: unknown) => unknown) {
        try { return Promise.resolve(run()).then(resolve, reject) } catch (error) { return reject ? Promise.resolve(reject(error)) : Promise.reject(error) }
      },
    }
    return api
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ rpc: name, op: 'rpc', payload: args })
      const error = takeError()
      if (error) return Promise.resolve({ data: null, error })
      const handler = rpcs.get(name)
      if (!handler) return Promise.resolve({ data: null, error: { message: `rpc ${name} not found`, code: 'PGRST202' } })
      return Promise.resolve(handler(args, tables))
    },
  } as unknown as SupabaseClient

  return { client, tables, rpcs, calls, failNext: (error) => { pendingError = error } }
}
