// Dispatcher unit tests (S05-T4 + T5).
//
// Spec slice exercised:
//   • `bindStore<T>(store, primitiveType, host)` returns a Disposable
//     that subscribes to the store's dirty diffs (T-S4).
//   • Per-tick batching: multiple `applyPatch` calls fold into ONE
//     `commitBatch` call carrying the coalesced delta list (T-S5).
//   • Coalescing matrix:
//       add → update     ⇒ single `add` carrying the latest DTO
//       add → remove     ⇒ no delta emitted (net no-op)
//       remove → re-add  ⇒ single `update` (id was in scene before tick)
//   • OTel attributes on `pryzm.scene.commit.batch` include
//     `pryzm.scene.added/updated/removed` counts.
//
// We use a no-op committer that records its calls — the THREE side
// is exercised by `cube-committer-e2e.test.ts` and the new
// `cube-100-smoke.test.ts` (T-S7).

import { describe, expect, it } from 'vitest';
import type * as THREE from '@pryzm/renderer-three/three';
import { CubeStore, type CubeDto } from '@pryzm/stores';
import { CommitterHost, bindStore, diffToDeltas, type SceneDelta } from '../src/index.js';
import type { ElementId, PrimitiveCommitter } from '../src/types.js';

interface RecordedCall {
  kind: 'add' | 'update' | 'remove';
  id: ElementId;
  dto?: CubeDto;
}

class RecordingCommitter implements PrimitiveCommitter<CubeDto> {
  readonly primitiveType = 'cube';
  readonly calls: RecordedCall[] = [];
  // Use a shared sentinel object so the registry has SOMETHING to bind.
  private readonly nodes = new Map<ElementId, THREE.Object3D>();
  onAdd(id: ElementId, dto: CubeDto): THREE.Object3D {
    this.calls.push({ kind: 'add', id, dto });
    const node = { isObject3D: true, type: 'Mesh', name: id } as unknown as THREE.Object3D;
    this.nodes.set(id, node);
    return node;
  }
  onUpdate(id: ElementId, dto: CubeDto): void {
    this.calls.push({ kind: 'update', id, dto });
  }
  onRemove(id: ElementId): void {
    this.calls.push({ kind: 'remove', id });
    this.nodes.delete(id);
  }
  onDispose(): void {
    this.nodes.clear();
  }
}

/** Synchronous scheduler — runs `flush` immediately on schedule.
 *  This makes tests deterministic without a microtask flush helper. */
const SYNC_SCHEDULE = (flush: () => void): void => {
  flush();
};

const ADD = (id: string, dto: CubeDto) => ({
  op: 'add' as const,
  path: [id],
  value: dto,
});
const REPLACE = (id: string, dto: CubeDto) => ({
  op: 'replace' as const,
  path: [id],
  value: dto,
});
const REMOVE = (id: string) => ({ op: 'remove' as const, path: [id] });

function makeHost() {
  const host = new CommitterHost();
  const committer = new RecordingCommitter();
  host.register(committer);
  return { host, committer };
}

describe('diffToDeltas (pure)', () => {
  it('emits removes → adds → updates in that order, dropping ids missing from snapshot', () => {
    const snapshot = new Map<string, CubeDto>([
      ['a', { x: 1, y: 0, z: 0 }],
      ['b', { x: 0, y: 2, z: 0 }],
    ]);
    const diff = {
      added: new Set(['a']),
      updated: new Set(['b']),
      removed: new Set(['c']),
    };
    const deltas = diffToDeltas(diff, snapshot, 'cube');
    expect(deltas.map((d) => `${d.kind}:${d.id}`)).toEqual([
      'remove:c',
      'add:a',
      'update:b',
    ]);
  });

  it('skips an id flagged "added" but absent from snapshot (race)', () => {
    const snapshot = new Map<string, CubeDto>();
    const diff = { added: new Set(['ghost']), updated: new Set<string>(), removed: new Set<string>() };
    expect(diffToDeltas(diff, snapshot, 'cube')).toEqual([]);
  });
});

