import type { NavigationItem } from '../../types/navigation'

export const collaboratorNavigation: NavigationItem[] = [
  { label: 'Visão geral', icon: 'dashboard', path: '/colaborador' },
  { label: 'Novo apontamento', icon: 'file-plus', path: '/colaborador/apontamentos/novo' },
  { label: 'Histórico', icon: 'history', path: '/colaborador/historico' },
  { label: 'Ausências', icon: 'calendar-off', path: '/colaborador/folgas' },
  { label: 'Avisos', icon: 'bell', path: '/colaborador/avisos' },
  { label: 'Meu perfil', icon: 'user', path: '/colaborador/perfil' },
]
