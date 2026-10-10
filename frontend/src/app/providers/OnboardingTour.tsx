import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Joyride, STATUS, type EventData, type Step } from 'react-joyride'
import { useLocation } from 'react-router-dom'
import { useSession } from '../../features/session/useSession'
import { TourContext } from './tourContext'

const collaboratorSteps: Step[] = [
  { target: '.tour-menu', title: 'Navegação principal', content: 'Use este menu para acessar o calendário, seus apontamentos, ausências, avisos e perfil.', placement: 'right' },
  { target: '.tour-avisos', title: 'Quadro de Avisos', content: 'Consulte comunicados da Diretoria, do RH e da supervisão sobre a operação e o fechamento do mês.', placement: 'right' },
  { target: '.tour-calendario', title: 'Seu calendário', content: 'Visualize o mês e interaja com cada dia para consultar lançamentos ou iniciar um novo apontamento.', placement: 'bottom' },
  { target: '.tour-btn-apontar', title: 'Novo apontamento', content: 'Acesse o formulário para registrar suas horas, projeto, atividade e detalhamento.', placement: 'bottom' },
]

const supervisorSteps: Step[] = [
  { target: '.tour-aprovacoes', title: 'Fila de aprovações', content: 'Nesta área você acompanha os apontamentos enviados pela equipe e decide quais serão aprovados ou rejeitados.', placement: 'right', targetWaitTimeout: 3000 },
  { target: '.tour-checkbox-lote', title: 'Seleção em lote', content: 'Use os filtros e a seleção da tabela para aprovar ou rejeitar vários apontamentos de uma só vez.', placement: 'bottom', targetWaitTimeout: 3000 },
  { target: '.tour-prazo', title: 'Prazo de fechamento', content: 'Este alerta informa a proximidade do fechamento. Pendências não tratadas no prazo podem ser transferidas para a Diretoria.', placement: 'bottom', targetWaitTimeout: 3000 },
]

const directorSteps: Step[] = [
  { target: '.tour-painel-diretor', title: 'Painel Diretor', content: 'Acompanhe os indicadores macro da operação e a alocação de horas por projeto.', placement: 'right', targetWaitTimeout: 3000 },
  { target: '.tour-relatorios', title: 'Relatórios hierárquicos', content: 'Explore supervisores, equipes, colaboradores e apontamentos diários em uma visão detalhada.', placement: 'bottom', targetWaitTimeout: 3000 },
  { target: '.tour-btn-exportar', title: 'Exportação gerencial', content: 'Exporte os dados filtrados da Diretoria para um relatório Excel corporativo.', placement: 'bottom', targetWaitTimeout: 3000 },
]

function getTourConfig(role: string | undefined, pathname: string) {
  if (role === 'COLLABORATOR' && pathname === '/colaborador') return { steps: collaboratorSteps, routeReady: true }
  if (role === 'SUPERVISOR' && pathname === '/supervisor') return { steps: supervisorSteps, routeReady: true }
  if (role === 'DIRECTOR_ADMIN' && pathname === '/administracao/relatorios') return { steps: directorSteps, routeReady: true }
  return { steps: [], routeReady: false }
}

export function OnboardingTour({ children }: { children?: ReactNode }) {
  const location = useLocation()
  const { session } = useSession()
  const [run, setRun] = useState(false)
  const [activeSteps, setActiveSteps] = useState<Step[]>([])
  const [manualRun, setManualRun] = useState(false)
  const config = useMemo(() => getTourConfig(session?.role, location.pathname), [location.pathname, session?.role])
  const startTour = useCallback(() => setManualRun(true), [])

  useEffect(() => {
    setRun(false)
    setActiveSteps([])
    if (!session || !config.routeReady || !manualRun) return
    let cancelled = false
    const startedAt = Date.now()
    const targetSelectors = config.steps.filter((step) => typeof step.target === 'string')

    const findMountedSteps = () => targetSelectors.filter((step) => {
      try {
        return Boolean(document.querySelector(step.target as string))
      } catch {
        return false
      }
    })

    const waitForTargets = () => {
      if (cancelled) return
      const mountedSteps = findMountedSteps()
      const allTargetsMounted = mountedSteps.length === targetSelectors.length
      const waitExpired = Date.now() - startedAt >= 6000

      if (allTargetsMounted || waitExpired) {
        if (mountedSteps.length > 0) {
          setActiveSteps(mountedSteps)
          setRun(true)
        }
        return
      }

      window.setTimeout(waitForTargets, 100)
    }

    waitForTargets()
    return () => {
      cancelled = true
    }
  }, [config, location.pathname, manualRun, session])

  function handleCallback({ status }: EventData) {
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false)
      setManualRun(false)
    }
  }

  const tour = config.routeReady && activeSteps.length > 0
    ? <Joyride steps={activeSteps} run={run} continuous scrollToFirstStep onEvent={handleCallback} locale={{ back: 'Voltar', close: 'Fechar', last: 'Concluir', next: 'Próximo', skip: 'Pular' }} options={{ showProgress: true, buttons: ['back', 'primary', 'skip'], overlayClickAction: false, spotlightPadding: 8, spotlightRadius: 16, targetWaitTimeout: 3000, scrollDuration: 300, scrollOffset: 24, arrowColor: '#132532', backgroundColor: '#132532', overlayColor: 'rgba(3, 10, 16, 0.78)', primaryColor: '#77C2A4', textColor: '#F8FAFC', zIndex: 10000 }} styles={{ tooltip: { border: '1px solid #1F3B4D', borderRadius: 16, boxShadow: '0 16px 40px rgba(0, 0, 0, 0.28)' }, buttonPrimary: { borderRadius: 10, color: '#0A161E', fontWeight: 800 }, buttonBack: { color: '#94A3B8', fontWeight: 700 }, buttonSkip: { color: '#94A3B8', fontWeight: 700 } }} />
    : null

  return <TourContext.Provider value={{ startTour }}>{tour}{children}</TourContext.Provider>
}
