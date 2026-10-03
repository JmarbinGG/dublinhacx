import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isNetworkError, resolveImageUrl } from '../api/client'
import { createListing, updateListing, uploadImage, type ListingInput } from '../api/listings'
import { useAuth } from '../auth/AuthContext'
import { Loading } from '../components/States'
import { formatKb } from '../context/DataBudgetContext'
import { useListing } from '../hooks/useItems'
import { TOPICS, isTopic } from '../lib/categories'
import { ImageRejectedError, prepareImage } from '../lib/image'
import { enqueueListing } from '../offline/syncQueue'
import { EXCHANGES, LISTING_TYPES, type ExchangeType, type ListingKind, type ListingType } from '../types'

function splitTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
}

/**
 * Create (/listings/new) or edit (/listings/:id/edit) a listing. A photo is
 * optional: it's checked, shrunk and re-encoded in the browser, uploaded to
 * /api/uploads, and the returned url goes into the listing. Offline, a new
 * listing (text only) is queued and posted on reconnect.
 */
export default function CreateListing() {
  const { id } = useParams()
  const editing = Boolean(id)
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const existing = useListing(id ?? null)

  const [type, setType] = useState<ListingType>('material')
  const [kind, setKind] = useState<ListingKind>('offer')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [quantity, setQuantity] = useState('')
  const [exchange, setExchange] = useState<ExchangeType>('free')
  const [price, setPrice] = useState('')
  const [image, setImage] = useState<string | null>(null)

  const [photoKb, setPhotoKb] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const uploadId = useRef(0)
  const prefilled = useRef(false)

  // Prefill once when editing.
  useEffect(() => {
    const l = existing.data
    if (!editing || !l || prefilled.current) return
    prefilled.current = true
    setType(l.type)
    setKind(l.kind)
    setTitle(l.title)
    setDescription(l.description ?? '')
    setCategory(isTopic(l.category ?? null) ? (l.category as string) : '')
    setTags(l.tags.join(', '))
    setQuantity(l.quantity ?? '')
    setExchange(l.exchange)
    setPrice(l.price ?? '')
    setImage(l.image ?? null)
  }, [editing, existing.data])

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-picking the same file
    const requestId = ++uploadId.current
    setPhotoError(null)
    if (!file || !token) return

    setUploading(true)
    try {
      const prepared = await prepareImage(file)
      if (requestId !== uploadId.current) return
      setPreview(prepared.previewUrl)
      setPhotoKb(prepared.sizeKb)
      const { url } = await uploadImage(prepared.blob, token)
      if (requestId !== uploadId.current) return
      setImage(url)
    } catch (err) {
      if (requestId !== uploadId.current) return
      setPreview(null)
      setPhotoKb(null)
      setPhotoError(
        err instanceof ImageRejectedError
          ? err.message
          : isNetworkError(err)
            ? "Photos can't upload while offline - you can still post without one."
            : err instanceof Error
              ? err.message
              : 'Could not upload this photo.',
      )
    } finally {
      if (requestId === uploadId.current) setUploading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    setError(null)
    setSubmitting(true)

    const input: ListingInput = {
      type,
      kind,
      title: title.trim(),
      description: description.trim() || null,
      category: category || null,
      tags: splitTags(tags),
      image,
      quantity: quantity.trim() || null,
      exchange,
      price: price.trim() || null,
    }

    try {
      const saved = editing ? await updateListing(Number(id), input, token) : await createListing(input, token)
      navigate(`/listings/${saved.id}`)
    } catch (err) {
      if (!editing && isNetworkError(err)) {
        enqueueListing({ ...input, image: null })
        navigate(`/users/${user?.id}`, { state: { queued: true } })
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
        <h1>Share something</h1>
        <div className="state">
          <p>Sign in to share or ask for something.</p>
          <Link to="/signin" className="primary-button">
            Sign in
          </Link>
        </div>
      </section>
    )
  }

  if (editing && existing.loading && !existing.data) return <Loading label="Loading listing..." />
  if (editing && existing.data && existing.data.owner.id !== user.id) {
    return <p className="state state--error">You can only edit your own listings.</p>
  }

  const shownImage = preview ?? resolveImageUrl(image)

  return (
    <section className="auth-panel create-listing-panel">
      <h1>{editing ? 'Edit listing' : 'Share something'}</h1>

      <form onSubmit={handleSubmit}>
        <fieldset className="form-field">
          <legend>What is it?</legend>
          <div className="chips">
            {LISTING_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip${type === t.id ? ' chip--active' : ''}`}
                aria-pressed={type === t.id}
                onClick={() => setType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="form-field">
          <legend>Are you offering it, or looking for it?</legend>
          <div className="chips">
            <button
              type="button"
              className={`chip${kind === 'offer' ? ' chip--active' : ''}`}
              aria-pressed={kind === 'offer'}
              onClick={() => setKind('offer')}
            >
              I'm offering
            </button>
            <button
              type="button"
              className={`chip${kind === 'request' ? ' chip--active' : ''}`}
              aria-pressed={kind === 'request'}
              onClick={() => setKind('request')}
            >
              {type === 'skill' ? 'I need help / hiring' : "I'm looking for it"}
            </button>
          </div>
        </fieldset>

        <div className="form-field">
          <label htmlFor="listing-title">Title</label>
          <input
            id="listing-title"
            type="text"
            required
            maxLength={120}
            placeholder={type === 'skill' ? 'e.g. Tailoring and alterations' : 'e.g. Diesel pump set, 5 hp'}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="listing-description">Short description</label>
          <textarea
            id="listing-description"
            rows={3}
            maxLength={4000}
            placeholder="Condition, when it's available, where to collect."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="listing-exchange">Exchange</label>
            <select id="listing-exchange" value={exchange} onChange={(e) => setExchange(e.target.value as ExchangeType)}>
              {EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="listing-price">Terms (optional)</label>
            <input
              id="listing-price"
              type="text"
              maxLength={60}
              placeholder="per day, or swap for vegetables"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="listing-category">Category</label>
            {/* The backend's fixed list - we send the id. */}
            <select id="listing-category" required value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="" disabled>
                Choose...
              </option>
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="listing-quantity">Quantity</label>
            <input
              id="listing-quantity"
              type="text"
              maxLength={60}
              placeholder="e.g. 40 metres"
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
            placeholder="pump, water, borewell"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
          <span className="field-hint">Comma-separated. Helps people find it.</span>
        </div>

        <div className="form-field">
          <label htmlFor="listing-image">Photo (optional)</label>
          <div className="file-input">
            <input id="listing-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePhoto} />
            <label htmlFor="listing-image" className="secondary-button file-input__button">
              Choose photo
            </label>
            <input
              id="listing-photo-capture"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handlePhoto}
            />
            <label htmlFor="listing-photo-capture" className="secondary-button file-input__button">
              Take photo
            </label>
            {shownImage ? (
              <>
                <img src={shownImage} alt="" className="file-input__preview" />
                {photoKb && <span className="file-input__hint">Shrunk to {formatKb(photoKb)}</span>}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    uploadId.current++
                    setImage(null)
                    setPreview(null)
                    setPhotoKb(null)
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="file-input__hint">No photo - text-only listings load fastest</span>
            )}
          </div>
          {uploading && (
            <p className="photo-status" role="status">
              Shrinking and uploading...
            </p>
          )}
          {photoError && (
            <p className="photo-status photo-status--error" role="alert">
              {photoError}
            </p>
          )}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={submitting || uploading}>
          {submitting ? 'Saving...' : editing ? 'Save changes' : 'Post'}
        </button>
      </form>
    </section>
  )
}
