import { useEffect, useMemo, useState } from 'react'
import { FieldError, fieldClassName } from '../time-entries/TimeEntryFields'
import { projectService, type ProjectService } from './infrastructure/projectService'
import { activitiesForPerson, projectActivityLabel, type Project } from './types'

type Props = {
  personId: string
  projectId: string
  projectActivityId: string
  error?: string
  onSelectProject: (project: Project | null, hasActivities: boolean) => void
  onSelectActivity: (activityId: string) => void
  service?: ProjectService
}

/**
 * Projeto e atividade do apontamento (projetos cadastrados pela diretoria).
 * Mostra só as atividades da pessoa e as sem executor. Escolher o projeto preenche cliente e número.
 */
export function ProjectEntryFields({ personId, projectId, projectActivityId, error, onSelectProject, onSelectActivity, service = projectService }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    service.list()
      .then((loaded) => { if (active) { setProjects(loaded); setLoadError(null) } })
      .catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Não foi possível carregar os projetos.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [service])

  // Projetos que a pessoa pode usar: com atividade dela/sem executor, ou sem atividades.
  const available = useMemo(() => projects.filter((project) => {
    const activeActivities = project.activities.filter((activity) => activity.active)
    return activeActivities.length === 0 || activitiesForPerson(project, personId).length > 0 || project.id === projectId
  }), [projects, personId, projectId])
  const selected = projects.find((project) => project.id === projectId) ?? null
  const activities = selected ? activitiesForPerson(selected, personId) : []
  const currentActivityMissing = Boolean(projectActivityId) && !activities.some((activity) => activity.id === projectActivityId)
  const currentActivity = currentActivityMissing ? selected?.activities.find((activity) => activity.id === projectActivityId) : undefined

  if (!isLoading && !loadError && projects.length === 0) return null

  return (
    <section aria-labelledby="entry-project-title" className="grid gap-4 rounded-xl border ui-border ui-surface-subtle p-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <h2 id="entry-project-title" className="font-bold ui-heading">Projeto</h2>
        <p className="mt-1 text-sm ui-text-muted">Escolha o projeto cadastrado pela diretoria. Cliente e número da contratada são preenchidos automaticamente.</p>
        {loadError && <p role="alert" className="mt-2 text-sm font-semibold ui-text-danger">{loadError}</p>}
      </div>
      <div>
        <label htmlFor="entry-project" className="text-sm font-bold ui-text">Projeto</label>
        <select
          id="entry-project"
          value={projectId}
          disabled={isLoading}
          onChange={(event) => {
            const project = projects.find((item) => item.id === event.target.value) ?? null
            onSelectProject(project, project ? activitiesForPerson(project, personId).length > 0 : false)
          }}
          className={fieldClassName}
        >
          <option value="">{isLoading ? 'Carregando projetos…' : 'Sem projeto'}</option>
          {available.map((project) => <option key={project.id} value={project.id}>{project.code}{project.description ? ` — ${project.description}` : ''} ({project.client})</option>)}
          {projectId && !selected && !isLoading && <option value={projectId}>Projeto inativo</option>}
        </select>
      </div>
      <div>
        <label htmlFor="entry-project-activity" className="text-sm font-bold ui-text">Atividade do projeto</label>
        <select
          id="entry-project-activity"
          value={projectActivityId}
          disabled={!selected || (activities.length === 0 && !currentActivityMissing)}
          onChange={(event) => onSelectActivity(event.target.value)}
          className={fieldClassName}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'entry-project-activity-error' : undefined}
        >
          <option value="">{!selected ? 'Escolha o projeto' : activities.length === 0 ? 'Projeto sem atividades para você' : 'Selecione a atividade'}</option>
          {activities.map((activity) => <option key={activity.id} value={activity.id}>{projectActivityLabel(activity)}</option>)}
          {currentActivityMissing && <option value={projectActivityId}>{currentActivity ? projectActivityLabel(currentActivity) : 'Atividade anterior'}</option>}
        </select>
        <FieldError id="entry-project-activity-error" message={error} />
      </div>
    </section>
  )
}
