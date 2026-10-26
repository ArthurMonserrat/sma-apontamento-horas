# Unificação de persistência dos Bancos de Horas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persistir os apontamentos do Banco 2 no Supabase, usando o mesmo `profiles.id` do Banco 1 e mantendo RLS e autorização server-side.

**Architecture:** O Supabase será o Postgres compartilhado. O schema `banco2` conterá os dados específicos do Banco 2 e referenciará `public.profiles`; o frontend enviará o token Supabase ao BFF, que consultará a Data API com o contexto do usuário. O serviço local continuará disponível apenas para testes/demonstração.

**Tech Stack:** PostgreSQL/Supabase, SQL migrations, TypeScript, Prisma metadata, React, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-26-supabase-unification-bancos-design.md`

## Global Constraints

- Não executar migrations remotas nem alterar o Neon ou Supabase de produção.
- Não copiar nome, e-mail ou cargo para uma tabela de usuário do Banco 2 como fonte de autoridade.
- Não usar e-mail ou `localStorage` para autorização.
- Não expor `service_role` no frontend.
- A migration deve ser aditiva e testável em banco local descartável.

## Review Focus

- `profile_id` informado pelo cliente: deve ser ignorado e substituído pelo perfil da sessão.
- RLS por squad: supervisor não pode ler registros de outra squad.
- Status e versão: cliente não pode aprovar nem rebaixar registros diretamente.
- Sessão expirada: a API deve responder 401 e não gravar dados.
- Fallback local: erro do Supabase não pode virar falso sucesso em `localStorage` no modo corporativo.

### Task 1: Supabase Banco 2 schema

**Files:**
- Create: `supabase/migrations/20261026190000_banco2_time_entries.sql`
- Modify: `supabase/config.toml`
- Test: `supabase/tests/banco2_time_entries_assertions.sql`

- [ ] Criar schema `banco2`, enum/status e tabela de apontamentos referenciando `public.profiles(id)`.
- [ ] Criar RLS/grants mínimos para colaborador, supervisor e diretor.
- [ ] Criar assertions para vínculo, isolamento, status protegido e ausência de acesso anônimo.
- [ ] Executar as assertions somente em Supabase local, se Docker estiver disponível; caso contrário, registrar o bloqueador.

### Task 2: Banco 2 server contract

**Files:**
- Modify: `banco-de-horas-2/api/_lib/ecosystemAccess.ts`
- Modify: `banco-de-horas-2/api/session.ts`
- Create: `banco-de-horas-2/api/_lib/supabaseDatabase.ts`
- Modify: `banco-de-horas-2/api/apontamentos.ts`
- Test: `banco-de-horas-2/tests/api-session.test.ts`
- Test: `banco-de-horas-2/tests/api-apontamentos-supabase.test.ts`

- [ ] Expor `profileId` e squad somente como fatos derivados do Supabase.
- [ ] Rejeitar `userId/profileId` arbitrário para colaboradores.
- [ ] Implementar leitura/criação/edição/cancelamento com o token Supabase e RLS.
- [ ] Preservar o fluxo de sessão atual até a migração do frontend.

### Task 3: Frontend runtime switch

**Files:**
- Modify: `banco-de-horas-2/frontend/src/services/api.ts`
- Create: `banco-de-horas-2/frontend/src/services/supabaseTimeEntryService.ts`
- Modify: `banco-de-horas-2/frontend/src/services/timeEntryService.ts`
- Test: `banco-de-horas-2/frontend/src/services/supabaseTimeEntryService.test.ts`

- [ ] Selecionar o serviço remoto somente para sessão `ecosystem`.
- [ ] Manter `LocalStorageTimeEntryService` para demo/testes.
- [ ] Propagar falhas sem gravar fallback local.

### Task 4: Verification

- [ ] Rodar testes API e frontend dos dois repositórios.
- [ ] Rodar typecheck e build do Banco 2.
- [ ] Rodar `git diff --check` nos dois repositórios.
- [ ] Confirmar worktrees limpas após commits e que nenhuma variável real foi versionada.
