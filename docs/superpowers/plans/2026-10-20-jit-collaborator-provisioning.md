# JIT Collaborator Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision Microsoft Azure Supabase Auth users as active collaborators and authorize the frontend only after loading their matching corporate profile.

**Architecture:** A private, idempotent `SECURITY DEFINER` trigger provisions missing Azure profiles with `id = auth.users.id`, `auth_user_id = auth.users.id`, and the fixed role `colaborador`; an audited backfill handles existing Azure users without profiles. The existing `/api/supabase-session` endpoint validates the Supabase bearer and returns only the matching active profile, while the session provider and route guard keep the UI loading until that profile is verified. Demo sessions remain isolated and existing profile roles are never changed.

**Tech Stack:** Supabase Auth/PostgreSQL migrations and RLS, Vercel serverless API (TypeScript), React 19, TypeScript, Supabase JS, Vitest, local Supabase GitHub Actions workflow.

**Spec:** `docs/superpowers/specs/2026-10-20-jit-collaborator-provisioning-design.md`

## Global Constraints

- The only automatically assigned role is `'colaborador'`; browser input and `user_metadata.role` are never authorization sources.
- Profiles are linked by Auth UUID (`id = auth.users.id` and `auth_user_id = auth.users.id`); never link or overwrite by email alone.
- Only identities authenticated through provider `azure` enter this JIT path; Azure must be restricted to the SM&A tenant before production rollout.
- Missing/inactive/unknown profiles deny protected routes; no in-memory collaborator fallback.
- Demo sessions remain separate; no Supabase `service_role`, OAuth secret, or token is added to frontend code.
- Do not apply migrations to remote/production Supabase; validate only using disposable local Supabase and CI.

## Review Focus

- Existing supervisor/director profiles must never be downgraded by repeat login or backfill; pin this in Task 1 SQL assertions.
- A duplicate email must not link a new Auth identity to an existing profile or abort expected OAuth recovery silently; pin the no-link/audit outcome in Task 1 integration assertions.
- A non-Azure Auth user must not receive a corporate profile; pin this in Task 1 integration assertions.
- `getSession()` and `INITIAL_SESSION` can report the same identity concurrently; pin one profile resolution and latest-result-wins behavior in Task 3 provider tests.
- Invalid, inactive, ambiguous, or unknown-role profile responses must not release routes; pin these cases in Tasks 2 and 3 API/guard tests.

---

### Task 1: Provision Azure profiles in Supabase Auth

**Files:**
- Create: `supabase/migrations/20261020180000_jit_azure_collaborator_provisioning.sql`
- Modify: `supabase/tests/local_auth_data_api.sh`
- Modify: `.github/workflows/validate-supabase-local.yml` only if the current integration script needs an explicit assertion step
- Modify: `docs/auth/prestage3b2b3-local-supabase.md`

**Interfaces:**
- Produces: an `AFTER INSERT` trigger on `auth.users`, backed by a private function with pinned empty `search_path`, no direct execute grants, and a fixed collaborator role.
- Produces: a migration-time, idempotent backfill restricted to existing Azure Auth identities with no `profiles.auth_user_id` match.
- Preserves: public profile schema, role enum, existing RLS, existing roles/squads, and audit-table access restrictions.

- [ ] **Step 1: Add failing local Auth/RLS assertions**

Extend the local Supabase test script to create a synthetic user through the local Auth Admin API with server-owned `app_metadata.provider = azure`, provider profile metadata, and an attempted user-metadata role of `diretor`. Assert that exactly one profile exists, both profile identity columns equal the Auth UUID, role is `colaborador`, active is true, squad is null, and the authenticated user can read only that profile through RLS. Also assert an existing linked director profile is unchanged by repeat/backfill, a non-Azure user gets no profile, and a duplicate email or conflicting legacy profile ID is audited without linking or overwriting the existing row.

- [ ] **Step 2: Run the focused integration check and verify it fails first**

Run: `supabase start --yes; supabase db reset --local --no-seed --yes; bash supabase/tests/local_auth_data_api.sh`
Expected: the Azure user has no provisioned profile and the new assertions fail. If Docker/Supabase CLI is unavailable locally, record that limitation and use the existing `Validate local Supabase Auth and Data API` CI workflow as the required execution gate.

- [ ] **Step 3: Implement the migration**

Create the private trigger function and trigger. Read provider only from server-owned Auth metadata; normalize verified email; derive a non-empty name from provider name claims with a deterministic email-local-part fallback; insert only `colaborador`, active, and no squad. Make the operation idempotent by Auth UUID and avoid modifying existing rows. For expected missing-email and unique/primary-key collision conditions, write a restricted audit record and return without creating a profile; re-raise unexpected database errors. Backfill only Azure Auth users missing a profile by `auth_user_id`; never attach an existing unlinked profile by email or overwrite a legacy row whose primary key collides. Revoke function execution from `PUBLIC`, `anon`, and `authenticated` and allow invocation only through the trigger/migration owner.

