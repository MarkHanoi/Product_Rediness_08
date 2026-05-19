// Bench: `landing-first-paint` — Flow 1 NFT-1 verifier.
//
// Spec source: `docs/03_PRYZM3/04-PLAN-FORWARD/04-END-TO-END-FLOWS-AND-COVERAGE.md`
// §1 Flow 1 ("Open landing page → first paint"):
//
//   | Stage | Surface | Runtime leg | Wave |
//   |---|---|---|---|
//   | Browser navigate | `index.html` (App-Shell) | none | landed (Wave 1.5) |
//   | HTML parse + skeleton paint | `src/main.ts` shell | none | landed (Wave 1.5b) |
//   | JS bundle mount | `src/main.ts` | `composeRuntime()` boot | landed (Wave 4 D.4.0) |
//   | First runtime tick | scene canvas | `runtime.scene.mount()` | landed (Wave 4 D.4.1, Flow-1 wire 2026-04-30) |
//
//   **Verifier**: `pnpm bench landing-first-paint` ≤ 2.5 s on M1/Chrome 130/throttled fast 4G (NFT-1).
//
// Why this file exists today (2026-04-30 Flow-1 wire-in):
//   The four wires above are now in place at the architecture level —
//     1. App-Shell HTML + inline skeleton CSS (paint-on-first-byte).
//     2. `__pryzmPendingActions` queue + `data-pryzm-skeleton` removal selector.
//     3. `composeRuntime({ canvas: null, … })` returning a typed runtime.
//     4. `runtime.scene.mount(canvas, mode?)` typed entry on `SceneSlot`,
//        funneling through `bootstrapScene()` (`pryzm.bootstrap.scene` span).
//   The NFT-1 number itself ("≤ 2.5 s on M1/Chrome 130/throttled fast 4G")
//   is a browser-side measurement (Performance.timing.firstPaint, with
//   network throttling).  This Vitest harness is the **headless proxy**:
//   it measures the cold `composeRuntime()` boot ms (no canvas) — the
//   single largest contributor to JS-bundle-mount-to-first-paint that
//   the in-browser bench cannot decompose.
//
// What this file CANNOT measure (intentionally):
//   * Vite cold-resolve of the ~233-module plugin graph (dev-server only).
//   * Browser HTML parse + critical-CSS paint (the App-Shell's job —
//     Wave 1.5b ships the inline skeleton precisely to take this off
//     the bench-able path).
//   * Network throttling (Playwright/CDP work; Wave 13 NFT bench batch).
//   The full in-browser harness lives at `apps/editor-bench/` (Wave 13).
//   Until then this proxy is the gate the spec calls `landing-first-paint`.
//
// Methodology — headless Node:
//   1. Construct `composeRuntime({ audit, canvas: null, pluginContributions: [] })`
//      `WARMUP` times to populate the module-cache so the measured runs
//      reflect steady-state cost (not first-import resolve).
//   2. Measure `MEASURE` cold composes; report p50 / p95 / p99 in ms.
//   3. Per-bench output written to `.run-output/landing-first-paint.json`
//      (consumed by `scripts/check-regression.mjs`); the entry in
//      `baseline.json` is `warn-only` until the in-browser harness
//      lands and we can pin a real wall-clock NFT-1 number.

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '@pryzm/editor/bootstrap.everything';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 3;
const MEASURE = 20;

describe('landing-first-paint', () => {
  it('cold composeRuntime() (no canvas) is the headless proxy for NFT-1', async () => {
    const audit = {
      actorId: 'bench-landing-first-paint',
      projectId: 'bench-flow-1',
      clientId: 'bench-client',
    };

    // Warmup — populate module cache + JIT.
    for (let i = 0; i < WARMUP; i++) {
      const runtime = await composeRuntime({
        audit,
        canvas: null,
        pluginContributions: [],
      bootstrapFn: bootstrapWithEverything,
      });
      runtime.tearDown();
    }

    const samples: number[] = [];
    for (let i = 0; i < MEASURE; i++) {
      const t0 = performance.now();
      const runtime = await composeRuntime({
        audit,
        canvas: null,
        pluginContributions: [],
      bootstrapFn: bootstrapWithEverything,
      });
      const t1 = performance.now();
      samples.push(t1 - t0);
      runtime.tearDown();
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);
    const p99 = p(0.99);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'landing-first-paint.json'),
      JSON.stringify(
        {
          name: 'landing-first-paint',
          p50,
          p95,
          p99,
          samples: samples.length,
          unit: 'ms',
          notes:
            'Headless proxy for Flow 1 NFT-1.  Measures cold composeRuntime() ' +
            '(no canvas) — JS-bundle-mount stage of the four-stage flow.  ' +
            'Wall-clock NFT-1 ≤ 2.5 s ships in the in-browser harness ' +
            '(apps/editor-bench/, Wave 13).  Wired 2026-04-30 — Flow 1 closeout.',
        },
        null,
        2,
      ),
    );

    // No hard gate today (warn-only per `baseline.json` policy until the
    // in-browser harness lands).  Smoke assertion: composeRuntime() must
    // resolve in finite time and return a runtime with a typed `scene.mount`.
    const sanityRuntime = await composeRuntime({
      audit,
      canvas: null,
      pluginContributions: [],
    });
    try {
      expect(typeof sanityRuntime.scene.mount).toBe('function');
      expect(sanityRuntime.scene.renderer).toBeNull();
      expect(sanityRuntime.scene.rendererError).toBeNull();
    } finally {
      sanityRuntime.tearDown();
    }
  });
});
