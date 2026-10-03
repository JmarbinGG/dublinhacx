/**
 * Every visible string on the landing page, in the three languages the
 * landing scramble cycles through. Have a native speaker check the Spanish
 * and Hindi before shipping. "Banyan" (the wordmark) stays as the brand.
 */
export const LANDING_COPY = {
  signin: { en: 'Sign in', es: 'Iniciar sesión', hi: 'साइन इन करें' },
  headline: {
    en: 'Share what you have. Find what you need.',
    es: 'Comparte lo que tienes. Encuentra lo que necesitas.',
    hi: 'जो है उसे बाँटें। जो चाहिए उसे पाएँ।',
  },
  body: {
    en: 'A pump set sitting idle, a roll of drip pipe left over, someone who can fix a tractor or stitch a blouse. Banyan helps them reach the neighbour, or the next town over, that needs them.',
    es: 'Una motobomba sin usar, un rollo de tubería de goteo que sobró, alguien que sabe arreglar un tractor o coser una blusa. Banyan los acerca al vecino, o al pueblo de al lado, que los necesita.',
    hi: 'बेकार पड़ा पंप सेट, बची हुई ड्रिप पाइप, कोई जो ट्रैक्टर ठीक कर सके या ब्लाउज़ सिल सके। बैनियन इन्हें उस पड़ोसी या पास के गाँव तक पहुँचाता है जिसे इनकी ज़रूरत है।',
  },
  start: { en: 'Get started', es: 'Empezar', hi: 'शुरू करें' },
  join: { en: 'Join', es: 'Unirse', hi: 'जुड़ें' },
  hint: {
    en: 'Made for slow connections: text first, photos only when you tap.',
    es: 'Hecho para conexiones lentas: primero el texto, fotos solo si las tocas.',
    hi: 'धीमे कनेक्शन के लिए बना: पहले टेक्स्ट, फ़ोटो सिर्फ़ टैप करने पर।',
  },
} as const

export type CopyKey = keyof typeof LANDING_COPY
export type ScrambleLang = 'en' | 'es' | 'hi'
export const SCRAMBLE_LANGS: ScrambleLang[] = ['en', 'es', 'hi']
