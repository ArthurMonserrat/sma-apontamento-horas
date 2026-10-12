# Autenticação corporativa com Supabase Auth e Microsoft Entra ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar localmente a migração do SM&A para Microsoft Entra ID → Supabase Auth → sessão Supabase → autorização corporativa, sem liberar acesso corporativo real até que a identidade Microsoft, `access_preapprovals` e o provisionamento definitivo estejam validados.

**Architecture:** O Supabase Auth será a única autoridade de sessão corporativa e o provedor Azure será acionado por OAuth PKCE com escopos `openid profile email`. O frontend cuidará apenas do fluxo público de OAuth e do estado de sessão; a API server-side validará o token Supabase, a identidade Microsoft e o perfil autorizado. O modo demonstrativo permanecerá em adaptadores locais separados e não será usado como fallback corporativo.

**Tech Stack:** React 19, TypeScript, Vite, React Router, Supabase Auth (`@supabase/supabase-js`), Vercel Functions/Node, Vitest, MSAL legado preservado somente para transição não produtiva.

**Spec:** `docs/superpowers/specs/2026-10-12-supabase-auth-azure-design.md`

## Global Constraints

- O Supabase Auth será a autoridade de sessão corporativa; o Microsoft Entra ID será apenas o provedor externo configurado no Supabase Auth.
- O fluxo OAuth usará exatamente `openid profile email`, `flowType: 'pkce'` e redirects explicitamente allowlisted por ambiente.
- A autorização corporativa ficará bloqueada por padrão até a integração definitiva com `access_preapprovals`, identidade Microsoft validada e provisionamento idempotente.
- `CORPORATE_AUTHORIZATION_READY=true` isoladamente nunca poderá liberar acesso nesta etapa; o código manterá um bloqueio de implementação até que esses três mecanismos existam e sejam revisados.
- Um perfil existente, isoladamente, não poderá liberar acesso mesmo quando a configuração de ambiente estiver como `true`.
- O modo demonstrativo continuará com `isDemo: true`, dados locais e isolamento explícito de endpoints corporativos.
- O `SUPABASE_SERVICE_ROLE_KEY` permanecerá somente em código server-side e nunca será exposto em `VITE_*`, bundle, localStorage ou testes de navegador.
- MSAL/BFF legado só poderá operar com `ENABLE_LEGACY_MSAL=true` em ambiente não produtivo; em produção os endpoints deverão bloquear sem criar sessão, cookie ou perfil.
- Nenhuma migration, alteração de dados, alteração dos cinco pré-cadastros, deploy, push ou merge será executada nesta etapa de implementação local.
- `profiles.id` continuará referenciando `auth.users.id`; esta etapa não criará perfis.
- Não serão alteradas funcionalidades de apontamentos, banco de horas, calendário, layout ou regras de negócio não relacionadas à autenticação.

## Review Focus

- **Repetição do callback:** um `code` válido, reutilizado ou processado duas vezes pelo React StrictMode deve resultar em no máximo uma troca de sessão e URL limpa; coberto na Task 4.
- **Endpoints legados em produção:** `api/login`, `redirect`, `me`, `logout` e `provision` devem bloquear sem redirecionar ou criar cookies quando a flag não estiver explicitamente habilitada; coberto na Task 6.
- **Perfil isolado sem autorização definitiva:** mesmo com linha ativa em `profiles`, o endpoint Supabase deve retornar 403 enquanto o gate estiver desligado; coberto na Task 3.
- **Identidade incompatível:** `tid` diferente, `oid` ausente ou `xms_edov=false` quando presente devem negar acesso sem consultar ou alterar perfis; coberto nas Tasks 2 e 3.
- **Mistura demo/MSAL:** uma sessão demo ou conta MSAL ativa no navegador, sem sessão Supabase autorizada, não pode acessar rota corporativa; coberto na Task 5.

---

## Mapa de arquivos e responsabilidades

Arquivos novos e papéis definidos antes da implementação:

