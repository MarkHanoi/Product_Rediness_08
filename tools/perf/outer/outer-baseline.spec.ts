// tools/perf/outer/outer-baseline.spec.ts — LANE BASE-OUTER (2026-09-02)
//
// Axes C (project creation) + D (project startup/load) measured AT THE BROWSER
// LAYER: real Chromium, production build, per [[committed-is-not-reachable]] —
// prove at the layer the user experiences, never a pure function return.
//
// Targets (env-selected):
//   PERF_LIVE_URL   (default https://pryzm.fly.dev) — anonymous shell-load only;
//                   production auth (§BETA-ACCESS-GATE, 4 hardcoded addresses +
//                   per-request re-check) makes the authed editor UNDRIVABLE by a
//                   throwaway session on live — see findings-outer.md F1/F2.
//   PERF_LOCAL_URL  (e.g. http://localhost:5000) — a LOCAL PRODUCTION build:
//                   `vite build` output served by `tsx server.js` with dist/
//                   present (isProd static path — NO Vite dev middleware) and an
//                   in-memory store. Enables the authed C + D tests.
//   PERF_TOKEN      Bearer JWT for the local target (mint with the local
//                   SESSION_SECRET; the email claim must pass isBetaAllowed —
//                   see run-outer-local.mjs which does all of this).
//   PERF_RUNS       runs per cell (default 5).
//   PERF_OUT        merged results JSON (default audit/perf/2026-09-02/baseline-outer.json).
//
// Instrumentation used (all PRE-EXISTING in the product — grep'd before adding
// anything): [§STARTUP-BUDGET] phase lines (apps/editor/src/engine/startupBudget.ts),
// §LOAD-PHASE / §PERF-L03-PHASE loader phases (ProjectLoader.ts, enabled via
// globalThis.__pryzmPerfTrace), performance paint entries, window.wallStore.
//
// Falsification arms (a harness must FAIL when its subject is broken):
//   • "D falsification" opens a BOGUS project id and asserts the measurement
//     helper REFUSES (reports failure) instead of recording a fast number.
//   • cold vs warm medians must differ in the sane direction (cold ≥ warm) —
//     asserted in the shell test.
//
// Reproduce:
//   npx playwright test --config tools/perf/outer/playwright.outer.config.ts
//   (for the local cells, first: node tools/perf/outer/run-outer-local.mjs)

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const LIVE = process.env['PERF_LIVE_URL'] ?? 'https://pryzm.fly.dev';
const LOCAL = process.env['PERF_LOCAL_URL'] ?? null;
const TOKEN = process.env['PERF_TOKEN'] ?? null;
const RUNS = parseInt(process.env['PERF_RUNS'] ?? '5', 10);
const OUT = process.env['PERF_OUT'] ?? resolve(repoRoot, 'audit/perf/2026-09-02/baseline-outer.json');

// ── result sink: merge-write so live and local runs accumulate ───────────────
function writeResult(key: string, value: unknown): void {
  mkdirSync(dirname(OUT), { recursive: true });
  let cur: Record<string, unknown> = {};
  try { cur = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* first write */ }
  cur[key] = value;
  cur['_meta'] = {
    lane: 'BASE-OUTER', when: new Date().toISOString(), runsPerCell: RUNS,
    env: { platform: process.platform, node: process.version },
    reproduce: 'npx playwright test --config tools/perf/outer/playwright.outer.config.ts (local cells need run-outer-local.mjs first)',
  };
  writeFileSync(OUT, JSON.stringify(cur, null, 2) + '\n');
}

const stats = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!;
  return { n: s.length, min: +s[0]!.toFixed(0), median: +q(0.5).toFixed(0), p95: +q(0.95).toFixed(0), max: +s[s.length - 1]!.toFixed(0) };
};
const colStats = (rows: Record<string, number>[], k: string) => stats(rows.map(r => r[k]!).filter(v => Number.isFinite(v)));

