import { legacyText } from '../legacy-en.js';
import type { Locale } from '../registry.js';
import type { I18nParams } from '../types.js';

/**
 * Compatibility path for screens that still use Chinese source text as a key.
 * New UI must use semantic message keys through `t()` instead.
 */
export function translateLegacyUi(source: string, locale: Locale, params: I18nParams = {}) {
  return legacyText(source, locale, params);
}
