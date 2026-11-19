// Languages offered in Settings → Language. Codes are ISO 639-1 (plus a region where it matters).
// Keep in sync with frontend/src/lib/languages.js.
export const LANGUAGES = [
  'en', 'fr', 'es', 'pt', 'de', 'it', 'ar', 'sw', 'ha', 'yo', 'ig', 'tw', 'zu', 'am',
  'hi', 'bn', 'ur', 'zh', 'ja', 'ko', 'id', 'tr', 'ru', 'nl', 'pl',
];
export const MAX_CONTENT_LANGUAGES = 10;
export const isLanguage = (c) => typeof c === 'string' && LANGUAGES.includes(c);

export const LANGUAGE_NAMES = {
  en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese', de: 'German', it: 'Italian', ar: 'Arabic',
  sw: 'Swahili', ha: 'Hausa', yo: 'Yoruba', ig: 'Igbo', tw: 'Twi (Akan)', zu: 'Zulu', am: 'Amharic',
  hi: 'Hindi', bn: 'Bengali', ur: 'Urdu', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', id: 'Indonesian',
  tr: 'Turkish', ru: 'Russian', nl: 'Dutch', pl: 'Polish',
};
