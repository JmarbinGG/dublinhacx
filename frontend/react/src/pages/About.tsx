import { t } from '../i18n'

export default function About() {
  return (
    <section className="prose">
      <h1>{t('about.title')}</h1>
      <p>{t('about.intro')}</p>

      <h2>{t('about.shareTitle')}</h2>
      <ul>
        <li>
          <strong>{t('group.materials')}</strong> - {t('about.materials')}
        </li>
        <li>
          <strong>{t('about.equipmentTitle')}</strong> - {t('about.equipment')}
        </li>
        <li>
          <strong>{t('about.skillsTitle')}</strong> - {t('about.skills')}
        </li>
      </ul>
      <p>{t('about.exchange')}</p>

      <h2>{t('about.slowTitle')}</h2>
      <ul>
        <li>{t('about.slow1')}</li>
        <li>{t('about.slow2')}</li>
        <li>{t('about.slow3')}</li>
        <li>{t('about.slow4')}</li>
      </ul>

      <h2>{t('about.aiTitle')}</h2>
      <p>{t('about.ai')}</p>
    </section>
  )
}
