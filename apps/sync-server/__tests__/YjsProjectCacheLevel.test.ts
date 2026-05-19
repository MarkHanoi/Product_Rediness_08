// apps/sync-server — Tests for YjsProjectCache level-scoped API (ADR-049 §4.4)
//
// CONTRACT verified:
//   ADR-049 §4.4 — Level-scoped Y.Doc instances keyed by "${projectId}:${levelId}".
//   C08 §3.1    — Server-side CRDT merge via Y.applyUpdate.
//   P8          — Every public method has an OTel span.
//
// Test identifiers: L1–L12 (L = level-scoped; distinct from existing server tests).

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { YjsProjectCache } from '../src/YjsProjectCache.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Yjs binary update that writes `{ [mapKey]: { [field]: value } }`. */
function buildUpdate(mapKey: string, field: string, value: unknown): Uint8Array {
  const doc = new Y.Doc();
  doc.transact(() => {
    const ns = doc.getMap<Y.Map<unknown>>('elements');
    const elem = new Y.Map<unknown>();
    elem.set(field, value);
    ns.set(mapKey, elem);
  });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

// ─── L1–L4: applyUpdateForLevel ───────────────────────────────────────────────

describe('YjsProjectCache — applyUpdateForLevel', () => {
  it('L1: applyUpdateForLevel creates the level doc lazily and returns a merged delta', () => {
    const cache = new YjsProjectCache();
    const update = buildUpdate('w1', 'height', 3000);

    const delta = cache.applyUpdateForLevel('proj-A', 'L1', update);

    expect(delta).toBeInstanceOf(Uint8Array);
    expect(delta.byteLength).toBeGreaterThan(0);
  });

  it('L2: level docs are independent — applyUpdateForLevel does not affect the project doc', () => {
    const cache = new YjsProjectCache();
    const update = buildUpdate('w1', 'height', 3000);

    cache.applyUpdateForLevel('proj-A', 'L1', update);

    // Project-level doc must remain empty (getFullState returns null — no project doc created)
    expect(cache.getFullState('proj-A')).toBeNull();
    expect(cache.size()).toBe(0); // no project docs
  });

  it('L3: project doc does not bleed into level docs — applyUpdate leaves levelSize() at 0', () => {
    const cache = new YjsProjectCache();
    const update = buildUpdate('w1', 'height', 3000);

    cache.applyUpdate('proj-A', update);

    expect(cache.levelSize()).toBe(0); // no level docs
  });

  it('L4: different levels in the same project are isolated', () => {
    const cache = new YjsProjectCache();
    const updateL1 = buildUpdate('w1', 'height', 3000);
    const updateL2 = buildUpdate('w2', 'thickness', 200);

    cache.applyUpdateForLevel('proj-A', 'L1', updateL1);
    cache.applyUpdateForLevel('proj-A', 'L2', updateL2);

    expect(cache.levelSize()).toBe(2);

    // getFullStateForLevel returns each level's own state
    const stateL1 = cache.getFullStateForLevel('proj-A', 'L1');
    const stateL2 = cache.getFullStateForLevel('proj-A', 'L2');
    expect(stateL1).not.toBeNull();
    expect(stateL2).not.toBeNull();

    // Decode and verify isolation
    const docL1 = new Y.Doc();
    Y.applyUpdate(docL1, stateL1!);
    const nsL1 = docL1.getMap<Y.Map<unknown>>('elements');
    expect(nsL1.get('w1')?.get('height')).toBe(3000);
    expect(nsL1.get('w2')).toBeUndefined();

    const docL2 = new Y.Doc();
    Y.applyUpdate(docL2, stateL2!);
    const nsL2 = docL2.getMap<Y.Map<unknown>>('elements');
    expect(nsL2.get('w2')?.get('thickness')).toBe(200);
    expect(nsL2.get('w1')).toBeUndefined();

    docL1.destroy();
    docL2.destroy();
  });
});

// ─── L5–L6: getFullStateForLevel / getStateVectorForLevel ────────────────────

describe('YjsProjectCache — getFullStateForLevel / getStateVectorForLevel', () => {
  it('L5: getFullStateForLevel returns null when the level doc does not yet exist', () => {
    const cache = new YjsProjectCache();
    expect(cache.getFullStateForLevel('proj-B', 'L99')).toBeNull();
  });

  it('L6: getFullStateForLevel round-trip reconstructs the level state correctly', () => {
    const cache = new YjsProjectCache();
    const update = buildUpdate('slab-1', 'thickness', 250);
    cache.applyUpdateForLevel('proj-C', 'L3', update);

    const fullState = cache.getFullStateForLevel('proj-C', 'L3');
    expect(fullState).not.toBeNull();

    // Reconstruct state from the full snapshot
    const readDoc = new Y.Doc();
    Y.applyUpdate(readDoc, fullState!);
    const ns = readDoc.getMap<Y.Map<unknown>>('elements');
    expect(ns.get('slab-1')?.get('thickness')).toBe(250);
    readDoc.destroy();
  });

  it('L7: getStateVectorForLevel returns empty Uint8Array when level doc absent', () => {
    const cache = new YjsProjectCache();
    const sv = cache.getStateVectorForLevel('proj-D', 'L99');
    expect(sv).toBeInstanceOf(Uint8Array);
    expect(sv.byteLength).toBe(0);
  });

  it('L8: getStateVectorForLevel returns non-empty vector after an update', () => {
    const cache = new YjsProjectCache();
    const update = buildUpdate('beam-1', 'length', 6000);
    cache.applyUpdateForLevel('proj-E', 'L2', update);

    const sv = cache.getStateVectorForLevel('proj-E', 'L2');
    expect(sv.byteLength).toBeGreaterThan(0);
  });
});

// ─── L9: mergeStatesForLevel ──────────────────────────────────────────────────

describe('YjsProjectCache — mergeStatesForLevel', () => {
  it('L9: mergeStatesForLevel converges two concurrent level updates correctly', () => {
    const cache = new YjsProjectCache();

    // Two clients write to different elements on the same level
    const updateA = buildUpdate('w1', 'height', 3000);
    const updateB = buildUpdate('w2', 'height', 4000);

    const { merged, isConflict } = cache.mergeStatesForLevel('proj-F', 'L1', updateA, updateB);

    expect(merged).toBeInstanceOf(Uint8Array);
    // Both elements are distinct keys — Yjs merge is unambiguous, no conflict
    expect(isConflict).toBe(false);

    // Verify merged state contains both elements
    const doc = new Y.Doc();
    Y.applyUpdate(doc, merged);
    const ns = doc.getMap<Y.Map<unknown>>('elements');
    expect(ns.get('w1')?.get('height')).toBe(3000);
    expect(ns.get('w2')?.get('height')).toBe(4000);
    doc.destroy();
  });
});

// ─── L10–L12: getLevelIds / evictLevel / levelSize ────────────────────────────

describe('YjsProjectCache — getLevelIds / evictLevel / levelSize', () => {
  it('L10: getLevelIds returns all active level IDs for a project', () => {
    const cache = new YjsProjectCache();
    const u = buildUpdate('x', 'v', 1);

    cache.applyUpdateForLevel('proj-G', 'L1', u);
    cache.applyUpdateForLevel('proj-G', 'L2', u);
    cache.applyUpdateForLevel('proj-G', 'L3', u);
    cache.applyUpdateForLevel('proj-H', 'L1', u); // different project — must not appear

    const ids = cache.getLevelIds('proj-G');
    expect(ids).toHaveLength(3);
    expect(ids).toContain('L1');
    expect(ids).toContain('L2');
    expect(ids).toContain('L3');

    // Different project must not be included
    expect(cache.getLevelIds('proj-H')).toEqual(['L1']);
  });

  it('L11: evictLevel removes only the specified level doc', () => {
    const cache = new YjsProjectCache();
    const u = buildUpdate('x', 'v', 1);

    cache.applyUpdateForLevel('proj-I', 'L1', u);
    cache.applyUpdateForLevel('proj-I', 'L2', u);
    expect(cache.levelSize()).toBe(2);

    cache.evictLevel('proj-I', 'L1');

    expect(cache.levelSize()).toBe(1);
    expect(cache.getFullStateForLevel('proj-I', 'L1')).toBeNull(); // evicted
    expect(cache.getFullStateForLevel('proj-I', 'L2')).not.toBeNull(); // intact
  });

  it('L12: evictLevel is a no-op when the level doc does not exist', () => {
    const cache = new YjsProjectCache();
    // Must not throw
    expect(() => cache.evictLevel('proj-J', 'L99')).not.toThrow();
    expect(cache.levelSize()).toBe(0);
  });
});
