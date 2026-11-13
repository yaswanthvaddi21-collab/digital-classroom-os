/**
 * Document language. Stored in the document content's `language` field (a BCP 47 tag such as "en-GB"); the editor
 * puts it on the text as the `lang` attribute, which the browser's spell checker follows where the browser
 * supports it, and DOCX export writes it as the default proofing language (w:lang).
 * No imports from types.ts, so types.ts can register the field's check.
 */
export const DOCUMENT_LANGUAGES: ReadonlyArray<{ tag: string; label: string }> = [
  { tag: 'en-US', label: 'English (United States)' },
  { tag: 'en-GB', label: 'English (United Kingdom)' },
  { tag: 'en-IN', label: 'English (India)' },
  { tag: 'en-AU', label: 'English (Australia)' },
  { tag: 'en-CA', label: 'English (Canada)' },
  { tag: 'fr-FR', label: 'French' },
  { tag: 'de-DE', label: 'German' },
  { tag: 'es-ES', label: 'Spanish (Spain)' },
  { tag: 'es-MX', label: 'Spanish (Mexico)' },
  { tag: 'it-IT', label: 'Italian' },
  { tag: 'pt-BR', label: 'Portuguese (Brazil)' },
  { tag: 'pt-PT', label: 'Portuguese (Portugal)' },
  { tag: 'nl-NL', label: 'Dutch' },
  { tag: 'hi-IN', label: 'Hindi' },
  { tag: 'te-IN', label: 'Telugu' },
  { tag: 'ta-IN', label: 'Tamil' },
  { tag: 'bn-IN', label: 'Bengali' },
  { tag: 'zh-CN', label: 'Chinese (Simplified)' },
  { tag: 'ja-JP', label: 'Japanese' },
  { tag: 'ko-KR', label: 'Korean' },
  { tag: 'ar-SA', label: 'Arabic' },
  { tag: 'ru-RU', label: 'Russian' },
];

/** A language tag: letters, then subtags of letters or digits (BCP 47 shape; not checked against a registry). */
const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;

export const isLanguageTag = (v: unknown): v is string => typeof v === 'string' && TAG.test(v);

/** Checks a stored `language` field (CONTENT_FIELDS). Any well-formed tag is kept, even one the menu does not list. */
export function languageProblem(value: unknown): string | null {
  return value === null || isLanguageTag(value) ? null : `the document language ${JSON.stringify(value)} is not a language tag`;
}

export function languageLabel(tag: string | null | undefined): string {
  if (!tag) return 'Not set';
  return DOCUMENT_LANGUAGES.find((l) => l.tag.toLowerCase() === tag.toLowerCase())?.label ?? tag;
}
