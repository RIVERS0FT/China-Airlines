import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0, failOnFlakyTests: true,
  reporter: [['list'], ['json', { outputFile: process.env.BASE_PATH ? 'artifacts/browser-subpath.json' : 'artifacts/browser-root.json' }], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:4173${process.env.BASE_PATH || '/'}`, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    // Software WebGL only, rather than replacing Chromium's whole GLES driver.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader-webgl'] } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: 'npm run preview -- --port 4173', url: `http://127.0.0.1:4173${process.env.BASE_PATH || '/'}`, reuseExistingServer: !process.env.CI }
});
