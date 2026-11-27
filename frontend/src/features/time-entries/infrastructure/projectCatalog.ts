import type { SupabaseClient } from '@supabase/supabase-js'

export async function listProjectCodes(client: SupabaseClient): Promise<string[]> {
  const codes: string[] = []
  const pageSize = 1000
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const { data, error } = await client.from('banco1_project_catalog').select('code').order('code').range(offset, offset + pageSize - 1)
    if (error) throw new Error('Não foi possível carregar os projetos. Tente novamente.')
    codes.push(...(data ?? []).map((row) => row.code as string))
    if ((data ?? []).length < pageSize) return codes
  }
  throw new Error('Catálogo de projetos excede o limite de segurança.')
}
