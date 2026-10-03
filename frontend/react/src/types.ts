/**
 * A listing row, mirroring the SQLAlchemy `Listing` model in backend/main.py.
 *
 * Only `id` and `name` are guaranteed - every other column is nullable, and the
 * UI hides fields that are missing. Columns added to the backend later show up
 * automatically in the detail view via the index signature.
 *
 * `quantity` is a String column on the backend, but accept a number too in case
 * that changes.
 */
export type Listing = {
  id: string | number
  name: string
  image?: string | null
  owner?: string | null
  location?: string | null
  quantity?: string | number | null
  email?: string | null
  mailtolink?: string | null
  status?: string | null
  category?: string | null
  owner_id?: number | null
  [extraColumn: string]: unknown
}
