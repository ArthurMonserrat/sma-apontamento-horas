import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type ExcelJS from 'exceljs'

const saved: Array<{ name: string; blob: Blob }> = []
vi.mock('file-saver', () => ({ saveAs: (blob: Blob, name: string) => { saved.push({ blob, name }) } }))

const visible = vi.fn()
vi.mock('../../time-entries/infrastructure/visibleTimeEntries', () => ({ listVisibleTimeEntries: () => visible() }))
vi.mock('../../corporate/corporateData', async (importOriginal) => ({ ...await importOriginal<object>(), isCorporateDataActive: () => true }))

import { exportSquadHoursReport } from './excelExportService'

function entry(id: string, name: string, team: string, entryDate: string, status = 'PENDING') {
  return {
    id, collaboratorId: `${id}-user`, collaboratorName: name, entryDate, clientName: 'Vale', projectCode: 'P-1', activityId: 'act',
    disciplineCode: 'E', documentTypeCode: 'DE', durationMinutes: 480, details: '', status, version: 1, createdAt: '', updatedAt: '',
    assignmentSnapshot: { squadId: 't1', squadName: team, supervisorId: 's', supervisorName: 'Renato Resende' },
  }
}

beforeEach(() => { saved.length = 0; visible.mockReset() })
afterEach(() => vi.clearAllMocks())

describe('exportação com login Microsoft', () => {
  it('exporta só os apontamentos do banco da supervisão e do mês, sem cancelados', async () => {
    visible.mockResolvedValue([
      entry('1', 'Hugo Barbosa', 'S12 - RENATO', '2026-10-20'),
      entry('2', 'Hamilton Junior', 'S12 - RENATO', '2026-10-21', 'CANCELLED'),
      entry('3', 'Outra Pessoa', 'Outra', '2026-10-21'),
      entry('4', 'Hugo Barbosa', 'S12 - RENATO', '2026-09-30'),
    ])
    await exportSquadHoursReport({ organograma: [], squadName: 'S12 - RENATO', mesSelecionado: 10, anoSelecionado: 2026 })
    expect(saved[0].name).toBe('Relatorio_Horas_S12_RENATO_2026-10.xlsx')
    const { default: Excel } = await import('exceljs')
    const workbook: ExcelJS.Workbook = new Excel.Workbook()
    await workbook.xlsx.load(await saved[0].blob.arrayBuffer())
    const sheet = workbook.getWorksheet('Apontamentos da Equipe')!
    const names: string[] = []
    sheet.eachRow((row, index) => { if (index > 2) names.push(String(row.getCell(1).value)) })
    expect(names).toEqual(['Hugo Barbosa'])
  })
})
