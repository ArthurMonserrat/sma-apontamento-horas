/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import appLayoutSource from '../components/AppLayout.tsx?raw'
import confirmDialogSource from '../components/ConfirmDialog.tsx?raw'
import statusBadgeSource from '../components/StatusBadge.tsx?raw'
import headerSource from '../components/Header.tsx?raw'
import pageContainerSource from '../components/PageContainer.tsx?raw'
import sidebarSource from '../components/Sidebar.tsx?raw'
import themeToggleSource from '../components/ThemeToggle.tsx?raw'
import dayDetailsSource from '../features/calendar/DayDetails.tsx?raw'
import monthlyCalendarSource from '../features/calendar/MonthlyCalendar.tsx?raw'
import summaryCardSource from '../features/collaborator/SummaryCard.tsx?raw'
import timeEntryHistorySource from '../features/history/TimeEntryHistory.tsx?raw'
import entryRevisionBadgeSource from '../features/time-entries/EntryRevisionBadge.tsx?raw'
import timeOffRequestListSource from '../features/time-off/TimeOffRequestList.tsx?raw'
import workloadHistorySource from '../features/workloads/WorkloadHistory.tsx?raw'

const hex = (value: string) => `#${value}`
const stylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const appUiSources = Object.values(import.meta.glob('../{pages,features,components}/**/*.tsx', {
  eager: true,
  import: 'default',
  query: '?raw',
})) as string[]

const requiredSemanticTokens = [
  '--color-background',
  '--color-surface',
  '--color-surface-raised',
  '--color-surface-subtle',
  '--color-header',
  '--color-sidebar',
  '--color-text',
  '--color-text-muted',
  '--color-text-subtle',
  '--color-border',
  '--color-border-strong',
  '--color-focus-ring',
  '--color-shadow',
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-active',
  '--color-primary-contrast',
  '--color-secondary',
  '--color-secondary-hover',
  '--color-eyebrow',
  '--color-input-background',
  '--color-input-border',
  '--color-input-placeholder',
  '--color-navigation-active',
  '--color-navigation-active-detail',
  '--color-navigation-hover',
  '--color-overlay',
] as const

const calendarStates = {
  'no-schedule': {
    light: [hex('F1F5F9'), hex('334155'), hex('64748B')],
    dark: [hex('263545'), hex('E8EEF5'), hex('91A4B8')],
  },
  'no-entry': {
    light: [hex('FFF7E6'), hex('6B4F13'), hex('A16207')],
    dark: [hex('44371E'), hex('FFE9B0'), hex('D5A23A')],
  },
  incomplete: {
    light: [hex('FFF1E8'), hex('8A3F17'), hex('C2410C')],
    dark: [hex('4A2A1B'), hex('FFD9C4'), hex('D27A44')],
  },
  complete: {
    light: [hex('EEF7EF'), hex('275B39'), hex('4D7C0F')],
    dark: [hex('253C2A'), hex('DDEFD8'), hex('80A76B')],
  },
  exceeded: {
    light: [hex('FDF0F4'), hex('7A2E45'), hex('A23E5A')],
    dark: [hex('452532'), hex('FFD9E4'), hex('D0809A')],
  },
  vacation: {
    light: [hex('F5F0FB'), hex('5B3C88'), hex('7E5BA6')],
    dark: [hex('352944'), hex('E9DDFF'), hex('A98AD0')],
  },
  'time-off': {
    light: [hex('EDF8FC'), hex('225E7A'), hex('2C7DA0')],
    dark: [hex('203A48'), hex('D9F2FF'), hex('6FB7D1')],
  },
  'medical-leave': {
    light: [hex('FAF0F8'), hex('633A61'), hex('8A5A83')],
    dark: [hex('42283F'), hex('F5DDF0'), hex('C28AB8')],
  },
  holiday: {
    light: [hex('FFF0F0'), hex('7C2D32'), hex('B23A48')],
    dark: [hex('49282A'), hex('FFE0E0'), hex('D68787')],
  },
} as const

