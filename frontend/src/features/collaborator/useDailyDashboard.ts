import { useCallback, useEffect, useState } from 'react'
import { timeEntryService } from '../time-entries'
import { workloadService } from '../../services/workloadService'
import type { DailySummary, TimeEntry } from '../../shared/types/domain'
import { useSession } from '../session/useSession'

type DashboardState = {
  entries: TimeEntry[]
  summary: DailySummary | null
  isLoading: boolean
  error: string | null
}

export function useDailyDashboard(date: string) {
  const { profile } = useSession()
  const [state, setState] = useState<DashboardState>({ entries: [], summary: null, isLoading: true, error: null })

  const load = useCallback(async () => {
    if (!profile) return
    setState((current) => ({ ...current, isLoading: true, error: null }))
    try {
      const workloadVersions = await workloadService.listVersions(profile.id)
      const [entries, summary] = await Promise.all([
        timeEntryService.listByDate(profile.id, date),
        timeEntryService.getDailySummary(profile.id, date, workloadVersions),
      ])
      setState({ entries, summary, isLoading: false, error: null })
    } catch (error) {
      console.error('Falha ao carregar o resumo diário.', error)
      setState({ entries: [], summary: null, isLoading: false, error: 'Não foi possível carregar o resumo do dia.' })
    }
  }, [date, profile])

  useEffect(() => {
    void load()
  }, [load])

  return { ...state, reload: load }
}
