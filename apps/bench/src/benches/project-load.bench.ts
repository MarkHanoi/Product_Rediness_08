// Bench: `project-load` — NFT 2.
//
// ############################################################################
// ##  NFT 2 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 2 target: < 6 s p95
// Environment the contract's quantity actually lives in: browser
//
// WHY IT CANNOT BE MEASURED HERE:
//   Needs a seeded 10k-element project and a real renderer to reach a load
//   ed state. Neither exists in the Node harness.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   composeRuntime() composition time with ZERO elements loaded, asserted 
//   against 6000 ms.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 2, measurability: 'not-yet-measurable'), and `nftLimit(2)` THROWS by design
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 3;
const MEASURE = 10;

const AUDIT = {
  actorId: 'bench-project-load',
  projectId: 'bench-nft-2',
  clientId: 'bench-client-nft2',
};

describe('[NOT-YET-MEASURABLE NFT 2] project-load', () => {
  it('composeRuntime() Stage-1 time is the NFT-2 engine-init proxy', async () => {
    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      const rt = await composeRuntime({ audit: AUDIT, canvas: null, pluginContributions: [] });
      rt.tearDown();
    }

    const samples: number[] = [];
    for (let i = 0; i < MEASURE; i++) {
      const t0 = performance.now();
      const rt = await composeRuntime({ audit: AUDIT, canvas: null, pluginContributions: [] });
      samples.push(performance.now() - t0);
      rt.tearDown();
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);
    const p99 = p(0.99);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'project-load.json'),
      JSON.stringify({
        name: 'project-load',
        p50,
        p95,
        p99,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 6000,
        notes:
          'NFT-2 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures composeRuntime() ' +
          'Stage-1 (engine init, no canvas) — the dominant runtime contributor ' +
          'to NFT-2. Full 10k-element load including DB deserialization and ' +
          'scene mount is measured in apps/editor-bench/ (Wave 13 browser harness).',
      }, null, 2),
    );

    // Shape assertions — persistence slot must expose the canonical surface.
    const sanityRt = await composeRuntime({ audit: AUDIT, canvas: null, pluginContributions: [] });
    try {
      expect(typeof sanityRt.persistence.openProject).toBe('function');
      expect(typeof sanityRt.persistence.closeProject).toBe('function');
      expect(sanityRt.scene).toBeDefined();
    } finally {
      sanityRt.tearDown();
    }

    // Engine-init must be under the NFT-2 budget.
    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(6000);
  });
});
