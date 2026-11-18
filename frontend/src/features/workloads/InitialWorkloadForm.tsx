import type { FormEvent } from 'react'

export type InitialWorkloadFormField = 'hours' | 'minutes' | 'effectiveFrom' | 'observation'

type InitialWorkloadFormProps = {
  hours: string
  minutes: string
  effectiveFrom: string
  observation: string
  minDate: string
  isSubmitting: boolean
  onFieldChange: (field: InitialWorkloadFormField, value: string) => void
  onSubmit: () => void
}

export function InitialWorkloadForm({ hours, minutes, effectiveFrom, observation, minDate, isSubmitting, onFieldChange, onSubmit }: InitialWorkloadFormProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <section className="rounded-2xl border ui-border p-5" aria-labelledby="workload-form-title">
      <h2 id="workload-form-title" className="text-lg font-extrabold ui-heading">Cadastrar carga diária inicial</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-bold ui-text">Nova carga diária</legend>
          <div className="mt-2 flex max-w-sm gap-3">
            <label className="flex-1 text-sm ui-text-muted">
              Horas
              <input aria-label="Horas da carga diária" type="number" min="0" max="24" inputMode="numeric" value={hours} onChange={(event) => onFieldChange('hours', event.target.value)} className="mt-1 w-full ui-field rounded-xl px-3 py-2.5 ui-text" required />
            </label>
            <label className="flex-1 text-sm ui-text-muted">
              Minutos
              <input aria-label="Minutos da carga diária" type="number" min="0" max="59" inputMode="numeric" value={minutes} onChange={(event) => onFieldChange('minutes', event.target.value)} className="mt-1 w-full ui-field rounded-xl px-3 py-2.5 ui-text" required />
            </label>
          </div>
        </fieldset>
        <label htmlFor="workload-effective-from" className="text-sm font-bold ui-text">
          Início de vigência
          <input id="workload-effective-from" type="date" min={minDate} value={effectiveFrom} onChange={(event) => onFieldChange('effectiveFrom', event.target.value)} className="mt-2 w-full ui-field rounded-xl px-3 py-2.5 font-normal ui-text" required />
        </label>
        <label htmlFor="workload-observation" className="text-sm font-bold ui-text">
          Observação
          <textarea id="workload-observation" value={observation} onChange={(event) => onFieldChange('observation', event.target.value)} className="mt-2 min-h-24 w-full ui-field rounded-xl px-3 py-2.5 font-normal ui-text" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={isSubmitting} className="rounded-xl ui-button-primary px-5 py-3 text-sm font-bold disabled:cursor-wait disabled:opacity-60">
            {isSubmitting ? 'Salvando…' : 'Cadastrar carga'}
          </button>
        </div>
      </form>
    </section>
  )
}
