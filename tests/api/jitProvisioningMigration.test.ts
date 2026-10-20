import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20261020180000_jit_azure_collaborator_provisioning.sql')

function readMigration() {
  expect(existsSync(migrationPath)).toBe(true)
  return readFileSync(migrationPath, 'utf8').toLowerCase()
}

describe('Azure JIT collaborator migration contract', () => {
  it('creates an Azure-only trigger and links both profile IDs to auth.users', () => {
    const sql = readMigration()

    expect(sql).toMatch(/after insert on auth\.users/)
    expect(sql).toContain("raw_app_meta_data ->> 'provider'")
    expect(sql).toContain("= 'azure'")
    expect(sql).toMatch(/insert into public\.profiles\s*\(\s*id,\s*auth_user_id,\s*email,\s*full_name,\s*role,\s*active,\s*squad_id/s)
    expect(sql).toContain("new.id")
    expect(sql).toContain("'colaborador'::public.app_role")
  })

  it('keeps provisioning private and refuses client execution', () => {
    const sql = readMigration()

    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/)
    expect(sql).toMatch(/revoke all privileges on function private\.provision_azure_collaborator\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/create trigger[\s\S]*after insert on auth\.users/)
  })

  it('does not promote roles or attach profiles by email alone', () => {
    const sql = readMigration()

    expect(sql).not.toMatch(/user_metadata\s*->>\s*'role'/)
    expect(sql).not.toMatch(/on conflict\s*\(email\)\s*do\s*update/)
    expect(sql).toContain('where p.auth_user_id = u.id')
    expect(sql).toContain('auth_user.email_confirmed_at is null')
  })
})
