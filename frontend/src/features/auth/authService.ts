import { supabase } from '../../config/supabaseClient'
import type { CorporateProfile, DemoRole } from '../session/types'

const PROFILE_NOT_FOUND = 'PGRST116'

function requireSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
  return supabase
}

/**
 * Obtém a autorização corporativa pelo e-mail autenticado no Microsoft.
 * Novos usuários entram como colaborador (JIT); o cliente nunca escolhe o papel.
 */
export async function getCorporateProfile(email: string, fullName: string): Promise<CorporateProfile> {
  const client = requireSupabaseClient()
  const normalizedEmail = email.trim()
  const normalizedName = fullName.trim() || normalizedEmail

  const existing = await client
    .from('profiles')
    .select('*')
    .eq('email', normalizedEmail)
    .single()

  if (existing.data) return existing.data as CorporateProfile
  if (existing.error && existing.error.code !== PROFILE_NOT_FOUND) throw existing.error

  const created = await client
    .from('profiles')
    .insert([{ email: normalizedEmail, full_name: normalizedName, role: 'colaborador', active: true }])
    .select()
    .single()

  if (created.error) throw created.error
  if (!created.data) throw new Error('O perfil corporativo não foi retornado após o provisionamento.')
  return created.data as CorporateProfile
}

export function mapCorporateRole(role: CorporateProfile['role']): DemoRole {
  if (role === 'supervisor') return 'SUPERVISOR'
  if (role === 'diretor') return 'DIRECTOR_ADMIN'
  return 'COLLABORATOR'
}
