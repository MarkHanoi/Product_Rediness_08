// authoritativeElementMirror — §MT-01-COMPOSED-BUS-READBACK (ADR-0318 I-2).
//
// ─── WHAT THIS CLOSES, MEASURED ─────────────────────────────────────────────
//
// MT-01 said `wall.create` / `slab.create` are "readback-negative — the plugin
// handlers write DTO stores nobody reads", and the 2026-08-16 restamp attributed
// that to the engine half being unattached (`isEngineAttached() === false`, so
// `CreateWallHandler.canExecute` refuses).
//
// **That attribution was only the outer skin, and it was measured wrong.** On the
// runtime `composeRuntime()` produces, with the engine half ATTACHED exactly the
// way `apps/editor/src/engine/initBuilders.ts` attaches it
// (`wallStore.attachEngine(projectContext, bimKernel)` → `isEngineAttached()`
// true), the census read:
//
//     [K1/AFTER] engineAttached wall/slab/room: true true true
//     [K1/AFTER] wall.create → DISPATCH OK
//     [K1/AFTER] AUTHORITATIVE wall readback: ABSENT
//     [K1/AFTER] slab.create → DISPATCH OK
//     [K1/AFTER] AUTHORITATIVE slab readback: ABSENT
//
// So attaching the engine does NOT make the create land — it converts an honest
// refusal back into a SILENT FALSE SUCCESS. The only reason the browser works is
// that a SEPARATE L7 subscriber (`initTools.ts` §P2.1 for wall, §FT1 for slab)
// listens for the `*.created` event and performs the authoritative `add()`. The
// handlers' three-valued predicate treats "engine attached" as PROOF that
// subscriber exists; nothing checks it, and the census above falsified it in a
// process where the engine was attached and no subscriber existed.
//
// ADR-0318 I-2 says population of the authoritative element stores is the
// COMPOSITION ROOT's job, never a plugin's. This module is that job, for the one
// kind where it can be done without minting a rival — see the census below.
//
// ─── WHY IT CANNOT REGRESS THE BROWSER ──────────────────────────────────────
//
// Two independent guarantees, both from source rather than from intent:
//
//  1. ORDER. `PatchEmitter.listeners` is a `Set` (insertion order) and
//     `EventBus.emit` is fully synchronous. `wireCommandEventBridge` subscribes
//     at composeRuntime.ts:898; this mirror subscribes strictly after it. So by
//     the time this listener runs, CommandEventBridge has already emitted
//     `wall.created` AND every synchronous subscriber of it — including the L7
//     §P2.1 bridge, which owns the §G3-STALE-FIX ordering (VDT + bimManager
//     registration BEFORE `add()`) — has already completed.
//
//  2. DEDUP. The mirror adds only when `store.getById(id)` is still empty. In the
//     browser the §P2.1 bridge has always already added by then, so this listener
//     is a provable no-op. Before the engine boots, `isEngineAttached()` is false
//     (`initBuilders.ts` attaches at the same boot) and the mirror skips — which
//     is correct, because `WallStore.add()` would refuse anyway rather than
//     invent a level (ADR-0318 I-3).
//
// ─── WHY THE RECORD IS COPIED VERBATIM ──────────────────────────────────────
//
// The §P2.1 bridge rebuilds the wall from a FIELD WHITELIST, and L-927 recorded
// what that costs: `materialColor`, `layers` and `curve` were each a separate
// founder-visible defect, fixed one field at a time, because a field the whitelist
// did not know about could never arrive. This mirror copies the COMMITTED record
// — the value of the handler's own Immer `add` patch, i.e. the `Wall.parse(...)`
// output — with no field list at all, so a field added to the schema tomorrow is
// carried without anyone remembering this file exists.
//
// MEASURED that this is possible rather than assumed: the committed wall record
// (keys baseLine,baseOffset,childrenIds,confidence,height,id,levelId,metadata,
// openings,parentId,provenance,thickness,type) was fed verbatim to the
// authoritative `wallStore.add()` and came back
// `VERBATIM → ACCEPTED; readback: PRESENT`.

/** The shape this module needs from an authoritative element store. */
export interface MirrorTargetStore {
  getById(id: string): unknown;
  add(record: never): void;
  /** ADR-0318 I-3 — present on the migrated singletons; absent ⇒ unjudgeable. */
  isEngineAttached?(): boolean;
}

/** The shape this module needs from the authoritative store registry. */
export interface AuthoritativeStoreLookup {
  getStoreForType(kind: string): unknown;
}

interface PatchLike {
  readonly op: string;
  readonly path: readonly (string | number)[];
  readonly value?: unknown;
}

interface EventRecordLike {
  readonly type: string;
  readonly forward?: readonly PatchLike[];
}

interface PatchEmitterLike {
  subscribe(listener: (bytes: Uint8Array, record: EventRecordLike) => void): () => void;
}

