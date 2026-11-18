import { describe, expect, it } from 'vitest'
import { buildEmptyCorporateDashboardData } from './useCollaboratorDashboard'

describe('dashboard corporativo sem dados', () => {
  it('mantém a estrutura visível com valores vazios, sem erro demonstrativo', () => {
    const dashboard = buildEmptyCorporateDashboardData({
      collaboratorId: 'corporate-user',
      monthKey: '2026-11',
      selectedDate: '2026-11-18',
      today: '2026-11-18',
    })

    expect(dashboard.monthSummary.workedMinutes).toBe(0)
    expect(dashboard.monthSummary.days).toHaveLength(30)
    expect(dashboard.selectedEntries).toEqual([])
    expect(dashboard.selectedEvents).toEqual([])
    expect(dashboard.approvals).toEqual([])
    expect(dashboard.assignment).toBeNull()
    expect(dashboard.currentWorkload).toBeNull()
    expect(dashboard.attention).toEqual({ pendingDays: 0, availableForApprovalDays: 0, correctionRequestedDays: 0 })
  })
})
