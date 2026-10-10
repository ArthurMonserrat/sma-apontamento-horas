import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { DirectorSidebar } from '../components/DirectorSidebar'
import { ThemeToggle } from '../components/ThemeToggle'
import { useSession } from '../features/session/useSession'
import { organogramaDEP } from '../data/mockDEP'
import { ReportsHierarchy } from '../features/reports/ReportsHierarchy'
import { formatMinutes, formatSignedMinutes } from '../features/time-entries/domain'
import type { ReportEntry, ReportStatus, ReportSupervisor } from '../features/reports/types'
import { eachIsoDate, getCorporateToday, getMonthKey, getMonthRange, isWeekend } from '../shared/lib/date'
import { TIME_ENTRY_STORAGE_KEY } from '../services/timeEntryService'
import { exportDirectorateReport, type DirectorateReportRow } from '../services/excelExportService'

const statusOptions: Array<{ value: '' | ReportStatus, label: string }> = [
  { value: '', label: 'Todos os status' }, { value: 'PENDING', label: 'Pendente' }, { value: 'APPROVED', label: 'Aprovado' }, { value: 'REJECTED', label: 'Rejeitado' },
]

function readEntries(): ReportEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TIME_ENTRY_STORAGE_KEY) || '[]') as unknown
    const rawEntries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'entriesByCollaborator' in parsed
      ? Object.values((parsed as { entriesByCollaborator?: Record<string, unknown> }).entriesByCollaborator ?? {}).flatMap((items) => Array.isArray(items) ? items : []) : []
    return rawEntries.flatMap((value): ReportEntry[] => {
      if (!value || typeof value !== 'object') return []
      const raw = value as Record<string, unknown>
      if (typeof raw.id !== 'string' || typeof raw.collaboratorId !== 'string' || typeof raw.entryDate !== 'string') return []
      const statusValue = String(raw.status ?? 'ACTIVE').toUpperCase()
      const status = (statusValue === 'PENDENTE' ? 'PENDING' : statusValue) as ReportStatus
      const snapshot = raw.assignmentSnapshot as Record<string, unknown> | null
      const numberValue = (key: string) => Number.isFinite(Number(raw[key])) ? Number(raw[key]) : 0
      return [{ id: raw.id, collaboratorId: raw.collaboratorId, entryDate: raw.entryDate, projectCode: typeof raw.projectCode === 'string' ? raw.projectCode : '', durationMinutes: numberValue('durationMinutes'), extraMinutes: numberValue('extraMinutes') || numberValue('overtimeMinutes'), nightMinutes: numberValue('nightMinutes'), status, details: typeof raw.details === 'string' ? raw.details : undefined, activityName: typeof raw.activityId === 'string' ? raw.activityId : undefined, supervisorName: typeof snapshot?.supervisorName === 'string' ? snapshot.supervisorName : undefined, squadName: typeof snapshot?.squadName === 'string' ? snapshot.squadName : undefined }]
    })
  } catch { return [] }
}

