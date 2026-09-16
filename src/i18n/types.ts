export type I18nParams = Record<string, string | number>;

export interface LocaleMeta {
  tag: string;
  nativeName: string;
  htmlLang: string;
  direction: 'ltr' | 'rtl';
  title: string;
  description: string;
}

export interface AirportLocaleEntry {
  name: string;
  region?: string;
  aliases?: readonly string[];
}

export interface AircraftLocaleEntry {
  name: string;
  role?: string;
  aliases?: readonly string[];
}

export interface LocaleEntities {
  airports?: Readonly<Record<string, AirportLocaleEntry>>;
  aircraft?: Readonly<Record<string, AircraftLocaleEntry>>;
  continents?: Readonly<Record<string, string>>;
}

export interface LocaleBundle<TMessages extends Readonly<Record<string, string>>> {
  meta: LocaleMeta;
  messages: TMessages;
  entities?: LocaleEntities;
}
