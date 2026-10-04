import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isNetworkError, resolveImageUrl } from '../api/client'
import { uploadImage } from '../api/listings'
import { updateMe } from '../api/users'
import { useAuth } from '../auth/AuthContext'
import { useCommunities } from '../context/CommunityContext'
import { formatKb } from '../context/DataBudgetContext'
import { ImageRejectedError, prepareImage } from '../lib/image'
import { t } from '../i18n'

const BIO_MAX = 280

/** /profile/edit - name, photo, bio, town, public contact and location. */
export default function EditProfile() {
  const { user, token, setUser } = useAuth()
  const { communities, setHome } = useCommunities()
  const navigate = useNavigate()

  const [name, setName] = useState(user?.name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [community, setCommunity] = useState(user?.community ?? '')
  const [contact, setContact] = useState(user?.contact ?? '')
  const [photo, setPhoto] = useState<string | null>(user?.photo ?? null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    user?.latitude != null && user?.longitude != null ? { lat: user.latitude, lng: user.longitude } : null,
  )
  const [photoKb, setPhotoKb] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user || !token) {
    return (
      <section className="auth-panel">
        <h1>{t('editProfile.title')}</h1>
        <p className="state">
          <Link to="/signin">{t('editProfile.signInToEdit')}</Link>
        </p>
      </section>
    )
  }

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !token) return
    setError(null)
    setBusy(true)
    try {
      const prepared = await prepareImage(file)
      const { url } = await uploadImage(prepared.blob, token)
      setPhoto(url)
      setPhotoKb(prepared.sizeKb)
    } catch (err) {
      setError(
        err instanceof ImageRejectedError
          ? err.message
          : isNetworkError(err)
            ? t('editProfile.offlinePhoto')
            : err instanceof Error
              ? err.message
              : t('editProfile.couldNotUpload'),
      )
    } finally {
      setBusy(false)
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setError(t('editProfile.noGeolocation'))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // ~100 m precision is plenty for distances and keeps your exact spot private.
        setCoords({
          lat: Math.round(pos.coords.latitude * 1000) / 1000,
          lng: Math.round(pos.coords.longitude * 1000) / 1000,
        })
        setLocating(false)
      },
      () => {
        setError(t('editProfile.couldNotGetLocation'))
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 15_000 },
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!token) return
    setError(null)
    setBusy(true)
    try {
      const updated = await updateMe(
        {
          name: name.trim(),
          bio: bio.trim() || null,
          community: community.trim() || null,
          contact: contact.trim() || null,
          photo,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        },
        token,
      )
      setUser(updated)
      if (updated.community) setHome(updated.community)
      navigate(`/users/${updated.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('editProfile.couldNotSave'))
    } finally {
      setBusy(false)
    }
  }

  const photoUrl = resolveImageUrl(photo)

  return (
    <section className="auth-panel create-listing-panel">
      <h1>{t('editProfile.title')}</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="profile-photo">{t('editProfile.photo')}</label>
          <div className="file-input">
            <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} />
            <label htmlFor="profile-photo" className="secondary-button file-input__button">
              {photo ? t('editProfile.changePhoto') : t('editProfile.addPhoto')}
            </label>
            {photoUrl && <img src={photoUrl} alt="" className="file-input__preview" />}
            {photoKb && <span className="file-input__hint">{t('editProfile.shrunkTo', { size: formatKb(photoKb) })}</span>}
            {photo && (
              <button type="button" className="link-button" onClick={() => setPhoto(null)}>
                {t('editProfile.remove')}
              </button>
            )}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="profile-name">{t('editProfile.name')}</label>
          <input id="profile-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-field">
          <label htmlFor="profile-bio">{t('editProfile.aboutYou')}</label>
          <textarea
            id="profile-bio"
            rows={3}
            maxLength={BIO_MAX}
            placeholder={t('editProfile.bioPlaceholder')}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <span className="field-hint">
            {bio.length}/{BIO_MAX}
          </span>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="profile-town">{t('editProfile.town')}</label>
            <input
              id="profile-town"
              list="town-list"
              maxLength={120}
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
            />
            <datalist id="town-list">
              {communities.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="form-field">
            <label htmlFor="profile-contact">{t('editProfile.publicContact')}</label>
            <input
              id="profile-contact"
              maxLength={200}
              placeholder={t('editProfile.contactPlaceholder')}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        </div>
        <p className="field-hint">{t('editProfile.contactHint')}</p>

        <div className="form-field">
          <span className="form-label">{t('editProfile.location')}</span>
          <div className="file-input">
            <button type="button" className="secondary-button" onClick={locateMe} disabled={locating}>
              {locating ? t('editProfile.locating') : coords ? t('editProfile.updateLocation') : t('editProfile.useLocation')}
            </button>
            {coords && (
              <>
                <span className="file-input__hint">{t('editProfile.locationSaved')}</span>
                <button type="button" className="link-button" onClick={() => setCoords(null)}>
                  {t('editProfile.clear')}
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? t('editProfile.saving') : t('editProfile.saveProfile')}
        </button>
      </form>
    </section>
  )
}
