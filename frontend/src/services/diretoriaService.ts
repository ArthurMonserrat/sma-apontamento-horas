import type { SupervisorPendingEntry } from '../features/supervisor/types'
import { supervisorService } from '../features/supervisor/infrastructure/supervisorService'

export interface DiretoriaService {
  listEscalatedEntries(): Promise<SupervisorPendingEntry[]>
  approveEscalated(entryId: string, directorId: string): Promise<SupervisorPendingEntry>
}

class LocalStorageDiretoriaService implements DiretoriaService {
  listEscalatedEntries() {
    return supervisorService.listEscalatedEntries()
  }

  approveEscalated(entryId: string, directorId: string) {
    return supervisorService.approveEscalated(entryId, directorId)
  }
}

export const diretoriaService: DiretoriaService = new LocalStorageDiretoriaService()
