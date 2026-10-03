import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { analyzeImage, resolveImageUrl } from '../api/analyze'
import { createListing } from '../api/listings'
import { useAuth } from '../auth/AuthContext'

/** Simple form for POST /api/upload - only name and email are required. */
export default function CreateListing() {
  const { user, token } = useAuth()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [quantity, setQuantity] = useState('')
  const [tags, setTags] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  // Tags each analyze call so a slower, older request can't win a race and
  // overwrite a newer photo's result - see handlePhotoChange below.
  const analyzeRequestId = useRef(0)

  // Local preview shows instantly; the photo is also sent to /api/analyze,
  // which saves it server-side and returns an AI-suggested name/category/
  // tags/quantity (see backend/ai/factory.py - the model behind this is
  // swappable, but the response shape stays the same). Fields the user has
  // already typed into are left alone.
  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const requestId = ++analyzeRequestId.current

    if (!file) {
      setImagePreview(null)
      setUploadedImageUrl(null)
      return
    }

    setImagePreview(URL.createObjectURL(file))
    setUploadedImageUrl(null)
    setAnalyzeError(null)
    setAnalyzing(true)

    try {
      const result = await analyzeImage(file)
      // If another photo was picked while this one was still analyzing,
      // its response arrived first and is what should stick - ignore this
      // now-stale result instead of clobbering it (and posting the wrong
      // photo with the listing).
      if (requestId !== analyzeRequestId.current) return
      setUploadedImageUrl(resolveImageUrl(result.image_url))
      setName((prev) => prev || result.name)
      setCategory((prev) => prev || result.category)
      setQuantity((prev) => prev || result.quantity)
      setTags((prev) => prev || result.tags)
    } catch (err) {
      if (requestId !== analyzeRequestId.current) return
      setAnalyzeError(
        err instanceof Error ? err.message : 'Could not auto-analyze this photo.',
      )
    } finally {
      if (requestId === analyzeRequestId.current) setAnalyzing(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const listing = await createListing({
        name,
        category: category.trim() || undefined,
        location: location.trim() || undefined,
        quantity: quantity.trim() || undefined,
        tags: tags.trim() || undefined,
        email: email.trim() || undefined,
        image: uploadedImageUrl ?? undefined,
        owner: user?.name,
        mailtolink: email.trim()
          ? `mailto:${email.trim()}?subject=${encodeURIComponent(name)}`
          : undefined,
      }, token)
      navigate(`/listings/${listing.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  // Publishing requires an account - the create button is reachable from
  // anywhere (navbar, the "+" FAB) regardless of sign-in state, so it's this
  // page's job to turn an anonymous visit into a prompt instead of a form.
  if (!user) {
    return (
      <section className="auth-panel create-listing-panel">
        <h1>Create Listing</h1>
        <div className="state">
          <p>Sign in to publish a listing.</p>
          <Link to="/signin" className="primary-button">
            Sign In
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="auth-panel create-listing-panel">
      <h1>Create Listing</h1>

      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="listing-image">Photo</label>
          <div className="file-input">
            <input
              id="listing-image"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
            />
            <label htmlFor="listing-image" className="secondary-button file-input__button">
              Choose File
            </label>

            {/* Same accept/handler, but `capture` opens the camera directly
                on phones instead of the file library. */}
            <input
              id="listing-photo-capture"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
            />
            <label
              htmlFor="listing-photo-capture"
              className="secondary-button file-input__button"
            >
              Take Photo
            </label>

            {imagePreview ? (
              <img src={imagePreview} alt="" className="file-input__preview" />
            ) : (
              <span className="file-input__hint">No photo selected</span>
            )}
          </div>
          {analyzing && (
            <p className="photo-status" role="status">
              Analyzing photo...
            </p>
          )}
          {analyzeError && (
            <p className="photo-status photo-status--error" role="alert">
              {analyzeError} Fill in the details below manually.
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="listing-name">Item name</label>
          <input
            id="listing-name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="listing-category">Category</label>
          <input
            id="listing-category"
            type="text"
            placeholder="e.g. wood, metal, paper"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="listing-location">Location</label>
          <input
            id="listing-location"
            type="text"
            placeholder="City, State"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="listing-quantity">Quantity</label>
          <input
            id="listing-quantity"
            type="text"
            placeholder="e.g. 50 units"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="listing-tags">Tags</label>
          <input
            id="listing-tags"
            type="text"
            placeholder="e.g. wood, pallets, lumber"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="listing-email">Contact email</label>
          <input
            id="listing-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={submitting || analyzing}>
          {submitting ? 'Creating...' : 'Create Listing'}
        </button>
      </form>
    </section>
  )
}
