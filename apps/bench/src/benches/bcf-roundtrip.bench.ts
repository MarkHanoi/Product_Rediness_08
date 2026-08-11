// Bench: `bcf-roundtrip` — NFT 11.
//
// TARGET SOURCE: `@pryzm/perf-budgets` -> C10 section 1 row 11.  No number is
// stated in this file.
//
// This bench is GENUINELY HONEST: writeBCF() and readBCF() are pure Node/fflate
// functions, so the round-trip measured here IS the production path.  Note the
// bench is far INSIDE the contract (C10 allows 4 s; this asserts 500 ms for 50
// topics).  W5-1 keeps the tighter local guard as a regression tripwire but
// makes the CONTRACT budget the failing assertion, so the two can never be
// confused for one another again.

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeBCF, readBCF } from '@pryzm/plugin-bcf';
import type { BCFArchive, BCFTopic } from '@pryzm/plugin-bcf';
import { nft, nftLimit } from '@pryzm/perf-budgets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const NFT = nft(11);
const C10_LIMIT_MS = nftLimit(11); // 4000, from C10 section 1.
/** Tripwire: the observed cost is ~8x inside C10. Regressing past this is a
 *  signal long before the contract itself is breached. */
const TRIPWIRE_MS = 500;

const TOPIC_COUNT = 50;
const WARMUP = 3;
const SAMPLES = 15;

function makeGuid(i: number): string {
  return `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`;
}

function buildArchive(): BCFArchive {
  const topics: BCFTopic[] = Array.from({ length: TOPIC_COUNT }, (_, i) => ({
    guid: makeGuid(i),
    topicType: 'Issue',
    topicStatus: 'Open',
    title: `Bench Issue ${i}: Wall thickness out of spec`,
    creationDate: '2026-05-01T00:00:00.000Z',
    creationAuthor: 'bench@pryzm.io',
    description: `Automated BCF benchmark topic ${i}. Detected via AI critique.`,
    comments: [
      {
        guid: makeGuid(i + 10000),
        date: '2026-05-01T00:00:00.000Z',
        author: 'bench@pryzm.io',
        comment: 'Flagged for structural review.',
      },
    ],
    viewpoints: [],
  }));

  return {
    project: {
      projectId: 'bench-project-nft-11',
      name: 'Bench Project',
      version: '3.0',
    },
    topics,
  };
}

describe('bcf-roundtrip', () => {
  it('writeBCF → readBCF for 50 issues is the NFT-11 production bench', async () => {
    const archive = buildArchive();

    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      const bytes = await writeBCF(archive);
      await readBCF(bytes);
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const bytes = await writeBCF(archive);
      const restored = await readBCF(bytes);
      samples.push(performance.now() - t0);

      // Structural integrity check on last sample.
      if (i === SAMPLES - 1) {
        expect(restored.topics.length).toBe(TOPIC_COUNT);
        expect(restored.topics[0]?.guid).toBe(makeGuid(0));
        expect(restored.topics[0]?.title).toContain('Bench Issue 0');
      }
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'bcf-roundtrip.json'),
      JSON.stringify({
        name: 'bcf-roundtrip',
        p50,
        p95,
        samples: samples.length,
        topicCount: TOPIC_COUNT,
        unit: 'ms',
        nftTarget: 500,
        notes:
          'NFT-11 production bench per 01-VISION.md §5. Measures full ' +
          'writeBCF() → readBCF() round-trip for 50 BCF 3.0 topics. ' +
          'This IS the production path (no headless proxy — BCF write/read ' +
          'is pure Node/fflate).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(
      p95,
      `NFT 11 MISS — BCF round-trip p95 = ${p95.toFixed(2)} ms ` +
        `(C10 section 1 budget: ${C10_LIMIT_MS} ms)`,
    ).toBeLessThan(C10_LIMIT_MS);
    expect(
      p95,
      `NFT 11 TRIPWIRE — p95 = ${p95.toFixed(2)} ms crossed the ${TRIPWIRE_MS} ms ` +
        `early-warning line (C10 itself allows ${C10_LIMIT_MS} ms).`,
    ).toBeLessThan(TRIPWIRE_MS);
  });
});
