import type { User } from '@supabase/supabase-js'
import type { CorporateProfile, CorporateRole } from '../session/types'

/** Dados exibidos em "Meu perfil", derivados apenas do login corporativo. */
export type CorporateIdentityView = {
  firstName: string
  lastName: string
  fullName: string
  initials: string
  email: string
  roleLabel: string
  active: boolean
  providerLabel: string
  firstAccessAt: string | null
  lastSignInAt: string | null
}

const ROLE_LABELS: Record<CorporateRole, string> = {
  colaborador: 'Colaborador',
  supervisor: 'Supervisor',
  diretor: 'Diretoria',
}

const LOWERCASE_PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])

function capitalizeWord(word: string, index: number): string {
  const lower = word.toLocaleLowerCase('pt-BR')
  if (index > 0 && LOWERCASE_PARTICLES.has(lower)) return lower
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** "fernando.almeida@sma-eng.com.br" -> "Fernando Almeida" */
export function nameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  const words = localPart.split(/[._-]+/).filter((word) => /[a-zà-ú]/i.test(word))
  return words.map(capitalizeWord).join(' ')
}

/** Separa nome e sobrenome; nomes do meio ficam junto do sobrenome ("Ana Maria Souza" -> "Ana" / "Maria Souza"). */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const words = normalizeSpaces(fullName).split(' ').filter(Boolean)
  if (words.length === 0) return { firstName: '', lastName: '' }
  return { firstName: words[0], lastName: words.slice(1).join(' ') }
}

function readMetadataName(user: User | null | undefined): string | null {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  for (const key of ['full_name', 'name']) {
    const value = metadata[key]
    if (typeof value === 'string' && normalizeSpaces(value)) return normalizeSpaces(value)
  }
  return null
}

function looksLikeEmailOrHandle(value: string): boolean {
  return value.includes('@') || !value.includes(' ')
}

/**
 * Prioridade do nome: perfil corporativo validado -> nome enviado pela Microsoft -> derivado do e-mail.
 * Um nome que é só o "usuário" do e-mail (ex.: "fernando.almeida") é tratado como ausente.
 */
export function resolveDisplayName(profile: CorporateProfile, user?: User | null): string {
  const candidates = [profile.full_name, readMetadataName(user)]
    .filter((value): value is string => typeof value === 'string')
    .map(normalizeSpaces)
    .filter(Boolean)
  const realName = candidates.find((value) => !looksLikeEmailOrHandle(value))
  return realName ?? (nameFromEmail(profile.email) || candidates[0] || profile.email)
}

export function buildCorporateIdentity(profile: CorporateProfile, user?: User | null): CorporateIdentityView {
  const fullName = resolveDisplayName(profile, user)
  const { firstName, lastName } = splitFullName(fullName)
  const initials = `${firstName.charAt(0)}${lastName.split(' ').pop()?.charAt(0) ?? ''}`.toLocaleUpperCase('pt-BR') || '?'
  const provider = typeof user?.app_metadata?.provider === 'string' ? user.app_metadata.provider : 'azure'

  return {
    firstName,
    lastName,
    fullName,
    initials,
    email: profile.email,
    roleLabel: ROLE_LABELS[profile.role] ?? profile.role,
    active: profile.active,
    providerLabel: provider === 'azure' ? 'Microsoft (conta corporativa SM&A)' : provider,
    firstAccessAt: user?.created_at ?? null,
    lastSignInAt: user?.last_sign_in_at ?? null,
  }
}

export function formatDateTimePtBr(value: string | null): string {
  if (!value) return 'Não informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date)
}
