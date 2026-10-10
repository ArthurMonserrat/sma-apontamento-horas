import { createContext } from 'react'
import type { CollaboratorProfile } from '../profile/types'
import type { CorporateProfile, DemoRole, DemoSession, MicrosoftSessionInput } from './types'

export type DemoSignIn = (role: DemoRole) => DemoSession

export type SessionContextValue = {
  session: DemoSession | null
  profile: CollaboratorProfile | null
  corporateProfile?: CorporateProfile | null
  isLoading: boolean
  signIn: DemoSignIn
  signInWithMicrosoft?: (input: MicrosoftSessionInput) => Promise<DemoSession>
  signOut: () => void
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined)
