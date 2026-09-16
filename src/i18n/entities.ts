import { localeBundle, SUPPORTED_LOCALES, type Locale } from './registry.js';

export function airportNameForLocale(locale: Locale, id: string, fallback: string) {
  return localeBundle(locale).entities?.airports?.[id]?.name ?? fallback;
}

export function airportRegionForLocale(locale: Locale, id: string, fallback: string) {
  return localeBundle(locale).entities?.airports?.[id]?.region ?? fallback;
}

export function aircraftNameForLocale(locale: Locale, id: string, fallback: string) {
  return localeBundle(locale).entities?.aircraft?.[id]?.name ?? fallback;
}

export function aircraftRoleForLocale(locale: Locale, id: string, fallback: string) {
  return localeBundle(locale).entities?.aircraft?.[id]?.role ?? fallback;
}

export function continentNameForLocale(locale: Locale, value: string) {
  return localeBundle(locale).entities?.continents?.[value] ?? value;
}

export function airportSearchAliases(id: string) {
  const aliases = new Set<string>();
  for (const locale of SUPPORTED_LOCALES) {
    const entry = localeBundle(locale).entities?.airports?.[id];
    if (!entry) continue;
    aliases.add(entry.name);
    if (entry.region) aliases.add(entry.region);
    for (const alias of entry.aliases ?? []) aliases.add(alias);
  }
  return [...aliases].join(' ');
}
