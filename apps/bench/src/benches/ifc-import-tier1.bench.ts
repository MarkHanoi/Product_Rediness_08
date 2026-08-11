// Bench: `ifc-import-tier1` — NFT 9.
//
// ############################################################################
// ##  NFT 9 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 9 target: < 30 s
// Environment the contract's quantity actually lives in: node
//
// WHY IT CANNOT BE MEASURED HERE:
//   No 50 MB IFC fixture is committed, and the web-ifc WASM decode - the d
//   ominant cost - is never invoked.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   extractAllPsets() + Wall.parse() over 500 synthetic in-memory DTOs, as
//   serted < 8 s. A different workload against a different budget.
//
//   Unblocking needs only a committed 50 MB IFC fixture plus the WASM deco
//   de call - no browser.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 9, measurability: 'not-yet-measurable'), and `nftLimit(9)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
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

describe('[NOT-YET-MEASURABLE NFT 9] ifc-import-tier1', () => {
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
          'NFT-9 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures ' +
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
