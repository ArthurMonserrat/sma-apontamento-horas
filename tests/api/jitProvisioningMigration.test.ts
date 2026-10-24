import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20261024120000_profiles_id_jit_contract.sql')

function readMigration() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8').toLowerCase()
}

describe('profiles.id Azure JIT reconciliation migration contract', () => {
  it('checks the production profile contract and provisions by profiles.id', () => {
    const sql = readMigration()

    expect(sql).toContain('profiles.id must be uuid primary key references auth.users(id)')
    expect(sql).toMatch(/insert into public\.profiles\s*\(\s*id,\s*email,\s*full_name,\s*role,\s*active/s)
    expect(sql).toContain('on conflict (id) do nothing')
    expect(sql).not.toMatch(/public\.profiles\s*\([^)]*auth_user_id/s)
    expect(sql).not.toMatch(/public\.profiles\s*\([^)]*squad_id/s)
    expect(sql).toMatch(/after insert on auth\.users/)
    expect(sql).toContain("raw_app_meta_data ->> 'provider'")
    expect(sql).toContain("= 'azure'")
    expect(sql).toContain("new.id")
    expect(sql).toContain("'colaborador'::public.app_role")
  })

  it('keeps provisioning private and refuses client execution', () => {
    const sql = readMigration()

    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/)
    expect(sql).toMatch(/revoke all privileges on function private\.provision_azure_collaborator\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant select on table public\.profiles to service_role/)
    expect(sql).toMatch(/revoke all privileges on function private\.current_profile_role\(\) from public, anon, authenticated/)
    expect(sql).toMatch(/create trigger[\s\S]*after insert on auth\.users/)
  })

  it('does not promote roles or attach profiles by email alone', () => {
    const sql = readMigration()

    expect(sql).not.toMatch(/user_metadata\s*->>\s*'role'/)
    expect(sql).not.toMatch(/on conflict\s*\(email\)\s*do\s*update/)
    expect(sql).toContain('where p.id = u.id')
    expect(sql).toContain('auth_user.email_confirmed_at is null')
  })

  it('resolves identity by id and fails closed for unmodelled squad membership', () => {
    const sql = readMigration()

    expect(sql).toMatch(/where p\.id = auth\.uid\(\)/)
    expect(sql).toMatch(/current_profile_squad_id\(\)[\s\S]*select null::uuid/)
    expect(sql).toMatch(/is_in_current_squad\(target_profile_id uuid\)[\s\S]*select false/)
    expect(sql).toMatch(/using\s*\(\s*id = auth\.uid\(\)\s*\)/)
  })
})
