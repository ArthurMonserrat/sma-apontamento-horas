import { useTheme } from '../providers/useTheme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="ui-button-secondary px-3 py-2 font-semibold"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
    >
      {isDark ? 'Tema claro' : 'Tema escuro'}
    </button>
  )
}
