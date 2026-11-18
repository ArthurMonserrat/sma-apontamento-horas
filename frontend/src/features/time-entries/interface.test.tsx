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
  startDate: '2026-07-20', endDate: '2026-07-20', weekdaysOnly: true, contractorNumber: '', primaryCode: '', secondaryCode: '', activityId: '',
  hours: '', minutes: '', details: '', editReason: '',
} as unknown as TimeEntryFormValues

const filters: HistoryFiltersValue = {
  mode: 'MONTH', day: '2026-07-20', month: '2026-07', startDate: '2026-07-01', endDate: '2026-07-20',
  contractorNumber: '', primaryCode: '', secondaryCode: '', activityId: '', status: 'ACTIVE',
} as unknown as HistoryFiltersValue

describe('markup acessível de apontamentos e histórico', () => {
  it('oferece apenas contratada, atividade e os dois códigos livres', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('Número da contratada')
    expect(markup).toContain('Atividade realizada')
    expect(markup).toContain('Código primário')
    expect(markup).toContain('Código secundário')
    expect(markup).not.toContain('Cliente')
    expect(markup).not.toContain('Disciplina')
    expect(markup).not.toContain('Tipo de documento')
  })
  it('associa labels aos campos obrigatórios e limita a data ao dia corporativo', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('for="entry-start-date"')
    expect(markup).toContain('for="entry-end-date"')
    expect(markup).toContain('max="2026-07-20"')
    expect(markup).toContain('for="contractor-number"')
    expect(markup).toContain('for="primary-code"')
    expect(markup).toContain('for="secondary-code"')
    expect(markup).toContain('text-base')
    expect(markup).not.toContain('disabled=""')
  })

  it('remove a leitura e a seleção de documentos LD', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SessionContext.Provider value={{ session: null, profile: demoCollaborator, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
          <TimeEntryForm />
        </SessionContext.Provider>
      </MemoryRouter>,
    )

    expect(markup).not.toContain('Lista de Documentos')
    expect(markup).not.toContain('Documento (LD)')
  })

  it('remove cliente, disciplina e tipo documental da área de apontamento', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).not.toContain('name="clientName"')
    expect(markup).not.toContain('name="disciplineCode"')
    expect(markup).not.toContain('name="documentTypeCode"')
    expect(markup).not.toContain('Opcional. Preencha manualmente')
  })

  it('mantém a contratada, a atividade Outros e remove campos descontinuados', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('Outros')
    expect(markup).not.toContain('Se a data final for diferente')
    expect(markup).not.toContain('Avanço')
    expect(markup).not.toContain('Documento (LD)')
  })

  it('oferece filtros alinhados aos campos atuais de apontamento', () => {
    const markup = renderToStaticMarkup(<HistoryFilters value={filters} onChange={vi.fn()} onApply={vi.fn()} />)
    expect(markup).toContain('aria-label="Filtros do histórico"')
    expect(markup).toContain('for="history-mode"')
    expect(markup).toContain('for="history-contractor-number"')
    expect(markup).toContain('for="history-primary-code"')
    expect(markup).toContain('for="history-secondary-code"')
    expect(markup).toContain('Número da contratada')
    expect(markup).not.toContain('Cliente')
    expect(markup).not.toContain('Disciplina')
    expect(markup).not.toContain('Tipo de documento')
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
