import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import deployment from './deploy/targets.json' with { type: 'json' };

export default defineConfig({
  ...base,
  testMatch: ['**/flows/new-company.spec.ts', '**/functional/game.spec.ts', '**/presentation/start-map-i18n.spec.ts'],
  webServer: undefined,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser-production.json' }], ['html', { open: 'never' }]],
  use: { ...base.use, baseURL: process.env.PLAYWRIGHT_BASE_URL || deployment.publicUrl },
});
