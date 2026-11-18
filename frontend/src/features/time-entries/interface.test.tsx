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
}

const filters: HistoryFiltersValue = {
  mode: 'MONTH', day: '2026-07-20', month: '2026-07', startDate: '2026-07-01', endDate: '2026-07-20',
  contractorNumber: '', primaryCode: '', secondaryCode: '', activityId: '', status: 'ACTIVE',
}

describe('markup acessível de apontamentos e histórico', () => {
  it('oferece contratada manual e atividades disponíveis', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('Número da contratada')
    expect(markup).toContain('Atividade realizada')
    expect(markup).toContain('Outros')
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
  })

  it('não oferece cliente nem seleção de projeto no formulário', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).not.toContain('name="clientName"')
    expect(markup).not.toContain('Projeto')
    expect(markup).not.toContain('LD')
  })

  it('usa somente os campos manuais de contratada, atividade e códigos', () => {
    const markup = renderToStaticMarkup(<TimeEntryFields values={values} errors={{}} maxDate="2026-07-20" onChange={vi.fn()} />)
    expect(markup).toContain('Número da contratada')
    expect(markup).toContain('Atividade realizada')
    expect(markup).toContain('Código primário')
    expect(markup).toContain('Código secundário')
    expect(markup).not.toContain('Cliente')
    expect(markup).not.toContain('Disciplina')
    expect(markup).not.toContain('Tipo de documento')
    expect(markup).not.toContain('Se a data final for diferente')
  })

  it('oferece filtros de período e dados individuais com labels', () => {
    const markup = renderToStaticMarkup(<HistoryFilters value={filters} onChange={vi.fn()} onApply={vi.fn()} />)
    expect(markup).toContain('aria-label="Filtros do histórico"')
    expect(markup).toContain('for="history-mode"')
    expect(markup).toContain('for="history-contractor"')
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
    expect(markup).not.toContain('Lista de Documentos (LD)')
    expect(markup).not.toContain('Selecionar projeto')
  })
})
