import { Fragment, type ReactNode } from 'react'
import { t, type Key } from '.'

type Vars = Record<string, string | number>

/**
 * A translated string with markup inside it, e.g.
 * 'Set your town in <link>Towns</link> first.' with
 * tags={{ link: (text) => <Link to="/communities">{text}</Link> }}.
 * Translators move the tag with the words; the element stays ours.
 */
export default function Trans({ k, vars, tags }: { k: Key; vars?: Vars; tags: Record<string, (text: string) => ReactNode> }) {
  const parts: ReactNode[] = []
  const re = /<(\w+)>(.*?)<\/\1>/g
  const text = t(k, vars)
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const render = tags[m[1]]
    parts.push(<Fragment key={m.index}>{render ? render(m[2]) : m[2]}</Fragment>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
