import { sourceText } from '../source-en.js';
import type { Locale } from '../registry.js';
import type { I18nParams } from '../types.js';

/**
 * Current path for screens that use Chinese source text as a display key.
 * New UI must use semantic message keys through `t()` instead.
 */
export function translateSourceUi(source: string, locale: Locale, params: I18nParams = {}) {
  return sourceText(source, locale, params);
}
