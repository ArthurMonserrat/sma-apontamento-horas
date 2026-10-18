import { useEffect, useRef, useState, type ReactNode } from 'react'
import { demoSessionService } from './infrastructure/demoSessionService'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { PROFILE_UPDATED_EVENT, profileService } from '../profile/infrastructure/profileService'
import { SessionContext, type AuthState } from './sessionContext'
import type { DemoRole, DemoSession } from './types'
import type { CollaboratorProfile } from '../profile/types'
import { getCurrentSession, signOut as signOutSupabase, subscribe as subscribeSupabase } from '../auth/infrastructure/supabaseSessionService'
import { getCorporateProfile, mapCorporateRole } from '../auth/authService'
import { supabaseAuthClient } from '../auth/infrastructure/supabaseAuthClient'
import { configureTimeEntryService, SupabaseTimeEntryService } from '../time-entries'
import { configureSupervisorService } from '../supervisor/infrastructure/supervisorService'
import { SupabaseSupervisorService } from '../supervisor/infrastructure/supabaseSupervisorService'

// A demonstração é uma ferramenta de desenvolvimento/teste, não uma porta de
// entrada para o bundle publicado. Mesmo que uma variável pública seja
// configurada por engano na Vercel, o build de produção não restaura uma
// sessão local nem autoriza uma rota corporativa.
const demoModeEnabled = import.meta.env.MODE === 'test' || (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true')
const UNAUTHORIZED_MESSAGE = 'A sessão corporativa ainda não foi autorizada.'

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null)
  const [profile, setProfile] = useState<CollaboratorProfile | null>(null)
  const [corporateProfile, setCorporateProfile] = useState<NonNullable<DemoSession['corporateProfile']> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('initializing')
  const modeRef = useRef<'unknown' | 'none' | 'demo' | 'corporate'>('unknown')
  const corporateRequestRef = useRef(0)
  const signOutInFlightRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    let cancelled = false
    const applySupabaseSession = async (supabaseSession: Awaited<ReturnType<typeof getCurrentSession>> | null) => {
      if (cancelled || modeRef.current === 'demo') return
      const requestId = ++corporateRequestRef.current
      if (!supabaseSession) {
        modeRef.current = 'none'
        configureTimeEntryService(null)
        configureSupervisorService(null)
        setSession(null)
        setCorporateProfile(null)
        setAuthError(null)
        setAuthState('unauthenticated')
        setIsLoading(false)
        return
      }

      modeRef.current = 'corporate'
      setSession(null)
      setCorporateProfile(null)
      setAuthError(null)
      setAuthState('authenticating')
      setIsLoading(true)
      try {
        const authorizedProfile = await getCorporateProfile(supabaseSession.access_token)
        const role = mapCorporateRole(authorizedProfile.role)
        if (!role || !authorizedProfile.active || cancelled || requestId !== corporateRequestRef.current) {
          throw new Error(UNAUTHORIZED_MESSAGE)
        }
        const now = new Date().toISOString()
        const corporateSession: DemoSession = {
          id: authorizedProfile.id,
          name: authorizedProfile.full_name,
          email: authorizedProfile.email,
          role,
          createdAt: now,
          explicitLoginAt: now,
          isDemo: false,
          version: 2,
          authProvider: 'supabase',
          corporateProfile: authorizedProfile,
        }
        setSession(corporateSession)
        setCorporateProfile(authorizedProfile)
        if (supabaseAuthClient) {
          const dataClient = supabaseAuthClient as never
          configureTimeEntryService(new SupabaseTimeEntryService(dataClient))
          configureSupervisorService(new SupabaseSupervisorService(dataClient))
        }
        setAuthError(null)
        setAuthState('authorized')
      } catch {
        if (cancelled || requestId !== corporateRequestRef.current) return
        setSession(null)
        setCorporateProfile(null)
        configureTimeEntryService(null)
        configureSupervisorService(null)
        setAuthError(UNAUTHORIZED_MESSAGE)
        setAuthState('authenticated_unauthorized')
      } finally {
        if (!cancelled && requestId === corporateRequestRef.current) setIsLoading(false)
      }
    }

    const subscription = subscribeSupabase((event, supabaseSession) => {
      if (cancelled) return
      if (modeRef.current === 'demo') return
      if (supabaseSession || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void applySupabaseSession(supabaseSession)
      }
    })

    const localSession = demoModeEnabled ? demoSessionService.restore() : null

    if (localSession) {
      modeRef.current = 'demo'
      corporateRequestRef.current += 1
      setSession(localSession)
      setCorporateProfile(null)
      setAuthState('authorized')
      setIsLoading(false)
    } else {
      modeRef.current = 'none'
      void getCurrentSession().then((supabaseSession) => applySupabaseSession(supabaseSession)).catch(() => {
        if (cancelled) return
        setAuthState('error')
        setAuthError('Não foi possível restaurar a sessão corporativa. Tente novamente.')
        setIsLoading(false)
      })
    }

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      // Corporate sessions must never consult the local/demo profile store.
      // Until a server-authorized profile adapter is available, keep this
      // value empty instead of mixing a real session with demo identity data.
      if (session?.authProvider === 'supabase') {
        setProfile(null)
        return
      }
      if (session?.role !== 'COLLABORATOR') {
        setProfile(null)
        return
      }
      const savedProfile = await profileService.getById(session.id)
      if (!cancelled) setProfile(savedProfile ?? demoCollaborator)
    }
    void loadProfile()
    const handleProfileUpdated = () => { void loadProfile() }
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated)
    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated)
    }
  }, [session])

  const signIn = (role: DemoRole) => {
    if (session?.authProvider === 'supabase') return session
    const created = demoSessionService.signIn(role)
    modeRef.current = 'demo'
    corporateRequestRef.current += 1
    setSession(created)
    setCorporateProfile(null)
    setAuthError(null)
    setAuthState('authorized')
    return created
  }

  const signInWithMicrosoft = (input: { id: string; name: string; email: string; role: DemoRole; corporateProfile: NonNullable<DemoSession['corporateProfile']> }) => {
    const created = demoSessionService.signInWithMicrosoft(input)
    if (!created) return null
    modeRef.current = 'corporate'
    corporateRequestRef.current += 1
    setSession(created)
    setCorporateProfile(input.corporateProfile)
    setAuthError(null)
    setIsLoading(false)
    return created
  }

  const markAuthReady = (error?: string) => {
    if (error) {
      setAuthError(error)
      setAuthState('error')
    }
    setIsLoading(false)
  }

  const beginAuthentication = () => {
    setAuthError(null)
    setAuthState('authenticating')
    setIsLoading(true)
  }

  const signOut = (): Promise<void> => {
    if (signOutInFlightRef.current) return signOutInFlightRef.current

    modeRef.current = 'none'
    corporateRequestRef.current += 1
    demoSessionService.signOut()
    setSession(null)
    setProfile(null)
    setCorporateProfile(null)
    configureTimeEntryService(null)
    configureSupervisorService(null)
    setAuthError(null)
    setAuthState('signing_out')
    setIsLoading(false)

    const request = (async () => {
      try {
        const result = await signOutSupabase()
        if (result.error) throw result.error
        setAuthState('unauthenticated')
      } catch {
        // O estado local permanece sem sessão para bloquear as rotas. A falha
        // explícita informa que o provedor ainda precisa ser confirmado.
        setAuthError('Não foi possível confirmar o encerramento da sessão. Tente novamente.')
        setAuthState('error')
      } finally {
        signOutInFlightRef.current = null
      }
    })()
    signOutInFlightRef.current = request
    return request
  }

  return <SessionContext.Provider value={{ session, profile, corporateProfile, isLoading, authError, authState, beginAuthentication, signIn, signInWithMicrosoft, markAuthReady, signOut }}>{children}</SessionContext.Provider>
}
