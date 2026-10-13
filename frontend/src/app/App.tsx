import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes/AppRoutes'
import { OnboardingTour } from './providers/OnboardingTour'
import { OfflineSyncProvider } from '../features/offline/useOfflineSync'
import { AuthSync } from '../features/auth/AuthSync'

export function App() {
  return (
    <HashRouter>
      <OfflineSyncProvider>
        <AuthSync>
          <OnboardingTour>
            <AppRoutes />
          </OnboardingTour>
        </AuthSync>
      </OfflineSyncProvider>
    </HashRouter>
  )
}
