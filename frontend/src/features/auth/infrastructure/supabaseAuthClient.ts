import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowserConfig, type SupabaseBrowserConfig } from '../../../config/supabaseConfig'

export function createSupabaseAuthClient(config: SupabaseBrowserConfig): SupabaseClient | null {
  if (!config.enabled || !config.url || !config.anonKey) return null

  return createClient(config.url, config.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
}

export const supabaseAuthClient = createSupabaseAuthClient(getSupabaseBrowserConfig())
