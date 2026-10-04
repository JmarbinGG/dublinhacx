import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { t } from '../i18n'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signIn.somethingWentWrong'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-pitch">
        <h2>{t('signIn.welcomeBack')}</h2>
        <p>{t('signIn.seeWhatYourTown')}</p>
        <ul>
          <li>{t('signIn.findTools')}</li>
          <li>{t('signIn.offerSkill')}</li>
          <li>{t('signIn.postEvenOffline')}</li>
        </ul>
      </div>

      <section className="auth-panel">
        <h1>{t('signIn.signIn')}</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="signin-email">{t('signIn.email')}</label>
            <input
              id="signin-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label htmlFor="signin-password">{t('signIn.password')}</label>
            <input
              id="signin-password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? t('signIn.signingIn') : t('signIn.signIn')}
          </button>
        </form>

        <p className="auth-switch">
          {t('signIn.newHere')} <Link to="/signup">{t('signIn.joinBanyan')}</Link>
        </p>
      </section>
    </div>
  )
}
