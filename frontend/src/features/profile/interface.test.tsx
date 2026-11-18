import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { demoAssignmentSnapshot, demoCollaborator, demoSquads, demoWorkloadVersions } from '../../demo/fixtures/demoData'
import { ProfileSummary } from './ProfileSummary'
import { SquadSelector } from './SquadSelector'
import { WorkloadHistory } from '../workloads/WorkloadHistory'
import { InitialWorkloadForm } from '../workloads/InitialWorkloadForm'

describe('interface de perfil profissional', () => {
  it('exibe status, squad e supervisor, sem localização nem carga vigente', () => {
    const markup = renderToStaticMarkup(<ProfileSummary profile={demoCollaborator} assignment={demoAssignmentSnapshot} />)
    for (const text of ['Ativo', 'Engenharia de Automação', 'Jeen Carlos E. Azevedo']) expect(markup).toContain(text)
    for (const text of ['Localização', 'São Paulo', 'Carga diária vigente']) expect(markup).not.toContain(text)
    expect(markup).toContain('Use &quot;Editar Perfil&quot;')
  })

  it('com login Microsoft mostra equipe, supervisor e cargo definidos pela diretoria', () => {
    const markup = renderToStaticMarkup(<ProfileSummary profile={demoCollaborator} managedByCompany jobTitle="Engenheiro"
      assignment={{ squadId: 't1', squadName: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende' }} />)
    for (const text of ['Equipe atual', 'S12 - RENATO', 'Renato Resende', 'Engenheiro', 'definidos pela diretoria']) expect(markup).toContain(text)
    expect(markup).not.toContain('Jeen Carlos')
    expect(markup).not.toContain('Editar Perfil')
  })

  it('com login Microsoft e sem equipe mostra não definido', () => {
    const markup = renderToStaticMarkup(<ProfileSummary profile={demoCollaborator} managedByCompany jobTitle={null} assignment={null} />)
    expect(markup).toContain('Não definida')
    expect(markup).toContain('Não definido')
    expect(markup).not.toContain(demoCollaborator.jobTitle)
  })

  it('permite escolher somente squad e informa que o supervisor é automático', () => {
    const markup = renderToStaticMarkup(<SquadSelector squads={demoSquads} activeSquadId="squad-automation" isSaving={false} onChange={vi.fn()} />)
    expect(markup).toContain('for="active-squad"')
    expect(markup).toContain('supervisor será definido automaticamente')
    expect(markup).not.toContain('Selecione o supervisor')
  })

  it('permite cadastrar apenas a carga horária inicial', () => {
    const markup = renderToStaticMarkup(<InitialWorkloadForm hours="" minutes="" effectiveFrom="" observation="" minDate="2026-07-20" isSubmitting={false} onFieldChange={vi.fn()} onSubmit={vi.fn()} />)
    expect(markup).toContain('Nova carga diária')
    expect(markup).toContain('for="workload-observation"')
    expect(markup).not.toContain('Solicitar alteração de carga')
    expect(markup).not.toContain('Enviar solicitação')
  })

  it('exibe somente o histórico administrativo de carga', () => {
    const markup = renderToStaticMarkup(<WorkloadHistory versions={demoWorkloadVersions} />)
    expect(markup).toContain('Histórico de cargas')
    expect(markup).not.toContain('Solicitações de alteração')
  })
})
