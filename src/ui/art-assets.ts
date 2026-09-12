/** Versioned local assets; BASE_URL supports both root and Pages subpath builds. */
export const artAsset = (file: string) => `${import.meta.env.BASE_URL}art/${file}`;

export const BUTTON_ART: Readonly<Record<string, string>> = {
  airport: 'icon-airport-v1.png', map: 'icon-map-v1.png', directory: 'icon-directory-v1.png',
  fleet: 'icon-plane-v1.png', plane: 'icon-plane-v1.png', shop: 'icon-shop-v1.png', task: 'icon-task-v1.png',
  coin: 'icon-coin-v1.png', trophy: 'icon-trophy-v1.png', save: 'icon-save-v1.png', help: 'icon-help-v1.png',
  maintenance: 'icon-maintenance-v1.png', energy: 'icon-energy-v1.png', pilot: 'pilot-avatar-v1.png',
};
