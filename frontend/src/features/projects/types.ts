/** Atividade de um projeto. Sem executor = qualquer pessoa pode apontar nela. */
export type ProjectActivity = {
  id: string
  name: string
  complement: string | null
  executorId: string | null
  executorName: string | null
  active: boolean
}

/** Projeto cadastrado pela diretoria (tela Projetos ou importação do Excel). */
export type Project = {
  id: string
  code: string
  supervisionCode: string | null
  client: string
  finalClient: string | null
  location: string | null
  marketSegment: string | null
  description: string
  active: boolean
  activities: ProjectActivity[]
}

/** Dados para gravar (tela e importação). */
export type ProjectInput = {
  code: string
  supervisionCode?: string | null
  client: string
  finalClient?: string | null
  location?: string | null
  marketSegment?: string | null
  description?: string
  active?: boolean
  activities: Array<{ name: string; complement?: string | null; executorId?: string | null; executorName?: string | null }>
}

export type SaveProjectsResult = {
  projectIds: string[]
  projectsCreated: number
  projectsUpdated: number
  activitiesSaved: number
  activitiesRemoved: number
  unmatchedExecutors: string[]
}

export function projectActivityLabel(activity: Pick<ProjectActivity, 'name' | 'complement'>) {
  return activity.complement ? `${activity.name} — ${activity.complement}` : activity.name
}

/** Atividades em que a pessoa pode apontar: as dela e as sem executor. */
export function activitiesForPerson(project: Project, personId: string) {
  return project.activities.filter((activity) => activity.active && (!activity.executorId || activity.executorId === personId))
}
