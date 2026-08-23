// CommandEventBridge — wires CommandBus.patches → runtime.events.
//
// Spec:  docs/archive/pryzm3-internal/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §3
//        ADR-002 §5 (handlers are pure; cross-cutting event relay lives here).
//        C11 §5.2 (typed domain events MUST flow through runtime.events).
//
// Design:
//   Handlers are pure functions: (ctx, payload) → HandlerResult.  They must not
//   import runtime-composer or fire runtime.events directly — that would create
//   an L4→L2 layer inversion (ADR-002 §2 layering rules).
//
//   Instead, CommandEventBridge subscribes to CommandBus.patches (a PatchEmitter)
//   at the composition-root level (L2) and re-emits a typed 'command.executed'
//   event on runtime.events after every successful dispatch.  No handler changes
//   are required — the bridge is wired once in composeRuntime.ts and disposed in
//   runtime.tearDown().
//
//   In addition to the generic 'command.executed' event, the bridge emits
//   typed family domain events (e.g. 'wall.created') so consumers can subscribe
//   to semantically meaningful events without string-parsing the `type` field.
//   This closes the C11 §5.2 typed-domain-event gap without touching any handler.
//
// Usage (composeRuntime.ts):
//   const disposeCommandBridge = wireCommandEventBridge(inner.bus.patches, events);
//   // ... in tearDown():
//   disposeCommandBridge();
//
// Consumers:
//   runtime.events.on('command.executed', ({ type, id, affectedStores }) => { ... });
//   runtime.events.on('wall.created', ({ commandId, levelId, wallCount }) => { ... });
//
// References:
//   packages/command-bus/src/PatchEmitter.ts  — subscribe surface
//   packages/runtime-composer/src/EventBus.ts — emit surface
//   packages/runtime-composer/src/types.ts    — RuntimeEvents union

import type { PatchEmitter } from '@pryzm/command-bus';
// §L-1032 — the level-change register MOVED to L1 so the L3 bridge, the L7
// property panel and the L7 chat registration all read the SAME rows. It used
// to be a `const LEVEL_CHANGE_VERBS` local to this file, which is how the panel
// came to hard-code `elType === 'wall'` and leave `roof.changeLevel` — a live,
// undoable, correctly-cascading verb — with no control anywhere dispatching it.
// C84 EI-9: one authority per question.
import { LEVEL_CHANGE_VERBS } from '@pryzm/command-bus';
import type { EventBus } from './EventBus.js';

/**
 * Command types already reported as un-mirrored compounds — §FIX-COMPOUND-SILENT-DROP
 * (L-7825). Module-scoped so the warning is once per TYPE for the life of the tab, not
 * once per dispatch: this fires on real user gestures, and a line per click is noise
 * nobody reads, which fails in exactly the same way as saying nothing.
 */
const _warnedUnmirroredCompounds = new Set<string>();

/** Minimal shape of a committed wall as it appears in the Immer `add` patch
 *  produced by the wall create handlers (`draft[id] = wall`). */
interface CommittedWall {
  id?: string;
  levelId?: string;
  baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
  height?: number;
  thickness?: number;
  baseOffset?: number;
  systemTypeId?: string;
  /** ⭐ C100 §2.1 / L-1461 — the MASTER catalogue id, forwarded alongside the hex. */
  materialId?: string;
  materialColor?: string;
  layers?: ReadonlyArray<{ name: string; function: string; thickness: number; materialId?: string; materialColor?: string }>;
  /** §FIX-WALL-CURVE-PLAN-VS-3D-CREATION (2026-08-06) — quadratic-Bézier curve
   *  descriptor persisted by the wall.create chokepoint. Forwarded so the
   *  initTools §P2.1 legacy-store mirror renders the arc (3D mesh + plan). */
  curve?: { control: { x: number; y: number; z: number }; segments: number };
}

/**
 * §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239 / L-211) — index the walls this
 * command actually COMMITTED, keyed by id.
 *
 * ROOT CAUSE THIS CLOSES: every `wall.created` field below used to be read off
 * `record.payload` — i.e. what the CALLER ASKED FOR, not what the handler
 * COMMITTED. The legacy-store mirror in `initTools.ts` §P2.1 (which feeds BOTH
 * the 3D mesh via WallRebuildCoordinator AND the plan view via
 * WallLayerPlanSymbolBuilder) is driven by this event — so any field the
 * chokepoint DERIVED (`layers[]` and the type-resolved `thickness`) was
 * invisible to both renderers unless the tool had already put it in the payload.
 * That is precisely why a plan-created layered wall drew as a plain wall.
 *
 * The command handlers write the fully-materialised wall as a single Immer
 * `add` patch (`draft[id] = wall`, path `[id]`), so `record.forward` carries the
 * canonical committed record. Reading it here makes the event describe the
 * COMMIT, not the REQUEST — which is what an event-sourcing relay must do
 * (ADR-002 §5: handlers stay pure; the bridge relays their result).
 *
 * Falls back to the payload for any wall not found in the patches, so handlers
 * that mutate through a different patch shape keep their previous behaviour.
 */
function indexCommittedWalls(
  forward: readonly { readonly op: string; readonly path: readonly (string | number)[]; readonly value?: unknown }[],
): Map<string, CommittedWall> {
  const byId = new Map<string, CommittedWall>();
  for (const patch of forward) {
    if (patch.op !== 'add' || patch.path.length !== 1) continue;
    const value = patch.value as CommittedWall | undefined;
    if (!value || typeof value !== 'object') continue;
    const id = String(patch.path[0]);
    if (id.length > 0) byId.set(id, value);
  }
  return byId;
}

/**
 * §L-946 — THE MUTATION CHANNEL, and why it is a TABLE rather than two `case`s.
 *
 * Every typed event this bridge emitted until now was a `.created`. There are
 * twelve of them and twelve matching legacy-store mirrors in `initTools.ts`, and
 * not one covers a MUTATION — which is why changing an element's level from the
 * properties panel succeeded at the handler, wrote the plugin store, and never
 * reached the store the renderer reads. (Founder report L-946.)
 *
 * A level change is one verb per family with a DIFFERENT payload spelling in
 * each (`wall.changeLevel` sends `{ id, newLevelId, newElevationY }`;
 * `roof.changeLevel` sends `{ roofId, levelId }`). Written as `case` blocks that
 * is a copy-paste per family, which is exactly how the `.created` cases drifted
 * — see the four separate `§FIX-…` notes above, each one a field that a NAMED
 * SUBSET emitter silently dropped for one family only.
 *
 * So the verbs are DECLARED, not coded: adding `slab.changeLevel` is one row
 * here plus one row in the app-side mirror's kind table. The emitted event is
 * family-agnostic (`element.level-changed` carries `elementKind`) so one
 * subscriber serves all of them.
 */
// The `LevelChangeVerbSpec` interface and the table itself now live in
// `@pryzm/command-bus/levelChangeVerbs.ts`. Adding a family is ONE row there
// plus one row in `LEGACY_LEVEL_MOVERS` (`elementLevelChangedMirror.ts`) —
// still not a new event type, still not a new subscriber.

/** Emit `element.level-changed` when `record.type` is a declared level-change
 *  verb. Returns silently for every other command type. */
function emitLevelChange(
  events: EventBus,
  record: { readonly id: string; readonly type: string; readonly payload: unknown },
): void {
  const spec = LEVEL_CHANGE_VERBS[record.type];
  if (spec === undefined) return;

  const p = (record.payload ?? {}) as Record<string, unknown>;
  const elementId = p[spec.idField];
  const newLevelId = p[spec.levelField];
  // A move with no target is not a move. Refuse rather than emit an event the
  // mirror would have to interpret — an empty levelId reaching
  // `bimManager.registerElement` throws a SpatialResolutionError, and one
  // reaching the legacy wall store files the wall under '' (orphaned from every
  // plan view). Both are the §DIAG-WALL-LEVEL failure mode.
  if (typeof elementId !== 'string' || elementId.length === 0) return;
  if (typeof newLevelId !== 'string' || newLevelId.length === 0) return;

  const rawElevation = spec.elevationField !== undefined ? p[spec.elevationField] : undefined;

  events.emit('element.level-changed', {
    commandId: record.id,
    commandType: record.type,
    elementKind: spec.kind,
    elementId,
    newLevelId,
    ...(typeof rawElevation === 'number' && Number.isFinite(rawElevation)
      ? { newElevationY: rawElevation }
      : {}),
  });
}

/**
 * §MIRROR-UPDATE (L-9942) — THE UPDATE CHANNEL, AND WHY IT IS A TABLE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ ONE ZERO WAS THE WHOLE DEFECT CLASS.
 * ═══════════════════════════════════════════════════════════════════════════
 *   grep -c "\.created'"  apps/editor/src/engine/initTools.ts   -> 17
 *   grep -c "\.updated'"  apps/editor/src/engine/initTools.ts   ->  0
 *
 * Seventeen create-mirrors and NOT ONE update-mirror. `element.level-changed`
 * above is the single exception and it moves exactly one field. Everything else
 * — a thickness, a base offset, a void punched through a floor plate — landed in
 * the plugin DTO store, reported success, and never reached the store the
 * renderer reads. That is the mechanical cause of the 13 `*.setMaterial` verbs
 * sitting at REFUSES, of the lift's shaft that penetrates the model and not the
 * screen (L-9403), and of the pool's hole in its host slab.
 *
 * ─── ⛔ WHY THIS IS **NOT** "COPY EVERY REPLACE PATCH ACROSS" ───────────────
 * A moved wall is not a repainted wall. `WallStore.update()` clears
 * `_sourceBaseLine` and re-runs join resolution; a generic relay that copied a
 * committed `baseLine` into it would silently un-weld every corner it touched —
 * §CLAMP-COSHARE-WELD, arrived at from the other direction. And
 * `SlabStore.update()` is a WHOLE-RECORD replace: handed a one-key partial it
 * leaves the slab as that one key, frozen, with no diagnostics (L-977, recorded
 * in `SlabStore.changeLevel`'s own header).
 *
 * So a verb crosses only when a person has established WHAT it must re-emit for
 * the render to be correct, and written the row. A verb with no row emits
 * nothing and stays on `tools/ga-gate/mirror-debt.json` as a NAMED backlog item.
 * That is the opposite of a default-open relay, deliberately.
 *
 * ─── WHAT A ROW CLAIMS, IN THREE PARTS ─────────────────────────────────────
 *   1. `kind`   — the family key. It MUST equal a key in `LEGACY_UPDATABLE_STORES`
 *                 (`apps/editor/src/engine/elementUpdatedMirror.ts`). A row in one
 *                 table and not the other is the silent half of this defect: the
 *                 command succeeds, the plugin store is right, and the renderer
 *                 keeps its own unchanged copy.
 *   2. `idField`— which payload field names the element.
 *   3. `fields` — the TOP-LEVEL plugin-record fields this verb may change. The
 *                 event carries these NAMES; the mirror reads their VALUES out of
 *                 the plugin store. Not values on the wire: L-927 is the standing
 *                 receipt for what a value whitelist costs (`materialColor`,
 *                 `layers` and `curve` were three separate founder-visible
 *                 defects, each a field the emitter did not know to copy).
 *
 * ─── ⚠ THE ROWS THAT ARE **ABSENT**, AND WHY — measured, not assumed ────────
 *  · `roof.setPitch` — `grep -n "pitch" packages/geometry-roof/src/RoofTypes.ts`
 *    → **0 hits**. The legacy roof record has no such field, so there is nothing
 *    to mirror INTO; a row here would write a key no builder reads and report a
 *    fix. It stays on the debt ledger with that reason.
 *  · `slab.movePolygon` / `slab.update` / `slab.updatePolygon` — the polygon has
 *    TWO spellings (`boundary` Vec3[] in the plugin record, `polygon` {x,y}[] in
 *    the legacy one) and `slab.movePolygon` is already the L-220 distinct verb
 *    bridged to `UpdateSlabPolygonCommand`, which writes the legacy store itself.
 *    Adding a rival path here would put two producers on one ring.
 *  · every `*.setMaterial` — those verbs REFUSE today (§FIX-DEAD-VERB-REFUSE).
 *    A refusing verb must NOT acquire a mirror while it refuses: that would make
 *    `canExecute` and this table disagree about whether the verb works.
 */
export interface ElementUpdateVerbSpec {
  /** Family key — selects the legacy store in the app-side mirror's table. */
  readonly kind: string;
  /** Payload field naming the element. */
  readonly idField: string;
  /** Top-level PLUGIN-record fields this verb may change. Never empty. */
  readonly fields: readonly string[];
  /** Why these fields and no others — the part a later reader needs. */
  readonly note: string;
}

