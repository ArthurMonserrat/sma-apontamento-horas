# Etapa 3B.3B — Verificador Entra e homologação gerenciada isolada

> **Para agentes:** executar as tarefas em ordem, com TDD. Esta entrega não habilita autorização corporativa, provisionamento ou acesso ao Supabase de produção.

**Objetivo:** preparar um verificador server-side de ID tokens Microsoft com validação criptográfica real em testes sintéticos e documentar uma homologação gerenciada isolada, mantendo o fluxo corporativo fail-closed.

**Arquitetura:** o verificador aceita somente ID tokens Microsoft destinados à aplicação, valida assinatura por JWKS, issuer, audience, expiração, nonce quando configurado, tenant e `oid`. O resultado criptográfico não será conectado à autorização: a associação com `auth.identities.id`/`user_id` continuará indisponível até a TI confirmar como o provedor Supabase representa o sujeito Microsoft. Nenhuma mudança será aplicada ao endpoint de sessão.

**Stack:** TypeScript/Node.js, `jose`, Vitest, Supabase Auth/PostgreSQL gerenciado apenas como ambiente futuro.

## Restrições globais

- `CORPORATE_AUTHORIZATION_IMPLEMENTED=false`.
- `/api/provision` permanece bloqueado.
- `/api/supabase-session` continua negando autorização corporativa.
- Nenhum token real, segredo, usuário ou dado de produção será usado nos testes.
- Nenhuma migration, variável, configuração Azure/Supabase ou projeto pago será alterado.
- O verificador não poderá usar e-mail, `user_metadata`, `provider_id` isolado ou claims apenas decodificadas.

## Foco de revisão

- Token Graph/access token apresentado como ID token: deve ser rejeitado por audience.
- JWKS/issuer apontando para endpoint não confiável ou `common`: deve ser rejeitado antes da validação.
- Token válido de outro tenant/usuário: deve ser rejeitado por `tid`/`oid`/binding.
- `auth.identities.user_id` diferente da sessão: deve permanecer indisponível/negado.
- `xms_edov=false`, expiração, `nbf`, nonce ou assinatura inválidos: nunca podem produzir evidência aceita.

### Tarefa 1: Verificador criptográfico isolado

**Arquivos:**
- Criar: `server/microsoftTokenVerifier.ts`
- Testar: `tests/api/microsoftTokenVerifier.test.ts`
- Modificar: `package.json`, `package-lock.json`

**Contrato:** `verifyMicrosoftIdToken(token, config, options?)` valida um ID token RS256 com `jose`, JWKS HTTPS permitido, issuer/audience exatos, `tid`, `oid`, `sub`, expiração, `nbf`, nonce opcional e `xms_edov`. Retorna evidência de token verificado com marca interna, nunca `TrustedMicrosoftIdentity`.

### Tarefa 2: Fronteira Supabase sem autorização

**Arquivos:**
- Revisar: `server/entraIdentityVerifier.ts`, `server/corporateIdentity.ts`
- Revalidar: `tests/api/entraIdentityVerifier.test.ts`, `tests/api/corporateIdentity.test.ts`

O boundary existente já mantém `validateTrustedMicrosoftIdentity` e o endpoint
corporativo fail-closed. Nesta entrega ele não precisa de integração nova:
será revalidado junto com `assessSupabaseIdentityBinding`, que rejeita
ausência de `auth.identities.id`, `user_id` divergente e semântica não
confirmada de `provider_id`/`sub`/`oid`. Não criar produtor de autorização.

### Tarefa 3: Homologação gerenciada isolada

**Arquivos:**
- Criar: `docs/auth/stage3b3b-managed-supabase-homologation.md`
- Modificar: `docs/auth/stage3b2a-entra-trust-contract.md`

Registrar que o projeto remoto possui zero branches e não será usado para testes. Documentar projeto Supabase separado, aplicação das migrations em ordem, usuários fictícios, Auth/Data API/RLS, critérios de rollback, custo/aprovação administrativa e a sequência de homologação Microsoft.

### Tarefa 4: Verificação final e publicação

Executar testes API/frontend, typechecks, lint, build e `git diff --check`; revisar segredos; criar commits pequenos; push da branch `codex/stage3b3b-entra-managed-homologation`; abrir PR Draft. Não fazer merge.
