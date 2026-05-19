// Bench: `ifc-export-tier1` — NFT-10 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 10 — NFT 10: "IFC export tier-1
//   | < 5 s for 500 elements | apps/bench/src/benches/ifc-export-tier1.bench.ts".
//
// What this file CAN measure (headless Node):
//   * `globalIdFromUuid()` throughput for 500 elements — the GlobalId
//     serialization step of the export pipeline (every exported element
//     must have its PRYZM UUID mapped to an IFC GUID via this function).
//   * `InMemoryIFCMetaStore.get()` throughput — the meta-store read step
//     that happens for each element during export.
//   * These two steps are pure CPU work within the WASM model creation loop;
//     this bench captures their isolated cost.
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * web-ifc WASM geometry serialization (`IfcAPI.WriteLine()`).
//   * File I/O for writing the resulting .ifc STEP file.
//   * IFC4 model creation / ownership hierarchy wiring.
//
// NFT-10 production target: < 5 s for 500 elements (tier-1 export).

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

describe('ifc-export-tier1', () => {
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
          'NFT-10 headless proxy per 01-VISION.md §5. Measures ' +
          'globalIdFromUuid() + InMemoryIFCMetaStore.get() for 500 elements. ' +
          'Full tier-1 export including web-ifc WASM serialization is in ' +
          'apps/editor-bench/ (Wave 13 browser harness).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(5000);
  });
});
