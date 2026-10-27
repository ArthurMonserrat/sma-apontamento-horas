import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAuthClient } from '../auth/infrastructure/supabaseAuthClient'

/**
 * Liga os serviços ao banco de dados (Supabase) quando há sessão corporativa (login Microsoft).
 * Sem sessão corporativa (demonstração e testes) os serviços continuam no armazenamento local.
 * A sessão é marcada pelo DemoSessionProvider ao validar o perfil corporativo.
 */
let corporateUserId: string | null = null
let clientOverride: SupabaseClient | null | undefined

export function setCorporateDataSession(userId: string | null) {
  corporateUserId = userId
  clearCorporatePeopleCache()
}

export function getCorporateUserId() {
  return corporateUserId
}

/** Só para testes: injeta um cliente falso. `undefined` volta ao cliente real. */
export function setCorporateDataClientForTests(client: SupabaseClient | null | undefined) {
  clientOverride = client
}

export function getCorporateDataClient(): SupabaseClient | null {
  if (!corporateUserId) return null
  const client = clientOverride === undefined ? supabaseAuthClient : clientOverride
  return client ?? null
}

export function isCorporateDataActive() {
  return getCorporateDataClient() !== null
}

/** Mensagem legível para erros do banco: as regras do servidor já respondem em português. */
export function corporateDataError(error: { message?: string; code?: string } | null | undefined, fallback: string) {
  const message = typeof error?.message === 'string' ? error.message.trim() : ''
  const code = error?.code ?? ''
  const technical = /row-level security|permission denied|violates|relation|column|syntax/i.test(message)
  if (code === 'PGRST301' || /jwt expired/i.test(message)) return new Error('Sua sessão expirou. Entre novamente.')
  if (code === '42501' && (technical || !message)) return new Error('Você não tem permissão para esta operação.')
  if (['23514', '22023', '23505', 'P0001', 'P0002', '42501'].includes(code) && message && !technical) return new Error(message)
  return new Error(fallback)
}

// ---------------------------------------------------------------------------
// Pessoas visíveis (nomes, equipe e supervisor) — função banco1_people()
// ---------------------------------------------------------------------------

export type CorporatePerson = {
  id: string
  name: string
  email: string
  role: 'colaborador' | 'supervisor' | 'diretor'
  teamId: string | null
  teamName: string | null
  supervisorId: string | null
  supervisorName: string | null
  /** Cargo definido pela diretoria (profiles.job_title). */
  jobTitle: string | null
}

type PeopleRow = {
  id: string
  full_name: string | null
  email: string | null
  module_role: string | null
  team_id: string | null
  team_name: string | null
  supervisor_id: string | null
  supervisor_name: string | null
  job_title?: string | null
}

let peopleCache: { userId: string; at: number; promise: Promise<CorporatePerson[]> } | null = null
const PEOPLE_CACHE_MS = 60_000

export function clearCorporatePeopleCache() {
  peopleCache = null
}

function nameFromEmail(email: string) {
  return (email.split('@')[0] ?? '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') || email
}

export function toCorporatePerson(row: PeopleRow): CorporatePerson {
  const email = (row.email ?? '').trim().toLowerCase()
  const fullName = row.full_name?.trim()
  const role = row.module_role === 'diretor' || row.module_role === 'supervisor' ? row.module_role : 'colaborador'
  return {
    id: row.id,
    name: fullName && fullName.includes(' ') ? fullName : nameFromEmail(email) || row.id,
    email,
    role,
    teamId: row.team_id,
    teamName: row.team_name,
    supervisorId: row.supervisor_id,
    supervisorName: row.supervisor_name?.trim() || null,
    jobTitle: row.job_title?.trim() || null,
  }
}

export async function listCorporatePeople(): Promise<CorporatePerson[]> {
  const client = getCorporateDataClient()
  const userId = corporateUserId
  if (!client || !userId) return []
  if (peopleCache && peopleCache.userId === userId && Date.now() - peopleCache.at < PEOPLE_CACHE_MS) return peopleCache.promise
  const promise = (async () => {
    const { data, error } = await client.rpc('banco1_people')
    if (error) throw corporateDataError(error, 'Não foi possível carregar as pessoas da equipe.')
    return ((data ?? []) as PeopleRow[]).map(toCorporatePerson)
  })()
  peopleCache = { userId, at: Date.now(), promise }
  promise.catch(() => { if (peopleCache?.promise === promise) peopleCache = null })
  return promise
}
