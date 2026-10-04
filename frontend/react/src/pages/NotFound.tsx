import { Link } from 'react-router-dom'
import { t } from '../i18n'

export default function NotFound() {
  return (
    <section className="prose">
      <h1>{t('notFound.title')}</h1>
      <Link to="/app">{t('notFound.home')}</Link>
    </section>
  )
}
