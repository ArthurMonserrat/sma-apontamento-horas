# Stage 3B.2A Entra Identity Verifier Implementation Plan

> **Para agentes:** use `superpowers:executing-plans` (ou `superpowers:subagent-driven-development`) para executar este plano tarefa a tarefa. Cada tarefa usa TDD e termina com uma verificação independente.

**Goal:** criar a fronteira server-side para identidade Microsoft vinculada ao Supabase Auth sem habilitar autorização corporativa enquanto a cadeia criptográfica real não estiver disponível.

**Architecture:** o backend aceitará somente evidências produzidas por um verificador interno; objetos do frontend, `user_metadata`, e-mails, `provider_id` isolado e booleanos de confiança serão rejeitados. A implementação atual permanecerá indisponível até existir um adaptador que valide assinatura, issuer, audience, expiração, tenant, object ID e vínculo com o mesmo `auth.users.id`.

**Tech Stack:** TypeScript/NodeNext, Vitest, Supabase Auth, Microsoft Entra OIDC.

**Spec:** solicitação da Etapa 3B.2A; referências oficiais Supabase Identities, Supabase Azure Auth e Microsoft ID token/claims validation.

## Global Constraints

- `CORPORATE_AUTHORIZATION_IMPLEMENTED=false` permanece inalterado.
- `/api/provision` e `/api/supabase-session` continuam sem conceder autorização.
- Não alterar Azure, Supabase de produção, migrations, perfis ou pré-autorizações.
- Não adicionar secrets, tokens reais ou dependências de criptografia sem configuração homologada.
- Não aceitar cargo, identidade ou autorização do navegador.

## Review Focus

- `provider_id` sem `tid`/`oid` não pode virar identidade Microsoft autorizada.
- Uma sessão Supabase de A combinada com evidência Microsoft de B deve ser rejeitada.
- Um objeto com `cryptographicallyVerified: true` não é prova criptográfica.
- Claims sem assinatura/issuer/audience/expiração verificadas devem permanecer bloqueadas.
- Ausência, duplicidade ou provedor diferente de Azure deve terminar em erro controlado.

### Task 1: Fix the raw-claims authorization boundary

**Files:**
- Modify: `server/corporateAuthPolicy.ts`
- Test: `tests/api/corporateAuthPolicy.test.ts`

**Interfaces:**
- `validateMicrosoftIdentity` deve deixar de tratar `unknown` como claims confiáveis; somente uma evidência marcada por um símbolo privado interno poderá ser convertida em identidade.
- O helper deve continuar validando tenant, `tid`, `oid` e `xms_edov`, mas nunca será produtor dessa marca.

- [ ] Escrever testes que demonstrem rejeição de claims crus, claims adulteradas, `user_metadata`, e-mail e booleanos de verificação.
- [ ] Executar `npm run test:api -- --run tests/api/corporateAuthPolicy.test.ts` e confirmar falha dos testes positivos antigos.
- [ ] Implementar a fronteira mínima: tipo interno não exportado para evidência verificada e retorno `null` para entradas externas.
- [ ] Atualizar os testes para fixar o comportamento fail-closed e a validação estrutural apenas dentro da fronteira interna.
- [ ] Executar o teste novamente e fazer commit `fix(auth): close raw Microsoft claims boundary`.

### Task 2: Add the Supabase-to-Entra binding contract

**Files:**
- Create: `server/entraIdentityVerifier.ts`
- Test: `tests/api/entraIdentityVerifier.test.ts`
- Modify: `server/corporateIdentity.ts` only if needed to reuse the opaque marker safely

**Interfaces:**
- `type SupabaseAzureIdentityRecord = { userId: string; provider: string; providerId: string; identityData: unknown }`.
- `type EntraBindingInput = { supabaseUserId: string; identities: readonly SupabaseAzureIdentityRecord[]; microsoftClaims: unknown }`.
- `verifySupabaseAzureBinding(input, config)` retorna `{ status: 'unavailable' | 'invalid' | 'verified'; reason: ... }`; `verified` só poderá existir quando uma evidência interna real for produzida.
- Nenhum campo de entrada público poderá produzir a marca interna.

- [ ] Escrever testes para usuário Supabase divergente, provider ausente/diferente, `provider_id` isolado, `tid`/`oid` ausentes, tenant incorreto, claims adulteradas, identidade duplicada e objeto externo com booleano de confiança.
- [ ] Executar os testes e confirmar que todos os cenários não comprovados falham de forma controlada.
- [ ] Implementar validação de forma fail-closed, retornando `unavailable` quando o adaptador criptográfico Entra/Supabase não estiver configurado; não fazer decode simples nem chamadas Graph.
- [ ] Documentar no código que a futura implementação deve validar assinatura/JWKS, issuer, audience, expiração, nonce quando aplicável, tenant, oid e vínculo `auth.identities.user_id === auth.users.id`.
- [ ] Executar testes API e fazer commit `feat(auth): add non-activatable Entra binding contract`.

### Task 3: Document the verified-source dependency

**Files:**
- Create or modify: `docs/auth/entra-supabase-setup.md`
- Modify: `docs/superpowers/specs/2026-10-12-supabase-auth-azure-design.md` only where the current chain is stale

- [ ] Registrar que Supabase expõe `auth.identities.user_id`, `provider`, `provider_id` e `identity_data`, mas a produção atual não demonstra `tid`/`oid` Azure confiáveis.
- [ ] Registrar dependências da TI: single-tenant, client ID/audience, issuer/JWKS, escopos, política de convidados, callback e mecanismo server-side que entregue claims verificadas.
- [ ] Registrar que a validação local não é homologação Microsoft e que Etapa 3B.2B continuará bloqueada.
- [ ] Fazer commit `docs(auth): record Entra identity verification blocker`.

### Task 4: Full verification

**Files:** none beyond prior tasks.

- [ ] Executar `npm test`, `npm run typecheck`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, `npm run build` e `git diff --check`.
- [ ] Confirmar que `CORPORATE_AUTHORIZATION_IMPLEMENTED` segue `false`, `/api/provision` segue 403 e nenhum arquivo contém secrets/tokens.
- [ ] Fazer commit final somente se necessário; não fazer push, merge, deploy ou alterações remotas.
