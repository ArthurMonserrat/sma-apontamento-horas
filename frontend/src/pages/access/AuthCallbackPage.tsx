import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAuthCallbackUrl, exchangeCallbackCode } from '../../features/auth/infrastructure/supabaseSessionService'
import { readCallbackCode } from './authCallback'
import { OAUTH_DESTINATION_KEY } from './ecosystemModules'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Validando acesso corporativo…')

  useEffect(() => {
    let active = true
    const code = readCallbackCode(window.location.search, window.location.hash)
    if (!code) {
      clearAuthCallbackUrl()
      navigate('/?authError=invalid_callback', { replace: true })
      return () => { active = false }
    }

    void exchangeCallbackCode(code).then(({ error }) => {
      if (!active) return
      if (error) {
        clearAuthCallbackUrl()
        setMessage('Não foi possível validar o acesso corporativo.')
        navigate('/?authError=unauthorized', { replace: true })
        return
      }
      const destination = sessionStorage.getItem(OAUTH_DESTINATION_KEY)
      sessionStorage.removeItem(OAUTH_DESTINATION_KEY)
      navigate(destination?.startsWith('/?') ? destination : '/', { replace: true })
    })

    return () => { active = false }
  }, [navigate])

  return <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6 text-[var(--color-text)]"><p role="status">{message}</p></main>
}
