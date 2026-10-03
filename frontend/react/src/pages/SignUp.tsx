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
  const { communities, home, setHomeId } = useCommunities()
  const navigate = useNavigate()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signup(name, email, password, home?.id ?? null)
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
        <h2>Why byproduct.?</h2>
        <p>
          Your neighbor two miles away probably doesn't have a hay baler, heirloom seed corn
          or a farrier. Someone twelve miles away might. byproduct. connects nearby rural
          communities so specialized goods and skills find the people who need them.
        </p>
        <ul>
          <li>Find specialized trade beyond walking distance</li>
          <li>Trade directly - cash or barter, no middleman fees</li>
          <li>Built for slow connections: text first, photos only when you ask</li>
        </ul>
      </div>

      <section className="auth-panel">
        <h1>Sign Up</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="signup-name">Name</label>
            <input
              id="signup-name"
              type="text"
              required
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
          </div>

          <div className="form-field">
            <label htmlFor="signup-community">Your community</label>
            <select
              id="signup-community"
              value={home?.id ?? ''}
              onChange={(event) => setHomeId(event.target.value)}
            >
              <option value="">Choose where you are</option>
              {communities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </section>
    </div>
  )
}
