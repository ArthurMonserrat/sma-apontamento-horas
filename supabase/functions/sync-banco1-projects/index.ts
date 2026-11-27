import { normalizeExternalProjectCodes } from './catalog.ts'

const read = (name: string) => Deno.env.get(name)?.trim() || ''

Deno.serve(async (request) => {
  const syncSecret = read('BANCO1_PROJECT_SYNC_SECRET')
  const sourceUrl = read('BANCO1_PROJECT_SOURCE_URL')
  const sourceKey = read('BANCO1_PROJECT_SOURCE_KEY')
  const supabaseUrl = read('SUPABASE_URL')
  const serviceKey = read('SUPABASE_SERVICE_ROLE_KEY')
  if (!syncSecret || !sourceUrl || !sourceKey || !supabaseUrl || !serviceKey) return new Response('Configuração indisponível.', { status: 503 })
  if (request.method !== 'POST' || request.headers.get('authorization') !== `Bearer ${syncSecret}`) return new Response('Não autorizado.', { status: 401 })

  try {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:') throw new Error('URL externa inválida.')
    url.searchParams.set('select', 'pro_st_apelido')
    const rows: unknown[] = []
    const pageSize = 1000
    for (let offset = 0; offset < 100000; offset += pageSize) {
      const response = await fetch(url, {
        headers: { apikey: sourceKey, authorization: `Bearer ${sourceKey}`, range: `${offset}-${offset + pageSize - 1}` },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('Consulta externa falhou.')
      const page: unknown = await response.json()
      if (!Array.isArray(page)) throw new Error('Resposta externa inválida.')
      rows.push(...page)
      if (page.length < pageSize) break
      if (offset + pageSize >= 100000) throw new Error('Catálogo excede o limite de segurança.')
    }
    const codes = normalizeExternalProjectCodes(rows)
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/banco1_import_project_codes`, {
      method: 'POST',
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ codes }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('Gravação do catálogo falhou.')
    return Response.json({ imported: await response.json() })
  } catch {
    // Nunca inclua URL, credencial ou conteúdo externo nos logs e respostas.
    return new Response('Sincronização falhou; catálogo anterior preservado.', { status: 502 })
  }
})
