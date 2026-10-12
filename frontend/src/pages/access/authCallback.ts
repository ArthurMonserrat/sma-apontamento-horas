export function readCallbackCode(search: string, hash = ''): string | null {
  const searchParams = new URLSearchParams(search)
  const hashSearch = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const code = (searchParams.get('code') ?? new URLSearchParams(hashSearch).get('code'))?.trim()
  return code || null
}
