import { useMemo, useState } from 'react'
import type { Squad } from '../squads/types'
import type { SupervisorPendingEntry } from '../supervisor/types'
import { formatMinutes } from '../time-entries/domain'
import { eachIsoDate, formatDatePtBr, getCorporateToday, getMonthKey, getMonthRange, isWeekend } from '../../shared/lib/date'
import { MonthlyCalendar } from './MonthlyCalendar'
import type { CalendarVisualState, DailySummary } from './types'

type Collaborator = { id: string; name: string }
type ManagerCalendarRole = 'SUPERVISOR' | 'DIRECTOR_ADMIN'

type ManagerCalendarProps = {
  entries: SupervisorPendingEntry[]
  collaborators: Collaborator[]
  squads?: Pick<Squad, 'id' | 'name'>[]
  role: ManagerCalendarRole
}

type PreviewEntry = Pick<SupervisorPendingEntry,
  'id' | 'collaboratorName' | 'entryDate' | 'projectCode' | 'activityName' | 'durationMinutes' | 'status' | 'details'
>

const ALL_COLLABORATORS = 'Todos'
const ALL_SQUADS = 'Todas'
const NO_SQUAD = 'SemEquipe'

function hasSquad(entry: SupervisorPendingEntry) {
  return Boolean(entry.assignmentSnapshot?.squadId && entry.assignmentSnapshot.squadName)
}

function visualState(expectedMinutes: number, workedMinutes: number, date: string, today: string): CalendarVisualState {
  if (date > today) return 'NO_SCHEDULE'
  if (workedMinutes === 0) return 'NO_ENTRY'
  if (workedMinutes < expectedMinutes) return 'INCOMPLETE'
  if (workedMinutes === expectedMinutes) return 'COMPLETE'
  return 'EXCEEDED'
}

function createSummary(date: string, entries: SupervisorPendingEntry[], collaboratorId: string, today: string): DailySummary {
  const selectedEntries = entries.filter((entry) => (
    (collaboratorId === ALL_COLLABORATORS || entry.collaboratorId === collaboratorId)
    && entry.entryDate === date
  ))
  const expectedMinutes = isWeekend(date) ? 0 : 480
  const workedMinutes = date > today ? 0 : selectedEntries.reduce((total, entry) => total + entry.durationMinutes, 0)
  return {
    date,
    baseExpectedMinutes: expectedMinutes,
    expectedMinutes,
    justifiedMinutes: 0,
    workedMinutes,
    regularMinutes: Math.min(workedMinutes, expectedMinutes),
    extraMinutes: Math.max(workedMinutes - expectedMinutes, 0),
    missingMinutes: Math.max(expectedMinutes - workedMinutes, 0),
    balanceMinutes: workedMinutes - expectedMinutes,
    isFuture: date > today,
    hasIntegralEventConflict: false,
    visualState: visualState(expectedMinutes, workedMinutes, date, today),
  }
}

function statusLabel(status: SupervisorPendingEntry['status']) {
  if (status === 'APPROVED') return 'Aprovado'
  if (status === 'REJECTED') return 'Rejeitado'
  return 'Pendente'
}

