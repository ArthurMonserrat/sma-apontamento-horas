import { corporateDataError, getCorporateDataClient, listCorporatePeople, type CorporatePerson } from '../../corporate/corporateData'
import type { TimeEntry } from '../types'
import { BANCO1_TIME_ENTRIES_TABLE, timeEntryFromRow, type Banco1TimeEntryRow } from './supabaseTimeEntryService'
import { TIME_ENTRY_STORAGE_KEY } from './timeEntryService'

export type VisibleTimeEntry = TimeEntry & {
  collaboratorName?: string
  rejectionReason?: string
}

/** Apontamentos guardados no navegador (modo demonstração), em qualquer formato antigo ou atual. */
export function readLocalTimeEntriesRaw(): unknown[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TIME_ENTRY_STORAGE_KEY) || '[]') as unknown
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const entriesByCollaborator = (parsed as { entriesByCollaborator?: unknown }).entriesByCollaborator
      if (!entriesByCollaborator || typeof entriesByCollaborator !== 'object') return []
      return Object.values(entriesByCollaborator).flatMap((entries) => Array.isArray(entries) ? entries : [])
    }
    return []
  } catch {
    return []
  }
}

/**
 * Todos os apontamentos que o usuário pode ver (painéis da diretoria e relatórios).
 * Login Microsoft: banco de dados — a RLS entrega a equipe do supervisor ou tudo para a diretoria.
 * Demonstração: armazenamento local.
 */
export async function listVisibleTimeEntries(): Promise<unknown[]> {
  const client = getCorporateDataClient()
  if (!client) return readLocalTimeEntriesRaw()

  const [{ data, error }, people] = await Promise.all([
    client.from(BANCO1_TIME_ENTRIES_TABLE).select('*').order('entry_date', { ascending: false }),
    listCorporatePeople().catch(() => [] as CorporatePerson[]),
  ])
  if (error) throw corporateDataError(error, 'Não foi possível carregar os apontamentos.')
  const peopleById = new Map(people.map((person) => [person.id, person]))
  return ((data ?? []) as Banco1TimeEntryRow[]).map<VisibleTimeEntry>((row) => {
    const entry = timeEntryFromRow(row)
    const person = peopleById.get(entry.collaboratorId)
    const assignmentSnapshot = entry.assignmentSnapshot ?? (person?.teamId
      ? { squadId: person.teamId, squadName: person.teamName ?? 'Equipe', supervisorId: person.supervisorId ?? '', supervisorName: person.supervisorName ?? '' }
      : null)
    return {
      ...entry,
      assignmentSnapshot,
      collaboratorName: person?.name,
      rejectionReason: row.rejection_reason ?? undefined,
    }
  })
}
