import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { exchangeCallbackCode } from '../../features/auth/infrastructure/supabaseSessionService'

export function readCallbackCode(search: string, hash = ''): string | null {
  const searchParams = new URLSearchParams(search)
  const hashSearch = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const code = (searchParams.get('code') ?? new URLSearchParams(hashSearch).get('code'))?.trim()
  return code || null
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Validando acesso corporativo…')

  useEffect(() => {
    let active = true
    const code = readCallbackCode(window.location.search, window.location.hash)
    if (!code) {
      navigate('/?authError=invalid_callback', { replace: true })
      return () => { active = false }
    }

    void exchangeCallbackCode(code).then(({ error }) => {
      if (!active) return
      if (error) {
        setMessage('Não foi possível validar o acesso corporativo.')
        navigate('/?authError=unauthorized', { replace: true })
        return
      }
      navigate('/', { replace: true })
    })

    return () => { active = false }
  }, [navigate])

  return <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6 text-[var(--color-text)]"><p role="status">{message}</p></main>
}
