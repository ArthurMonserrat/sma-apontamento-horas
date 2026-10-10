import type { ChangeEvent, FormEvent } from 'react'
import { demoActivities } from '../../demo/fixtures/demoData'
import { fieldClassName } from '../time-entries/TimeEntryFields'
import type { HistoryFiltersValue } from './useTimeEntryHistory'

type HistoryFiltersProps = {
  value: HistoryFiltersValue
  onChange: (value: HistoryFiltersValue) => void
  onApply: () => void
}

export function HistoryFilters({ value, onChange, onApply }: HistoryFiltersProps) {
  const set = <Key extends keyof HistoryFiltersValue>(key: Key, next: HistoryFiltersValue[Key]) => onChange({ ...value, [key]: next })
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onApply()
  }
  const handleModeChange = (event: ChangeEvent<HTMLSelectElement>) => set('mode', event.target.value as HistoryFiltersValue['mode'])
  const handleMonthChange = (event: ChangeEvent<HTMLInputElement>) => set('month', event.target.value)
  const handleDayChange = (event: ChangeEvent<HTMLInputElement>) => set('day', event.target.value)
  const handleStartDateChange = (event: ChangeEvent<HTMLInputElement>) => set('startDate', event.target.value)
  const handleEndDateChange = (event: ChangeEvent<HTMLInputElement>) => set('endDate', event.target.value)
  const handleClientChange = (event: ChangeEvent<HTMLInputElement>) => set('clientName', event.target.value)
  const handleProjectChange = (event: ChangeEvent<HTMLInputElement>) => set('projectCode', event.target.value)
  const handleActivityChange = (event: ChangeEvent<HTMLSelectElement>) => set('activityId', event.target.value)
  const handleDisciplineChange = (event: ChangeEvent<HTMLSelectElement>) => set('disciplineCode', event.target.value as HistoryFiltersValue['disciplineCode'])
  const handleDocumentTypeChange = (event: ChangeEvent<HTMLSelectElement>) => set('documentTypeCode', event.target.value as HistoryFiltersValue['documentTypeCode'])
  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => set('status', event.target.value as HistoryFiltersValue['status'])

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border ui-border ui-surface p-5 md:grid-cols-2 xl:grid-cols-4" aria-label="Filtros do histórico">
      <div>
        <label htmlFor="history-mode" className="text-sm font-bold ui-text">Período</label>
        <select id="history-mode" value={value.mode} onChange={handleModeChange} className={fieldClassName}>
          <option value="MONTH">Mês</option><option value="DAY">Dia específico</option><option value="RANGE">Intervalo</option><option value="ALL">Todos disponíveis</option>
        </select>
      </div>
      {value.mode === 'MONTH' && <div><label htmlFor="history-month" className="text-sm font-bold ui-text">Mês</label><input id="history-month" type="month" value={value.month} onChange={handleMonthChange} className={fieldClassName} /></div>}
      {value.mode === 'DAY' && <div><label htmlFor="history-day" className="text-sm font-bold ui-text">Data</label><input id="history-day" type="date" value={value.day} onChange={handleDayChange} className={fieldClassName} /></div>}
      {value.mode === 'RANGE' && <><div><label htmlFor="history-start" className="text-sm font-bold ui-text">Data inicial</label><input id="history-start" type="date" value={value.startDate} onChange={handleStartDateChange} className={fieldClassName} /></div><div><label htmlFor="history-end" className="text-sm font-bold ui-text">Data final</label><input id="history-end" type="date" value={value.endDate} onChange={handleEndDateChange} className={fieldClassName} /></div></>}
      <div><label htmlFor="history-client" className="text-sm font-bold ui-text">Cliente</label><input id="history-client" type="search" value={value.clientName} onChange={handleClientChange} className={fieldClassName} placeholder="Buscar pelo nome" /></div>
      <div><label htmlFor="history-project" className="text-sm font-bold ui-text">Número da contratada</label><input id="history-project" value={value.projectCode} onChange={handleProjectChange} className={fieldClassName} /></div>
      <div><label htmlFor="history-activity" className="text-sm font-bold ui-text">Atividade</label><select id="history-activity" value={value.activityId} onChange={handleActivityChange} className={fieldClassName}><option value="">Todas</option>{demoActivities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></div>
      <div><label htmlFor="history-discipline" className="text-sm font-bold ui-text">Disciplina</label><select id="history-discipline" value={value.disciplineCode} onChange={handleDisciplineChange} className={fieldClassName}><option value="">Todas</option><option value="—">Não se aplica</option><option value="A">Automação</option><option value="E">Elétrica</option><option value="G">Geral</option><option value="M">Mecânica</option></select></div>
      <div><label htmlFor="history-document-type" className="text-sm font-bold ui-text">Tipo de documento</label><select id="history-document-type" value={value.documentTypeCode} onChange={handleDocumentTypeChange} className={fieldClassName}><option value="">Todos</option>{['—', 'RN', 'GR', 'G', 'FD', 'DE', 'LM', 'DI', 'LC', 'LI', 'ET', 'MC', 'MO', 'MD', 'FG', 'LA', 'ES', 'CF'].map((code) => <option key={code} value={code}>{code === '—' ? 'Não se aplica' : code}</option>)}</select></div>
      <div><label htmlFor="history-status" className="text-sm font-bold ui-text">Situação do apontamento</label><select id="history-status" value={value.status} onChange={handleStatusChange} className={fieldClassName}><option value="ACTIVE">Somente ativos</option><option value="CANCELLED">Somente cancelados</option><option value="ALL">Todos</option></select></div>
      <div className="flex items-end"><button type="submit" className="w-full rounded-xl ui-button-primary px-4 py-3 text-sm font-bold">Aplicar filtros</button></div>
    </form>
  )
}
