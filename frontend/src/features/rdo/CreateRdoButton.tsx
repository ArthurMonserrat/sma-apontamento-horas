import { useState } from 'react'
import { useSession } from '../session/useSession'
import { demoActivities } from '../../demo/fixtures/demoData'
import type { TimeEntryFormValues } from '../time-entries/useTimeEntryForm'
import logoUrl from '../../assets/brand/sma-logo.jpg'

export function CreateRdoButton({ values }: { values: TimeEntryFormValues }) {
  const { profile } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const create = async (format: 'pdf' | 'word') => {
    if (!profile || busy) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const { buildRdoData, generateRdo, generateRdoWord, rdoFileName, rdoWordFileName, downloadRdo } = await import('./rdo')
      const data = buildRdoData(values, { name: profile.name, jobTitle: profile.jobTitle,
        activityName: demoActivities.find((activity) => activity.id === values.activityId)?.name,
        assinaturaBase64: profile.assinaturaBase64 })
      if (format === 'word') {
        const { Packer } = await import('docx')
        const blob = await Packer.toBlob(generateRdoWord(data))
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url; link.download = rdoWordFileName(data)
        document.body.appendChild(link); link.click(); link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 30_000)
        setFeedback('Word gerado. O apontamento não foi salvo por esta ação.')
      } else {
        const response = await fetch(logoUrl)
        if (!response.ok) throw new Error('Não foi possível carregar a logo do RDO.')
        const pdf = generateRdo(data, new Uint8Array(await response.arrayBuffer()))
        downloadRdo(pdf, rdoFileName(data))
        setFeedback('PDF gerado. O apontamento não foi salvo por esta ação.')
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível gerar o RDO. Tente novamente.') }
    finally { setBusy(false) }
  }
  return <section className="border-t ui-border pt-5">
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !profile} onClick={() => void create('pdf')} className="rounded-xl border ui-border px-5 py-3 text-sm font-bold ui-text disabled:opacity-60">{busy ? 'Gerando RDO…' : 'Gerar RDO (PDF)'}</button>
      <button type="button" disabled={busy || !profile} onClick={() => void create('word')} className="rounded-xl border ui-border px-5 py-3 text-sm font-bold ui-text disabled:opacity-60">{busy ? 'Gerando RDO…' : 'Gerar RDO (Word)'}</button>
    </div>
    <p className="mt-2 text-xs ui-text-subtle">Opcional. Gera um PDF ou Word com os dados atuais, sem salvar o apontamento.</p>
    {error && <p role="alert" className="mt-2 text-sm ui-text-danger">{error}</p>}
    {feedback && <p role="status" className="mt-2 text-sm ui-text-muted">{feedback}</p>}
  </section>
}
