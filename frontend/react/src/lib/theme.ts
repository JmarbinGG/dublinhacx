/** Light / dark / follow-the-system, saved per device. index.html applies
 * the saved choice before first paint so there's no flash. */
export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'banyan.theme'

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Not persisted.
  }
}
