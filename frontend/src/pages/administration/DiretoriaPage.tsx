import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BrandMark } from '../../shared/ui/BrandMark'
import { DirectorSidebar } from '../../app/layouts/DirectorSidebar'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { useSession } from '../../features/session/useSession'
import { TIME_OFF_STORAGE_KEY } from '../../features/time-off/infrastructure/timeOffService'
import { TIME_ENTRY_STORAGE_KEY } from '../../features/time-entries'
import { getMonthKey } from '../../shared/lib/date'
import { diretoriaService } from '../../services/diretoriaService'
import { squadService } from '../../features/squads/infrastructure/squadService'
import { supervisorService } from '../../features/supervisor/infrastructure/supervisorService'
import type { SupervisorPendingEntry } from '../../features/supervisor/types'
import type { Squad } from '../../features/squads/types'
import { ManagerCalendar } from '../../features/calendar/ManagerCalendar'
import { formatMinutes } from '../../features/time-entries/domain'
import { useTour } from '../../app/providers/tourContext'
import { AvisosPage } from './AvisosPage'

type DiretoriaEntry = {
  id: string
  collaboratorId: string
  entryDate: string
  projectCode: string
  durationMinutes: number
  status: string
}

type DiretoriaAbsence = {
  id: string
  status: string
}

type ProjectHoursRow = {
  projeto: string
  horas: number
}

const fallbackProjectHours: ProjectHoursRow[] = [
  { projeto: 'SM&A-ENG-142', horas: 128 },
  { projeto: 'SM&A-AUT-087', horas: 96 },
  { projeto: 'SM&A-ELE-211', horas: 74 },
]

function readJsonArray(key: string): unknown[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object' && key === TIME_ENTRY_STORAGE_KEY) {
      const entriesByCollaborator = (parsed as { entriesByCollaborator?: unknown }).entriesByCollaborator
      if (!entriesByCollaborator || typeof entriesByCollaborator !== 'object') return []
      return Object.values(entriesByCollaborator).flatMap((entries) => Array.isArray(entries) ? entries : [])
    }
    if (parsed && typeof parsed === 'object' && key === TIME_OFF_STORAGE_KEY) {
      const requests = (parsed as { requests?: unknown }).requests
      return Array.isArray(requests) ? requests : []
    }
    return []
  } catch {
    return []
  }
}

function normalizeEntry(value: unknown): DiretoriaEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (typeof entry.id !== 'string'
    || typeof entry.collaboratorId !== 'string'
    || typeof entry.entryDate !== 'string'
    || typeof entry.projectCode !== 'string'
    || !Number.isFinite(Number(entry.durationMinutes))) return null
  return {
    id: entry.id,
    collaboratorId: entry.collaboratorId,
    entryDate: entry.entryDate,
    projectCode: entry.projectCode,
    durationMinutes: Number(entry.durationMinutes),
    status: typeof entry.status === 'string' ? entry.status : 'ACTIVE',
  }
}

function normalizeAbsence(value: unknown): DiretoriaAbsence | null {
  if (!value || typeof value !== 'object') return null
  const absence = value as Record<string, unknown>
  if (typeof absence.id !== 'string') return null
  return {
    id: absence.id,
    status: typeof absence.status === 'string' ? absence.status : 'Pendente',
  }
}

function SummaryCard({ label, value, helper }: { label: string, value: string | number, helper: string }) {
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-extrabold text-[var(--color-primary)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{helper}</p>
    </article>
  )
}

function EscalatedApprovals({ entries, directorId, onApproved }: { entries: SupervisorPendingEntry[], directorId: string, onApproved: () => void }) {
  const [isMutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function approve(entryId: string) {
    setMutating(true)
    setError(null)
    try {
      await diretoriaService.approveEscalated(entryId, directorId)
      onApproved()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível aprovar o apontamento escalado.')
    } finally {
      setMutating(false)
    }
  }

  return <section className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-surface)] p-5 shadow-sm" aria-labelledby="escalated-approvals-title"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-danger)]">Aprovações escaladas</p><h2 id="escalated-approvals-title" className="mt-1 text-xl font-extrabold text-[var(--color-text)]">Pendências transferidas para a Diretoria</h2></div><span className="text-sm text-[var(--color-text-muted)]">{entries.length} pendência(s)</span></div>{error && <p role="alert" className="mt-4 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}{entries.length === 0 ? <p className="mt-4 text-sm text-[var(--color-text-muted)]">Nenhum apontamento foi escalado neste fechamento.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-3 py-3">Colaborador</th><th className="px-3 py-3">Data</th><th className="px-3 py-3">Projeto</th><th className="px-3 py-3">Horas</th><th className="px-3 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-[var(--color-border)]">{entries.map((entry) => <tr key={entry.id}><td className="px-3 py-3 font-bold">{entry.collaboratorName}</td><td className="px-3 py-3 text-[var(--color-text-muted)]">{entry.entryDate}</td><td className="px-3 py-3">{entry.projectCode}</td><td className="px-3 py-3">{formatMinutes(entry.durationMinutes)}</td><td className="px-3 py-3 text-right"><button type="button" className="ui-button-primary px-3 py-2" onClick={() => void approve(entry.id)} disabled={isMutating}>Aprovar</button></td></tr>)}</tbody></table></div>}</section>
}

