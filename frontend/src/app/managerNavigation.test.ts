import { describe, expect, it } from 'vitest'
import appRoutesSource from './AppRoutes.tsx?raw'
import supervisorSource from '../pages/SupervisorPage.tsx?raw'
import directorSource from '../pages/DiretoriaPage.tsx?raw'
import teamsSource from '../pages/EquipesPage.tsx?raw'
import reportsSource from '../pages/RelatoriosPage.tsx?raw'
import announcementsSource from '../pages/AvisosPage.tsx?raw'
import sidebarSource from '../components/DirectorSidebar.tsx?raw'

describe('navegação da gestão', () => {
  it('mantém Avisos dentro da shell do perfil que está autenticado', () => {
    expect(appRoutesSource).toContain('<ManagerNoticesRedirect />')
    expect(appRoutesSource).not.toContain('<GestorLayout />')
    expect(supervisorSource).toContain("id: 'announcements'")
    expect(sidebarSource).toContain('/administracao?view=avisos')
  })

  it('mantém somente uma opção ativa e impede que cards vizinhos expandam na edição', () => {
    expect(directorSource).toContain("import { DirectorSidebar } from '../components/DirectorSidebar'")
    expect(teamsSource).toContain("import { DirectorSidebar } from '../components/DirectorSidebar'")
    expect(reportsSource).toContain("import { DirectorSidebar } from '../components/DirectorSidebar'")
    expect(sidebarSource).toContain('aria-current={isActive ? \'page\' : undefined}')
    expect(teamsSource).toContain('items-start')
    expect(teamsSource).toContain('text-white')
    expect(teamsSource).not.toContain('text-[#06241f]')
  })

  it('usa a mesma shell flexível da Direção na área da Supervisão', () => {
    expect(supervisorSource).toContain('className="flex min-w-0"')
    expect(supervisorSource).toContain('className="min-w-0 flex-1 overflow-x-hidden')
    expect(supervisorSource).toContain('w-64 shrink-0')
    expect(supervisorSource).not.toContain('grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)]')
  })

  it('mantém cada aba do Supervisor identificada na URL, sem voltar à gestão ao sair de Avisos', () => {
    expect(supervisorSource).toContain("const activeView = activeViewBySearchParam[searchParams.get('view') ?? ''] ?? 'entries'")
    expect(supervisorSource).toContain('navigate(supervisorPathByView[view])')
    expect(supervisorSource).toContain("requests: '/supervisor?view=solicitacoes'")
    expect(supervisorSource).toContain("history: '/supervisor?view=historico'")
    expect(supervisorSource).toContain("profile: '/supervisor?view=perfil'")
    expect(supervisorSource).toContain("announcements: '/supervisor?view=avisos'")
  })

  it('posiciona Avisos antes de Meu Perfil na navegação do Supervisor', () => {
    expect(supervisorSource.indexOf("id: 'announcements'"))
      .toBeLessThan(supervisorSource.indexOf("id: 'profile'"))
  })

  it('nomeia a página do colaborador como Avisos', () => {
    expect(announcementsSource).toContain('title="Avisos"')
    expect(announcementsSource).not.toContain('title="Quadro de Avisos"')
  })
})
