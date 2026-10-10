import { CORPORATE_TIME_ZONE } from '../../config/business'
import { StatusBadge } from '../../shared/ui/StatusBadge'
import { revisionStatusPresentation } from '../status/presentation'

type RevisionProps = {
  version: number
  updatedAt?: string
}

function getRevisionDetails({ version, updatedAt }: RevisionProps) {
  if (version <= 1) return null
  if (!updatedAt) return `Versão ${version}`
  const timestamp = new Date(updatedAt)
  if (Number.isNaN(timestamp.getTime())) return `Versão ${version}`
  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: CORPORATE_TIME_ZONE,
  }).format(timestamp)
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CORPORATE_TIME_ZONE,
  }).format(timestamp)
  return `Editado em ${date} às ${time} · Versão ${version}`
}

export function EntryRevisionBadge({ version }: Pick<RevisionProps, 'version'>) {
  if (version <= 1) return null
  return <StatusBadge tone={revisionStatusPresentation.tone}>{revisionStatusPresentation.label}</StatusBadge>
}

export function EntryRevisionDetails(props: RevisionProps) {
  const details = getRevisionDetails(props)
  if (!details) return null
  return <p className="mt-3 text-xs ui-text-subtle">{details}</p>
}
