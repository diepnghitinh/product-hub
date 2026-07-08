import { en, type I18nKey } from './en';

const dict = en;

/** Translate a key to the current locale's string (falls back to the key). */
export function t(key: I18nKey): string {
  return dict[key] ?? key;
}
