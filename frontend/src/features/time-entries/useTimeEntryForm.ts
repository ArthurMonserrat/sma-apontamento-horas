import { useCallback, useEffect, useState } from 'react'
import { demoActivities } from '../../demo/fixtures/demoData'
import { dayApprovalService } from '../approvals'
import { entryDateAvailabilityService } from '../approvals'
import { timeEntryService } from './infrastructure/timeEntryService'
import type { CreateTimeEntryData, TimeEntry, TimeEntryValidationErrors } from './types'
import { expandTimeEntryDates } from './domain'
import { getCorporateToday, isIsoDate } from '../../shared/lib/date'
import { useSession } from '../session/useSession'
import { areValidDurationParts, hoursAndMinutesToMinutes, validateTimeEntry } from './domain'
import { offlineQueueService } from '../offline/infrastructure/offlineQueueService'
import type { ParsedRdoDay } from '../rdo/rdoParser'

export type TimeEntryFormValues = {
  startDate: string
  endDate: string
  weekdaysOnly: boolean
  contractorNumber: string
  primaryCode: string
  secondaryCode: string
  activityId: string
  hours: string
  minutes: string
  details: string
  editReason: string
}

const emptyValues = (entryDate: string): TimeEntryFormValues => ({
  startDate: entryDate,
  endDate: entryDate,
  weekdaysOnly: true,
  contractorNumber: '',
  primaryCode: '',
  secondaryCode: '',
  activityId: '',
  hours: '',
  minutes: '',
  details: '',
  editReason: '',
})

function valuesFromEntry(entry: TimeEntry): TimeEntryFormValues {
  return {
    startDate: entry.entryDate,
    endDate: entry.entryDate,
    weekdaysOnly: true,
    contractorNumber: entry.contractorNumber ?? '',
    primaryCode: entry.primaryCode ?? '',
    secondaryCode: entry.secondaryCode ?? '',
    activityId: entry.activityId,
    hours: String(Math.floor(entry.durationMinutes / 60)),
    minutes: String(entry.durationMinutes % 60),
    details: entry.details,
    editReason: '',
  }
}

type FormMode = 'CREATE' | 'EDIT' | 'DUPLICATE'

