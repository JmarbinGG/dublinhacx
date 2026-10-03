import { useEffect, useRef, useState } from 'react'
import { LANGS, readLang, saveLang, type LangId } from '../lib/lang'
import Icon from './Icon'

type Props = { onDone: () => void; onClose: () => void }

/**
 * Language choice after "Get started". A bottom sheet on phones (thumb
 * reach), centred on wide screens. Native names first, big 56 px rows, a
 * real radio group, Escape / backdrop to close, focus starts on the
 * current choice.
 */
export default function LanguageSheet({ onDone, onClose }: Props) {
  const [choice, setChoice] = useState<LangId>(() => readLang() ?? 'en')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet lang-sheet" role="dialog" aria-modal="true" aria-labelledby="lang-title">
        <div className="sheet__head">
          <h2 id="lang-title">Choose your language</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="lang-list" role="radiogroup" aria-labelledby="lang-title" ref={listRef}>
          {LANGS.map((l) => (
            <label key={l.id} className="lang-option">
              <input
                type="radio"
                name="lang"
                value={l.id}
                checked={choice === l.id}
                onChange={() => setChoice(l.id)}
              />
              <span lang={l.id} className="lang-option__native">
                {l.native}
              </span>
              {l.native !== l.english && <span className="lang-option__english">{l.english}</span>}
            </label>
          ))}
        </div>
        <p className="hint">Banyan is in English for now. Your choice is saved for when other languages arrive.</p>
        <button
          type="button"
          className="primary-button lang-sheet__go"
          onClick={() => {
            saveLang(choice)
            onDone()
          }}
        >
          Continue
        </button>
      </div>
    </>
  )
}
