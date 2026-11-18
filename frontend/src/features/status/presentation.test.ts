import { describe, expect, it } from 'vitest'
import {
  approvalStatusPresentation,
  revisionStatusPresentation,
  timeEntryStatusPresentation,
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

  it('não expõe apresentação para solicitações de alteração de carga', () => {
    expect('workloadRequestStatusPresentation' in presentation).toBe(false)
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
