import { useState } from 'react'
import { EntryDocumentDetails } from '../time-entries/EntryDocumentDetails'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { demoActivities } from '../../mocks/demoData'
import { formatDatePtBr } from '../../shared/lib/date'
import { formatMinutes } from '../time-entries/domain'
import type { HistoryRow } from './useTimeEntryHistory'
import { useTimeEntryHistory } from './useTimeEntryHistory'
import { HistoryFilters } from './HistoryFilters'
import { fieldClassName } from '../time-entries/TimeEntryFields'
import { formatSignedMinutes } from '../time-entries/domain'
import { getCalendarVisualState } from '../calendar/domain'
import { HistoryPeriodSummary } from './HistoryPeriodSummary'
import { getHistoryEntryActions } from './entryActions'
import { EntryRevisionBadge, EntryRevisionDetails } from '../time-entries/EntryRevisionBadge'
import { StatusBadge } from '../../shared/ui/StatusBadge'
import { approvalStatusPresentation, nonApplicableApprovalPresentation, timeEntryStatusPresentation } from '../status/presentation'

export function TimeEntryHistory() {
  const history = useTimeEntryHistory()
  const [cancelTarget, setCancelTarget] = useState<HistoryRow | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)

  const confirmCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) return
    setIsCancelling(true)
    try {
      await history.cancel(cancelTarget, cancelReason)
      setCancelTarget(null)
      setCancelReason('')
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <div className="space-y-5">
      <HistoryFilters value={history.draftFilters} onChange={history.setDraftFilters} onApply={history.applyFilters} />
      {history.feedback && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">{history.feedback}</p>}
      {history.error && <div role="alert" className="ui-alert-danger rounded-xl p-4 text-sm"><p>{history.error}</p><button type="button" onClick={() => void history.reload()} className="mt-2 font-bold underline">Tentar novamente</button></div>}
      {history.isLoading && <p aria-live="polite" className="rounded-2xl ui-surface p-8 text-center font-semibold ui-text-muted">Carregando histórico…</p>}
      {!history.isLoading && history.periodSummary && <HistoryPeriodSummary summary={history.periodSummary} events={history.periodEvents} timeOffRequests={history.periodTimeOffRequests} />}
      {!history.isLoading && !history.error && history.rows.length === 0 && <div className="rounded-2xl border border-dashed ui-border ui-surface p-10 text-center"><p className="font-bold ui-heading">Nenhum apontamento encontrado.</p><p className="mt-2 text-sm ui-text-subtle">Ajuste os filtros ou registre um novo apontamento.</p></div>}
      {!history.isLoading && history.rows.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm ui-text-muted">{history.total} registro(s) encontrado(s). Exibição paginada de até 10 itens.</p>
          {history.rows.map((row) => {
            const { entry, approval } = row
            const approvalPresentation = approval ? approvalStatusPresentation[approval.status] : nonApplicableApprovalPresentation
            const activity = demoActivities.find((item) => item.id === entry.activityId)?.name ?? 'Atividade não disponível'
            const actions = getHistoryEntryActions({
              entryStatus: entry.status,
              approvalStatus: approval?.status ?? null,
              canMutate: row.canMutate,
              hasIntegralEventConflict: row.summary.hasIntegralEventConflict,
            })
            return (
              <article key={entry.id} className="rounded-2xl border ui-border ui-surface p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-extrabold ui-heading">{formatDatePtBr(entry.entryDate)} · Contratada {entry.projectCode}</h2>
                      {entry.status === 'CANCELLED' && <StatusBadge tone={timeEntryStatusPresentation.CANCELLED.tone}>{timeEntryStatusPresentation.CANCELLED.label}</StatusBadge>}
                      <StatusBadge tone={approvalPresentation.tone}>{approvalPresentation.label}</StatusBadge>
                      <EntryRevisionBadge version={entry.version} />
                    </div>
                    <p className="mt-2 text-sm ui-text-subtle">{entry.clientName} · {activity} · {formatMinutes(entry.durationMinutes)}</p>
                    <EntryDocumentDetails entry={entry} />
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="font-bold ui-text-subtle">Disciplina</dt><dd>{entry.disciplineCode}</dd></div>
                      <div><dt className="font-bold ui-text-subtle">Tipo de documento</dt><dd>{entry.documentTypeCode}</dd></div>
                      <div><dt className="font-bold ui-text-subtle">Squad registrada</dt><dd>{entry.assignmentSnapshot?.squadName ?? 'Não disponível (legado)'}</dd></div>
                      <div><dt className="font-bold ui-text-subtle">Supervisor registrado</dt><dd>{entry.assignmentSnapshot?.supervisorName ?? 'Não disponível (legado)'}</dd></div>
                      <div><dt className="font-bold ui-text-subtle">Situação da jornada</dt><dd>{getCalendarVisualState(row.summary).label}</dd></div>
                      <div><dt className="font-bold ui-text-subtle">Saldo do dia</dt><dd>{formatSignedMinutes(row.summary.balanceMinutes)}</dd></div>
                    </dl>
                    {(row.events.length > 0 || row.timeOffRequests.length > 0) && <p className="mt-3 text-sm ui-text-muted"><strong>Eventos do dia:</strong> {[...row.events.map((event) => event.title), ...row.timeOffRequests.map((request) => `Folga ${request.status.toLocaleLowerCase('pt-BR')}`)].join(' · ')}</p>}
                    <p className="mt-4 text-sm leading-6 ui-text">{entry.details}</p>
                    {approval?.correctionReason && <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><strong>Motivo da correção:</strong> {approval.correctionReason}</p>}
                    {approval?.deficitJustification && <p className="mt-3 text-sm ui-text-muted"><strong>Justificativa de aprovação com déficit:</strong> {approval.deficitJustification}</p>}
                    {entry.cancelReason && <p className="mt-3 text-sm ui-text-subtle"><strong>Motivo do cancelamento:</strong> {entry.cancelReason}</p>}
                    {row.summary.hasIntegralEventConflict && <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><strong>Conflito com evento integral:</strong> registro preservado para auditoria e fora do saldo.</p>}
                    <EntryRevisionDetails version={entry.version} updatedAt={entry.updatedAt} />
                  </div>
                  <div className="flex min-w-44 flex-col gap-2">
                    {actions.edit && <Link to={`/colaborador/apontamentos/${entry.id}/editar`} className="rounded-xl border ui-border-primary px-3 py-2 text-center text-sm font-bold ui-heading">Editar</Link>}
                    {actions.duplicate && <Link to={`/colaborador/apontamentos/novo?duplicate=${entry.id}`} className="rounded-xl border ui-border px-3 py-2 text-center text-sm font-bold ui-text">Duplicar</Link>}
                    {actions.cancel && <button type="button" onClick={() => setCancelTarget(row)} className="ui-button-danger-outline rounded-xl px-3 py-2 text-sm font-bold">Cancelar</button>}
                    {actions.completeCorrection && <button type="button" onClick={() => void history.completeCorrection(row)} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950">Concluir correção</button>}
                    {actions.readOnly && <span className="rounded-xl ui-surface-subtle px-3 py-2 text-center text-sm font-semibold ui-text-muted">Somente leitura</span>}
                  </div>
                </div>
              </article>
            )
          })}
          <div className="flex items-center justify-between">
            <button type="button" disabled={!history.hasPreviousPage} onClick={history.previousPage} className="rounded-xl border ui-border px-4 py-2 text-sm font-bold disabled:opacity-40">Anterior</button>
            <button type="button" disabled={!history.nextCursor} onClick={history.nextPage} className="rounded-xl border ui-border px-4 py-2 text-sm font-bold disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}

      <ConfirmDialog open={Boolean(cancelTarget)} title="Cancelar apontamento?" description="O registro será preservado no histórico e deixará de participar dos saldos." confirmLabel="Confirmar cancelamento" isBusy={isCancelling} onCancel={() => { setCancelTarget(null); setCancelReason('') }} onConfirm={() => void confirmCancel()}>
        <label htmlFor="cancel-reason" className="text-sm font-bold ui-text">Motivo do cancelamento</label>
        <textarea id="cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} className={fieldClassName} />
      </ConfirmDialog>
    </div>
  )
}
