export type IconName =
  | 'search' | 'plus' | 'user' | 'x' | 'chat' | 'sliders' | 'check'
  | 'alert' | 'offline' | 'pin' | 'image' | 'back'
  | 'brick' | 'tool' | 'skill' | 'help'

/** One icon from the inline sprite in index.html - no icon files or fonts. */
export default function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg className="icon" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <use href={`#i-${name}`} />
    </svg>
  )
}
