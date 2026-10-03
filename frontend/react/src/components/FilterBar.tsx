import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { SCOPES, SORTS, readFilters } from '../lib/filters'
import { EXCHANGES, LISTING_TYPES } from '../types'
import HomePicker from './HomePicker'
import Icon from './Icon'

/**
 * Three inline filters (type, distance, exchange) and one "More filters"
 * sheet for the rest. All state lives in the URL, so changing a filter
 * refetches and the view can be shared.
 */
export default function FilterBar() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { home, homePoint } = useCommunities()
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if (!sheetOpen) return
    sheetRef.current?.querySelector<HTMLElement>('select, button, input')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const extraActive = [filters.kind, filters.sort !== 'newest' ? 'sort' : '', params.get('plain')].filter(Boolean).length

  return (
    <div className="filters">
      <label className="field field--inline">
        <span className="visually-hidden">Type</span>
        <select value={filters.type} onChange={(e) => set('type', e.target.value)}>
          <option value="">All types</option>
          {LISTING_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--inline">
        <span className="visually-hidden">Distance</span>
        <select
          value={filters.scope}
          onChange={(e) => set('scope', e.target.value === 'all' ? null : e.target.value)}
        >
          {SCOPES.map((scope) => (
            <option key={scope.id} value={scope.id} disabled={scope.id !== 'all' && !home}>
              {scope.id === 'all' ? 'Any distance' : scope.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--inline">
        <span className="visually-hidden">Exchange</span>
        <select value={filters.exchange} onChange={(e) => set('ex', e.target.value)}>
          <option value="">Any exchange</option>
          {EXCHANGES.map((exchange) => (
            <option key={exchange.id} value={exchange.id}>
              {exchange.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="secondary-button filters__more"
        aria-expanded={sheetOpen}
        aria-controls="filter-sheet"
        onClick={() => setSheetOpen(true)}
      >
        <Icon name="sliders" />
        More{extraActive > 0 && ` (${extraActive})`}
      </button>

      {sheetOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <div id="filter-sheet" className="sheet" role="dialog" aria-label="More filters" ref={sheetRef}>
            <div className="sheet__head">
              <h2>More filters</h2>
              <button type="button" className="icon-button" aria-label="Close filters" onClick={() => setSheetOpen(false)}>
                <Icon name="x" />
              </button>
            </div>
            <HomePicker id="sheet-home" />
            <label className="field">
              <span>Offers or wanted</span>
              <select value={filters.kind} onChange={(e) => set('kind', e.target.value)}>
                <option value="">Both</option>
                <option value="offer">Offers</option>
                <option value="request">Wanted and jobs</option>
              </select>
            </label>
            <label className="field">
              <span>Sort</span>
              <select
                value={filters.sort}
                disabled={!homePoint}
                onChange={(e) => set('sort', e.target.value === 'newest' ? null : e.target.value)}
              >
                {SORTS.map((sort) => (
                  <option key={sort.id} value={sort.id}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
            {filters.q && (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={params.get('plain') === '1'}
                  onChange={(e) => set('plain', e.target.checked ? '1' : null)}
                />
                Use plain keyword search
              </label>
            )}
            {!home && <p className="hint">Choose your town to filter by distance.</p>}
            <button type="button" className="primary-button" onClick={() => setSheetOpen(false)}>
              Done
            </button>
          </div>
        </>
      )}
    </div>
  )
}
