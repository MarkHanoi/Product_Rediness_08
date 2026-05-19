// S70 D1+D5 — Browser matrix config shape test per ADR-0052 §B.1.
//
// The actual e2e suite (smoke + axe + visual-regression) requires a
// real Playwright install + browser binaries that this dev container
// does not hold.  This vitest suite asserts the CONFIG SHAPE so we
// catch typos / missing projects without a browser.

import { describe, it, expect } from 'vitest';
import config from './playwright.config.js';

describe('browser-matrix config (ADR-0052 §B.1)', () => {
  it('declares exactly the 5 projects named in PHASE-3D §S70', () => {
    expect(config.projects.map(p => p.name)).toEqual([
      'chromium',
      'firefox',
      'webkit',
      'edge',
      'ipad-safari',
    ]);
  });

  it('chromium is the visual-diff reference (default viewport 1280×720)', () => {
    const c = config.projects.find(p => p.name === 'chromium')!;
    expect(c.use.browserName).toBe('chromium');
    expect(c.use.viewport).toEqual({ width: 1280, height: 720 });
  });

  it('edge runs on chromium engine with channel msedge', () => {
    const e = config.projects.find(p => p.name === 'edge')!;
    expect(e.use.browserName).toBe('chromium');
    expect((e.use as { channel?: string }).channel).toBe('msedge');
  });

  it('ipad-safari uses WebKit + iPad Pro 11 viewport with touch', () => {
    const ip = config.projects.find(p => p.name === 'ipad-safari')!;
    expect(ip.use.browserName).toBe('webkit');
    expect(ip.use.viewport).toEqual({ width: 1180, height: 820 });
    expect((ip.use as { hasTouch?: boolean }).hasTouch).toBe(true);
  });

  it('uses retain-on-failure tracing + only-on-failure screenshots', () => {
    expect(config.use.trace).toBe('retain-on-failure');
    expect(config.use.screenshot).toBe('only-on-failure');
  });
});
