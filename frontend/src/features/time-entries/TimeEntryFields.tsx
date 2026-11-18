import { demoActivities } from '../../demo/fixtures/demoData'
import type { TimeEntryValidationErrors } from './types'
import type { TimeEntryFormValues } from './useTimeEntryForm'

export const fieldClassName = 'mt-2 w-full ui-field rounded-xl px-3 py-2.5 text-base ui-text shadow-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-subtle)]'

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null
  return <p id={id} className="mt-1.5 text-sm font-medium ui-text-danger">{message}</p>
}

type TimeEntryFieldsProps = {
  values: TimeEntryFormValues
  errors: TimeEntryValidationErrors
  maxDate: string
  allowBatchMode?: boolean
  onChange: <Key extends keyof TimeEntryFormValues>(field: Key, value: TimeEntryFormValues[Key]) => void
}

export function TimeEntryFields({ values, errors, maxDate, allowBatchMode = true, onChange }: TimeEntryFieldsProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="entry-start-date" className="text-sm font-bold ui-text">Data Inicial</label>
            <input id="entry-start-date" name="startDate" type="date" max={maxDate} value={values.startDate} onChange={(event) => onChange('startDate', event.target.value)} className={fieldClassName} aria-invalid={Boolean(errors.entryDate)} aria-describedby={errors.entryDate ? 'entry-start-date-error' : undefined} />
            <FieldError id="entry-start-date-error" message={errors.entryDate} />
          </div>
          <div>
            <label htmlFor="entry-end-date" className="text-sm font-bold ui-text">Data Final</label>
            <input id="entry-end-date" name="endDate" type="date" min={values.startDate} max={maxDate} value={values.endDate} onChange={(event) => onChange('endDate', event.target.value)} className={fieldClassName} disabled={!allowBatchMode} />
          </div>
        </div>
        <label className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold ui-text ${allowBatchMode ? '' : 'opacity-60'}`}>
          <input type="checkbox" checked={values.weekdaysOnly} onChange={(event) => onChange('weekdaysOnly', event.target.checked)} disabled={!allowBatchMode} className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] accent-[var(--color-primary)]" />
          Somente dias úteis
        </label>
      </div>

      <div>
        <label htmlFor="contractor-number" className="text-sm font-bold ui-text">Número da contratada</label>
        <input id="contractor-number" name="contractorNumber" maxLength={80} value={values.contractorNumber ?? ''} onChange={(event) => onChange('contractorNumber', event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={fieldClassName} aria-invalid={Boolean(errors.contractorNumber)} aria-describedby={errors.contractorNumber ? 'contractor-number-error' : undefined} />
        <FieldError id="contractor-number-error" message={errors.contractorNumber} />
      </div>

      <div>
        <label htmlFor="activity" className="text-sm font-bold ui-text">Atividade realizada</label>
        <select id="activity" name="activityId" value={values.activityId} onChange={(event) => onChange('activityId', event.target.value)} className={fieldClassName} aria-invalid={Boolean(errors.activityId)} aria-describedby={errors.activityId ? 'activity-error' : undefined}>
          <option value="">Selecione uma atividade</option>
          {demoActivities.filter((activity) => activity.active).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
        </select>
        <FieldError id="activity-error" message={errors.activityId} />
      </div>

      <div>
        <label htmlFor="primary-code" className="text-sm font-bold ui-text">Código primário</label>
        <input id="primary-code" name="primaryCode" maxLength={160} value={values.primaryCode} onChange={(event) => onChange('primaryCode', event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={fieldClassName} aria-invalid={Boolean(errors.primaryCode)} aria-describedby={errors.primaryCode ? 'primary-code-error' : undefined} />
        <FieldError id="primary-code-error" message={errors.primaryCode} />
      </div>

      <div>
        <label htmlFor="secondary-code" className="text-sm font-bold ui-text">Código secundário</label>
        <input id="secondary-code" name="secondaryCode" maxLength={160} value={values.secondaryCode} onChange={(event) => onChange('secondaryCode', event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={fieldClassName} aria-invalid={Boolean(errors.secondaryCode)} aria-describedby={errors.secondaryCode ? 'secondary-code-error' : undefined} />
        <FieldError id="secondary-code-error" message={errors.secondaryCode} />
      </div>
    </div>
  )
}
