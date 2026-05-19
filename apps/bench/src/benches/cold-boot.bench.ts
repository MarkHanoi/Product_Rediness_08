// Bench: `cold-boot` — NFT-1 verifier (headless proxy).
//
// Spec source (in conflict-resolution order — 01-VISION wins):
//   1. `01-VISION.md §5` row 1 — NFT 1: "Cold-boot to first paint
//      | < 2.5 s on M1 / Chrome | apps/bench/cold-boot.ts".  This file
//      adopts the canonical name from 01-VISION.
//   2. `02-ARCHITECTURE.md §6` line 130 — confirms NFT-1 budget and
//      anchors the three-stage boot pipeline (Stage 0 App-Shell paint,
//      Stage 1 runtime composition, Stage 2 engine init on project open).
//   3. `chunks/22 §22.1` step 1.1 — refines the per-step sub-budget to
//      "LCP < 600 ms" for the landing paint specifically (a tighter
//      sub-budget within the 2.5 s NFT-1 envelope), with a per-step
//      bench `bench/ui/landing-paint.bench.ts` separate from this one.
//      That UI-side bench is part of the Wave 13 in-browser harness
//      (`apps/editor-bench/`); this file is its headless proxy.
//
// What this file CAN measure (headless Node, today):
//   * Cold `composeRuntime({ canvas: null, audit, pluginContributions: [] })`
//     wall-time — the dominant single contributor to Stage 1.  Reported
//     as p50 / p95 / p99 over `MEASURE` runs after `WARMUP` warmups.
//   * Sanity: the resolved runtime has the canonical `runtime.scene`
//     shape per `chunks/02 §2.2` (4 readonly fields + `rendererError`)
//     and `runtime.persistence.openProject` per the same chunk and per
//     `02-ARCHITECTURE §6 Stage 2`.
//
// What this file CANNOT measure (intentionally — out of scope for the
// headless proxy; lands in `apps/editor-bench/` Wave 13):
//   * Browser HTML parse + critical-CSS paint (Stage 0 is paint-on-first-
//     byte; the inline skeleton in `index.html` takes this off the
//     bench-able JS path by design).
//   * Vite cold-resolve of the ~233-module dev-server graph.
//   * LCP timing per `chunks/22 §22.1` step 1.1 (`< 600 ms`).
//   * Network throttling (Playwright/CDP).
//   * Bundle-separation contract from `chunks/22 §22.1` GA gate ("engine
//     code is **not** loaded on this path") — that requires a real
//     production-bundle audit (Wave 13).
//
// Audit history — 2026-04-30 closeout-rectification:
//   This file replaced an earlier `landing-first-paint.bench.ts` whose
//   name was taken from the distilled `04-PLAN-FORWARD/04-END-TO-END-
//   FLOWS-AND-COVERAGE.md`.  Per the project-wide conflict-resolution
//   order (01-VISION > 02-ARCHITECTURE > 03-CURRENT-STATE > 04-PLAN-
//   FORWARD), 01-VISION's `cold-boot` name is canonical and supersedes
//   the distilled-doc name.  See `03-CURRENT-STATE.md §10` entry
//   "2026-04-30 closeout-rectification" for the full audit trail.

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

describe('cold-boot', () => {
  it('cold composeRuntime() (no canvas) is the headless proxy for NFT-1', async () => {
    const audit = {
      actorId: 'bench-cold-boot',
      projectId: 'bench-nft-1',
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
      join(RUN_OUTPUT, 'cold-boot.json'),
      JSON.stringify(
        {
          name: 'cold-boot',
          p50,
          p95,
          p99,
          samples: samples.length,
          unit: 'ms',
          notes:
            'NFT-1 headless proxy per 01-VISION.md §5.  Measures cold ' +
            'composeRuntime() (no canvas) — the dominant single contributor ' +
            'to Stage 1 of the three-stage boot pipeline (02-ARCHITECTURE ' +
            '§6).  Wall-clock NFT-1 (< 2.5 s on M1/Chrome) and the per-step ' +
            'LCP sub-budget (< 600 ms, chunks/22 §22.1) are measured in-' +
            'browser by apps/editor-bench/ (Wave 13).',
        },
        null,
        2,
      ),
    );

    // Smoke assertions — verify the runtime has the canonical shape per
    // `chunks/02 §2.2` and `02-ARCHITECTURE §6 Stage 2`.  These are the
    // shape-level invariants that any future refactor of `composeRuntime`
    // must preserve for Flow 1 / Flow 2 to remain wireable.
    const sanityRuntime = await composeRuntime({
      audit,
      canvas: null,
      pluginContributions: [],
    });
    try {
      // chunks/02 §2.2: runtime.scene has 4 readonly fields + rendererError.
      expect(sanityRuntime.scene).toBeDefined();
      expect(sanityRuntime.scene.renderer).toBeNull();
      expect(sanityRuntime.scene.rendererError).toBeNull();
      expect(sanityRuntime.scene.scheduler).toBeDefined();
      expect(sanityRuntime.scene.host).toBeDefined();
      expect(sanityRuntime.scene.materialPool).toBeDefined();
      // 02-ARCHITECTURE §6 Stage 2 — canonical post-compose surface for
      // scene mounting flows through `runtime.persistence.openProject(id)`.
      expect(typeof sanityRuntime.persistence.openProject).toBe('function');
    } finally {
      sanityRuntime.tearDown();
    }
  });
});
