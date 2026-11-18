import { useCallback, useEffect, useState } from 'react'
import { supervisorService } from './infrastructure/supervisorService'
import type {
  SupervisorDashboardSummary,
  SupervisorPendingEntry,
} from './types'

type SupervisorDashboardState = {
  collaborators: Array<{ id: string, name: string }>
  entries: SupervisorPendingEntry[]
  summary: SupervisorDashboardSummary
}

const emptySummary: SupervisorDashboardSummary = { pending: 0, approved: 0, rejected: 0 }

export function useSupervisorDashboard(supervisorId: string | undefined) {
  const [data, setData] = useState<SupervisorDashboardState>({
    collaborators: [],
    entries: [],
    summary: emptySummary,
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [isMutating, setMutating] = useState(false)

  const reload = useCallback(async () => {
    if (!supervisorId) return
    setLoading(true)
    setError(null)
    try {
      const [collaborators, entries, summary] = await Promise.all([
        supervisorService.listCollaborators(),
        supervisorService.listEntries(),
        supervisorService.getSummary(),
      ])
      setData({
        collaborators: Array.isArray(collaborators) ? collaborators : [],
        entries: Array.isArray(entries) ? entries : [],
        summary,
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os dados da supervisão.')
    } finally {
      setLoading(false)
    }
  }, [supervisorId])

  useEffect(() => {
    void reload()
  }, [reload])

  const approve = async (entry: SupervisorPendingEntry) => {
    if (!supervisorId) return
    setMutating(true)
    setError(null)
    try {
      await supervisorService.approve(entry.id, supervisorId)
      await reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível aprovar o apontamento.')
    } finally {
      setMutating(false)
    }
  }

  const approveMany = async (entryIds: string[]) => {
    if (!supervisorId || entryIds.length === 0) return
    setMutating(true)
    setError(null)
    try {
      await supervisorService.approveMany(entryIds, supervisorId)
      await reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível aprovar os apontamentos selecionados.')
    } finally {
      setMutating(false)
    }
  }

  const reject = async (entry: SupervisorPendingEntry, reason: string) => {
    if (!supervisorId) return
    setMutating(true)
    setError(null)
    try {
      await supervisorService.reject(entry.id, supervisorId, reason)
      await reload()
    } finally {
      setMutating(false)
    }
  }

  const rejectMany = async (entryIds: string[], reason: string) => {
    if (!supervisorId || entryIds.length === 0) return
    setMutating(true)
    setError(null)
    try {
      await supervisorService.rejectMany(entryIds, supervisorId, reason)
      await reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível rejeitar os apontamentos selecionados.')
    } finally {
      setMutating(false)
    }
  }

  return {
    ...data,
    error,
    isLoading,
    isMutating,
    approve,
    approveMany,
    reject,
    rejectMany,
    reload,
  }
}