// ── authed-session injection (local target) ──────────────────────────────────
// The client trusts localStorage 'bim-platform-user' for routing (AuthModal.getCurrentUser)
// and sends 'bim-platform-token' as the Bearer. Both are the product's own keys.
async function newSessionContext(browser: Browser, opts: { token?: string | null; reopenProject?: { id: string; name: string } | null }): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(([token, reopen]) => {
    try {
      localStorage.setItem('bim-platform-user', JSON.stringify({
        id: 'user-perf-outer', email: 'perf@localhost', name: 'Perf Outer',
        createdAt: Date.now(), plan: 'free', planStatus: 'active',
      }));
      if (token) localStorage.setItem('bim-platform-token', token as string);
      if (reopen) {
        const r = reopen as { id: string; name: string };
        sessionStorage.setItem('pryzm.reopenProjectAfterReload', '1');
        sessionStorage.setItem('pryzm.lastOpenProject', JSON.stringify({ projectId: r.id, projectName: r.name }));
      }
      (globalThis as Record<string, unknown>)['__pryzmPerfTrace'] = true; // §PERF-L03-PHASE gate
    } catch { /* storage unavailable — the run will fail loudly downstream */ }
  }, [opts.token ?? null, opts.reopenProject ?? null] as const);
  return ctx;
}

interface OpenMeasurement {
  ok: boolean;
  failure?: string;
  navMs?: number; firstPaintMs?: number; canvasVisibleMs?: number;
  sceneLoadedMs?: number; interactiveMs?: number; wallCount?: number;
  startupBudget?: Record<string, number>;
  loaderPhases?: string[];
}

