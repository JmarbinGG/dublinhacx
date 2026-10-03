import { createContext, useContext, useMemo, useState } from 'react'

/**
 * Data-saver settings and meter. Tracks KB of listing photos the user chose
 * to load this calendar month against a budget they set, plus the small AI
 * answers they asked for. Images never load on their own (DataBudgetImage).
 */

const STORAGE_KEY = 'banyan.dataBudget'
export const DEFAULT_BUDGET_MB = 25
export const BUDGET_CHOICES_MB = [5, 10, 25, 50, 100]
/** A compact AI answer is roughly this big over the wire. */
export const AI_ANSWER_KB = 2

type Stored = { month: string; usedKb: number; aiKb: number; budgetMb: number; aiAnswers: boolean }

function currentMonth() {
  return new Date().toISOString().slice(0, 7) // "2026-10"
}

function readStored(): Stored {
  const fresh: Stored = { month: currentMonth(), usedKb: 0, aiKb: 0, budgetMb: DEFAULT_BUDGET_MB, aiAnswers: true }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const stored = { ...fresh, ...(JSON.parse(raw) as Partial<Stored>) }
    // New month: keep the settings, reset the meters.
    return stored.month === fresh.month ? stored : { ...stored, month: fresh.month, usedKb: 0, aiKb: 0 }
  } catch {
    return fresh
  }
}

function writeStored(value: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Not persisted - the meter resets on reload.
  }
}

type DataBudgetValue = {
  usedKb: number
  aiKb: number
  budgetKb: number
  budgetMb: number
  /** Whether "Ask AI" overviews and the assistant are switched on. */
  aiAnswers: boolean
  setBudgetMb: (mb: number) => void
  setAiAnswers: (on: boolean) => void
  resetUsage: () => void
  /** Count an image the user chose to load. Re-showing one already loaded
   * this session is free (the browser cache serves it). */
  recordLoad: (src: string, kb: number) => void
  recordAi: (kb: number) => void
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
      aiKb: stored.aiKb,
      budgetMb: stored.budgetMb,
      budgetKb: stored.budgetMb * 1024,
      aiAnswers: stored.aiAnswers,
      setBudgetMb: (mb) => update({ ...stored, budgetMb: mb }),
      setAiAnswers: (on) => update({ ...stored, aiAnswers: on }),
      resetUsage: () => update({ ...stored, usedKb: 0, aiKb: 0 }),
      recordLoad(src, kb) {
        if (loaded.has(src)) return
        setLoaded(new Set(loaded).add(src))
        update({ ...stored, month: currentMonth(), usedKb: stored.usedKb + kb })
      },
      recordAi: (kb) => update({ ...stored, month: currentMonth(), aiKb: stored.aiKb + kb }),
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
