import type { Squad } from '../squads/types'

type SquadSelectorProps = {
  squads: Squad[]
  activeSquadId: string
  isSaving: boolean
  onChange: (squadId: string) => void
}

export function SquadSelector({ squads, activeSquadId, isSaving, onChange }: SquadSelectorProps) {
  return (
    <section className="rounded-2xl border ui-border p-5" aria-labelledby="squad-title">
      <h2 id="squad-title" className="text-lg font-extrabold ui-heading">Alocação atual</h2>
      <div className="mt-4 max-w-xl">
        <label htmlFor="active-squad" className="block text-sm font-bold ui-text">Squad ativa</label>
        <select
          id="active-squad"
          value={activeSquadId}
          disabled={isSaving}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2 disabled:cursor-wait disabled:opacity-60"
        >
          {squads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
        </select>
        <p className="mt-2 text-sm ui-text-muted">
          Ao alterar a squad, o supervisor será definido automaticamente para os próximos registros.
        </p>
      </div>
    </section>
  )
}
