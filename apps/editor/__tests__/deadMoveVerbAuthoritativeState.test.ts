/**
 * §PROBE-DEAD-MOVE-VERB (W3-4) — the MOVE/ROTATE half of the Class-A dead-verb
 * family, probed the same way `deadVerbAuthoritativeState.test.ts` probed the
 * property half at §FIX-DEAD-VERB-REFUSE.
 *
 * THE DEFECT CLASS. A `<kind>.move` / `<kind>.rotate` command resolves
 * successfully, produces a textbook-correct Immer patch pair against
 * `ctx.stores.<kind>`, and changes nothing any renderer, exporter, 2-D
 * projector or persistence path will ever read. In production the bus's
 * `storesProvider` (`apps/editor/src/bootstrap.ts:92-97` →
 * `storesAsRecordView(stores)`) hands handlers a snapshot of the FRESH plugin
 * DTO stores built by `PluginRegistry.ALL_PLUGINS` (`new SlabStore()`,
 * `new BeamStore()`, …), while every authoritative consumer reads the legacy
 * geometry singletons (`window.slabStore`, `window.beamStore`, …). Only
 * `<family>.created` is mirrored across; there is no update bridge either way.
 *
 * WHY THIS FAMILY IS SEPARATELY DANGEROUS. Unlike the property verbs, the move
 * verbs have a LIVE TWIN with a different name for every family that a user can
 * actually drag — `wall.updateBaseline`, `door.setOffset`, `window.setOffset`,
 * `column.update`, `beam.update`, `roof.update`, `stair.move`,
 * `plumbing.moveFixture`, `furniture.updateParameters`, `slab.movePolygon`,
 * `handrail.moveBaseLine`, `room.updateBoundary`. The ONE table that decides
 * what a move dispatches is `MOVE_COMMAND_BY_TYPE`
 * (`apps/editor/src/engine/transforms/elementMove.ts:102-127`), and the 3-D
 * gizmo's own list is the 13 `dragDispatch(...)` sites in
 * `registerTransformDragHandler.ts`. NEITHER contains a single verb probed
 * below. So these verbs are a dead PARALLEL family: refusing them costs a user
 * nothing, and leaving them silent keeps a second, lying mutation path alive
 * against P6.
 *
 * WHY A `success === true` ASSERTION IS NOT A PROBE. Every verb below resolves
 * today, and each has a green unit test proving its plugin-store patch. Those
 * tests measure the WRONG STORE — several of the files say so in their own
 * comments. This file asks instead: *what exact property in AUTHORITATIVE state
 * proves this move happened?* and measures THAT, independently of the command's
 * own return value.
 *
 *     RESOLVED SUCCESSFULLY  ⇒  the authoritative record changed.
 *
 * Its contrapositive is the only fix allowed: a verb that cannot reach
 * authoritative state must REFUSE, out loud, with a reason (C03 §4.6 U-4 —
 * "failure and emptiness are never the same value").
 *
 * TWO POSITIVE CONTROLS, because a probe that fails for everything proves only
 * that the probe is broken:
 *   • `room.move`       — bridges to `commandManager` → `UpdateRoomBoundaryCommand`
 *                         → the legacy roomStore. A REAL live move verb.
 *   • `annotation.move` — writes the CANONICAL `annotationStore` singleton the
 *                         AnnotationRenderLayer and ProjectSerializer read
 *                         (§ANN-ONE-STORE), not only the derived ledger. Also a
 *                         REAL live move verb, and the reason it is NOT refused.
 *
 * CONTRACTS: C03 §2 (commands are the only mutation path), C03 §4.1/§4.6 (undo
 * patch routing), C16 §5.1 CA-17/CA-18 (liveness), P6.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';

// Imported by path so this file needs no new workspace dependency edge.
import { MoveWallHandler } from '../../../plugins/wall/src/handlers/MoveWall';
import { TransformWallHandler } from '../../../plugins/wall/src/handlers/TransformWall';
import { MoveDoorHandler } from '../../../plugins/door/src/handlers/MoveDoor';
import { MoveWindowHandler } from '../../../plugins/window/src/handlers/MoveWindow';
import { MoveSlabHandler } from '../../../plugins/slab/src/handlers/MoveSlab';
import { MoveBeamHandler } from '../../../plugins/beam/src/handlers/MoveBeam';
import { MoveColumnHandler } from '../../../plugins/column/src/handlers/MoveColumn';
import { MoveRoofHandler } from '../../../plugins/roof/src/handlers/MoveRoof';
import { MoveFurnitureHandler } from '../../../plugins/furniture/src/handlers/MoveFurniture';
import { RotateFurnitureHandler } from '../../../plugins/furniture/src/handlers/RotateFurniture';
import { MoveLightingHandler } from '../../../plugins/lighting/src/handlers/MoveLighting';
import { MovePlumbingHandler } from '../../../plugins/plumbing/src/handlers/MovePlumbing';
import { MoveStructuralHandler } from '../../../plugins/structural/src/handlers/MoveStructural';
import { RotateStairHandler } from '../../../plugins/stair/src/handlers/RotateStair';
import { MoveDimensionHandler } from '../../../plugins/dimensions/src/handlers/MoveDimension';
import { MoveSectionLineHandler } from '../../../plugins/section-view/src/handlers/MoveSectionLine';
// Positive control.
import { MoveRoomHandler } from '../../../plugins/rooms/src/handlers/MoveRoom';

// ── The harness ──────────────────────────────────────────────────────────────

type AnyHandler = { readonly type: string; readonly affectedStores: readonly string[] };

const ELEMENT_ID = 'probe-element-1';
const DELTA = { x: 1.5, y: 0, z: -2 };

/** A pushed ring-buffer entry, captured verbatim from the CommandBus. */
interface CapturedPair {
  readonly forward: { ops: ReadonlyArray<{ op: string; path: string; value?: unknown }> };
  readonly inverse: { ops: ReadonlyArray<{ op: string; path: string; value?: unknown }> };
  readonly affectedStores: readonly string[];
}

