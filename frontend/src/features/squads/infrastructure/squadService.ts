import { demoSquads, demoSupervisors } from '../../../demo/fixtures/demoData'

export const squadService = {
  async listActive() {
    return demoSquads.filter((squad) => squad.active)
  },
  async getSupervisor(squadId: string) {
    const squad = demoSquads.find((item) => item.id === squadId && item.active)
    return squad ? demoSupervisors.find((supervisor) => supervisor.id === squad.supervisorId && supervisor.active) ?? null : null
  },
}