export function DiretoriaPage() {
  const { startTour } = useTour()
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isNotices = searchParams.get('view') === 'avisos'
  const [entries, setEntries] = useState<DiretoriaEntry[]>([])
  const [absences, setAbsences] = useState<DiretoriaAbsence[]>([])
  const [escalatedEntries, setEscalatedEntries] = useState<SupervisorPendingEntry[]>([])
  const [managerEntries, setManagerEntries] = useState<SupervisorPendingEntry[]>([])
  const [managerSquads, setManagerSquads] = useState<Array<Pick<Squad, 'id' | 'name'>>>([])
  const currentMonth = getMonthKey(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    const storedEntries = readJsonArray(TIME_ENTRY_STORAGE_KEY).flatMap((entry) => {
      const normalized = normalizeEntry(entry)
      return normalized ? [normalized] : []
    })
    const storedAbsences = readJsonArray(TIME_OFF_STORAGE_KEY).flatMap((absence) => {
      const normalized = normalizeAbsence(absence)
      return normalized ? [normalized] : []
    })
    setEntries(storedEntries)
    setAbsences(storedAbsences)
    void diretoriaService.listEscalatedEntries().then(setEscalatedEntries).catch(() => setEscalatedEntries([]))
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([supervisorService.listEntries(), squadService.listActive()])
      .then(([loadedEntries, loadedSquads]) => {
        if (!active) return
        setManagerEntries(loadedEntries)
        setManagerSquads(loadedSquads.map(({ id, name }) => ({ id, name })))
      })
      .catch(() => {
        if (!active) return
        setManagerEntries([])
        setManagerSquads([])
      })
    return () => { active = false }
  }, [])

  const projectHours = useMemo(() => {
    const activeEntries = entries.filter((entry) => entry.status !== 'CANCELLED')
    if (activeEntries.length === 0) return fallbackProjectHours
    const grouped = activeEntries.reduce<Record<string, number>>((totals, entry) => {
      totals[entry.projectCode] = (totals[entry.projectCode] ?? 0) + entry.durationMinutes / 60
      return totals
    }, {})
    return Object.entries(grouped)
      .map(([projeto, horas]) => ({ projeto, horas: Number(horas.toFixed(1)) }))
      .sort((left, right) => right.horas - left.horas)
      .slice(0, 6)
  }, [entries])

  const monthEntries = entries.filter((entry) => entry.entryDate.startsWith(currentMonth) && entry.status !== 'CANCELLED')
  const totalMonthHours = monthEntries.reduce((total, entry) => total + entry.durationMinutes / 60, 0)
  const activeProjects = new Set(entries.filter((entry) => entry.status !== 'CANCELLED').map((entry) => entry.projectCode)).size
  const pendingAbsences = absences.filter((absence) => absence.status === 'PENDING' || absence.status === 'Pendente').length

  function exitDemo() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--color-background)] text-[var(--color-text)]">
      <header className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-header)] px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <BrandMark variant="compact" />
          <div>
            <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.2em]">SM&A - Painel da Diretoria</p>
            <p className="text-sm text-[var(--color-text-muted)]">Visão macro e alocação de tempo por projetos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs font-semibold text-[var(--color-text-muted)] sm:block">{session?.name}</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-w-0">
        <DirectorSidebar onSignOut={exitDemo} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {isNotices ? <AvisosPage embedded /> : <>
            <section>
              <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Visão Macro</p>
              <h1 className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">SM&A - Painel da Diretoria</h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Visão macro e alocação de tempo por projetos.</p>
              <button type="button" onClick={() => { startTour(); navigate('/administracao/relatorios') }} className="ui-button-secondary mt-4">Ver Tutorial do Sistema</button>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores da diretoria">
              <SummaryCard label="Total de Horas Apontadas (Mês)" value={totalMonthHours > 0 ? totalMonthHours.toFixed(1) : '298'} helper="Horas consolidadas no mês atual" />
              <SummaryCard label="Projetos Ativos" value={activeProjects || 3} helper="Projetos com apontamentos registrados" />
              <SummaryCard label="Apontamentos Registrados" value={entries.length} helper="Base persistida em localStorage" />
              <SummaryCard label="Pendências Gerais" value={pendingAbsences} helper="Ausências aguardando decisão" />
            </section>

            <EscalatedApprovals entries={escalatedEntries} directorId={session?.id ?? 'diretoria'} onApproved={() => { void diretoriaService.listEscalatedEntries().then(setEscalatedEntries) }} />

            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm" aria-labelledby="project-allocation-title">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Dashboard</p>
                  <h2 id="project-allocation-title" className="mt-1 text-xl font-extrabold text-[var(--color-text)]">Alocação de Tempo por Projeto</h2>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">{entries.length > 0 ? 'Dados reais do localStorage' : 'Dados corporativos para aprovação visual'}</p>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectHours} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                    <XAxis dataKey="projeto" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(119, 194, 164, 0.08)' }}
                      contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, color: 'var(--color-text)' }}
                      labelStyle={{ color: 'var(--color-text)' }}
                    />
                    <Bar dataKey="horas" name="Horas" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <ManagerCalendar
              entries={managerEntries}
              collaborators={[]}
              squads={managerSquads}
              role="DIRECTOR_ADMIN"
            />
            </>}
          </div>
        </main>
      </div>
    </div>
  )
}