- [ ] **Step 4: Run local Supabase assertions to green**

Run: `supabase db reset --local --no-seed --yes; bash supabase/tests/local_auth_data_api.sh`
Expected: JIT assertions pass; existing RLS/Auth integration assertions remain green; no real project reference or credential is used.

- [ ] **Step 5: Commit the database slice**

```bash
git add supabase/migrations/20261020180000_jit_azure_collaborator_provisioning.sql supabase/tests/local_auth_data_api.sh .github/workflows/validate-supabase-local.yml docs/auth/prestage3b2b3-local-supabase.md
git commit -m "feat: provisiona identidades azure como colaboradores"
```

### Task 2: Return the authenticated user's corporate profile from the API

**Files:**
- Modify: `api/supabase-session.ts`
- Modify: `tests/api/supabase-session.test.ts`
- Reuse: `frontend/src/features/auth/authService.ts` (`getCorporateProfile` already calls this endpoint)

**Interfaces:**
- Consumes: active Supabase bearer token from the current session.
- Produces: `GET /api/supabase-session` response `{ profile: CorporateProfile }` for one active profile matched by `auth_user_id = authenticatedUser.id`.
- Produces: 401 for absent/invalid bearer; 403 for non-Azure, missing, inactive, duplicate, or invalid-role profile; 500 for unexpected server/database failures.

- [ ] **Step 1: Replace fail-closed-only tests with profile contract tests**

In `tests/api/supabase-session.test.ts`, assert: valid Azure user plus matching active collaborator profile returns 200 and the profile; director/supervisor rows retain their database roles; query is constrained to the authenticated user's UUID; body-supplied email/role is ignored; non-Azure user, missing profile, inactive profile, unknown role, and ambiguous profile return 403; absent/invalid token returns 401; wrong HTTP method returns 405; database failure returns 500.

- [ ] **Step 2: Run the API test to verify the new contract fails**

Run: `npm run test:api -- supabase-session.test.ts`
Expected: new success and denial cases fail against the current unconditional 403 handler.

- [ ] **Step 3: Implement profile lookup without service-role access**

After `supabase.auth.getUser(accessToken)`, verify the authenticated user has an Azure identity from server-validated Supabase Auth identity data. Build a user-scoped Supabase client carrying the same bearer token and query only `profiles` by `auth_user_id = user.id`; return a minimal typed row only if exactly one active profile has a recognized `app_role`. Do not trust request body fields, environment flags that bypass authorization, or a service-role key.

- [ ] **Step 4: Run API tests to green**

Run: `npm run test:api -- supabase-session.test.ts`
Expected: all endpoint success, authorization, and error-path assertions pass.

- [ ] **Step 5: Commit the API slice**

```bash
git add api/supabase-session.ts tests/api/supabase-session.test.ts
git commit -m "feat: valida perfil corporativo da sessao supabase"
```

### Task 3: Resolve Supabase sessions before authorizing React routes

**Files:**
- Modify: `frontend/src/features/session/DemoSessionProvider.tsx`
- Modify: `frontend/src/features/session/sessionContext.ts`
- Modify: `frontend/src/features/session/types.ts`
- Modify: `frontend/src/features/session/authGuard.ts`
- Modify: `frontend/src/features/session/ProtectedRoute.tsx`
- Modify: `frontend/src/features/session/DemoSessionProvider.test.tsx`
- Modify: `frontend/src/features/session/ProtectedRoute.test.ts`
- Modify: `frontend/src/pages/access/EcosystemLogin.navigation.test.tsx` only if an authorization error or post-callback landing behavior changes
- Modify: `frontend/src/features/auth/authService.test.ts` only if the endpoint response contract changes

**Interfaces:**
- Consumes: `getCorporateProfile(accessToken): Promise<CorporateProfile>` and `mapCorporateRole(role): DemoRole | null`.
- Produces: corporate `DemoSession` with `authProvider: 'supabase'`, `isDemo: false`, role mapped only from the validated profile, and matching `corporateProfile`.
- Produces: `hasAuthenticatedSession(session)` true for a demo session under existing demo rules, or for a non-demo Supabase session with an active, known corporate profile; false otherwise.

- [ ] **Step 1: Add failing provider and guard tests**

