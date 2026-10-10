import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './themeContext'
import { createBrowserStorage } from '../../shared/infrastructure/storage/browserStorage'

const themeStorage = createBrowserStorage()

function getInitialTheme(): Theme {
  const storedTheme = themeStorage.getItem('sma-theme')
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme

  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', theme === 'dark')
    themeStorage.setItem('sma-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((current) => (current === 'light' ? 'dark' : 'light'))

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}
