import { useState } from 'react'
import { formatDatePtBr } from '../../shared/lib/date'
import { formatMinutes, formatSignedMinutes } from '../time-entries/domain'
import type { ReportCollaborator, ReportSupervisor } from './types'

function hours(value: number) { return `${(value / 60).toFixed(1)} h` }

const supervisorGridColumns = 'grid-cols-[minmax(220px,1fr)_120px_110px_100px_80px]'

function EntryDetails({ collaborator }: { collaborator: ReportCollaborator }) {
  return <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)]"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Projeto</th><th className="px-4 py-3">Atividade</th><th className="px-4 py-3">Horas</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Detalhamento</th></tr></thead><tbody className="divide-y divide-[var(--color-border)]">{collaborator.entries.map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-4 py-3">{formatDatePtBr(entry.entryDate)}</td><td className="px-4 py-3">{entry.projectCode || 'Não informado'}</td><td className="px-4 py-3">{entry.activityName || 'Não informado'}</td><td className="whitespace-nowrap px-4 py-3">{formatMinutes(entry.durationMinutes)}</td><td className="px-4 py-3">{entry.status === 'PENDING' ? 'Pendente' : entry.status === 'APPROVED' ? 'Aprovado' : entry.status === 'REJECTED' ? 'Rejeitado' : entry.status === 'CANCELLED' ? 'Cancelado' : 'Ativo'}</td><td className="max-w-sm px-4 py-3 text-[var(--color-text-muted)]">{entry.details || 'Sem detalhamento'}</td></tr>)}{collaborator.entries.length === 0 && <tr><td colSpan={6} className="px-4 py-5 text-center text-[var(--color-text-muted)]">Nenhum apontamento no período filtrado.</td></tr>}</tbody></table></div>
}

function CollaboratorRow({ collaborator }: { collaborator: ReportCollaborator }) {
  const [open, setOpen] = useState(false)
  return <div className="border-t border-[var(--color-border)] first:border-t-0"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="grid w-full grid-cols-[minmax(180px,1fr)_90px_90px_90px_auto] items-center gap-2 px-4 py-3 text-left text-sm hover:bg-[var(--color-navigation-hover)]"><span><span className="mr-2 inline-block w-4 text-[var(--color-primary)]">{open ? '−' : '+'}</span><strong>{collaborator.name}</strong>{collaborator.jobTitle && <span className="ml-2 text-xs text-[var(--color-text-muted)]">{collaborator.jobTitle}</span>}</span><span className="text-right">{hours(collaborator.workedMinutes)}</span><span className="text-right text-[var(--color-primary)]">{hours(collaborator.extraMinutes)}</span><span className={`text-right ${collaborator.bankMinutes < 0 ? 'ui-text-danger' : 'text-[var(--color-primary)]'}`}>{formatSignedMinutes(collaborator.bankMinutes)}</span><span className="text-right text-xs text-[var(--color-text-muted)]">{collaborator.entries.length} lançamento(s)</span></button>{open && <div className="px-4 pb-4"><EntryDetails collaborator={collaborator} /></div>}</div>
}

export function ReportsHierarchy({ supervisors }: { supervisors: ReportSupervisor[] }) {
  const [openSupervisors, setOpenSupervisors] = useState<Record<string, boolean>>({})

  return (
    <section className="tour-relatorios overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]" aria-labelledby="reports-hierarchy-title">
      <div className="border-b border-[var(--color-border)] p-5">
        <h2 id="reports-hierarchy-title" className="text-xl font-extrabold">Operação por supervisor</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Expanda a hierarquia para consultar equipes, colaboradores e apontamentos diários.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px] text-left" aria-label="Operação por supervisor">
          <div className={`grid ${supervisorGridColumns} items-center gap-2 border-b border-[var(--color-border)] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]`}>
            <span>Supervisor</span>
            <span className="text-right">Horas trabalhadas</span>
            <span className="text-right">Horas extras</span>
            <span className="text-right">Banco</span>
            <span className="text-right">Equipe</span>
          </div>
          {supervisors.map((supervisor) => {
            const open = Boolean(openSupervisors[supervisor.id])

            return (
              <div key={supervisor.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <button type="button" onClick={() => setOpenSupervisors((current) => ({ ...current, [supervisor.id]: !open }))} aria-expanded={open} className={`grid w-full ${supervisorGridColumns} items-center gap-2 px-4 py-4 text-left hover:bg-[var(--color-navigation-hover)]`}>
                  <span><span className="mr-2 inline-block w-4 text-[var(--color-primary)]">{open ? '−' : '+'}</span><strong>{supervisor.name}</strong></span>
                  <span className="text-right">{hours(supervisor.workedMinutes)}</span>
                  <span className="text-right text-[var(--color-primary)]">{hours(supervisor.extraMinutes)}</span>
                  <span className={`text-right ${supervisor.bankMinutes < 0 ? 'ui-text-danger' : 'text-[var(--color-primary)]'}`}>{formatSignedMinutes(supervisor.bankMinutes)}</span>
                  <span className="text-right text-sm text-[var(--color-text-muted)]">{supervisor.collaborators.length}</span>
                </button>
                {open && <div className="mx-4 mb-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)]"><div className="grid grid-cols-[minmax(180px,1fr)_90px_90px_90px_auto] gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]"><span>Colaborador</span><span className="text-right">Horas</span><span className="text-right">Extras</span><span className="text-right">Banco</span><span className="text-right">Detalhes</span></div>{supervisor.collaborators.map((collaborator) => <CollaboratorRow key={collaborator.id} collaborator={collaborator} />)}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
