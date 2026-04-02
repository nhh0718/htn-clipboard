// Theme management — dark / light mode.
// Persists preference in localStorage, syncs with <html class="dark">.

import { createContext, useContext, useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'clipboard-pro-theme'

export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'dark'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

export const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: 'dark', setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function useThemeState() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function setTheme(t: Theme) {
    setThemeState(t)
    applyTheme(t)
  }

  return { theme, setTheme }
}
