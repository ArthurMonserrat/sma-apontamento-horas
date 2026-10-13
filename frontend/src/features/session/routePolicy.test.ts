import { describe, expect, it } from 'vitest'
import type { DemoRole, DemoSession } from './types'
import {
  canAccessDemoPath,
  getDemoHomePath,
  resolveProtectedDemoRoute,
  resolvePublicOnlyDemoRoute,
} from './routePolicy'

const collaboratorSession: DemoSession = {
  id: 'demo-collaborator-001',
  name: 'Colaborador',
  role: 'COLLABORATOR',
  createdAt: '2026-07-21T15:30:00.000Z',
  explicitLoginAt: '2026-07-21T15:30:00.000Z',
  isDemo: true,
  version: 2,
}

describe('política de rotas da produção', () => {
  it.each<[DemoRole, string]>([
    ['COLLABORATOR', '/colaborador'],
    ['SUPERVISOR', '/supervisor'],
    ['DIRECTOR_ADMIN', '/administracao'],
  ])('define a rota inicial de %s', (role, expectedPath) => {
    expect(getDemoHomePath(role)).toBe(expectedPath)
  })

  it.each<[DemoRole, string]>([
    ['COLLABORATOR', '/selecao-perfil?modulo=banco1'],
    ['SUPERVISOR', '/selecao-perfil?modulo=banco2'],
    ['DIRECTOR_ADMIN', '/portal'],
    ['COLLABORATOR', '/colaborador'],
    ['COLLABORATOR', '/colaborador/apontamentos/novo?origem=hoje#formulario'],
    ['SUPERVISOR', '/supervisor?periodo=atual'],
    ['DIRECTOR_ADMIN', '/administracao/indicadores#resumo'],
  ])('autoriza %s somente dentro de sua própria área', (role, path) => {
    expect(canAccessDemoPath(role, path)).toBe(true)
  })

  it.each<[DemoRole, string]>([
    ['COLLABORATOR', '/supervisor'],
    ['SUPERVISOR', '/administracao'],
    ['DIRECTOR_ADMIN', '/colaborador'],
    ['COLLABORATOR', '/colaborador-malicioso'],
    ['COLLABORATOR', '/colaborador/../supervisor'],
    ['COLLABORATOR', '/colaborador/%2e%2e/supervisor'],
    ['COLLABORATOR', '/colaborador/..'],
    ['COLLABORATOR', '/colaborador/..\\supervisor'],
    ['COLLABORATOR', 'https://sma.invalid/colaborador'],
    ['COLLABORATOR', '//sma.invalid/colaborador'],
    ['SUPERVISOR', '/login'],
  ])('rejeita para %s o caminho %s', (role, path) => {
    expect(canAccessDemoPath(role, path)).toBe(false)
  })

  it('preserva pathname, search e hash no from de uma rota protegida', () => {
    expect(resolveProtectedDemoRoute(null, ['COLLABORATOR'], {
      pathname: '/colaborador/apontamentos/novo',
      search: '?origem=hoje',
      hash: '#formulario',
    })).toEqual({
      to: '/login',
      state: { from: '/colaborador/apontamentos/novo?origem=hoje#formulario' },
    })
  })

  it('redireciona perfil incorreto para a própria home', () => {
    expect(resolveProtectedDemoRoute(collaboratorSession, ['SUPERVISOR'], {
      pathname: '/supervisor',
      search: '',
      hash: '',
    })).toEqual({ to: '/colaborador' })
  })

  it('permite a rota quando papel e caminho pertencem à sessão', () => {
    expect(resolveProtectedDemoRoute(collaboratorSession, ['COLLABORATOR'], {
      pathname: '/colaborador/historico',
      search: '?periodo=atual',
      hash: '#resumo',
    })).toBeNull()
  })

  it('reutiliza from completo somente quando pertence ao perfil autenticado', () => {
    const authorizedFrom = '/colaborador/historico?periodo=atual#resumo'

    expect(resolvePublicOnlyDemoRoute(collaboratorSession, authorizedFrom)).toEqual({ to: authorizedFrom })
    expect(resolvePublicOnlyDemoRoute(collaboratorSession, '/supervisor?periodo=atual#equipe')).toEqual({
      to: '/colaborador',
    })
    expect(resolvePublicOnlyDemoRoute(collaboratorSession, '/colaborador/../supervisor')).toEqual({
      to: '/colaborador',
    })
  })

  it('envia sessão válida em /login para a home do perfil quando não há from', () => {
    expect(resolvePublicOnlyDemoRoute({ ...collaboratorSession, role: 'SUPERVISOR' }, undefined)).toEqual({
      to: '/supervisor',
    })
  })

  it('não redireciona rota pública sem sessão', () => {
    expect(resolvePublicOnlyDemoRoute(null, '/colaborador')).toBeNull()
  })
})