/**
 * Command types whose Immer `add` patches carry a record the AUTHORITATIVE store
 * for `kind` accepts verbatim. Both wall verbs declare `affectedStores: ['wall']`
 * and write `draft[id] = wall`, so the forward patch is `{op:'add', path:[id]}`
 * with the committed record as its value (the same fact `CommandEventBridge`'s
 * `indexCommittedWalls` already relies on).
 */
const MIRRORED: ReadonlyMap<string, string> = new Map([
  ['wall.create', 'wall'],
  ['wall.batch.create', 'wall'],
]);

/**
 * §CONTEXT-DATA-HONESTY / C70 L-INV-1 — the kinds this mirror does NOT cover, and
 * why, enumerated rather than silently omitted. "I found nothing" and "I could not
 * look" are never the same value, and neither is "not mirrored" and "nothing to
 * mirror".
 *
 * Exported so a probe can assert the census rather than trusting this comment.
 */
export const UNMIRRORED_KINDS: readonly {
  readonly kind: string;
  readonly commandTypes: readonly string[];
  readonly reason: string;
}[] = [
  {
    kind: 'slab',
    commandTypes: ['slab.create', 'slab.batch.create'],
    reason:
      'SHAPE MISMATCH, measured: the committed plugin record (keys baseOffset,boundary,childrenIds,' +
      'confidence,holes,id,levelId,metadata,parentId,provenance,thickness,type) is REJECTED verbatim by ' +
      "the authoritative SlabStore — `[{code:'invalid_type', path:['position']}]`. The authoritative shape " +
      'is polygon/position/width/depth/ifcData; the plugin shape is `boundary`. Mirroring slab would ' +
      'therefore require a SECOND translation, rival to the one apps/editor/src/engine/initTools.ts §FT1 ' +
      'already performs — and two translations of the same record drift silently, which is the exact ' +
      'defect CreateRoom.ts refuses on principle. The fix is to unify the two SlabData shapes (or move ' +
      "§FT1's translation down to the composition root), not to copy it.",
  },
  {
    kind: 'room',
    commandTypes: ['room.create'],
    reason:
      'NO PATCH PAIR EXISTS. `CreateRoomHandler` declares `affectedStores: []` and returns ' +
      '`{forward: [], inverse: []}` — it delegates to `window.commandManager.execute(new CreateRoomCommand)`. ' +
      'A patch-driven mirror has nothing to read. `room.create` is a separate defect from the readback one: ' +
      'its only authoritative write path is a window global, which is a P1/P6 breach in its own right, and ' +
      'headlessly it throws by name rather than lying.',
  },
];

/**
 * Wire the composition root's authoritative-element mirror.
 *
 * @param patches the CommandBus patch emitter (`inner.bus.patches`) — MUST be
 *   subscribed AFTER `wireCommandEventBridge` so every synchronous consumer of the
 *   typed `*.created` events has already run (see ORDER above).
 * @param lookup the authoritative store registry (`storeRegistry`).
 * @returns a disposer for `runtime.tearDown()`.
 */
export function wireAuthoritativeElementMirror(
  patches: PatchEmitterLike,
  lookup: AuthoritativeStoreLookup,
): () => void {
  return patches.subscribe((_bytes, record) => {
    const kind = MIRRORED.get(record.type);
    if (kind === undefined) return;

    const store = lookup.getStoreForType(kind) as MirrorTargetStore | undefined;
    // No authoritative store registered in this process — the handler's own patch
    // pair is the whole contract here (the same three-valued census the handlers
    // run). Nothing is being lied about, so there is nothing to mirror.
    if (
      store === undefined ||
      store === null ||
      typeof store.add !== 'function' ||
      typeof store.getById !== 'function'
    ) {
      return;
    }
    // ADR-0318 I-3 — an unattached store REFUSES rather than invent a level. The
    // handler already refused upstream in that case, so this is belt-and-braces:
    // never turn the store's honest refusal into a caught-and-logged exception.
    if (typeof store.isEngineAttached === 'function' && !store.isEngineAttached()) return;

    for (const patch of record.forward ?? []) {
      if (patch.op !== 'add' || patch.path.length !== 1) continue;
      const value = patch.value;
      if (value === null || typeof value !== 'object') continue;
      const id = String(patch.path[0]);
      if (id.length === 0) continue;
      // DEDUP — a synchronous subscriber (the browser's §P2.1 bridge) has already
      // mirrored this record, and it owns the §G3-STALE-FIX registration ordering.
      // Leave it alone.
      const existing = store.getById(id);
      if (existing !== undefined && existing !== null) continue;
      try {
        store.add(value as never);
      } catch (err) {
        // Loud-fail-soft: the store's refusals are real answers (a level that does
        // not exist, a schema violation) and must be visible, but one bad record
        // must not break the command pipeline.
        console.error(
          `[runtime-composer/authoritativeElementMirror] ${kind} ${id}: ` +
            `authoritative add refused (command ${record.type}):`,
          err,
        );
      }
    }
  });
}
