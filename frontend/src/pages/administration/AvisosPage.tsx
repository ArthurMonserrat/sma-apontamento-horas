import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageContainer } from '../../shared/ui/PageContainer'
import { useSession } from '../../features/session/useSession'
import { CriarAviso } from '../../features/announcements/CriarAviso'
import type { Comunicado, ComunicadoDestinatario, ComunicadoTipo } from '../../features/announcements/types'
import { ANNOUNCEMENTS_UPDATED_EVENT, canDeleteAnnouncement, isAnnouncementHiddenForUser, isVisibleToCollaborator } from '../../features/announcements/infrastructure/announcementService'
import { getAnnouncementRepository, type AnnouncementRepository } from '../../features/announcements/infrastructure/announcementRepository'
import { isCorporateDataActive } from '../../features/corporate/corporateData'
import { useAnnouncementNotifications } from '../../features/announcements/notifications/announcementNotificationsContext'


const tipoPresentation: Record<ComunicadoTipo, { label: string, border: string, badge: string }> = {
  info: {
    label: 'Informação',
    border: 'border-l-[var(--color-border-strong)] bg-[var(--color-surface)]',
    badge: 'border-[var(--color-border-strong)] bg-[var(--color-secondary)] text-white',
  },
  alerta: {
    label: 'Atenção',
    border: 'border-l-orange-500 bg-orange-50 dark:border-l-orange-400 dark:bg-orange-950/25',
    badge: 'border-orange-500 bg-orange-500 text-white',
  },
  urgente: {
    label: 'Urgente',
    border: 'border-l-red-800 bg-red-50 dark:border-l-red-500 dark:bg-red-950/30',
    badge: 'border-red-800 bg-red-800 text-white dark:border-red-700 dark:bg-red-700',
  },
}

const recipientPresentation: Record<ComunicadoDestinatario, string> = {
  all: 'Aviso Geral',
  team: 'Equipe Específica',
  individual: 'Mensagem Direta',
}


function formatPublicationDate(date: string) {
  const parsedDate = new Date(date.includes('T') ? date : `${date}T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(parsedDate)
}


export function AvisosPage({ embedded = false, repository: injectedRepository }: { embedded?: boolean, repository?: AnnouncementRepository }) {
  const { profile, session } = useSession()
  // Login Microsoft: avisos no banco de dados (cada pessoa recebe só os destinados a ela).
  const corporate = isCorporateDataActive()
  const repository = useMemo(() => injectedRepository ?? getAnnouncementRepository(corporate), [corporate, injectedRepository])
  const [comunicados, setComunicados] = useState<Comunicado[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const safeAnnouncements = Array.isArray(comunicados) ? comunicados : []
  const visibleAnnouncements = safeAnnouncements
    .filter((comunicado) => !isAnnouncementHiddenForUser(comunicado, session?.id))
    .filter((comunicado) => corporate || session?.role !== 'COLLABORATOR' || isVisibleToCollaborator(comunicado, profile?.id, profile?.email, profile?.activeSquadId))

  const { markAllRead, browserNotifications, enableBrowserNotifications } = useAnnouncementNotifications()

  // Abriu a tela de Avisos: os avisos visíveis contam como lidos (zera o contador do menu).
  const unreadVisibleIds = visibleAnnouncements.filter((item) => !item.lido).map((item) => item.id).join(',')
  const markedRef = useRef(new Set<string>())
  useEffect(() => {
    const ids = unreadVisibleIds ? unreadVisibleIds.split(',').filter((id) => !markedRef.current.has(id)) : []
    if (ids.length === 0) return
    ids.forEach((id) => markedRef.current.add(id))
    void markAllRead(ids)
  }, [markAllRead, unreadVisibleIds])

  const reload = useCallback(async () => {
    try {
      setComunicados(await repository.list())
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os avisos.')
    }
  }, [repository])

  async function handleDelete(comunicado: Comunicado) {
    if (!canDeleteAnnouncement(comunicado, session?.role, session?.id)) return
    if (!window.confirm(`Excluir o aviso "${comunicado.titulo}"?`)) return
    try {
      if (await repository.remove(comunicado.id)) await reload()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível excluir o aviso.')
    }
  }

  async function handleHide(comunicado: Comunicado) {
    if (!session?.id || !window.confirm('Apagar este aviso somente para você?')) return
    try {
      if (await repository.hide(comunicado.id, session.id)) setComunicados((current) => current.filter((item) => item.id !== comunicado.id))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível ocultar o aviso.')
    }
  }

  useEffect(() => {
    void reload()
    const onChanged = () => { void reload() }
    window.addEventListener(ANNOUNCEMENTS_UPDATED_EVENT, onChanged)
    return () => window.removeEventListener(ANNOUNCEMENTS_UPDATED_EVENT, onChanged)
  }, [reload])

  const content = (
    <>
      {browserNotifications === 'default' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--color-text-muted)]">Receba um balão de notificação no computador ou celular quando chegar um aviso novo.</p>
          <button type="button" onClick={() => void enableBrowserNotifications()} className="ui-button-primary whitespace-nowrap">Ativar notificações</button>
        </div>
      )}
      <CriarAviso repository={repository} />
      {loadError && <p role="alert" className="rounded-2xl border border-[var(--color-danger)] p-4 text-sm font-semibold text-[var(--color-danger)]">{loadError}</p>}
      <section className="space-y-4" aria-labelledby="announcements-title">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Comunicados</p>
            <h2 id="announcements-title" className="mt-1 text-xl font-extrabold ui-text">Mensagens recentes</h2>
          </div>
          <span className="text-sm text-[var(--color-text-muted)]">{visibleAnnouncements.length} comunicado(s)</span>
        </div>

        <div className="space-y-4">
          {visibleAnnouncements.length === 0 ? <p className="rounded-2xl border ui-border ui-surface p-8 text-center text-sm font-semibold ui-text-muted">Nenhum comunicado publicado.</p> : visibleAnnouncements.map((comunicado) => {
            const presentation = tipoPresentation[comunicado.tipo]
            return (
              <article key={comunicado.id} className={`rounded-2xl border border-l-4 ui-border ui-surface p-5 shadow-sm ${presentation.border}`}>
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold ui-text">{comunicado.titulo}</h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      Publicado em {formatPublicationDate(comunicado.dataPublicacao)} · por {comunicado.autor}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${presentation.badge}`}>{presentation.label}</span>
                    <span className="w-fit rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)]">{recipientPresentation[comunicado.tipo_destinatario]}</span>
                    {canDeleteAnnouncement(comunicado, session?.role, session?.id) && <button type="button" onClick={() => void handleDelete(comunicado)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]" aria-label={`Excluir aviso ${comunicado.titulo}`}><span aria-hidden="true">&#128465;</span><span className="sr-only">Excluir</span></button>}
                    <button type="button" onClick={() => void handleHide(comunicado)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]" aria-label={`Apagar aviso ${comunicado.titulo} para mim`}><span aria-hidden="true">×</span><span className="sr-only">Apagar para mim</span></button>
                  </div>
                </header>
                <p className="mt-4 max-w-4xl text-sm leading-7 ui-text-muted">{comunicado.mensagem}</p>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )

  if (embedded) return content

  return (
    <PageContainer
      title="Avisos"
      description="Acompanhe comunicados importantes da Diretoria, do RH e da supervisão da operação."
      contained={false}
    >
      {content}
    </PageContainer>
  )
}
