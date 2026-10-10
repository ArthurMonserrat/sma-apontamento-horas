import { useEffect, useState } from 'react'
import { PageContainer } from '../../shared/ui/PageContainer'
import { useSession } from '../../features/session/useSession'
import { CriarAviso } from '../../features/announcements/CriarAviso'
import type { Comunicado, ComunicadoDestinatario, ComunicadoTipo } from '../../features/announcements/types'
import { ANNOUNCEMENTS_UPDATED_EVENT, canDeleteAnnouncement, deleteAnnouncement, hideAnnouncementForUser, isAnnouncementHiddenForUser, readAnnouncements } from '../../features/announcements/infrastructure/announcementService'

const comunicadosMock: Comunicado[] = [
  {
    id: 'aviso-fechamento-julho-2026',
    titulo: 'Fechamento do mês antecipado',
    mensagem: 'Em razão do feriado nacional, o fechamento dos apontamentos de julho acontecerá antecipadamente no dia 03/08, às 12h. Revise seus lançamentos e envie eventuais ajustes antes desse horário.',
    dataPublicacao: '2026-07-29',
    timestamp: '2026-07-29T12:00:00.000Z',
    autor: 'RH',
    tipo: 'alerta',
    urgencia: 'alerta',
    tipo_destinatario: 'all',
    alvo_referencia: null,
    oculto_por: [],
  },
  {
    id: 'aviso-politica-apontamentos',
    titulo: 'Revisão dos apontamentos da semana',
    mensagem: 'Reserve alguns minutos ao final de cada dia para conferir horas, projeto e detalhamento. Essa rotina ajuda a manter o fechamento da operação mais ágil.',
    dataPublicacao: '2026-07-24',
    timestamp: '2026-07-24T12:00:00.000Z',
    autor: 'Diretoria',
    tipo: 'info',
    urgencia: 'info',
    tipo_destinatario: 'all',
    alvo_referencia: null,
    oculto_por: [],
  },
  {
    id: 'aviso-prazo-urgente',
    titulo: 'Ação necessária: regularize pendências',
    mensagem: 'Existem apontamentos pendentes de revisão no seu histórico. Confira os registros e encaminhe as correções solicitadas antes do prazo de fechamento.',
    dataPublicacao: '2026-07-22',
    timestamp: '2026-07-22T12:00:00.000Z',
    autor: 'Supervisão',
    tipo: 'urgente',
    urgencia: 'urgente',
    tipo_destinatario: 'all',
    alvo_referencia: null,
    oculto_por: [],
  },
]

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

function isVisibleToCollaborator(comunicado: Comunicado, collaboratorId: string | undefined, email: string | undefined, squadId: string | undefined) {
  if (comunicado.tipo_destinatario === 'all') return true
  if (!comunicado.alvo_referencia) return false
  if (comunicado.tipo_destinatario === 'team') return comunicado.alvo_referencia === squadId
  return comunicado.alvo_referencia === collaboratorId || comunicado.alvo_referencia.toLowerCase() === email?.toLowerCase()
}

function formatPublicationDate(date: string) {
  const parsedDate = new Date(date.includes('T') ? date : `${date}T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(parsedDate)
}

export function AvisosPage({ embedded = false }: { embedded?: boolean }) {
  const { profile, session } = useSession()
  const [comunicados, setComunicados] = useState<Comunicado[]>(() => readAnnouncements(comunicadosMock))

  const safeAnnouncements = Array.isArray(comunicados) ? comunicados : []
  const visibleAnnouncements = safeAnnouncements
    .filter((comunicado) => !isAnnouncementHiddenForUser(comunicado, session?.id))
    .filter((comunicado) => session?.role !== 'COLLABORATOR' || isVisibleToCollaborator(comunicado, profile?.id, profile?.email, profile?.activeSquadId))

  function handleDelete(comunicado: Comunicado) {
    if (!canDeleteAnnouncement(comunicado, session?.role, session?.id)) return
    if (!window.confirm(`Excluir o aviso "${comunicado.titulo}"?`)) return
    if (deleteAnnouncement(comunicado.id)) setComunicados(readAnnouncements(comunicadosMock))
  }

  function handleHide(comunicado: Comunicado) {
    if (!session?.id || !window.confirm('Apagar este aviso somente para você?')) return
    if (hideAnnouncementForUser(comunicado.id, session.id)) setComunicados((current) => current.filter((item) => item.id !== comunicado.id))
  }

  useEffect(() => {
    const reload = () => setComunicados(readAnnouncements(comunicadosMock))
    window.addEventListener(ANNOUNCEMENTS_UPDATED_EVENT, reload)
    return () => window.removeEventListener(ANNOUNCEMENTS_UPDATED_EVENT, reload)
  }, [])

  const content = (
    <>
      <CriarAviso />
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
                    {canDeleteAnnouncement(comunicado, session?.role, session?.id) && <button type="button" onClick={() => handleDelete(comunicado)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]" aria-label={`Excluir aviso ${comunicado.titulo}`}><span aria-hidden="true">&#128465;</span><span className="sr-only">Excluir</span></button>}
                    <button type="button" onClick={() => handleHide(comunicado)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]" aria-label={`Apagar aviso ${comunicado.titulo} para mim`}><span aria-hidden="true">×</span><span className="sr-only">Apagar para mim</span></button>
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
