import { useCallback, useEffect, useState } from 'react'
import type { CollaboratorProfile } from '../profile/types'
import type { AssignmentSnapshot, Squad } from '../squads/types'
import type { WorkloadChangeRequest, WorkloadVersion } from '../workloads/types'
import { profileService } from '../profile/infrastructure/profileService'
import { squadService } from '../squads/infrastructure/squadService'
import { workloadService } from '../workloads/infrastructure/workloadService'
import { getCorporateToday } from '../../shared/lib/date'
import { useSession } from '../session/useSession'

type ProfileData = {
  profile: CollaboratorProfile
  assignment: AssignmentSnapshot | null
  squads: Squad[]
  workloadVersions: WorkloadVersion[]
  workloadRequests: WorkloadChangeRequest[]
  currentWorkload: WorkloadVersion | null
}

type ProfileState = { data: ProfileData | null; isLoading: boolean; error: string | null }

export function useProfile() {
  const { profile: sessionProfile } = useSession()
  const [state, setState] = useState<ProfileState>({ data: null, isLoading: true, error: null })
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    if (!sessionProfile) {
      setState({ data: null, isLoading: false, error: 'Sessão corporativa não encontrada.' })
      return
    }
    setState((current) => ({ ...current, isLoading: true, error: null }))
    try {
      const [profile, squads, workloadVersions, workloadRequests] = await Promise.all([
        profileService.getById(sessionProfile.id),
        squadService.listActive(),
        workloadService.listVersions(sessionProfile.id),
        workloadService.listRequests(sessionProfile.id),
      ])
      if (!profile) throw new Error('Perfil profissional não encontrado.')
      setState({
        data: {
          profile,
          assignment: profileService.resolveAssignment(profile.id),
          squads,
          workloadVersions,
          workloadRequests,
          currentWorkload: await workloadService.getCurrent(profile.id, getCorporateToday()),
        },
        isLoading: false,
        error: null,
      })
    } catch (error) {
      console.error('Falha ao carregar perfil.', error)
      setState({ data: null, isLoading: false, error: error instanceof Error ? error.message : 'Não foi possível carregar o perfil profissional.' })
    }
  }, [sessionProfile])

  useEffect(() => { void load() }, [load])

  const runAndReload = useCallback(async (operation: (collaboratorId: string) => Promise<unknown>) => {
    if (!sessionProfile) throw new Error('Sessão corporativa não encontrada.')
    setIsSaving(true)
    try {
      await operation(sessionProfile.id)
      await load()
    } finally {
      setIsSaving(false)
    }
  }, [load, sessionProfile])

  return {
    ...state,
    isSaving,
    reload: load,
    updateProfile: (input: { name: string; email: string; jobTitle: string; activeSquadId: string }) => runAndReload((collaboratorId) => profileService.updateProfile(collaboratorId, input)),
    updateSignature: (assinaturaBase64: string) => runAndReload((collaboratorId) => profileService.updateSignature(collaboratorId, assinaturaBase64)),
    changeSquad: (squadId: string) => runAndReload((collaboratorId) => profileService.changeActiveSquad(collaboratorId, squadId)),
    createInitialWorkload: (dailyMinutes: number, effectiveFrom: string) => runAndReload((collaboratorId) => workloadService.createInitial(collaboratorId, dailyMinutes, effectiveFrom)),
    requestWorkloadChange: (input: { requestedDailyMinutes: number; requestedEffectiveFrom: string; justification: string }) => runAndReload((collaboratorId) => workloadService.requestChange(collaboratorId, input)),
  }
}
