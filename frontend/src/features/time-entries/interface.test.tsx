import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { SessionContext } from '../session/sessionContext'
import { HistoryFilters } from '../history/HistoryFilters'
import type { HistoryFiltersValue } from '../history/useTimeEntryHistory'
import { TimeEntryForm } from './TimeEntryForm'
import { TimeEntryFields } from './TimeEntryFields'
import type { TimeEntryFormValues } from './useTimeEntryForm'

const values: TimeEntryFormValues = {
  startDate: '2026-07-20', endDate: '2026-07-20', weekdaysOnly: true, clientName: '', contractorNumber: '', activityId: '', disciplineCode: '', documentTypeCode: '',
  hours: '', minutes: '', details: '', editReason: '',
}

const filters: HistoryFiltersValue = {
  mode: 'MONTH', day: '2026-07-20', month: '2026-07', startDate: '2026-07-01', endDate: '2026-07-20',
  clientName: '', projectCode: '', activityId: '', disciplineCode: '', documentTypeCode: '', status: 'ACTIVE',
}

describe('markup acessível de apontamentos e histórico', () => {
  it('oferece contratada manual, Geral e Mecânica', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('Número da contratada')
    expect(markup).toContain('value="G"')
    expect(markup).toContain('Mecânica')
  })
  it('associa labels aos campos obrigatórios e limita a data ao dia corporativo', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('for="entry-start-date"')
    expect(markup).toContain('for="entry-end-date"')
    expect(markup).toContain('max="2026-07-20"')
    expect(markup).toContain('for="client"')
    expect(markup).not.toContain('for="project-code"')
    expect(markup).toContain('for="contractor-number"')
    expect(markup).toContain('for="discipline"')
    expect(markup).toContain('for="document-type"')
    expect(markup).toContain('text-base')
  })

  it('usa campo textual para cliente em vez do catálogo demonstrativo', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('name="clientName"')
    expect(markup).not.toContain('<select id="client"')
    expect(markup).not.toContain('Selecione um cliente')
  })

  it('torna o cliente somente leitura quando ele veio da LD', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={{ ...values, clientName: 'VALE', ldDocument: { valeNumber: 'VA-001', title: 'Documento', documentTypeCode: 'LD', disciplineName: 'GERAL', fileName: 'base.xlsm' } }} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('name="clientName"')
    expect(markup).toContain('readOnly=""')
    expect(markup).toContain('Identificado automaticamente pela LD')
  })

  it('mantém a contratada, a atividade Outros e remove campos descontinuados', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).not.toContain('Número do projeto')
    expect(markup).toContain('Outros')
    expect(markup).toContain('Se a data final for diferente')
    expect(markup).not.toContain('Avanço')
    expect(markup).not.toContain('Documento (LD)')
  })

  it('oferece filtros de período e dados individuais com labels', () => {
    const markup = renderToStaticMarkup(<HistoryFilters value={filters} onChange={vi.fn()} onApply={vi.fn()} />)
    expect(markup).toContain('aria-label="Filtros do histórico"')
    expect(markup).toContain('for="history-mode"')
    expect(markup).toContain('for="history-client"')
    expect(markup).toContain('for="history-project"')
    expect(markup).toContain('Número da contratada')
    expect(markup).not.toContain('Número do projeto')
    expect(markup).toContain('value="G"')
    expect(markup).toContain('Geral')
    expect(markup).toContain('value="M"')
    expect(markup).toContain('Mecânica')
    expect(markup).toContain('for="history-document-type"')
    expect(markup).toContain('Situação do apontamento')
    expect(markup).toContain('Somente ativos')
    expect(markup).toContain('Somente cancelados')
    expect(markup).not.toContain('Exibição paginada')
  })

  it('nomeia a confirmação de cancelamento sem usar alert do navegador', () => {
    const markup = renderToStaticMarkup(<ConfirmDialog open title="Cancelar apontamento?" description="Confirme a operação" confirmLabel="Confirmar" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('Cancelar apontamento?')
  })

  it('oferece o atalho para reutilizar o último apontamento em um novo lançamento', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SessionContext.Provider value={{ session: null, profile: demoCollaborator, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
          <TimeEntryForm />
        </SessionContext.Provider>
      </MemoryRouter>,
    )

    expect(markup).toContain('Usar último apontamento')
    expect(markup).toContain('Dados de identificação serão preenchidos; data, duração e detalhamento permanecem para revisão.')
  })
})
