import { describe, expect, it } from 'vitest'
import {
  LEGACY_V1_TIME_ENTRY_STORAGE_KEY,
  LEGACY_V2_TIME_ENTRY_STORAGE_KEY,
  LEGACY_V3_TIME_ENTRY_STORAGE_KEY,
  TIME_ENTRY_STORAGE_KEY,
  timeEntryService,
} from '.'
import { dayApprovalService, entryDateAvailabilityService } from '../approvals'

describe('public domain APIs', () => {
  it('preserves time-entry storage keys and the service contract', () => {
    expect(TIME_ENTRY_STORAGE_KEY).toBe('apontamentos_sma')
    expect(LEGACY_V1_TIME_ENTRY_STORAGE_KEY).toBe('sma:time-entries:v1')
    expect(LEGACY_V2_TIME_ENTRY_STORAGE_KEY).toBe('sma:time-entries:v2')
    expect(LEGACY_V3_TIME_ENTRY_STORAGE_KEY).toBe('sma:time-entries:v3')
    expect(timeEntryService).toMatchObject({
      create: expect.any(Function),
      update: expect.any(Function),
      list: expect.any(Function),
      listByDate: expect.any(Function),
    })
  })

  it('exposes approval policies used by the application composition', () => {
    expect(dayApprovalService.canMutate).toEqual(expect.any(Function))
    expect(entryDateAvailabilityService.getBlock).toEqual(expect.any(Function))
  })
})
