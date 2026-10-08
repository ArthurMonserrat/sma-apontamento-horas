import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { ColaboradorPage } from '../pages/ColaboradorPage'
import { HistoricoPage } from '../pages/HistoricoPage'
import { LoginPage } from '../pages/LoginPage'
import { NovoApontamentoPage } from '../pages/NovoApontamentoPage'
import { PerfilPage } from '../pages/PerfilPage'
import { FolgasPage } from '../pages/FolgasPage'
import { ProtectedRoute } from '../features/session/ProtectedRoute'
import { PublicOnlyRoute } from '../features/session/PublicOnlyRoute'
import { SupervisorPage } from '../pages/SupervisorPage'
import { DiretoriaPage } from '../pages/DiretoriaPage'
import { EquipesPage } from '../pages/EquipesPage'
import { RelatoriosPage } from '../pages/RelatoriosPage'
import { AvisosPage } from '../pages/AvisosPage'
import { ManagerNoticesRedirect } from '../features/session/ManagerNoticesRedirect'
import { Portal } from '../pages/Portal'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/portal" replace />} />
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/portal" element={<ProtectedRoute allowedRoles={['COLLABORATOR', 'SUPERVISOR', 'DIRECTOR_ADMIN']}><Portal /></ProtectedRoute>} />
      <Route path="/avisos" element={<ProtectedRoute allowedRoles={['SUPERVISOR', 'DIRECTOR_ADMIN']}><ManagerNoticesRedirect /></ProtectedRoute>} />
      <Route path="/colaborador" element={<ProtectedRoute allowedRoles={['COLLABORATOR']}><AppLayout /></ProtectedRoute>}>
        <Route index element={<ColaboradorPage />} />
        <Route path="apontamentos/novo" element={<NovoApontamentoPage />} />
        <Route path="apontamentos/:entryId/editar" element={<NovoApontamentoPage />} />
        <Route path="historico" element={<HistoricoPage />} />
        <Route path="folgas" element={<FolgasPage />} />
        <Route path="avisos" element={<AvisosPage />} />
        <Route path="perfil" element={<PerfilPage />} />
      </Route>
      <Route path="/supervisor" element={<ProtectedRoute allowedRoles={['SUPERVISOR']}><SupervisorPage /></ProtectedRoute>} />
      <Route path="/administracao" element={<ProtectedRoute allowedRoles={['DIRECTOR_ADMIN']}><DiretoriaPage /></ProtectedRoute>} />
      <Route path="/administracao/equipes" element={<ProtectedRoute allowedRoles={['DIRECTOR_ADMIN']}><EquipesPage /></ProtectedRoute>} />
      <Route path="/administracao/relatorios" element={<ProtectedRoute allowedRoles={['DIRECTOR_ADMIN']}><RelatoriosPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
