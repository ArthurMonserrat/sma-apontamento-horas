export function normalizeExternalProjectCodes(rows: unknown): string[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Catálogo externo vazio ou inválido.')
  const codes = rows.map((row) => {
    const code = row && typeof row === 'object' && 'pro_st_apelido' in row ? row.pro_st_apelido : null
    if (typeof code !== 'string' || !code.trim() || code.trim().length > 80) throw new Error('Código externo inválido.')
    return code.trim()
  })
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b))
}
