import { useEffect, useRef, useState, type ReactNode } from 'react'
import { demoSessionService } from './infrastructure/demoSessionService'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { PROFILE_UPDATED_EVENT, profileService } from '../profile/infrastructure/profileService'
import { SessionContext, type AuthState } from './sessionContext'
import type { DemoRole, DemoSession } from './types'
import type { CollaboratorProfile } from '../profile/types'
import { getCurrentSession, signOut as signOutSupabase, subscribe as subscribeSupabase } from '../auth/infrastructure/supabaseSessionService'

const demoModeEnabled = import.meta.env.MODE === 'test' || import.meta.env.VITE_ENABLE_DEMO_MODE === 'true'
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

  useEffect(() => {
    let cancelled = false
    const subscription = subscribeSupabase((event, supabaseSession) => {
      if (cancelled) return
      if (modeRef.current === 'demo') return
      if (supabaseSession) {
        modeRef.current = 'none'
        setSession(null)
        setCorporateProfile(null)
        setAuthError(UNAUTHORIZED_MESSAGE)
        setAuthState('authenticated_unauthorized')
        setIsLoading(false)
        return
      }
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        modeRef.current = 'none'
        setSession(null)
        setCorporateProfile(null)
        setAuthError(null)
        setAuthState('unauthenticated')
        setIsLoading(false)
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
      void getCurrentSession().then((supabaseSession) => {
        if (cancelled) return
        if (supabaseSession) {
          setAuthError(UNAUTHORIZED_MESSAGE)
          setAuthState('authenticated_unauthorized')
        } else {
          setAuthState('unauthenticated')
        }
        setIsLoading(false)
      }).catch(() => {
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

  const signOut = () => {
    modeRef.current = 'none'
    corporateRequestRef.current += 1
    demoSessionService.signOut()
    void signOutSupabase()
    setSession(null)
    setProfile(null)
    setCorporateProfile(null)
    setAuthError(null)
    setAuthState('unauthenticated')
  }

  return <SessionContext.Provider value={{ session, profile, corporateProfile, isLoading, authError, authState, signIn, signInWithMicrosoft, markAuthReady, signOut }}>{children}</SessionContext.Provider>
}
