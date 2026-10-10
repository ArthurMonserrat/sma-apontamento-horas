import { StatusBadge } from '../../shared/ui/StatusBadge'
import { formatMinutes } from '../time-entries/domain'
import type { SupervisorPendingEntry } from './types'

type SupervisorEntriesTableProps = {
  entries: SupervisorPendingEntry[]
  isMutating: boolean
  selectedIds: string[]
  onToggleAll: (checked: boolean) => void
  onToggleEntry: (entryId: string, checked: boolean) => void
  onApprove: (entry: SupervisorPendingEntry) => void
  onReject: (entry: SupervisorPendingEntry) => void
}

const statusView = {
  PENDING: { label: 'Pendente', tone: 'pending' },
  APPROVED: { label: 'Aprovado', tone: 'success' },
  REJECTED: { label: 'Rejeitado', tone: 'danger' },
} as const

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`))
}

export function SupervisorEntriesTable({ entries, isMutating, selectedIds, onToggleAll, onToggleEntry, onApprove, onReject }: SupervisorEntriesTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="font-bold text-[var(--color-text)]">Nenhum apontamento encontrado.</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Ajuste os filtros para consultar o histórico da equipe.</p>
      </div>
    )
  }
  const pendingEntries = entries.filter((entry) => entry.status === 'PENDING' && !entry.escalated)
  const allVisibleSelected = pendingEntries.length > 0 && pendingEntries.every((entry) => selectedIds.includes(entry.id))

  return (
    <section className="ui-card overflow-hidden rounded-2xl" aria-labelledby="supervisor-entries-title">
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Histórico completo</p>
          <h2 id="supervisor-entries-title" className="mt-1 text-xl font-extrabold text-[var(--color-text)]">Apontamentos da equipe</h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{entries.length} registro(s)</p>
      </div>

      <div className="hidden max-h-[600px] overflow-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-subtle)] text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <tr>
              <th scope="col" className="px-5 py-4">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => onToggleAll(event.target.checked)}
                  disabled={pendingEntries.length === 0 || isMutating}
                  className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] accent-[var(--color-primary)]"
                  aria-label="Selecionar todos os apontamentos visíveis"
                />
              </th>
              <th scope="col" className="px-5 py-4">Colaborador</th>
              <th scope="col" className="px-5 py-4">Data</th>
              <th scope="col" className="px-5 py-4">Projeto</th>
              <th scope="col" className="px-5 py-4">Horas</th>
              <th scope="col" className="px-5 py-4">Status</th>
              <th scope="col" className="px-5 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y ui-divide">
            {entries.map((entry) => {
              const status = statusView[entry.status]
              const isPending = entry.status === 'PENDING' && !entry.escalated
              return (
                <tr key={entry.id} className="transition hover:bg-[var(--color-surface-subtle)]">
                  <td className="px-5 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(entry.id)}
                      onChange={(event) => onToggleEntry(entry.id, event.target.checked)}
                      disabled={!isPending || isMutating}
                      className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] accent-[var(--color-primary)]"
                      aria-label={`Selecionar apontamento de ${entry.collaboratorName}`}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-[var(--color-text)]">{entry.collaboratorName}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{entry.activityName}</p>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{formatDate(entry.entryDate)}</td>
                  <td className="px-5 py-4 font-semibold text-[var(--color-text)]">{entry.projectCode}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{formatMinutes(entry.durationMinutes)}</td>
                  <td className="px-5 py-4">
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    {entry.rejectionReason && <p className="mt-2 max-w-52 text-xs text-[var(--color-text-muted)]">{entry.rejectionReason}</p>}
                  </td>
                  <td className="px-5 py-4">
                    {isPending ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" className="ui-button-secondary px-3 py-2" onClick={() => onReject(entry)} disabled={isMutating}>
                          Rejeitar
                        </button>
                        <button type="button" className="ui-button-primary px-3 py-2" onClick={() => onApprove(entry)} disabled={isMutating}>
                          Aprovar
                        </button>
                      </div>
                    ) : entry.escalated ? (
                      <p className="text-right text-xs font-bold text-[var(--color-danger)]">Escalonado para a Diretoria</p>
                    ) : (
                      <p className="text-right text-xs font-bold text-[var(--color-text-muted)]">Concluído</p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="max-h-[600px] divide-y overflow-y-auto ui-divide md:hidden">
        {entries.map((entry) => {
          const status = statusView[entry.status]
          const isPending = entry.status === 'PENDING' && !entry.escalated
          return (
            <article key={entry.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(entry.id)}
                  onChange={(event) => onToggleEntry(entry.id, event.target.checked)}
                  disabled={!isPending || isMutating}
                  className="mt-1 h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] accent-[var(--color-primary)]"
                  aria-label={`Selecionar apontamento de ${entry.collaboratorName}`}
                />
                <div>
                  <h3 className="font-extrabold text-[var(--color-text)]">{entry.collaboratorName}</h3>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{entry.projectCode} · {formatDate(entry.entryDate)}</p>
                </div>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Horas</dt>
                  <dd className="mt-1 font-bold text-[var(--color-text)]">{formatMinutes(entry.durationMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Atividade</dt>
                  <dd className="mt-1 font-bold text-[var(--color-text)]">{entry.activityName}</dd>
                </div>
              </dl>
              {entry.rejectionReason && <p className="mt-3 text-sm text-[var(--color-text-muted)]">{entry.rejectionReason}</p>}
              {entry.escalated ? <p className="mt-4 text-sm font-bold text-[var(--color-danger)]">Prazo encerrado: pendência transferida para a Diretoria.</p> : isPending && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="ui-button-secondary" onClick={() => onReject(entry)} disabled={isMutating}>
                    Rejeitar
                  </button>
                  <button type="button" className="ui-button-primary" onClick={() => onApprove(entry)} disabled={isMutating}>
                    Aprovar
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
