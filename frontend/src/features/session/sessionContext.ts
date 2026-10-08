import { createContext } from 'react'
import type { CollaboratorProfile } from '../../shared/types/domain'
import type { DemoRole, DemoSession, MicrosoftSessionInput } from './types'

export type DemoSignIn = (role: DemoRole) => DemoSession

export type SessionContextValue = {
  session: DemoSession | null
  profile: CollaboratorProfile | null
  isLoading: boolean
  signIn: DemoSignIn
  signInWithMicrosoft?: (input: MicrosoftSessionInput) => DemoSession
  signOut: () => void
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined)
