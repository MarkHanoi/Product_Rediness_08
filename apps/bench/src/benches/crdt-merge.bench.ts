// Bench: `crdt-merge` — NFT-7 verifier (REAL Yjs merge — Wave A19-T10 + T15).
//
// Spec source: `01-VISION.md §5` row 7 — NFT 7: "CRDT merge throughput
//   | ≥ 50 ops/s p50 | apps/bench/src/benches/crdt-merge.bench.ts".
//
// Wave A19 upgrade: replaced the WallStore LWW proxy with a REAL two-client
// Yjs Y.Doc merge.  This test now exercises the actual CRDT merge path:
//   - Two independent Y.Doc instances simulating two concurrent users
//   - Both users edit the same property concurrently
//   - Y.encodeStateAsUpdate + Y.applyUpdate merges both sides
//   - Convergence is verified (both docs agree after merge)
//
// NFT-7 production target: real Yjs merge < 80 ms p95 (Wave A19 spec §3 exit gate).
// The ≥ 50 ops/s p50 target is preserved for backward compatibility.

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const MERGE_OPS = 500;
const WARMUP_OPS = 50;
const P95_LIMIT_MS = 80;

describe('crdt-merge', () => {
  it('NFT-7: real 2-client Yjs merge converges in < 80 ms p95', () => {
    // Warmup: prime JIT
    for (let i = 0; i < WARMUP_OPS; i++) {
      const dA = new Y.Doc();
      const dB = new Y.Doc();
      dA.getMap('walls').set(`w-${i}`, 2500 + i);
      dB.getMap('walls').set(`w-${i}`, 2700 + i);
      Y.applyUpdate(dB, Y.encodeStateAsUpdate(dA));
      Y.applyUpdate(dA, Y.encodeStateAsUpdate(dB));
      dA.destroy();
      dB.destroy();
    }

    // Measure MERGE_OPS real two-client Yjs merges
    const samples: number[] = [];

    for (let i = 0; i < MERGE_OPS; i++) {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Simulate two users concurrently editing the same wall height
      const t0 = performance.now();

      docA.transact(() => { docA.getMap('walls').set('wall-001-height', 3000 + i); });
      docB.transact(() => { docB.getMap('walls').set('wall-001-height', 3200 + i); });

      // Merge A → B (Yjs CRDT convergence — not LWW)
      const updateA = Y.encodeStateAsUpdate(docA);
      Y.applyUpdate(docB, updateA);

      // Merge B → A
      const updateB = Y.encodeStateAsUpdate(docB);
      Y.applyUpdate(docA, updateB);

      const elapsed = performance.now() - t0;
      samples.push(elapsed);

      // CRDT convergence guarantee: both docs MUST agree
      const valA = docA.getMap('walls').get('wall-001-height');
      const valB = docB.getMap('walls').get('wall-001-height');
      expect(valA).toBe(valB);

      docA.destroy();
      docB.destroy();
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);
    const opsPerSec = Math.round(1000 / (p50 || 1));

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'crdt-merge.json'),
      JSON.stringify({
        name: 'crdt-merge',
        p50,
        p95,
        opsPerSec,
        samples: samples.length,
        unit: 'ms',
        nftTarget_p95_ms: P95_LIMIT_MS,
        nftTarget_ops_per_sec: 50,
        implementation: 'real-yjs-Y.Doc-merge',
        notes:
          'NFT-7 REAL per Wave A19-T10+T15. Two independent Y.Doc instances ' +
          'simulate two concurrent users. Y.applyUpdate merges both sides and ' +
          'convergence is verified. Replaces the WallStore LWW proxy (Wave A13 era).',
      }, null, 2),
    );

    // NFT-7 exit gate: p95 < 80 ms
    expect(p95).toBeLessThan(P95_LIMIT_MS);
    // Backward compat: ops/s target still passes
    expect(opsPerSec).toBeGreaterThanOrEqual(50);
  });

  it('NFT-7: Yjs convergence is deterministic across 10 concurrent wall edits', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Concurrent edits to 10 different walls
    for (let i = 0; i < 10; i++) {
      docA.transact(() => {
        docA.getMap('walls').set(`wall-${i}-height`, 2500 + i * 100);
        docA.getMap('walls').set(`wall-${i}-thickness`, 200);
      });
      docB.transact(() => {
        docB.getMap('walls').set(`wall-${i}-height`, 3000 + i * 50);
        docB.getMap('walls').set(`wall-${i}-depth`, 150);
      });
    }

    // Bidirectional merge
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    // Both docs MUST have the same state after merge.
    // Use key-sorted JSON so insertion-order differences (expected in Yjs CRDTs)
    // do not cause a false failure — values must agree, not key order.
    const stableStr = (v: unknown): string => {
      if (v === null || typeof v !== 'object') return JSON.stringify(v);
      if (Array.isArray(v)) return '[' + (v as unknown[]).map(stableStr).join(',') + ']';
      const o = v as Record<string, unknown>;
      return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStr(o[k])).join(',') + '}';
    };
    expect(stableStr(docA.toJSON())).toBe(stableStr(docB.toJSON()));

    docA.destroy();
    docB.destroy();
  });
});
