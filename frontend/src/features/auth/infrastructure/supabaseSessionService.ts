import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserConfig } from '../../../config/supabaseConfig'
import { supabaseAuthClient } from './supabaseAuthClient'

type CallbackExchangeResult = { error: Error | null }

const exchangedCallbackResults = new Map<string, Promise<CallbackExchangeResult>>()

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback)
}

export function clearAuthCallbackUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const parameter of ['code', 'state', 'error', 'error_code', 'error_description']) {
    url.searchParams.delete(parameter)
  }
  const hashSeparator = url.hash.indexOf('?')
  if (hashSeparator >= 0) {
    const hashPath = url.hash.slice(0, hashSeparator)
    const hashSearch = new URLSearchParams(url.hash.slice(hashSeparator + 1))
    for (const parameter of ['code', 'state', 'error', 'error_code', 'error_description']) hashSearch.delete(parameter)
    url.hash = `${hashPath}${hashSearch.toString() ? `?${hashSearch.toString()}` : ''}`
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export function resetCallbackExchangeState(): void {
  exchangedCallbackResults.clear()
}

export async function startCorporateOAuth(): Promise<{ error: Error | null }> {
  const config = getSupabaseBrowserConfig()
  if (!supabaseAuthClient || !config.enabled || !config.redirectTo) {
    return { error: new Error('Supabase Auth não está configurado para este ambiente.') }
  }

  const { error } = await supabaseAuthClient.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: config.redirectTo,
      scopes: 'openid profile email',
    },
  })
  return { error: error ? asError(error, 'Não foi possível iniciar o login corporativo.') : null }
}

export async function exchangeCallbackCode(code: string): Promise<CallbackExchangeResult> {
  if (!supabaseAuthClient || !code.trim()) {
    clearAuthCallbackUrl()
    return { error: new Error('Código de callback inválido.') }
  }
  const previousExchange = exchangedCallbackResults.get(code)
  if (previousExchange) return previousExchange

  const exchange = (async (): Promise<CallbackExchangeResult> => {
    try {
      const { error } = await supabaseAuthClient.auth.exchangeCodeForSession(code)
      return { error: error ? asError(error, 'Não foi possível concluir o callback.') : null }
    } catch (error) {
      return { error: asError(error, 'Não foi possível concluir o callback.') }
    } finally {
      clearAuthCallbackUrl()
    }
  })()
  exchangedCallbackResults.set(code, exchange)
  return exchange
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabaseAuthClient) return null
  const { data, error } = await supabaseAuthClient.auth.getSession()
  return error ? null : data.session
}

export function subscribe(listener: (event: AuthChangeEvent, session: Session | null) => void): { unsubscribe: () => void } {
  if (!supabaseAuthClient) return { unsubscribe: () => undefined }
  const { data } = supabaseAuthClient.auth.onAuthStateChange(listener)
  return data.subscription
}

export async function signOut(): Promise<{ error: Error | null }> {
  if (!supabaseAuthClient) return { error: null }
  const { error } = await supabaseAuthClient.auth.signOut()
  return { error: error ? asError(error, 'Não foi possível encerrar a sessão.') : null }
}
