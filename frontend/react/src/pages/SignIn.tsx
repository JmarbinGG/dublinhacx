import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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
      await login(email, password)
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-pitch">
        <h2>Welcome back.</h2>
        <p>
          Pick up where you left off - see what the communities around you are offering, or
          post something of your own.
        </p>
        <ul>
          <li>See contact details and make offers</li>
          <li>Post listings - even offline, they sync when you reconnect</li>
          <li>Keep track of everything you've posted</li>
        </ul>
      </div>

      <section className="auth-panel">
        <h1>Sign In</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="signin-email">Email</label>
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
            <label htmlFor="signin-password">Password</label>
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
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </section>
    </div>
  )
}
