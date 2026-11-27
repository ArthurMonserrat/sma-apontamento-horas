import { useState, type KeyboardEvent } from 'react'
import { demoActivities } from '../../demo/fixtures/demoData'
import type { TimeEntryValidationErrors } from './types'
import type { TimeEntryFormValues } from './useTimeEntryForm'
import { filterProjectCatalog, formatProjectCatalogLabel, type ProjectCatalogItem } from './infrastructure/projectCatalog'

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
  dateFieldsLocked?: boolean
  projectCatalog?: ProjectCatalogItem[]
  projectCodes?: string[]
  projectLoadError?: string | null
  onChange: <Key extends keyof TimeEntryFormValues>(field: Key, value: TimeEntryFormValues[Key]) => void
}

function ProjectPicker({ values, errors, projectCatalog, projectCodes, projectLoadError, onChange }: Pick<TimeEntryFieldsProps, 'values' | 'errors' | 'projectCatalog' | 'projectCodes' | 'projectLoadError' | 'onChange'>) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const projects = projectCatalog ?? projectCodes?.map((code) => ({ code, title: null })) ?? []
  const selected = projects.find((project) => project.code === values.contractorNumber)
  const currentValue = values.contractorNumber ?? ''
  const filtered = filterProjectCatalog(projects, query)
  const choose = (project: ProjectCatalogItem) => {
    onChange('contractorNumber', project.code)
    setQuery('')
    setIsOpen(false)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIsOpen(true) }
    if (event.key === 'Escape') { event.preventDefault(); setQuery(''); setIsOpen(false) }
    if (event.key === 'Enter' && isOpen && filtered[0]) { event.preventDefault(); choose(filtered[0]) }
  }
  const displayValue = isOpen ? query : selected ? formatProjectCatalogLabel(selected) : currentValue

  return <div className="relative">
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 ui-text-subtle">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
      </span>
      <input id="project-code" name="projectCode" role="combobox" aria-label="Pesquisar projetos" aria-autocomplete="list" aria-expanded={isOpen} aria-controls="project-code-options" maxLength={80} value={displayValue} onFocus={() => { setIsOpen(true); setQuery('') }} onChange={(event) => { setQuery(event.target.value); onChange('contractorNumber', event.target.value); setIsOpen(true) }} onKeyDown={handleKeyDown} onBlur={() => globalThis.setTimeout(() => setIsOpen(false), 120)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={`${fieldClassName} pl-9 pr-11`} placeholder="Pesquisar código ou título" aria-invalid={Boolean(errors.contractorNumber)} aria-describedby={errors.contractorNumber ? 'project-code-error' : 'project-code-help'} disabled={Boolean(projectLoadError)} />
      <button type="button" aria-label="Abrir lista de projetos" onMouseDown={(event) => event.preventDefault()} onClick={() => { setIsOpen((current) => !current); setQuery('') }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 ui-text-subtle hover:bg-[var(--color-surface-subtle)]" disabled={Boolean(projectLoadError)}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
    <div id="project-code-options" role="listbox" hidden={!isOpen} className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border ui-border ui-surface p-1 shadow-lg">
      {filtered.length === 0 ? <p className="px-3 py-2 text-sm ui-text-subtle">Nenhum projeto encontrado.</p> : filtered.map((project) => <button key={project.code} type="button" role="option" aria-selected={project.code === currentValue} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(project)} className="block w-full rounded-lg px-3 py-2 text-left text-sm ui-text hover:bg-[var(--color-surface-subtle)]">{formatProjectCatalogLabel(project)}</button>)}
      {projects.length > filtered.length && <p className="px-3 py-2 text-xs ui-text-subtle">Digite para filtrar mais projetos.</p>}
    </div>
  </div>
}

export function TimeEntryFields({ values, errors, maxDate, allowBatchMode = true, dateFieldsLocked = false, projectCatalog, projectCodes, projectLoadError, onChange }: TimeEntryFieldsProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="entry-start-date" className="text-sm font-bold ui-text">Data Inicial</label>
            <input id="entry-start-date" name="startDate" type="date" max={maxDate} value={values.startDate} onChange={(event) => onChange('startDate', event.target.value)} className={fieldClassName} disabled={dateFieldsLocked} aria-invalid={Boolean(errors.entryDate)} aria-describedby={errors.entryDate ? 'entry-start-date-error' : undefined} />
            <FieldError id="entry-start-date-error" message={errors.entryDate} />
          </div>
          <div>
            <label htmlFor="entry-end-date" className="text-sm font-bold ui-text">Data Final</label>
            <input id="entry-end-date" name="endDate" type="date" min={values.startDate} value={values.endDate} onChange={(event) => onChange('endDate', event.target.value)} className={fieldClassName} disabled={!allowBatchMode || dateFieldsLocked} />
          </div>
        </div>
        <p className="mt-2 text-xs ui-text-subtle">
          Se a data final for diferente, o sistema criará automaticamente lançamentos individuais para cada dia do período.
        </p>
        <label className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold ui-text ${allowBatchMode ? '' : 'opacity-60'}`}>
          <input type="checkbox" checked={values.weekdaysOnly} onChange={(event) => onChange('weekdaysOnly', event.target.checked)} disabled={!allowBatchMode || dateFieldsLocked} className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] accent-[var(--color-primary)]" />
          Somente dias úteis
        </label>
      </div>

      <div>
        <label htmlFor="project-code" className="text-sm font-bold ui-text">Número do projeto / obra</label>
        {projectCatalog || projectCodes ? <ProjectPicker values={values} errors={errors} projectCatalog={projectCatalog} projectCodes={projectCodes} projectLoadError={projectLoadError} onChange={onChange} /> : (
          <input id="project-code" name="projectCode" maxLength={80} value={values.contractorNumber ?? ''} onChange={(event) => onChange('contractorNumber', event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={fieldClassName} placeholder="Digite o número do projeto ou da obra" aria-invalid={Boolean(errors.contractorNumber)} aria-describedby={errors.contractorNumber ? 'project-code-error' : 'project-code-help'} />
        )}
        {projectLoadError ? <p role="alert" className="mt-1.5 text-xs ui-text-danger">{projectLoadError}</p> : <p id="project-code-help" className="mt-1.5 text-xs ui-text-subtle">{projectCatalog || projectCodes ? 'Pesquise pelo código ou título do projeto sincronizado.' : 'Informe o projeto ou a obra vinculada ao apontamento.'}</p>}
        <FieldError id="project-code-error" message={errors.contractorNumber} />
      </div>

      <div>
        <label htmlFor="activity" className="text-sm font-bold ui-text">Atividade realizada</label>
        <select id="activity" name="activityId" value={values.activityId} onChange={(event) => onChange('activityId', event.target.value)} className={fieldClassName} aria-invalid={Boolean(errors.activityId)} aria-describedby={errors.activityId ? 'activity-error' : undefined}>
          <option value="">Selecione uma atividade</option>
          {demoActivities.filter((activity) => activity.active).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
        </select>
        <FieldError id="activity-error" message={errors.activityId} />
      </div>

    </div>
  )
}