const ELEMENT_UPDATE_VERBS: Readonly<Record<string, ElementUpdateVerbSpec>> = {
  // ── slab ────────────────────────────────────────────────────────────────
  // ⭐ `holes` is THE founder-visible row. `SlabFragmentBuilder` punches
  // `data.holes` through the capped geometry (`SlabFragmentBuilder.ts:1526`), so
  // mirroring this one field is the difference between a lift shaft that
  // penetrates the floor plate and one that only claims to (L-9403).
  'slab.addHole': {
    kind: 'slab', idField: 'slabId', fields: ['holes'],
    note: 'AddSlabHoleHandler does `s.holes.push(...)` — a DEEP patch (`[id,"holes",N]`). '
        + 'The mirror reads the whole array back rather than replaying the sub-path, because '
        + 'SlabStore.update is a whole-record replace and a sub-path write is the L-977 '
        + 'annihilating partial.',
  },
  'slab.removeHole': {
    kind: 'slab', idField: 'slabId', fields: ['holes'],
    note: 'Symmetric with slab.addHole — `s.holes.splice(...)`, also deep.',
  },
  'slab.setThickness': {
    kind: 'slab', idField: 'slabId', fields: ['thickness'],
    note: 'Identity mapping: both records spell it `thickness` and the builder re-extrudes '
        + 'on `bim-slab-updated`.',
  },
  'slab.setBaseOffset': {
    kind: 'slab', idField: 'slabId', fields: ['baseOffset'],
    note: 'Identity mapping. `SlabFragmentBuilder` re-derives worldY = level.elevation + '
        + 'baseOffset on every update (C92 §10), so the plate moves without a remove/add.',
  },
  'slab.setType': {
    kind: 'slab', idField: 'slabId', fields: ['systemTypeId', 'materialId', 'materialColor'],
    note: 'Three fields because the handler writes three, conditionally. `SlabData` carries '
        + 'all three (SlabTypes.ts:145 systemTypeId, :101 materialId, :100 materialColor) and '
        + 'the mirror copies only those the plugin record actually holds.',
  },

  // ── roof ────────────────────────────────────────────────────────────────
  'roof.setOverhang': {
    kind: 'roof', idField: 'roofId', fields: ['overhang'],
    note: 'Legacy `RoofData.overhang` (RoofTypes.ts:84/98). `RoofStore.update` takes a '
        + 'Partial and emits `bim-roof-updated`, so one field is a legal write here — unlike '
        + 'the slab, whose update is a whole-record replace.',
  },
  'roof.setThickness': {
    kind: 'roof', idField: 'roofId', fields: ['thickness'],
    note: 'Legacy `RoofData.thickness` (RoofTypes.ts:61/85/101). Same Partial contract.',
  },

  // ── column ──────────────────────────────────────────────────────────────
  'column.setHeight': {
    kind: 'column', idField: 'columnId', fields: ['height'],
    note: 'Legacy `ColumnData.height`. ⚠ `ColumnStore.update` takes `Omit<ColumnData,"id"|"type">` '
        + '— a WHOLE record — so the mirror merges onto the current one; handing it a one-key '
        + 'partial would be the L-977 defect in a second family.',
  },
};

/**
 * Emit `element.updated` when `record.type` is a declared update verb.
 *
 * ⛔ NAMES THE FIELDS THE HANDLER ACTUALLY COMMITTED, not the fields the row
 * ALLOWS. A `slab.setType` that only changed `systemTypeId` must not announce
 * `materialColor`: the mirror would then copy a value nobody edited, and a
 * subsequent "why did my colour change?" would have no trail. The intersection
 * is taken against `record.forward`, which is the COMMIT (ADR-002 §5).
 *
 * A change that touched none of the declared fields emits NOTHING — silence is
 * correct there, because there is nothing for a renderer to do.
 */
function emitElementUpdate(
  events: EventBus,
  record: {
    readonly id: string;
    readonly type: string;
    readonly payload: unknown;
    readonly forward?: readonly { readonly op: string; readonly path: readonly (string | number)[] }[];
  },
): void {
  const spec = ELEMENT_UPDATE_VERBS[record.type];
  if (spec === undefined) return;

  const p = (record.payload ?? {}) as Record<string, unknown>;
  const elementId = p[spec.idField];
  if (typeof elementId !== 'string' || elementId.length === 0) return;

  // Which of the declared fields the commit really touched. Patches from a
  // single-store `produceCommand` are store-RELATIVE (`[elementId, field, ...]`),
  // so the field is at index 1 and everything deeper collapses onto it.
  const allowed = new Set(spec.fields);
  const touched = new Set<string>();
  for (const patch of record.forward ?? []) {
    if (patch.path.length < 2) continue;
    if (String(patch.path[0]) !== elementId) continue;
    const field = String(patch.path[1]);
    if (allowed.has(field)) touched.add(field);
  }
  if (touched.size === 0) return;

  events.emit('element.updated', {
    commandId:     record.id,
    commandType:   record.type,
    elementKind:   spec.kind,
    elementId,
    changedFields: [...touched],
  });
}

/**
 * §FIX-BEAM-CEB-STEEL (L-974) — the committed beam as it appears in the Immer
 * `add` patch produced by `CreateBeamHandler` (`draft[beam.id] = beam`).
 *
 * Reading the COMMIT rather than the REQUEST is the same move
 * `indexCommittedWalls` makes above, and here it is what makes ONE alias table
 * enough: `CreateBeamHandler` folds `startPoint`/`endPoint` into `baseLine`,
 * legacy `sectionType` into `shape` and `material` into `materialId` before it
 * commits, so the bridge relays L0's vocabulary without owning a second copy of
 * the mapping. ADR-002 §5.
 */
interface CommittedBeam {
  id?: string;
  levelId?: string;
  baseLine?: ReadonlyArray<{ x: number; y: number; z: number }>;
  shape?: string;
  width?: number;
  depth?: number;
  materialId?: string;
  loadBearing?: boolean;
  fireRating?: string;
  steelProfileName?: string;
}

/** Index the beams this command actually COMMITTED, keyed by id. Empty when the
 *  handler mutated through a different patch shape — callers fall back to the
 *  payload, exactly as the wall path does. */
function indexCommittedBeams(
  forward: readonly { readonly op: string; readonly path: readonly (string | number)[]; readonly value?: unknown }[],
): Map<string, CommittedBeam> {
  const byId = new Map<string, CommittedBeam>();
  for (const patch of forward) {
    if (patch.op !== 'add' || patch.path.length !== 1) continue;
    const value = patch.value as CommittedBeam | undefined;
    if (!value || typeof value !== 'object') continue;
    const id = String(patch.path[0]);
    if (id.length > 0) byId.set(id, value);
  }
  return byId;
}

/** A point as any of the beam producers spell it. */
interface BeamPoint { readonly x: number; readonly y: number; readonly z: number }

/** The geometry fields a `beam.create` payload may carry, in EITHER spelling. */
export interface BeamGeometryPayload {
  /** The L0 `Beam` schema's own field (`Beam.ts:46`) — the canonical shape. */
  readonly baseLine?: ReadonlyArray<BeamPoint>;
  /** Legacy alias pair. `CreateBeamHandler.resolveBaseLine()` folds it into
   *  `baseLine` before committing, so it never reaches the store record. */
  readonly startPoint?: BeamPoint;
  readonly endPoint?: BeamPoint;
}

/**
 * §FIX-BEAM-CEB-BASELINE (L-971 · C84 EI-2b · ADR-002 §5) — resolve the two
 * endpoints a `beam.create` payload describes, in whichever of the two spellings
 * its producer used, or `null` when it describes none.
 *
 * ⚠ THIS BRIDGE USED TO SUPPORT ONE SHAPE WHILE TWO PRODUCERS EXISTED.
 * `beam.create` is dispatched by `apps/editor/.../BeamPlanToolHandler.ts:95`
 * (`startPoint` + `endPoint`) AND by `plugins/beam/src/tool.ts:62`
 * (`baseLine: [a, b]`). `CreateBeamHandler.resolveBaseLine()` accepts both —
 * so both COMMIT correctly — but the single `beam.create` case here read only
 * `startPoint`/`endPoint`. A beam drawn with the beam plugin's own tool
 * therefore emitted `beam.created` with `startPoint === undefined`, the §FT2
 * mirror's guard in `initTools.ts` dropped it, `BeamStore.add()` was never
 * called and **no mesh was ever built — with no error anywhere**. Only the
 * `beam.batch.create` case below converted `baseLine`, which is why batch
 * creation worked and the interactive tool did not.
 *
 * `baseLine` WINS when both are present, matching `resolveBaseLine()` exactly:
 * the bridge must describe what the handler committed, not a rival reading.
 *
 * ─── WHY THIS IS A TOP-LEVEL EXPORT AND NOT A LINE IN THE SWITCH ────────────
 * The switch lives inside `wireCommandEventBridge`'s subscriber closure, so a
 * test could only reach this mapping by driving the whole bridge. Exported, the
 * rule is executable on its own AND is the one production code runs — the same
 * extraction `beamCreatedMirror.ts` / `roofCreatedMirror.ts` made app-side, for
 * the same reason: a bridge body no test can reach is a bridge body no test can
 * measure.
 */
export function resolveBeamEndpoints(p: BeamGeometryPayload): readonly [BeamPoint, BeamPoint] | null {
  if (p.baseLine && p.baseLine.length >= 2) {
    const [a, b] = p.baseLine as ReadonlyArray<BeamPoint>;
    if (a && b) return [a, b];
  }
  if (p.startPoint && p.endPoint) return [p.startPoint, p.endPoint];
  return null;
}

/**
 * Subscribe to `patchEmitter` and re-emit typed events on `events` after
 * every successful CommandBus dispatch:
 *
 *   1. `'command.executed'` — generic relay for every dispatch.
 *   2. Family-specific typed events (e.g. `'wall.created'`) — A24 §5.1.
 *   3. `'element.level-changed'` — the §L-946 MUTATION channel (table-driven).
 *
 * Returns a disposer — call it in `runtime.tearDown()` to unsubscribe.
 * Throwing from within the bridge is swallowed with `console.error` so
 * one bad emit cannot crash the command pipeline.
 */