// Measures ONE project open via the product's own reopen deep-link
// (PlatformRouter._tryReopenProjectAfterReload → launchWorkspace — launchWorkspace
// is "the ONE gesture every project open passes through").
// REFUSES (ok:false) when the editor does not actually reach the expected scene:
// that is the falsification contract — a broken subject must fail the harness.
async function measureOpen(page: Page, base: string, expectWalls: number, timeoutMs = 120_000): Promise<OpenMeasurement> {
  const logs: string[] = [];
  page.on('console', m => { const t = m.text(); if (t.includes('§STARTUP-BUDGET') || t.includes('LOAD-PHASE') || t.includes('PERF-L03') || t.includes('ProjectLoader') || t.includes('openProject failed')) logs.push(t); });
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const navMs = Date.now() - t0;

  let canvasVisibleMs: number | undefined;
  try {
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: timeoutMs });
    canvasVisibleMs = Date.now() - t0;
  } catch {
    return { ok: false, failure: `no canvas within ${timeoutMs}ms; logs=${logs.slice(-4).join(' | ')}` };
  }

  // Scene loaded = the wall store holds every seeded wall.
  let sceneLoadedMs: number | undefined; let wallCount = -1;
  const deadline = t0 + timeoutMs;
  while (Date.now() < deadline) {
    wallCount = await page.evaluate(() => {
      try { return (window as unknown as { wallStore?: { getAll?: () => unknown[] } }).wallStore?.getAll?.().length ?? -1; } catch { return -2; }
    });
    if (wallCount >= expectWalls) { sceneLoadedMs = Date.now() - t0; break; }
    await page.waitForTimeout(250);
  }
  if (sceneLoadedMs === undefined) {
    return { ok: false, failure: `wallStore reached ${wallCount}/${expectWalls} before timeout; logs=${logs.slice(-4).join(' | ')}` };
  }

  // Interactive = loading overlay gone AND a double-rAF settles (main thread yields).
  try {
    await page.locator('#pryzm-engine-loading-overlay').waitFor({ state: 'hidden', timeout: 60_000 });
  } catch {
    return { ok: false, failure: 'engine loading overlay never dismissed' };
  }
  // eslint-disable-next-line pryzm/no-raf -- NOT a product rAF. This arrow is
  // SERIALISED BY PLAYWRIGHT and executed inside the driven Chromium page, so it
  // never enters the PRYZM bundle; it is the standard double-rAF "the main thread
  // yielded" probe the measurement is FOR. `tools/ga-gate/check-raf-count.ts` — the
  // P3 authority — already excludes this file and still reads exactly 1 owner.
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const interactiveMs = Date.now() - t0;

  const firstPaintMs = await page.evaluate(() => {
    const e = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
    return e ? Math.round(e.startTime) : undefined;
  });

  // Parse the product's own §STARTUP-BUDGET lines: "[§STARTUP-BUDGET] <phase> +Xms (t+Yms)"
  const startupBudget: Record<string, number> = {};
  for (const l of logs) {
    const m = /\[§STARTUP-BUDGET\]\s+(.+?)\s+\+([\d.]+)ms\s+\(t\+([\d.]+)ms\)/.exec(l);
    if (m) startupBudget[m[1]!] = parseFloat(m[3]!);
  }
  return {
    ok: true, navMs, firstPaintMs, canvasVisibleMs, sceneLoadedMs, interactiveMs, wallCount,
    startupBudget, loaderPhases: logs.filter(l => l.includes('LOAD-PHASE') || l.includes('PERF-L03')).slice(0, 40),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// LIVE target — anonymous app-shell load (the only surface live auth permits).
// ═════════════════════════════════════════════════════════════════════════════
test('live shell: cold vs warm load (anonymous)', async ({ browser }) => {
  test.setTimeout(600_000);
  const cold: Record<string, number>[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext(); // fresh context = empty cache = COLD
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(LIVE + '/', { waitUntil: 'domcontentloaded' });
    const domMs = Date.now() - t0;
    await page.locator('text=Log in').first().waitFor({ state: 'visible', timeout: 60_000 });
    const interactiveMs = Date.now() - t0;
    const fcp = await page.evaluate(() => {
      const e = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
      return e ? Math.round(e.startTime) : NaN;
    });
    cold.push({ domMs, fcpMs: fcp, interactiveMs });
    await ctx.close();
  }
  // WARM: one context, first navigation primes the cache, then RUNS reloads measured.
  const warmCtx = await browser.newContext();
  const warmPage = await warmCtx.newPage();
  await warmPage.goto(LIVE + '/', { waitUntil: 'load' });
  const warm: Record<string, number>[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    await warmPage.goto(LIVE + '/', { waitUntil: 'domcontentloaded' });
    const domMs = Date.now() - t0;
    await warmPage.locator('text=Log in').first().waitFor({ state: 'visible', timeout: 60_000 });
    const interactiveMs = Date.now() - t0;
    const fcp = await warmPage.evaluate(() => {
      const e = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
      return e ? Math.round(e.startTime) : NaN;
    });
    warm.push({ domMs, fcpMs: fcp, interactiveMs });
  }
  await warmCtx.close();
  const result = {
    target: LIVE, note: 'anonymous landing/app-shell — live auth gate blocks the authed editor (findings F1/F2)',
    cold: { domContentLoaded: colStats(cold, 'domMs'), firstContentfulPaint: colStats(cold, 'fcpMs'), interactive: colStats(cold, 'interactiveMs') },
    warm: { domContentLoaded: colStats(warm, 'domMs'), firstContentfulPaint: colStats(warm, 'fcpMs'), interactive: colStats(warm, 'interactiveMs') },
  };
  writeResult('live-shell', result);
  // Falsification direction check: a caching layer that made cold FASTER than
  // warm would mean the harness measures nothing real.
  expect(result.cold.interactive.median).toBeGreaterThanOrEqual(result.warm.interactive.median * 0.8);
});

// ═════════════════════════════════════════════════════════════════════════════
// LOCAL PROD target — axis C (primary): the REAL UI creation flow.
// Hub "+ New Project" (#ph-new-btn → startGuidedOnboardingDirect) → onboarding
// "Skip — no location" (§UX1-SKIP-TO-CANVAS) → "Open the canvas →" → editor.
// The project is created by the flow itself (POST /api/v1/projects, timed off
// the network events); "click-to-usable" is measured from the user's LAST
// gesture ("Open the canvas →") to a usable editor.
// ═════════════════════════════════════════════════════════════════════════════
test('axis C: real-UI creation flow — click to usable editor (local prod)', async ({ browser }) => {
  test.skip(!LOCAL || !TOKEN, 'needs PERF_LOCAL_URL + PERF_TOKEN (run tools/perf/outer/run-outer-local.mjs)');
  test.setTimeout(600_000);
  const rows: Record<string, number>[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await newSessionContext(browser, { token: TOKEN });
    const page = await ctx.newPage();
    // API-leg observer: the flow's own POST /api/v1/projects, wall-clock.
    let apiStart = 0; let apiMs = NaN;
    page.on('request', req => { if (req.method() === 'POST' && req.url().includes('/api/v1/projects')) apiStart = Date.now(); });
    page.on('requestfinished', req => { if (req.method() === 'POST' && req.url().includes('/api/v1/projects') && apiStart) apiMs = Date.now() - apiStart; });

    await page.goto(LOCAL + '/', { waitUntil: 'domcontentloaded' });
    await page.locator('#ph-new-btn, #ph-card-new').first().waitFor({ state: 'visible', timeout: 60_000 });
    const tNew = Date.now();
    await page.locator('#ph-new-btn, #ph-card-new').first().click();
    await page.locator('[data-testid="onboarding-location-skip"]').waitFor({ state: 'visible', timeout: 60_000 });
    const onboardingShownMs = Date.now() - tNew;
    await page.locator('[data-testid="onboarding-location-skip"]').click();
    await page.locator('[data-testid="onboarding-name-continue"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-testid="onboarding-project-name"]').fill(`perf-axisC-ui-${Date.now()}-${i}`);
    const tContinue = Date.now();
    await page.locator('[data-testid="onboarding-name-continue"]').click();
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 120_000 });
    const canvasMs = Date.now() - tContinue;
    await page.locator('#pryzm-engine-loading-overlay').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => { /* overlay may never mount on this path */ });
    // eslint-disable-next-line pryzm/no-raf -- NOT a product rAF. This arrow is
    // SERIALISED BY PLAYWRIGHT and executed inside the driven Chromium page, so it
    // never enters the PRYZM bundle; it is the standard double-rAF "the main thread
    // yielded" probe the measurement is FOR. `tools/ga-gate/check-raf-count.ts` — the
    // P3 authority — already excludes this file and still reads exactly 1 owner.
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const usableMs = Date.now() - tContinue;
    const totalMs = Date.now() - tNew;
    rows.push({ onboardingShownMs, apiMs, canvasMs, usableMs, totalMs });
    // cleanup the project this flow created
    const pid = await page.evaluate(() => (window as unknown as { currentProjectId?: string }).currentProjectId ?? null);
    if (pid) await fetch(`${LOCAL}/api/projects/${pid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } }).catch(() => { /* best effort */ });
    await ctx.close();
  }
  writeResult('axisC-local-realUI', {
    target: LOCAL,
    note: 'Real UI: +New Project → Skip—no location → Open the canvas →. apiLeg = the flow\'s own POST /api/v1/projects (in-memory store — add live-api create ~34ms median for a WAN+DB estimate). clickToUsable = continue-click → canvas + overlay gone + double-rAF.',
    hubToOnboarding: colStats(rows, 'onboardingShownMs'),
    apiLeg: colStats(rows, 'apiMs'),
    continueToCanvas: colStats(rows, 'canvasMs'),
    clickToUsable: colStats(rows, 'usableMs'),
    newProjectToUsableTotal: colStats(rows, 'totalMs'),
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LOCAL PROD target — axis C (decomposed control): API leg vs hydrate leg,
// scripted composite (same calls the UI makes, without UI think-time).
// ═════════════════════════════════════════════════════════════════════════════
test('axis C: project creation — API time vs client hydrate (local prod)', async ({ browser }) => {
  test.skip(!LOCAL || !TOKEN, 'needs PERF_LOCAL_URL + PERF_TOKEN (run tools/perf/outer/run-outer-local.mjs)');
  test.setTimeout(600_000);
  const rows: Record<string, number>[] = [];
  const createdIds: string[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await newSessionContext(browser, { token: TOKEN });
    const page = await ctx.newPage();
    await page.goto(LOCAL + '/', { waitUntil: 'domcontentloaded' });
    // Hub must be up (authed route) before the gesture starts.
    await page.locator('#ph-new-btn, #ph-card-new').first().waitFor({ state: 'visible', timeout: 60_000 });

    // API leg — the same call the UI's blank-create makes
    // (ProjectHub._createViaRuntime → runtime.persistence.client.create →
    // POST /api/v1/projects), timed from the page for browser-real latency.
    const apiLeg = await page.evaluate(async ([token, name]) => {
      const t0 = performance.now();
      const r = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      // v1 responds { ok: true, data: row } (server/api/v1/routes.js ok()); the
      // other shapes are legacy-route fallbacks so the leg survives a surface swap.
      const body = await r.json().catch(() => null) as { data?: { id?: string }; project?: { id?: string }; id?: string } | null;
      const id = body?.data?.id ?? body?.project?.id ?? body?.id ?? null;
      return { ms: performance.now() - t0, status: r.status, id };
    }, [TOKEN, `perf-axisC-${Date.now()}-${i}`] as const);
    expect(apiLeg.status, `v1 create must succeed (got ${apiLeg.status})`).toBeLessThan(300);
    expect(apiLeg.id, 'v1 create must return a project id').toBeTruthy();
    createdIds.push(apiLeg.id!);

    // Hydrate leg — open the fresh (empty) project via the canonical open
    // gesture (pryzm-open-project → launchWorkspace) and wait for a usable
    // editor: canvas visible + engine loading overlay dismissed + double-rAF.
    const t0 = Date.now();
    await page.evaluate(([id]) => {
      window.dispatchEvent(new CustomEvent('pryzm-open-project', { detail: { id, name: 'perf-axisC' } }));
    }, [apiLeg.id] as const);
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 120_000 });
    const canvasMs = Date.now() - t0;
    await page.locator('#pryzm-engine-loading-overlay').waitFor({ state: 'hidden', timeout: 120_000 });
    // eslint-disable-next-line pryzm/no-raf -- NOT a product rAF. This arrow is
    // SERIALISED BY PLAYWRIGHT and executed inside the driven Chromium page, so it
    // never enters the PRYZM bundle; it is the standard double-rAF "the main thread
    // yielded" probe the measurement is FOR. `tools/ga-gate/check-raf-count.ts` — the
    // P3 authority — already excludes this file and still reads exactly 1 owner.
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const usableMs = Date.now() - t0;
    rows.push({ apiMs: apiLeg.ms, canvasMs, usableMs, clickToUsableMs: apiLeg.ms + usableMs });
    await ctx.close();
  }
  // cleanup — the local store is in-memory, but leave nothing behind anyway
  for (const id of createdIds) {
    await fetch(`${LOCAL}/api/projects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } }).catch(() => { /* best effort */ });
  }
  writeResult('axisC-local', {
    target: LOCAL,
    note: 'API leg = POST /api/v1/projects (in-memory store locally — see findings for the live-API create cost to add for a WAN estimate); hydrate leg = canonical open gesture to usable editor (canvas + overlay dismissed + double-rAF).',
    apiLeg: colStats(rows, 'apiMs'),
    hydrateToCanvas: colStats(rows, 'canvasMs'),
    hydrateToUsable: colStats(rows, 'usableMs'),
    clickToUsable: colStats(rows, 'clickToUsableMs'),
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LOCAL PROD target — axis D: startup on an EXISTING 300-wall project.
// ═════════════════════════════════════════════════════════════════════════════
test('axis D: existing-project startup, cold + warm (local prod)', async ({ browser }) => {
  test.skip(!LOCAL || !TOKEN, 'needs PERF_LOCAL_URL + PERF_TOKEN (run tools/perf/outer/run-outer-local.mjs)');
  test.setTimeout(600_000);

  // Seed once per suite run through the REAL save route (same payload shape the
  // serializer writes — see seedSnapshot.mjs header for the field-by-field proof).
  const { buildSeedSnapshot } = await import('./seedSnapshot.mjs');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
  let r = await fetch(`${LOCAL}/api/projects`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'perf-axisD-300walls' }) });
  expect(r.status).toBe(201);
  const projectId: string = (await r.json()).project.id;
  const snapshot = buildSeedSnapshot(75); // 300 walls
  r = await fetch(`${LOCAL}/api/projects/${projectId}/versions`, { method: 'POST', headers: H, body: JSON.stringify({ label: 'perf-seed', snapshot, elementCount: 300 }) });
  expect(r.status).toBe(201);

  const cold: Record<string, number>[] = [];
  const budgets: Record<string, number>[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await newSessionContext(browser, { token: TOKEN, reopenProject: { id: projectId, name: 'perf-axisD-300walls' } });
    const page = await ctx.newPage();
    const m = await measureOpen(page, LOCAL!, 300);
    expect(m.ok, `cold run ${i}: ${m.failure ?? ''}`).toBe(true);
    cold.push({ navMs: m.navMs!, fcpMs: m.firstPaintMs ?? NaN, canvasMs: m.canvasVisibleMs!, sceneMs: m.sceneLoadedMs!, interactiveMs: m.interactiveMs! });
    if (m.startupBudget) budgets.push(m.startupBudget);
    if (i === 0) writeResult('axisD-local-cold-run0-loaderPhases', m.loaderPhases ?? []);
    await ctx.close();
  }

  // WARM: one context, open once to prime, then measure RUNS re-opens (reload
  // with the same deep link — HTTP cache warm, same server, fresh page state).
  const warmCtx = await newSessionContext(browser, { token: TOKEN, reopenProject: { id: projectId, name: 'perf-axisD-300walls' } });
  const warm: Record<string, number>[] = [];
  {
    const primer = await warmCtx.newPage();
    const m0 = await measureOpen(primer, LOCAL!, 300);
    expect(m0.ok, `warm primer: ${m0.failure ?? ''}`).toBe(true);
    await primer.close();
    for (let i = 0; i < RUNS; i++) {
      const page = await warmCtx.newPage();
      await page.context().addInitScript(() => { /* session already in context */ });
      // re-arm the one-shot reopen flag for this page's navigation
      const m = await (async () => {
        await page.addInitScript(([pid]) => {
          try {
            sessionStorage.setItem('pryzm.reopenProjectAfterReload', '1');
            sessionStorage.setItem('pryzm.lastOpenProject', JSON.stringify({ projectId: pid, projectName: 'perf-axisD-300walls' }));
            (globalThis as Record<string, unknown>)['__pryzmPerfTrace'] = true;
          } catch { /* noop */ }
        }, [projectId] as const);
        return measureOpen(page, LOCAL!, 300);
      })();
      expect(m.ok, `warm run ${i}: ${m.failure ?? ''}`).toBe(true);
      warm.push({ navMs: m.navMs!, fcpMs: m.firstPaintMs ?? NaN, canvasMs: m.canvasVisibleMs!, sceneMs: m.sceneLoadedMs!, interactiveMs: m.interactiveMs! });
      await page.close();
    }
  }
  await warmCtx.close();

  // Aggregate the product's own §STARTUP-BUDGET phases across cold runs (median t+ per phase).
  const phaseAgg: Record<string, number> = {};
  for (const k of new Set(budgets.flatMap(b => Object.keys(b)))) {
    const vals = budgets.map(b => b[k]).filter((v): v is number => Number.isFinite(v));
    if (vals.length) phaseAgg[k] = stats(vals).median;
  }

  const result = {
    target: LOCAL, project: { id: projectId, walls: 300, levels: 1 },
    cold: { navigation: colStats(cold, 'navMs'), firstContentfulPaint: colStats(cold, 'fcpMs'), canvasVisible: colStats(cold, 'canvasMs'), sceneLoaded300Walls: colStats(cold, 'sceneMs'), interactive: colStats(cold, 'interactiveMs') },
    warm: { navigation: colStats(warm, 'navMs'), firstContentfulPaint: colStats(warm, 'fcpMs'), canvasVisible: colStats(warm, 'canvasMs'), sceneLoaded300Walls: colStats(warm, 'sceneMs'), interactive: colStats(warm, 'interactiveMs') },
    startupBudgetMedianTPlusMs: phaseAgg,
  };
  writeResult('axisD-local', result);

  // cleanup
  await fetch(`${LOCAL}/api/projects/${projectId}`, { method: 'DELETE', headers: H }).catch(() => { /* best effort */ });

  // Sane-direction falsification: warm scene-load must not be slower than cold
  // beyond noise (cold pays cache misses; a warm ≫ cold reading means the
  // harness is measuring something else).
  expect(result.warm.interactive.median).toBeLessThanOrEqual(result.cold.interactive.median * 1.25);
});

