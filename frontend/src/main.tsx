import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { DemoSessionProvider } from './features/session/DemoSessionProvider'
import { registerSW } from 'virtual:pwa-register'
import './styles/index.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <DemoSessionProvider>
        <App />
      </DemoSessionProvider>
    </ThemeProvider>
  </StrictMode>,
)
