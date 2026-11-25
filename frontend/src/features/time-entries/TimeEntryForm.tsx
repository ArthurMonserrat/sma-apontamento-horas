import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatDatePtBr, getCorporateToday } from '../../shared/lib/date'
import { FieldError, fieldClassName, TimeEntryFields } from './TimeEntryFields'
import { useTimeEntryForm } from './useTimeEntryForm'
import { CreateRdoButton } from '../rdo/CreateRdoButton'
import { parseRdo, type ParsedRdoDay } from '../rdo/rdoParser'
import { useSession } from '../session/useSession'

export function TimeEntryForm({ entryId }: { entryId?: string }) {
  const [searchParams] = useSearchParams()
  const formRef = useRef<HTMLFormElement>(null)
  const { profile } = useSession()
  const [rdoDays, setRdoDays] = useState<ParsedRdoDay[]>([])
  const [rdoStatus, setRdoStatus] = useState<'idle' | 'reading' | 'success' | 'error'>('idle')
  const [rdoMessage, setRdoMessage] = useState<string | null>(null)
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
    const saved = await controller.submit(rdoDays)
    if (saved) {
      setRdoDays([])
      setRdoMessage(null)
      setRdoStatus('idle')
    }
  }

  const handleRdoImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setRdoStatus('reading')
    setRdoMessage('Lendo PDF localmente…')
    try {
      const parsed = await parseRdo(file, { collaboratorName: profile?.name })
      if (parsed.aviso) {
        setRdoDays([])
        setRdoStatus('error')
        setRdoMessage(parsed.aviso)
        return
      }
      if (parsed.dias.length === 0) {
        setRdoDays([])
        setRdoStatus('error')
        setRdoMessage('Não foi possível encontrar dias com horas no RDO informado.')
        return
      }
      const orderedDays = [...parsed.dias].sort((left, right) => left.data.localeCompare(right.data))
      const firstDay = orderedDays[0]
      const lastDay = orderedDays.at(-1) ?? firstDay
      setRdoDays(orderedDays)
      controller.setField('startDate', firstDay.data)
      controller.setField('endDate', lastDay.data)
      controller.setField('weekdaysOnly', false)
      controller.setField('hours', String(firstDay.horas))
      controller.setField('minutes', String(firstDay.minutos))
      controller.setField('details', firstDay.detalhamento)
      if (parsed.numeroObra) controller.setField('contractorNumber', parsed.numeroObra)
      setRdoStatus('success')
      setRdoMessage(`${orderedDays.length} dia(s) lido(s). Revise a atividade e os dados antes de salvar.`)
    } catch (error) {
      setRdoStatus('error')
      setRdoMessage(error instanceof Error ? error.message : 'Não foi possível ler o PDF informado.')
    }
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
            <p className="mt-1 text-sm ui-text-muted">Dados de identificação serão preenchidos; data e detalhamento permanecem para revisão.</p>
          </div>
          <button type="button" onClick={() => void controller.reuseLastEntry()} disabled={controller.isReusingLastEntry} className="shrink-0 rounded-xl border ui-border px-4 py-2.5 text-sm font-bold ui-text hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60">
            {controller.isReusingLastEntry ? 'Carregando…' : 'Usar último apontamento'}
          </button>
          {controller.reuseLastEntryMessage && <p role="status" className="text-sm font-semibold ui-text-muted sm:col-span-2">{controller.reuseLastEntryMessage}</p>}
        </section>
      )}

      <TimeEntryFields values={controller.values} errors={controller.errors} maxDate={getCorporateToday()} allowBatchMode={controller.mode === 'CREATE'} dateFieldsLocked={rdoDays.length > 0} onChange={controller.setField} />

      {controller.mode === 'CREATE' && (
        <section className="rounded-2xl border ui-border ui-surface-subtle p-4" aria-labelledby="rdo-import-title">
          <label id="rdo-import-title" htmlFor="rdo-upload" className="text-sm font-bold ui-text">Importar arquivo RDO para preenchimento automático</label>
          <input id="rdo-upload" name="rdoUpload" type="file" accept=".pdf,application/pdf" onChange={(event) => void handleRdoImport(event)} disabled={rdoStatus === 'reading'} className={`${fieldClassName} file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[#06241f] disabled:opacity-60`} />
          <p className="mt-2 text-xs ui-text-subtle">O PDF é lido apenas neste navegador para preencher os campos. O arquivo não é salvo nem enviado.</p>
          {rdoMessage && <p className={`mt-2 text-sm font-semibold ${rdoStatus === 'error' ? 'ui-text-danger' : 'ui-accent'}`} role={rdoStatus === 'error' ? 'alert' : 'status'}>{rdoMessage}</p>}
          {rdoDays.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Dias importados do RDO">
              {rdoDays.map((day) => <li key={day.data} className="rounded-lg border ui-border ui-surface px-3 py-2 text-sm"><strong>{formatDatePtBr(day.data)}</strong><span className="ml-2 ui-text-muted">{String(day.horas).padStart(2, '0')}:{String(day.minutos).padStart(2, '0')}</span><p className="mt-1 ui-text-muted">{day.detalhamento}</p></li>)}
            </ul>
          )}
        </section>
      )}

      <div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="start-time" className="text-sm font-bold ui-text">Hora de início</label>
            <input id="start-time" name="startTime" type="time" value={controller.values.startTime} onChange={(event) => controller.setField('startTime', event.target.value)} className={fieldClassName} aria-invalid={Boolean(controller.errors.startTime)} aria-describedby={controller.errors.startTime ? 'start-time-error' : undefined} />
          </div>
          <div>
            <label htmlFor="end-time" className="text-sm font-bold ui-text">Hora de fim</label>
            <input id="end-time" name="endTime" type="time" value={controller.values.endTime} onChange={(event) => controller.setField('endTime', event.target.value)} className={fieldClassName} aria-invalid={Boolean(controller.errors.startTime)} aria-describedby={controller.errors.startTime ? 'start-time-error' : undefined} />
          </div>
        </div>
        <p className="mt-2 text-xs ui-text-subtle">Esses horários são usados na geração do RDO e são opcionais no apontamento.</p>
        <FieldError id="start-time-error" message={controller.errors.startTime} />
      </div>

      <div>
        <label htmlFor="details" className="text-sm font-bold ui-text">Detalhamento das atividades</label>
        <textarea id="details" name="details" rows={5} value={controller.values.details} onChange={(event) => controller.setField('details', event.target.value)} className={fieldClassName} placeholder="Descreva objetivamente o trabalho realizado" aria-invalid={Boolean(controller.errors.details)} aria-describedby={controller.errors.details ? 'details-error' : 'details-help'} />
        <p id="details-help" className="mt-1.5 text-xs ui-text-subtle">Opcional. Não inclua senhas, dados pessoais ou informações sensíveis.</p>
        <FieldError id="details-error" message={controller.errors.details} />
      </div>

      <div>
        <label htmlFor="funcao-contrato" className="text-sm font-bold ui-text">Função do profissional de acordo com o contrato do cliente final</label>
        <input id="funcao-contrato" name="funcaoContrato" maxLength={160} value={controller.values.funcaoContrato} onChange={(event) => controller.setField('funcaoContrato', event.target.value)} className={fieldClassName} placeholder="Informe a função conforme o contrato" aria-invalid={Boolean(controller.errors.funcaoContrato)} aria-describedby={controller.errors.funcaoContrato ? 'funcao-contrato-error' : 'funcao-contrato-help'} />
        <p id="funcao-contrato-help" className="mt-1.5 text-xs ui-text-subtle">Preencha a categoria conforme o contrato ou a orientação do gestor.</p>
        <FieldError id="funcao-contrato-error" message={controller.errors.funcaoContrato} />
      </div>

      {controller.mode === 'EDIT' && (
        <div>
          <label htmlFor="edit-reason" className="text-sm font-bold ui-text">Motivo da edição</label>
          <textarea id="edit-reason" name="editReason" rows={3} value={controller.values.editReason} onChange={(event) => controller.setField('editReason', event.target.value)} className={fieldClassName} aria-invalid={Boolean(controller.editReasonError)} aria-describedby={controller.editReasonError ? 'edit-reason-error' : undefined} />
          <FieldError id="edit-reason-error" message={controller.editReasonError} />
        </div>
      )}

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
