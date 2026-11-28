import type { SupabaseClient } from '@supabase/supabase-js'

export type ProjectCatalogItem = { code: string; title: string | null }

export const formatProjectCatalogLabel = (project: ProjectCatalogItem) => project.title ? `${project.code} — ${project.title}` : project.code

export function filterProjectCatalog(projects: ProjectCatalogItem[], query: string, limit = 100): ProjectCatalogItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return projects.filter((project) => !normalizedQuery || formatProjectCatalogLabel(project).toLocaleLowerCase().includes(normalizedQuery)).slice(0, limit)
}

export async function listProjectCatalog(client: SupabaseClient): Promise<ProjectCatalogItem[]> {
  const projects: ProjectCatalogItem[] = []
  const pageSize = 1000
  for (let offset = 0; offset < 100000; offset += pageSize) {
    let { data, error } = await client.from('banco1_project_catalog').select('code,title').order('code').range(offset, offset + pageSize - 1)
    if (error && (error.code === 'PGRST204' || /column.*title/i.test(error.message))) {
      const legacy = await client.from('banco1_project_catalog').select('code').order('code').range(offset, offset + pageSize - 1)
      data = (legacy.data ?? []).map((row) => ({ code: row.code, title: null }))
      error = legacy.error
    }
    if (error) throw new Error('Não foi possível carregar os projetos. Tente novamente.')
    projects.push(...(data ?? []).map((row) => ({ code: row.code as string, title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null })))
    if ((data ?? []).length < pageSize) return projects
  }
  throw new Error('Catálogo de projetos excede o limite de segurança.')
}

export async function listProjectCodes(client: SupabaseClient): Promise<string[]> {
  return (await listProjectCatalog(client)).map((project) => project.code)
}
