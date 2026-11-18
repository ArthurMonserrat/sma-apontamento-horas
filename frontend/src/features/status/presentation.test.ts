import { describe, expect, it } from 'vitest'
import {
  approvalStatusPresentation,
  revisionStatusPresentation,
  timeEntryStatusPresentation,
  workloadRequestStatusPresentation,
} from './presentation'
import * as presentation from './presentation'

describe('catálogo de apresentação dos status', () => {
  it('diferencia aprovação, pendência, correção e ausência de envio', () => {
    expect(approvalStatusPresentation).toEqual({
      IN_PROGRESS: { label: 'Em andamento', tone: 'info' },
      AVAILABLE_FOR_APPROVAL: { label: 'Disponível para aprovação', tone: 'pending' },
      CORRECTION_REQUESTED: { label: 'Correção solicitada', tone: 'warning' },
      APPROVED: { label: 'Aprovado', tone: 'success' },
      REOPENED: { label: 'Reaberto', tone: 'info' },
      NO_SUBMISSION: { label: 'Sem apontamento enviado', tone: 'neutral' },
    })
  })

  it('mantém rejeição e cancelamento visualmente distintos nas solicitações', () => {
    const expected = {
      PENDING: { label: 'Pendente', tone: 'pending' },
      APPROVED: { label: 'Aprovada', tone: 'success' },
      REJECTED: { label: 'Rejeitada', tone: 'danger' },
      CANCELLED: { label: 'Cancelada', tone: 'cancelled' },
    } as const

    expect(workloadRequestStatusPresentation).toEqual(expected)
    expect('timeOffStatusPresentation' in presentation).toBe(false)
  })

  it('classifica cancelamento e edição sem criar estados de domínio', () => {
    expect(timeEntryStatusPresentation).toEqual({
      PENDING: { label: 'Pendente de aprovação', tone: 'pending' },
      APPROVED: { label: 'Aprovado', tone: 'success' },
      REJECTED: { label: 'Rejeitado', tone: 'danger' },
      ACTIVE: { label: 'Ativo', tone: 'neutral' },
      CANCELLED: { label: 'Cancelado', tone: 'cancelled' },
    })
    expect(revisionStatusPresentation).toEqual({ label: 'Editado', tone: 'info' })
  })
})
