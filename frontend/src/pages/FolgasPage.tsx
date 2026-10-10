import { useState } from 'react'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'
import { PageContainer } from '../shared/ui/PageContainer'
import { addDays } from '../shared/lib/date'
import { TimeOffRequestForm } from '../features/time-off/TimeOffRequestForm'
import { TimeOffRequestList } from '../features/time-off/TimeOffRequestList'
import { useTimeOffRequests } from '../features/time-off/useTimeOffRequests'
import type { TimeOffRequest } from '../features/time-off/types'
import { fieldClassName } from '../features/time-entries/TimeEntryFields'

export function FolgasPage() {
  const controller = useTimeOffRequests()
  const [removeTarget, setRemoveTarget] = useState<TimeOffRequest | null>(null)
  const [cancelTarget, setCancelTarget] = useState<TimeOffRequest | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  return (
    <PageContainer title="Ausências" description="Registre folgas, férias, atestados médicos e outras ausências futuras para validação da supervisão da sua squad." contained={false}>
      <div className="space-y-6">
        <TimeOffRequestForm
          absenceType={controller.absenceType}
          startDate={controller.startDate}
          endDate={controller.endDate}
          reason={controller.reason}
          minDate={addDays(controller.today, 1)}
          isSubmitting={controller.isSubmitting}
          onAbsenceTypeChange={controller.setAbsenceType}
          onStartDateChange={controller.setStartDate}
          onEndDateChange={controller.setEndDate}
          onReasonChange={controller.setReason}
          onSubmit={() => void controller.create()}
        />
        {controller.feedback && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">{controller.feedback}</p>}
        {controller.error && <div role="alert" className="ui-alert-danger rounded-xl p-4 text-sm"><p>{controller.error}</p><button type="button" onClick={() => void controller.reload()} className="mt-2 font-bold underline">Tentar novamente</button></div>}
        {controller.isLoading ? <p aria-live="polite" className="rounded-2xl ui-surface p-8 text-center">Carregando ausências…</p> : <TimeOffRequestList requests={controller.requests} today={controller.today} onRemovePending={setRemoveTarget} onCancelApproved={setCancelTarget} />}
      </div>
      <ConfirmDialog open={Boolean(removeTarget)} title="Excluir solicitação pendente?" description="A solicitação será retirada, preservada na auditoria e não seguirá para aprovação." confirmLabel="Excluir solicitação" onCancel={() => setRemoveTarget(null)} onConfirm={() => { if (removeTarget) void controller.removePending(removeTarget).then(() => setRemoveTarget(null)) }} />
      <ConfirmDialog open={Boolean(cancelTarget)} title="Cancelar ausência aprovada?" description="A solicitação será atualizada e a supervisão será notificada." confirmLabel="Cancelar ausência" onCancel={() => { setCancelTarget(null); setCancelReason('') }} onConfirm={() => { if (cancelTarget && cancelReason.trim()) void controller.cancelApproved(cancelTarget, cancelReason).then(() => { setCancelTarget(null); setCancelReason('') }) }}>
        <label htmlFor="time-off-cancel-reason" className="text-sm font-bold ui-text">Motivo do cancelamento</label><textarea id="time-off-cancel-reason" rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className={fieldClassName} />
      </ConfirmDialog>
    </PageContainer>
  )
}
