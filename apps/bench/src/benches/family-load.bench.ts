// Bench: `family-load` — NFT 12.
//
// TARGET SOURCE: `@pryzm/perf-budgets` -> C10 section 1 row 12.  No number is
// stated in this file.
//
// -- W5-1 CORRECTION, 2026-08-11 -------------------------------------------
// The previous revision loaded a family with 2 parameters / 10 types against a
// < 300 ms budget taken from the deleted `01-VISION.md section 5`.  C10
// section 1 row 12 says "Family load (medium, 200 params) < 200 ms": the
// workload was 100x lighter on the dimension the contract actually names
// (parameter count) and the budget was 1.5x looser.  Both now come from C10.
//
// packFamily() and loadFamilyFromBytes() are pure Node (no WASM, no DOM), so
// this bench IS the production path — NFT 12 is genuinely measurable here.

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { loadFamilyFromBytes } from '@pryzm/family-loader';
import { nft, nftLimit } from '@pryzm/perf-budgets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const NFT = nft(12);
const LIMIT_MS = nftLimit(12); // 200, from C10 section 1.

/** C10 section 1 names 200 parameters for the "medium" family. */
const PARAM_COUNT = 200;
const TYPE_COUNT = 10;
const WARMUP = 3;
const SAMPLES = 20;

const NOW = '2026-05-01T00:00:00.000Z';

// Valid Crockford-base32 ParameterIds — par_ + exactly 26 chars.
// 01HZ (4) + 18 zeros (18) + P (1) + 3-digit index (3) = 26 ✓  (supports 1000).
function makeParamId(i: number): string {
  return `par_01HZ000000000000000000P${String(i).padStart(3, '0')}`;
}

const PARAM_IDS: readonly string[] = Array.from({ length: PARAM_COUNT }, (_, i) =>
  makeParamId(i),
);

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
    // C10 §1 row 12 sizes the "medium" family by PARAMETER count, not type
    // count. 200 type-kind parameters, each carried on every type.
    parameters: PARAM_IDS.map((id, i) => ({
      id,
      name: `Param ${String(i).padStart(3, '0')}`,
      kind: 'type' as const,
      dataType: 'length' as const,
      defaultValue: 1000 + i,
      expression: null,
      ifcMapping: null,
      exposed: true,
    })),
    profiles: [],
    solids: [],
    materialSlots: [],
    types: Array.from({ length: TYPE_COUNT }, (_, i) => ({
      id: makeTypeId(i),
      name: `Type ${String(i + 1).padStart(2, '0')}`,
      // values keys must be ParameterIds, not display names (FamilyTypeSchema.values).
      values: Object.fromEntries(PARAM_IDS.map((id, j) => [id, 1000 + j + i * 10])),
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
    description: 'NFT-12 family-load benchmark',
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
  it(`packFamily -> loadFamilyFromBytes (${PARAM_COUNT} params, ${TYPE_COUNT} types) meets the C10 section 1 budget (${NFT.c10Target})`, async () => {
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
        paramCount: PARAM_COUNT,
        nft: 12,
        c10Target: NFT.c10Target,
        limitMs: LIMIT_MS,
        unit: 'ms',
        measures:
          'loadFamilyFromBytes() for a medium family (200 type-parameters, ' +
          '10 types) — the full production path (pure Node/zlib, no WASM).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(
      p95,
      `NFT 12 MISS — family load p95 = ${p95.toFixed(2)} ms ` +
        `(C10 section 1 budget: ${LIMIT_MS} ms)`,
    ).toBeLessThan(LIMIT_MS);
  });
});
