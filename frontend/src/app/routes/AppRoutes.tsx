import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { ColaboradorPage } from '../../pages/collaborator/ColaboradorPage'
import { HistoricoPage } from '../../pages/collaborator/HistoricoPage'
import { EcosystemLogin } from '../../pages/access/EcosystemLogin'
import { NovoApontamentoPage } from '../../pages/collaborator/NovoApontamentoPage'
import { PerfilPage } from '../../pages/collaborator/PerfilPage'
import { FolgasPage } from '../../pages/collaborator/FolgasPage'
import { ProtectedRoute } from '../../features/session/ProtectedRoute'
import { SupervisorPage } from '../../pages/supervisor/SupervisorPage'
import { DiretoriaPage } from '../../pages/administration/DiretoriaPage'
import { EquipesPage } from '../../pages/administration/EquipesPage'
import { RelatoriosPage } from '../../pages/administration/RelatoriosPage'
import { AvisosPage } from '../../pages/administration/AvisosPage'
import { ManagerNoticesRedirect } from '../../features/session/ManagerNoticesRedirect'
import { AuthCallbackPage } from '../../pages/access/AuthCallbackPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EcosystemLogin />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
