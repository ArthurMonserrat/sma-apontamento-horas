import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { demoSessionService } from './infrastructure/demoSessionService'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { PROFILE_UPDATED_EVENT, profileService } from '../profile/infrastructure/profileService'
import { SessionContext } from './sessionContext'
import type { DemoRole, DemoSession } from './types'
import type { CollaboratorProfile } from '../profile/types'
import { getCorporateProfile, mapCorporateRole } from '../auth/authService'
import { getCurrentSession, signOut as signOutSupabase, subscribe as subscribeSupabase } from '../auth/infrastructure/supabaseSessionService'

function buildCorporateSession(session: Session, role: DemoRole, corporateProfile: NonNullable<DemoSession['corporateProfile']>): DemoSession {
  const timestamp = new Date().toISOString()
  const metadata = session.user.user_metadata as Record<string, unknown> | undefined
  const name = typeof metadata?.full_name === 'string' && metadata.full_name.trim()
    ? metadata.full_name.trim()
    : corporateProfile.full_name
  return {
    id: session.user.id,
    name,
    email: session.user.email ?? corporateProfile.email,
    role,
    createdAt: timestamp,
    explicitLoginAt: timestamp,
    isDemo: false,
    version: 2,
    authProvider: 'supabase',
    corporateProfile,
  }
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null)
  const [profile, setProfile] = useState<CollaboratorProfile | null>(null)
  const [corporateProfile, setCorporateProfile] = useState<NonNullable<DemoSession['corporateProfile']> | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function clearCorporateSession() {
      await signOutSupabase()
      if (cancelled) return
      setSession(null)
      setCorporateProfile(null)
    }

    async function hydrateCorporateSession(nextSession: Session) {
      try {
        const loadedProfile = await getCorporateProfile(nextSession.access_token)
        const role = mapCorporateRole(loadedProfile.role)
        if (!role || !loadedProfile.active) throw new Error('Perfil corporativo sem autorização ativa.')
        if (!cancelled) {
          const restored = buildCorporateSession(nextSession, role, loadedProfile)
          setSession(restored)
          setCorporateProfile(loadedProfile)
        }
      } catch {
        await clearCorporateSession()
      }
    }

    async function restoreSession() {
      const localSession = demoSessionService.restore()
      if (localSession) {
        if (!cancelled) {
          setSession(localSession)
          setCorporateProfile(null)
          setIsLoading(false)
        }
        return
      }

      const supabaseSession = await getCurrentSession()
      if (supabaseSession) await hydrateCorporateSession(supabaseSession)
      if (!cancelled) setIsLoading(false)
    }

    void restoreSession()
    const subscription = subscribeSupabase((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        setSession(null)
        setCorporateProfile(null)
        return
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && nextSession) void hydrateCorporateSession(nextSession)
    })

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
    setSession(created)
    setCorporateProfile(null)
    return created
  }

  const signOut = () => {
    void signOutSupabase()
    demoSessionService.signOut()
    setSession(null)
    setProfile(null)
    setCorporateProfile(null)
  }

  return <SessionContext.Provider value={{ session, profile, corporateProfile, isLoading, signIn, signOut }}>{children}</SessionContext.Provider>
}
