import { useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import SignatureCanvas from 'react-signature-canvas'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../../shared/ui/PageContainer'
import { useProfile } from '../../features/collaborator/useProfile'
import { ProfileSummary } from '../../features/profile/ProfileSummary'
import { WorkloadHistory } from '../../features/workloads/WorkloadHistory'
import { WorkloadRequestForm, type WorkloadFormField } from '../../features/workloads/WorkloadRequestForm'
import { getCorporateToday } from '../../shared/lib/date'
import { useTour } from '../../app/providers/tourContext'

type WorkloadForm = { hours: string; minutes: string; effectiveFrom: string; justification: string }
type ProfileForm = { name: string; email: string; jobTitle: string; activeSquadId: string }

const initialForm = (): WorkloadForm => ({ hours: '8', minutes: '0', effectiveFrom: getCorporateToday(), justification: '' })
const emptyProfileForm: ProfileForm = { name: '', email: '', jobTitle: '', activeSquadId: '' }

function toDailyMinutes(form: WorkloadForm) {
  const hours = Number(form.hours)
  const minutes = Number(form.minutes)
  if (!Number.isInteger(hours) || hours < 0 || hours > 24 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    throw new Error('Informe horas entre 0 e 24 e minutos entre 0 e 59.')
  }
  const total = hours * 60 + minutes
  if (total <= 0 || total > 24 * 60) throw new Error('A carga diária deve ser maior que zero e de no máximo 24 horas.')
  return total
}

export function PerfilPage() {
  const { instance, accounts } = useMsal()
  const navigate = useNavigate()
  const { startTour } = useTour()
  const profileState = useProfile()
  const [form, setForm] = useState<WorkloadForm>(initialForm)
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm)
  const [isEditing, setEditing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null)
  const [signatureError, setSignatureError] = useState<string | null>(null)
  const signatureRef = useRef<SignatureCanvas | null>(null)
  const account = instance.getActiveAccount() ?? accounts[0]

  const updateField = (field: WorkloadFormField, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const updateProfileField = (field: keyof ProfileForm, value: string) => setProfileForm((current) => ({ ...current, [field]: value }))

  useEffect(() => {
    if (!profileState.data || isEditing) return
    setProfileForm({
      name: account?.name || profileState.data.profile.name,
      email: account?.username || profileState.data.profile.email,
      jobTitle: profileState.data.profile.jobTitle,
      activeSquadId: profileState.data.profile.activeSquadId,
    })
  }, [account?.name, account?.username, profileState.data, isEditing])

  useEffect(() => {
    const canvas = signatureRef.current?.getCanvas()
    if (!canvas) return

    const syncSignatureCoordinates = () => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      canvas.getContext('2d')?.setTransform(canvas.width / bounds.width, 0, 0, canvas.height / bounds.height, 0, 0)
    }

    syncSignatureCoordinates()
    window.addEventListener('resize', syncSignatureCoordinates)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncSignatureCoordinates)
    resizeObserver?.observe(canvas)

    return () => {
      window.removeEventListener('resize', syncSignatureCoordinates)
      resizeObserver?.disconnect()
    }
  }, [profileState.data])

  function cancelProfileEdit() {
    if (profileState.data) {
      setProfileForm({
        name: profileState.data.profile.name,
        email: profileState.data.profile.email,
        jobTitle: profileState.data.profile.jobTitle,
        activeSquadId: profileState.data.profile.activeSquadId,
      })
    }
    setOperationError(null)
    setEditing(false)
  }

  async function saveProfile() {
    setFeedback(null)
    setOperationError(null)
    try {
      await profileState.updateProfile(profileForm)
      setFeedback('Perfil atualizado. As alterações já aparecem no menu lateral.')
      setEditing(false)
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.')
    }
  }

  function clearSignature() {
    signatureRef.current?.clear()
    setSignatureStatus(null)
    setSignatureError(null)
  }

  async function saveSignature() {
    setSignatureStatus(null)
    setSignatureError(null)
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setSignatureError('Desenhe sua assinatura antes de salvar.')
      return
    }
    try {
      await profileState.updateSignature(signatureRef.current.toDataURL('image/png'))
      setSignatureStatus('Assinatura salva com sucesso. Ela será utilizada nos próximos RDOs.')
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : 'Não foi possível salvar a assinatura.')
    }
  }

  async function submitWorkload() {
    setFeedback(null)
    setOperationError(null)
    try {
      const dailyMinutes = toDailyMinutes(form)
      if (profileState.data?.workloadVersions.length) {
        await profileState.requestWorkloadChange({ requestedDailyMinutes: dailyMinutes, requestedEffectiveFrom: form.effectiveFrom, justification: form.justification })
        setFeedback('Solicitação de alteração enviada ao supervisor da squad atual.')
      } else {
        await profileState.createInitialWorkload(dailyMinutes, form.effectiveFrom)
        setFeedback('Carga horária inicial cadastrada.')
      }
      setForm(initialForm())
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Não foi possível salvar a carga horária.')
    }
  }

  return (
    <PageContainer title="Meu perfil" description="Informações profissionais, alocação e carga horária da sessão corporativa.">
      {profileState.isLoading && <p aria-live="polite" className="text-sm ui-text-muted">Carregando perfil profissional...</p>}
      {profileState.error && <div role="alert" className="ui-alert-danger rounded-xl p-4 text-sm font-semibold"><p>{profileState.error}</p><button type="button" onClick={() => void profileState.reload()} className="mt-2 underline">Tentar novamente</button></div>}
      {operationError && <p role="alert" className="ui-alert-danger rounded-xl p-4 text-sm font-semibold">{operationError}</p>}
      {feedback && <p aria-live="polite" className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{feedback}</p>}
      {profileState.data && !profileState.isLoading && (
        <div className="space-y-6">
          <section className="space-y-4" aria-labelledby="profile-edit-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="profile-edit-title" className="text-lg font-extrabold ui-heading">Dados profissionais</h2>
              {!isEditing && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><button type="button" onClick={() => { startTour(); navigate('/colaborador') }} className="ui-button-secondary">Ver Tutorial do Sistema</button><button type="button" onClick={() => setEditing(true)} className="ui-button-secondary">Editar Perfil</button></div>}
            </div>
            {isEditing ? (
              <div className="rounded-2xl border ui-border ui-surface p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold ui-text">Nome<input type="text" value={profileForm.name} onChange={(event) => updateProfileField('name', event.target.value)} className="mt-2 w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2" /></label>
                  <label className="text-sm font-bold ui-text">E-mail<input type="text" value={profileForm.email} onChange={(event) => updateProfileField('email', event.target.value)} className="mt-2 w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2" /></label>
                  <label className="text-sm font-bold ui-text">Cargo<input type="text" value={profileForm.jobTitle} onChange={(event) => updateProfileField('jobTitle', event.target.value)} className="mt-2 w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2" /></label>
                  <label className="text-sm font-bold ui-text">Squad<select value={profileForm.activeSquadId} onChange={(event) => updateProfileField('activeSquadId', event.target.value)} className="mt-2 w-full ui-field rounded-xl px-3 py-2.5 ui-text outline-none focus:ring-2">
                    {profileState.data.squads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
                  </select></label>
                </div>
                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={cancelProfileEdit} className="ui-button-secondary" disabled={profileState.isSaving}>Cancelar</button>
                  <button type="button" onClick={() => void saveProfile()} className="ui-button-primary" disabled={profileState.isSaving}>Salvar</button>
                </div>
              </div>
            ) : (
              <ProfileSummary profile={profileState.data.profile} assignment={profileState.data.assignment} currentWorkload={profileState.data.currentWorkload} />
            )}
          </section>
          <section className="space-y-4" aria-labelledby="signature-title">
            <div>
              <h2 id="signature-title" className="text-lg font-extrabold ui-heading">Padrão de Assinatura</h2>
              <p className="mt-1 text-sm ui-text-muted">Desenhe a assinatura que será usada nos seus Relatórios Diários de Obra (RDO).</p>
            </div>
            {profileState.data.profile.assinaturaBase64 && (
              <div className="rounded-xl ui-surface-subtle p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider ui-text-subtle">Assinatura salva</p>
                <img src={profileState.data.profile.assinaturaBase64} alt="Assinatura atual" className="h-20 max-w-full object-contain object-left" />
              </div>
            )}
            <div className="max-w-3xl overflow-hidden rounded-xl border ui-border bg-white">
              <SignatureCanvas
                ref={signatureRef}
                clearOnResize={false}
                penColor="#111827"
                canvasProps={{
                  'aria-label': 'Área para desenhar a assinatura',
                  width: 768,
                  height: 192,
                  className: 'block aspect-[4/1] h-auto w-full touch-none bg-white',
                }}
              />
            </div>
            {signatureError && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{signatureError}</p>}
            {signatureStatus && <p aria-live="polite" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{signatureStatus}</p>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={clearSignature} className="ui-button-secondary" disabled={profileState.isSaving}>Limpar</button>
              <button type="button" onClick={() => void saveSignature()} className="ui-button-primary" disabled={profileState.isSaving}>Salvar Assinatura</button>
            </div>
          </section>
          <WorkloadRequestForm
            {...form}
            minDate={getCorporateToday()}
            isSubmitting={profileState.isSaving}
            isInitial={profileState.data.workloadVersions.length === 0}
            onFieldChange={updateField}
            onSubmit={() => void submitWorkload()}
          />
          <WorkloadHistory versions={profileState.data.workloadVersions} requests={profileState.data.workloadRequests} />
        </div>
      )}
    </PageContainer>
  )
}
