// PRYZM 2 — Browser matrix Playwright config (S70 D1+D5, ADR-0052 §B.1).
//
// 5 projects per the phase doc:
//   - chromium     (reference for visual-diff)
//   - firefox      (S70 D2 surface)
//   - webkit       (S70 D3 — Safari proxy)
//   - edge         (S70 D4 — chromium channel: msedge)
//   - ipad-safari  (S70 D5 — iPad Pro 11 viewport on WebKit)
//
// The config is intentionally written without importing
// `@playwright/test` so the file is parseable + lintable in CI even
// before the optional Playwright dep is installed.  When Playwright
// IS installed, `playwright.config.ts` is loaded normally; when not,
// the shape tests in `config-shape.test.ts` validate it as a plain
// JS object and the e2e scripts are operator-side only.

const TIMEOUT_MS = 30_000;
const VIEWPORT_DEFAULT = { width: 1280, height: 720 };
const VIEWPORT_IPAD_PRO_11 = { width: 1180, height: 820 };

export const config = {
  testDir: './tests',
  timeout: TIMEOUT_MS,
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PRYZM_BASE_URL ?? 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: VIEWPORT_DEFAULT },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox', viewport: VIEWPORT_DEFAULT },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit', viewport: VIEWPORT_DEFAULT },
    },
    {
      name: 'edge',
      use: { browserName: 'chromium', channel: 'msedge', viewport: VIEWPORT_DEFAULT },
    },
    {
      name: 'ipad-safari',
      use: {
        browserName: 'webkit',
        viewport: VIEWPORT_IPAD_PRO_11,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
} as const;

export default config;
