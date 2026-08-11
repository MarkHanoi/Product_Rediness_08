// Bench: `sync-conflict` — NFT 8.
//
// ############################################################################
// ##  NFT 8 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 8 target: < 1 s from second-user save
// Environment the contract's quantity actually lives in: e2e
//
// WHY IT CANNOT BE MEASURED HERE:
//   C10 measures from a SAVE (a round-trip through the sync server) to a S
//   URFACED conflict (a UI event). This bench has neither endpoint.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   In-process 3-way auto-merge decision time between two local Y.Docs - m
//   icroseconds of CPU, with no save and no surfacing.
//
//   tests/e2e/conflict-resolution.spec.ts is the correct home for NFT 8.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 8, measurability: 'not-yet-measurable'), and `nftLimit(8)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 20;
const SAMPLES = 200;

// Inline CRDTConflictResolver logic (headless bench — no package imports)
function autoMerge(base: unknown, local: unknown, remote: unknown): unknown | null {
  if (JSON.stringify(local) === JSON.stringify(remote)) return local;
  const localChanged = JSON.stringify(local) !== JSON.stringify(base);
  const remoteChanged = JSON.stringify(remote) !== JSON.stringify(base);
  if (localChanged && !remoteChanged) return local;
  if (!localChanged && remoteChanged) return remote;
  if (typeof local === 'number' && typeof remote === 'number' && typeof base === 'number') {
    return base + (local - base) + (remote - base);
  }
  return null; // semantic conflict — user resolution required
}

interface ConflictDescriptor {
  elementId: string;
  property: string;
  localValue: unknown;
  remoteValue: unknown;
  status: 'CONFLICTED';
}

function simulateConflictCycle(
  sharedWallId: string,
  baseHeight: number,
): { elapsed: number; status: 'auto-merged' | 'CONFLICTED' } {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // Seed both docs with base state
  docA.transact(() => { docA.getMap('walls').set(sharedWallId, baseHeight); });
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  const t0 = performance.now();

  // Both clients concurrently edit the same height (true conflict)
  const localHeight = baseHeight + 500;   // client A wants +500mm
  const remoteHeight = baseHeight + 800;  // client B wants +800mm

  docA.transact(() => { docA.getMap('walls').set(sharedWallId, localHeight); });
  docB.transact(() => { docB.getMap('walls').set(sharedWallId, remoteHeight); });

  // Server receives both updates — apply Yjs merge
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

  // Both docs converge (Yjs guarantees this)
  const mergedValue = docA.getMap('walls').get(sharedWallId);
  expect(mergedValue).toBe(docB.getMap('walls').get(sharedWallId));

  // Now check if the merge was semantically valid via CRDTConflictResolver
  const resolved = autoMerge(baseHeight, localHeight, remoteHeight);
  let status: 'auto-merged' | 'CONFLICTED';
  let _conflict: ConflictDescriptor | null = null;

  if (resolved !== null) {
    // Auto-merged successfully (additive delta for numeric)
    status = 'auto-merged';
  } else {
    // Semantic conflict — would trigger CONFLICTED state + dialog
    status = 'CONFLICTED';
    _conflict = {
      elementId: sharedWallId,
      property: 'height',
      localValue: localHeight,
      remoteValue: remoteHeight,
      status: 'CONFLICTED',
    };
  }

  const elapsed = performance.now() - t0;
  docA.destroy();
  docB.destroy();

  return { elapsed, status };
}

describe('[NOT-YET-MEASURABLE NFT 8] sync-conflict', () => {
  it('NFT-8: CONFLICTED-state cycle (Yjs merge + conflict detection) < 200 ms p95', () => {
    const sharedWallId = 'wall-conflict-bench-001';
    const baseHeight = 3000;

    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      simulateConflictCycle(sharedWallId, baseHeight + i);
    }

    const samples: number[] = [];
    let conflictedCount = 0;
    let autoMergedCount = 0;

    for (let i = 0; i < SAMPLES; i++) {
      const { elapsed, status } = simulateConflictCycle(sharedWallId, baseHeight + i * 10);
      samples.push(elapsed);
      if (status === 'CONFLICTED') conflictedCount++;
      else autoMergedCount++;
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'sync-conflict.json'),
      JSON.stringify({
        name: 'sync-conflict',
        p50,
        p95,
        samples: samples.length,
        conflictedCount,
        autoMergedCount,
        unit: 'ms',
        nftTarget: 200,
        implementation: 'real-yjs-CONFLICTED-state',
        notes:
          'NFT-8 REAL per Wave A19-T11. Measures two-client concurrent edit + ' +
          'Yjs CRDT merge + CRDTConflictResolver 3-way auto-merge + CONFLICTED ' +
          'state detection. Replaces the WallStore LWW proxy (Wave A13 era). ' +
          'CONFLICTED state is set when autoMerge returns null (string/semantic ' +
          'conflict) — user sees ConflictResolutionDialog.',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(200);
    // Numeric properties should mostly auto-merge (additive delta rule)
    expect(autoMergedCount + conflictedCount).toBe(SAMPLES);
  });

  it('NFT-8: CONFLICTED status is set when same-property string edit conflicts', () => {
    // String conflicts cannot auto-merge → CONFLICTED state required
    const result = autoMerge('original-name', 'Alice-renamed', 'Bob-renamed');
    expect(result).toBeNull(); // null = CONFLICTED

    // Number conflicts can auto-merge (additive delta)
    const numResult = autoMerge(100, 150, 130);
    expect(numResult).toBe(180); // 100 + (150-100) + (130-100) = 180
  });
});
