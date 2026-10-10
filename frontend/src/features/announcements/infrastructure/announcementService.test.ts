import { describe, expect, it } from 'vitest'
import { canDeleteAnnouncement, isAnnouncementHiddenForUser } from './announcementService'
import type { Comunicado } from '../types'

const announcement = { id: 'a-1', autorId: 'supervisor-1' } as Comunicado

describe('permissão de exclusão de avisos', () => {
  it('permite que a Diretoria exclua qualquer aviso', () => {
    expect(canDeleteAnnouncement(announcement, 'DIRECTOR_ADMIN', 'director-1')).toBe(true)
  })

  it('permite que o Supervisor exclua apenas avisos de sua autoria', () => {
    expect(canDeleteAnnouncement(announcement, 'SUPERVISOR', 'supervisor-1')).toBe(true)
    expect(canDeleteAnnouncement(announcement, 'SUPERVISOR', 'supervisor-2')).toBe(false)
  })

  it('não permite exclusão para Colaborador', () => {
    expect(canDeleteAnnouncement(announcement, 'COLLABORATOR', 'supervisor-1')).toBe(false)
  })
})

describe('ocultação individual de avisos', () => {
  it('considera oculto somente para o usuário registrado em oculto_por', () => {
    expect(isAnnouncementHiddenForUser({ oculto_por: ['user-1'] } as Comunicado, 'user-1')).toBe(true)
    expect(isAnnouncementHiddenForUser({ oculto_por: ['user-1'] } as Comunicado, 'user-2')).toBe(false)
    expect(isAnnouncementHiddenForUser({} as Comunicado, 'user-1')).toBe(false)
  })
})
