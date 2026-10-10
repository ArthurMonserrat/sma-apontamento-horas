import { PageContainer } from '../../shared/ui/PageContainer'
import { TimeEntryForm } from '../../features/time-entries/TimeEntryForm'
import { useParams } from 'react-router-dom'

export function NovoApontamentoPage() {
  const { entryId } = useParams()
  return (
    <PageContainer title={entryId ? 'Editar apontamento' : 'Novo apontamento'}>
      <TimeEntryForm entryId={entryId} />
    </PageContainer>
  )
}
