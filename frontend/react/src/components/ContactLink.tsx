/**
 * A user's public contact, which is free text. Only two link shapes are
 * ever built from it - mailto: for a plain email, tel: for a phone number -
 * and both from validated characters, so a stored "javascript:" or other
 * URL can never become a clickable link. Anything else shows as text.
 */
export default function ContactLink({ contact, subject }: { contact: string; subject?: string }) {
  const value = contact.trim()

  if (/^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i.test(value)) {
    const query = subject ? `?subject=${encodeURIComponent(subject)}` : ''
    return (
      <a className="primary-button" href={`mailto:${value}${query}`}>
        Email {value}
      </a>
    )
  }

  const digits = value.replace(/[\s().-]/g, '')
  if (/^\+?\d{6,15}$/.test(digits)) {
    return (
      <a className="primary-button" href={`tel:${digits}`}>
        Call {value}
      </a>
    )
  }

  return <p className="contact-text">{value}</p>
}
