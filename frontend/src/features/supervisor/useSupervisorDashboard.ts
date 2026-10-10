import { useCallback, useEffect, useState } from 'react'
import { supervisorService } from './infrastructure/supervisorService'
import type {
  SupervisorDashboardSummary,
  SupervisorPendingEntry,
  SupervisorRequestSummary,
  SupervisorTimeOffRequest,
} from './types'

type SupervisorDashboardState = {
  collaborators: Array<{ id: string, name: string }>
  entries: SupervisorPendingEntry[]
  requests: SupervisorTimeOffRequest[]
  summary: SupervisorDashboardSummary
  requestSummary: SupervisorRequestSummary
}

const emptySummary: SupervisorDashboardSummary = { pending: 0, approved: 0, rejected: 0 }
const emptyRequestSummary: SupervisorRequestSummary = { pending: 0, approved: 0, rejected: 0 }

export function useSupervisorDashboard(supervisorId: string | undefined) {
  const [data, setData] = useState<SupervisorDashboardState>({
    collaborators: [],
    entries: [],
    requests: [],
    summary: emptySummary,
    requestSummary: emptyRequestSummary,
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [isMutating, setMutating] = useState(false)

  const reload = useCallback(async () => {
    if (!supervisorId) return
    setLoading(true)
    setError(null)
    try {
      const [collaborators, entries, requests, summary, requestSummary] = await Promise.all([
        supervisorService.listCollaborators(),
        supervisorService.listEntries(),
        supervisorService.listTimeOffRequests(supervisorId),
        supervisorService.getSummary(),
        supervisorService.getRequestSummary(supervisorId),
      ])
      setData({
        collaborators: Array.isArray(collaborators) ? collaborators : [],
        entries: Array.isArray(entries) ? entries : [],
        requests: Array.isArray(requests) ? requests : [],
        summary,
        requestSummary,
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

  const approveTimeOff = async (request: SupervisorTimeOffRequest) => {
    if (!supervisorId) return
    setMutating(true)
    setError(null)
    try {
      await supervisorService.approveTimeOffRequest(request.id, supervisorId)
      await reload()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível aprovar a folga.')
    } finally {
      setMutating(false)
    }
  }

  const rejectTimeOff = async (request: SupervisorTimeOffRequest, reason: string) => {
    if (!supervisorId) return
    setMutating(true)
    setError(null)
    try {
      await supervisorService.rejectTimeOffRequest(request.id, supervisorId, reason)
      await reload()
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
    approveTimeOff,
    rejectTimeOff,
    reload,
  }
}
