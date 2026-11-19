// Languages offered in Settings → Language (same codes as backend/src/utils/languages.js).
// `native` is how the language names itself, so people can find theirs whatever the app is showing.
export const LANGUAGES = [
  { code: 'en', native: 'English', name: 'English' },
  { code: 'fr', native: 'Français', name: 'French' },
  { code: 'es', native: 'Español', name: 'Spanish' },
  { code: 'pt', native: 'Português', name: 'Portuguese' },
  { code: 'de', native: 'Deutsch', name: 'German' },
  { code: 'it', native: 'Italiano', name: 'Italian' },
  { code: 'ar', native: 'العربية', name: 'Arabic', rtl: true },
  { code: 'sw', native: 'Kiswahili', name: 'Swahili' },
  { code: 'ha', native: 'Hausa', name: 'Hausa' },
  { code: 'yo', native: 'Yorùbá', name: 'Yoruba' },
  { code: 'ig', native: 'Igbo', name: 'Igbo' },
  { code: 'tw', native: 'Twi', name: 'Twi' },
  { code: 'zu', native: 'isiZulu', name: 'Zulu' },
  { code: 'am', native: 'አማርኛ', name: 'Amharic' },
  { code: 'hi', native: 'हिन्दी', name: 'Hindi' },
  { code: 'bn', native: 'বাংলা', name: 'Bengali' },
  { code: 'ur', native: 'اردو', name: 'Urdu', rtl: true },
  { code: 'zh', native: '中文', name: 'Chinese' },
  { code: 'ja', native: '日本語', name: 'Japanese' },
  { code: 'ko', native: '한국어', name: 'Korean' },
  { code: 'id', native: 'Bahasa Indonesia', name: 'Indonesian' },
  { code: 'tr', native: 'Türkçe', name: 'Turkish' },
  { code: 'ru', native: 'Русский', name: 'Russian' },
  { code: 'nl', native: 'Nederlands', name: 'Dutch' },
  { code: 'pl', native: 'Polski', name: 'Polish' },
];
export const MAX_CONTENT_LANGUAGES = 10;
export const languageByCode = (code) => LANGUAGES.find((l) => l.code === code);
