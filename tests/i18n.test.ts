import { describe, expect, it } from 'vitest';
import { airportNameForLocale, airportSearchAliases } from '../src/i18n/entities.js';
import { enUSMessages } from '../src/i18n/locales/en-US.js';
import { zhCNMessages, type MessageKey } from '../src/i18n/locales/zh-CN.js';
import { DEFAULT_LOCALE, localeBundle, resolveLocale, SUPPORTED_LOCALES } from '../src/i18n/registry.js';

function placeholders(value: string) {
  return [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
}

describe('i18n registry', () => {
  it('keeps every locale on the Chinese semantic message schema', () => {
    const expected = Object.keys(zhCNMessages).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(localeBundle(locale).messages).sort()).toEqual(expected);
    }
  });

  it('keeps interpolation placeholders compatible across locales', () => {
    for (const key of Object.keys(zhCNMessages) as MessageKey[]) {
      expect(placeholders(enUSMessages[key]), key).toEqual(placeholders(zhCNMessages[key]));
    }
  });

  it('falls back unsupported stored locales without special-case runtime branches', () => {
    expect(resolveLocale('en-US')).toBe('en-US');
    expect(resolveLocale('ja-JP')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it('reads entity names and search aliases from registered locale bundles', () => {
    expect(airportNameForLocale('en-US', 'NRT', '东京')).toBe('Tokyo');
    expect(airportNameForLocale('zh-CN', 'NRT', '东京')).toBe('东京');
    expect(airportSearchAliases('NRT')).toContain('Tokyo');
    expect(airportSearchAliases('NRT')).toContain('Japan');
  });
});
