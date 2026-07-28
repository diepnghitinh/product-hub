import { en, type I18nKey } from './en';
import { ko } from './ko';

export type { I18nKey };

/** The locales the app ships. Adding one is a dictionary file plus a row here. */
export type Locale = 'en' | 'ko';

/**
 * `label` is written in its own language (a Korean reader looks for 한국어, not
 * "Korean"); `tag` is the BCP-47 tag dates and numbers are formatted with.
 */
export const LOCALES: { value: Locale; label: string; tag: string }[] = [
  { value: 'en', label: 'English', tag: 'en-US' },
  { value: 'ko', label: '한국어', tag: 'ko-KR' },
];

const DICTS: Record<Locale, Record<I18nKey, string>> = { en, ko };
const STORAGE_KEY = 'ph_locale';

const isLocale = (v: string | null): v is Locale =>
  !!v && LOCALES.some((l) => l.value === v);

/**
 * Saved choice → the browser's own language → English. The choice is per-browser
 * (like the sidebar's team order), not part of the account, so signing in on a
 * shared machine never changes anyone else's language.
 */
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* private mode / storage disabled — fall through to the browser's language */
  }
  const browser = navigator.language?.slice(0, 2);
  return LOCALES.find((l) => l.value === browser)?.value ?? 'en';
}

// Const on purpose: the language only ever changes by reloading the page, so
// within one page life these two are fixed.
const locale: Locale = initialLocale();
const dict = DICTS[locale];

export const getLocale = (): Locale => locale;

/** BCP-47 tag for `toLocaleDateString` / `Intl` — never pass `undefined`, or the
 *  dates follow the OS while the copy follows this setting. */
export const localeTag = (): string =>
  LOCALES.find((l) => l.value === locale)?.tag ?? 'en-US';

/**
 * Switch language. This reloads the page on purpose: fixed vocabularies
 * (`ROLE_LABEL`, `TASK_STATUS_LABEL`, …) are built once when their module loads,
 * so swapping the dictionary underneath them would leave half the UI in the old
 * language. A reload is one line and leaves nothing stale behind.
 */
export function setLocale(next: Locale): void {
  if (next === locale) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* can't persist — the reload below would just undo the change, so bail */
    return;
  }
  window.location.reload();
}

/** Translate a key to the current locale (falls back to English, then the key). */
export function t(key: I18nKey): string {
  return dict[key] ?? en[key] ?? key;
}

// Screen readers and the browser's own spell-check / translation prompts read
// this, so it has to follow the chosen language rather than the served HTML.
if (typeof document !== 'undefined') document.documentElement.lang = locale;
