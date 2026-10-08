import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const publicURL = process.env.PLAYWRIGHT_BASE_URL;
if (!publicURL) throw new Error('PLAYWRIGHT_BASE_URL must come from the platform publication result.');

export default defineConfig({
  ...base,
  testMatch: ['**/flows/company-identity.spec.ts', '**/flows/new-company.spec.ts', '**/functional/game.spec.ts', '**/functional/paused-game.spec.ts', '**/presentation/start-map-i18n.spec.ts'],
  webServer: undefined,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser-production.json' }], ['html', { open: 'never' }]],
  use: { ...base.use, baseURL: publicURL },
});
