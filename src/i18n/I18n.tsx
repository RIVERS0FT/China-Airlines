import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translateCoreText } from './compat/core-text.js';
import { translateLegacyUi } from './compat/legacy-ui.js';
import {
  aircraftNameForLocale,
  aircraftRoleForLocale,
  airportNameForLocale,
  airportRegionForLocale,
  airportSearchAliases as searchAliases,
  continentNameForLocale,
} from './entities.js';
import {
  formatDurationForLocale,
  formatMoneyForLocale,
  formatNumberForLocale,
  translateMessage,
} from './format.js';
import { DEFAULT_LOCALE, localeBundle, localeRegistry, resolveLocale, SUPPORTED_LOCALES, type Locale } from './registry.js';
import type { MessageKey } from './locales/zh-CN.js';
import type { I18nParams } from './types.js';

export type { Locale } from './registry.js';
export type { MessageKey } from './locales/zh-CN.js';
export { localeRegistry, SUPPORTED_LOCALES } from './registry.js';

export const LOCALE_KEY = 'china-airlines:locale:v1';

function savedLocale(): Locale {
  try { return resolveLocale(localStorage.getItem(LOCALE_KEY)); }
  catch { return DEFAULT_LOCALE; }
}

let activeLocale: Locale = savedLocale();

export function currentLocale() { return activeLocale; }
export function formatNumber(value: number, locale: Locale = activeLocale) { return formatNumberForLocale(value, locale); }
export function formatMoney(value: number, locale: Locale = activeLocale) { return formatMoneyForLocale(value, locale); }
export function formatDuration(value: number, locale: Locale = activeLocale) { return formatDurationForLocale(value, locale); }
export function airportSearchAliases(id: string) { return searchAliases(id); }
export function translateDomainText(value: string | null | undefined, locale: Locale = activeLocale) { return translateCoreText(value, locale); }

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: I18nParams) => string;
  money: (value: number) => string;
  number: (value: number) => string;
  duration: (seconds: number) => string;
  airportName: (id: string, fallback: string) => string;
  airportRegion: (id: string, fallback: string) => string;
  modelName: (id: string, fallback: string) => string;
  modelRole: (id: string, fallback: string) => string;
  continentName: (value: string) => string;
  text: (value: string | null | undefined) => string;
  ui: (source: string, params?: I18nParams) => string;
}

const Context = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrent] = useState<Locale>(savedLocale);
  activeLocale = locale;

  const setLocale = (next: Locale) => {
    setCurrent(next);
    try { localStorage.setItem(LOCALE_KEY, next); }
    catch { /* The choice still applies to this session. */ }
  };

  useEffect(() => {
    const meta = localeBundle(locale).meta;
    document.documentElement.lang = meta.htmlLang;
    document.documentElement.dir = meta.direction;
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key, params) => translateMessage(locale, key, params),
    number: n => formatNumberForLocale(n, locale),
    money: n => formatMoneyForLocale(n, locale),
    duration: seconds => formatDurationForLocale(seconds, locale),
    airportName: (id, fallback) => airportNameForLocale(locale, id, fallback),
    airportRegion: (id, fallback) => airportRegionForLocale(locale, id, fallback),
    modelName: (id, fallback) => aircraftNameForLocale(locale, id, fallback),
    modelRole: (id, fallback) => aircraftRoleForLocale(locale, id, fallback),
    continentName: source => continentNameForLocale(locale, source),
    text: source => translateCoreText(source, locale),
    ui: (source, params) => translateLegacyUi(source, locale, params),
  }), [locale]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error('I18nProvider is required');
  return value;
}

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return <div className={`language-picker ${compact ? 'is-compact' : ''}`} role="group" aria-label={t('locale.label')}>
    {SUPPORTED_LOCALES.map(code => <button
      key={code}
      type="button"
      aria-pressed={locale === code}
      onClick={() => setLocale(code)}
    >{localeRegistry[code].meta.nativeName}</button>)}
  </div>;
}
