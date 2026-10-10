import { useEffect, useState, type ReactNode } from 'react'
import { demoSessionService } from './infrastructure/demoSessionService'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { PROFILE_UPDATED_EVENT, profileService } from '../profile/infrastructure/profileService'
import { SessionContext } from './sessionContext'
import type { DemoRole, DemoSession, MicrosoftSessionInput } from './types'
import type { CollaboratorProfile } from '../profile/types'
import { getCorporateProfile, mapCorporateRole } from '../auth/authService'

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null)
  const [profile, setProfile] = useState<CollaboratorProfile | null>(null)
  const [corporateProfile, setCorporateProfile] = useState<NonNullable<DemoSession['corporateProfile']> | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const localSession = demoSessionService.restore()
      if (localSession) {
        if (!cancelled) {
          setSession(localSession)
          setCorporateProfile(localSession.corporateProfile ?? null)
          setIsLoading(false)
        }
        return
      }

      try {
        const response = await fetch('/api/me', { credentials: 'include' })
        if (!response.ok) return
        const payload = await response.json() as {
          isAuthenticated?: boolean
          account?: { id?: string; name?: string; username?: string }
        }
        if (payload.isAuthenticated && payload.account?.id && payload.account.name && payload.account.username && !cancelled) {
          setSession(demoSessionService.signInWithMicrosoft({
            id: payload.account.id,
            name: payload.account.name,
            email: payload.account.username,
            role: 'COLLABORATOR',
          }))
        }
      } catch {
        // API indisponível não impede o modo demo/local.
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void restoreSession()
    return () => { cancelled = true }
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

  const signInWithMicrosoft = async (input: MicrosoftSessionInput) => {
    const loadedProfile = await getCorporateProfile(input.email, input.name)
    const created = demoSessionService.signInWithMicrosoft({
      ...input,
      role: mapCorporateRole(loadedProfile.role),
      corporateProfile: loadedProfile,
    })
    setSession(created)
    setCorporateProfile(loadedProfile)
    return created
  }
  const signIn = (role: DemoRole) => {
    if (session?.authProvider === 'microsoft' && session.email) {
      return session
    }
    const created = demoSessionService.signIn(role)
    setSession(created)
    setCorporateProfile(null)
    return created
  }
  const signOut = () => {
    void fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    demoSessionService.signOut()
    setSession(null)
    setProfile(null)
    setCorporateProfile(null)
  }

  return <SessionContext.Provider value={{ session, profile, corporateProfile, isLoading, signIn, signInWithMicrosoft, signOut }}>{children}</SessionContext.Provider>
}
