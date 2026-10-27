import type { Comunicado } from './types'

/** Avisos de exemplo do modo demonstração. */
export const demoAnnouncements: Comunicado[] = [
  {
    id: 'aviso-fechamento-julho-2026',
    titulo: 'Fechamento do mês antecipado',
    mensagem: 'Em razão do feriado nacional, o fechamento dos apontamentos de julho acontecerá antecipadamente no dia 03/08, às 12h. Revise seus lançamentos e envie eventuais ajustes antes desse horário.',
    dataPublicacao: '2026-07-29',
    timestamp: '2026-07-29T12:00:00.000Z',
    autor: 'RH',
    tipo: 'alerta',
    urgencia: 'alerta',
    tipo_destinatario: 'all',
    alvo_referencia: null,
    oculto_por: [],
  },
  {
    id: 'aviso-politica-apontamentos',
    titulo: 'Revisão dos apontamentos da semana',
    mensagem: 'Reserve alguns minutos ao final de cada dia para conferir horas, projeto e detalhamento. Essa rotina ajuda a manter o fechamento da operação mais ágil.',
    dataPublicacao: '2026-07-24',
    timestamp: '2026-07-24T12:00:00.000Z',
    autor: 'Diretoria',
    tipo: 'info',
    urgencia: 'info',
    tipo_destinatario: 'all',
    alvo_referencia: null,
    oculto_por: [],
  },
  {
    id: 'aviso-prazo-urgente',
    titulo: 'Ação necessária: regularize pendências',
    mensagem: 'Existem apontamentos pendentes de revisão no seu histórico. Confira os registros e encaminhe as correções solicitadas antes do prazo de fechamento.',
    dataPublicacao: '2026-07-22',
    timestamp: '2026-07-22T12:00:00.000Z',
    autor: 'Supervisão',
    tipo: 'urgente',
    urgencia: 'urgente',
    tipo_destinatario: 'all',
    alvo_referencia: null,
    oculto_por: [],
  },
]
