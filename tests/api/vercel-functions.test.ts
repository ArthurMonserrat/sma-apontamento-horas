import { readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const expectedApiRoutes = [
  'login.ts',
  'logout.ts',
  'me.ts',
  'provision.ts',
  'redirect.ts',
  'supabase-session.ts',
]

describe('limite de funções da Vercel', () => {
  it('mantém somente endpoints HTTP diretamente na pasta api', async () => {
    const apiFiles = (await readdir(new URL('../../api/', import.meta.url)))
      .filter((file) => file.endsWith('.ts'))
      .sort()

    expect(apiFiles).toEqual(expectedApiRoutes)
    expect(apiFiles).toHaveLength(6)
  })
})
