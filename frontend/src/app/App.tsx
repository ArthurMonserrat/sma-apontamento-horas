import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes/AppRoutes'
import { OnboardingTour } from './providers/OnboardingTour'
import { OfflineSyncProvider } from '../features/offline/useOfflineSync'
import { AnnouncementNotificationsProvider } from '../features/announcements/notifications/AnnouncementNotificationsProvider'

export function App() {
  return (
    <HashRouter>
      <OfflineSyncProvider>
        <OnboardingTour>
          <AnnouncementNotificationsProvider>
            <AppRoutes />
          </AnnouncementNotificationsProvider>
        </OnboardingTour>
      </OfflineSyncProvider>
    </HashRouter>
  )
}
