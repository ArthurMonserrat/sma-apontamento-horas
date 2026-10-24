import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20261024120000_profiles_id_jit_contract.sql')

function readMigration() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8').toLowerCase()
}

describe('profiles.id Azure JIT reconciliation migration contract', () => {
  it('validates the production columns and accepts checked text or app_role', () => {
    const sql = readMigration()

    expect(sql).toContain('profiles.id must be uuid')
    expect(sql).toContain('profiles_role_check')
    expect(sql).toContain("role_type = 'text'")
    expect(sql).toContain("role_type <> 'app_role'")
    expect(sql).not.toContain('must reference auth.users(id)')
  })

  it('provisions by profiles.id without an enum cast or the legacy profile columns', () => {
    const sql = readMigration()

    expect(sql).toMatch(/insert into public\.profiles\s*\(\s*id,\s*email,\s*full_name,\s*role,\s*active/s)
    expect(sql).toContain('on conflict (id) do nothing')
    expect(sql).not.toMatch(/public\.profiles\s*\([^)]*auth_user_id/s)
    expect(sql).not.toMatch(/public\.profiles\s*\([^)]*squad_id/s)
    expect(sql).not.toContain("'colaborador'::public.app_role")
    expect(sql).toContain("values (auth_user.id, normalized_email, profile_name, 'colaborador', true)")
    expect(sql).toMatch(/after insert on auth\.users/)
    expect(sql).toContain("raw_app_meta_data ->> 'provider'")
    expect(sql).toContain("= 'azure'")
    expect(sql).toContain("new.id")
  })

  it('keeps provisioning private and refuses client execution', () => {
    const sql = readMigration()

    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/)
    expect(sql).toMatch(/revoke all privileges on function private\.provision_azure_collaborator\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant select on public\.profiles to service_role/)
    expect(sql).toMatch(/revoke all privileges on function private\.current_profile_role\(\) from public, anon, authenticated/)
    expect(sql).toMatch(/create trigger[\s\S]*after insert on auth\.users/)
    expect(sql).toMatch(/exception\s+when others[\s\S]*get stacked diagnostics failure_sqlstate = returned_sqlstate/)
    expect(sql).toMatch(/'error', 'sqlstate:' \|\| failure_sqlstate/)
    expect(sql).toMatch(/drop trigger if exists on_auth_user_created_provision_azure_collaborator on auth\.users/)
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

  it('adds the profiles/auth.users foreign key only when no orphan ids exist', () => {
    const sql = readMigration()

    expect(sql).toContain('left join auth.users as u on u.id = p.id')
    expect(sql).toContain('if orphan_count = 0 then')
    expect(sql).toMatch(/foreign key \(id\) references auth\.users\(id\) on delete cascade not valid/)
    expect(sql).toMatch(/validate constraint %i/)
    expect(sql).toMatch(/raise notice 'skipped profiles\.id -> auth\.users\.id foreign key/)
  })

  it('uses named policy drops and replaces the old enum-returning function safely', () => {
    const sql = readMigration()

    expect(sql).toMatch(/pg_policies[\s\S]*current_profile_role/)
    expect(sql).toMatch(/pg_depend[\s\S]*pg_policy[\s\S]*current_profile_role/)
    expect(sql).toContain('drop policy if exists profiles_select_own on public.profiles')
    expect(sql).toContain('drop policy if exists profiles_select_supervisor_team on public.profiles')
    expect(sql).toContain('drop policy if exists profiles_select_director on public.profiles')
    expect(sql).not.toMatch(/for existing_policy in[\s\S]*drop policy/)
    expect(sql).toMatch(/drop function if exists private\.current_profile_role\(\)[\s\S]*create function private\.current_profile_role\(\)[\s\S]*returns text/)
  })

  it('suppresses any trigger-level provisioning exception so auth.users insertion succeeds', () => {
    const sql = readMigration()
    const triggerFunction = sql.slice(sql.indexOf('create or replace function private.handle_azure_auth_user_created()'))

    expect(triggerFunction).toMatch(/exception when others[\s\S]*raise warning[\s\S]*return new/)
  })
})
