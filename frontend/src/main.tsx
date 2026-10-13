import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { App } from './app/App'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { DemoSessionProvider } from './features/session/DemoSessionProvider'
import { msalInstance } from './config/authConfig'
import { registerSW } from 'virtual:pwa-register'
import './styles/index.css'

registerSW({ immediate: true })

async function bootstrap() {
  try {
    await msalInstance.initialize()
    const redirectResponse = await msalInstance.handleRedirectPromise()
    if (redirectResponse?.account) msalInstance.setActiveAccount(redirectResponse.account)
    const accounts = msalInstance.getAllAccounts()
    if (!msalInstance.getActiveAccount() && accounts[0]) msalInstance.setActiveAccount(accounts[0])
  } catch (error) {
    console.error('[MSAL] Falha ao inicializar a autenticação:', error)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <ThemeProvider>
          <DemoSessionProvider>
            <App />
          </DemoSessionProvider>
        </ThemeProvider>
      </MsalProvider>
    </StrictMode>,
  )
}

void bootstrap()
