import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCommunities } from '../context/CommunityContext'

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
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-pitch">
        <h2>Why Banyan?</h2>
        <p>
          Every village has a pump set sitting idle, a roll of drip pipe left over, someone who can fix a tractor or
          stitch a blouse. Banyan helps them find the neighbour - or the next town - that needs them.
        </p>
        <ul>
          <li>Lend, swap, give or sell - you choose</li>
          <li>Post a job or ask for help, not just things</li>
          <li>Built for slow connections: text first, photos only when you tap</li>
        </ul>
      </div>

      <section className="auth-panel">
        <h1>Join Banyan</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="signup-name">Name</label>
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
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
            <span className="field-hint">For signing in only - never shown to others.</span>
          </div>

          <div className="form-field">
            <label htmlFor="signup-password">Password</label>
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
            <span className="field-hint">At least 8 characters.</span>
          </div>

          <div className="form-field">
            <label htmlFor="signup-town">Your town</label>
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
            {submitting ? 'Creating account...' : 'Join'}
          </button>
        </form>

        <p className="auth-switch">
          Already a member? <Link to="/signin">Sign in</Link>
        </p>
      </section>
    </div>
  )
}
