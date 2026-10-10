import { PageContainer } from '../shared/ui/PageContainer'
import { TimeEntryHistory } from '../features/history/TimeEntryHistory'

export function HistoricoPage() {
  return <PageContainer title="Histórico" description="Consulte somente seus apontamentos, com período, filtros e paginação." contained={false}><TimeEntryHistory /></PageContainer>
}
