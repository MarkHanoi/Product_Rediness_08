// tools/perf/render/render-profile.spec.ts — LANE PERF round 4 (2026-09-04)
//
// ═══════════════════════════════════════════════════════════════════════════
// AXIS R — the STEADY-STATE FRAME, measured at the browser layer.
// ═══════════════════════════════════════════════════════════════════════════
//
// WHY THIS FILE EXISTS. `tools/perf/outer/outer-baseline.spec.ts` (lane
// BASE-OUTER) measures axes C and D — project CREATION and project LOAD. It
// stops at `interactiveMs`. Nothing in this repo measured what happens AFTER
// that: the frame the user actually sits in while orbiting a heavy model. Every
// draw-call / frame-time number quoted in the perf ledger to date came from a
// unit-level census or a synthetic corpus, never from a production build in a
// real browser. Per [[committed-is-not-reachable]] that is the gap that lets
// four "fixes" ship and run nowhere.
//
// ── ADMISSIBILITY ──────────────────────────────────────────────────────────
// ⛔ NEVER run this against `npm run dev`. The Vite dev server starves the Node
// event loop and every timing is fiction ([[localhost-dev-unusable-test-on-prod]]).
// `run-render-local.mjs` refuses to start without a `dist/` and refuses again if
// the served shell contains `/@vite/client`. This spec additionally records the
// backend and the draw-call PROVENANCE beside every number, because §L-2502
// proved that `info.render.calls` means opposite things on the two renderer
// families and the row had been printed unlabelled for months.
//
// ── THE FALSIFICATION CONTRACT ─────────────────────────────────────────────
// A perf harness that cannot fail is not a measurement. Three arms:
//   F1  the draw-call series must not GROW LIKE AN ODOMETER — an odometer gains
//       ≈1 per render call per frame, so `last - first` approaches the sample
//       count. If it does, the §L-2502 odometer is back wearing a per-frame
//       label and every draw-call number here is inadmissible.
//       ⚠ CORRECTED after the first run (2026-09-04). This arm originally read
//       "must NOT be monotonically non-decreasing", and it FIRED on a healthy
//       reading: 401 samples, first 1251, last 1263 — i.e. FLAT. A constant
//       series IS non-decreasing, and a constant per-frame draw-call count is
//       exactly what a static scene should produce. The arm was rejecting the
//       correct answer. The predicate is now about the RATE of growth, which is
//       what actually distinguishes an odometer from a counter.
//   F2  the renderer's cumulative render-call odometer (WebGPU family) or the
//       frame counter must ADVANCE during the sample window. If it does not,
//       the page is not rendering and every "fast frame" is a frame that never
//       happened — the false exoneration that a naive rAF timer cannot detect.
//   F3  the frame meter must RESPOND to a KNOWN load: a phase that burns a
//       measured ~40 ms of CPU inside each rAF must read ≥25 ms slower than the
//       idle phase. A meter that cannot see 40 ms of deliberate work is
//       measuring the vsync clock, not the app.
//       ⚠ ALSO CORRECTED after the first run. F3 originally compared ORBIT
//       against IDLE and asserted orbit ≥ idle. It FIRED (orbit 202.8 ms vs
//       idle 218.1 ms) — not because the meter is broken but because THE APP IS
//       ALREADY SATURATED AT IDLE (4.6 fps on 1000 walls), so the differential
//       carries no signal and noise decides the sign. A differential arm whose
//       baseline is saturated cannot falsify anything. Injecting a known load
//       makes the arm independent of how slow the subject happens to be.
//
// ── WHAT IS DELIBERATELY NOT CLAIMED ───────────────────────────────────────
// • Shader/pipeline COMPILE COUNT. Neither renderer family exposes a compile
//   counter this harness can read on both backends (`info.programs` exists only
//   on classic WebGLRenderer; the WebGPU-family `Info` has no equivalent). The
//   run records `programs` when the field exists and `null` otherwise. `null`
//   is never printed as 0 — that is the exact false exoneration
//   `pryzmPerfConsole`'s rule 3 forbids.
// • GC. `performance.memory` is a Chromium non-standard with 20 MiB-bucketed
//   granularity; it is recorded as a heap SERIES with the drop count named as a
//   "GC-shaped drop", not as a GC count, because a bucketed counter cannot
//   distinguish a collection from a bucket boundary.
//
// Reproduce:
//   node --max-old-space-size=6144 node_modules/vite/bin/vite.js build   # once
//   node tools/perf/render/run-render-local.mjs
// Options: PERF_PORT · PERF_ROOMS (default 250 → 1000 walls) · PERF_OUT

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const LOCAL = process.env['PERF_LOCAL_URL'] ?? null;
const TOKEN = process.env['PERF_TOKEN'] ?? null;
const ROOMS = parseInt(process.env['PERF_ROOMS'] ?? '250', 10); // ×4 walls
const OUT = process.env['PERF_OUT'] ?? resolve(repoRoot, 'audit/perf/2026-09-04/render-profile.json');

