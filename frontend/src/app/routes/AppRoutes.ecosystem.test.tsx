import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../providers/themeContext'
import { DemoSessionProvider } from '../../features/session/DemoSessionProvider'
import { AppRoutes } from './AppRoutes'
import appRoutesSource from './AppRoutes.tsx?raw'

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    accounts: [],
    inProgress: 'none',
    instance: { getActiveAccount: () => null },
  }),
}))

describe('rota raiz do ecossistema', () => {
  it('renderiza a seleção de bancos diretamente em /', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => undefined }}>
          <DemoSessionProvider><AppRoutes /></DemoSessionProvider>
        </ThemeContext.Provider>
      </MemoryRouter>,
    )

    expect(markup).toContain('Banco de Horas 1')
    expect(markup).toContain('Banco de Horas 2 (Campo e Estudos)')
  })

  it('preserva o contrato completo de paths, perfis e fallback', () => {
    const normalizedSource = appRoutesSource.replace(/\s+/g, ' ')

    const publicRoutes = [
      '<Route path="/" element={<EcosystemLogin />} />',
      '<Route path="/login" element={<Navigate to="/" replace />} />',
    ]
    const protectedRoutes = [
      ['/selecao-perfil', "['COLLABORATOR', 'SUPERVISOR', 'DIRECTOR_ADMIN']", 'ProfileSelectionPage'],
      ['/portal', "['COLLABORATOR', 'SUPERVISOR', 'DIRECTOR_ADMIN']", 'Portal'],
      ['/avisos', "['SUPERVISOR', 'DIRECTOR_ADMIN']", 'ManagerNoticesRedirect'],
      ['/colaborador', "['COLLABORATOR']", 'AppLayout'],
      ['/supervisor', "['SUPERVISOR']", 'SupervisorPage'],
      ['/administracao', "['DIRECTOR_ADMIN']", 'DiretoriaPage'],
      ['/administracao/equipes', "['DIRECTOR_ADMIN']", 'EquipesPage'],
      ['/administracao/relatorios', "['DIRECTOR_ADMIN']", 'RelatoriosPage'],
    ] as const
    const collaboratorChildren = [
      '<Route index element={<ColaboradorPage />} />',
      '<Route path="apontamentos/novo" element={<NovoApontamentoPage />} />',
      '<Route path="apontamentos/:entryId/editar" element={<NovoApontamentoPage />} />',
      '<Route path="historico" element={<HistoricoPage />} />',
      '<Route path="folgas" element={<FolgasPage />} />',
      '<Route path="avisos" element={<AvisosPage />} />',
      '<Route path="perfil" element={<PerfilPage />} />',
    ]

    publicRoutes.forEach((route) => expect(normalizedSource).toContain(route))
    protectedRoutes.forEach(([path, roles, page]) => {
      expect(normalizedSource).toContain(
        `<Route path="${path}" element={<ProtectedRoute allowedRoles={${roles}}><${page} /></ProtectedRoute>}`,
      )
    })
    collaboratorChildren.forEach((route) => expect(normalizedSource).toContain(route))
    expect(normalizedSource).toContain('<Route path="*" element={<Navigate to="/" replace />} />')
  })
})
