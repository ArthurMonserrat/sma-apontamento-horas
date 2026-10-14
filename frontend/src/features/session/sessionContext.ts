import { createContext } from 'react'
import type { CollaboratorProfile } from '../profile/types'
import type { CorporateProfile, DemoRole, DemoSession } from './types'

export type AuthState = 'initializing' | 'unauthenticated' | 'authenticating' | 'authenticated_unauthorized' | 'authorized' | 'error'

export type DemoSignIn = (role: DemoRole) => DemoSession
export type MicrosoftSignIn = (input: { id: string; name: string; email: string; role: DemoRole; corporateProfile: CorporateProfile }) => DemoSession | null

export type SessionContextValue = {
  session: DemoSession | null
  profile: CollaboratorProfile | null
  corporateProfile?: CorporateProfile | null
  isLoading: boolean
  authError?: string | null
  authState?: AuthState
  beginAuthentication?: () => void
  signIn: DemoSignIn
  signInWithMicrosoft?: MicrosoftSignIn
  markAuthReady?: (error?: string) => void
  signOut: () => void
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined)
