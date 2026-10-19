# Banco 1 Corporate Vertical Slice Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** entregar a primeira fatia verificável para recuperar o fluxo corporativo do Banco 1 sem reativar o MSAL legado, sem conceder autorização por sessão isolada e sem tocar em ambientes remotos.

**Architecture:** Microsoft Entra via Supabase Auth continua sendo a única sessão corporativa. O backend valida o token Supabase, exige uma evidência Microsoft emitida por verificador server-side, vincula a evidência à mesma linha `auth.identities`/`auth.users`, consulta pré-autorização e perfil administrativos e só então pode produzir uma decisão de autorização. Como o mapeamento real Entra↔Supabase ainda não está disponível no código, o gate de produção permanece fechado; esta entrega implementa o avaliador server-side e seus contratos, não um bypass.

**Tech Stack:** TypeScript, Vercel Functions, Supabase Auth/PostgreSQL, Vitest, React/Vite.

**Spec:** diagnóstico da auditoria de autenticação e persistência do SM&A solicitado em 2026-10-18.

## Global Constraints

- Preservar as correções P0 e as Etapas 2/3B já integradas.
- `CORPORATE_AUTHORIZATION_IMPLEMENTED=false`; `/api/provision` continua 403; `/api/supabase-session` não libera autorização sem a cadeia completa.
- Não restaurar endpoints MSAL/BFF como caminho corporativo de produção.
- Não confiar em e-mail, `user_metadata`, localStorage, role do navegador ou sessão demo.
- Não executar migrations, SQL remoto, deploy, alteração de Azure/Vercel/Supabase ou criação de usuários reais.
- Serviços LocalStorage permanecem apenas no modo demonstrativo/testes; Banco 2 e relatórios ficam fora do escopo.

## Review Focus

- Evidência Microsoft deve ser opaca, server-side e vinculada à mesma identidade Supabase; `provider_id`, `sub`, `oid`, e-mail ou booleanos não bastam.
- O avaliador deve falhar fechado em sessão ausente, evidência expirada, identidade ambígua, pré-autorização inativa/incompleta e profile ausente/inativo.
- Nenhum componente novo deve produzir autorização enquanto o adaptador Entra/Supabase não existir.
- O primeiro slice não declara login corporativo, apontamentos ou aprovações reais como prontos; documenta o bloqueador e prepara a próxima fatia executável.

---

## Task 1 — Registrar o plano e o diagnóstico auditável

**Files:** `docs/superpowers/plans/2026-10-18-banco1-corporate-vertical-slice.md`, `docs/auth/banco1-corporate-vertical-slice.md`

1. Documentar que o fluxo Supabase OAuth existe, mas `DemoSessionProvider` descarta a sessão corporativa porque `/api/supabase-session` está deliberadamente bloqueado.
2. Documentar que o antigo MSAL/BFF não pode ser restaurado sem refazer state/PKCE, CSRF, sessão HttpOnly e autorização server-side; os endpoints permanecem bloqueados em produção.
3. Mapear que `LocalStorageTimeEntryService`, `LocalStorageSupervisorService` e `dayApprovalService` ainda são demonstração e que o schema real não cobre todos os campos ricos do frontend.
4. Commit: `docs(auth): define Banco 1 corporate vertical slice`.

## Task 2 — Criar o contrato server-side de decisão corporativa (TDD)

**Files:** `server/corporateAuthorization.ts`, `tests/api/corporateAuthorization.test.ts`

1. RED: escrever casos para sessão Supabase ausente/inválida, binding `unavailable`, identidade de outro usuário, múltiplas identidades, pré-autorização ausente/inativa/sem `tenant/object`, profile ausente/inativo, divergência de cargo e decisão autorizada apenas quando todos os fatos server-side coincidem.
2. Implementar `evaluateCorporateAuthorization(input, now?)` com tipos discriminados para `authorized` e motivos de negação; aceitar somente `EntraBindingResult` verificado produzido pelo módulo server-side, não objetos do request.
3. Exigir `auth.users.id === auth.identities.user_id`, `binding.supabaseUserId === auth.users.id`, tenant/object iguais à pré-autorização ativa, profile ativo e role administrativa consistente. Não usar e-mail como chave de autorização.
4. RED→GREEN: executar `npm run test:api -- --run tests/api/corporateAuthorization.test.ts` e depois a suíte API.
5. Commit: `feat(auth): add fail-closed corporate authorization evaluator`.

## Task 3 — Manter a fronteira HTTP explicitamente não autorizante

**Files:** `api/supabase-session.ts`, `tests/api/supabase-session.test.ts`, `server/corporateAuthPolicy.ts`

1. RED: adicionar regressões para confirmar que body/query/metadata não são consultados como identidade e que mesmo com uma decisão local forjada o endpoint continua 403 enquanto o produtor real não estiver configurado.
2. Implementar apenas uma resposta estruturada e estável (`authorization_pending`) sem ler/escrever profiles ou usar service_role; manter o hard gate falso.
3. Testar que tokens Supabase inválidos continuam 401 e sessões válidas continuam 403 seguro.
4. Commit: `fix(auth): keep corporate session endpoint non-authorizing`.

## Task 4 — Preparar a próxima fatia de persistência sem ativá-la

**Files:** `docs/auth/banco1-corporate-vertical-slice.md`, testes existentes de `timeEntryService`/`supervisorService`

1. Documentar o mapeamento pendente entre o modelo rico de `TimeEntry` e as colunas atuais, incluindo campos sem coluna equivalente.
2. Documentar o contrato para um futuro `SupabaseTimeEntryService`/serviço de aprovações usando a sessão do navegador e RLS, sem `service_role` no cliente.
3. Não substituir LocalStorage ainda; preservar demonstração e evitar afirmar persistência corporativa antes de schema/RLS homologados.
4. Commit: `docs(data): define Banco 1 persistence handoff`.

## Final Verification

Executar, com saída lida e registrada: `npm run test:api -- --run`, `npm run test:frontend -- --run`, `npm run typecheck`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, `npm run build`, `git diff --check`. Verificar segredos e confirmar que nenhum workflow, migration ou endpoint novo toca produção.

## Delivery

Criar commits locais, revisar o diff completo, fazer push somente da branch `codex/banco1-corporate-vertical-slice` e abrir PR Draft para `main`. Não fazer merge. O PR deve declarar que esta entrega não libera login corporativo nem persistência real; a próxima entrega concreta é homologar o adaptador Entra/Supabase e então implementar o serviço de apontamentos com RLS real.
