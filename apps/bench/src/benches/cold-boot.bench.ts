// Bench: `cold-boot` — NFT 1.
//
// ############################################################################
// ##  NFT 1 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 1 target: < 2.5 s on M1 / Chrome
// Environment the contract's quantity actually lives in: browser
//
// WHY IT CANNOT BE MEASURED HERE:
//   First paint is a browser compositor event. A Node process has no paint
//   .
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   composeRuntime() wall-time only - the Stage-1 composition share, exclu
//   ding HTML parse, critical CSS and the paint itself.
//
//   tests/e2e/cold-boot.spec.ts is a REAL Playwright paint probe and is th
//   e correct home for NFT 1.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 1, measurability: 'not-yet-measurable'), and `nftLimit(1)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
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

describe('[NOT-YET-MEASURABLE NFT 1] cold-boot', () => {
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
            'NFT-1 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5).  Measures cold ' +
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
