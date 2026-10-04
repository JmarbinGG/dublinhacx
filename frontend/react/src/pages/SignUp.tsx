import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCommunities } from '../context/CommunityContext'
import { t } from '../i18n'

export default function SignUp() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { signup } = useAuth()
  const { communities, home, setHome } = useCommunities()
  const [town, setTown] = useState(home ?? '')
  const navigate = useNavigate()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signup({ name: name.trim(), email: email.trim(), password, community: town.trim() || undefined })
      if (town.trim()) setHome(town.trim())
      navigate('/profile/edit')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signIn.somethingWentWrong'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-pitch">
        <h2>{t('signUp.whyBanyan')}</h2>
        <p>
          {t('signUp.pitch')}
        </p>
        <ul>
          <li>{t('signUp.chooseExchange')}</li>
          <li>{t('signUp.postJobOrAsk')}</li>
          <li>{t('signUp.builtForSlow')}</li>
        </ul>
      </div>

      <section className="auth-panel">
        <h1>{t('signUp.joinBanyan')}</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="signup-name">{t('signUp.name')}</label>
            <input
              id="signup-name"
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="form-field">
            <label htmlFor="signup-email">{t('signUp.email')}</label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
            <span className="field-hint">{t('signUp.emailHint')}</span>
          </div>

          <div className="form-field">
            <label htmlFor="signup-password">{t('signUp.password')}</label>
            <input
              id="signup-password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <span className="field-hint">{t('signUp.passwordHint')}</span>
          </div>

          <div className="form-field">
            <label htmlFor="signup-town">{t('signUp.yourTown')}</label>
            <input
              id="signup-town"
              list="signup-towns"
              maxLength={120}
              value={town}
              onChange={(event) => setTown(event.target.value)}
            />
            <datalist id="signup-towns">
              {communities.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? t('signUp.creatingAccount') : t('signUp.join')}
          </button>
        </form>

        <p className="auth-switch">
          {t('signUp.alreadyMember')} <Link to="/signin">{t('signUp.signIn')}</Link>
        </p>
      </section>
    </div>
  )
}
