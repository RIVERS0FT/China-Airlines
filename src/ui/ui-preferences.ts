import { create } from 'zustand';

export const UI_SCALE_KEY = 'china-airlines.ui-scale.v1';
export const UI_SCALE_MIN = .75;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_STEP = .05;
export const DEFAULT_UI_SCALE = 1;

/** Store only a bounded display preference, never a GameState or a command. */
export function normalizeUiScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_UI_SCALE;
  return Math.round(Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, value)) * 20) / 20;
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
interface UiPreferences {
  uiScale: number;
  persisted: boolean;
  setUiScale: (scale: number) => void;
}

/** An injectable store keeps corrupt/blocked storage testable without a browser. */
export function createUiPreferences(storage: PreferenceStorage) {
  let initial = DEFAULT_UI_SCALE, persisted = true;
  try {
    const raw = storage.getItem(UI_SCALE_KEY);
    if (raw !== null) initial = normalizeUiScale(JSON.parse(raw) as unknown);
  } catch { persisted = false; }
  return create<UiPreferences>(set => ({
    uiScale: initial, persisted,
    setUiScale(value) {
      const uiScale = normalizeUiScale(value);
      let saved = true;
      try { storage.setItem(UI_SCALE_KEY, JSON.stringify(uiScale)); }
      catch { saved = false; }
      // Private mode/storage failure must not prevent adjustment in this session.
      set({ uiScale, persisted: saved });
    },
  }));
}

export const useUiPreferences = createUiPreferences({
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
