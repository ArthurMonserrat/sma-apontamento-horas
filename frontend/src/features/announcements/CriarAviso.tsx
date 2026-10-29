import { useEffect, useState, type FormEvent } from 'react'
import { useSession } from '../session/useSession'
import { getAllColaboradores } from '../../demo/fixtures/mockDEP'
import { demoSquads } from '../../demo/fixtures/demoData'
import { isCorporateDataActive, listCorporatePeople } from '../corporate/corporateData'
import { onlineTeamService } from '../teams/infrastructure/onlineTeamService'
import { LocalAnnouncementRepository, type AnnouncementRepository } from './infrastructure/announcementRepository'
import type { ComunicadoDestinatario, ComunicadoTipo } from './types'

type Option = { value: string; label: string }

const demoTeamOptions = (): Option[] => (Array.isArray(demoSquads) ? demoSquads : []).map((squad) => ({ value: squad.id, label: squad.name }))
const demoPeopleOptions = (): Option[] => (getAllColaboradores() ?? []).map((name) => ({ value: name, label: name }))
const fallbackRepository = new LocalAnnouncementRepository()

const urgencyOptions: Array<{ value: ComunicadoTipo, label: string }> = [
  { value: 'info', label: 'Normal' },
  { value: 'alerta', label: 'Importante' },
  { value: 'urgente', label: 'Crítico' },
]

const recipientOptions: Array<{ value: ComunicadoDestinatario, label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'team', label: 'Equipe Específica' },
  { value: 'individual', label: 'Colaborador Específico' },
]

export function CriarAviso({ repository = fallbackRepository }: { repository?: AnnouncementRepository }) {
  const { session } = useSession()
  const corporate = isCorporateDataActive()
  const [teamOptions, setTeamOptions] = useState<Option[]>(() => corporate ? [] : demoTeamOptions())
  const [peopleOptions, setPeopleOptions] = useState<Option[]>(() => corporate ? [] : demoPeopleOptions())
  const [isSending, setSending] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<ComunicadoTipo>('info')
  const [recipientType, setRecipientType] = useState<ComunicadoDestinatario>('all')
  const [recipientReference, setRecipientReference] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const sessionRole = session?.role ?? null
  const canCreate = sessionRole === 'SUPERVISOR' || sessionRole === 'DIRECTOR_ADMIN'

  // Login Microsoft: equipes e pessoas reais (a diretoria vê todas; o supervisor, a própria equipe).
  useEffect(() => {
    if (!corporate || !canCreate) return
    let active = true
    void Promise.all([onlineTeamService.listTeams(), listCorporatePeople()])
      .then(([teams, people]) => {
        if (!active) return
        const visibleTeams = sessionRole === 'SUPERVISOR' ? teams.filter((team) => team.supervisorId === session?.id || team.coSupervisorIds.includes(session?.id ?? '')) : teams
        setTeamOptions(visibleTeams.map((team) => ({ value: team.id, label: team.name })))
        // O banco já entrega ao supervisor só as pessoas das equipes que ele supervisiona.
        const visiblePeople = people.filter((person) => person.id !== session?.id && (sessionRole !== 'SUPERVISOR' || Boolean(person.teamId)))
        setPeopleOptions(visiblePeople.map((person) => ({ value: person.id, label: person.name })))
      })
      .catch(() => { if (active) { setTeamOptions([]); setPeopleOptions([]) } })
    return () => { active = false }
  }, [canCreate, corporate, session?.id, sessionRole])

  if (!canCreate) return null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSending) return
    const titulo = title?.trim() ?? ''
    const mensagem = message?.trim() ?? ''
    if (!titulo || !mensagem || !session || (recipientType !== 'all' && !recipientReference)) {
      setFeedback('Preencha o título e a mensagem para enviar o aviso.')
      return
    }
    setSending(true)
    try {
      await repository.create({
        titulo,
        mensagem,
        urgencia: type,
        tipoDestinatario: recipientType,
        alvoReferencia: recipientType === 'all' ? null : recipientReference,
        autor: session.role === 'SUPERVISOR' ? 'Supervisor (Modo Offline)' : 'Gestão (Modo Offline)',
        autorId: session.id,
      })
      setTitle('')
      setMessage('')
      setType('info')
      setRecipientType('all')
      setRecipientReference('')
      setFeedback('Aviso enviado com sucesso.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível enviar o aviso. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="ui-card rounded-2xl p-5 sm:p-6" aria-labelledby="create-announcement-title">
      <div className="mb-5">
        <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Comunicação</p>
        <h2 id="create-announcement-title" className="mt-1 text-xl font-extrabold ui-text">Criar Novo Aviso</h2>
        <p className="mt-1 text-sm ui-text-muted">Publique uma orientação para os colaboradores da operação.</p>
      </div>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-bold ui-text">
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 block w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2" />
        </label>
        <label className="block text-sm font-bold ui-text">
          Mensagem
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="mt-2 block w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2" />
        </label>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="block text-sm font-bold ui-text sm:min-w-64">
            Urgência
            <select value={type} onChange={(event) => setType(event.target.value as ComunicadoTipo)} className="mt-2 block w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2">
              {urgencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold ui-text sm:min-w-64">
            Destinatário
            <select value={recipientType} onChange={(event) => { setRecipientType(event.target.value as ComunicadoDestinatario); setRecipientReference('') }} className="mt-2 block w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2">
              {recipientOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="submit" className="ui-button-primary" disabled={isSending}>{isSending ? 'Enviando…' : 'Enviar Aviso'}</button>
        </div>
        {recipientType === 'team' && (
          <label className="block text-sm font-bold ui-text">
            Equipe destinatária
            <select value={recipientReference} onChange={(event) => setRecipientReference(event.target.value)} className="mt-2 block w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2">
              <option value="">Selecione uma equipe</option>
              {teamOptions.map((team) => <option key={team.value} value={team.value}>{team.label}</option>)}
            </select>
          </label>
        )}
        {recipientType === 'individual' && (
          <label className="block text-sm font-bold ui-text">
            Colaborador destinatário
            <select value={recipientReference} onChange={(event) => setRecipientReference(event.target.value)} className="mt-2 block w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2">
              <option value="">Selecione um colaborador</option>
              {peopleOptions.map((person) => <option key={person.value} value={person.value}>{person.label}</option>)}
            </select>
          </label>
        )}
        {feedback && <p role="status" className="text-sm font-semibold ui-text-muted">{feedback}</p>}
      </form>
    </section>
  )
}
