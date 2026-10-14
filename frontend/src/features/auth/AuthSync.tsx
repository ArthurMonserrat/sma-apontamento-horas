import type { ReactNode } from 'react'

/**
 * Compatibilidade temporária para consumidores legados.
 *
 * O runtime corporativo não usa mais MSAL/BFF. A sessão é centralizada pelo
 * DemoSessionProvider através do Supabase Auth; este wrapper não pode iniciar
 * autenticação, provisionar perfis ou bloquear a árvore em loading.
 */
export function AuthSync({ children }: { children: ReactNode }) {
  return children
}
