import { useEffect, useRef, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCorporateToday } from '../../shared/utils/date'
import { FieldError, fieldClassName, TimeEntryFields } from './TimeEntryFields'
import { useTimeEntryForm } from './useTimeEntryForm'
import { LdSection } from '../document-list/LdSection'
import { CreateRdoButton } from '../rdo/CreateRdoButton'
import { SignaturePad } from '../../components/SignaturePad'

export function TimeEntryForm({ entryId }: { entryId?: string }) {
  const [searchParams] = useSearchParams()
  const formRef = useRef<HTMLFormElement>(null)
  const controller = useTimeEntryForm({
    initialDate: searchParams.get('date') ?? getCorporateToday(),
    entryId,
    duplicateId: entryId ? undefined : searchParams.get('duplicate') ?? undefined,
  })

  useEffect(() => {
    if (Object.keys(controller.errors).length === 0 && !controller.editReasonError) return
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }, [controller.editReasonError, controller.errors])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await controller.submit()
  }

  if (controller.isLoading) return <p aria-live="polite" className="text-sm font-semibold ui-text-muted">Carregando apontamento…</p>

  const submitLabel = controller.mode === 'EDIT' ? 'Salvar alterações' : controller.mode === 'DUPLICATE' ? 'Salvar duplicação' : 'Salvar apontamento'

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
      {controller.successMessage && (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <p className="font-bold">{controller.successMessage}</p>
          <Link className="mt-2 inline-block font-bold underline" to={`/colaborador?date=${controller.values.startDate}`}>Ver resumo atualizado do período</Link>
        </div>
      )}
      {controller.submitError && <p role="alert" className="ui-alert-danger rounded-xl p-4 text-sm font-semibold">{controller.submitError}</p>}

      {controller.mode === 'CREATE' && (
        <section className="flex flex-col gap-3 rounded-xl border ui-border ui-surface-subtle p-4 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="reuse-last-entry-title">
          <div>
            <h2 id="reuse-last-entry-title" className="font-bold ui-heading">Apontamento recorrente</h2>
            <p className="mt-1 text-sm ui-text-muted">Dados de identificação serão preenchidos; data, duração e detalhamento permanecem para revisão.</p>
          </div>
          <button type="button" onClick={() => void controller.reuseLastEntry()} disabled={controller.isReusingLastEntry} className="shrink-0 rounded-xl border ui-border px-4 py-2.5 text-sm font-bold ui-text hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60">
            {controller.isReusingLastEntry ? 'Carregando…' : 'Usar último apontamento'}
          </button>
          {controller.reuseLastEntryMessage && <p role="status" className="text-sm font-semibold ui-text-muted sm:col-span-2">{controller.reuseLastEntryMessage}</p>}
        </section>
      )}

      <LdSection selected={controller.values.ldDocument} onSelect={controller.selectLdDocument} onClear={controller.clearLdDocument} />
      <FieldError id="ld-document-error" message={controller.errors.ldDocument} />
      <TimeEntryFields values={controller.values} errors={controller.errors} maxDate={getCorporateToday()} allowBatchMode={controller.mode === 'CREATE'} onChange={controller.setField} />

      <fieldset>
        <legend className="text-sm font-bold ui-text">Duração em horas e minutos</legend>
        <p className="mt-1 text-xs ui-text-subtle">Exemplos: 00h30, 01h15 ou 08h00.</p>
        <div className="mt-2 grid max-w-sm grid-cols-2 gap-3">
          <div>
            <label htmlFor="duration-hours" className="text-xs font-semibold ui-text-muted">Horas</label>
            <input id="duration-hours" name="hours" type="number" min="0" max="24" step="1" inputMode="numeric" value={controller.values.hours} onChange={(event) => controller.setField('hours', event.target.value)} className={fieldClassName} aria-invalid={Boolean(controller.errors.durationMinutes)} aria-describedby={controller.errors.durationMinutes ? 'duration-error' : undefined} />
          </div>
          <div>
            <label htmlFor="duration-minutes" className="text-xs font-semibold ui-text-muted">Minutos</label>
            <input id="duration-minutes" name="minutes" type="number" min="0" max="59" step="1" inputMode="numeric" value={controller.values.minutes} onChange={(event) => controller.setField('minutes', event.target.value)} className={fieldClassName} aria-invalid={Boolean(controller.errors.durationMinutes)} aria-describedby={controller.errors.durationMinutes ? 'duration-error' : undefined} />
          </div>
        </div>
        <FieldError id="duration-error" message={controller.errors.durationMinutes} />
      </fieldset>

      <div>
        <label htmlFor="details" className="text-sm font-bold ui-text">Detalhamento das atividades</label>
        <textarea id="details" name="details" rows={5} value={controller.values.details} onChange={(event) => controller.setField('details', event.target.value)} className={fieldClassName} placeholder="Descreva objetivamente o trabalho realizado" aria-invalid={Boolean(controller.errors.details)} aria-describedby={controller.errors.details ? 'details-error' : 'details-help'} />
        <p id="details-help" className="mt-1.5 text-xs ui-text-subtle">Opcional. Não inclua senhas, dados pessoais ou informações sensíveis.</p>
        <FieldError id="details-error" message={controller.errors.details} />
      </div>

      {controller.mode === 'EDIT' && (
        <div>
          <label htmlFor="edit-reason" className="text-sm font-bold ui-text">Motivo da edição</label>
          <textarea id="edit-reason" name="editReason" rows={3} value={controller.values.editReason} onChange={(event) => controller.setField('editReason', event.target.value)} className={fieldClassName} aria-invalid={Boolean(controller.editReasonError)} aria-describedby={controller.editReasonError ? 'edit-reason-error' : undefined} />
          <FieldError id="edit-reason-error" message={controller.editReasonError} />
        </div>
      )}

      <SignaturePad value={controller.values.signatureBase64} disabled={controller.isSubmitting} onChange={(signature) => controller.setField('signatureBase64', signature)} />

      <div className="flex flex-col-reverse gap-3 border-t ui-border pt-5 sm:flex-row sm:justify-end">
        <Link to="/colaborador/historico" className="rounded-xl border ui-border px-5 py-3 text-center text-sm font-bold ui-text hover:bg-[var(--color-surface-subtle)]">Voltar ao histórico</Link>
        <button type="submit" disabled={controller.isSubmitting} className="rounded-xl ui-button-primary px-6 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">
          {controller.isSubmitting ? 'Salvando…' : submitLabel}
        </button>
      </div>
      <CreateRdoButton values={controller.values} />
    </form>
  )
}