describe('bindStore — single diff', () => {
  it('flushes a single store.applyPatch as ONE commitBatch call', async () => {
    const { host, committer } = makeHost();
    const store = new CubeStore();
    const handle = bindStore(store, 'cube', host, { scheduleFlush: SYNC_SCHEDULE });

    store.applyPatch([ADD('c1', { x: 1, y: 2, z: 3 })]);
    // SYNC_SCHEDULE means the flush already ran.
    expect(committer.calls).toEqual([{ kind: 'add', id: 'c1', dto: { x: 1, y: 2, z: 3 } }]);
    expect(host.registry.size()).toBe(1);

    handle.dispose();
  });

  it('manual flush() is a no-op when nothing pending', async () => {
    const { host } = makeHost();
    const store = new CubeStore();
    const handle = bindStore(store, 'cube', host, { scheduleFlush: SYNC_SCHEDULE });
    await expect(handle.flush()).resolves.toBeUndefined();
    handle.dispose();
  });
});

describe('bindStore — coalescing across diffs (per-tick batching)', () => {
  it('add → update folds into a SINGLE add carrying the latest DTO', async () => {
    const { host, committer } = makeHost();
    const store = new CubeStore();
    // Capture flushes — buffer them so we control timing.
    const pending: Array<() => void> = [];
    const handle = bindStore(store, 'cube', host, {
      scheduleFlush: (f) => pending.push(f),
    });

    store.applyPatch([ADD('c1', { x: 0, y: 0, z: 0 })]);
    store.applyPatch([REPLACE('c1', { x: 9, y: 9, z: 9 })]);
    expect(committer.calls).toEqual([]); // not flushed yet
    expect(pending.length).toBe(1); // schedule was deduped

    pending[0]!();
    // Microtask drain so the async flush settles.
    await Promise.resolve();
    await handle.flush();

    expect(committer.calls).toEqual([{ kind: 'add', id: 'c1', dto: { x: 9, y: 9, z: 9 } }]);
    handle.dispose();
  });

  it('add → remove within one tick collapses to NO delta', async () => {
    const { host, committer } = makeHost();
    const store = new CubeStore();
    const handle = bindStore(store, 'cube', host, { scheduleFlush: SYNC_SCHEDULE });

    // Apply both patches BEFORE the sync schedule fires the flush.  The
    // way to do that here is to run them inside one applyPatch call so
    // the listener fires once with no diff, OR to dispose and re-apply.
    // The dispatcher's coalescing is across SEPARATE diffs — so we
    // exercise that path by adding then removing in two calls and
    // ensuring the SYNC schedule ran twice but produced empty deltas
    // the second time:
    //
    // Trick: replace SYNC_SCHEDULE with a buffer scheduler so we can
    // control flush ordering precisely.
    handle.dispose();

    const buffered: Array<() => void> = [];
    const handle2 = bindStore(store, 'cube', host, {
      scheduleFlush: (f) => buffered.push(f),
    });
    store.applyPatch([ADD('c2', { x: 1, y: 1, z: 1 })]);
    store.applyPatch([REMOVE('c2')]);
    expect(buffered.length).toBe(1);
    buffered[0]!();
    await Promise.resolve();
    await handle2.flush();
    expect(committer.calls).toEqual([]); // collapsed entirely
    handle2.dispose();
  });

  it('remove → re-add within one tick collapses to a single update', async () => {
    const { host, committer } = makeHost();
    const store = new CubeStore();
    // Seed the scene with c1 (synchronous flush so it lands in the registry).
    const handle = bindStore(store, 'cube', host, { scheduleFlush: SYNC_SCHEDULE });
    store.applyPatch([ADD('c1', { x: 0, y: 0, z: 0 })]);
    expect(host.registry.has('c1')).toBe(true);
    expect(committer.calls).toEqual([{ kind: 'add', id: 'c1', dto: { x: 0, y: 0, z: 0 } }]);
    handle.dispose();

    // Now the actual scenario: buffered scheduler so remove + re-add land in the same tick.
    const buffered: Array<() => void> = [];
    const handle2 = bindStore(store, 'cube', host, {
      scheduleFlush: (f) => buffered.push(f),
    });
    store.applyPatch([REMOVE('c1')]);
    store.applyPatch([ADD('c1', { x: 5, y: 5, z: 5 })]);
    expect(buffered.length).toBe(1);
    buffered[0]!();
    await Promise.resolve();
    await handle2.flush();
    // After folding: pending.added(c1)→after remove path becomes pending.updated(c1)→
    // dispatched as `update` carrying the latest DTO.
    expect(committer.calls.slice(1)).toEqual([
      { kind: 'update', id: 'c1', dto: { x: 5, y: 5, z: 5 } },
    ]);
    handle2.dispose();
  });
});

