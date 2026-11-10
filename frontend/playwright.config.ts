import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  testDir: './tests/browser',
  outputDir: process.env.UI_TEST_OUTPUT ?? join(tmpdir(), 'evidence-desk-ui-browser-tests'),
  timeout: 30_000,
  globalTimeout: process.env.UI_VISUAL_HOLD ? 360_000 : 120_000,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5187/ui-assets/',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      executablePath: process.env.UI_TEST_CHROMIUM_EXECUTABLE,
      args: process.env.UI_TEST_CDP_PORT ? [`--remote-debugging-port=${process.env.UI_TEST_CDP_PORT}`] : [],
    },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5187 --strictPort',
    cwd: directory,
    url: 'http://127.0.0.1:5187/ui-assets/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
