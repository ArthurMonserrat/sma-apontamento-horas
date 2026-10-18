import { describe, expect, it } from 'vitest'
import { getSupabaseBrowserConfig } from './supabaseConfig'

describe('getSupabaseBrowserConfig', () => {
  it('permanece desabilitado quando as variáveis públicas não existem', () => {
    expect(getSupabaseBrowserConfig({}, 'https://app.example')).toEqual({
      url: '',
      anonKey: '',
      redirectTo: '',
      enabled: false,
    })
  })

  it('aceita somente o redirect atual presente na allowlist explícita', () => {
    const config = getSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_ALLOWED_REDIRECTS: 'https://app.example/#/auth/callback,https://localhost:5173/#/auth/callback',
    }, 'https://app.example')

    expect(config).toEqual({
      url: 'https://project.supabase.co',
      anonKey: 'anon-key',
      redirectTo: 'https://app.example/#/auth/callback',
      enabled: true,
    })
  })

  it('não habilita login quando a origem atual não está permitida', () => {
    const config = getSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_ALLOWED_REDIRECTS: 'https://app.example/#/auth/callback',
    }, 'https://evil.example')

    expect(config.enabled).toBe(false)
    expect(config.redirectTo).toBe('')
  })

  it('gera o callback HashRouter do GitHub Pages com a base publicada', () => {
    const config = getSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_ALLOWED_REDIRECTS: 'https://arthurmonserrat.github.io/sma-apontamento-horas/#/auth/callback',
    }, 'https://arthurmonserrat.github.io', '/sma-apontamento-horas/')

    expect(config.redirectTo).toBe('https://arthurmonserrat.github.io/sma-apontamento-horas/#/auth/callback')
    expect(config.enabled).toBe(true)
  })

  it('gera o callback HashRouter da raiz usada no Vercel', () => {
    const config = getSupabaseBrowserConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SUPABASE_ALLOWED_REDIRECTS: 'https://sma-apontamento-horas.example/#/auth/callback',
    }, 'https://sma-apontamento-horas.example', '/')

    expect(config.redirectTo).toBe('https://sma-apontamento-horas.example/#/auth/callback')
    expect(config.enabled).toBe(true)
  })
})
