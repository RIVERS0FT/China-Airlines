import { enUS } from './locales/en-US.js';
import { zhCN, type MessageKey } from './locales/zh-CN.js';
import type { LocaleBundle } from './types.js';

export const localeRegistry = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const;

export type Locale = keyof typeof localeRegistry;
export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const SUPPORTED_LOCALES = Object.keys(localeRegistry) as Locale[];

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && Object.prototype.hasOwnProperty.call(localeRegistry, value));
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeBundle(locale: Locale): LocaleBundle<Record<MessageKey, string>> {
  return localeRegistry[locale];
}
