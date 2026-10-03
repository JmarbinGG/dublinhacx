/**
 * Client-side photo preparation before upload. It doesn't replace the
 * server's checks, but it means:
 *  - only real, decodable JPEG/PNG/WebP/GIF images are accepted;
 *  - the photo is re-drawn on a canvas and re-encoded as JPEG, which drops
 *    EXIF metadata (including GPS) and anything hidden inside the file;
 *  - it's shrunk to MAX_EDGE px, so a 4 MB phone photo uploads as ~100 KB -
 *    on a capped connection that matters both for the uploader and for every
 *    viewer who taps "Load image".
 */

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const MAX_EDGE = 1024
const QUALITY = 0.75

export class ImageRejectedError extends Error {}

export type PreparedImage = { blob: Blob; sizeKb: number; previewUrl: string }

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageRejectedError("That file isn't a readable image."))
    }
    img.src = url
  })
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageRejectedError('Choose a JPEG, PNG, WebP or GIF photo.')
  }
  if (file.size > MAX_INPUT_BYTES) throw new ImageRejectedError('That photo is too large (over 15 MB).')

  const img = await loadImage(file)
  if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
    throw new ImageRejectedError('That image is too large to process.')
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageRejectedError("This browser can't prepare photos.")
  // White background so transparent PNGs don't turn black as JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob) throw new ImageRejectedError("Couldn't prepare that photo.")
  return {
    blob: new File([blob], 'photo.jpg', { type: 'image/jpeg' }),
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
    previewUrl: URL.createObjectURL(blob),
  }
}