export function ManagerCalendar({ entries, collaborators, squads = [], role }: ManagerCalendarProps) {
  const today = getCorporateToday()
  const isDirector = role === 'DIRECTOR_ADMIN'
  const [selectedSquadId, setSelectedSquadId] = useState(ALL_SQUADS)
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState(ALL_COLLABORATORS)
  const [monthKey, setMonthKey] = useState(getMonthKey(today))
  const [selectedDate, setSelectedDate] = useState(today)
  const [openedEntries, setOpenedEntries] = useState<PreviewEntry[] | null>(null)
  const monthRange = getMonthRange(monthKey)

  const squadOptions = useMemo(() => {
    const optionsById = new Map<string, { id: string; name: string }>()
    const chronologicalEntries = [...entries].sort((left, right) => right.entryDate.localeCompare(left.entryDate))
    for (const entry of chronologicalEntries) {
      const snapshot = entry.assignmentSnapshot
      if (snapshot?.squadId && snapshot.squadName && !optionsById.has(snapshot.squadId)) {
        optionsById.set(snapshot.squadId, { id: snapshot.squadId, name: snapshot.squadName })
      }
    }
    for (const squad of squads) {
      if (!optionsById.has(squad.id)) optionsById.set(squad.id, { id: squad.id, name: squad.name })
    }
    return Array.from(optionsById.values()).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
  }, [entries, squads])

  const squadScopedEntries = useMemo(() => {
    if (!isDirector || selectedSquadId === ALL_SQUADS) return entries
    if (selectedSquadId === NO_SQUAD) return entries.filter((entry) => !hasSquad(entry))
    return entries.filter((entry) => entry.assignmentSnapshot?.squadId === selectedSquadId)
  }, [entries, isDirector, selectedSquadId])

  const collaboratorOptions = useMemo(() => {
    const byId = new Map<string, Collaborator>()
    if (isDirector) {
      squadScopedEntries.forEach((entry) => byId.set(entry.collaboratorId, { id: entry.collaboratorId, name: entry.collaboratorName }))
    } else {
      collaborators.forEach((collaborator) => byId.set(collaborator.id, collaborator))
      entries.forEach((entry) => byId.set(entry.collaboratorId, { id: entry.collaboratorId, name: entry.collaboratorName }))
    }
    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
  }, [collaborators, entries, isDirector, squadScopedEntries])

  const visibleEntries = useMemo(() => (
    squadScopedEntries.filter((entry) => (
      selectedCollaboratorId === ALL_COLLABORATORS || entry.collaboratorId === selectedCollaboratorId
    ))
  ), [selectedCollaboratorId, squadScopedEntries])

  const days = useMemo(() => (
    eachIsoDate(monthRange.startDate, monthRange.endDate).map((date) => createSummary(date, visibleEntries, selectedCollaboratorId, today))
  ), [monthRange.endDate, monthRange.startDate, selectedCollaboratorId, today, visibleEntries])

  const previewsByDate = useMemo(() => visibleEntries.reduce<Record<string, PreviewEntry[]>>((result, entry) => {
    const preview: PreviewEntry = {
      id: entry.id,
      collaboratorName: entry.collaboratorName,
      entryDate: entry.entryDate,
      projectCode: entry.projectCode,
      activityName: entry.activityName,
      durationMinutes: entry.durationMinutes,
      status: entry.status,
      details: entry.details,
    }
    result[entry.entryDate] = [...(result[entry.entryDate] ?? []), preview]
    return result
  }, {}), [visibleEntries])

  const dayLabels = useMemo(() => Object.fromEntries(Object.entries(previewsByDate).map(([date, dayEntries]) => {
    const firstEntry = dayEntries[0]
    const label = firstEntry.projectCode || firstEntry.activityName || 'Apontamento'
    return [date, dayEntries.length > 1 ? `${label} +${dayEntries.length - 1}` : label]
  })), [previewsByDate])

  function changeSquad(squadId: string) {
    setSelectedSquadId(squadId)
    setSelectedCollaboratorId(ALL_COLLABORATORS)
    setOpenedEntries(null)
  }

  function changeCollaborator(collaboratorId: string) {
    setSelectedCollaboratorId(collaboratorId)
    setOpenedEntries(null)
  }

  return (
    <section className="space-y-4" aria-label="Calendário gerencial">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-secondary)]">Gestão</p>
          <h2 className="text-xl font-extrabold text-[var(--color-text)]">Calendário da equipe</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {isDirector && (
            <label className="text-sm font-bold text-[var(--color-text)]">
              Equipe
              <select aria-label="Equipe" value={selectedSquadId} onChange={(event) => changeSquad(event.target.value)} className="mt-1 block min-w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-text)]">
                <option value={ALL_SQUADS}>Todas as equipes</option>
                {squadOptions.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
                {entries.some((entry) => !hasSquad(entry)) && <option value={NO_SQUAD}>Sem equipe</option>}
              </select>
            </label>
          )}
          <label className="text-sm font-bold text-[var(--color-text)]">
            Colaborador
            <select aria-label="Colaborador" value={selectedCollaboratorId} onChange={(event) => changeCollaborator(event.target.value)} className="mt-1 block min-w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-text)]">
              <option value={ALL_COLLABORATORS}>Todos da equipe</option>
              {collaboratorOptions.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      <MonthlyCalendar
        monthKey={monthKey}
        selectedDate={selectedDate}
        days={days}
        managerDayLabels={dayLabels}
        onMonthChange={(nextMonth) => { setMonthKey(nextMonth); setOpenedEntries(null) }}
        onSelectDate={(date) => { setSelectedDate(date); if (!previewsByDate[date]) setOpenedEntries(null) }}
        onOpenManagerDay={(date) => setOpenedEntries(previewsByDate[date] ?? null)}
      />
      {openedEntries && (
        <div role="dialog" aria-modal="true" aria-labelledby="manager-calendar-detail-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpenedEntries(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-secondary)]">Detalhes dos apontamentos</p>
                <h3 id="manager-calendar-detail-title" className="mt-1 text-xl font-extrabold text-[var(--color-text)]">{formatDatePtBr(openedEntries[0].entryDate)}</h3>
              </div>
              <button type="button" onClick={() => setOpenedEntries(null)} className="rounded-lg px-2 py-1 text-xl text-[var(--color-text-muted)]" aria-label="Fechar detalhes">×</button>
            </div>
            <div className="mt-5 space-y-3">
              {openedEntries.map((entry) => (
                <article key={entry.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="font-extrabold text-[var(--color-text)]">{entry.collaboratorName}</h4>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{entry.projectCode || entry.activityName || 'Atividade não informada'}</p>
                    </div>
                    <span className="text-sm font-bold text-[var(--color-text)]">{formatMinutes(entry.durationMinutes)} · {statusLabel(entry.status)}</span>
                  </div>
                  {entry.details && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text)]">{entry.details}</p>}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
