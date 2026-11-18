import { describe, expect, it } from 'vitest'
import appRoutesSource from './routes/AppRoutes?raw'
import supervisorSource from '../pages/supervisor/SupervisorPage?raw'
import directorSource from '../pages/administration/DiretoriaPage?raw'
import teamsSource from '../pages/administration/EquipesPage?raw'
import reportsSource from '../pages/administration/RelatoriosPage?raw'
import sidebarSource from './layouts/DirectorSidebar.tsx?raw'
import gestorLayoutSource from './layouts/GestorLayout.tsx?raw'

describe('navegação da gestão', () => {
  it('remove rotas, links e abas de Avisos e solicitações de ausência', () => {
    expect(appRoutesSource).not.toContain('ManagerNoticesRedirect')
    expect(appRoutesSource).not.toContain('AvisosPage')
    expect(appRoutesSource).not.toContain('FolgasPage')
    expect(appRoutesSource).not.toContain('path="/avisos"')
    expect(appRoutesSource).not.toContain('path="folgas"')
    expect(appRoutesSource).not.toContain('path="avisos"')
    expect(supervisorSource).not.toContain("id: 'announcements'")
    expect(supervisorSource).not.toContain("id: 'requests'")
    expect(sidebarSource).not.toContain('/administracao?view=avisos')
    expect(gestorLayoutSource).not.toContain('to="/avisos"')
  })

  it('mantém somente uma opção ativa e impede que cards vizinhos expandam na edição', () => {
    expect(directorSource).toContain("import { DirectorSidebar } from '../../app/layouts/DirectorSidebar'")
    expect(teamsSource).toContain("import { DirectorSidebar } from '../../app/layouts/DirectorSidebar'")
    expect(reportsSource).toContain("import { DirectorSidebar } from '../../app/layouts/DirectorSidebar'")
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

  it('mantém cada aba restante do Supervisor identificada na URL', () => {
    expect(supervisorSource).toContain("const activeView = activeViewBySearchParam[searchParams.get('view') ?? ''] ?? 'entries'")
    expect(supervisorSource).toContain('navigate(supervisorPathByView[view])')
    expect(supervisorSource).toContain("history: '/supervisor?view=historico'")
    expect(supervisorSource).toContain("profile: '/supervisor?view=perfil'")
  })
})