Update provider tests to assert a valid Supabase session loads one corporate profile and becomes `authorized`; duplicate `INITIAL_SESSION`/`getCurrentSession` results issue one profile request; a stale profile response cannot overwrite a newer session; missing/inactive/unknown-role/API-failure profile remains unauthorized with a readable error; sign-out clears session and profile; a demo session never invokes corporate profile lookup. Update guard tests to accept active validated Supabase collaborator/supervisor/director profiles and reject missing, inactive, or invalid profiles and MSAL-only state.

- [ ] **Step 2: Run focused frontend tests and verify failures**

Run: `npm --prefix frontend test -- src/features/session/DemoSessionProvider.test.tsx src/features/session/ProtectedRoute.test.ts`
Expected: new corporate-session success cases fail before provider/guard changes.

- [ ] **Step 3: Implement idempotent session/profile resolution**

In the provider, route both restored sessions and `SIGNED_IN`/`TOKEN_REFRESHED` events through one profile-resolution path. Use a request generation or identity key to deduplicate identical in-flight profile lookups and ignore stale completions. Keep `isLoading` true until profile validation ends. Build the corporate session from the returned profile only; never use the demo fixture for a Supabase session. Clear corporate state on sign-out/session loss. Preserve the current demo restore/sign-in behavior and local collaborator profile loading only for demo sessions.

Update `authGuard` and `ProtectedRoute` to require a real active `corporateProfile` for Supabase sessions while retaining existing role-to-route policy and demo behavior. On a valid session without a profile, keep protected content denied, redirect once to `/` with an authorization reason in router state/query, and have `EcosystemLogin` display a recoverable error; do not start OAuth automatically or create a redirect loop. Inactive/invalid profile and endpoint failure follow the same visible-denial path.

- [ ] **Step 4: Run focused frontend tests to green**

Run: `npm --prefix frontend test -- src/features/session/DemoSessionProvider.test.tsx src/features/session/ProtectedRoute.test.ts`
Expected: loading, deduplication, stale-response, authorization, demo-isolation, and logout assertions pass.

- [ ] **Step 5: Commit the session/guard slice**

```bash
git add frontend/src/features/session/DemoSessionProvider.tsx frontend/src/features/session/sessionContext.ts frontend/src/features/session/types.ts frontend/src/features/session/authGuard.ts frontend/src/features/session/ProtectedRoute.tsx frontend/src/features/session/DemoSessionProvider.test.tsx frontend/src/features/session/ProtectedRoute.test.ts frontend/src/features/auth/authService.test.ts
git commit -m "feat: autoriza rotas com perfil supabase validado"
```

### Task 4: Integrate, document, and verify the complete login path

**Files:**
- Modify: `docs/auth/prestage3b2b3-local-supabase.md`
- Modify: `supabase/tests/local_auth_data_api.sh` if needed for end-to-end Auth/Data API verification
- Verify: `.github/workflows/validate-supabase-local.yml`

**Interfaces:**
- Consumes: trigger/profile schema from Task 1, API response from Task 2, and authorized session/guard from Task 3.
- Produces: documented local verification steps and a tested path from Azure Supabase Auth identity to protected application route.

- [ ] **Step 1: Extend end-to-end local Supabase coverage**

Assert that a synthetic Azure identity obtains a collaborator profile and can read its own profile through the Data API, while a non-Azure identity, anonymous request, inactive profile, and another user's profile remain denied. Keep existing manager visibility and role immutability assertions.

- [ ] **Step 2: Run all verification commands**

Run: `npm test`; `npm --prefix frontend run lint`; `npm --prefix frontend run typecheck`; `npm run typecheck`; `npm run build`; `git diff --check`; and the `Validate local Supabase Auth and Data API` workflow (local Supabase Docker required).
Expected: all available tests, lint, typechecks, build, and diff checks pass; Supabase integration workflow passes with disposable local credentials only.

- [ ] **Step 3: Review security and deployment boundaries**

Inspect the final diff for: no changes to service-role exposure, no change to existing privileged profile roles/squads, no client role input, no RLS grant to `anon`, no remote migration application, and tenant-specific Azure configuration explicitly listed as a production prerequisite.

- [ ] **Step 4: Commit documentation and final integration**

```bash
git add docs/auth/prestage3b2b3-local-supabase.md supabase/tests/local_auth_data_api.sh
git commit -m "docs: registra homologacao do provisionamento azure"
```

---

## Execution Notes

- Execute tasks sequentially: the API assumes the profile contract from the migration, and the provider assumes the API contract.
- Apply/test migrations only against local disposable Supabase or CI. Never run `supabase link`, `supabase db push`, or a production migration in this plan.
- Keep the existing `stash@{0}` containing the user's `ProtectedRoute.tsx` changes untouched; reconcile it deliberately only if the user asks to apply those changes.
- Commit each completed slice on `codex/jit-provision-spec`; do not push or merge unless separately requested.
