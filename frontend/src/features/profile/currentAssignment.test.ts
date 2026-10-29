import { afterEach, describe, expect, it, vi } from 'vitest'

const corporate = vi.hoisted(() => ({ active: false }))
vi.mock('../corporate/corporateData', async (importOriginal) => ({ ...await importOriginal<object>(), isCorporateDataActive: () => corporate.active }))
vi.mock('../time-entries/infrastructure/supabaseTimeEntryService', async (importOriginal) => ({
  ...await importOriginal<object>(),
  resolveCorporateAssignment: vi.fn(async () => ({ squadId: 't1', squadName: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende' })),
}))
vi.mock('./infrastructure/profileService', () => ({
  profileService: { resolveAssignment: vi.fn(() => ({ squadId: 'squad-automation', squadName: 'Engenharia de Automação', supervisorId: 'supervisor-demo-001', supervisorName: 'Jeen Carlos E. Azevedo' })) },
}))

import { resolveCurrentAssignment } from './currentAssignment'

afterEach(() => { corporate.active = false })

describe('resolveCurrentAssignment', () => {
  it('com login Microsoft usa a supervisão do banco de dados', async () => {
    corporate.active = true
    expect(await resolveCurrentAssignment('arthur')).toMatchObject({ squadName: 'S12 - RENATO', supervisorName: 'Renato Resende' })
  })

  it('no modo demonstração continua usando a squad local', async () => {
    expect(await resolveCurrentAssignment('demo')).toMatchObject({ supervisorName: 'Jeen Carlos E. Azevedo' })
  })
})