const statusTones = {
  neutral: {
    light: [hex('F1F5F7'), hex('3F4F5B'), hex('758798')],
    dark: [hex('263545'), hex('E8EEF5'), hex('91A4B8')],
  },
  info: {
    light: [hex('EDF8FC'), hex('225E7A'), hex('2C7DA0')],
    dark: [hex('203A48'), hex('D9F2FF'), hex('6FB7D1')],
  },
  pending: {
    light: [hex('FFF7E6'), hex('6B4F13'), hex('A16207')],
    dark: [hex('44371E'), hex('FFE9B0'), hex('D5A23A')],
  },
  warning: {
    light: [hex('FFF1E8'), hex('8A3F17'), hex('C2410C')],
    dark: [hex('4A2A1B'), hex('FFD9C4'), hex('D27A44')],
  },
  success: {
    light: [hex('EEF7EF'), hex('275B39'), hex('4D7C0F')],
    dark: [hex('253C2A'), hex('DDEFD8'), hex('80A76B')],
  },
  danger: {
    light: [hex('FFF0F0'), hex('7C2D32'), hex('B23A48')],
    dark: [hex('49282A'), hex('FFE0E0'), hex('D68787')],
  },
  cancelled: {
    light: [hex('F3F1F4'), hex('55485E'), hex('7C6F85')],
    dark: [hex('302B36'), hex('EEE8F2'), hex('9F91AA')],
  },
} as const

function declarationsFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`))?.[1]
  expect(block, `bloco ${selector}`).toBeDefined()

  return Object.fromEntries(
    [...(block ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, token, value]) => [token, value.trim()]),
  )
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex.match(/[A-F\d]{2}/gi)!.map((value) => Number.parseInt(value, 16) / 255)
      .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('tokens institucionais e contraste', () => {
  it('declara somente a escala institucional consumida', () => {
    const theme = declarationsFor('@theme')

    expect(theme).toMatchObject({
      '--color-brand-primary-950': hex('092E42'),
      '--color-brand-primary-800': hex('0F455F'),
      '--color-brand-primary-600': hex('1D617B'),
      '--color-brand-primary-100': hex('E6F2F4'),
      '--color-brand-primary-50': hex('F7FBFC'),
      '--color-brand-secondary-700': hex('3A6F5B'),
      '--color-brand-secondary-500': hex('75AC96'),
      '--color-brand-secondary-100': hex('E9F2EC'),
    })
  })

  it('oferece a camada semantica completa nos temas claro e escuro', () => {
    const light = declarationsFor(':root')
    const dark = declarationsFor('.dark')

    for (const token of requiredSemanticTokens) {
      expect(light[token], `${token} no tema claro`).toBeDefined()
      expect(dark[token], `${token} no tema escuro`).toBeDefined()
    }

    expect(light).toMatchObject({
      '--color-background': hex('F7F7F7'),
      '--color-surface': hex('FFFFFF'),
      '--color-surface-raised': hex('FFFFFF'),
      '--color-surface-subtle': hex('F1F5F7'),
      '--color-text': hex('17212B'),
      '--color-text-muted': hex('4B5B67'),
      '--color-border': hex('758798'),
      '--color-primary': hex('0F455F'),
      '--color-eyebrow': hex('3A6F5B'),
      '--color-primary-contrast': hex('FFFFFF'),
    })
    expect(dark).toMatchObject({
      '--color-background': hex('0A161E'),
      '--color-surface': hex('132532'),
      '--color-surface-raised': hex('132532'),
      '--color-surface-subtle': hex('193142'),
      '--color-text': hex('F8FAFC'),
      '--color-text-muted': hex('94A3B8'),
      '--color-border': hex('1F3B4D'),
      '--color-primary': hex('77C2A4'),
      '--color-secondary': hex('135063'),
      '--color-eyebrow': hex('9BD7BE'),
      '--color-primary-contrast': hex('0A161E'),
    })
  })

  it('mantem texto normal acima de 4,5:1, foco acima de 3:1 e bordas coerentes com cada tema', () => {
    for (const selector of [':root', '.dark']) {
      const tokens = declarationsFor(selector)

      expect(contrastRatio(tokens['--color-text'], tokens['--color-background'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens['--color-text-muted'], tokens['--color-background'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens['--color-primary-contrast'], tokens['--color-primary'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens['--color-eyebrow'], tokens['--color-header'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(tokens['--color-border'], tokens['--color-surface'])).toBeGreaterThanOrEqual(selector === '.dark' ? 1.25 : 3)
      expect(contrastRatio(tokens['--color-focus-ring'], tokens['--color-surface'])).toBeGreaterThanOrEqual(3)
    }
  })

  it('declara as 54 cores fechadas dos estados e preserva contraste nos dois temas', () => {
    for (const [selector, theme] of [[':root', 'light'], ['.dark', 'dark']] as const) {
      const tokens = declarationsFor(selector)
      const canvas = tokens['--color-background']

      for (const [tone, values] of Object.entries(calendarStates)) {
        const [surface, text, border] = values[theme]
        expect(tokens[`--calendar-state-${tone}-surface`]).toBe(surface)
        expect(tokens[`--calendar-state-${tone}-text`]).toBe(text)
        expect(tokens[`--calendar-state-${tone}-border`]).toBe(border)
        expect(contrastRatio(text, surface), `${tone}: texto/fundo em ${theme}`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(border, canvas), `${tone}: borda/canvas em ${theme}`).toBeGreaterThanOrEqual(3)
      }
    }

    expect(declarationsFor(':root')['--calendar-selected-ring']).toBeDefined()
    expect(declarationsFor('.dark')['--calendar-selected-ring']).toBeDefined()
  })

  it('declara tons de status distintos e acessíveis nos dois temas', () => {
    for (const [selector, theme] of [[':root', 'light'], ['.dark', 'dark']] as const) {
      const tokens = declarationsFor(selector)
      const canvas = tokens['--color-background']
      const combinations: string[] = []

      for (const [tone, values] of Object.entries(statusTones)) {
        const [surface, text, border] = values[theme]
        combinations.push(values[theme].join('/'))
        expect(tokens[`--status-${tone}-surface`]).toBe(surface)
        expect(tokens[`--status-${tone}-text`]).toBe(text)
        expect(tokens[`--status-${tone}-border`]).toBe(border)
        expect(contrastRatio(text, surface), `${tone}: texto/fundo em ${theme}`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(border, canvas), `${tone}: borda/canvas em ${theme}`).toBeGreaterThanOrEqual(3)
      }

      expect(new Set(combinations).size).toBe(Object.keys(statusTones).length)
    }
  })

  it('faz todos os consumidores funcionais reutilizarem o badge semântico', () => {
    expect(statusBadgeSource).toContain('data-status-tone')
    for (const source of [dayDetailsSource, timeEntryHistorySource, entryRevisionBadgeSource, timeOffRequestListSource, workloadHistorySource]) {
      expect(source).toContain('<StatusBadge')
    }
  })

  it('faz a classe compartilhada consumir apenas tokens semanticos de calendario', () => {
    expect(stylesheet).toContain('.calendar-state {')
    expect(stylesheet).toContain('background: var(--calendar-state-surface)')
    expect(stylesheet).toContain('color: var(--calendar-state-text)')
    expect(stylesheet).toContain('border-color: var(--calendar-state-border)')

    for (const tone of Object.keys(calendarStates)) {
      expect(stylesheet).toContain(`.calendar-state--${tone} {`)
      expect(stylesheet).toContain(`var(--calendar-state-${tone}-surface)`)
      expect(stylesheet).toContain(`var(--calendar-state-${tone}-text)`)
      expect(stylesheet).toContain(`var(--calendar-state-${tone}-border)`)
    }
  })

  it('nao deixa o anel de selecao mascarar o foco visivel do teclado', () => {
    expect(stylesheet).toContain('.calendar-day--selected:not(:focus-visible) {')
    expect(stylesheet).not.toMatch(/\.calendar-day--selected\s*\{/)
  })

  it('mantem a sigla da navegacao ativa acima de 4,5:1', () => {
    const activeDetailToken = sidebarSource.includes('bg-[var(--color-navigation-active-detail)]')
      ? '--color-navigation-active-detail'
      : '--color-sidebar-surface'

    for (const selector of [':root', '.dark']) {
      const tokens = declarationsFor(selector)
      expect(contrastRatio(tokens['--color-navigation-active-text'], tokens[activeDetailToken])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('define os utilitarios visuais compartilhados', () => {
    for (const className of ['ui-card', 'ui-field', 'ui-button-primary', 'ui-button-secondary', 'ui-badge-primary', 'ui-badge-secondary', 'ui-alert-danger', 'ui-text-danger', 'brand-mark']) {
      expect(stylesheet).toContain(`.${className}`)
    }
  })

  it('define utilitários semânticos para rótulos institucionais e alertas', () => {
    expect(stylesheet).toContain('.ui-eyebrow')
    expect(stylesheet).toContain('color: var(--color-eyebrow)')
    expect(stylesheet).toContain('.ui-alert-danger')
    expect(stylesheet).toContain('background: var(--status-danger-surface)')
  })

  it('mantem a logo como etiqueta branca sem filtros ou blend no tema escuro', () => {
    expect(stylesheet).toContain('.brand-mark__image-frame')
    expect(stylesheet).toContain('background: #FFFFFF')
    expect(stylesheet).not.toContain('.dark .brand-mark img')
    expect(stylesheet).toContain('.brand-mark--transparent img')
    expect(stylesheet).not.toContain('filter: invert')
  })

  it('define interacao elevada para os cards de perfil', () => {
    expect(stylesheet).toContain('.profile-card:hover')
    expect(stylesheet).toContain('var(--color-primary) 20%')
    expect(stylesheet).toContain('var(--color-primary) 50%')
  })

  it('mantem estados do calendario discretos no tema escuro', () => {
    expect(stylesheet).toContain('.dark .calendar-state {')
    expect(stylesheet).toContain('background: var(--color-surface-raised)')
    expect(stylesheet).toContain('border-color: var(--color-border)')
    expect(stylesheet).toContain('border-left-color: var(--calendar-state-accent)')
    expect(stylesheet).toContain('.dark .calendar-state-badge')
    expect(stylesheet).toContain('border-color: color-mix(in srgb, var(--calendar-state-accent) 60%, transparent)')
    expect(stylesheet).toContain('background: rgb(255 255 255 / 0.05)')
    expect(stylesheet).toContain('.dark .calendar-state-dot')
    expect(stylesheet).toContain('background: var(--calendar-state-accent)')
    expect(stylesheet).toContain('.dark [data-calendar-marker]')
    expect(monthlyCalendarSource).toContain('border-l-4')
  })

  it('mantem navegacao ativa e KPIs sem blocos de cor berrantes no dark', () => {
    expect(declarationsFor('.dark')['--color-navigation-active']).toBe('rgb(119 194 164 / 0.10)')
    expect(sidebarSource).toContain('border-[var(--color-primary)] bg-[var(--color-navigation-active)] text-[var(--color-navigation-active-text)]')
    expect(sidebarSource).not.toContain("isActive ? 'border-[var(--color-sidebar-text)] bg-[var(--color-navigation-active)]")
    expect(summaryCardSource).toContain('ui-border ui-surface')
    expect(summaryCardSource).not.toContain('dark:border-emerald')
    expect(summaryCardSource).not.toContain('dark:border-amber')
  })

  it('remove aliases temporarios e neutros estruturais antigos das areas corporativas', () => {
    const legacyBrandPattern = new RegExp(['sma', '(?:navy|green)'].join('-'))

    expect(stylesheet).not.toMatch(legacyBrandPattern)
    for (const source of appUiSources) {
      expect(source).not.toMatch(legacyBrandPattern)
      expect(source).not.toMatch(/(?:bg|text|border|divide|ring)-slate-/)
      expect(source).not.toContain('rounded-xl-subtle')
    }
  })

  it('remove tokens paralelos antigos e mantem literais de cor fora dos componentes', () => {
    expect(stylesheet).not.toMatch(/--color-sma-/)
    expect(stylesheet).not.toMatch(/--sma-/)

    const shellSources = [appLayoutSource, headerSource, sidebarSource, pageContainerSource, themeToggleSource, confirmDialogSource]
    for (const source of shellSources) {
      expect(source).not.toMatch(/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
    }
  })
})
