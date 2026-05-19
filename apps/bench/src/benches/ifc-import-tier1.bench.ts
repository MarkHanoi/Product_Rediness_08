// Bench: `ifc-import-tier1` — NFT-9 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 9 — NFT 9: "IFC import tier-1 (walls/doors/windows)
//   | < 8 s for 500 elements | apps/bench/src/benches/ifc-import-tier1.bench.ts".
//
// What this file CAN measure (headless Node):
//   * `extractAllPsets()` throughput for 500 in-memory IFC proxy DTOs —
//     the Pset extraction share of the tier-1 import pipeline. This is the
//     CPU-bound processing step that runs after the WASM geometry decode.
//   * `Wall.parse({ ifcData: {...} })` for 500 elements — the schema
//     validation share of the tier-1 import pipeline (the element creation
//     step for each IfcWallStandardCase entity).
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * web-ifc WASM geometry decode (requires the WASM binary and a real IFC
//     STEP file; available in the browser CI harness at apps/editor-bench/).
//   * File I/O and IFC STEP parse time.
//   * Three.js mesh bake time for geometry import.
//
// NFT-9 production target: < 8 s for 500 elements (tier-1: wall/door/window).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Wall, createId } from '@pryzm/schemas';
import {
  extractAllPsets,
  type PsetSource,
} from '@pryzm/plugin-ifc-import';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const ELEMENT_COUNT = 500;
const WARMUP = 3;
const SAMPLES = 10;

// In-memory pset source simulating IfcWallStandardCase Pset_WallCommon properties.
function makePsetSource(globalIds: string[]): PsetSource {
  type PsetTuple = [string, Record<string, string | number | boolean | null>];
  const map = new Map<string, PsetTuple[]>();
  for (const id of globalIds) {
    map.set(id, [
      ['Pset_WallCommon', {
        Reference: 'W01',
        IsExternal: true,
        ThermalTransmittance: 0.25,
        LoadBearing: true,
      }],
    ]);
  }
  return {
    forElement: (id: string) => map.get(id) ?? [],
  };
}

describe('ifc-import-tier1', () => {
  it('500-element extractAllPsets + Wall.parse (headless proxy) is NFT-9 proxy', () => {
    const globalIds = Array.from({ length: ELEMENT_COUNT }, (_, i) =>
      `2_IfcWall_Bench_${String(i).padStart(4, '0')}`,
    );
    const psetSource = makePsetSource(globalIds);

    const runBatch = (): void => {
      for (const gid of globalIds) {
        extractAllPsets(gid, psetSource);
        Wall.parse({ id: createId('wall'), levelId: 'lvl_bench' });
      }
    };

    // Warmup
    for (let i = 0; i < WARMUP; i++) runBatch();

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      runBatch();
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'ifc-import-tier1.json'),
      JSON.stringify({
        name: 'ifc-import-tier1',
        p50,
        p95,
        samples: samples.length,
        elementCount: ELEMENT_COUNT,
        unit: 'ms',
        nftTarget: 8000,
        notes:
          'NFT-9 headless proxy per 01-VISION.md §5. Measures ' +
          'extractAllPsets() + Wall.parse() for 500 in-memory IFC proxy DTOs. ' +
          'Full tier-1 import including web-ifc WASM decode is in ' +
          'apps/editor-bench/ (Wave 13 browser harness).',
      }, null, 2),
    );

    // Schema pipeline must be well under the 8 s NFT-9 budget.
    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(8000);
  });
});
