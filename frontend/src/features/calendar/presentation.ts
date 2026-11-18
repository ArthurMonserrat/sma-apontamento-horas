import type { CalendarVisualState } from './types'

export const calendarStatePresentation: Record<CalendarVisualState, { label: string; marker: string; tone: string }> = {
  NO_SCHEDULE: { label: 'Sem jornada prevista', marker: '○', tone: 'no-schedule' },
  NO_ENTRY: { label: 'Sem apontamento', marker: '!', tone: 'no-entry' },
  INCOMPLETE: { label: 'Jornada incompleta', marker: '◷', tone: 'incomplete' },
  COMPLETE: { label: 'Jornada atingida', marker: '✓', tone: 'complete' },
  EXCEEDED: { label: 'Jornada excedida', marker: '+', tone: 'exceeded' },
  VACATION: { label: 'Férias', marker: '▣', tone: 'vacation' },
  MEDICAL_LEAVE: { label: 'Afastamento', marker: '✚', tone: 'medical-leave' },
  HOLIDAY: { label: 'Feriado', marker: '◆', tone: 'holiday' },
}
