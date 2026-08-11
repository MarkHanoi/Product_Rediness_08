// Bench: `ifc-export-tier1` — NFT 10.
//
// ############################################################################
// ##  NFT 10 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 10 target: < 20 s
// Environment the contract's quantity actually lives in: node
//
// WHY IT CANNOT BE MEASURED HERE:
//   The bench never calls the WASM writer and never writes a file. It exer
//   cises 500 elements, not the 10,000 C10 names.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   globalIdFromUuid() + meta-store reads for 500 elements, asserted < 5 s
//   .
//
//   Unblocking needs only the real export writer on 10k elements - no brow
//   ser.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 10, measurability: 'not-yet-measurable'), and `nftLimit(10)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  globalIdFromUuid,
  InMemoryIFCMetaStore,
} from '@pryzm/plugin-ifc-export';
import { createId } from '@pryzm/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const ELEMENT_COUNT = 500;
const WARMUP = 3;
const SAMPLES = 10;

const BASE_UUID = '550e8400-e29b-41d4-a716-446655440000';
const IFC_GLOBAL_ID = globalIdFromUuid(BASE_UUID);

describe('[NOT-YET-MEASURABLE NFT 10] ifc-export-tier1', () => {
  it('500-element globalIdFromUuid + InMemoryIFCMetaStore.get is NFT-10 proxy', () => {
    // Populate meta-store with 500 element entries.
    const metaStore = new InMemoryIFCMetaStore();
    const elementIds: string[] = [];
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const id = createId('wall');
      elementIds.push(id);
      metaStore.add({
        pryzmElementId: id,
        globalId: IFC_GLOBAL_ID,
        typeName: 'IFCWALLSTANDARDCASE',
        psets: {
          Pset_WallCommon: {
            IsExternal: true,
            LoadBearing: true,
            ThermalTransmittance: 0.25,
          },
        },
        tier: 1,
      });
    }

    const runBatch = (): void => {
      for (const id of elementIds) {
        globalIdFromUuid(BASE_UUID);
        metaStore.get(id);
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
      join(RUN_OUTPUT, 'ifc-export-tier1.json'),
      JSON.stringify({
        name: 'ifc-export-tier1',
        p50,
        p95,
        samples: samples.length,
        elementCount: ELEMENT_COUNT,
        unit: 'ms',
        nftTarget: 5000,
        notes:
          'NFT-10 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures ' +
          'globalIdFromUuid() + InMemoryIFCMetaStore.get() for 500 elements. ' +
          'Full tier-1 export including web-ifc WASM serialization is in ' +
          'apps/editor-bench/ (Wave 13 browser harness).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(5000);
  });
});
