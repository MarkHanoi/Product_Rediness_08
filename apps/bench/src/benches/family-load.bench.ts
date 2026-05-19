// Bench: `family-load` — NFT-12 verifier.
//
// Spec source: `01-VISION.md §5` row 12 — NFT 12: "Family load (10 types)
//   | < 300 ms p95 | apps/bench/src/benches/family-load.bench.ts".
//
// What this file measures (headless Node):
//   * `packFamily()` → `loadFamilyFromBytes()` round-trip for a single
//     family with 10 types. This is the full production path for the
//     "load family from library" flow — pack, transmit, unpack, and
//     preflight-resolve.
//   * Both packFamily() and loadFamilyFromBytes() are pure Node functions
//     (no WASM, no DOM), so this bench IS the production path.
//
// NFT-12 production target: < 300 ms p95 (family load, 10 types).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { loadFamilyFromBytes } from '@pryzm/family-loader';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const TYPE_COUNT = 10;
const WARMUP = 3;
const SAMPLES = 20;

const NOW = '2026-05-01T00:00:00.000Z';

// Valid Crockford-base32 ParameterIds — par_ + exactly 26 chars.
// 01HZ (4) + 18 zeros (18) + HGT1/WDT1 (4) = 26 ✓
const PAR_HGT = 'par_01HZ000000000000000000HGT1' as const;
const PAR_WDT = 'par_01HZ000000000000000000WDT1' as const;

// sha256 of the canonical empty string — valid 64-hex literal.
const ZERO_SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as const;

// Valid TypeId: typ_ + 26 Crockford chars.
// 01HZ (4) + 18 zeros (18) + TY (2) + 2-digit index (2) = 26 ✓  (supports up to 99 types).
function makeTypeId(i: number): string {
  return `typ_01HZ000000000000000000TY${String(i + 1).padStart(2, '0')}`;
}

function makeDocument(): FamilyDocument {
  return {
    formatVersion: '1.0',
    referencePlanes: [],
    parameters: [
      {
        id: PAR_HGT,
        name: 'Height',
        kind: 'type',
        dataType: 'length',
        defaultValue: 2100,
        expression: null,
        ifcMapping: null,
        exposed: true,
      },
      {
        id: PAR_WDT,
        name: 'Width',
        kind: 'type',
        dataType: 'length',
        defaultValue: 900,
        expression: null,
        ifcMapping: null,
        exposed: true,
      },
    ],
    profiles: [],
    solids: [],
    materialSlots: [],
    types: Array.from({ length: TYPE_COUNT }, (_, i) => ({
      id: makeTypeId(i),
      name: `Type ${String(i + 1).padStart(2, '0')}`,
      // values keys must be ParameterIds, not display names (FamilyTypeSchema.values).
      values: { [PAR_HGT]: 2100 + i * 100, [PAR_WDT]: 900 + i * 50 },
      checksum: ZERO_SHA,
    })),
    defaults: {},
  };
}

function makeManifest(): FamilyManifest {
  return {
    formatVersion: '1.0',
    // fam_ + 26 Crockford chars.
    id: 'fam_01HZ00000000000000000FAM01' as `fam_${string}`,
    name: 'BenchDoor',
    semver: '1.0.0',
    author: { id: 'usr_bench_nft12', displayName: 'Bench' },
    description: 'NFT-12 family-load benchmark — 10 types',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: [],
    minPRYZMVersion: '2.0.0',
    // packFamily() recomputes and overwrites schemaHash — value here only needs to pass Zod pre-validation.
    schemaHash: ZERO_SHA,
    createdAt: NOW,
    lastModifiedAt: NOW,
  };
}

describe('family-load', () => {
  it('packFamily → loadFamilyFromBytes for 10 types is the NFT-12 production bench', async () => {
    const document = makeDocument();
    const manifest = makeManifest();

    // Pre-pack bytes (packing is not part of the load NFT).
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) {
      throw new Error(`[family-load bench] packFamily failed: ${(packed as unknown as { reason: string }).reason}`);
    }
    const bytes = packed.bytes;

    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      await loadFamilyFromBytes(bytes, { verifySchemaHash: false });
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const result = await loadFamilyFromBytes(bytes, { verifySchemaHash: false });
      samples.push(performance.now() - t0);

      if (i === SAMPLES - 1) {
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.family.manifest.name).toBe('BenchDoor');
          expect(result.family.document.types.length).toBe(TYPE_COUNT);
        }
      }
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'family-load.json'),
      JSON.stringify({
        name: 'family-load',
        p50,
        p95,
        samples: samples.length,
        typeCount: TYPE_COUNT,
        unit: 'ms',
        nftTarget: 300,
        notes:
          'NFT-12 production bench per 01-VISION.md §5. Measures ' +
          'loadFamilyFromBytes() for a family with 10 types — the full ' +
          'production path (pure Node/zlib, no WASM).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(300);
  });
});
