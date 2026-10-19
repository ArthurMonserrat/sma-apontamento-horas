import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}

describe('configuração de autenticação segura', () => {
  it('não expõe credenciais server-only no frontend', async () => {
    const files = await listFiles(join(process.cwd(), 'frontend', 'src'))
    const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')))
    const frontendSource = contents.join('\n')

    expect(frontendSource).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/)
    expect(frontendSource).not.toMatch(/CLIENT_SECRET\s*=/)
    expect(frontendSource).not.toMatch(/AZURE_CLIENT_SECRET\s*=/)
    expect(frontendSource).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./)
  })

  it('não coloca credenciais server-only no env de build do frontend', async () => {
    const envExample = await readFile(join(process.cwd(), 'frontend', '.env.example'), 'utf8')
    expect(envExample).toContain('VITE_SUPABASE_URL')
    expect(envExample).toContain('VITE_SUPABASE_ANON_KEY')
    expect(envExample).toContain('VITE_SUPABASE_ALLOWED_REDIRECTS')
    expect(envExample).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(envExample).not.toContain('CLIENT_SECRET')
  })

  it('injeta apenas a configuração pública do Supabase no build do GitHub Pages', async () => {
    const workflow = await readFile(join(process.cwd(), '.github', 'workflows', 'deploy-pages.yml'), 'utf8')

    expect(workflow).toContain('VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}')
    expect(workflow).toContain('VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}')
    expect(workflow).toContain('VITE_SUPABASE_ALLOWED_REDIRECTS: ${{ secrets.VITE_SUPABASE_ALLOWED_REDIRECTS }}')
    expect(workflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY:')
  })

  it('não imprime credenciais sintéticas geradas pelo Supabase no log do CI', async () => {
    const workflow = await readFile(join(process.cwd(), '.github', 'workflows', 'validate-supabase-local.yml'), 'utf8')

    expect(workflow).toContain('supabase start --yes > "$RUNNER_TEMP/supabase-start.log"')
    expect(workflow).not.toContain('run: supabase start --yes')
  })
})
