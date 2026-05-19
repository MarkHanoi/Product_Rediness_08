// Reload-persistence end-to-end test (S09 exit criterion).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09 exit criteria
// (line 779):
//   "Reload persists wall state correctly (event-log replay → store
//    rebuilt → committer → mesh restored)."
//
// This test exercises the full save → reload → render half-handshake:
//
//   1. SESSION 1 — `wall.create` × N events through CommandBus →
//      EventRecord captured per event.
//   2. SESSION 1 — those events feed the committer; we capture the
//      mesh count + the descriptor hashes (the canonical "scene state"
//      fingerprint).  All meshes are then disposed.
//   3. SESSION 2 — fresh WallStore, fresh CommitterHost, fresh
//      WallCommitter.  Replay each captured `EventRecord.forward`
//      patch against the new store via `attachStores`.  Each patch
//      drives the committer through `bindStore`.
//   4. ASSERT — the SceneRegistry now contains the same N walls with
//      the same descriptor hashes byte-for-byte.  This is the
//      "reload restored the scene" guarantee.
//
// THREE-only test — `plugins/wall/__tests__/` is allowlisted by
// `pryzm/no-three-outside-committer`.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { createId } from '@pryzm/plugin-sdk';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type EventRecord,
} from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { CommitterHost, bindStore, type BindStoreHandle } from '@pryzm/plugin-sdk';

const SYNC_SCHEDULE = (fn: () => void) => fn();
import {
  WallStore,
  type WallData,
  type WallsState,
} from '../src/store.js';
import { buildWallHandlerSet } from '../src/handlers/index.js';
import { WallCommitter } from '../src/committer/index.js';

interface Session {
  readonly host: CommitterHost;
  readonly committer: WallCommitter;
  readonly store: WallStore;
  readonly bus: CommandBus;
  readonly detachStores: () => void;
  readonly bindHandle: BindStoreHandle;
}

function buildSession(): Session {
  const store = new WallStore();
  const stores = {
    wall: store as unknown as import('@pryzm/stores').Store<object>,
  };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 't', projectId: 'p', clientId: 'c' },
    emitter,
    undoStack,
    storesProvider: () => ({
      wall: Object.fromEntries(store.getState()) as WallsState,
    }),
  });
  for (const h of buildWallHandlerSet()) bus.register(h);
  const detachStores = attachStores(emitter, stores);

  const host = new CommitterHost();
  const committer = new WallCommitter(host.materialPool);
  host.register(committer);
  const bindHandle = bindStore(store, 'wall', host, { scheduleFlush: SYNC_SCHEDULE });

  return { host, committer, store, bus, detachStores, bindHandle };
}

async function captureSceneFingerprint(
  host: CommitterHost,
): Promise<{ ids: string[]; hashes: Map<string, string> }> {
  // Wait one microtask so any pending bindStore flush has landed.
  await Promise.resolve();
  const ids: string[] = [];
  const hashes = new Map<string, string>();
  // Walk the committer host's scene-registry by introspecting each
  // registered Group's userData.  WallCommitter stamps the descriptor
  // hash on the Group as `userData.descriptorHash` for diagnostics.
  for (const id of host.registry.ids()) {
    ids.push(id);
    const root = host.registry.get(id) as THREE.Group | undefined;
    const hash = root?.userData?.descriptorHash;
    if (typeof hash === 'string') hashes.set(id, hash);
  }
  ids.sort();
  return { ids, hashes };
}

describe('reload persistence — events → store → committer → mesh restored', () => {
  it('replaying captured wall.create events into a fresh session restores the same scene fingerprint', async () => {
    // ─── SESSION 1: write three walls, capture EventRecords ──────────
    const s1 = buildSession();
    const events: EventRecord<unknown>[] = [];

    const ids = [createId('wall'), createId('wall'), createId('wall')];
    const dimensions = [
      { height: 2.4, thickness: 0.1 },
      { height: 2.7, thickness: 0.15 },
      { height: 3.0, thickness: 0.2 },
    ];
    for (let i = 0; i < ids.length; i++) {
      const ev = await s1.bus.executeCommand('wall.create', {
        id: ids[i]!,
        levelId: 'lvl_test',
        baseLine: [
          { x: i * 5, y: 0, z: 0 },
          { x: i * 5 + 4, y: 0, z: 0 },
        ] as unknown as [WallData['baseLine'][0], WallData['baseLine'][1]],
        height: dimensions[i]!.height,
        thickness: dimensions[i]!.thickness,
        materialColor: '#aabbcc',
      });
      events.push(ev);
    }
    await s1.bindHandle.flush();
    const before = await captureSceneFingerprint(s1.host);
    expect(before.ids).toHaveLength(3);
    expect(before.hashes.size).toBe(3);
    // Tear the first session down completely — meshes disposed,
    // material handles released, store reset.
    s1.bindHandle.dispose();
    s1.detachStores();
    s1.host.dispose();

    // ─── SESSION 2: fresh store + committer; replay captured patches ─
    const s2 = buildSession();
    for (const ev of events) {
      // The forward patches written by the handler are already routed
      // through `attachStores` when applied to the bus' store.  In a
      // real reload we replay them straight against the store — which
      // is what the persistence layer does on cold-load.
      s2.store.applyPatch(ev.forward);
    }
    await s2.bindHandle.flush();

    const after = await captureSceneFingerprint(s2.host);
    expect(after.ids).toEqual(before.ids);
    // Every wall's geometry hash must be byte-equal to the pre-reload
    // version — the committer rebuilt the mesh from the SAME inputs,
    // so the producer must yield the SAME descriptor hash.  This is
    // the "reload restored the scene" guarantee.
    for (const id of before.ids) {
      expect(after.hashes.get(id)).toBe(before.hashes.get(id));
    }

    s2.bindHandle.dispose();
    s2.detachStores();
    s2.host.dispose();
  });
});
