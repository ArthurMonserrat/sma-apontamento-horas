import 'dotenv/config';

import { ConfidentialClientApplication } from '@azure/msal-node';

export const USER_READ_SCOPE = ['User.Read'];

export class AuthenticationConfigurationError extends Error {
  constructor() {
    super('Required authentication configuration is missing.');
  }
}

export interface AuthenticationSettings {
  clientId: string;
  clientSecret: string;
  frontendUrl: string;
  redirectUri: string;
  tenantId: string;
}

export function getAuthenticationSettings(): AuthenticationSettings {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const frontendUrl = process.env.FRONTEND_URL;
  const redirectUri = process.env.REDIRECT_URI;
  const tenantId = process.env.TENANT_ID;

  if (!clientId || !clientSecret || !frontendUrl || !redirectUri || !tenantId) {
    throw new AuthenticationConfigurationError();
  }

  return { clientId, clientSecret, frontendUrl, redirectUri, tenantId };
}

export function createMsalClient(
  settings: AuthenticationSettings = getAuthenticationSettings(),
): ConfidentialClientApplication {
  return new ConfidentialClientApplication({
    auth: {
      authority: `https://login.microsoftonline.com/${settings.tenantId}`,
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
    },
  });
}