interface Harness {
  readonly bus: CommandBus;
  /** The plugin DTO snapshot the bus hands to handlers — the write-only sink. */
  readonly dto: Record<string, Record<string, Record<string, unknown>>>;
  /** Stand-in for the LEGACY geometry store every renderer/exporter reads. */
  readonly legacy: Record<string, unknown>;
  /** Every PatchPair the bus pushed to the ring buffer. */
  readonly pushed: CapturedPair[];
}

/**
 * Build a bus wired exactly like production: a plugin DTO record snapshot as
 * `ctx.stores`, and a SEPARATE legacy record that nothing bridges to. `seed` is
 * the element shape the family's handler expects (a slab needs `boundary`, a
 * beam needs `baseLine`, …) — a generic seed would make handlers throw and turn
 * every row green for the wrong reason.
 */
function makeHarness(
  handlers: readonly AnyHandler[],
  storeKey: string | null,
  seed: Record<string, unknown> = {},
): Harness {
  const dto: Record<string, Record<string, Record<string, unknown>>> = {};
  const legacy: Record<string, unknown> = {};
  if (storeKey) {
    dto[storeKey] = { [ELEMENT_ID]: { id: ELEMENT_ID, levelId: 'L0', ...structuredClone(seed) } };
    // The authoritative record starts life identical — a bridge, if one
    // existed, would keep the two in step.
    legacy[storeKey] = structuredClone(dto[storeKey]![ELEMENT_ID]);
  }

  const pushed: CapturedPair[] = [];
  const bus = new CommandBus({
    // Real AuditDefaults shape: the PatchEmitter MessagePack-encodes the whole
    // EventRecord, so a stray function in `audit` makes EVERY dispatch throw and
    // every row read "REFUSED" — a probe that is green for the wrong reason. The
    // positive controls below exist to catch exactly that.
    audit: { actorId: 'probe', projectId: 'probe', clientId: 'probe' },
    storesProvider: () => dto,
  } as never);
  (bus as unknown as { setRingBuffer(rb: unknown): void }).setRingBuffer({
    push: (pair: CapturedPair) => { pushed.push(pair); },
  });
  for (const h of handlers) bus.register(h as never);
  return { bus, dto, legacy, pushed };
}

