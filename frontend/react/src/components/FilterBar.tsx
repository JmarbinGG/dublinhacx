import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { SCOPES, SORTS, readFilters } from '../lib/filters'
import { EXCHANGES, LISTING_TYPES } from '../types'
import HomePicker from './HomePicker'
import Icon from './Icon'
import MorphIcon from './MorphIcon'
import { t } from '../i18n'

/**
 * Two inline filters (distance, exchange) and one "More" sheet for the
 * rest. Type is the category choice, so it lives in the sheet (and is
 * hidden on category pages, where the page is the type). All state lives
 * in the URL, so the view can be shared and back/forward work.
 */
export default function FilterBar({ showType = true, showKind = true }: { showType?: boolean; showKind?: boolean }) {
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

  const extraActive = [
    showType && filters.type,
    showKind && filters.kind,
    filters.sort !== 'newest' ? 'sort' : '',
    params.get('plain'),
  ].filter(Boolean).length

  return (
    <div className="filters">
      <label className="field field--inline">
        <span className="visually-hidden">{t('filter.distance')}</span>
        <select
          value={filters.scope}
          onChange={(e) => set('scope', e.target.value === 'all' ? null : e.target.value)}
        >
          {SCOPES.map((scope) => (
            <option key={scope.id} value={scope.id} disabled={scope.id !== 'all' && !home}>
              {scope.id === 'all' ? t('filter.anyDistance') : scope.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--inline">
        <span className="visually-hidden">{t('filter.exchange')}</span>
        <select value={filters.exchange} onChange={(e) => set('ex', e.target.value)}>
          <option value="">{t('filter.anyExchange')}</option>
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
        {t('filter.more')}{extraActive > 0 && ` (${extraActive})`}
        <MorphIcon name="chevron" on={sheetOpen} />
      </button>

      {sheetOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <div id="filter-sheet" className="sheet" role="dialog" aria-label={t('filter.moreFilters')} ref={sheetRef}>
            <div className="sheet__head">
              <h2>{t('filter.moreFilters')}</h2>
              <button type="button" className="icon-button" aria-label={t('filter.close')} onClick={() => setSheetOpen(false)}>
                <Icon name="x" />
              </button>
            </div>
            <HomePicker id="sheet-home" />
            {showType && (
              <label className="field">
                <span>{t('filter.type')}</span>
                <select value={filters.type} onChange={(e) => set('type', e.target.value)}>
                  <option value="">{t('filter.allTypes')}</option>
                  {LISTING_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showKind && (
              <label className="field">
                <span>{t('filter.kind')}</span>
                <select value={filters.kind} onChange={(e) => set('kind', e.target.value)}>
                  <option value="">{t('filter.both')}</option>
                  <option value="offer">{t('filter.offers')}</option>
                  <option value="request">{t('kind.helpWanted')}</option>
                </select>
              </label>
            )}
            <label className="field">
              <span>{t('filter.sort')}</span>
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
                {t('filter.plain')}
              </label>
            )}
            {!home && <p className="hint">{t('filter.chooseTown')}</p>}
            <button type="button" className="primary-button" onClick={() => setSheetOpen(false)}>
              {t('filter.done')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
