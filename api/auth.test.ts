import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const msal = vi.hoisted(() => ({
  acquireTokenByCode: vi.fn(),
  getAuthCodeUrl: vi.fn(),
}));

vi.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: class {
    acquireTokenByCode = msal.acquireTokenByCode;
    getAuthCodeUrl = msal.getAuthCodeUrl;
  },
}));

import login from './login';
import redirect from './redirect';

const managedEnvironment = [
  'CLIENT_ID',
  'CLIENT_SECRET',
  'TENANT_ID',
  'REDIRECT_URI',
  'FRONTEND_URL',
  'NODE_ENV',
] as const;

const originalEnvironment = Object.fromEntries(
  managedEnvironment.map((name) => [name, process.env[name]]),
);

function setEnvironment(values: Partial<Record<(typeof managedEnvironment)[number], string>> = {}) {
  for (const name of managedEnvironment) {
    delete process.env[name];
  }

  Object.assign(process.env, values);
}

function createResponse() {
  const response = {
    body: undefined as unknown,
    headers: {} as Record<string, string | string[]>,
    statusCode: 200,
    json(body: unknown) {
      response.body = body;
    },
    redirect(url: string) {
      response.statusCode = 302;
      response.headers.Location = url;
    },
    setHeader(name: string, value: string | string[]) {
      response.headers[name] = value;
    },
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
  };

  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnvironment({
    CLIENT_ID: 'client-id',
    CLIENT_SECRET: 'client-secret',
    TENANT_ID: 'tenant-id',
    REDIRECT_URI: 'https://app.example.test/api/redirect',
    FRONTEND_URL: 'https://app.example.test',
  });
});

afterEach(() => {
  setEnvironment(originalEnvironment);
});

describe('login', () => {
  test('returns 500 without exposing configuration when required settings are absent', async () => {
    setEnvironment();
    const response = createResponse();

    await login({ query: {} }, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Authentication configuration is unavailable.' });
  });

  test('redirects to Microsoft with the configured callback and User.Read scope', async () => {
    msal.getAuthCodeUrl.mockResolvedValue('https://login.microsoftonline.com/authorize');
    const response = createResponse();

    await login({ query: {} }, response);

    expect(msal.getAuthCodeUrl).toHaveBeenCalledWith({
      redirectUri: 'https://app.example.test/api/redirect',
      scopes: ['User.Read'],
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.Location).toBe('https://login.microsoftonline.com/authorize');
  });
});

describe('redirect', () => {
  test('returns 400 when the authorization code is absent', async () => {
    const response = createResponse();

    await redirect({ query: {} }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Authorization code is required.' });
  });

  test('returns 400 when Microsoft sends an authorization error', async () => {
    const response = createResponse();

    await redirect({ query: { error: 'access_denied' } }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'Microsoft authorization was not completed.' });
  });

  test('stores only the access token in a protected cookie and redirects to the collaborator area', async () => {
    msal.acquireTokenByCode.mockResolvedValue({ accessToken: 'access-token' });
    setEnvironment({
      CLIENT_ID: 'client-id',
      CLIENT_SECRET: 'client-secret',
      TENANT_ID: 'tenant-id',
      REDIRECT_URI: 'https://app.example.test/api/redirect',
      FRONTEND_URL: 'https://app.example.test',
      NODE_ENV: 'production',
    });
    const response = createResponse();

    await redirect({ query: { code: 'authorization-code' } }, response);

    expect(msal.acquireTokenByCode).toHaveBeenCalledWith({
      code: 'authorization-code',
      redirectUri: 'https://app.example.test/api/redirect',
      scopes: ['User.Read'],
    });
    expect(response.headers['Set-Cookie']).toBe(
      'sma_session=access-token; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    expect(response.statusCode).toBe(302);
    expect(response.headers.Location).toBe('https://app.example.test/portal');
  });
});
