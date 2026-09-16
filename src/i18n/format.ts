import type { MessageKey } from './locales/zh-CN.js';
import { localeBundle, type Locale } from './registry.js';
import type { I18nParams } from './types.js';

export function interpolate(template: string, params: I18nParams = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function translateMessage(locale: Locale, key: MessageKey, params: I18nParams = {}) {
  return interpolate(localeBundle(locale).messages[key], params);
}

export function formatNumberForLocale(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatMoneyForLocale(value: number, locale: Locale) {
  return `¥ ${formatNumberForLocale(value, locale)}`;
}

export function formatDurationForLocale(value: number, locale: Locale) {
  const seconds = Math.max(0, Math.ceil(value));
  if (seconds >= 60) {
    return translateMessage(locale, 'common.minutesSeconds', {
      minutes: Math.floor(seconds / 60),
      seconds: String(seconds % 60).padStart(2, '0'),
    });
  }
  return translateMessage(locale, 'common.seconds', { count: seconds });
}
