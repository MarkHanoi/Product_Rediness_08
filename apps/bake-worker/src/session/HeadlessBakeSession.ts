// apps/bake-worker/session/HeadlessBakeSession.ts — bake-side runtime.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 631 — "the bake worker is the first deployment of
//      @pryzm/headless in a real production-like context.  It runs the
//      same geometry producers that run in the browser worker — but in
//      a Node `worker_thread`."
//   • S21 lines 798-822 — pseudocode showing session creation +
//      command-bus replay + producer invocation.
//
// Implementation notes:
//   • A bake session wires CommandBus + WallStore + the wall plugin
//     handlers.  Other element families (slab, door, …) layer in as
//     additional plugins land — wall is the only fully-baked family
//     in S21 (per `PHASE-1D §S19 D5` join handshake).
//   • The session is per-job — there is no cross-job state.  This
//     matches the v0 incremental bake decision: full event-batch
//     replay rather than chunk-state hydration (deferred to S23).
//   • `produceWallDescriptors()` is the bake-time twin of the editor's
//      committer — it translates wall DTOs into ChunkWriter input.

import { CommandBus, PatchEmitter } from '@pryzm/command-bus';
import { produceWall } from '@pryzm/geometry-kernel';
import { NO_JOINS } from '@pryzm/geometry-kernel';
import {
  CreateWallHandler,
  DeleteWallHandler,
  MoveWallHandler,
  SetWallDimensionsHandler,
  SetWallColorHandler,
  WallStore,
  type WallData,
} from '@pryzm/plugin-wall';
import type { ChunkGeometryDescriptor } from '@pryzm/persistence-client';

export interface BakeSessionOptions {
  readonly projectId: string;
  readonly actorId?: string;
}

export interface BakeSession {
  readonly commandBus: CommandBus;
  readonly walls: WallStore;
  /** Drop session resources (clears stores, drops listeners). */
  dispose(): Promise<void>;
}

/** Build a fresh per-job bake session.  No cross-session state. */
export function createBakeSession(opts: BakeSessionOptions): BakeSession {
  const projectId = opts.projectId;
  const actorId = opts.actorId ?? 'bake-worker';

  const walls = new WallStore();
  const patches = new PatchEmitter();

  // The bus's `storesProvider` returns the snapshot map of every store
  // it can serve to handlers.  Wall is the only S21 family — slab,
  // door, window, stair plug in once their handlers + producers
  // promote out of S08–S14 land (already done).  Adding them here is
  // a one-line change per family; we keep the bake worker minimal.
  const bus = new CommandBus({
    emitter: patches,
    storesProvider: (ids) => {
      const snap: Record<string, unknown> = {};
      for (const id of ids) {
        if (id === 'wall') snap.wall = Object.fromEntries(walls.getState());
      }
      return snap;
    },
    audit: {
      actorId,
      projectId,
      clientId: 'bake-worker',
    },
  });

  // Wire patches → store so the bus's emitted forward patches land
  // back in the WallStore — the bake session is a closed loop.
  // PatchEmitter listener signature is `(bytes, record)` per
  // `packages/command-bus/src/PatchEmitter.ts:20` — we ignore the
  // wire bytes and read patches off the EventRecord.
  patches.subscribe((_bytes, record) => {
    for (const entry of record.patches) {
      if (entry.storeKey === 'wall') {
        walls.applyPatch(entry.forwardPatches);
      }
    }
  });

  // Register the wall plugin's full handler set.  S21 covers the 5
  // S07-T4 handlers (create / delete / move / setDimensions /
  // setColor); the long-tail handlers (joins, openings, level
  // changes) land alongside the corresponding sync-server payload
  // shapes in S22 D2 / D3.
  bus.register(new CreateWallHandler());
  bus.register(new DeleteWallHandler());
  bus.register(new MoveWallHandler());
  bus.register(new SetWallDimensionsHandler());
  bus.register(new SetWallColorHandler());

  return {
    commandBus: bus,
    walls,
    async dispose(): Promise<void> {
      // Nothing async to drain — but the contract is symmetric with
      // headless runtime + future BullMQ worker shutdown.
    },
  };
}

/**
 * Translate every WallData on a level into a ChunkWriter-shaped
 * descriptor by invoking the canonical wall producer.  The bake
 * worker's RebakeChunkJob calls this immediately before ChunkWriter.write.
 *
 * `joinData` is `NO_JOINS` for v0 — neighbour-resolution lives with
 * the LevelStore (Phase 1C); the bake worker can re-derive joins once
 * the level store is wired into HeadlessBakeSession (S22 D2).
 *
 * `worldY` is `0` — the level-elevation lookup also lives with the
 * LevelStore.  S21 v0 bakes everything at floor 0 since the K1D-2
 * 5K-wall fixture is single-level (per spec line 884).
 */
export function produceWallDescriptors(
  walls: WallStore,
  levelId: string,
): ChunkGeometryDescriptor[] {
  const out: ChunkGeometryDescriptor[] = [];
  const wallDtos: readonly WallData[] = walls.byLevel(levelId);
  for (const w of wallDtos) {
    const desc = produceWall(w, NO_JOINS, 0);
    out.push({
      sourceId: w.id,
      position: desc.position,
      normal: desc.normal,
      uv: desc.uv,
      index: desc.index,
      ...(w.materialId !== undefined ? { materialId: w.materialId } : {}),
      ...(desc.hash !== undefined ? { geometryHash: desc.hash } : {}),
    });
  }
  return out;
}
