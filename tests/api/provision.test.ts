import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.hoisted(() => vi.fn());
const insertedSingle = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle })),
  })),
  insert: vi.fn(() => ({
    select: vi.fn(() => ({ single: insertedSingle })),
  })),
})));
const createClient = vi.hoisted(() => vi.fn(() => ({ from })));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

import provision from '../../api/provision';

const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ENABLE_LEGACY_MSAL: process.env.ENABLE_LEGACY_MSAL,
  NODE_ENV: process.env.NODE_ENV,
};

function createResponse() {
  const response = {
    body: undefined as unknown,
    statusCode: 200,
    json(body: unknown) { response.body = body; },
    redirect() { undefined; },
    setHeader() { undefined; },
    status(statusCode: number) { response.statusCode = statusCode; return response; },
  };
  return response;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    query: {},
    headers: { cookie: 'sma_session=server-token' },
    body: { email: 'attacker@example.com', fullName: 'Nome adulterado' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      displayName: 'Ana Silva',
      userPrincipalName: 'ana@example.com',
      mail: 'ana@example.com',
    }),
  }));
  process.env.SUPABASE_URL = 'https://supabase.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-key';
  process.env.ENABLE_LEGACY_MSAL = 'true';
  process.env.NODE_ENV = 'test';
  maybeSingle.mockReset();
  insertedSingle.mockReset();
  from.mockClear();
  createClient.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnvironment.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalEnvironment.SUPABASE_URL;
  if (originalEnvironment.SUPABASE_SERVICE_ROLE_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnvironment.SUPABASE_SERVICE_ROLE_KEY;
  if (originalEnvironment.ENABLE_LEGACY_MSAL === undefined) delete process.env.ENABLE_LEGACY_MSAL;
  else process.env.ENABLE_LEGACY_MSAL = originalEnvironment.ENABLE_LEGACY_MSAL;
  if (originalEnvironment.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment.NODE_ENV;
});

describe('provisionamento corporativo autenticado', () => {
  it('bloqueia o endpoint em produção mesmo com uma credencial Microsoft válida', async () => {
    process.env.NODE_ENV = 'production';
    const response = createResponse();

    await provision(request(), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('nega chamada sem sessão Microsoft e não inicializa o service role', async () => {
    const response = createResponse();

    await provision(request({ headers: {} }), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('não cria colaborador automaticamente quando o perfil ainda não existe', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const profile = {
      id: 'profile-new', email: 'ana@example.com', full_name: 'Ana Silva', role: 'colaborador', active: true,
    };
    insertedSingle.mockResolvedValue({ data: profile, error: null });
    const response = createResponse();

    await provision(request(), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
    expect(createClient).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ['fernando.almeida@sma-eng.com.br', 'diretor'],
    ['supervisor1@sma-eng.com.br', 'supervisor'],
    ['pessoa@outro-dominio.example', 'colaborador'],
  ] as const)('não atribui o cargo %s por provisionamento JIT', async (email, role) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: 'Usuário Microsoft', userPrincipalName: email }),
    }));
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const profile = {
      id: 'profile-new', email, full_name: 'Usuário Microsoft', role, active: true,
    };
    insertedSingle.mockResolvedValue({ data: profile, error: null });
    const response = createResponse();

    await provision(request(), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
    expect(createClient).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('nega perfil inativo', async () => {
    maybeSingle.mockResolvedValue({ data: {
      id: 'profile-1', email: 'ana@example.com', full_name: 'Ana Silva', role: 'colaborador', active: false,
    }, error: null });
    const response = createResponse();

    await provision(request(), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
  });

  it('nega cargo desconhecido mesmo que o frontend envie um cargo válido', async () => {
    maybeSingle.mockResolvedValue({ data: {
      id: 'profile-1', email: 'ana@example.com', full_name: 'Ana Silva', role: 'admin', active: true,
    }, error: null });
    const response = createResponse();

    await provision(request({ body: { email: 'ana@example.com', fullName: 'Ana Silva', role: 'diretor' } }), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
  });

  it('retorna somente perfil ativo conhecido e ignora dados falsificados do frontend', async () => {
    const profile = {
      id: 'profile-1', email: 'ana@example.com', full_name: 'Ana Silva', role: 'diretor', active: true,
    };
    maybeSingle.mockResolvedValue({ data: profile, error: null });
    const response = createResponse();

    await provision(request(), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('nega identidade Microsoft ausente ou inválida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const response = createResponse();

    await provision(request(), response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: 'Corporate authorization is not enabled.' });
    expect(createClient).not.toHaveBeenCalled();
  });
});
