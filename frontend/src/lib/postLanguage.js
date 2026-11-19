import { LANGUAGES } from '@/lib/languages';

// Language a new post is tagged with unless the creator picks one: their first preferred content
// language, else their display language, else English. Always a code the backend accepts.
export function defaultPostLanguage(contentLanguages, displayLanguage) {
  const valid = (c) => LANGUAGES.some((l) => l.code === c);
  const first = Array.isArray(contentLanguages) ? contentLanguages.find(valid) : null;
  return first || (valid(displayLanguage) ? displayLanguage : 'en');
}