type Outcome =
  | { readonly status: 'resolved' }
  | { readonly status: 'refused'; readonly reason: string };

async function dispatch(bus: CommandBus, type: string, payload: unknown): Promise<Outcome> {
  try {
    await bus.executeCommand(type, payload);
    return { status: 'resolved' };
  } catch (e) {
    return { status: 'refused', reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * THE PROBE. Returns a one-line verdict so a failure reads as English rather
 * than `expected false to be true`.
 *
 * `SILENT SUCCESS` is the defect. `REACHED` and `REFUSED` are both acceptable —
 * the first does the work, the second says out loud that it cannot.
 */
function verdictOf(
  verb: string,
  outcome: Outcome,
  authoritativeBefore: unknown,
  authoritativeAfter: unknown,
): string {
  const changed = JSON.stringify(authoritativeBefore) !== JSON.stringify(authoritativeAfter);
  if (outcome.status === 'refused') {
    // A refusal produced by the HARNESS (bad store wiring, unregistered verb,
    // a seed the handler cannot read) is not evidence about the verb — it would
    // make every row read "REFUSED" and turn the whole probe green for the wrong
    // reason. Name it as a broken probe, and fail on it.
    if (/missing from HandlerContext|no handler registered for|Unrecognized object|is not a function|is not defined|Cannot read prop|not found: /.test(outcome.reason)) {
      return `HARNESS ERROR — ${verb}: ${outcome.reason}`;
    }
    return outcome.reason.trim().length > 0
      ? `REFUSED — ${verb}: ${outcome.reason}`
      : `EMPTY REFUSAL — ${verb} refused with no reason`;
  }
  if (changed) return `REACHED — ${verb} changed authoritative state`;
  return (
    `SILENT SUCCESS — ${verb} resolved successfully but the authoritative record is ` +
    `unchanged (${JSON.stringify(authoritativeBefore)}). The user was told it worked.`
  );
}

// ── The dead move-verb table ─────────────────────────────────────────────────
//
// `liveTwin` is the verb a user's drag ACTUALLY dispatches for this family, per
// MOVE_COMMAND_BY_TYPE / registerTransformDragHandler. It is recorded here so the
// refusal each handler will carry can be checked against one source of truth.

interface DeadMoveCase {
  readonly verb: string;
  readonly handler: AnyHandler;
  readonly storeKey: string;
  readonly seed: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  /** The live verb the same user gesture really dispatches, or null if none. */
  readonly liveTwin: string | null;
}

const LINE = () => [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }];
const RING = () => [
  { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
];

const CASES: readonly DeadMoveCase[] = [
  { verb: 'wall.move', handler: new MoveWallHandler(), storeKey: 'wall',
    seed: { baseLine: LINE(), height: 3, thickness: 0.2 },
    payload: { id: ELEMENT_ID, baseLine: [{ x: 1, y: 0, z: 1 }, { x: 5, y: 0, z: 1 }] },
    liveTwin: 'wall.updateBaseline' },
  { verb: 'wall.transform', handler: new TransformWallHandler(), storeKey: 'wall',
    seed: { baseLine: LINE(), height: 3, thickness: 0.2 },
    payload: { kind: 'referenceEdit', id: ELEMENT_ID, newBaseLine: [{ x: 1, y: 0, z: 1 }, { x: 5, y: 0, z: 1 }] },
    liveTwin: 'wall.updateBaseline' },
  { verb: 'door.move', handler: new MoveDoorHandler(), storeKey: 'door',
    seed: { wallId: 'w1', offset: 1, width: 0.9, height: 2.1 },
    payload: { doorId: ELEMENT_ID, offset: 2.5 }, liveTwin: 'door.setOffset' },
  { verb: 'window.move', handler: new MoveWindowHandler(), storeKey: 'window',
    seed: { wallId: 'w1', offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9 },
    payload: { windowId: ELEMENT_ID, offset: 2.5 }, liveTwin: 'window.setOffset' },
  { verb: 'slab.move', handler: new MoveSlabHandler(), storeKey: 'slab',
    seed: { boundary: RING(), holes: [], thickness: 0.25 },
    payload: { slabId: ELEMENT_ID, delta: DELTA }, liveTwin: 'slab.movePolygon' },
  { verb: 'beam.move', handler: new MoveBeamHandler(), storeKey: 'beam',
    seed: { baseLine: LINE() },
    payload: { beamId: ELEMENT_ID, delta: DELTA }, liveTwin: 'beam.update' },
  { verb: 'column.move', handler: new MoveColumnHandler(), storeKey: 'column',
    seed: { origin: { x: 2, y: 0, z: 3 } },
    payload: { columnId: ELEMENT_ID, delta: DELTA }, liveTwin: 'column.update' },
  { verb: 'roof.move', handler: new MoveRoofHandler(), storeKey: 'roof',
    seed: { boundary: RING() },
    payload: { roofId: ELEMENT_ID, delta: DELTA }, liveTwin: 'roof.update' },
  { verb: 'furniture.move', handler: new MoveFurnitureHandler(), storeKey: 'furniture',
    seed: { origin: { x: 2, y: 0, z: 3 }, rotation: 0 },
    payload: { furnitureId: ELEMENT_ID, delta: DELTA }, liveTwin: 'furniture.updateParameters' },
  { verb: 'furniture.rotate', handler: new RotateFurnitureHandler(), storeKey: 'furniture',
    seed: { origin: { x: 2, y: 0, z: 3 }, rotation: 0 },
    payload: { furnitureId: ELEMENT_ID, rotation: Math.PI }, liveTwin: 'furniture.updateParameters' },
  { verb: 'lighting.move', handler: new MoveLightingHandler(), storeKey: 'lighting',
    seed: { origin: { x: 2, y: 0, z: 3 } },
    payload: { lightingId: ELEMENT_ID, delta: DELTA }, liveTwin: null },
  { verb: 'plumbing.move', handler: new MovePlumbingHandler(), storeKey: 'plumbing',
    seed: { origin: { x: 2, y: 0, z: 3 } },
    payload: { plumbingId: ELEMENT_ID, delta: DELTA }, liveTwin: 'plumbing.moveFixture' },
  { verb: 'structural.move', handler: new MoveStructuralHandler(), storeKey: 'structural',
    seed: { origin: { x: 2, y: 0, z: 3 } },
    payload: { structuralId: ELEMENT_ID, delta: DELTA }, liveTwin: null },
  { verb: 'stair.rotate', handler: new RotateStairHandler(), storeKey: 'stair',
    seed: { origin: { x: 2, y: 0, z: 3 }, rotation: 0 },
    payload: { stairId: ELEMENT_ID, rotation: Math.PI / 2 }, liveTwin: null },
  { verb: 'dimension.move', handler: new MoveDimensionHandler(), storeKey: 'dimension',
    seed: { points: RING(), unit: 'm', precision: 2 },
    payload: { dimensionId: ELEMENT_ID, delta: DELTA }, liveTwin: null },
  { verb: 'section.moveLine', handler: new MoveSectionLineHandler(), storeKey: 'section',
    seed: { line: { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, lookDepth: 10 } },
    payload: { id: ELEMENT_ID, a: { x: 1, y: 1 }, b: { x: 5, y: 1 } }, liveTwin: null },
];

describe('§PROBE-DEAD-MOVE-VERB — a resolved move must change authoritative state', () => {
  /**
   * One test, one table. Asserted as a whole so a failure prints EVERY verb's
   * verdict side by side — the before/after evidence this probe exists to
   * produce — rather than one opaque boolean per `it`.
   */
  it('no move/rotate verb may report success while authoritative state is unchanged', async () => {
    const verdicts: string[] = [];
    for (const c of CASES) {
      const h = makeHarness([c.handler], c.storeKey, c.seed);
      const before = structuredClone(h.legacy[c.storeKey]);
      const outcome = await dispatch(h.bus, c.verb, c.payload);
      verdicts.push(verdictOf(c.verb, outcome, before, h.legacy[c.storeKey]));
    }
    // `PRYZM_PROBE_DUMP=1` prints the whole verdict table by failing on it.
    if (process.env.PRYZM_PROBE_DUMP) expect(verdicts.join('\n')).toBe('<dump>');
    const offenders = verdicts.filter(v => /^(SILENT SUCCESS|EMPTY REFUSAL|HARNESS ERROR)/.test(v));
    expect(offenders).toEqual([]);
  });

  /**
   * THE UNDO HAZARD, asserted directly. Every handler above declares
   * `affectedStores: ['<kind>']`, and CommandBus pushes that key verbatim onto
   * the ring buffer. `buildUndoStoreMap()` (performUndoRedo.ts) maps those keys
   * to the GEOMETRY singletons. So a ring-first Ctrl+Z would hand the geometry
   * store an inverse carrying the plugin store's stale prior value, for a
   * forward write geometry never saw. Refusing in `canExecute` closes this at
   * the EARLIER gate: CommandBus throws before arming either undo stack, so no
   * geometry-keyed PatchPair is armed at all.
   */
  it('no geometry-keyed ring-buffer entry is armed by any dead move verb', async () => {
    const armed: string[] = [];
    for (const c of CASES) {
      const h = makeHarness([c.handler], c.storeKey, c.seed);
      await dispatch(h.bus, c.verb, c.payload);
      for (const p of h.pushed) {
        armed.push(`${c.verb} armed a PatchPair keyed [${p.affectedStores.join(', ')}]`);
      }
    }
    expect(armed).toEqual([]);
  });
});

// ── POSITIVE CONTROLS — verbs that MUST still work ───────────────────────────

describe('§PROBE-DEAD-MOVE-VERB — positive controls', () => {
  let bridged: unknown[] = [];

  beforeEach(() => {
    bridged = [];
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>).__pryzmInitComplete = true;
    (globalThis as Record<string, unknown>).commandManager = {
      execute: (cmd: unknown) => { bridged.push(cmd); },
    };
    (globalThis as Record<string, unknown>).roomStore = {
      getById: (id: string) => ({ id, boundary: { polygon: RING(), baseOffset: 0 } }),
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).__pryzmInitComplete;
    delete (globalThis as Record<string, unknown>).commandManager;
    delete (globalThis as Record<string, unknown>).roomStore;
  });

  /**
   * CONTROL 1 — `room.move` is a LIVE move verb: it bridges to
   * `commandManager.execute(new UpdateRoomBoundaryCommand(…))` → the legacy
   * roomStore → plan fill + persistence. If this stops passing, the probe
   * itself is broken and every verdict above is worthless. This is also the
   * guard against a refuse-everything implementation passing the table.
   */
  it('CONTROL: room.move still reaches the authoritative bridge', async () => {
    const h = makeHarness([new MoveRoomHandler() as unknown as AnyHandler], null);
    const outcome = await dispatch(h.bus, 'room.move', {
      roomId: ELEMENT_ID, delta: DELTA,
    });
    expect(verdictOf('room.move', outcome, [], bridged)).toMatch(/^REACHED/);
  });
});
