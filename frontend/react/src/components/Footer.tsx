import { Link } from 'react-router-dom'
import { t } from '../i18n'

export default function Footer() {
  return (
    <footer className="footer">
      <p>
        <strong>Banyan</strong> {t('footer.tagline')}
      </p>
      <nav aria-label={t('footer.label')}>
        <Link to="/about">{t('footer.about')}</Link>
        <Link to="/communities">{t('footer.towns')}</Link>
        <Link to="/data-saver">{t('footer.dataSaver')}</Link>
      </nav>
    </footer>
  )
}
