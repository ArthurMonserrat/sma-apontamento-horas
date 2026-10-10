import { demoActivities } from '../../demo/fixtures/demoData'
import type { TimeEntry } from '../time-entries/types'
import { formatMinutes, isCountableTimeEntryStatus } from '../time-entries/domain'
import { EntryRevisionBadge } from '../time-entries/EntryRevisionBadge'
import { EntryDocumentDetails } from '../time-entries/EntryDocumentDetails'

export function DailyEntryList({ entries }: { entries: TimeEntry[] }) {
  const activeEntries = entries.filter((entry) => isCountableTimeEntryStatus(entry.status))

  return (
    <section className="rounded-2xl border ui-border ui-surface shadow-sm" aria-labelledby="daily-entries-title">
      <div className="border-b ui-border p-5">
        <div>
          <h2 id="daily-entries-title" className="text-lg font-extrabold ui-heading">Apontamentos do dia</h2>
          <p className="mt-1 text-sm ui-text-subtle">Somente seus registros ativos para a data selecionada.</p>
        </div>
      </div>

      {activeEntries.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-bold ui-text">Nenhum apontamento registrado neste dia.</p>
          <p className="mt-2 text-sm ui-text-subtle">Registre a primeira atividade para atualizar o resumo.</p>
        </div>
      ) : (
        <ul className="divide-y ui-divide">
          {activeEntries.map((entry) => {
            const activity = demoActivities.find((item) => item.id === entry.activityId)
            return (
              <li key={entry.id} className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold ui-heading">Número da contratada: {entry.projectCode}</p>
                      <EntryRevisionBadge version={entry.version} />
                    </div>
                    <p className="mt-1 text-sm ui-text-subtle">{entry.clientName} · {activity?.name}</p>
                    <EntryDocumentDetails entry={entry} />
                    <p className="mt-3 text-sm leading-6 ui-text">{entry.details}</p>
                  </div>
                  <span className="shrink-0 rounded-lg ui-surface-subtle px-3 py-2 text-sm font-extrabold ui-heading">{formatMinutes(entry.durationMinutes)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