function slug(value: string) { return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-') }
function sumMinutes(entries: ReportEntry[], selector: (entry: ReportEntry) => number) { return entries.reduce((total, entry) => total + selector(entry), 0) }
function expectedMinutes(startDate: string, endDate: string) { return eachIsoDate(startDate, endDate).filter((date) => !isWeekend(date)).length * 480 }
function statusLabel(status: ReportStatus) { return status === 'PENDING' ? 'Pendente' : status === 'APPROVED' ? 'Aprovado' : status === 'REJECTED' ? 'Rejeitado' : status === 'CANCELLED' ? 'Cancelado' : 'Ativo' }
function flattenReportRows(supervisors: ReportSupervisor[]): DirectorateReportRow[] {
  return supervisors.flatMap((supervisor) => supervisor.collaborators.flatMap((collaborator) => collaborator.entries.map((entry) => ({
    supervisor: supervisor.name,
    colaborador: collaborator.name,
    dataApontamento: entry.entryDate,
    horasTrabalhadas: formatMinutes(entry.durationMinutes),
    horasExtras: formatMinutes(entry.extraMinutes),
    horasNoturnas: formatMinutes(entry.nightMinutes),
    bancoDeHoras: formatSignedMinutes(collaborator.bankMinutes),
    status: statusLabel(entry.status),
  }))))
}

function KpiCard({ label, value, helper }: { label: string, value: string, helper: string }) { return <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p><p className="mt-3 text-3xl font-extrabold text-[var(--color-primary)]">{value}</p><p className="mt-2 text-sm text-[var(--color-text-muted)]">{helper}</p></article> }

export function RelatoriosPage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const initialRange = getMonthRange(getMonthKey(getCorporateToday()))
  const [entries, setEntries] = useState<ReportEntry[]>([])
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [supervisorFilter, setSupervisorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | ReportStatus>('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  useEffect(() => { setEntries(readEntries()) }, [])

  const filteredEntries = useMemo(() => entries.filter((entry) => entry.entryDate >= startDate && entry.entryDate <= endDate && (!supervisorFilter || entry.supervisorName === supervisorFilter) && (!statusFilter || entry.status === statusFilter)), [endDate, entries, startDate, statusFilter, supervisorFilter])
  const supervisorNames = useMemo(() => Array.from(new Set([...organogramaDEP.flatMap((item) => item.squads.map((squad) => squad.supervisor)), ...entries.map((entry) => entry.supervisorName).filter((name): name is string => Boolean(name))])).sort((a, b) => a.localeCompare(b)), [entries])
  const supervisors = useMemo<ReportSupervisor[]>(() => {
    const groups = new Map<string, ReportEntry[]>()
    filteredEntries.forEach((entry) => { const key = entry.supervisorName ?? 'Não atribuído'; groups.set(key, [...(groups.get(key) ?? []), entry]) })
    const names = Array.from(new Set([...organogramaDEP.flatMap((item) => item.squads.map((squad) => squad.supervisor)), ...groups.keys()]))
    return names.map((name) => {
      const supervisorEntries = groups.get(name) ?? []
      const collaboratorMap = new Map<string, { name: string, jobTitle?: string, entries: ReportEntry[] }>()
      organogramaDEP.flatMap((item) => item.squads.filter((squad) => squad.supervisor === name).flatMap((squad) => squad.colaboradores)).forEach((collaborator) => collaboratorMap.set(slug(collaborator.nome), { name: collaborator.nome, jobTitle: collaborator.cargo, entries: [] }))
      supervisorEntries.forEach((entry) => {
        const current = collaboratorMap.get(entry.collaboratorId) ?? { name: entry.collaboratorId === 'demo-collaborator-001' ? 'Colaborador' : entry.collaboratorId, entries: [] }
        collaboratorMap.set(entry.collaboratorId, { ...current, entries: [...current.entries, entry] })
      })
      const collaborators = Array.from(collaboratorMap.entries()).map(([id, collaborator]) => { const workedMinutes = sumMinutes(collaborator.entries, (entry) => entry.status === 'CANCELLED' ? 0 : entry.durationMinutes); return { id, name: collaborator.name, jobTitle: collaborator.jobTitle, workedMinutes, extraMinutes: sumMinutes(collaborator.entries, (entry) => entry.extraMinutes), nightMinutes: sumMinutes(collaborator.entries, (entry) => entry.nightMinutes), bankMinutes: workedMinutes - expectedMinutes(startDate, endDate), entries: collaborator.entries } })
      const workedMinutes = sumMinutes(supervisorEntries, (entry) => entry.status === 'CANCELLED' ? 0 : entry.durationMinutes)
      return { id: slug(name), name, workedMinutes, extraMinutes: sumMinutes(supervisorEntries, (entry) => entry.extraMinutes), nightMinutes: sumMinutes(supervisorEntries, (entry) => entry.nightMinutes), bankMinutes: workedMinutes - expectedMinutes(startDate, endDate), collaborators }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [endDate, filteredEntries, startDate])
  const activeEntries = filteredEntries.filter((entry) => entry.status !== 'CANCELLED')
  const totalMinutes = sumMinutes(activeEntries, (entry) => entry.durationMinutes)
  const extraMinutes = sumMinutes(activeEntries, (entry) => entry.extraMinutes)
  const nightMinutes = sumMinutes(activeEntries, (entry) => entry.nightMinutes)
  const pendingCount = filteredEntries.filter((entry) => entry.status === 'PENDING').length
  const validRange = Boolean(startDate && endDate && startDate <= endDate)
  const exportRows = useMemo(() => flattenReportRows(supervisors), [supervisors])
  const handleExport = async () => {
    if (!validRange || isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      await exportDirectorateReport(exportRows, { startDate, endDate })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Não foi possível exportar o relatório.')
    } finally {
      setIsExporting(false)
    }
  }
  const exit = () => { signOut(); navigate('/login', { replace: true }) }

  return <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]"><header className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-header)] px-4 shadow-sm sm:px-6 lg:px-8"><div className="flex items-center gap-3"><BrandMark variant="compact" /><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-secondary)]">SM&A - Relatórios</p><p className="text-sm text-[var(--color-text-muted)]">Visão macro da operação</p></div></div><div className="flex items-center gap-3"><span className="hidden text-right text-xs font-semibold text-[var(--color-text-muted)] sm:block">{session?.name}</span><ThemeToggle /></div></header><div className="flex"><DirectorSidebar onSignOut={exit} /><main className="flex-1 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-secondary)]">Visão macro</p><h1 className="mt-2 text-3xl font-extrabold">Relatórios</h1><p className="mt-2 text-sm text-[var(--color-text-muted)]">Acompanhe horas, extras, período noturno e pendências por supervisor e equipe.</p></div><button type="button" onClick={() => void handleExport()} disabled={!validRange || isExporting} className="tour-btn-exportar rounded-xl border border-[var(--color-primary)] px-4 py-3 text-sm font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:cursor-not-allowed disabled:opacity-50">{isExporting ? 'Exportando...' : 'Exportar Relatório'}</button></section>{exportError && <p role="alert" className="-mt-3 text-right text-sm font-semibold text-red-500">{exportError}</p>}<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores dos relatórios"><KpiCard label="Total de Horas da Operação" value={`${(totalMinutes / 60).toFixed(1)} h`} helper="Período filtrado" /><KpiCard label="Total de Horas Extras" value={`${(extraMinutes / 60).toFixed(1)} h`} helper="Informadas nos apontamentos" /><KpiCard label="Total de Horas Noturnas" value={`${(nightMinutes / 60).toFixed(1)} h`} helper="Faixa das 22h às 05h" /><KpiCard label="Horas Pendentes de Aprovação" value={`${pendingCount}`} helper="Apontamentos aguardando análise" /></section><section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5" aria-label="Filtros globais"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-bold">Data inicial<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5 font-normal outline-none focus:border-[var(--color-primary)]" /></label><label className="text-sm font-bold">Data final<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5 font-normal outline-none focus:border-[var(--color-primary)]" /></label><label className="text-sm font-bold">Supervisor<select value={supervisorFilter} onChange={(event) => setSupervisorFilter(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5 font-normal outline-none focus:border-[var(--color-primary)]"><option value="">Todos os supervisores</option>{supervisorNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label className="text-sm font-bold">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | ReportStatus)} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5 font-normal outline-none focus:border-[var(--color-primary)]">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>{!validRange && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">A data final deve ser igual ou posterior à data inicial.</p>}</section><ReportsHierarchy supervisors={validRange ? supervisors : []} /></div></main></div></div>
}
