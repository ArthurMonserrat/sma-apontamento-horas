import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session as SupabaseSession } from '@supabase/supabase-js'
import { demoSessionService } from './infrastructure/demoSessionService'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { PROFILE_UPDATED_EVENT, profileService } from '../profile/infrastructure/profileService'
import { SessionContext, type AuthState } from './sessionContext'
import type { CorporateProfile, DemoRole, DemoSession } from './types'
import type { CollaboratorProfile } from '../profile/types'
import { getCorporateProfile, mapCorporateRole } from '../auth/authService'
import { resolveDisplayName } from '../profile/corporateIdentity'
import { getModuleRole } from './moduleAccess'
import { getCurrentSession, signOut as signOutSupabase, subscribe as subscribeSupabase } from '../auth/infrastructure/supabaseSessionService'
import { setCorporateDataSession } from '../corporate/corporateData'

const demoModeEnabled = import.meta.env.MODE === 'test' || (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true')
const UNAUTHORIZED_MESSAGE = 'Não foi possível validar um perfil corporativo ativo. Contate a Administração.'

function createCorporateSession(profile: CorporateProfile): DemoSession | null {
  // Cargo do Banco 1 (pode ser diferente do cargo geral do perfil); sem acesso ao Banco 1 usa o cargo geral,
  // e as rotas do Banco 1 continuam bloqueadas pelo authGuard.
  const role = mapCorporateRole(getModuleRole(profile, 'BANCO_1') ?? profile.role)
  if (!role || !profile.active) return null
  const now = new Date().toISOString()
  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role,
    createdAt: profile.created_at ?? now,
    explicitLoginAt: now,
    isDemo: false,
    version: 2,
    authProvider: 'supabase',
    corporateProfile: profile,
  }
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null)
  const [profile, setProfile] = useState<CollaboratorProfile | null>(null)
  const [corporateProfile, setCorporateProfile] = useState<CorporateProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('initializing')
  const modeRef = useRef<'unknown' | 'none' | 'demo' | 'corporate'>('unknown')
  const corporateRequestRef = useRef(0)
  const corporateProfileRequestsRef = useRef(new Map<string, Promise<CorporateProfile>>())
  const failedCorporateProfileUsersRef = useRef(new Set<string>())
  const signOutInFlightRef = useRef<Promise<void> | null>(null)
  /** Usuário corporativo já validado: renovações de token dele não reiniciam as telas. */
  const authorizedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let initialEventObserved = false
    let sessionEventVersion = 0
    const isDemoSessionActive = () => modeRef.current === 'demo'

    const clearSession = (state: AuthState = 'unauthenticated', error: string | null = null) => {
      corporateRequestRef.current += 1
      modeRef.current = 'none'
      authorizedUserIdRef.current = null
      setCorporateDataSession(null)
      setSession(null)
      setProfile(null)
      setCorporateProfile(null)
      setAuthError(error)
      setAuthState(state)
      setIsLoading(false)
    }

    const resolveSession = async (supabaseSession: SupabaseSession) => {
      if (cancelled || isDemoSessionActive()) return

      const requestId = ++corporateRequestRef.current
      const { access_token: accessToken, user } = supabaseSession
      const requestKey = `${user.id}:${accessToken}`
      if (failedCorporateProfileUsersRef.current.has(user.id)) return

      let profileRequest = corporateProfileRequestsRef.current.get(requestKey)
      if (!profileRequest) {
        profileRequest = Promise.resolve().then(() => getCorporateProfile(accessToken))
        corporateProfileRequestsRef.current.set(requestKey, profileRequest)
        void profileRequest.then(
          () => corporateProfileRequestsRef.current.delete(requestKey),
          () => corporateProfileRequestsRef.current.delete(requestKey),
        )
      }

      modeRef.current = 'none'
      setCorporateDataSession(null)
      setSession(null)
      setProfile(null)
      setCorporateProfile(null)
      setAuthError(null)
      setAuthState('authenticating')
      setIsLoading(true)

      try {
        const validatedProfile = await profileRequest
        if (cancelled || requestId !== corporateRequestRef.current || isDemoSessionActive()) return
        const corporateSession = createCorporateSession(validatedProfile)
        if (!corporateSession) throw new Error(UNAUTHORIZED_MESSAGE)

        failedCorporateProfileUsersRef.current.delete(user.id)
        modeRef.current = 'corporate'
        // Antes de liberar as telas: os serviços passam a ler e gravar no banco de dados.
        setCorporateDataSession(corporateSession.id)
        authorizedUserIdRef.current = user.id
        setSession(corporateSession)
        setCorporateProfile(validatedProfile)
        setAuthError(null)
        setAuthState('authorized')
        setIsLoading(false)
      } catch {
        if (cancelled || requestId !== corporateRequestRef.current || isDemoSessionActive()) return
        failedCorporateProfileUsersRef.current.add(user.id)
        setCorporateDataSession(null)
        setSession(null)
        setProfile(null)
        setCorporateProfile(null)
        setAuthError(UNAUTHORIZED_MESSAGE)
        setAuthState('authenticated_unauthorized')
        setIsLoading(false)
      }
    }

    const subscription = subscribeSupabase((event, supabaseSession) => {
      if (cancelled || isDemoSessionActive()) return
      if (event === 'INITIAL_SESSION') {
        initialEventObserved = true
        if (supabaseSession) void resolveSession(supabaseSession)
        else clearSession()
        return
      }

      sessionEventVersion += 1
      if (supabaseSession) {
        // Ao voltar para a aba o Supabase renova o token (TOKEN_REFRESHED/SIGNED_IN) do mesmo usuário.
        // Revalidar aqui desmontava as telas e perdia o que estava sendo preenchido.
        if (modeRef.current === 'corporate' && authorizedUserIdRef.current === supabaseSession.user.id) return
        void resolveSession(supabaseSession)
        return
      }
      if (event === 'SIGNED_OUT') {
        failedCorporateProfileUsersRef.current.clear()
        clearSession()
      }
    })

    const localSession = demoModeEnabled ? demoSessionService.restore() : null
    if (localSession) {
      modeRef.current = 'demo'
      corporateRequestRef.current += 1
      setCorporateDataSession(null)
      setSession(localSession)
      setProfile(null)
      setCorporateProfile(null)
      setAuthState('authorized')
      setIsLoading(false)
    } else {
      modeRef.current = 'none'
      const versionAtBootstrap = sessionEventVersion
      void getCurrentSession().then((supabaseSession) => {
        if (cancelled || initialEventObserved || isDemoSessionActive() || sessionEventVersion !== versionAtBootstrap) return
        if (supabaseSession) void resolveSession(supabaseSession)
        else clearSession()
      }).catch(() => {
        if (cancelled || initialEventObserved || isDemoSessionActive() || sessionEventVersion !== versionAtBootstrap) return
        clearSession('error', 'Não foi possível restaurar a sessão corporativa. Tente novamente.')
      })
    }

    return () => {
      cancelled = true
      corporateRequestRef.current += 1
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadDemoProfile() {
      if (session?.role !== 'COLLABORATOR') {
        setProfile(null)
        return
      }
      // Login Microsoft: o perfil profissional é criado a partir da conta corporativa.
      if (!session.isDemo && session.corporateProfile) {
        try {
          const corporateProfile = await profileService.ensureCorporateProfile({
            id: session.corporateProfile.id,
            name: resolveDisplayName(session.corporateProfile),
            email: session.corporateProfile.email,
            jobTitle: 'Colaborador',
          })
          if (!cancelled) setProfile(corporateProfile)
        } catch (error) {
          console.error('[session] Não foi possível preparar o perfil profissional corporativo.', error)
          if (!cancelled) setProfile(null)
        }
        return
      }
      if (!session.isDemo) {
        setProfile(null)
        return
      }
      const savedProfile = await profileService.getById(session.id)
      if (!cancelled) setProfile(savedProfile ?? demoCollaborator)
    }
    void loadDemoProfile()
    const handleProfileUpdated = () => { void loadDemoProfile() }
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
    setCorporateDataSession(null)
    setSession(created)
    setCorporateProfile(null)
    setAuthError(null)
    setAuthState('authorized')
    setIsLoading(false)
    return created
  }

  const signInWithMicrosoft = (input: { id: string; name: string; email: string; role: DemoRole; corporateProfile: CorporateProfile }) => {
    const created = demoSessionService.signInWithMicrosoft(input)
    if (!created) return null
    modeRef.current = 'corporate'
    corporateRequestRef.current += 1
    setSession(created)
    setCorporateProfile(input.corporateProfile)
    setAuthError(null)
    setAuthState('authorized')
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
    failedCorporateProfileUsersRef.current.clear()
    authorizedUserIdRef.current = null
    demoSessionService.signOut()
    setCorporateDataSession(null)
    setSession(null)
    setProfile(null)
    setCorporateProfile(null)
    setAuthError(null)
    setAuthState('signing_out')
    setIsLoading(false)

    const request = (async () => {
      try {
        const result = await signOutSupabase()
        if (result.error) throw result.error
        setAuthState('unauthenticated')
      } catch {
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
