import { useEffect, useRef, useState, type ReactNode } from 'react'
import { demoSessionService } from './infrastructure/demoSessionService'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { PROFILE_UPDATED_EVENT, profileService } from '../profile/infrastructure/profileService'
import { SessionContext } from './sessionContext'
import type { DemoRole, DemoSession } from './types'
import type { CollaboratorProfile } from '../profile/types'

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null)
  const [profile, setProfile] = useState<CollaboratorProfile | null>(null)
  const [corporateProfile, setCorporateProfile] = useState<NonNullable<DemoSession['corporateProfile']> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const modeRef = useRef<'unknown' | 'none' | 'demo' | 'corporate'>('unknown')
  const corporateRequestRef = useRef(0)

  useEffect(() => {
    const localSession = demoSessionService.restore()

    if (localSession) {
      modeRef.current = 'demo'
      corporateRequestRef.current += 1
      setSession(localSession)
      setCorporateProfile(null)
      setIsLoading(false)
    } else {
      modeRef.current = 'none'
      setIsLoading(true)
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
    if (error) setAuthError(error)
    setIsLoading(false)
  }

  const signOut = () => {
    modeRef.current = 'none'
    corporateRequestRef.current += 1
    demoSessionService.signOut()
    setSession(null)
    setProfile(null)
    setCorporateProfile(null)
  }

  return <SessionContext.Provider value={{ session, profile, corporateProfile, isLoading, authError, signIn, signInWithMicrosoft, markAuthReady, signOut }}>{children}</SessionContext.Provider>
}
