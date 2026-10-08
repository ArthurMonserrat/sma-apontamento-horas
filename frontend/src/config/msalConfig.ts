import type { Configuration } from '@azure/msal-browser'

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || '00000000-0000-0000-0000-000000000000'
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID || 'common'

if (!import.meta.env.VITE_MSAL_CLIENT_ID) {
  console.warn('[MSAL] VITE_MSAL_CLIENT_ID não configurado; o portal usará a sessão do BFF/demo.')
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: typeof window === 'undefined' ? '/' : window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
}

export const loginRequest = {
  scopes: ['User.Read'],
}
