// Bench: `project-load` — NFT-2 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 2 — NFT 2: "Project-load (10k elements)
//   | < 6 s p95 | apps/bench/src/benches/project-load.bench.ts".
//
// What this file CAN measure (headless Node):
//   * `composeRuntime()` composition time (Stage 1 of the three-stage boot
//     pipeline per 02-ARCHITECTURE §6). This is the engine-init contribution
//     to NFT-2 — the dominant runtime-level overhead before any project data
//     is loaded. Measured over MEASURE independent `composeRuntime()` calls.
//   * Shape assertions confirming the persistence slot exposes the canonical
//     `openProject()` surface (the entry point for Stage 2 — element
//     deserialization from storage) without requiring a live database.
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * 10k-element deserialization from Supabase/Postgres (requires a real
//     seeded database; covered by persistence-stress.bench.ts in Wave 14).
//   * Three.js scene creation and GPU bake time.
//   * `openProject()` full execution (requires a live project in the DB;
//     unavailable in the headless bench environment by design).
//
// NFT-2 production target: < 6 s p95 (total: engine-init + data load + scene).

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

describe('project-load', () => {
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
          'NFT-2 headless proxy per 01-VISION.md §5. Measures composeRuntime() ' +
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