function writeResult(key: string, value: unknown): void {
  mkdirSync(dirname(OUT), { recursive: true });
  let cur: Record<string, unknown> = {};
  try { cur = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* first write */ }
  cur[key] = value;
  cur['_meta'] = {
    lane: 'PERF-round4', axis: 'R (steady-state frame)', when: new Date().toISOString(),
    walls: ROOMS * 4,
    env: { platform: process.platform, node: process.version },
    reproduce: 'node tools/perf/render/run-render-local.mjs',
  };
  writeFileSync(OUT, JSON.stringify(cur, null, 2) + '\n');
}

const stats = (arr: number[]): { n: number; min: number; median: number; p95: number; p99: number; max: number } => {
  if (arr.length === 0) return { n: 0, min: NaN, median: NaN, p95: NaN, p99: NaN, max: NaN };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p: number): number => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!;
  const r2 = (v: number): number => +v.toFixed(2);
  return { n: s.length, min: r2(s[0]!), median: r2(q(0.5)), p95: r2(q(0.95)), p99: r2(q(0.99)), max: r2(s[s.length - 1]!) };
};

// ── authed session (same product keys the outer lane proved out) ────────────
async function newSessionContext(browser: Browser, token: string, reopen: { id: string; name: string }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(([tk, rp]) => {
    try {
      localStorage.setItem('bim-platform-user', JSON.stringify({
        id: 'user-perf-render', email: 'perf@localhost', name: 'Perf Render',
        createdAt: Date.now(), plan: 'free', planStatus: 'active',
      }));
      localStorage.setItem('bim-platform-token', tk as string);
      const r = rp as { id: string; name: string };
      sessionStorage.setItem('pryzm.reopenProjectAfterReload', '1');
      sessionStorage.setItem('pryzm.lastOpenProject', JSON.stringify({ projectId: r.id, projectName: r.name }));
      // §PRYZM-PERF — arm the product's OWN counters BEFORE any wall is built.
      // `packages/frame-scheduler/src/PerfCounters.ts` is off by default and its
      // header is explicit that "NOT ARMED is not ZERO": arming after load would
      // read a row of noughts and look like an exoneration. This is the flag
      // shape that file documents (`globalThis.__pryzmPerf = true`).
      (globalThis as Record<string, unknown>)['__pryzmPerf'] = true;
    } catch { /* the run fails loudly downstream */ }
  }, [token, reopen] as const);
  return ctx;
}

