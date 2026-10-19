import { useCallback, useEffect, useState } from 'react'
import { timeOffService } from './infrastructure/timeOffService'
import { addDays, getCorporateToday } from '../../shared/lib/date'
import { useSession } from '../session/useSession'
import type { AbsenceType, TimeOffRequest } from './types'
import { localDataAccessError } from '../session/sessionActor'

export function useTimeOffRequests() {
  const { profile, session } = useSession()
  const today = getCorporateToday()
  const [requests, setRequests] = useState<TimeOffRequest[]>([])
  const [absenceType, setAbsenceType] = useState<AbsenceType>('Folga')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const load = useCallback(async () => {
    const corporateDataError = localDataAccessError(session)
    if (corporateDataError) {
      setRequests([])
      setIsLoading(false)
      setError(`${corporateDataError} A persistência corporativa de folgas ainda não está disponível.`)
      return
    }
    if (!profile) return
    setIsLoading(true)
    setError(null)
    try {
      const stored = await timeOffService.listByRange(profile.id, addDays(today, -365), addDays(today, 730))
      setRequests(Array.isArray(stored) ? stored : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as ausências.')
    } finally {
      setIsLoading(false)
    }
  }, [profile, session, today])

  useEffect(() => { void load() }, [load])

  const create = async () => {
    const corporateDataError = localDataAccessError(session)
    if (corporateDataError) {
      setError(`${corporateDataError} A criação de folgas corporativas permanece bloqueada.`)
      return
    }
    if (!profile || isSubmitting) return
    setIsSubmitting(true); setError(null); setFeedback(null)
    try {
      const created = await timeOffService.create(profile.id, { absenceType, startDate, endDate, reason, collaboratorName: profile.name })
      setRequests((current) => [...current, created].sort((left, right) => (left.startDate ?? left.date).localeCompare(right.startDate ?? right.date)))
      setAbsenceType('Folga'); setStartDate(''); setEndDate(''); setReason(''); setFeedback('Ausência registrada e encaminhada à supervisão da squad registrada.')
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar a solicitação.')
    } finally { setIsSubmitting(false) }
  }

  const removePending = async (request: TimeOffRequest) => {
    const corporateDataError = localDataAccessError(session)
    if (corporateDataError) throw new Error(`${corporateDataError} A exclusão de folgas corporativas permanece bloqueada.`)
    if (!profile) return
    await timeOffService.removePending(profile.id, request.id)
    setFeedback('Solicitação pendente retirada e preservada no histórico local.')
    await load()
  }

  const cancelApproved = async (request: TimeOffRequest, cancellationReason: string) => {
    const corporateDataError = localDataAccessError(session)
    if (corporateDataError) throw new Error(`${corporateDataError} O cancelamento de folgas corporativas permanece bloqueado.`)
    if (!profile) return
    await timeOffService.cancelApproved(profile.id, request.id, cancellationReason)
    setFeedback('Ausência cancelada. A supervisão foi notificada e a projeção foi recalculada.')
    await load()
  }

  return { today, requests, absenceType, setAbsenceType, startDate, setStartDate, endDate, setEndDate, reason, setReason, isLoading, isSubmitting, error, feedback, create, removePending, cancelApproved, reload: load }
}