describe('bindStore — dispose semantics', () => {
  it('dispose() detaches the listener; subsequent diffs are ignored', async () => {
    const { host, committer } = makeHost();
    const store = new CubeStore();
    const handle = bindStore(store, 'cube', host, { scheduleFlush: SYNC_SCHEDULE });
    handle.dispose();
    store.applyPatch([ADD('c1', { x: 0, y: 0, z: 0 })]);
    expect(committer.calls).toEqual([]);
  });

  it('disposing AFTER schedule but BEFORE flush drops the pending batch', async () => {
    const { host, committer } = makeHost();
    const store = new CubeStore();
    const buffered: Array<() => void> = [];
    const handle = bindStore(store, 'cube', host, {
      scheduleFlush: (f) => buffered.push(f),
    });
    store.applyPatch([ADD('c1', { x: 0, y: 0, z: 0 })]);
    expect(buffered.length).toBe(1);
    handle.dispose();
    buffered[0]!();
    await Promise.resolve();
    expect(committer.calls).toEqual([]);
  });
});

describe('OTel — pryzm.scene.commit.batch carries added/updated/removed counts', () => {
  it('passes per-kind counts to commitBatchWithCounts on every flush', async () => {
    const { host } = makeHost();
    const calls: Array<{ deltas: SceneDelta[]; attrs: Record<string, unknown> }> = [];
    // Spy: wrap commitBatchWithCounts and capture.  We don't spin up a
    // real OTel SDK here — asserting that the dispatcher calls the
    // counts-aware host method with the right attrs is sufficient
    // (otel.ts forwards span attrs verbatim).  An end-to-end OTel
    // assertion lives in the bench harness's idle-cpu suite (S03).
    const orig = host.commitBatchWithCounts.bind(host);
    host.commitBatchWithCounts = async (deltas, attrs) => {
      calls.push({ deltas: [...deltas], attrs: { ...attrs } });
      return orig(deltas, attrs);
    };

    const store = new CubeStore();
    const buffered: Array<() => void> = [];
    const handle = bindStore(store, 'cube', host, {
      scheduleFlush: (f) => buffered.push(f),
    });

    // Batch 1 — pure adds.
    store.applyPatch([ADD('a', { x: 0, y: 0, z: 0 })]);
    store.applyPatch([ADD('b', { x: 0, y: 0, z: 0 })]);
    expect(buffered.length).toBe(1);
    buffered.shift()!();
    await Promise.resolve();
    await handle.flush();

    // Batch 2 — pure updates.
    store.applyPatch([REPLACE('a', { x: 1, y: 1, z: 1 })]);
    store.applyPatch([REPLACE('b', { x: 2, y: 2, z: 2 })]);
    expect(buffered.length).toBe(1);
    buffered.shift()!();
    await Promise.resolve();
    await handle.flush();

    // Batch 3 — mixed: remove + add.
    store.applyPatch([REMOVE('a')]);
    store.applyPatch([ADD('c', { x: 3, y: 3, z: 3 })]);
    expect(buffered.length).toBe(1);
    buffered.shift()!();
    await Promise.resolve();
    await handle.flush();

    expect(calls.map((c) => c.attrs)).toEqual([
      { 'pryzm.scene.added': 2, 'pryzm.scene.updated': 0, 'pryzm.scene.removed': 0 },
      { 'pryzm.scene.added': 0, 'pryzm.scene.updated': 2, 'pryzm.scene.removed': 0 },
      { 'pryzm.scene.added': 1, 'pryzm.scene.updated': 0, 'pryzm.scene.removed': 1 },
    ]);
    handle.dispose();
  });
});