/** Open the heavy project and wait for a real, interactive scene. REFUSES rather than timing a broken open. */
async function openHeavy(page: Page, base: string, expectWalls: number): Promise<{ ok: boolean; failure?: string; interactiveMs?: number }> {
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 180_000 });
  } catch { return { ok: false, failure: 'no canvas within 180s' }; }

  const deadline = t0 + 300_000;
  let wallCount = -1;
  while (Date.now() < deadline) {
    wallCount = await page.evaluate(() => {
      try { return (window as unknown as { wallStore?: { getAll?: () => unknown[] } }).wallStore?.getAll?.().length ?? -1; } catch { return -2; }
    });
    if (wallCount >= expectWalls) break;
    await page.waitForTimeout(250);
  }
  if (wallCount < expectWalls) return { ok: false, failure: `wallStore reached ${wallCount}/${expectWalls}` };

  try {
    await page.locator('#pryzm-engine-loading-overlay').waitFor({ state: 'hidden', timeout: 120_000 });
  } catch { return { ok: false, failure: 'engine loading overlay never dismissed' }; }
  // Let the scene settle: builders finish, first frames compile their pipelines.
  await page.waitForTimeout(4000);
  return { ok: true, interactiveMs: Date.now() - t0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// The page-side sampler. Installed once; each phase starts/stops it.
//
// P3 NOTE: this rAF lives inside `page.evaluate` — it is a string shipped to
// Chromium, not a module in the build graph, and this is a `.spec.ts` file
// which `tools/ga-gate/lib/rafOwners.ts:73` excludes by design
// (§RAF-GATE-SPEC-BLIND). It cannot be a P3 owner. Verified by running the
// gate, not by reading this comment.
// ═══════════════════════════════════════════════════════════════════════════
const SAMPLER_SRC = `
(() => {
  const w = window;
  if (w.__perfSampler) return 'already';
  const readDraw = (info) => {
    // The §L-2502 provenance rule, inlined: a spec cannot import from the
    // bundle, so the rule is restated here and F1 falsifies it every run.
    const r = info && info.render;
    if (!r) return { perFrame: null, provenance: 'unavailable', cumulative: null };
    if (typeof r.drawCalls === 'number') {
      return { perFrame: r.drawCalls, provenance: 'drawCalls/frame (webgpu-family Info)',
               cumulative: typeof r.calls === 'number' ? r.calls : null };
    }
    if (typeof r.calls === 'number') {
      return { perFrame: r.calls, provenance: 'calls/frame (classic WebGLInfo)', cumulative: null };
    }
    return { perFrame: null, provenance: 'unavailable', cumulative: null };
  };
  const s = {
    running: false, frames: [], draws: [], tris: [], heap: [], cum: [],
    last: 0, provenance: 'unsampled',
    start() {
      this.frames = []; this.draws = []; this.tris = []; this.heap = []; this.cum = [];
      this.last = performance.now(); this.running = true;
      const tick = () => {
        if (!this.running) return;
        const now = performance.now();
        this.frames.push(now - this.last);
        this.last = now;
        const rend = w.pryzmRenderer;
        const info = rend && rend.info;
        const d = readDraw(info);
        this.provenance = d.provenance;
        this.draws.push(d.perFrame);
        this.cum.push(d.cumulative);
        this.tris.push(info && info.render && typeof info.render.triangles === 'number' ? info.render.triangles : null);
        const m = performance.memory;
        this.heap.push(m ? m.usedJSHeapSize : null);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    stop() {
      this.running = false;
      return { frames: this.frames, draws: this.draws, tris: this.tris,
               heap: this.heap, cum: this.cum, provenance: this.provenance };
    },
  };
  w.__perfSampler = s;
  return 'installed';
})()
`;

interface PhaseRaw {
  frames: number[];
  draws: (number | null)[];
  tris: (number | null)[];
  heap: (number | null)[];
  cum: (number | null)[];
  provenance: string;
}

async function samplePhase(page: Page, ms: number, drive?: () => Promise<void>): Promise<PhaseRaw> {
  await page.evaluate(() => (window as unknown as { __perfSampler: { start: () => void } }).__perfSampler.start());
  if (drive) await drive(); else await page.waitForTimeout(ms);
  return page.evaluate(() => (window as unknown as { __perfSampler: { stop: () => PhaseRaw } }).__perfSampler.stop());
}

function summarise(raw: PhaseRaw): Record<string, unknown> {
  const frames = raw.frames.slice(1); // drop the first delta (start-to-first-rAF)
  const draws = raw.draws.filter((v): v is number => typeof v === 'number');
  const heap = raw.heap.filter((v): v is number => typeof v === 'number');
  let heapDrops = 0;
  for (let i = 1; i < heap.length; i++) if (heap[i]! < heap[i - 1]! * 0.97) heapDrops++;
  const cum = raw.cum.filter((v): v is number => typeof v === 'number');
  return {
    frameMs: stats(frames),
    fps: frames.length ? +(1000 / (stats(frames).median || 1)).toFixed(1) : null,
    longFrames50ms: frames.filter(f => f > 50).length,
    longFrames16_7ms: frames.filter(f => f > 16.7).length,
    drawCallsPerFrame: draws.length ? stats(draws) : null,
    drawCallProvenance: raw.provenance,
    trianglesPerFrame: raw.tris.some(v => typeof v === 'number') ? stats(raw.tris.filter((v): v is number => typeof v === 'number')) : null,
    heapMiB: heap.length ? { start: +(heap[0]! / 1048576).toFixed(1), end: +(heap[heap.length - 1]! / 1048576).toFixed(1), peak: +(Math.max(...heap) / 1048576).toFixed(1), gcShapedDrops: heapDrops } : null,
    cumulativeOdometer: cum.length ? { first: cum[0], last: cum[cum.length - 1], advanced: cum[cum.length - 1]! - cum[0]! } : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
test('axis R: steady-state render profile on a heavy scene (local prod)', async ({ browser }) => {
  test.skip(!LOCAL || !TOKEN, 'needs PERF_LOCAL_URL + PERF_TOKEN (run tools/perf/render/run-render-local.mjs)');
  test.setTimeout(900_000);

  const { buildSeedSnapshot } = await import('../outer/seedSnapshot.mjs');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
  const walls = ROOMS * 4;
  let r = await fetch(`${LOCAL}/api/projects`, { method: 'POST', headers: H, body: JSON.stringify({ name: `perf-axisR-${walls}walls` }) });
  expect(r.status).toBe(201);
  const projectId: string = (await r.json()).project.id;
  r = await fetch(`${LOCAL}/api/projects/${projectId}/versions`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ label: 'perf-seed', snapshot: buildSeedSnapshot(ROOMS), elementCount: walls }),
  });
  expect(r.status).toBe(201);

  const ctx = await newSessionContext(browser, TOKEN!, { id: projectId, name: `perf-axisR-${walls}walls` });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  const opened = await openHeavy(page, LOCAL!, walls);
  expect(opened.ok, `heavy open failed: ${opened.failure ?? ''}`).toBe(true);

  // ── R0: instrument validity, stated BEFORE any timing ────────────────────
  const validity = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const rend = w['pryzmRenderer'];
    const info = rend?.info;
    const render = info?.render;
    return {
      rendererGlobalPresent: !!rend,
      backendLabel: w['pryzmRendererBackend'] ?? null,
      rendererCtor: rend?.constructor?.name ?? null,
      hasDrawCallsField: typeof render?.drawCalls === 'number',
      hasCallsField: typeof render?.calls === 'number',
      // `programs` exists only on classic WebGLRenderer. null ≠ 0.
      programs: Array.isArray(info?.programs) ? info.programs.length : null,
      geometries: info?.memory?.geometries ?? null,
      textures: info?.memory?.textures ?? null,
      pixelRatio: typeof rend?.getPixelRatio === 'function' ? rend.getPixelRatio() : null,
      performanceMemoryAvailable: !!(performance as unknown as { memory?: unknown }).memory,
      canvasSize: (() => { const c = document.querySelector('canvas'); return c ? { w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height } : null; })(),
      // ⭐ THE VALIDITY LINE THAT GOVERNS EVERY FRAME-TIME NUMBER BELOW.
      // Headless Chromium frequently rasterises through SwiftShader (software).
      // On a software rasteriser the native half of a frame is inflated by an
      // unknown, large factor, so an absolute ms-per-frame reading here is a
      // SOFTWARE LOWER BOUND and must never be quoted as a user's FPS. The
      // GPU-independent findings — draw calls per frame, instance-group count,
      // distinct material/geometry counts — are unaffected and portable.
      glRenderer: (() => {
        try {
          const c = document.createElement('canvas');
          const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
          if (!gl) return null;
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return {
            unmaskedRenderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
            unmaskedVendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : null,
            version: String(gl.getParameter(gl.VERSION)),
          };
        } catch { return null; }
      })(),
    };
  });
  writeResult('R0-instrument-validity', validity);
  expect(validity.rendererGlobalPresent, 'window.pryzmRenderer absent — nothing downstream is measurable').toBe(true);

  // ── R1: the LIVE instancing census ───────────────────────────────────────
  // The one question a unit census cannot answer: does the collapse survive the
  // REAL backend? materialSignature declines ShaderMaterial/NodeMaterial, so a
  // TSL/WebGPU material path would silently degenerate to one group per element
  // while every unit test still passes on its classic-material fixture.
  const instancing = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const ier = w['__instancedElementRenderer'];
    if (!ier) return { present: false as const };
    const groups = (() => { try { return ier.groupSummary ?? null; } catch { return null; } })();
    return {
      present: true as const,
      groupCount: ier.groupCount ?? null,
      totalInstances: ier.totalInstances ?? null,
      droppedInstanceCount: (() => { try { return ier.droppedInstanceCount ?? null; } catch { return null; } })(),
      spill: (() => { try { return ier.spillSummary ?? null; } catch { return null; } })(),
      topGroups: Array.isArray(groups) ? groups.slice(0, 12) : null,
      groupsOfSizeOne: Array.isArray(groups) ? groups.filter((g: { active: number }) => g.active === 1).length : null,
      flagElementInstancingV1: w['__pryzmElementInstancingV1'] ?? null,
      flagFurnitureInstancingV1: w['__pryzmFurnitureInstancingV1'] ?? null,
    };
  });
  writeResult('R1-live-instancing-census', instancing);

  // Scene census — how many drawable objects the renderer is actually handed.
  const sceneCensus = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const scene = w['scene'] ?? w['bimWorld']?.scene?.three ?? null;
    if (!scene || typeof scene.traverse !== 'function') return { present: false as const };
    let meshes = 0, instanced = 0, visibleMeshes = 0, lines = 0, materials = new Set<string>(), geos = new Set<string>();
    scene.traverse((o: any) => {
      if (o.isInstancedMesh) { instanced++; if (o.visible) visibleMeshes++; }
      else if (o.isMesh) { meshes++; if (o.visible) visibleMeshes++; }
      else if (o.isLine || o.isLineSegments) lines++;
      const m = o.material;
      if (m) { for (const mm of (Array.isArray(m) ? m : [m])) if (mm?.uuid) materials.add(mm.uuid); }
      if (o.geometry?.uuid) geos.add(o.geometry.uuid);
    });
    return { present: true as const, meshes, instancedMeshes: instanced, visibleDrawables: visibleMeshes, lines, distinctMaterials: materials.size, distinctGeometries: geos.size };
  });
  writeResult('R1b-scene-census', sceneCensus);

  // ── R1c: WHICH CLAUSE rejected each wall from the instanced arm ──────────
  // `WallFragmentBuilder`'s `isSimpleWall` predicate (:1438) bumps one
  // `PERF_KEYS.WALL_REJECT_*` counter per FAILING clause, and its own comment
  // states the live hypothesis: "A generated building MITRES ITS CORNERS, so
  // the live hypothesis is that joinData.startMN / endMN disqualify most of the
  // batch. That is a guess until it is counted." This reads the count, on a real
  // building, in the real app. Clause totals may exceed `notInstanced` because a
  // wall failing two clauses bumps two keys — read each clause against
  // `notInstanced`, never against the other clauses.
  const rejectCensus = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const api = w['pryzmPerf'];
    if (!api || typeof api.data !== 'function') return { present: false as const, why: 'window.pryzmPerf.data() unavailable' };
    let snap: any = null;
    try { snap = api.data()?.snapshot ?? null; } catch (e) { return { present: false as const, why: String(e) }; }
    if (!snap) return { present: false as const, why: 'report carried no snapshot' };
    // ⭐ "NOT ARMED" IS NOT "ZERO" — PerfCounters.ts says so in capitals. If the
    // flag never took, every count below is unmeasured and must not read as 0.
    if (snap.armedForMs === null || snap.armedForMs === undefined) {
      return { present: false as const, why: 'counters NEVER ARMED — the numbers would be unmeasured, not zero' };
    }
    const c = snap.counters ?? {};
    const pick = (k: string): number | null => (k in c ? c[k] : null);
    return {
      present: true as const,
      armedForMs: Math.round(snap.armedForMs),
      instanced: pick('wall.instanced'),
      notInstanced: pick('wall.notInstanced'),
      rejects: {
        noInstanceBridge: pick('wall.reject.noInstanceBridge'),
        hasOpenings: pick('wall.reject.hasOpenings'),
        curved: pick('wall.reject.curved'),
        mitreStart: pick('wall.reject.mitreStart'),
        mitreEnd: pick('wall.reject.mitreEnd'),
        rakedNonVertical: pick('wall.reject.rakedNonVertical'),
        multiLayer: pick('wall.reject.multiLayer'),
        hasProfile: pick('wall.reject.hasProfile'),
      },
      traverseCounters: Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith('traverse.'))),
      allCounterKeys: Object.keys(c).sort(),
    };
  });
  writeResult('R1c-wall-instancing-reject-census', rejectCensus);

  await page.evaluate(SAMPLER_SRC);

  // ── R2: IDLE — nothing driven, the scene simply sits there ───────────────
  const idle = await samplePhase(page, 5000);
  writeResult('R2-idle', { ...summarise(idle), phase: 'idle (no input, 5s)' });

  // ── R3: ORBIT — continuous camera motion, the heavy user gesture ─────────
  const canvasBox = await page.locator('canvas').first().boundingBox();
  expect(canvasBox, 'canvas has no bounding box').toBeTruthy();
  const cx = canvasBox!.x + canvasBox!.width / 2;
  const cy = canvasBox!.y + canvasBox!.height / 2;

  const orbit = await samplePhase(page, 0, async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'left' });
    for (let i = 0; i < 120; i++) {
      await page.mouse.move(cx + Math.cos(i / 12) * 320, cy + Math.sin(i / 12) * 140);
      await page.waitForTimeout(25);
    }
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(300);
  });
  writeResult('R3-orbit', { ...summarise(orbit), phase: 'orbit (120 drag steps @25ms, left button)' });

  // ── R4: HOVER — continuous mousemove with NO button. This is the pick path:
  // §NAV-PICK-QUADRATIC (L-1850) names a membership-signature loop that runs on
  // every hover rAF. Hover cost minus idle cost isolates it.
  const hover = await samplePhase(page, 0, async () => {
    for (let i = 0; i < 120; i++) {
      await page.mouse.move(cx + ((i * 37) % 600) - 300, cy + ((i * 53) % 300) - 150);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(300);
  });
  writeResult('R4-hover', { ...summarise(hover), phase: 'hover (120 moves @25ms, no button)' });

  // ── R5: PICK LATENCY — click → selection observable, at the UI layer ─────
  const pickSamples: number[] = [];
  const pickFailures: string[] = [];
  for (let i = 0; i < 12; i++) {
    const px = cx + ((i * 71) % 500) - 250;
    const py = cy + ((i * 41) % 260) - 130;
    const t = await page.evaluate(async ([x, y]) => {
      const w = window as unknown as Record<string, any>;
      const sm = w['selectionManager'];
      // `selectedObject` is SelectionManager's own public field
      // (packages/input-host/src/SelectionManager.ts:132) — the thing the gizmo
      // and the highlight overlay both read. There is no getSelectedIds().
      if (!sm || !('selectedObject' in sm)) return { ok: false, why: 'no selectionManager.selectedObject' };
      const idOf = (): string => {
        const o = sm.selectedObject;
        return o ? String(o.userData?.id ?? o.uuid ?? 'unknown') : '<none>';
      };
      const before = idOf();
      const c = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!c) return { ok: false, why: 'no canvas' };
      const t0 = performance.now();
      const opts = { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 } as MouseEventInit;
      c.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, isPrimary: true } as PointerEventInit));
      c.dispatchEvent(new MouseEvent('mousedown', opts));
      c.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, isPrimary: true } as PointerEventInit));
      c.dispatchEvent(new MouseEvent('mouseup', opts));
      c.dispatchEvent(new MouseEvent('click', opts));
      // Poll until the selection observably changes, or give up.
      const deadline = t0 + 2000;
      while (performance.now() < deadline) {
        if (idOf() !== before) return { ok: true, ms: performance.now() - t0, to: idOf() };
        await new Promise(r => setTimeout(r, 1));
      }
      return { ok: false, why: 'selection never changed within 2000ms' };
    }, [px, py] as const);
    if (t.ok && typeof t.ms === 'number') pickSamples.push(t.ms); else pickFailures.push(t.why ?? '?');
  }
  writeResult('R5-pick-latency', {
    method: 'synthetic pointer/mouse event on the live canvas → selectionManager.selectedObject identity change',
    hits: pickSamples.length, misses: pickFailures.length,
    // A click on empty space legitimately changes nothing; misses are reported,
    // never averaged in, and never counted as a fast pick.
    latencyMs: pickSamples.length ? stats(pickSamples) : null,
    missReasons: [...new Set(pickFailures)].slice(0, 4),
  });

  // ── R7: WHERE THE TIME GOES — CDP JS CPU profile over idle + orbit ───────
  // The frame numbers say HOW SLOW. Only a profile says WHY, and a profile is
  // the one artefact that cannot be argued with by a stale doc.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); // µs
  await cdp.send('Profiler.start');
  await page.waitForTimeout(4000);                       // idle under the profiler
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'left' });
  for (let i = 0; i < 60; i++) { await page.mouse.move(cx + Math.cos(i / 9) * 300, cy + Math.sin(i / 9) * 130); await page.waitForTimeout(25); }
  await page.mouse.up({ button: 'left' });
  const { profile } = await cdp.send('Profiler.stop');

  const selfMs = new Map<number, number>();
  for (const s of profile.samples ?? []) selfMs.set(s, (selfMs.get(s) ?? 0) + 0.25);
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const totalSelf = [...selfMs.values()].reduce((a, b) => a + b, 0);
  const top = [...selfMs.entries()]
    .map(([id, ms]) => {
      const f = byId.get(id)!.callFrame;
      return {
        fn: f.functionName || '(anonymous)',
        where: `${(f.url || '').split('/').slice(-1)[0]}:${f.lineNumber + 1}`,
        selfMs: +ms.toFixed(1),
        pctOfSampled: +((ms / (totalSelf || 1)) * 100).toFixed(1),
      };
    })
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 20);
  writeResult('R7-cpu-profile-top-self-time', { windowDescription: 'idle 4s then 60-step orbit, under CDP Profiler', totalSampledMs: +totalSelf.toFixed(0), top });
  writeFileSync(resolve(dirname(OUT), 'axisR-heavy-scene.cpuprofile'), JSON.stringify(profile));

  // ── FALSIFICATION ────────────────────────────────────────────────────────
  // F3 — inject a KNOWN load and check the meter sees it. Independent of how
  // slow the app already is, which is what made the old differential arm useless.
  const BURN_MS = 40;
  await page.evaluate((burn) => {
    const w = window as unknown as Record<string, any>;
    w['__perfBurn'] = burn;
    const spin = (): void => {
      if (!w['__perfBurn']) return;
      const t = performance.now();
      while (performance.now() - t < w['__perfBurn']) { /* deliberate CPU burn */ }
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }, BURN_MS);
  const burned = await samplePhase(page, 4000);
  await page.evaluate(() => { (window as unknown as Record<string, any>)['__perfBurn'] = 0; });

  const idleS = summarise(idle) as { frameMs: { median: number } };
  const burnedS = summarise(burned) as { frameMs: { median: number } };
  const orbitS = summarise(orbit) as { frameMs: { median: number } };
  const odo = (summarise(orbit) as { cumulativeOdometer: { advanced: number } | null }).cumulativeOdometer;
  const framesAdvanced = orbit.frames.length;

  // F1 — odometer detection by GROWTH RATE, not by monotonicity.
  const drawSeries = orbit.draws.filter((v): v is number => typeof v === 'number');
  const growth = drawSeries.length > 5 ? drawSeries[drawSeries.length - 1]! - drawSeries[0]! : 0;
  const odometerLike = drawSeries.length > 5 && growth >= drawSeries.length * 0.5;

  writeResult('R6-falsification', {
    F1_drawCallsAreNotAnOdometer: {
      pass: !odometerLike, sampled: drawSeries.length,
      first: drawSeries[0] ?? null, last: drawSeries[drawSeries.length - 1] ?? null, growth,
      thresholdGrowth: +(drawSeries.length * 0.5).toFixed(0),
      note: 'an odometer gains ~1 per render call per frame, so growth would approach the sample count; a flat series is the CORRECT shape for a static scene',
    },
    F2_rendererAdvanced: {
      pass: framesAdvanced > 20, rafFramesObserved: framesAdvanced, odometerAdvance: odo?.advanced ?? null,
      note: 'odometerAdvance is null on a classic WebGLRenderer, which keeps no odometer — rafFramesObserved carries the arm there',
    },
    F3_meterSeesAKnownLoad: {
      pass: burnedS.frameMs.median - idleS.frameMs.median >= BURN_MS * 0.625,
      injectedBurnMsPerFrame: BURN_MS, idleMedianMs: idleS.frameMs.median, burnedMedianMs: burnedS.frameMs.median,
      deltaMs: +(burnedS.frameMs.median - idleS.frameMs.median).toFixed(2),
      note: 'the meter must see deliberate CPU burn; this arm does NOT depend on the app being fast at idle',
    },
    F4_orbitVsIdle_INFORMATIONAL: {
      idleMedianMs: idleS.frameMs.median, orbitMedianMs: orbitS.frameMs.median,
      inconclusive: idleS.frameMs.median > 50,
      note: 'NOT an assertion. When idle is already >50ms the subject is saturated and this differential carries no signal — recorded so a reader does not mistake the sign for a finding.',
    },
    consoleErrorsDuringRun: consoleErrors.slice(0, 8),
  });

  await ctx.close();
  await fetch(`${LOCAL}/api/projects/${projectId}`, { method: 'DELETE', headers: H }).catch(() => { /* best effort */ });

  // F1/F2/F3 are hard: together they say whether ANY number above is admissible.
  expect(odometerLike, 'F1: draw-call series grows like an odometer — every draw-call number here is inadmissible').toBe(false);
  expect(framesAdvanced, 'F2: fewer than 20 rAF frames observed — the page was not rendering').toBeGreaterThan(20);
  expect(burnedS.frameMs.median - idleS.frameMs.median,
    `F3: the frame meter did not see ${BURN_MS}ms/frame of deliberate CPU burn — it is not measuring this app`).toBeGreaterThanOrEqual(BURN_MS * 0.625);
});