export function wireCommandEventBridge(
  patchEmitter: PatchEmitter,
  events: EventBus,
): () => void {
  return patchEmitter.subscribe((_bytes, record) => {
    // ── 1. Generic 'command.executed' relay ──────────────────────────────────
    try {
      events.emit('command.executed', {
        id:             record.id,
        type:           record.type,
        affectedStores: record.affectedStores,
        actorId:        record.audit.actorId,
        projectId:      record.audit.projectId,
      });
    } catch (err) {
      console.error('[CommandEventBridge] Failed to emit command.executed for type=' +
        record.type + ':', err);
    }

    // ── 1b. §L-946 mutation channel ──────────────────────────────────────────
    // Its own try/catch, and BEFORE the create switch: a throw from either half
    // must not be able to suppress the other. The create cases are relied on by
    // twelve mirrors and predate this channel.
    try {
      emitLevelChange(events, record);
    } catch (err) {
      console.error('[CommandEventBridge] Failed to emit element.level-changed for type=' +
        record.type + ':', err);
    }

    // ── 1c. §MIRROR-UPDATE (L-9942) mutation channel ─────────────────────────
    // Its own try/catch for the same reason 1b has one: a throw here must not be
    // able to suppress the seventeen create-mirrors, and a throw there must not
    // be able to suppress this. Table-driven, so a verb with no row is a
    // deliberate silence rather than a forgotten one — the ledger
    // `tools/ga-gate/mirror-debt.json` is where the forgotten ones are counted.
    try {
      emitElementUpdate(events, record);
    } catch (err) {
      console.error('[CommandEventBridge] Failed to emit element.updated for type=' +
        record.type + ':', err);
    }

    // ── 2. Typed family domain events (A24 — C11 §5.2) ───────────────────────
    // Each `case` emits a family-specific event so consumers can subscribe
    // without parsing the generic `type` string.  The payload is derived
    // from `record.payload` (what the caller passed to executeCommand) and
    // `record.id` (the ULID of the EventRecord).
    try {
      switch (record.type) {
        case 'wall.create': {
          // §P2.1 (IMPL-PLAN-2026-05-17): forward geometry fields so the F-1.2
          // legacy-store bridge in initTools.ts can mirror the wall into the legacy
          // WallStore without a second commandManager.execute() dual-write.
          const p = record.payload as CommittedWall;
          // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239) — prefer the COMMITTED wall
          // (the Immer `add` patch value) over the request payload, so handler-derived
          // fields (`layers[]`, the type-resolved `thickness`) reach the legacy-store
          // mirror → the 3D mesh AND the plan view. The payload is the fallback.
          const committed = indexCommittedWalls(record.forward);
          const w = (p.id !== undefined ? committed.get(p.id) : undefined)
            ?? [...committed.values()][0]
            ?? p;
          events.emit('wall.created', {
            commandId:    record.id,
            commandType:  'wall.create',
            levelId:      w.levelId ?? p.levelId ?? '',
            wallCount:    1,
            wallId:       p.id ?? w.id,
            baseLine:     w.baseLine     ?? p.baseLine,
            height:       w.height       ?? p.height,
            thickness:    w.thickness    ?? p.thickness,
            baseOffset:   w.baseOffset   ?? p.baseOffset,
            systemTypeId: w.systemTypeId ?? p.systemTypeId,
            // §RESI-FACADE-COLOUR-PERSIST (2026-06-24) — forward the per-wall finish colour so
            // the legacy-store mirror renders it (the field was dropped here before).
            materialColor: w.materialColor ?? p.materialColor,
            // ⭐ C100 §2.1 / L-1461 — forward the MASTER id, not only the hex beside it.
            // A resolved colour is a CACHE, never an authority; forwarding only the cache
            // is how a wall arrives at the render store unable to say what it is made OF.
            materialId:   w.materialId ?? p.materialId,
            // §RESI-FACADE-INTERIOR-WHITE (2026-06-24) — forward the per-layer finish stack so the
            // legacy mirror builds a layered (per-face) wall.
            layers:       w.layers ?? p.layers,
            // §FIX-WALL-CURVE-PLAN-VS-3D-CREATION (2026-08-06) — forward the curve descriptor so
            // the legacy mirror builds the ARC, not the chord (plan-created curved walls drew straight).
            curve:        w.curve ?? p.curve,
          });
          break;
        }
        case 'wall.batch.create': {
          // TASK-01 (MASTER-IMPL-PLAN-2026-05-18): emit one 'wall.created' per element so
          // the initTools.ts §P2.1 bridge mirrors each wall into the legacy WallStore and
          // triggers WallRebuildCoordinator → 3D mesh build.  Using commandType 'wall.create'
          // so the existing subscriber's commandType guard accepts each per-element event.
          // The batch is still one atomic Immer patch / one undo-stack entry — this emit
          // loop is notification-only and does not affect undo behaviour.
          const p = record.payload as {
            walls?: Array<CommittedWall>;
            levelId?: string;
          };
          const _batchWallLevelId = p.levelId ?? '';
          // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239) — same commit-over-request rule
          // as the single-wall case, so batch/AI/generator walls fan out with the
          // handler-resolved `layers[]` + `thickness`, not the caller's placeholders.
          const committed = indexCommittedWalls(record.forward);
          for (const req of (p.walls ?? [])) {
            if (!req.id) continue;
            const w = committed.get(req.id) ?? req;
            const baseLine = w.baseLine ?? req.baseLine;
            if (!baseLine || baseLine.length < 2) continue;
            events.emit('wall.created', {
              commandId:    record.id,
              commandType:  'wall.create',
              levelId:      w.levelId ?? req.levelId ?? _batchWallLevelId,
              wallCount:    1,
              wallId:       req.id,
              baseLine,
              height:       w.height       ?? req.height,
              thickness:    w.thickness    ?? req.thickness,
              baseOffset:   w.baseOffset   ?? req.baseOffset,
              systemTypeId: w.systemTypeId ?? req.systemTypeId,
              // §RESI-FACADE-COLOUR-PERSIST (2026-06-24) — carry the per-wall finish colour
              // through the batch fan-out (was dropped → façade walls rendered default grey).
              materialColor: w.materialColor ?? req.materialColor,
              // ⭐ C100 §2.1 / L-1461 — same forward through the batch fan-out.
              materialId:   w.materialId ?? req.materialId,
              // §RESI-FACADE-INTERIOR-WHITE (2026-06-24) — carry the per-layer finish stack through
              // the batch fan-out so layered (per-face) shell walls render correctly.
              layers:       w.layers ?? req.layers,
              // §FIX-WALL-CURVE-PLAN-VS-3D-CREATION (2026-08-06) — carry the curve descriptor
              // through the batch fan-out (same drop as the single-create case).
              curve:        w.curve ?? req.curve,
            });
          }
          break;
        }

        // ── §P2.3 (IMPL-PLAN-2026-05-17): wall opening creation ──────────────
        // Both the legacy adapter path (wall.opening.create, from Door/Window plan
        // tools) and the PRYZM3 typed path (wall.createOpening, from door/window
        // plugins) emit wall.opening.created so the initTools.ts bridge can mirror
        // the opening into the legacy WallStore → WallRebuildCoordinator → mesh.
        case 'wall.opening.create': {
          const p = record.payload as { wallId?: string; openingData?: Record<string, unknown> };
          events.emit('wall.opening.created', {
            commandId:   record.id,
            commandType: 'wall.opening.create',
            wallId:      p.wallId ?? '',
            opening:     p.openingData ?? {},
          });
          break;
        }
        case 'wall.createOpening': {
          const p = record.payload as { wallId?: string; opening?: Record<string, unknown> };
          events.emit('wall.opening.created', {
            commandId:   record.id,
            commandType: 'wall.createOpening',
            wallId:      p.wallId ?? '',
            opening:     p.opening ?? {},
          });
          break;
        }

        // ── A25: Remaining-family typed domain events (C11 §5.2) ─────────────
        // Pattern mirrors wall cases above.  Payload cast is intentionally
        // minimal — we only extract fields present in *all* create payloads
        // (levelId is '' when not present — S07 allowance).

        case 'slab.create': {
          // §FT1 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): enrich with geometry fields so
          // the initTools.ts legacy-store bridge can mirror the slab into SlabStore and
          // trigger SlabFragmentBuilder mesh rebuild — same pattern as §P3.2-RF roof.create.
          // Fields map directly to SlabData: polygon={x,y}[] (y=worldZ per plan convention),
          // position={0,0,0} (centroid NOT pre-added — SlabFragmentBuilder adds it internally).
          const p = record.payload as {
            id?: string;
            levelId?: string;
            ifcGuid?: string;
            polygon?: Array<{ x: number; y: number }>;
            position?: { x: number; y: number; z: number };
            width?: number;
            depth?: number;
            thickness?: number;
            baseOffset?: number;
            materialId?: string;
          };
          events.emit('slab.created', {
            commandId:    record.id,
            commandType:  'slab.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            ifcGuid:      p.ifcGuid,
            polygon:      p.polygon,
            position:     p.position,
            width:        p.width,
            depth:        p.depth,
            thickness:    p.thickness,
            baseOffset:   p.baseOffset,
            materialId:   p.materialId,
          });
          break;
        }

        case 'slab.batch.create': {
          // TASK-01: emit one 'slab.created' per element — same pattern as wall.batch.create.
          // CreateSlabPayload uses `boundary` (plan polygon) which maps to `polygon` in the
          // initTools §FT1 subscriber and legacy SlabStore.  Also accepts `polygon` directly
          // for callers that use the older field name.
          const p = record.payload as {
            slabs?: Array<{
              id?: string;
              levelId?: string;
              boundary?: Array<{ x: number; y: number }>;
              polygon?: Array<{ x: number; y: number }>;
              thickness?: number;
              baseOffset?: number;
              materialId?: string;
              systemTypeId?: string;
              ifcGuid?: string;
            }>;
            levelId?: string;
          };
          const _batchSlabLevelId = p.levelId ?? '';
          for (const s of (p.slabs ?? [])) {
            const _slabPolygon = s.polygon ?? s.boundary;
            if (!s.id || !_slabPolygon || _slabPolygon.length < 3) continue;
            events.emit('slab.created', {
              commandId:    record.id,
              commandType:  'slab.create',
              levelId:      s.levelId ?? _batchSlabLevelId,
              elementCount: 1,
              id:           s.id,
              ifcGuid:      s.ifcGuid,
              polygon:      _slabPolygon,
              position:     { x: 0, y: 0, z: 0 },
              thickness:    s.thickness,
              baseOffset:   s.baseOffset,
              materialId:   s.materialId ?? s.systemTypeId,
            });
          }
          break;
        }

        case 'curtain-wall.create': {
          // §P3.1-CW (IMPL-PLAN-2026-05-17): geometry fields added so the
          // initTools.ts legacy-store bridge can mirror the curtain wall into
          // the CurtainWallStore and trigger mesh rebuild — same pattern as
          // the 'wall.created' enrichment above.
          // TASK-02 (MASTER-IMPL-PLAN-2026-05-18): add bayWidth/bayHeight/mullionThickness so
          // the initTools.ts §P3.1-CW bridge can pass grid spacing to curtainWallStoreInstance.
          // Without these fields, migrateToGridSystem() receives undefined spacings → NaN → 0
          // curtain-wall cells → empty mesh (CONFIRMED CRITICAL finding ASSUMED-D).
          // §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972 · C84 EI-2a/EI-2b): `baseOffset`,
          // `panelThickness`, `materialId` and `panels` added. The first two were
          // TESTED FOR by the §P3.1-CW bridge (`typeof _cwEv['baseOffset'] ===
          // 'number'`) against an emitter that never listed them and a schema that
          // never declared them — a guard that could not be true, so an authored
          // value could never take effect. The last two are on the L0 schema
          // (`CurtainWall.ts`) and were dropped here outright.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            height?: number;
            baseOffset?: number;
            bayWidth?: number;
            bayHeight?: number;
            mullionThickness?: number;
            panelThickness?: number;
            materialId?: string;
            systemTypeId?: string;
            panels?: ReadonlyArray<{ id: string }>;
          };
          events.emit('curtain-wall.created', {
            commandId:        record.id,
            commandType:      'curtain-wall.create',
            levelId:          p.levelId ?? '',
            elementCount:     1,
            id:               p.id,
            baseLine:         p.baseLine,
            height:           p.height,
            baseOffset:       p.baseOffset,
            bayWidth:         p.bayWidth ?? 1.2,
            bayHeight:        p.bayHeight ?? 1.5,
            mullionThickness: p.mullionThickness ?? 0.05,
            panelThickness:   p.panelThickness,
            // `CreateCurtainWallHandler` seeds `materialId ?? systemTypeId`, so the
            // same fold is applied here — otherwise the event and the committed
            // record would disagree for a producer that sent only `systemTypeId`.
            materialId:       p.materialId ?? p.systemTypeId,
            panels:           p.panels,
          });
          break;
        }

        case 'curtain-wall.batch.create': {
          // TASK-01: emit one 'curtain-wall.created' per element.
          // commandType is set to 'curtain-wall.create' (single-create value) so the
          // initTools §P3.1-CW subscriber's commandType guard accepts each per-element event.
          // bayWidth/bayHeight are forwarded so the grid system receives valid spacings.
          const p = record.payload as {
            curtainWalls?: Array<{
              id?: string;
              levelId?: string;
              baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
              height?: number;
              baseOffset?: number;
              bayWidth?: number;
              bayHeight?: number;
              mullionThickness?: number;
              panelThickness?: number;
              materialId?: string;
              systemTypeId?: string;
              panels?: ReadonlyArray<{ id: string }>;
            }>;
            levelId?: string;
            height?: number;
          };
          const _batchCWLevelId = p.levelId ?? '';
          const _batchCWDefaultHeight = p.height ?? 3;
          for (const cw of (p.curtainWalls ?? [])) {
            if (!cw.id || !cw.baseLine || cw.baseLine.length < 2) continue;
            events.emit('curtain-wall.created', {
              commandId:        record.id,
              commandType:      'curtain-wall.create',
              levelId:          cw.levelId ?? _batchCWLevelId,
              elementCount:     1,
              id:               cw.id,
              baseLine:         cw.baseLine,
              height:           cw.height ?? _batchCWDefaultHeight,
              baseOffset:       cw.baseOffset,
              bayWidth:         cw.bayWidth ?? 1.2,
              bayHeight:        cw.bayHeight ?? 1.5,
              mullionThickness: cw.mullionThickness ?? 0.05,
              panelThickness:   cw.panelThickness,
              materialId:       cw.materialId ?? cw.systemTypeId,
              panels:           cw.panels,
            });
          }
          break;
        }

        case 'column.create': {
          // §P3.3-CO: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can reconstruct ColumnData {position, profile} for ColumnFragmentBuilder.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            origin?: { x: number; y: number; z: number };
            shape?: string;
            width?: number;
            depth?: number;
            height?: number;
            baseOffset?: number;
            rotation?: number;
            materialId?: string;
          };
          events.emit('column.created', {
            commandId:    record.id,
            commandType:  'column.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            origin:       p.origin,
            shape:        p.shape,
            width:        p.width,
            depth:        p.depth,
            height:       p.height,
            baseOffset:   p.baseOffset,
            rotation:     p.rotation,
            materialId:   p.materialId,
          });
          break;
        }

        case 'column.batch.create': {
          // TASK-01: emit one 'column.created' per element so the initTools.ts §P3.3-CO bridge
          // mirrors each column into the legacy ColumnStore → ColumnFragmentBuilder mesh.
          const p = record.payload as {
            columns?: Array<{
              id?: string;
              levelId?: string;
              origin?: { x: number; y: number; z: number };
              shape?: string;
              width?: number;
              depth?: number;
              height?: number;
              baseOffset?: number;
              rotation?: number;
              materialId?: string;
              systemTypeId?: string;
            }>;
            levelId?: string;
          };
          const _batchColLevelId = p.levelId ?? '';
          for (const c of (p.columns ?? [])) {
            if (!c.id || !c.origin) continue;
            events.emit('column.created', {
              commandId:    record.id,
              commandType:  'column.create',
              levelId:      c.levelId ?? _batchColLevelId,
              elementCount: 1,
              id:           c.id,
              origin:       c.origin,
              shape:        c.shape,
              width:        c.width,
              depth:        c.depth,
              height:       c.height,
              baseOffset:   c.baseOffset,
              rotation:     c.rotation,
              materialId:   c.materialId ?? c.systemTypeId,
            });
          }
          break;
        }

        case 'beam.create': {
          // §FT2 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): enrich with geometry fields so
          // the initTools.ts legacy-store bridge can mirror the beam into BeamStore and
          // trigger BeamFragmentBuilder mesh rebuild — same pattern as §P3.2-RF roof.create.
          // §FIX-BEAM-CEB-BASELINE (L-971): the endpoints now come from
          // `resolveBeamEndpoints`, which reads BOTH producers' spellings. This case
          // used to read only `startPoint`/`endPoint`, so every beam drawn with the
          // beam plugin's own tool (`baseLine`) was dropped without a trace.
          const p = record.payload as BeamGeometryPayload & {
            id?: string;
            levelId?: string;
            shape?: string;
            width?: number;
            depth?: number;
            materialId?: string;
          };
          // §FIX-BEAM-CEB-STEEL (L-974): prefer the COMMITTED beam. `CopyPlanToolHandler`
          // sends `sectionType`, `steelProfileName`, `loadBearing`, `fireRating` and
          // `material`; this case listed NONE of them, so copying a steel UB beam
          // yielded a plain concrete one — silently. Those fields are now on the L0
          // schema and normalised by `CreateBeamHandler`, so relaying the commit
          // carries them AND keeps the legacy-alias table in exactly one place.
          const _committedBeam = p.id
            ? indexCommittedBeams(record.forward ?? []).get(p.id)
            : undefined;
          const beamEnds = _committedBeam?.baseLine && _committedBeam.baseLine.length >= 2
            ? resolveBeamEndpoints(_committedBeam)
            : resolveBeamEndpoints(p);
          if (!beamEnds) {
            // §FIX-BEAM-CEB-BASELINE — REFUSE BY NAME. Emitting a geometry-less
            // `beam.created` is the silent drop itself: the §FT2 subscriber's guard
            // swallows it and nothing anywhere says a beam went missing.
            console.error(
              `[CommandEventBridge] §FIX-BEAM-CEB-BASELINE: REFUSED beam ${p.id ?? '<no id>'} — ` +
              `its beam.create payload carries neither \`baseLine\` (the L0 Beam schema's own ` +
              `field, dispatched by plugins/beam) nor the \`startPoint\`/\`endPoint\` legacy alias ` +
              `(dispatched by BeamPlanToolHandler), so no beam.created was emitted and no mesh ` +
              `will be built. The command itself may still have committed.`,
            );
            break;
          }
          events.emit('beam.created', {
            commandId:    record.id,
            commandType:  'beam.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            startPoint:   beamEnds[0],
            endPoint:     beamEnds[1],
            shape:        _committedBeam?.shape ?? p.shape,
            width:        _committedBeam?.width ?? p.width,
            depth:        _committedBeam?.depth ?? p.depth,
            materialId:   _committedBeam?.materialId ?? p.materialId,
            loadBearing:      _committedBeam?.loadBearing,
            fireRating:       _committedBeam?.fireRating,
            steelProfileName: _committedBeam?.steelProfileName,
          });
          break;
        }

        case 'beam.batch.create': {
          // TASK-01: emit one 'beam.created' per element so the initTools.ts §FT2 bridge
          // mirrors each beam into the legacy BeamStore → BeamFragmentBuilder mesh.
          // CreateBeamPayload uses `baseLine` ([start, end] Vec3) but the initTools subscriber
          // and BeamStore.add() use startPoint/endPoint — converted here.
          const p = record.payload as {
            beams?: Array<BeamGeometryPayload & {
              id?: string;
              levelId?: string;
              shape?: string;
              width?: number;
              depth?: number;
              materialId?: string;
              systemTypeId?: string;
            }>;
            levelId?: string;
          };
          const _batchBeamLevelId = p.levelId ?? '';
          for (const b of (p.beams ?? [])) {
            if (!b.id) continue;
            // §FIX-BEAM-CEB-BASELINE (L-971) — one resolver for both cases, so the
            // batch path and the single path can never again support different
            // producer spellings. A member with no usable geometry is refused BY
            // NAME rather than `continue`d past: a batch that silently mints N-1
            // beams is the same defect at a different arity.
            const bEnds = resolveBeamEndpoints(b);
            if (!bEnds) {
              console.error(
                `[CommandEventBridge] §FIX-BEAM-CEB-BASELINE: SKIPPED beam ${b.id} in ` +
                `beam.batch.create — it carries neither \`baseLine\` nor \`startPoint\`/\`endPoint\`, ` +
                `so no beam.created was emitted for it and no mesh will be built.`,
              );
              continue;
            }
            events.emit('beam.created', {
              commandId:    record.id,
              commandType:  'beam.create',
              levelId:      b.levelId ?? _batchBeamLevelId,
              elementCount: 1,
              id:           b.id,
              startPoint:   bEnds[0],
              endPoint:     bEnds[1],
              shape:        b.shape,
              width:        b.width,
              depth:        b.depth,
              materialId:   b.materialId ?? b.systemTypeId,
            });
          }
          break;
        }

        // TASK-13 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18 RISK-3): door/window/stair CEB
        // cases removed — no initTools.ts subscribers exist for 'door.created',
        // 'window.created', or 'stair.created' (confirmed grep returned 0 hits).
        // • door / window: use the Committer architecture (Path A) — no CEB bridge needed.
        // • stair: uses Path C (legacy commandManager bridge) — no CEB bridge needed.
        // Pre-removal grep: grep -rn "door\.created\|window\.created\|stair\.created" apps/ packages/ plugins/ → 0 matches outside CEB.

        case 'ceiling.create': {
          // §P3.2-CL: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can mirror the new-schema ceiling into CeilingStore for mesh rendering.
          // §FIX-CEILING-BRIDGE-FINISH (L-973 · C84 EI-2a): `materialId` and
          // `materialColor` added. Both are on the L0 `Ceiling` schema
          // (`Ceiling.ts:54-55`) and both are accepted and seeded by
          // `CreateCeilingHandler` — this named subset listed neither, so the
          // §P3.2-CL bridge had nothing to read and hardcoded the whole finish
          // specification over the top of it.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            boundary?: Array<{ x: number; y: number; z: number }>;
            ceilingHeight?: number;
            thickness?: number;
            materialId?: string;
            materialColor?: string;
          };
          events.emit('ceiling.created', {
            commandId:    record.id,
            commandType:  'ceiling.create',
            levelId:      p.levelId ?? '',
            elementCount: 1,
            id:           p.id,
            boundary:     p.boundary,
            ceilingHeight: p.ceilingHeight,
            thickness:    p.thickness,
            materialId:   p.materialId,
            materialColor: p.materialColor,
          });
          break;
        }

        case 'ceiling.batch.create': {
          // TASK-01: emit one 'ceiling.created' per element so the initTools.ts §P3.2-CL bridge
          // mirrors each ceiling into the legacy CeilingStore → CeilingPanelBuilder mesh.
          const p = record.payload as {
            ceilings?: Array<{
              id?: string;
              levelId?: string;
              boundary?: Array<{ x: number; y: number; z: number }>;
              ceilingHeight?: number;
              thickness?: number;
              materialId?: string;
              materialColor?: string;
            }>;
            levelId?: string;
          };
          const _batchCeilLevelId = p.levelId ?? '';
          for (const c of (p.ceilings ?? [])) {
            if (!c.id || !c.boundary || c.boundary.length < 3) continue;
            events.emit('ceiling.created', {
              commandId:    record.id,
              commandType:  'ceiling.create',
              levelId:      c.levelId ?? _batchCeilLevelId,
              elementCount: 1,
              id:           c.id,
              boundary:     c.boundary,
              ceilingHeight: c.ceilingHeight,
              thickness:    c.thickness,
              // §FIX-CEILING-BRIDGE-FINISH (L-973): `materialId` was DECLARED on
              // this payload type and then never emitted — a field the reader
              // could see in the type and never in the event.
              materialId:   c.materialId,
              materialColor: c.materialColor,
            });
          }
          break;
        }

        case 'room.create': {
          const p = record.payload as { levelId?: string };
          events.emit('room.created', {
            commandId:   record.id,
            commandType: 'room.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'grid.create': {
          const p = record.payload as { levelId?: string };
          events.emit('grid.created', {
            commandId:   record.id,
            commandType: 'grid.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'handrail.create': {
          // §FT-HANDRAIL (HANDRAIL-BUS-MIGRATION, C11 §11.9): forward the full
          // geometry payload so the initTools.ts §FT-HANDRAIL bridge can mirror
          // the handrail into the legacy HandrailStore → HandrailFragmentBuilder
          // mesh + plan-view projection. Mirrors the §FT2 beam.create enrichment.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            path?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            height?: number;
            diameter?: number;
            shape?: string;
            hostId?: string;
            materialId?: string;
          };
          events.emit('handrail.created', {
            commandId:   record.id,
            commandType: 'handrail.create',
            levelId:     p.levelId ?? '',
            id:          p.id,
            path:        p.path,
            height:      p.height,
            diameter:    p.diameter,
            shape:       p.shape,
            hostId:      p.hostId,
            materialId:  p.materialId,
          });
          break;
        }

        case 'furniture.create': {
          // §FT-FURNITURE (FURNITURE-BUS-MIGRATION, C11 §11.10): forward the full
          // geometry payload so the initTools.ts §FT-FURNITURE bridge can mirror
          // the item into the legacy FurnitureStore → furniture builder 3D mesh.
          // Mirrors the §FT-HANDRAIL / §FT-LIGHTING enrichment.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            furnitureType?: string;
            position?: { x: number; y: number; z: number };
            rotation?: number;
            baseOffset?: number;
            width?: number;
            length?: number;
            height?: number;
            material?: string;
            // ⭐ C100 §2.1 / L-1460 — the MASTER catalogue id. `material` above is the
            // legacy four-value construction hint, not a material reference.
            materialId?: string;
            color?: string;
            furnitureCategory?: string;
            kitchenConfig?: unknown;
            wardrobeCabinetConfig?: unknown;
          };
          events.emit('furniture.created', {
            commandId:   record.id,
            commandType: 'furniture.create',
            levelId:     p.levelId ?? '',
            id:          p.id,
            furnitureType:         p.furnitureType,
            position:              p.position,
            rotation:              p.rotation,
            baseOffset:            p.baseOffset,
            width:                 p.width,
            length:                p.length,
            height:                p.height,
            material:              p.material,
            materialId:            p.materialId,      // C100 §2.1 / L-1460
            color:                 p.color,           // A.21.D4 — style colour
            furnitureCategory:     p.furnitureCategory,
            kitchenConfig:         p.kitchenConfig,
            wardrobeCabinetConfig: p.wardrobeCabinetConfig,
          });
          break;
        }

        case 'furniture.batch.create': {
          // §FIX-FURNISH-BATCH-PERF (L-100): the auto-furnish path dispatches ONE
          // `furniture.batch.create` per level (one produceCommand → one undo entry)
          // instead of N `furniture.create`. Fan out one `furniture.created` per
          // entry — commandType 'furniture.create' so the initTools §FT-FURNITURE
          // subscriber's commandType guard accepts each per-element event and the
          // render path (legacy FurnitureStore → builder → 3D mesh + plan symbol)
          // is byte-identical to the single-create path. Mirrors wall.batch.create.
          const p = record.payload as {
            furniture?: Array<{
              id?: string;
              levelId?: string;
              furnitureType?: string;
              position?: { x: number; y: number; z: number };
              rotation?: number;
              baseOffset?: number;
              width?: number;
              length?: number;
              height?: number;
              material?: string;
              materialId?: string;   // C100 §2.1 / L-1460 — the MASTER catalogue id
              color?: string;
              furnitureCategory?: string;
              kitchenConfig?: unknown;
              wardrobeCabinetConfig?: unknown;
            }>;
            levelId?: string;
          };
          const _batchFurnLevelId = p.levelId ?? '';
          for (const f of (p.furniture ?? [])) {
            if (!f.id || !f.furnitureType || !f.position) continue;
            events.emit('furniture.created', {
              commandId:   record.id,
              commandType: 'furniture.create',
              levelId:     f.levelId ?? _batchFurnLevelId,
              id:          f.id,
              furnitureType:         f.furnitureType,
              position:              f.position,
              rotation:              f.rotation,
              baseOffset:            f.baseOffset,
              width:                 f.width,
              length:                f.length,
              height:                f.height,
              material:              f.material,
              materialId:            f.materialId,    // C100 §2.1 / L-1460
              color:                 f.color,
              furnitureCategory:     f.furnitureCategory,
              kitchenConfig:         f.kitchenConfig,
              wardrobeCabinetConfig: f.wardrobeCabinetConfig,
            });
          }
          break;
        }

        case 'lighting.create': {
          // §FT-LIGHTING (LIGHTING-BUS-MIGRATION, C11 §11.11): forward the geometry
          // so the initTools §FT-LIGHTING bridge can mirror the fixture into the
          // legacy LightingStore → LightingFragmentBuilder 3D mesh.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            kind?: string;
            origin?: { x: number; y: number; z: number };
          };
          events.emit('lighting.created', {
            commandId:   record.id,
            commandType: 'lighting.create',
            levelId:     p.levelId ?? '',
            id:          p.id,
            kind:        p.kind,
            origin:      p.origin,
          });
          break;
        }

        case 'plumbing.create': {
          const p = record.payload as { levelId?: string };
          events.emit('plumbing.created', {
            commandId:   record.id,
            commandType: 'plumbing.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'structural.create': {
          const p = record.payload as { levelId?: string };
          events.emit('structural.created', {
            commandId:   record.id,
            commandType: 'structural.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'annotation.create': {
          const p = record.payload as { levelId?: string };
          events.emit('annotation.created', {
            commandId:   record.id,
            commandType: 'annotation.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'dimension.create': {
          const p = record.payload as { levelId?: string };
          events.emit('dimension.created', {
            commandId:   record.id,
            commandType: 'dimension.create',
            levelId:     p.levelId ?? '',
          });
          break;
        }

        case 'roof.create': {
          // §P3.2-RF: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can reconstruct footprint.{polygon, centroid} for RoofFragmentBuilder.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            boundary?: Array<{ x: number; y: number; z: number }>;
            shape?: string;
            overhang?: number;
            thickness?: number;
            /** §FIX-ROOF-PLAN-SHAPE-HARDCODED (L-699) — radians, per the L0 schema. */
            pitch?: number;
            /** §ROOF-FOLLOWS-WALL (L-924) — the walls a REGION-mode roof was traced from. */
            boundingWallIds?: string[];
          };
          events.emit('roof.created', {
            commandId:   record.id,
            commandType: 'roof.create',
            levelId:     p.levelId ?? '',
            id:          p.id,
            boundary:    p.boundary,
            shape:       p.shape,
            overhang:    p.overhang,
            thickness:   p.thickness,
            pitch:       p.pitch,
            // §ROOF-FOLLOWS-WALL (L-924) — forwarded UNTOUCHED, absence included.
            // This emit is a NAMED SUBSET of `record.payload`, so a field missing
            // from this list is dropped in flight however correctly the plan tool
            // dispatched it — which is exactly how the plan path came to store no
            // attribution while the 3D path could. No `?? []`: `undefined` means
            // "not region-traced" and `[]` would mean "traced, bounded nothing".
            boundingWallIds: p.boundingWallIds,
          });
          break;
        }

        case 'slab.updateLayers': {
          // TASK-12: emit 'slab.layer-updated' so FragmentBuilder subscribers know
          // the slab's system-type / layer stack has changed and can trigger a mesh rebuild.
          const p = record.payload as {
            slabId?: string;
            systemTypeId?: string;
            layers?: unknown[];
            thickness?: number;
          };
          events.emit('slab.layer-updated', {
            commandId:    record.id,
            commandType:  'slab.updateLayers',
            slabId:       p.slabId,
            systemTypeId: p.systemTypeId,
            layerCount:   Array.isArray(p.layers) ? p.layers.length : 0,
            thickness:    p.thickness,
          });
          break;
        }

        case 'ceiling.updateLayers': {
          // TASK-12: emit 'ceiling.layer-updated' so FragmentBuilder subscribers know
          // the ceiling's system-type / layer stack has changed and can trigger a mesh rebuild.
          const p = record.payload as {
            ceilingId?: string;
            systemTypeId?: string;
            layers?: unknown[];
            thickness?: number;
          };
          events.emit('ceiling.layer-updated', {
            commandId:    record.id,
            commandType:  'ceiling.updateLayers',
            ceilingId:    p.ceilingId,
            systemTypeId: p.systemTypeId,
            layerCount:   Array.isArray(p.layers) ? p.layers.length : 0,
            thickness:    p.thickness,
          });
          break;
        }

        case 'floor.updateLayers': {
          // TASK-12: emit 'floor.layer-updated' so FragmentBuilder subscribers know
          // the floor's system-type / layer stack has changed and can trigger a mesh rebuild.
          const p = record.payload as {
            floorId?: string;
            systemTypeId?: string;
            layers?: unknown[];
            thickness?: number;
          };
          events.emit('floor.layer-updated', {
            commandId:    record.id,
            commandType:  'floor.updateLayers',
            floorId:      p.floorId,
            systemTypeId: p.systemTypeId,
            layerCount:   Array.isArray(p.layers) ? p.layers.length : 0,
            thickness:    p.thickness,
          });
          break;
        }

        case 'floor.create': {
          // §P3.2-FL: enrich with geometry fields so the initTools.ts legacy-store bridge
          // can reconstruct a FloorData for FloorFragmentBuilder via floorStore.add().
          const p = record.payload as {
            floorId?: string;
            ifcGuid?: string;
            polygon?: Array<{ x: number; y: number; z: number }>;
            baseOffset?: number;
            thickness?: number;
            levelId?: string;
            label?: string;
            systemTypeId?: string;
            layers?: unknown[];
            finishSpec?: Record<string, unknown>;
            serviceHoles?: unknown[];
            hostSlabId?: string;
            hostRoomId?: string;
            createdBy?: string;
          };
          events.emit('floor.created', {
            commandId:    record.id,
            commandType:  'floor.create',
            levelId:      p.levelId ?? '',
            floorId:      p.floorId,
            ifcGuid:      p.ifcGuid,
            polygon:      p.polygon,
            baseOffset:   p.baseOffset,
            thickness:    p.thickness,
            label:        p.label,
            systemTypeId: p.systemTypeId,
            layers:       p.layers,
            finishSpec:   p.finishSpec,
            serviceHoles: p.serviceHoles,
            hostSlabId:   p.hostSlabId,
            hostRoomId:   p.hostRoomId,
            createdBy:    p.createdBy,
          });
          break;
        }

        case 'balcony.create': {
          // §FEAT-BALCONY-COMPOUND (L-5607) · C103 §7.4 · ADR-0333.
          //
          // ═══════════════════════════════════════════════════════════════════
          // ⭐ A COMPOUND EMITS ITS MEMBERS' EVENTS. IT DOES NOT GET A FOURTH BRIDGE.
          // ═══════════════════════════════════════════════════════════════════
          // `balcony.create` writes the slab, floor and handrail PLUGIN stores in ONE
          // multi-store patch — which is what buys one gesture = one undo entry. But
          // every legacy mirror in `initTools.ts` keys on the COMMAND TYPE, so none of
          // them fires for a command called `balcony.create`. Without this case the
          // balcony would land in the plugin stores and reach NEITHER the mesh
          // builders NOR the profile editor: authored, committed, and invisible.
          //
          // ⚠ THAT IS NOT HYPOTHETICAL — IT IS THE SWIMMING POOL'S LIVE STATE. Its own
          // commit says so: *"NOT VERIFIED … that a pool renders, that the water
          // surface draws"*. `pool.create` has no case here, so nothing mirrors its
          // walls, its floor slab or its water into the legacy stores. Measured
          // 2026-08-22, and the PATTERN is stated because a bare substring would
          // match this very comment and report the opposite of the truth:
          //   grep -nE "^\s+case 'pool\.(create|delete)'" CommandEventBridge.ts
          //   -> RC=1, zero matches.
          //
          // ⭐ THE FIX IS REUSE, NOT A NEW BRIDGE. `slab.batch.create` already
          // establishes the idiom: emit ONE member event PER MEMBER, stamped with the
          // member's OWN `commandType`, and the three existing `initTools.ts`
          // subscribers (§FT1 slab, §P3.2-FL floor, §FT-HANDRAIL handrail) mirror them
          // exactly as if the user had drawn each member by hand. No fourth mirror, no
          // fourth set of field-mapping bugs, and a balcony member is by construction
          // the same legacy record as a hand-drawn one.
          //
          // ⚠ `commandType` is deliberately the MEMBER's verb, not `'balcony.create'`.
          // The subscribers filter on it (`ev.commandType !== 'slab.create'` -> return),
          // so stamping the compound's verb would emit three events nothing listens to
          // — activation reported, nothing activated.
          //
          // ⭐ AND THE GEOMETRY IS READ FROM THE COMMIT, NOT FROM THE REQUEST. The
          // railing PATHS are computed by `buildBalconyAssembly` and are NOT in the
          // payload — the payload carries only the outline and the pre-minted ids. So
          // the members are read out of `record.forward`, which is what
          // `indexCommittedWalls` does above (ADR-002 §5: the bridge relays the
          // handler's RESULT). Recomputing them here would put a SECOND producer of
          // the rail geometry in the tree — the duplication defect this whole compound
          // was designed to avoid.
          //
          // ⚠ MULTI-STORE PATCH PATHS ARE `[storeKey, id]`, NOT `[id]`. That is the
          // one difference from every other case in this file, and it is exactly the
          // routing convention `produceMultiStoreCommand` documents.
          const p = record.payload as {
            levelId?: string;
            slabId?: string;
            floorId?: string;
            materialId?: string;
          };
          const _balconyLevelId = p.levelId ?? '';
          const _balconyCommitted = new Map<string, Map<string, Record<string, unknown>>>();
          for (const patch of record.forward ?? []) {
            if (patch.op !== 'add' || patch.path.length !== 2) continue;
            const storeKey = String(patch.path[0]);
            const memberId = String(patch.path[1]);
            const value = patch.value as Record<string, unknown> | undefined;
            if (!value || typeof value !== 'object' || memberId.length === 0) continue;
            let slice = _balconyCommitted.get(storeKey);
            if (!slice) { slice = new Map(); _balconyCommitted.set(storeKey, slice); }
            slice.set(memberId, value);
          }

          // (1) THE CANTILEVER PLATE — a real slab. `polygon` is `{x, y}` with y
          //     carrying world Z (the plan convention the §FT1 subscriber expects);
          //     `position` is the origin because SlabFragmentBuilder adds the centroid
          //     itself.
          const _balconySlab = p.slabId
            ? _balconyCommitted.get('slab')?.get(p.slabId)
            : undefined;
          if (p.slabId && _balconySlab) {
            const ring = (_balconySlab['boundary'] ?? []) as Array<{ x: number; y: number; z: number }>;
            events.emit('slab.created', {
              commandId:    record.id,
              commandType:  'slab.create',
              levelId:      _balconyLevelId,
              elementCount: 1,
              id:           p.slabId,
              // The member id doubles as the IFC guid — deterministic and unique per
              // member, so two balcony plates can never collide the way they would
              // under the mirror's `crypto.randomUUID()` fallback. Established
              // practice: `ResidentialBuildingExecutor` passes `createId('slab')`.
              ifcGuid:      p.slabId,
              polygon:      ring.map((v) => ({ x: v.x, y: v.z })),
              position:     { x: 0, y: 0, z: 0 },
              thickness:    _balconySlab['thickness'] as number | undefined,
              baseOffset:   _balconySlab['baseOffset'] as number | undefined,
              materialId:   (_balconySlab['materialId'] as string | undefined) ?? p.materialId,
            });
          }

          // (2) THE FLOOR FINISH — a real floor covering, NOT a second slab.
          //     `floor.created`'s polygon is 3-D, unlike the slab's.
          const _balconyFinish = p.floorId
            ? _balconyCommitted.get('floor')?.get(p.floorId)
            : undefined;
          if (p.floorId && _balconyFinish) {
            const ring = (_balconyFinish['boundary'] ?? []) as Array<{ x: number; y: number; z: number }>;
            events.emit('floor.created', {
              commandId:    record.id,
              commandType:  'floor.create',
              levelId:      _balconyLevelId,
              floorId:      p.floorId,
              ifcGuid:      p.floorId,
              polygon:      ring.map((v) => ({ x: v.x, y: v.y, z: v.z })),
              baseOffset:   _balconyFinish['baseOffset'] as number | undefined,
              thickness:    _balconyFinish['thickness'] as number | undefined,
              // ⚠ `hostSlabId` IS sent, and it is load-bearing rather than decorative:
              // `FloorSlabBindingHandler._onSlabUpdated` uses it to keep the finish
              // resting on the plate when the plate moves vertically. A balcony finish
              // that did not carry it would detach the first time the plate moved.
              hostSlabId:   p.slabId,
              createdBy:    'balcony.create',
            });
          }

          // (3) THE RAILING — one real handrail per FREE edge, carrying the path the
          //     assembly actually committed (its `y` is the FINISHED floor level).
          for (const [railId, rail] of _balconyCommitted.get('handrail') ?? []) {
            events.emit('handrail.created', {
              commandId:   record.id,
              commandType: 'handrail.create',
              levelId:     _balconyLevelId,
              id:          railId,
              path:        rail['path'] as ReadonlyArray<{ x: number; y?: number; z: number }> | undefined,
              height:      rail['height'] as number | undefined,
              diameter:    rail['diameter'] as number | undefined,
              shape:       rail['shape'] as string | undefined,
              hostId:      rail['hostId'] as string | undefined,
              materialId:  (rail['materialId'] as string | undefined) ?? p.materialId,
            });
          }
          break;
        }

        case 'lift.create': {
          // §FIX-LIFT-LOST-BETWEEN-DISPATCH-AND-STORE (L-7820..L-7824) · C104 · C11 §5.2.
          //
          // ═══════════════════════════════════════════════════════════════════
          // ⭐ THE FOUNDER PLACED A LIFT. THE COMMAND RAN. NO ELEMENT LANDED, AND
          // NOTHING ANYWHERE SAID SO.
          // ═══════════════════════════════════════════════════════════════════
          // His console, in order: the status bar read "Lift: standalone glass ·
          // 1.50 × 1.60 m · serves 2 storeys from this level up · click to place",
          // the dashed preview drew, `lift.create` reached the SYNC adapter (that is
          // what emits the W5-3 warning, so the command really was dispatched) — and
          // then `[ProjectSerializer] Snapshot created: 14 elements`, unchanged from
          // 14 before. Between dispatch and the store the lift disappeared in silence.
          //
          // ⛔ IT WAS THIS SWITCH. `lift.create` had no case, so it fell to
          // `default: break;` — which is a SILENT DROP dressed as exhaustiveness.
          // Measured 2026-08-23, and stated as a pattern because a bare substring
          // matches this very comment and reports the opposite of the truth:
          //     grep -nE "^\s+case 'lift\.(create|delete)'" CommandEventBridge.ts
          //     -> RC=1, zero matches.   (`grep -in lift` over the whole file: 0.)
          //
          // ⭐ AND THE SAME TWO-STORES TRAP IS WHY NOTHING ELSE CAUGHT IT. There are
          // TWO lift stores and they are different elements:
          //   · `LiftCompoundStore` (plugins/lift) — what `lift.create` writes.
          //   · `LiftStore` (@pryzm/geometry-lift) — the LOD-200 MASSING lift, which
          //     emits `bim-lift-added` and IS already rendered by `LiftMeshBuilder`
          //     (wired at initBuilders.ts:985).
          // So a mesh builder exists, is constructed, and listens to the OTHER store.
          // UNDO37 recorded the identical trap for undo (L-7311) and correctly refused
          // to alias the two — "mapping it is C03 §4.6 U-2b corruption". Feeding the
          // compound into the massing store to make it draw would be that same
          // corruption with a renderer attached, and would leave one id meaning two
          // elements at two levels of detail (C84 EI-9). It is not done here.
          //
          // ⭐ THE FIX IS THE BALCONY'S IDIOM, REUSED VERBATIM — emit ONE member event
          // PER MEMBER, stamped with the MEMBER's OWN verb, so the existing legacy
          // mirrors treat a lift's enclosure exactly as if the architect had drawn each
          // side by hand. No fourth mirror and no second set of field-mapping bugs.
          //
          // ⚠ THE MIRROR CENSUS ABOVE WAS MEASURED WITH THE WRONG SPELLING, AND THE
          // CORRECTION IS THE WHOLE OF L-9401/L-9402. It read:
          //     'door.created'        -> 0 subscribers   ❌ typed event exists, nothing listens
          //     'curtainwall.created' -> 0 subscribers, AND NO SUCH EVENT IS DECLARED
          // and concluded that closing the lift meant DECLARING a curtain-wall event and
          // giving `door.created` a SUBSCRIBER. Re-measured 2026-08-23 (lane LIFT56),
          // both halves are false, and both are false in the same direction — the
          // channel already existed and the search missed it:
          //
          //   ⭐ `curtain-wall.created` IS DECLARED (types.ts), IS EMITTED (this file,
          //      the `curtain-wall.create` case) and HAS A LIVE MIRROR (initTools §P3.1-CW
          //      -> `curtainWallRecordFromCreatedEvent` -> `curtainWallStoreInstance.add`
          //      -> `bim-curtainwall-added` -> the curtain-wall builder). The census
          //      grepped `curtainwall.created`, UNHYPHENATED. One character.
          //      [[grep-silence-has-three-causes]] — a grep that returns nothing is not
          //      the same fact as a thing that does not exist.
          //
          //   ⭐ A LANDING DOOR'S CHANNEL IS NOT `door.created` AT ALL — it is
          //      `wall.opening.created`. That is the §P2.3 mirror, and it is the one
          //      that matters: it punches the OPENING into the legacy wall (so the hole
          //      appears in the shaft) AND writes the `DoorStore` record through the ONE
          //      `buildDoorStoreRecord` chokepoint (so the leaf and the plan symbol
          //      appear). `door.created` is a bare count event with no geometry
          //      (`{commandId, commandType, levelId, elementCount}`) and TASK-13 removed
          //      its case here deliberately — doors use the Committer architecture.
          //      Giving IT a subscriber would have minted a SECOND channel for a concept
          //      that already has one: C84 EI-9, the very rule the old text invoked.
          //
          // So a STANDALONE-GLASS lift now mirrors COMPLETELY: the landing side as a
          // wall, the three glass sides as curtain walls, the landing doors as C15
          // openings in the landing side. Nothing is smuggled through as a family it is
          // not — R-12 holds — because nothing needed to be.
          const p = record.payload as {
            levelId?: string;
            liftId?: string;
            materialId?: string;
            enclosureIds?: readonly string[];
            landingDoorIds?: readonly string[];
            cabinPartIds?: readonly string[];
          };
          const _liftLevelId = p.levelId ?? '';

          // ⚠ MULTI-STORE PATCH PATHS ARE `[storeKey, id]`, NOT `[id]` — the
          // `produceMultiStoreCommand` routing convention, same as the balcony above.
          // Reading the COMMIT rather than the request is load-bearing here for the
          // same reason it is there: the enclosure geometry is computed by
          // `buildLiftAssembly` and is NOT in the payload, which carries only the
          // origin, the served levels and the pre-minted ids.
          const _liftCommitted = new Map<string, Map<string, Record<string, unknown>>>();
          for (const patch of record.forward ?? []) {
            if (patch.op !== 'add' || patch.path.length !== 2) continue;
            const storeKey = String(patch.path[0]);
            const memberId = String(patch.path[1]);
            const value = patch.value as Record<string, unknown> | undefined;
            if (!value || typeof value !== 'object' || memberId.length === 0) continue;
            let slice = _liftCommitted.get(storeKey);
            if (!slice) { slice = new Map(); _liftCommitted.set(storeKey, slice); }
            slice.set(memberId, value);
          }

          // (1) THE SHAFT ENCLOSURE, wall sides only — the four sides of a wall-hosted
          //     shaft, or the single landing side of a standalone-glass one. Each is a
          //     real `Wall` record the assembly already built (`type: 'wall'`, with
          //     `baseLine` / `height` / `thickness` / `baseOffset`), so the §P2.1 mirror
          //     builds it exactly as it builds a hand-drawn wall.
          let _liftWallSides = 0;
          for (const [wallId, wall] of _liftCommitted.get('wall') ?? []) {
            // ⛔ ONLY the sides THIS command added. A wall-hosted lift's `hostWallId`
            // names a PRE-EXISTING wall, and the slab store is patched by REPLACE (the
            // voids), not `add` — so neither can reach this loop. Re-emitting
            // `wall.created` for the host would mint a duplicate legacy record.
            if (wall['parentId'] !== p.liftId) continue;
            events.emit('wall.created', {
              commandId:    record.id,
              commandType:  'wall.create',
              levelId:      (wall['levelId'] as string | undefined) ?? _liftLevelId,
              wallCount:    1,
              wallId,
              baseLine:     wall['baseLine'] as ReadonlyArray<{ x: number; y?: number; z: number }> | undefined,
              height:       wall['height']     as number | undefined,
              thickness:    wall['thickness']  as number | undefined,
              baseOffset:   wall['baseOffset'] as number | undefined,
              // ⭐ C100 §2.1 — the MASTER id, forwarded so the shaft can say what it is
              // made OF rather than arriving at the render store with only a hex.
              materialId:   (wall['materialId'] as string | undefined) ?? p.materialId,
            });
            _liftWallSides++;
          }

          // (2) THE GLAZED SIDES — AS CURTAIN WALLS, THROUGH THE CHANNEL THAT ALREADY
          //     EXISTED. §P3.1-CW's mirror maps this straight onto the legacy
          //     `CurtainWallData` and fires `bim-curtainwall-added`, so a lift's glass
          //     is built by the SAME builder that builds a hand-drawn curtain wall.
          //
          //     ⛔ `commandType` MUST be the literal `'curtain-wall.create'`: the
          //     mirror's accept-set is exactly that one string
          //     (`ACCEPTED_CURTAIN_WALL_COMMAND_TYPES`, narrowed by L-972 precisely so a
          //     value nothing emits cannot survive as a dead arm). Stamping
          //     `'lift.create'` here would emit three events nothing accepts —
          //     activation reported, nothing activated.
          let _liftGlassSides = 0;
          for (const [cwId, cw] of _liftCommitted.get('curtainwall') ?? []) {
            if (cw['parentId'] !== p.liftId) continue;
            events.emit('curtain-wall.created', {
              commandId:        record.id,
              commandType:      'curtain-wall.create',
              levelId:          (cw['levelId'] as string | undefined) ?? _liftLevelId,
              elementCount:     1,
              id:               cwId,
              baseLine:         cw['baseLine'] as ReadonlyArray<{ x: number; y?: number; z: number }> | undefined,
              height:           cw['height']           as number | undefined,
              baseOffset:       cw['baseOffset']       as number | undefined,
              // ⚠ WITHOUT THESE TWO THE MESH IS EMPTY, not merely ungridded. The
              // legacy builder's `migrateToGridSystem()` reads them as
              // `gridXSpacing`/`gridYSpacing` and produces NaN -> 0 mullion counts
              // without finite positives. The assembly sets them per side.
              bayWidth:         cw['bayWidth']         as number | undefined,
              bayHeight:        cw['bayHeight']        as number | undefined,
              mullionThickness: cw['mullionThickness'] as number | undefined,
              panelThickness:   cw['panelThickness']   as number | undefined,
              materialId:       (cw['materialId'] as string | undefined) ?? p.materialId,
              panels:           cw['panels'] as ReadonlyArray<{ id: string }> | undefined,
            });
            _liftGlassSides++;
          }

          // (3) THE LANDING DOORS — AS C15 OPENINGS IN THE LANDING SIDE.
          //     ⭐ THIS IS THE CHANNEL, AND IT IS NOT `door.created`. §P2.3 does BOTH
          //     halves of what a landing door needs: `addOpening()` on the legacy wall
          //     (the HOLE in the shaft) and `doorStore.add(buildDoorStoreRecord(...))`
          //     (the LEAF and the plan swing symbol) — through the same one chokepoint
          //     a hand-placed door uses, so a lift's door is by construction the same
          //     legacy record as a drawn one.
          //
          //     ⚠ ORDER IS LOAD-BEARING: the wall loop above ran FIRST, so the landing
          //     side is already in the legacy `WallStore` when its openings arrive. The
          //     §P2.3 mirror reads that wall for the dedup guard and for the level id;
          //     emitting the openings first would land them on a wall that is not there
          //     yet, and `addOpening` would throw into its own non-fatal catch.
          const _liftLandingSideId = (() => {
            const lifts = _liftCommitted.get('lift');
            const rec = p.liftId ? lifts?.get(p.liftId) : undefined;
            return rec?.['landingSideId'] as string | undefined;
          })();
          let _liftDoorOpenings = 0;
          for (const [doorId, door] of _liftCommitted.get('door') ?? []) {
            if (door['parentId'] !== p.liftId) continue;
            const hostWallId = (door['wallId'] as string | undefined) ?? _liftLandingSideId;
            if (!hostWallId) continue;
            events.emit('wall.opening.created', {
              commandId:   record.id,
              commandType: 'wall.opening.create',
              wallId:      hostWallId,
              opening: {
                // The opening id the assembly minted, NOT the door id. They are two
                // records: the hole and the thing in it. `Door.openingId` is the
                // back-reference, and §P2.3 dedups the wall's `openings[]` on THIS id
                // while it dedups `DoorStore` on `elementId`.
                id:         door['openingId'] as string | undefined,
                elementId:  doorId,
                type:       'door',
                doorType:   door['doorType']   as string | undefined,
                offset:     door['offset']     as number | undefined,
                width:      door['width']      as number | undefined,
                height:     door['height']     as number | undefined,
                sillHeight: door['sillHeight'] as number | undefined,
                swing:      door['swing']      as string | undefined,
                levelId:    door['levelId']    as string | undefined,
                // C100 §6.1 — the MASTER id, forwarded so the leaf can say what it is
                // made of. `buildDoorStoreRecord` reads it off the opening.
                materialId: (door['leafMaterialId'] as string | undefined) ?? p.materialId,
              },
            });
            _liftDoorOpenings++;
          }

          // (4) THE CABIN, THE FRAME AND THE GUIDE RAILS — THE MEMBERS THAT REALLY DID
          //     HAVE NO FAMILY. ⭐ This is the one place the old diagnosis was exactly
          //     right (*"no legacy family and no fragment builder"*), so this is the one
          //     place something new was BUILT rather than connected:
          //     `LiftCompoundMeshBuilder` (@pryzm/geometry-lift), wired to this event by
          //     the §FT-LIFT subscriber in initTools.ts.
          //
          //     ⛔ ONE EVENT FOR ALL THE PARTS, NOT ONE PER PART. A lift serving ten
          //     storeys carries ~70 members; the builder rebuilds the compound's whole
          //     group in one pass, so N events would mean N full rebuilds of the same
          //     group for one gesture. The per-member idiom exists so EXISTING mirrors
          //     can be reused; where the consumer is new and is a single compound
          //     builder, the compound is the right unit.
          const _liftParts: Array<Record<string, unknown>> = [];
          for (const [, part] of _liftCommitted.get('liftPart') ?? []) {
            if (part['parentId'] !== p.liftId) continue;
            _liftParts.push(part);
          }
          const _liftRecord = p.liftId ? _liftCommitted.get('lift')?.get(p.liftId) : undefined;
          if (p.liftId && _liftRecord && _liftParts.length > 0) {
            events.emit('lift.created', {
              commandId:    record.id,
              commandType:  'lift.create',
              levelId:      (_liftRecord['levelId'] as string | undefined) ?? _liftLevelId,
              liftId:       p.liftId,
              origin:       _liftRecord['origin'] as { x: number; y: number; z: number },
              rotation:     (_liftRecord['rotation'] as number | undefined) ?? 0,
              enclosureType: _liftRecord['enclosureType'] as string | undefined,
              // ⚠ The cabin parts' `offsetY` is measured from the PARKED CAR FLOOR.
              // Without this number five car-local boxes have no elevation to stand
              // at and the car would be drawn sitting on the level datum — which for
              // a lift whose lowest served storey is not the base level is a car
              // hanging in the shaft at the wrong floor.
              carParkOffsetY: (_liftRecord['carParkOffsetY'] as number | undefined) ?? 0,
              mark:         _liftRecord['mark'] as string | undefined,
              parts:        _liftParts as never,
            });
          }

          // (5) ⛔ WHAT STILL CANNOT RENDER — NAMED, COUNTED, AND SAID OUT LOUD.
          //     R-13 (C104 §13.3): a create that produces no visible element MUST SAY
          //     SO, at the layer that knows. ⭐ AND IT MUST GO QUIET WHEN THERE IS
          //     NOTHING TO SAY — a warning that fires on every successful lift is a
          //     warning nobody reads, which fails in exactly the way silence does.
          //
          //     ⛔ DO NOT DELETE THIS BLOCK WHEN THE LAST ROW CLOSES. Its job is to be
          //     the thing that notices the NEXT member kind to arrive without a mirror.
          //     A diagnostic that went quiet because someone removed it is strictly
          //     worse than the bug it was watching for.
          const _liftUnmirrored: string[] = [];
          // ⭐ L-9403 IS CLOSED HERE — and the block it was written in is kept,
          // because its job was never "carry this one row". Measured 2026-08-23
          // (lane MIRROR3): the lane that landed the lift wrote *"there is no
          // `slab.updated` mirror in initTools.ts — every slab bridge there keys on
          // a CREATE"*, and that was true of the whole repository, not just the
          // lift: `grep -c "\.updated'" apps/editor/src/engine/initTools.ts` → **0**.
          // The fix is therefore NOT a lift-shaped one. `element.updated`
          // (§MIRROR-UPDATE, L-9942) is the channel that was missing, the pool's
          // host-slab void needs exactly the same one, and both now ride it.
          //
          // ⛔ ONE EVENT PER PENETRATED SLAB, keyed by the slab's OWN id — never one
          // per patch. A lift serving ten storeys punches one void per plate, and a
          // second patch on the same plate must not make the mirror rebuild it twice.
          const _liftVoidedSlabIds = new Set<string>();
          for (const patch of record.forward ?? []) {
            if (patch.op !== 'replace' || patch.path.length !== 3) continue;
            if (String(patch.path[0]) !== 'slab' || String(patch.path[2]) !== 'holes') continue;
            const slabId = String(patch.path[1]);
            if (slabId.length > 0) _liftVoidedSlabIds.add(slabId);
          }
          const _liftSlabVoids = _liftVoidedSlabIds.size;
          for (const slabId of _liftVoidedSlabIds) {
            events.emit('element.updated', {
              commandId:     record.id,
              commandType:   'lift.create',
              elementKind:   'slab',
              elementId:     slabId,
              changedFields: ['holes'],
            });
          }
          if (_liftUnmirrored.length > 0) {
            console.warn(
              `[CommandEventBridge] §FEAT-LIFT-OBSERVATION-FRAME (L-9400..L-9403): ` +
              `lift ${p.liftId ?? '(unnamed)'} COMMITTED, and reached the legacy mirrors ` +
              `as ${_liftWallSides} wall side(s), ${_liftGlassSides} curtain-wall side(s), ` +
              `${_liftDoorOpenings} landing-door opening(s), ${_liftSlabVoids} slab void(s) ` +
              `and ${_liftParts.length} ` +
              `cabin/frame part(s). THE FOLLOWING MEMBERS REACHED NO MIRROR AND WILL NOT ` +
              `RENDER: ` + _liftUnmirrored.join('; ') + '. ' +
              `This is a PARTIAL create, not a failed one and not a complete one — the ` +
              `lift record is real, undoable and schedulable, and part of it is invisible. ` +
              `See docs/02-decisions/contracts/C104-*.md §13.`);
          }
          break;
        }

        case 'pool.create': {
          // §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9940) · L-9305 · ADR-0124 §3
          // · C11 §5.2 · C84 EI-9.
          //
          // ═══════════════════════════════════════════════════════════════════
          // ⭐ THE FOUNDER DREW A POOL. IT COMMITTED. NOTHING APPEARED.
          // ═══════════════════════════════════════════════════════════════════
          // `pool.create` writes FOUR stores in one patch pair, is undoable, and
          // reports success. Then it stops: every legacy mirror in `initTools.ts`
          // keys on the COMMAND TYPE, so none of them fires for a command called
          // `pool.create`, and the pool's walls, floor and water reached NOTHING.
          //
          // ⚠ THE `default:` DETECTOR BELOW ALREADY SAW THIS AND SAID SO — it is
          // a four-store compound, so `stores.size > 1` is true and it warns. It
          // warned into a console nobody was reading, once per tab, and the
          // balcony case above named the pool IN PROSE as the live instance long
          // before that. A warning is not a mirror. This case is the mirror.
          //
          // ⭐ THE IDIOM IS THE BALCONY'S AND THE LIFT'S, REUSED VERBATIM: emit
          // ONE MEMBER EVENT PER MEMBER, stamped with the MEMBER's OWN verb, so
          // §P2.1 (wall) and §FT1 (slab) treat a pool's basin exactly as they
          // treat a hand-drawn wall and a hand-drawn slab. No fifth mirror, no
          // fifth set of field-mapping bugs, and a pool wall is BY CONSTRUCTION
          // the same legacy record as a drawn one — which is the whole reason
          // `plugins/pool/src/store.ts` refuses to keep a private copy of it.
          //
          // ⚠ MULTI-STORE PATCH PATHS ARE `[storeKey, id]`, NOT `[id]` — the
          // `produceMultiStoreCommand` routing convention, same as the balcony
          // and the lift above. And the geometry is READ OFF THE COMMIT, never
          // the payload: `buildPoolAssembly` computes every baseline, the floor
          // ring and the water body, and the payload carries only the outline,
          // the host id and the pre-minted ids (ADR-002 §5).
          const p = record.payload as {
            levelId?: string;
            poolId?: string;
            hostSlabId?: string;
            floorSlabId?: string;
            waterId?: string;
            materialId?: string;
          };
          const _poolLevelId = p.levelId ?? '';
          const _poolCommitted = new Map<string, Map<string, Record<string, unknown>>>();
          for (const patch of record.forward ?? []) {
            if (patch.op !== 'add' || patch.path.length !== 2) continue;
            const storeKey = String(patch.path[0]);
            const memberId = String(patch.path[1]);
            const value = patch.value as Record<string, unknown> | undefined;
            if (!value || typeof value !== 'object' || memberId.length === 0) continue;
            let slice = _poolCommitted.get(storeKey);
            if (!slice) { slice = new Map(); _poolCommitted.set(storeKey, slice); }
            slice.set(memberId, value);
          }

          // (1) THE BASIN WALLS — one real `Wall` per boundary EDGE, each with a
          //     NEGATIVE `baseOffset` (`-depth`) so it hangs BELOW the level datum
          //     instead of standing on it. That sign is the whole trick of the
          //     assembly, and the §P2.1 mirror carries `baseOffset` verbatim — so
          //     nothing here has to know about it, which is the point of reusing
          //     the channel rather than minting one.
          //
          //     ⛔ ONLY the walls THIS command added: `parentId === poolId`. The
          //     host slab is patched by REPLACE, not `add`, so it cannot reach this
          //     loop — but the guard is stated rather than relied upon, because the
          //     lift's identical loop needs it for a real reason (a wall-hosted
          //     shaft names a PRE-EXISTING host wall) and a reader comparing the
          //     two must not conclude one of them is decorative.
          let _poolWallSides = 0;
          for (const [wallId, wall] of _poolCommitted.get('wall') ?? []) {
            if (wall['parentId'] !== p.poolId) continue;
            events.emit('wall.created', {
              commandId:   record.id,
              commandType: 'wall.create',
              levelId:     (wall['levelId'] as string | undefined) ?? _poolLevelId,
              wallCount:   1,
              wallId,
              baseLine:    wall['baseLine'] as ReadonlyArray<{ x: number; y?: number; z: number }> | undefined,
              height:      wall['height']     as number | undefined,
              thickness:   wall['thickness']  as number | undefined,
              baseOffset:  wall['baseOffset'] as number | undefined,
              // C100 §2.1 — the MASTER id, so the basin can say what it is made OF
              // rather than arriving at the render store with only a hex.
              materialId:  (wall['materialId'] as string | undefined) ?? p.materialId,
              ...(typeof wall['materialColor'] === 'string'
                ? { materialColor: wall['materialColor'] as string }
                : {}),
            });
            _poolWallSides++;
          }

          // (2) THE POOL FLOOR — a real `Slab`, through §FT1.
          //     ⚠ `slab.created`'s `polygon` is the PLAN convention `{x, y}` where
          //     `y` carries world Z; the committed record's `boundary` is 3-D world.
          //     The balcony case makes exactly this conversion for exactly this
          //     mirror, and getting it wrong lays the basin down in the XY plane.
          //     `position` is the origin because `SlabFragmentBuilder` adds the
          //     centroid itself.
          const _poolFloor = p.floorSlabId
            ? _poolCommitted.get('slab')?.get(p.floorSlabId)
            : undefined;
          let _poolFloorMirrored = false;
          if (p.floorSlabId && _poolFloor) {
            const ring = (_poolFloor['boundary'] ?? []) as Array<{ x: number; y: number; z: number }>;
            events.emit('slab.created', {
              commandId:    record.id,
              commandType:  'slab.create',
              levelId:      (_poolFloor['levelId'] as string | undefined) ?? _poolLevelId,
              elementCount: 1,
              id:           p.floorSlabId,
              // The member id doubles as the IFC guid — deterministic per member,
              // so two pools can never collide the way they would under the
              // mirror's `crypto.randomUUID()` fallback (the balcony's reasoning,
              // and the same one).
              ifcGuid:      p.floorSlabId,
              polygon:      ring.map((v) => ({ x: v.x, y: v.z })),
              position:     { x: 0, y: 0, z: 0 },
              thickness:    _poolFloor['thickness']  as number | undefined,
              baseOffset:   _poolFloor['baseOffset'] as number | undefined,
              materialId:   (_poolFloor['materialId'] as string | undefined) ?? p.materialId,
            });
            _poolFloorMirrored = true;
          }

          // (3) THE VOID IN THE HOST SLAB — through the §MIRROR-UPDATE mutation
          //     channel, NOT through a create.
          //
          //     ⭐ THIS IS THE HALF THAT HAD NO CHANNEL AT ALL UNTIL L-9942. The
          //     host's `holes` is a whole-array REPLACE on an EXISTING slab
          //     (`{op:'replace', path:['slab', hostSlabId, 'holes']}`), and every
          //     legacy slab bridge keys on a CREATE — which is why the lift's
          //     shaft penetration is recorded at L-9403 as the one row that lane
          //     could not close. `element.updated` is that missing channel, and
          //     the pool and the lift now share it.
          //
          //     ⛔ It is emitted ONLY when the patch is really there. A pool whose
          //     host hole failed to commit must not have one announced for it.
          const _poolHostHoled = (record.forward ?? []).some(
            (patch) => patch.op === 'replace' && patch.path.length === 3 &&
                       String(patch.path[0]) === 'slab' &&
                       String(patch.path[1]) === String(p.hostSlabId ?? '') &&
                       String(patch.path[2]) === 'holes',
          );
          if (_poolHostHoled && p.hostSlabId) {
            events.emit('element.updated', {
              commandId:     record.id,
              commandType:   'pool.create',
              elementKind:   'slab',
              elementId:     p.hostSlabId,
              changedFields: ['holes'],
            });
          }

          // (4) ⛔ WHAT STILL CANNOT RENDER — NAMED, COUNTED, AND SAID OUT LOUD.
          //     C104 §13.3 R-13, applied to a second family: a create that produces
          //     an invisible member MUST SAY SO, at the layer that knows.
          //
          //     ⭐ AND IT GOES QUIET WHEN THERE IS NOTHING TO SAY. A line on every
          //     successful pool is a line nobody reads, which fails exactly the way
          //     silence does.
          //
          //     ⛔ THE WATER IS NOT SMUGGLED THROUGH AS A SLAB. `water` is its own
          //     family precisely because a slab's thickness would tie the surface to
          //     the floor (`PoolAssembly.ts` §4, and `poolWaterLevel.test.ts` pins
          //     it). Emitting `slab.created` for it to make something blue appear
          //     would put one id on two families and give the water a thickness it
          //     does not have — C84 EI-9, and the same refusal the lift made when it
          //     declined to feed its compound into the massing store.
          const _poolWaterCount = _poolCommitted.get('water')?.size ?? 0;
          const _poolUnmirrored: string[] = [];
          if (_poolWaterCount > 0) {
            _poolUnmirrored.push(
              `the WATER BODY (${_poolWaterCount} record(s)) — 'water' has no typed ` +
              `event, no subscriber and no mesh builder anywhere in the tree; the ` +
              `basin renders and the water in it does not (L-9941)`);
          }
          if (p.hostSlabId && !_poolHostHoled) {
            _poolUnmirrored.push(
              `the VOID in host slab '${p.hostSlabId}' — no 'holes' replace patch was ` +
              `committed, so the pool sits ON the floor plate rather than IN it`);
          }
          if (p.floorSlabId && !_poolFloorMirrored) {
            _poolUnmirrored.push(
              `the pool FLOOR '${p.floorSlabId}' — no committed slab record was found ` +
              `in the patches, so the basin has no bottom on screen`);
          }
          if (_poolUnmirrored.length > 0) {
            console.warn(
              `[CommandEventBridge] §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9940..L-9941): ` +
              `pool ${p.poolId ?? '(unnamed)'} COMMITTED, and reached the legacy mirrors as ` +
              `${_poolWallSides} basin wall(s)` +
              (_poolFloorMirrored ? ' and 1 floor slab' : '') + '. ' +
              `THE FOLLOWING MEMBERS REACHED NO MIRROR AND WILL NOT RENDER: ` +
              _poolUnmirrored.join('; ') + '. ' +
              `This is a PARTIAL create, not a failed one and not a complete one — the ` +
              `pool record is real, undoable and schedulable, and part of it is invisible. ` +
              `See docs/04-reference/ISSUE-LOG.md L-9940.`);
          }
          break;
        }

        case 'boundaryLine.create':
        case 'boundaryLine.update':
        case 'boundaryLine.attach':
        case 'boundaryLine.detach':
        case 'boundaryLine.move': {
          // §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944) · C106 · L-9305 · C11 §5.2.
          //
          // ═══════════════════════════════════════════════════════════════════
          // ⭐ THE BOUNDARY LINE WAS BROKEN ON THREE AXES AT ONCE, AND ONLY ONE
          //    OF THEM WAS THIS FILE.
          // ═══════════════════════════════════════════════════════════════════
          // Measured 2026-08-23 (AUDIT-B §2.5, re-run by this lane):
          //   · no `case 'boundaryLine.*'` here          → never reaches a mesh;
          //   · `boundaryLineSolid()` had ZERO callers   → even a relayed event
          //     would have found no builder to call;
          //   · zero `boundaryLine` in either serializer → the record dies on save.
          //
          // ⛔ AND THE L-7825 DETECTOR BELOW CANNOT SEE IT. That detector fires on
          // a MULTI-STORE compound (`path.length === 2` and `stores.size > 1`).
          // `boundaryLine.create` writes ONE store through `produceCommand`, whose
          // patch paths are length 1 — so the mechanism that was built to stop the
          // next silent drop is structurally blind to this family. That is the
          // "un-mechanised residue" AUDIT-B names, and it is why the STATIC gate
          // `tools/ga-gate/check-mirror-completeness.ts` had to exist as well:
          // a runtime detector only speaks about the shapes it was taught, and
          // only when somebody exercises the verb.
          //
          // ⭐ ONE CASE FOR FIVE VERBS, ON PURPOSE. They all mean the same thing to
          // a renderer — *"this line's record changed, redraw it"* — and the twelve
          // `.created` cases above are the standing demonstration of what
          // one-block-per-verb costs (each drifted its own set of dropped fields).
          // The `phase` split below is create-vs-update ONLY, because the
          // subscriber's dedup and its VDT registration differ there and nowhere
          // else.
          //
          // ⚠ `boundaryLine.move` HAS NO PATCHES AND THAT IS CORRECT. It is the
          // L-220 distinct-verb bridge to `MoveBoundaryLineCommand`
          // (`initBusHandlers.ts`), which declares `stores: []` and writes the store
          // through `BoundaryLineStorePort`. So `line` is ABSENT for it, and the
          // subscriber falls back to reading `runtime.stores.boundaryLine` — which
          // for THIS family is not a fallback at all but the authority
          // (`plugins/boundary-line/src/store.ts`: one store, deliberately, no
          // legacy geometry twin to drift from).
          const p = record.payload as {
            boundaryLineId?: string;
            levelId?: string;
            vertices?: readonly unknown[];
          };
          const _blId = typeof p.boundaryLineId === 'string' ? p.boundaryLineId : '';
          if (_blId.length === 0) break;

          // The whole committed record, when the verb wrote one. `create` writes
          // `draft[id] = record` (an `add` at path `[id]`); `update` writes
          // `draft[id] = next` (a `replace` at the same path). `attach`/`detach`
          // write `rec.attachments = [...]` — path `[id,'attachments']` — so there
          // is no whole record on the commit and this stays `undefined`.
          let _blLine: Record<string, unknown> | undefined;
          for (const patch of record.forward ?? []) {
            if (patch.path.length !== 1 || String(patch.path[0]) !== _blId) continue;
            if (patch.op !== 'add' && patch.op !== 'replace') continue;
            const value = patch.value as Record<string, unknown> | undefined;
            if (value && typeof value === 'object') _blLine = value;
          }
          const _blLevelId = (_blLine?.['levelId'] as string | undefined) ?? p.levelId ?? '';

          if (record.type === 'boundaryLine.create') {
            events.emit('boundaryLine.created', {
              commandId:      record.id,
              commandType:    'boundaryLine.create',
              levelId:        _blLevelId,
              boundaryLineId: _blId,
              ...(_blLine ? { line: _blLine } : {}),
            });
          } else {
            events.emit('boundaryLine.updated', {
              commandId:      record.id,
              commandType:    record.type,
              levelId:        _blLevelId,
              boundaryLineId: _blId,
              ...(_blLine ? { line: _blLine } : {}),
            });
          }
          break;
        }

        case 'boundaryLine.delete': {
          // §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944) · C106 §6.
          //
          // ⛔ THE LINE ONLY. `boundary-line/src/handlers/index.ts` and C106 §6 both
          // state the rule: a boundary line is NOT a compound, `childrenIds` stays
          // empty, and deleting the setting-out line an architect drew a building
          // against must not delete the building. So this emits ONE removal for ONE
          // id and cascades nothing — the asymmetry with `pool.delete` is deliberate
          // and is written down in two places so a later lane cannot "fix" it.
          const p = record.payload as { boundaryLineId?: string };
          const _blDelId = typeof p.boundaryLineId === 'string' ? p.boundaryLineId : '';
          if (_blDelId.length === 0) break;
          events.emit('boundaryLine.deleted', {
            commandId:      record.id,
            commandType:    'boundaryLine.delete',
            boundaryLineId: _blDelId,
          });
          break;
        }

        default:
          // ⛔ §FIX-COMPOUND-SILENT-DROP (L-7825) — `default: break;` USED TO BE THE
          // WHOLE OF THIS BRANCH, AND IT IS HOW A LIFT DISAPPEARED IN SILENCE.
          //
          // A command with no case here is USUALLY fine: most verbs are single-store
          // mutations whose own handler patch is all anyone needs. The dangerous shape
          // is narrower and completely mechanical to detect — a MULTI-STORE patch
          // (`path.length === 2`, the `produceMultiStoreCommand` routing convention)
          // with no case to relay its members. That is a compound: one gesture that
          // wrote several stores, whose members every legacy mirror keys on COMMAND
          // TYPE and therefore cannot see under a compound's name.
          //
          // ⭐ THAT DESCRIBES `pool.create` TODAY, and the balcony case above already
          // said so in prose ("⚠ THAT IS NOT HYPOTHETICAL — IT IS THE SWIMMING POOL'S
          // LIVE STATE"). A comment is not a detector: the lift shipped afterwards with
          // the identical defect and the identical silence. So the observation is
          // MECHANISED here — the next compound to arrive without a case announces
          // itself the first time a person uses it, instead of being discovered from a
          // founder's screenshot of an element count that did not move.
          //
          // Once per command TYPE, never per dispatch: this fires on real user gestures
          // and a per-dispatch warning would be noise nobody reads, which is the same
          // failure as silence.
          if (!_warnedUnmirroredCompounds.has(record.type)) {
            const stores = new Set<string>();
            for (const patch of record.forward ?? []) {
              if (patch.op === 'add' && patch.path.length === 2) stores.add(String(patch.path[0]));
            }
            if (stores.size > 1) {
              _warnedUnmirroredCompounds.add(record.type);
              console.warn(
                `[CommandEventBridge] §FIX-COMPOUND-SILENT-DROP (L-7825): '${record.type}' ` +
                `committed a COMPOUND across ${stores.size} stores ` +
                `(${[...stores].sort().join(', ')}) and this bridge has NO case for it. ` +
                `Its members were written to their plugin stores and relayed to NOTHING: ` +
                `every legacy mirror keys on the COMMAND TYPE, so none of them fires for a ` +
                `command by this name. Expect the elements to be absent from the 3-D scene ` +
                `and from the ProjectSerializer element count, with no other symptom. ` +
                `Add a case that emits ONE member event PER MEMBER stamped with the ` +
                `MEMBER's own verb — 'balcony.create' in this file is the worked example.`);
            }
          }
          break;
      }
    } catch (err) {
      console.error('[CommandEventBridge] Failed to emit family event for type=' +
        record.type + ':', err);
    }
  });
}
