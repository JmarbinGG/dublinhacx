import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { analyzeImage } from '../api/analyze'
import { isNetworkError, resolveImageUrl } from '../api/client'
import { createItem, type NewItem } from '../api/items'
import { useAuth } from '../auth/AuthContext'
import { useCommunities } from '../context/CommunityContext'
import { formatKb } from '../context/DataBudgetContext'
import { enqueueItem } from '../offline/syncQueue'
import { CATEGORIES, type Category } from '../types'

/**
 * Create a listing. A photo is optional: when one is picked it's uploaded to
 * /api/analyze, which compresses it and suggests a title/category/etc.
 * Offline, the listing (text only) is queued and posted on reconnect.
 */
export default function CreateListing() {
  const { user, token } = useAuth()
  const { communities, home } = useCommunities()
  const navigate = useNavigate()

  // Defaults to your home community, which may only arrive after mount.
  const [chosenCommunityId, setCommunityId] = useState('')
  const communityId = chosenCommunityId || home?.id || ''
  const [category, setCategory] = useState<Category | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [tags, setTags] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')

  const [photo, setPhoto] = useState<{ url: string; sizeKb: number } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Tags each analyze call so a slower, older request can't overwrite a
  // newer photo's result.
  const analyzeRequestId = useRef(0)

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const requestId = ++analyzeRequestId.current
    setPhoto(null)
    setAnalyzeError(null)
    if (!file || !token) return

    setAnalyzing(true)
    try {
      const result = await analyzeImage(file, token)
      if (requestId !== analyzeRequestId.current) return
      setPhoto({ url: result.image_url, sizeKb: result.image_size_kb })
      // Suggestions only fill fields the user hasn't typed into.
      setTitle((prev) => prev || result.title)
      setCategory((prev) => prev || (result.category as Category) || '')
      setDescription((prev) => prev || result.description)
      setQuantity((prev) => prev || result.quantity)
      setTags((prev) => prev || result.tags)
    } catch (err) {
      if (requestId !== analyzeRequestId.current) return
      setAnalyzeError(
        isNetworkError(err)
          ? "Photos can't upload while offline - you can still post the listing without one."
          : err instanceof Error
            ? err.message
            : 'Could not upload this photo.',
      )
    } finally {
      if (requestId === analyzeRequestId.current) setAnalyzing(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!token || !category || !communityId) return
    setError(null)
    setSubmitting(true)

    const item: NewItem = {
      community_id: communityId,
      category,
      title: title.trim(),
      description: description.trim() || undefined,
      price_or_exchange: price.trim() || undefined,
      quantity: quantity.trim() || undefined,
      tags: tags.trim() || undefined,
      contact_email: email.trim() || undefined,
      image_url: photo?.url,
    }

    try {
      const created = await createItem(item, token)
      navigate(`/listings/${created.id}`)
    } catch (err) {
      if (isNetworkError(err)) {
        enqueueItem(item)
        navigate('/my-listings', { state: { queued: true } })
        return
      }
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

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
          <label htmlFor="listing-title">Title</label>
          <input
            id="listing-title"
            type="text"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Heirloom seed garlic"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="listing-category">Category</label>
            <select
              id="listing-category"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              <option value="" disabled>
                Choose...
              </option>
              {CATEGORIES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="listing-community">Community</label>
            <select
              id="listing-community"
              required
              value={communityId}
              onChange={(event) => setCommunityId(event.target.value)}
            >
              <option value="" disabled>
                Choose...
              </option>
              {communities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="listing-description">Short description</label>
          <textarea
            id="listing-description"
            rows={3}
            maxLength={1000}
            placeholder="What it is, condition, pickup details."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="listing-price">Price or exchange</label>
            <input
              id="listing-price"
              type="text"
              maxLength={120}
              placeholder="$15 or trade for mason jars"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="listing-quantity">Quantity</label>
            <input
              id="listing-quantity"
              type="text"
              maxLength={60}
              placeholder="e.g. 40 lbs"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="listing-tags">Tags</label>
          <input
            id="listing-tags"
            type="text"
            maxLength={200}
            placeholder="e.g. garlic, hardneck, seed"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="listing-email">Contact email</label>
          <input
            id="listing-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <span className="field-hint">Only shown to signed-in members.</span>
        </div>

        <div className="form-field">
          <label htmlFor="listing-image">Photo (optional)</label>
          <div className="file-input">
            <input id="listing-image" type="file" accept="image/*" onChange={handlePhotoChange} />
            <label htmlFor="listing-image" className="secondary-button file-input__button">
              Choose File
            </label>

            {/* `capture` opens the camera directly on phones. */}
            <input
              id="listing-photo-capture"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
            />
            <label htmlFor="listing-photo-capture" className="secondary-button file-input__button">
              Take Photo
            </label>

            {photo ? (
              <>
                <img src={resolveImageUrl(photo.url)} alt="" className="file-input__preview" />
                <span className="file-input__hint">Compressed to {formatKb(photo.sizeKb)}</span>
              </>
            ) : (
              <span className="file-input__hint">No photo - listings work fine without one</span>
            )}
          </div>
          {analyzing && (
            <p className="photo-status" role="status">
              Uploading and compressing...
            </p>
          )}
          {analyzeError && (
            <p className="photo-status photo-status--error" role="alert">
              {analyzeError}
            </p>
          )}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={submitting || analyzing}>
          {submitting ? 'Posting...' : 'Post Listing'}
        </button>
      </form>
    </section>
  )
}
