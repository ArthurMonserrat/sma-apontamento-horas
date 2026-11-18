import { formatDatePtBr } from '../../shared/lib/date'
import { formatMinutes } from '../time-entries/domain'
import type { WorkloadVersion } from './types'

type WorkloadHistoryProps = {
  versions: WorkloadVersion[]
}

export function WorkloadHistory({ versions }: WorkloadHistoryProps) {
  return (
    <section className="rounded-2xl border ui-border p-5" aria-label="Histórico de cargas">
      <h2 className="text-lg font-extrabold ui-heading">Histórico de cargas</h2>
      {versions.length === 0 ? <p className="mt-3 text-sm ui-text-muted">Nenhuma carga cadastrada.</p> : (
        <ul className="mt-4 space-y-3">
          {[...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map((version) => (
            <li key={version.id} className="rounded-xl ui-surface-subtle p-4">
              <strong className="ui-heading">{formatMinutes(version.dailyMinutes)} por dia</strong>
              <p className="mt-1 text-sm ui-text-muted">Vigente desde {formatDatePtBr(version.effectiveFrom)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
