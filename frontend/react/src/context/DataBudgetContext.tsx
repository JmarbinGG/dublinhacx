import { createContext, useContext, useMemo, useState } from 'react'

/**
 * Tracks how many KB of listing images the user chose to load this calendar
 * month, against a budget they set. Images never load on their own (see
 * DataBudgetImage) - this is the running total of explicit "Load image" taps.
 *
 * It counts listing photos only; it can't see the rest of the phone's data.
 */

const STORAGE_KEY = 'byproduct.dataBudget'
export const DEFAULT_BUDGET_MB = 25
export const BUDGET_CHOICES_MB = [5, 10, 25, 50, 100]

type Stored = { month: string; usedKb: number; budgetMb: number }

function currentMonth() {
  return new Date().toISOString().slice(0, 7) // "2026-10"
}

function readStored(): Stored {
  const fresh = { month: currentMonth(), usedKb: 0, budgetMb: DEFAULT_BUDGET_MB }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const stored = JSON.parse(raw) as Stored
    // New month: keep the budget setting, reset the meter.
    return stored.month === fresh.month ? stored : { ...fresh, budgetMb: stored.budgetMb }
  } catch {
    return fresh
  }
}

function writeStored(value: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Not persisted - the meter just resets on reload.
  }
}

type DataBudgetValue = {
  usedKb: number
  budgetKb: number
  budgetMb: number
  setBudgetMb: (mb: number) => void
  resetUsage: () => void
  /** Count an image the user chose to load. Re-showing one already loaded
   * this session is free (the browser cache serves it), so it isn't counted. */
  recordLoad: (src: string, kb: number) => void
  isLoaded: (src: string) => boolean
}

const DataBudgetContext = createContext<DataBudgetValue | null>(null)

export function DataBudgetProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Stored>(() => readStored())
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set())

  function update(next: Stored) {
    setStored(next)
    writeStored(next)
  }

  const value = useMemo<DataBudgetValue>(
    () => ({
      usedKb: stored.usedKb,
      budgetMb: stored.budgetMb,
      budgetKb: stored.budgetMb * 1024,
      setBudgetMb: (mb) => update({ ...stored, budgetMb: mb }),
      resetUsage: () => update({ ...stored, usedKb: 0 }),
      recordLoad(src, kb) {
        if (loaded.has(src)) return
        setLoaded(new Set(loaded).add(src))
        update({ ...stored, month: currentMonth(), usedKb: stored.usedKb + kb })
      },
      isLoaded: (src) => loaded.has(src),
    }),
    [stored, loaded],
  )

  return <DataBudgetContext.Provider value={value}>{children}</DataBudgetContext.Provider>
}

export function useDataBudget(): DataBudgetValue {
  const context = useContext(DataBudgetContext)
  if (!context) throw new Error('useDataBudget must be used inside <DataBudgetProvider>')
  return context
}

export function formatKb(kb: number): string {
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}
