import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '../time-entries/types'
import { DailyEntryList } from './DailyEntryList'

const historicalEntry: TimeEntry = {
  id: 'historical-entry-1',
  collaboratorId: 'demo-collaborator-001',
  entryDate: '2026-07-20',
  clientName: 'Cliente Industrial Alfa',
  projectCode: 'SMA-001',
  activityId: 'activity-project-design',
  disciplineCode: '—',
  documentTypeCode: '—',
  durationMinutes: 60,
  details: 'Registro criado antes da ampliação do catálogo.',
  assignmentSnapshot: null,
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-07-20T12:00:00.000Z',
  updatedAt: '2026-07-20T12:00:00.000Z',
}

describe('lista diária de apontamentos', () => {
  it('mantém o estado vazio sem repetir a ação Novo apontamento', () => {
    const markup = renderToStaticMarkup(<DailyEntryList entries={[]} />)

    expect(markup).toContain('Nenhum apontamento registrado neste dia.')
    expect(markup).not.toContain('Novo apontamento')
    expect(markup).not.toContain('/colaborador/apontamentos/novo')
  })

  it('continua exibindo uma atividade histórica cujo identificador foi preservado', () => {
    const markup = renderToStaticMarkup(<DailyEntryList entries={[historicalEntry]} />)

    expect(markup).toContain('Elaboração de projeto')
    expect(markup).not.toContain('Cliente Industrial Alfa')
    expect(markup).toContain('Número da contratada: SMA-001')
    expect(markup).not.toContain('Número do projeto')
    expect(markup).toContain('Registro criado antes da ampliação do catálogo.')
  })

  it('destaca um registro editado e omite o badge na versão inicial', () => {
    const editedMarkup = renderToStaticMarkup(<DailyEntryList entries={[{ ...historicalEntry, version: 2 }]} />)
    const initialMarkup = renderToStaticMarkup(<DailyEntryList entries={[historicalEntry]} />)

    expect(editedMarkup).toContain('Editado')
    expect(initialMarkup).not.toContain('Editado')
  })
})
