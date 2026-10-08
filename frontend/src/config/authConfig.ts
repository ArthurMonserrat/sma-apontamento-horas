import { PublicClientApplication, type Configuration } from '@azure/msal-browser'

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || ''
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID || 'TENANT_ID'

if (!clientId) {
  console.warn('[MSAL] VITE_MSAL_CLIENT_ID ainda não foi configurado pela equipe de TI.')
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: typeof window === 'undefined' ? '/' : `${window.location.origin}/`,
    navigateToLoginRequestUrl: false,
  } as Configuration['auth'],
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  } as Configuration['cache'],
}

export const loginRequest = {
  scopes: ['User.Read'],
}

export const msalInstance = new PublicClientApplication(msalConfig)