- `frontend/src/config/supabaseConfig.ts` — leitura validada de `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, redirect permitido e flag pública de disponibilidade; nunca ler service role.
- `frontend/src/features/auth/infrastructure/supabaseAuthClient.ts` — única construção do cliente Supabase browser com `flowType: 'pkce'`, persistência e refresh de sessão.
- `frontend/src/features/auth/infrastructure/supabaseSessionService.ts` — OAuth, callback de código, inscrição em mudanças, consulta de sessão e logout; nenhuma regra de cargo.
- `frontend/src/pages/access/AuthCallbackPage.tsx` — página pública de callback, troca idempotente e redirecionamento seguro; não cria perfil.
- `api/corporateAuthPolicy.ts` — políticas puras para gate de autorização, modo legado, bearer token e claims Microsoft.
- `api/supabase-session.ts` — endpoint server-side de sessão/autorização; valida Supabase antes de inicializar service role e apenas lê perfil.
- `api/legacyMsalGuard.ts` — guarda comum para bloquear MSAL/BFF em produção.
- `frontend/src/features/auth/infrastructure/*.test.ts`, `frontend/src/pages/access/*.test.tsx`, `api/*.test.ts` — testes TDD dos contratos e regressões.
- `docs/auth/entra-supabase-setup.md` — instruções para TI, redirects, single-tenant, claims, segredo e rotação.

Arquivos existentes a modificar somente quando o teste exigir:

- `frontend/src/pages/access/EcosystemLogin.tsx` — iniciar somente OAuth Supabase; falha não usa fallback MSAL.
- `frontend/src/app/routes/AppRoutes.tsx` — registrar `/auth/callback` e manter rotas demo.
- `frontend/src/features/session/DemoSessionProvider.tsx` — separar sessão Supabase de demo, observar expiração e remover restauração MSAL corporativa.
- `frontend/src/features/session/ProtectedRoute.tsx`, `authGuard.ts`, `types.ts` — aceitar apenas demo explícita ou perfil Supabase já autorizado.
- `frontend/src/features/auth/authService.ts` — trocar consulta corporativa pelo endpoint Supabase, sem aceitar cargo enviado pelo cliente.
- `api/login.ts`, `api/redirect.ts`, `api/me.ts`, `api/logout.ts`, `api/provision.ts`, `api/msal.ts` — aplicar guarda legada sem remover o código de transição.
- `.env.example`, `frontend/package.json`, `frontend/package-lock.json` — documentar somente variáveis públicas/servidor e adicionar pacote apenas se o workspace não o resolver de forma segura.

## Task 1: Contrato e cliente browser do Supabase Auth

**Files:**
- Create: `frontend/src/config/supabaseConfig.ts`
- Create: `frontend/src/features/auth/infrastructure/supabaseAuthClient.ts`
- Test: `frontend/src/features/auth/infrastructure/supabaseAuthClient.test.ts`
- Modify: `frontend/package.json`, `frontend/package-lock.json` only if required by the existing workspace resolution

**Interfaces:**
- Produces `getSupabaseBrowserConfig(): { url: string; anonKey: string; redirectTo: string; enabled: boolean }`.
- Produces singleton `supabaseAuthClient` built with `createClient(url, anonKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })` when configured.

- [ ] **Step 1: Write failing tests** para configuração ausente, redirect fora da allowlist, opções PKCE e escopos esperados.
- [ ] **Step 2: Run red** com `npm --prefix frontend run test -- src/features/auth/infrastructure/supabaseAuthClient.test.ts`; esperar falhas porque os contratos ainda não existem.
- [ ] **Step 3: Implement minimalmente** o config/client, aceitando apenas URLs permitidas pela variável de ambiente e sem incluir segredo Azure ou service role.
- [ ] **Step 4: Run green** com o mesmo comando; confirmar que a configuração incompleta não dispara login silencioso.
- [ ] **Step 5: Commit** `feat(auth): preparar cliente supabase auth`.

## Task 2: Políticas server-side e validação de identidade Microsoft

**Files:**
- Create: `api/corporateAuthPolicy.ts`
- Test: `api/corporateAuthPolicy.test.ts`

**Interfaces:**
- `isCorporateAuthorizationReady(env = process.env): boolean` — retorna `false` durante toda a Etapa 2; a variável `CORPORATE_AUTHORIZATION_READY` será apenas um contrato futuro e não pode, sozinha, habilitar acesso.
- `isLegacyMsalAllowed(env = process.env): boolean` — `NODE_ENV !== 'production' && ENABLE_LEGACY_MSAL === 'true'`.
- `readBearerToken(req: VercelRequest): string | null` — aceita apenas `Authorization: Bearer ...`, sem cookie demo/MSAL.
- `validateMicrosoftIdentity(claims: unknown, expectedTenantId: string): { tenantId: string; objectId: string; emailVerified: boolean } | null` — exige `tid`, `oid`, tenant igual e rejeita `xms_edov` quando presente e falso; não usa e-mail como chave.

- [ ] **Step 1: Write failing tests** para gate default fechado, legados bloqueados em produção, bearer ausente/malformado, tenant divergente, `oid` ausente e `xms_edov=false`.
- [ ] **Step 2: Run red** com `npm run test:api -- corporateAuthPolicy.test.ts`; esperar falhas pelos exports inexistentes.
- [ ] **Step 3: Implement minimalmente** funções puras, sem chamadas de rede e sem aceitar cargo/email do request.
- [ ] **Step 4: Run green** e confirmar cobertura dos cinco cenários do Review Focus.
- [ ] **Step 5: Commit** `fix(auth): centralizar politicas de acesso corporativo`.

## Task 3: Endpoint Supabase de sessão, fail-closed e leitura de perfil

**Files:**
- Create: `api/supabase-session.ts`
- Test: `api/supabase-session.test.ts`
- Modify: `api/types.ts` only if the existing request/response types lack the fields used by the handler

**Interfaces:**
- `export async function supabaseSession(req: VercelRequest, res: VercelResponse): Promise<void>` — endpoint `GET` que exige bearer Supabase.
- O cliente anon/session valida `auth.getUser(token)`; o cliente service role só é criado depois de token válido, identidade validada e gate habilitado.
- Resposta autorizada: `{ profile: { id, email, full_name, role, squad_id } }`; nenhuma inserção, atualização ou retorno de segredo.

- [ ] **Step 1: Write failing tests** para 401 sem bearer/token inválido, 403 com gate desligado mesmo havendo perfil, 403 quando `CORPORATE_AUTHORIZATION_READY=true` mas o bloqueio de implementação permanece ativo, 403 para identidade ausente/tenant divergente/`oid` ausente, perfil inexistente/inativo/cargo inválido/id divergente e garantia de que não existe caminho 200 nesta etapa.
- [ ] **Step 2: Run red** com `npm run test:api -- supabase-session.test.ts`; esperar falhas pelo handler inexistente.
- [ ] **Step 3: Implement minimalmente** autenticação server-side e o bloqueio permanente da etapa; deixar a validação de `auth.users.id`, claims Microsoft e consulta read-only a `profiles` atrás do futuro gate, sem confiar em body para cargo/e-mail nem em dados editáveis do usuário para `tid`/`oid`.
- [ ] **Step 4: Run green** e verificar que service role não é inicializado nos caminhos 401/403.
- [ ] **Step 5: Commit** `feat(auth): adicionar sessao supabase fail-closed`.

## Task 4: OAuth PKCE, callback idempotente e ciclo de sessão

**Files:**
- Create: `frontend/src/features/auth/infrastructure/supabaseSessionService.ts`
- Create: `frontend/src/pages/access/AuthCallbackPage.tsx`
- Test: `frontend/src/features/auth/infrastructure/supabaseSessionService.test.ts`, `frontend/src/pages/access/AuthCallbackPage.test.tsx`

**Interfaces:**
- `startCorporateOAuth(): Promise<{ error: Error | null }>` — chama `signInWithOAuth({ provider: 'azure', options: { redirectTo, scopes: 'openid profile email' } })`.
- `exchangeCallbackCode(code: string): Promise<{ error: Error | null }>` — uma troca por código, protegida contra repetição e com URL sensível limpa.
- `getCurrentSession(): Promise<Session | null>`, `subscribe(listener): { unsubscribe(): void }`, `signOut(): Promise<{ error: Error | null }>`.
- Callback redireciona autorizado para `/` e falha segura para `/?authError=unauthorized`; não aceita `returnTo` arbitrário.

- [ ] **Step 1: Write failing tests** para scopes/redirect/PKCE, callback sem código, callback válido, código repetido, erro de troca, sessão expirada, URL sem `code`/`state` sensíveis e logout.
- [ ] **Step 2: Run red** com `npm --prefix frontend run test -- src/features/auth/infrastructure/supabaseSessionService.test.ts src/pages/access/AuthCallbackPage.test.tsx`.
- [ ] **Step 3: Implement minimalmente** a troca uma única vez (inclusive em StrictMode), usando os mecanismos de estado/PKCE do Supabase, sem uma segunda troca manual, sem logs de tokens/verifier e limpando query/hash após o processamento.
- [ ] **Step 4: Run green** e confirmar que uma sessão Supabase sem autorização não vira cargo local.
- [ ] **Step 5: Commit** `feat(auth): implementar callback e ciclo de sessao supabase`.

## Task 5: Integração de rotas, provider e isolamento demo

**Files:**
- Modify: `frontend/src/pages/access/EcosystemLogin.tsx`, `frontend/src/app/routes/AppRoutes.tsx`, `frontend/src/features/session/DemoSessionProvider.tsx`, `frontend/src/features/session/ProtectedRoute.tsx`, `frontend/src/features/session/authGuard.ts`, `frontend/src/features/session/types.ts`, `frontend/src/features/auth/authService.ts`
- Test: testes de provider, guard e rotas existentes, com casos novos em `frontend/src/features/session/*.test.tsx` e `frontend/src/features/auth/*.test.ts`

**Interfaces:**
- `authService.getCorporateProfile(accessToken: string)` chama `/api/supabase-session` com bearer e não envia cargo/e-mail para decisão.
- `DemoSessionProvider` mantém APIs demo atuais, mas restaura sessão corporativa somente pelo Supabase Auth e encerra estado quando a sessão expira ou o endpoint negar.

- [ ] **Step 1: Write failing regression tests** para demo funcional, sessão MSAL/localStorage não liberar rota, conta MSAL ativa sem sessão Supabase ser negada, callback registrado e falha OAuth sem fallback.
- [ ] **Step 2: Run red** com `npm --prefix frontend run test -- ...` nos arquivos selecionados.
- [ ] **Step 3: Implement minimalmente** o wiring; o botão Microsoft chama apenas `startCorporateOAuth`, e `ProtectedRoute` aceita somente demo explícita ou perfil Supabase autorizado.
- [ ] **Step 4: Run green** e executar a suíte frontend completa para detectar regressões.
- [ ] **Step 5: Commit** `refactor(auth): integrar sessao supabase sem fallback legado`.

## Task 6: Bloqueio dos endpoints MSAL/BFF legados em produção

**Files:**
- Create: `api/legacyMsalGuard.ts`
- Test: `api/legacyMsalGuard.test.ts`
- Modify: `api/login.ts`, `api/redirect.ts`, `api/me.ts`, `api/logout.ts`, `api/provision.ts`, `api/msal.ts`

**Interfaces:**
- `assertLegacyMsalEnabled(req: VercelRequest, res: VercelResponse): boolean` — responde `404`/`403` e retorna `false` quando estiver em produção ou sem flag explícita; não lê/define cookie antes da guarda.

- [ ] **Step 1: Write failing tests** para produção, desenvolvimento sem flag, desenvolvimento com flag e garantia de que nenhum cookie é emitido antes do bloqueio.
- [ ] **Step 2: Run red** com `npm run test:api -- legacyMsalGuard.test.ts`.
- [ ] **Step 3: Implement minimalmente** a guarda compartilhada e colocá-la como primeira operação dos handlers; manter o código legado intacto para auditoria e desenvolvimento explicitamente habilitado.
- [ ] **Step 4: Run green** e executar testes existentes de `provision`, login/logout e me.
- [ ] **Step 5: Commit** `fix(auth): bloquear endpoints msal legados em producao`.

## Task 7: Documentação e configuração para a equipe de TI

**Files:**
- Create: `docs/auth/entra-supabase-setup.md`
- Modify: `.env.example`
- Test: `api/auth-config-safety.test.ts` or static verification script under `api/`

**Interfaces:**
- Variáveis públicas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ALLOWED_REDIRECTS`.
- Variáveis server-only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AZURE_TENANT_ID`, `CORPORATE_AUTHORIZATION_READY`, `ENABLE_LEGACY_MSAL`.

- [ ] **Step 1: Write failing/static tests** que detectem `SUPABASE_SERVICE_ROLE_KEY`, client secret, token ou valores reais em arquivos `frontend/`, `.env.example` e documentação.
- [ ] **Step 2: Run red** com `npm run test:api -- auth-config-safety.test.ts`.
- [ ] **Step 3: Implement minimalmente** a documentação de tenant single-tenant, client ID/secret somente no Supabase, callback `https://<project-ref>.supabase.co/auth/v1/callback`, redirects local/homologação/produção, scopes, PKCE, `tid`, `oid`, `xms_edov`, convidados e rotação; não registrar segredo real.
- [ ] **Step 4: Run green** e revisar manualmente as URLs e variáveis sem inserir valores de produção.
- [ ] **Step 5: Commit** `docs(auth): documentar configuracao entra e supabase`.

## Task 8: Verificação integrada e preparação de recuperação

**Files:**
- Modify: nenhum arquivo de produção por padrão; somente correções de testes/documentação se uma falha comprovada surgir.
- Test: suíte existente e todos os testes adicionados nas Tasks 1–7.

**Interfaces:**
- Critério de saída: demo funcional, autorização corporativa ainda fechada inclusive com flag de ambiente `true`, endpoints legados bloqueados em produção, sem alteração de Supabase/produção.

- [ ] **Step 1: Run full verification**: `npm test`; `npm --prefix frontend run lint`; `npm --prefix frontend run typecheck`; `npm run typecheck`; `npm run build`; `git diff --check`.
- [ ] **Step 2: Inspect results**: registrar testes aprovados, arquivos de teste, avisos de build, status limpo, ausência de alterações em banco/deploy e ausência de chaves no bundle.
- [ ] **Step 3: If a failure appears,** aplicar `systematic-debugging`, adicionar teste de regressão antes do ajuste e repetir a verificação completa; não mascarar falha com fallback corporativo.
- [ ] **Step 4: Recovery drill**: confirmar que remover/desligar `CORPORATE_AUTHORIZATION_READY` retorna 403 corporativo, mantém demo e não exige rollback de schema; documentar rollback por reversão dos commits da etapa, sem reescrever histórico.
- [ ] **Step 5: Commit** somente se houver correção final necessária, com mensagem específica; não fazer push, deploy ou merge.

## Critérios de aceite

- OAuth Azure via Supabase usa `openid profile email`, PKCE, redirect allowlist e callback idempotente.
- Não há fallback automático para MSAL/BFF; em produção os endpoints legados estão bloqueados.
- `CORPORATE_AUTHORIZATION_READY` permanece desligado por padrão e um perfil existente isolado não libera acesso.
- `tid` e `oid` são validados server-side; `xms_edov` falso, quando presente, é rejeitado sem substituir as demais validações.
- Nenhum perfil é criado ou alterado nesta etapa; os cinco pré-cadastros e o banco de produção permanecem intactos.
- Service role só é inicializado no servidor após autenticação e autorização suficientes.
- Demo continua funcionando isoladamente e uma sessão demo/MSAL não entra em rota corporativa.
- Testes, lint, typecheck, build e `git diff --check` passam; qualquer limitação do Azure é relatada sem declarar produção pronta.

## Dependências externas e estratégia de recuperação

1. A TI precisa configurar o aplicativo Entra single-tenant, consentir `openid/profile/email`, cadastrar o callback do Supabase, definir URLs do frontend e confirmar a política de convidados.
2. A equipe precisa validar em homologação onde `tid`, `oid` e `xms_edov` aparecem no usuário/claims retornados pelo Supabase antes de habilitar o gate.
3. Se o Azure não estiver disponível, manter `CORPORATE_AUTHORIZATION_READY` ausente/`false`; o botão corporativo exibirá falha segura e o modo demo continuará disponível.
4. Se o callback falhar após configuração, desabilitar o provedor/flag no ambiente de teste e reverter somente os commits da etapa; não apagar usuários Auth, alterar RLS ou fazer migration como tentativa de recuperação.
5. A ativação de `access_preapprovals`, provisionamento e RLS real fica para uma etapa posterior, com revisão independente e autorização explícita para homologação/produção.
