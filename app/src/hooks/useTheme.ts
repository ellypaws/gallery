import { useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

function getPreferredTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem('gallery-theme')
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => getPreferredTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('gallery-theme', theme)
  }, [theme])

  const api = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme() {
        setTheme((value) => (value === 'light' ? 'dark' : 'light'))
      },
    }),
    [theme],
  )

  return api
}
