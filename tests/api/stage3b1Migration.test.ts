import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20261016210000_stage3b1_identity_foundation.sql')

describe('stage 3B.1 migration safety contract', () => {
  it('is additive and preserves legacy rows', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toMatch(/alter table public\.profiles\s+add column if not exists auth_user_id/)
    expect(sql).toContain('microsoft_tenant_id')
    expect(sql).toContain('microsoft_object_id')
    expect(sql).toContain('create unique index')
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+into?\b/)
    expect(sql).not.toMatch(/\bdelete\s+from\b/)
    expect(sql).not.toMatch(/\bdrop\s+/)
  })

  it('does not enable corporate authorization or grant administrative table access', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).not.toContain('corporate_authorization_implemented')
    expect(sql).not.toContain('grant select on table public.access_preapprovals')
    expect(sql).toContain('revoke all on table private.corporate_provisioning_audit from public')
  })

  it('guards constraint creation so a partially applied migration can be retried safely', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('if not exists (select 1 from pg_constraint')
    expect(sql).toContain('profiles_auth_user_id_fkey')
    expect(sql).toContain('profiles_identity_pair_check')
    expect(sql).toContain('access_preapprovals_identity_pair_check')
  })
})
