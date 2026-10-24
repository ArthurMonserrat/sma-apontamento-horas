import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../providers/themeContext'
import { SessionContext } from '../../features/session/sessionContext'
import { AppRoutes } from './AppRoutes'
import appRoutesSource from './AppRoutes.tsx?raw'

describe('rota raiz do ecossistema', () => {
  it('renderiza a seleção de bancos diretamente em /', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => undefined }}>
          <SessionContext.Provider value={{ session: null, profile: null, isLoading: false, signIn: vi.fn(), signInWithMicrosoft: vi.fn(), markAuthReady: vi.fn(), signOut: vi.fn() }}>
            <AppRoutes />
          </SessionContext.Provider>
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
      ['/avisos', "['SUPERVISOR', 'DIRECTOR_ADMIN']", 'ManagerNoticesRedirect'],
      ['/colaborador', "['COLLABORATOR']", 'AppLayout'],
      ['/supervisor', "['SUPERVISOR']", 'SupervisorPage'],
      ['/administracao', "['DIRECTOR_ADMIN']", 'DiretoriaPage'],
      ['/administracao/equipes', "['DIRECTOR_ADMIN']", 'EquipesPage'],
      ['/administracao/relatorios', "['DIRECTOR_ADMIN']", 'RelatoriosPage'],
      ['/administracao/perfil', "['DIRECTOR_ADMIN']", 'DiretorPerfilPage'],
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
