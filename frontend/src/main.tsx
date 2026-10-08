import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { App } from './app/App'
import { ThemeProvider } from './app/ThemeProvider'
import { DemoSessionProvider } from './features/session/DemoSessionProvider'
import { msalConfig } from './config/msalConfig'
import { registerSW } from 'virtual:pwa-register'
import './styles/index.css'

registerSW({ immediate: true })

const msalInstance = new PublicClientApplication(msalConfig)
msalInstance.handleRedirectPromise().then((response) => {
  if (response?.account) msalInstance.setActiveAccount(response.account)
  if (!response && !msalInstance.getActiveAccount()) {
    const account = msalInstance.getAllAccounts()[0]
    if (account) msalInstance.setActiveAccount(account)
  }
}).catch((error) => console.warn('[MSAL] callback ignorado:', error))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <DemoSessionProvider>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </DemoSessionProvider>
    </ThemeProvider>
  </StrictMode>,
)
