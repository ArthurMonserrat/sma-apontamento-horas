# Banco 1 corporate vertical slice

## Scope

Deliver a tested persistence and approval path for Banco 1 while keeping the
corporate authorization gate closed until Microsoft Entra evidence is
homologated in a managed Supabase environment.

## Decisions

- Supabase Auth remains the single browser session authority. The legacy MSAL
  BFF is not restored as a parallel login path.
- Browser services use the anon key and RLS only; privileged provisioning and
  identity checks stay server-side.
- A corporate service is selected only after the server returns an authorized
  profile. An authenticated-but-unauthorized session never falls back to demo
  or local persistence.
- Time entries keep the complete frontend payload. Start/end are nullable for
  duration-only entries; the application never derives times from duration.
- Approval decisions are transactional, version-checked, and audited in a
  dedicated table/RPC.

## Deliveries

1. Wire the server-authorized Supabase session into the React session state,
   preserving the current fail-closed gate.
2. Add the additive persistence/approval contract and RLS-safe RPCs.
3. Add Supabase-backed time-entry and supervisor services with mapping and
   error tests. Keep local services for demo/tests.
4. Run the real local Supabase Auth/Data API/RLS workflow with synthetic users,
   then publish the branch/PR without merge.

## Explicit external blocker

The real Microsoft Entra-to-Supabase identity binding and the production
database migration remain blocked on TI/managed-Supabase homologation. This
branch must not enable `CORPORATE_AUTHORIZATION_IMPLEMENTED` or modify remote
data.
