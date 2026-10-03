/** Initials in a coloured circle - zero bytes, unlike a profile photo.
 * Profile pages offer the real photo behind a "Load image" tap. */
export default function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  // Stable colour per name.
  const hue = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 6
  return (
    <span className={`avatar avatar--${size} avatar--hue${hue}`} aria-hidden="true">
      {initials || '?'}
    </span>
  )
}