export function useTimeEntryForm({ initialDate, entryId, duplicateId }: { initialDate: string; entryId?: string; duplicateId?: string }) {
  const { profile } = useSession()
  const mode: FormMode = entryId ? 'EDIT' : duplicateId ? 'DUPLICATE' : 'CREATE'
  const sourceId = entryId ?? duplicateId
  const [source, setSource] = useState<TimeEntry | null>(null)
  const [values, setValues] = useState<TimeEntryFormValues>(() => emptyValues(initialDate))
  const [errors, setErrors] = useState<TimeEntryValidationErrors>({})
  const [editReasonError, setEditReasonError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(sourceId))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isReusingLastEntry, setIsReusingLastEntry] = useState(false)
  const [reuseLastEntryMessage, setReuseLastEntryMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!profile || !sourceId) return
    let active = true
    setIsLoading(true)
    timeEntryService.getById(profile.id, sourceId)
      .then((entry) => {
        if (!active) return
        if (!entry) {
          setSubmitError('O apontamento solicitado não foi encontrado.')
          return
        }
        setSource(entry)
        setValues(valuesFromEntry(entry))
      })
      .catch(() => active && setSubmitError('Não foi possível carregar o apontamento.'))
      .finally(() => active && setIsLoading(false))
    return () => { active = false }
  }, [profile, sourceId])

  const setField = useCallback(<Key extends keyof TimeEntryFormValues>(field: Key, value: TimeEntryFormValues[Key]) => {
    setValues((current) => {
      if (field !== 'startDate' || typeof value !== 'string') return { ...current, [field]: value }
      const shouldResetEndDate = !current.endDate || current.endDate < value || current.endDate === current.startDate
      return { ...current, startDate: value, endDate: shouldResetEndDate ? value : current.endDate }
    })
    if (field === 'editReason') setEditReasonError(null)
    else setErrors((current) => ({ ...current, [field]: undefined }))
  }, [])

  const reuseLastEntry = async () => {
    if (!profile || isReusingLastEntry || mode !== 'CREATE') return false
    setIsReusingLastEntry(true)
    setReuseLastEntryMessage(null)
    try {
      const { items } = await timeEntryService.list({
        collaboratorId: profile.id,
        startDate: '1900-01-01',
        endDate: getCorporateToday(),
        pageSize: 1,
        filters: { status: 'ACTIVE' },
      })
      const lastEntry = items[0]
      if (!lastEntry) {
        setReuseLastEntryMessage('Ainda não há um apontamento anterior para reutilizar.')
        return false
      }
      setValues((current) => ({
        ...current,
        contractorNumber: lastEntry.contractorNumber ?? lastEntry.projectCode ?? '',
        activityId: lastEntry.activityId,
        primaryCode: lastEntry.primaryCode ?? '',
        secondaryCode: lastEntry.secondaryCode ?? '',
      }))
      setErrors({})
      setReuseLastEntryMessage('Dados do último apontamento aplicados. Data, duração e detalhamento foram mantidos para revisão.')
      return true
    } catch {
      setReuseLastEntryMessage('Não foi possível carregar o último apontamento. Tente novamente.')
      return false
    } finally {
      setIsReusingLastEntry(false)
    }
  }

  const submit = async (importedRdoDays: ParsedRdoDay[] = []) => {
    if (!profile || isSubmitting) return false
    setSubmitError(null)
    setSuccessMessage(null)
    const hasImportedRdo = mode === 'CREATE' && importedRdoDays.length > 0
    const firstImportedRdoDay = importedRdoDays[0]
    const durationHours = Number(values.hours || 0)
    const durationRemainderMinutes = Number(values.minutes || 0)
    const projectNumber = values.contractorNumber.trim() || firstImportedRdoDay?.numeroObra?.trim() || ''
    const effectiveEntryDate = firstImportedRdoDay?.data ?? values.startDate
    const effectiveEndDate = hasImportedRdo ? effectiveEntryDate : mode === 'CREATE' ? values.endDate : values.startDate
    const effectiveWeekdaysOnly = hasImportedRdo ? false : mode === 'CREATE' ? values.weekdaysOnly : true
    const periodDates = hasImportedRdo
      ? importedRdoDays.map((day) => day.data)
      : mode === 'CREATE'
      ? expandTimeEntryDates(values.startDate, effectiveEndDate, effectiveWeekdaysOnly)
      : [values.startDate]
    const data: CreateTimeEntryData = {
      entryDate: effectiveEntryDate,
      endDate: effectiveEndDate,
      weekdaysOnly: effectiveWeekdaysOnly,
      contractorNumber: projectNumber,
      primaryCode: values.primaryCode,
      secondaryCode: values.secondaryCode,
      activityId: values.activityId,
      durationMinutes: hasImportedRdo && firstImportedRdoDay
        ? hoursAndMinutesToMinutes(firstImportedRdoDay.horas, firstImportedRdoDay.minutos)
        : hoursAndMinutesToMinutes(durationHours, durationRemainderMinutes),
      details: hasImportedRdo && firstImportedRdoDay ? firstImportedRdoDay.detalhamento : values.details,
    }
    let canMutateDate = true
    let dateBlock = { blocked: false } as Awaited<ReturnType<typeof entryDateAvailabilityService.getBlock>>
    if (isIsoDate(data.entryDate)) {
      try {
        const datesToCheck = periodDates.length > 0 ? periodDates : [data.entryDate]
        const [mutationAllowed, dateBlocks] = await Promise.all([
          mode === 'CREATE' && periodDates.length > 0
            ? dayApprovalService.canMutateRange(profile.id, periodDates)
            : dayApprovalService.canMutate(profile.id, data.entryDate),
          Promise.all(datesToCheck.map((date) => entryDateAvailabilityService.getBlock(profile.id, date))),
        ])
        canMutateDate = mutationAllowed
        dateBlock = dateBlocks.find((block) => block.blocked) ?? { blocked: false }
      } catch {
        setSubmitError('Não foi possível verificar os eventos desta data. Tente novamente.')
        return false
      }
    }
    const validationErrors = validateTimeEntry(data, demoActivities, { today: getCorporateToday(), canMutateDate })
    if (dateBlock.blocked) validationErrors.entryDate = dateBlock.message
    if (!hasImportedRdo && !areValidDurationParts(durationHours, durationRemainderMinutes)) {
      validationErrors.durationMinutes = 'Informe horas inteiras entre 0 e 24 e minutos inteiros entre 0 e 59, com total máximo de 24 horas.'
    }
    if (mode === 'CREATE') {
      if (hasImportedRdo) {
        const invalidDay = importedRdoDays.find((day) => !isIsoDate(day.data) || day.data > getCorporateToday() || !day.detalhamento.trim() || !areValidDurationParts(day.horas, day.minutos))
        if (invalidDay) {
          setSubmitError('O RDO possui um ou mais dias com data, duração ou detalhamento inválido.')
          return false
        }
      } else if (!isIsoDate(values.endDate)) {
        validationErrors.entryDate = validationErrors.entryDate ?? 'Informe uma data final válida.'
      } else if (values.endDate < values.startDate) {
        validationErrors.entryDate = validationErrors.entryDate ?? 'A data final deve ser igual ou posterior à data inicial.'
      } else if (values.startDate !== values.endDate && periodDates.length === 0) {
        setSubmitError('O período selecionado não contém dias úteis para lançamento.')
        return false
      }
    }
    const reasonError = mode === 'EDIT' && !values.editReason.trim() ? 'Informe o motivo da edição.' : null
    setErrors(validationErrors)
    setEditReasonError(reasonError)
    if (Object.keys(validationErrors).length > 0 || reasonError) return false
    if ((mode === 'EDIT' || mode === 'DUPLICATE') && !source) {
      setSubmitError('O apontamento de origem não está disponível.')
      return false
    }

    setIsSubmitting(true)
    try {
      if (mode === 'EDIT' && source) {
        const updated = await timeEntryService.update(profile.id, source.id, source.version, data, values.editReason)
        setSource(updated)
        setValues(valuesFromEntry(updated))
        setSuccessMessage('Apontamento atualizado com sucesso.')
      } else if (mode === 'DUPLICATE' && source) {
        await timeEntryService.duplicate(profile.id, source.id, source.version, data)
        setSuccessMessage('Apontamento duplicado com sucesso.')
      } else {
        if (hasImportedRdo) {
          const importedEntries = importedRdoDays.map((day) => ({
            ...data,
            entryDate: day.data,
            endDate: day.data,
            weekdaysOnly: false,
            durationMinutes: hoursAndMinutesToMinutes(day.horas, day.minutos),
            details: day.detalhamento,
            contractorNumber: projectNumber || day.numeroObra,
          }))
          await Promise.all(importedEntries.map(async (entry) => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              await offlineQueueService.enqueue({ id: crypto.randomUUID(), status: 'PENDING', collaboratorId: profile.id, data: entry })
              return
            }
            await timeEntryService.create(profile.id, entry)
          }))
          setSuccessMessage(`${importedRdoDays.length} lançamentos do RDO salvos individualmente com sucesso.`)
        } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
          await offlineQueueService.enqueue({
            id: crypto.randomUUID(),
            status: 'PENDING',
            collaboratorId: profile.id,
            data,
          })
          setSuccessMessage('Sem conexão. Apontamento salvo localmente e aguardando rede.')
        } else {
          await timeEntryService.create(profile.id, data)
          setSuccessMessage(periodDates.length > 1
            ? `${periodDates.length} lançamentos salvos com sucesso para o período selecionado.`
            : 'Apontamento salvo com sucesso.')
        }
      }
      setErrors({})
      setEditReasonError(null)
      if (mode !== 'EDIT') setValues(emptyValues(data.entryDate))
      return true
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar o apontamento localmente.')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    mode,
    values,
    errors,
    editReasonError,
    isLoading,
    isSubmitting,
    isReusingLastEntry,
    submitError,
    successMessage,
    reuseLastEntryMessage,
    setField,
    reuseLastEntry,
    submit,
  }
}
