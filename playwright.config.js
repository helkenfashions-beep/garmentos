import { defineConfig, devices } from '@playwright/test';

// Chromium is pre-installed in some environments; fall back to Playwright's own.
const executablePath = process.env.PW_CHROMIUM || undefined;
const launchOptions = {
  executablePath,
  // WebGL in headless Chromium via SwiftShader
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android-pixel7', use: { ...devices['Pixel 7'], launchOptions } },
    { name: 'android-landscape', use: { ...devices['Pixel 7 landscape'], launchOptions } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 860 }, launchOptions } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
