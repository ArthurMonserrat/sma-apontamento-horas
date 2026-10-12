import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes/AppRoutes'
import { OnboardingTour } from './providers/OnboardingTour'
import { OfflineSyncProvider } from '../features/offline/useOfflineSync'

export function App() {
  return (
    <HashRouter>
      <OfflineSyncProvider>
        <OnboardingTour>
          <AppRoutes />
        </OnboardingTour>
      </OfflineSyncProvider>
    </HashRouter>
  )
}
