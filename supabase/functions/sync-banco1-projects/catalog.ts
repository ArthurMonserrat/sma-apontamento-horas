export type NormalizedExternalProject = { code: string; title: string | null }

export function normalizeExternalProjects(rows: unknown): NormalizedExternalProject[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Catálogo externo vazio ou inválido.')
  const projects = new Map<string, NormalizedExternalProject>()
  rows.forEach((row) => {
    const code = row && typeof row === 'object' && 'pro_st_apelido' in row ? row.pro_st_apelido : null
    if (typeof code !== 'string' || !code.trim() || code.trim().length > 80) throw new Error('Código externo inválido.')
    const rawTitle = row && typeof row === 'object' && 'pro_st_descricao' in row ? row.pro_st_descricao : null
    if (rawTitle !== null && typeof rawTitle !== 'string') throw new Error('Título externo inválido.')
    const title = rawTitle?.trim() || null
    if (title && title.length > 160) throw new Error('Título externo inválido.')
    const normalizedCode = code.trim()
    const current = projects.get(normalizedCode)
    if (!current || (!current.title && title)) projects.set(normalizedCode, { code: normalizedCode, title })
  })
  return [...projects.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export function normalizeExternalProjectCodes(rows: unknown): string[] {
  return normalizeExternalProjects(rows).map((project) => project.code)
}