// ═════════════════════════════════════════════════════════════════════════════
// Axis D falsification — a bogus project id must FAIL the measurement helper.
// ═════════════════════════════════════════════════════════════════════════════
test('axis D falsification: bogus project id refuses to produce a number', async ({ browser }) => {
  test.skip(!LOCAL || !TOKEN, 'needs PERF_LOCAL_URL + PERF_TOKEN');
  test.setTimeout(300_000);
  const ctx = await newSessionContext(browser, { token: TOKEN, reopenProject: { id: 'proj-1000000000000-bogusbogus1', name: 'bogus' } });
  const page = await ctx.newPage();
  const m = await measureOpen(page, LOCAL!, 300, 45_000);
  await ctx.close();
  expect(m.ok, 'measureOpen must REFUSE on a bogus project (no timing recorded)').toBe(false);
  writeResult('axisD-falsification', { ok: m.ok === false, failure: m.failure });
});

// ═════════════════════════════════════════════════════════════════════════════
// ONE cold startup under a CDP JS CPU profile → top-5 self-time entries.
// ═════════════════════════════════════════════════════════════════════════════
test('axis D: cold-startup CPU profile top-5 self-time (local prod)', async ({ browser }) => {
  test.skip(!LOCAL || !TOKEN, 'needs PERF_LOCAL_URL + PERF_TOKEN');
  test.setTimeout(600_000);
  const { buildSeedSnapshot } = await import('./seedSnapshot.mjs');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
  let r = await fetch(`${LOCAL}/api/projects`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'perf-axisD-profile' }) });
  expect(r.status).toBe(201);
  const projectId: string = (await r.json()).project.id;
  r = await fetch(`${LOCAL}/api/projects/${projectId}/versions`, { method: 'POST', headers: H, body: JSON.stringify({ label: 'perf-seed', snapshot: buildSeedSnapshot(75), elementCount: 300 }) });
  expect(r.status).toBe(201);

  const ctx = await newSessionContext(browser, { token: TOKEN, reopenProject: { id: projectId, name: 'perf-axisD-profile' } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); // µs
  await cdp.send('Profiler.start');
  const m = await measureOpen(page, LOCAL!, 300);
  const { profile } = await cdp.send('Profiler.stop');
  expect(m.ok, `profiled run: ${m.failure ?? ''}`).toBe(true);

  // Self-time per node = samples×interval attributed to the sampled node itself.
  const selfMs = new Map<number, number>();
  const intervalMs = 0.25;
  for (const s of profile.samples ?? []) selfMs.set(s, (selfMs.get(s) ?? 0) + intervalMs);
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const top = [...selfMs.entries()]
    .map(([id, ms]) => {
      const n = byId.get(id)!;
      const f = n.callFrame;
      const url = (f.url || '').split('/').slice(-1)[0];
      return { fn: f.functionName || '(anonymous)', where: `${url}:${f.lineNumber + 1}`, selfMs: +ms.toFixed(1) };
    })
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 12);
  writeResult('axisD-cold-profile-top-self-time', { project: projectId, interactiveMs: m.interactiveMs, top });
  const profilePath = resolve(dirname(OUT), 'axisD-cold-startup.cpuprofile');
  writeFileSync(profilePath, JSON.stringify(profile));
  await ctx.close();
  await fetch(`${LOCAL}/api/projects/${projectId}`, { method: 'DELETE', headers: H }).catch(() => { /* best effort */ });
});
