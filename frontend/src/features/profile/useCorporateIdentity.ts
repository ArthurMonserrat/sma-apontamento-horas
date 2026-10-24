import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useSession } from '../session/useSession'
import { getCurrentSession } from '../auth/infrastructure/supabaseSessionService'
import { buildCorporateIdentity, type CorporateIdentityView } from './corporateIdentity'

/**
 * Identidade do usuário logado pela Microsoft, para qualquer cargo.
 * Retorna null em sessões de demonstração (sem perfil corporativo validado).
 */
export function useCorporateIdentity(): CorporateIdentityView | null {
  const { session, corporateProfile } = useSession()
  const profile = corporateProfile ?? session?.corporateProfile ?? null
  const [authUser, setAuthUser] = useState<User | null>(null)

  useEffect(() => {
    if (!profile) return
    let active = true
    // Lê a sessão Supabase já guardada no navegador (sem novo login).
    getCurrentSession()
      .then((current) => { if (active) setAuthUser(current?.user ?? null) })
      .catch(() => { if (active) setAuthUser(null) })
    return () => { active = false }
  }, [profile])

  return useMemo(() => (profile ? buildCorporateIdentity(profile, authUser) : null), [profile, authUser])
}
