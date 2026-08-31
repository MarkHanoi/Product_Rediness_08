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
  // §FIX-ROOF-UPDATE-MIRROR — the two verbs that change what a roof LOOKS LIKE.
  // Both were on `mirror-debt.json`; `roof.setPitch`'s row named a NAME-BLIND grep
  // as its reason (see `legacyRoofSlopeFromPitch`), and `roof.setShape`'s was never
  // investigated at all ("SEEDED BACKLOG"). Neither needed new machinery: the two
  // translations already existed on the CREATE path and are now exported from
  // `roofCreatedMirror.ts` and shared, so create and update cannot drift.
  'roof.setShape': {
    kind: 'roof', idField: 'roofId', fields: ['shape', 'pitch'],
    note: 'TWO fields because `SetRoofShapeHandler.execute` writes two: `r.shape = cmd.shape` '
        + 'AND `if (cmd.shape === "flat") r.pitch = 0`. Declaring only `shape` would leave a '
        + 'gable→flat roof rendering FLAT with its old slope still in the legacy record — the '
        + 'half-write this table exists to stop. The intersection against `record.forward` means '
        + 'a non-flat shape change still announces `shape` alone.',
  },
  'roof.setPitch': {
    kind: 'roof', idField: 'roofId', fields: ['pitch'],
    note: 'Legacy `RoofData.slope` (RoofTypes.ts:96), via `legacyRoofSlopeFromPitch` — RADIANS '
        + 'to RISE/RUN. ⚠ This row was ABSENT on the strength of `grep -n "pitch" RoofTypes.ts '
        + '→ 0 hits`, quoted in three files. The grep is right; the inference is not. The legacy '
        + 'record holds the concept under a different NAME and different UNITS, and the '
        + 'conversion was already shipped on the create path (L-699). Searching for the name you '
        + 'would give a thing cannot find the thing somebody else named.',
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

/**
 * §FIX-CEB-READ-THE-COMMIT (wave 4f/4g) — the ONE indexer every create case reads
 * its committed records through.
 *
 * ⭐ WHY THIS GENERALISED. `indexCommittedBeams` proved the move for beams
 * (§FIX-BEAM-CEB-STEEL, L-974): read what the handler COMMITTED, not what the
 * caller REQUESTED, so the handler's own normalisation — alias folding, defaults,
 * and above all **the id it mints when the payload omits one** — reaches the
 * bridge instead of being re-derived here. Three more cases needed exactly that
 * and each was guarding on a payload field the handler is allowed to supply:
 *
 *   · `column.batch.create` — `CreateColumnBatch.ts:100` does
 *     `const id = (c.id ?? createId('column'))`, and this file skipped every
 *     id-less member with a bare `continue`. N columns committed, ZERO
 *     `column.created` events, no console line (B2-COL-01).
 *   · `beam.batch.create`   — same shape, `CreateBeamBatch.ts:92` (B2-BEAM-03).
 *   · `slab.create`         — `CreateSlab.ts` mints the id AND resolves
 *     `polygon`/`boundary` into one `boundary`; this case read neither
 *     (B1-SLAB-01 / B1-SLAB-03).
 *
 * ⛔ `op === 'add'` and `path.length === 1` ONLY, deliberately unchanged from the
 * beam original: that is the shape of `draft[record.id] = record` in a
 * single-store `produceCommand`, and nothing else. A handler that mutates some
 * other way yields an EMPTY map and every caller falls back to the payload —
 * degraded, never wrong.
 */
function indexCommittedById<T>(
  forward: readonly { readonly op: string; readonly path: readonly (string | number)[]; readonly value?: unknown }[],
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const patch of forward) {
    if (patch.op !== 'add' || patch.path.length !== 1) continue;
    const value = patch.value as T | undefined;
    if (!value || typeof value !== 'object') continue;
    const id = String(patch.path[0]);
    if (id.length > 0) byId.set(id, value);
  }
  return byId;
}

/** Index the beams this command actually COMMITTED, keyed by id. Empty when the
 *  handler mutated through a different patch shape — callers fall back to the
 *  payload, exactly as the wall path does. */
function indexCommittedBeams(
  forward: readonly { readonly op: string; readonly path: readonly (string | number)[]; readonly value?: unknown }[],
): Map<string, CommittedBeam> {
  return indexCommittedById<CommittedBeam>(forward);
}

/**
 * §FIX-ROOF-CEB-MATERIAL (B2-ROOF-01) — the committed roof, for the two fields
 * the emit below used to drop. `RoofData.materialId` / `.materialColor` exist on
 * BOTH sides (`packages/geometry-roof/src/RoofTypes.ts:107-108` and the L0 `Roof`
 * schema), and `roofCopyPayload` has been sending both since L-978; only this hop
 * did not list them, so a copied roof reached the legacy store — the store the
 * fragment builder, the plan projector, the IFC exporter and persistence all read
 * — with the default finish. Same mechanism as §FIX-BEAM-CEB-STEEL, one family later.
 */
interface CommittedRoof {
  id?: string;
  levelId?: string;
  materialId?: string;
  materialColor?: string;
}

/** §FIX-CEB-READ-THE-COMMIT — the committed column, for the id the batch handler mints. */
interface CommittedColumn {
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
}

/** §FIX-CEB-READ-THE-COMMIT — the committed slab. `boundary` is the ONE spelling
 *  `CreateSlabHandler` commits, whichever of `boundary` / `polygon` the caller sent. */
interface CommittedSlab {
  id?: string;
  levelId?: string;
  boundary?: ReadonlyArray<{ x: number; y: number; z: number }>;
  thickness?: number;
  baseOffset?: number;
  materialId?: string;
  systemTypeId?: string;
  /** §REFUSE-SLAB-HOLES-AND-COLOUR — read ONLY to announce the refusal below.
   *  Neither field is emitted; see `announceSlabFieldsWithNoDestination`. */
  holes?: ReadonlyArray<unknown>;
  /** §REFUSE-SLAB-HOLES-AND-COLOUR — as above. Not emitted. */
  materialColor?: string;
}

/**
 * §REFUSE-SLAB-HOLES-AND-COLOUR (C74 / CA-18 · C84 EI-9 · C100 §2.1)
 *
 * ─── THE DEFECT, AND WHY THIS IS A REFUSAL RATHER THAN A CARRY ──────────────
 * The 2026-08-31 builders audit measured slab as *"THE ROOF DEFECT, UNFIXED, IN
 * SLAB"*: `holes` and `materialColor` are on the L0 `Slab` schema, ACCEPTED by
 * `CreateSlab.ts:112/116`, VALIDATED ring-by-ring at `:141-143`, COMMITTED at
 * `:176-178` — and then dropped twice before the mesh, while
 * `SlabFragmentBuilder` reads `data.holes` (`:551`, `:939`) and
 * `data.materialColor` (`:520`, `:579`, `:804`) and is fully capable of drawing
 * both. Its verdict: *"a slab with an authored void and an authored colour
 * renders as a SOLID slab in the DEFAULT colour, and it counts as
 * renders_3d = YES."*
 *
 * ⛔ ADDING THE TWO KEYS TO `slab.created` HERE WOULD NOT FIX IT, AND WOULD
 *    REPORT THAT IT HAD. The second drop is the one that decides: the §FT1
 *    mirror's `slabStore.add({...})` (`initTools.ts:2377-2392`) copies
 *    id/levelId/polygon/position/width/depth/thickness/baseOffset and a
 *    conditional `materialId`, and reads NEITHER field —
 *      grep -n 'ev\.holes\|ev\.materialColor' apps/editor/src/engine/initTools.ts
 *    returns the FLOOR and CEILING sites only, never a slab one. An emitted key
 *    nothing reads is the authored-but-unwired shape this audit exists to find.
 *    So the pair — `SlabCreatedEvent.holes` / `.materialColor` plus the §FT1
 *    read — must land together, in one change, in a lane that owns both files.
 *
 * ⭐ WHAT THIS DOES INSTEAD is the disposition `curtainWallCreatedMirror.ts:147`
 * set and the audit called "THE HONESTY BAR": the loss is ANNOUNCED at runtime,
 * per command, naming the field, the value, the reason and the visible
 * consequence — so a founder who draws a slab with a void learns why it is solid
 * from the console instead of from a screenshot. It fires ONLY when a value is
 * really present, so a plain slab is silent; and it never suppresses the emit,
 * because a slab that draws solid is still better than a slab that does not draw.
 */
function announceSlabFieldsWithNoDestination(
  commandType: string,
  records: ReadonlyArray<{ readonly id: string; readonly rec: CommittedSlab | undefined }>,
): void {
  const withHoles: string[] = [];
  const withColour: string[] = [];
  for (const { id, rec } of records) {
    if (!rec) continue;
    if (Array.isArray(rec.holes) && rec.holes.length > 0) withHoles.push(`${id} (${rec.holes.length})`);
    if (typeof rec.materialColor === 'string' && rec.materialColor.length > 0) {
      withColour.push(`${id} (${rec.materialColor})`);
    }
  }
  if (withHoles.length === 0 && withColour.length === 0) return;
  const parts: string[] = [];
  if (withHoles.length > 0) {
    parts.push(
      `\`holes\` on ${withHoles.length} slab(s) — ${withHoles.slice(0, 5).join(', ')}` +
      `${withHoles.length > 5 ? ', …' : ''}. Each authored void will NOT be punched: the slab renders SOLID.`,
    );
  }
  if (withColour.length > 0) {
    parts.push(
      `\`materialColor\` on ${withColour.length} slab(s) — ${withColour.slice(0, 5).join(', ')}` +
      `${withColour.length > 5 ? ', …' : ''}. Each renders in SlabFragmentBuilder's default colour.`,
    );
  }
  console.warn(
    `[CommandEventBridge] §REFUSE-SLAB-HOLES-AND-COLOUR: ${commandType} committed ` +
    parts.join(' ') +
    ` REASON: \`slab.created\` declares no slot for either field and the §FT1 mirror ` +
    `(initTools.ts:2377-2392 \`slabStore.add\`) reads neither, so emitting them would ` +
    `mint keys nothing consumes. SlabFragmentBuilder CAN draw both (holes :551/:939, ` +
    `materialColor :520/:579/:804) — the missing hop is the mirror, not the builder.`,
  );
}

/**
 * §FIX-SLAB-CEB-BOUNDARY (B1-SLAB-01) — the legacy plan polygon a committed slab
 * boundary describes: `{x, y}` with **y carrying world Z**, which is what
 * `SlabStore` / `SlabFragmentBuilder` / the §FT1 bridge in `initTools.ts` read.
 *
 * ⭐ THE SECOND COORDINATE IS TAKEN FROM `z`, NOT FROM `y`, AND THAT IS CORRECT
 * UNDER BOTH LIVE CONVENTIONS — which is the whole reason one rule suffices:
 *
 *   · The §FIX-SLAB-ZERO-AREA convention (`SlabPlanToolHandler.ts:438`,
 *     `copyPayloads.ts` `shift()`) sends world Z in **both** `y` and `z`, so
 *     `y` and `z` are equal and either reads the same.
 *   · A true world Vec3 (`{x, y: elevation, z: worldZ}`) has the depth in `z`,
 *     and reading `y` would put the polygon at the level elevation — a
 *     degenerate sliver at datum 0 and a hole somewhere else on every other
 *     level, exactly the failure `vec3RingsToPlanRings` documents for holes.
 *
 * And no committed boundary can have a meaningless `z`: `validateSlabBoundary`
 * measures `signedAreaXZ`, so a boundary whose `z` were all zero would have been
 * REFUSED before it ever committed.
 *
 * ⚠ WHAT THIS DOES NOT DO: unify the convention. `slab.create {polygon:[{x,y}]}`
 * still refuses with "boundary has zero area", because the handler's own
 * validation is x-z. C11 §7.4 tracks that as SLAB-BOUNDARY-CONVENTION; this
 * function makes the BRIDGE convention-agnostic, it does not make the HANDLER so.
 */
function planPolygonFromCommittedBoundary(
  boundary: ReadonlyArray<{ x: number; y: number; z: number }> | undefined,
): Array<{ x: number; y: number }> | undefined {
  if (!boundary || boundary.length < 3) return undefined;
  return boundary.map((p) => ({ x: p.x, y: p.z }));
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
          // §FIX-SLAB-CEB-BOUNDARY (B1-SLAB-01 / B1-SLAB-03) — READ THE COMMIT.
          //
          // ⛔ THE DEFECT THIS CLOSES IS A ONE-WORD ASYMMETRY WITH THE BATCH CASE
          // TWENTY LINES BELOW. This case read `p.polygon` and NEVER `p.boundary`;
          // the batch case reads `s.polygon ?? s.boundary`. `CreateSlabPayload`
          // accepts BOTH (`CreateSlab.ts` — `boundary` is the L0 field, `polygon`
          // the plan-tool alias), and `PreviewManager.ts:330` dispatches the
          // `boundary` spelling. So an accepted preview slab committed, reported
          // success, emitted `slab.created` with `polygon: undefined`, and the
          // §FT1 bridge's `!ev.polygon` guard returned — no legacy record, no
          // mesh, no plan symbol, no persistence. Dispatchable, invisible.
          //
          // Reading the COMMITTED record fixes both halves at once and is the move
          // `beam.create` already makes (ADR-002 §5): the handler folds `polygon`
          // and `boundary` into ONE `boundary` and mints the id when the payload
          // omits one, so relaying the commit means this bridge never has to own a
          // second copy of either rule. The payload stays as the fallback for the
          // legacy-mirror-only fields (`ifcGuid`, `position`, `width`, `depth`)
          // that `SlabData` carries and the L0 schema does not.
          const p = record.payload as {
            id?: string;
            levelId?: string;
            ifcGuid?: string;
            polygon?: Array<{ x: number; y: number }>;
            boundary?: Array<{ x: number; y: number; z: number }>;
            position?: { x: number; y: number; z: number };
            width?: number;
            depth?: number;
            thickness?: number;
            baseOffset?: number;
            materialId?: string;
            systemTypeId?: string;
          };
          const _slabCommits  = indexCommittedById<CommittedSlab>(record.forward ?? []);
          // The payload id when there is one; otherwise the SINGLE id the command
          // committed. `size === 1` and not `[0]`: a create that somehow committed
          // two records must not have one of them silently chosen for it.
          const _slabId = p.id ?? (_slabCommits.size === 1
            ? [..._slabCommits.keys()][0]
            : undefined);
          const _slabCommitted = _slabId !== undefined ? _slabCommits.get(_slabId) : undefined;
          const _slabPolygon =
            p.polygon
            ?? planPolygonFromCommittedBoundary(_slabCommitted?.boundary)
            ?? planPolygonFromCommittedBoundary(p.boundary);
          if (_slabId === undefined || _slabPolygon === undefined) {
            // REFUSE BY NAME — the §FIX-BEAM-CEB-BASELINE disposition, applied to
            // the family that needed it most. Emitting a `slab.created` the §FT1
            // guard will drop IS the silent failure: the command reports success,
            // the plugin store holds a slab, and nothing anywhere says the user's
            // floor plate did not arrive.
            console.error(
              `[CommandEventBridge] §FIX-SLAB-CEB-BOUNDARY: REFUSED slab ${_slabId ?? '<no id>'} — ` +
              `its slab.create neither carried nor committed a usable outline ` +
              `(payload \`polygon\`: ${p.polygon ? p.polygon.length + ' pts' : 'absent'}, ` +
              `payload \`boundary\`: ${p.boundary ? p.boundary.length + ' pts' : 'absent'}, ` +
              `committed \`boundary\`: ${_slabCommitted?.boundary ? _slabCommitted.boundary.length + ' pts' : 'absent'}), ` +
              `so no slab.created was emitted and no mesh, plan symbol or snapshot row will exist for it. ` +
              `The command itself may still have committed to the plugin store.`,
            );
            break;
          }
          events.emit('slab.created', {
            commandId:    record.id,
            commandType:  'slab.create',
            levelId:      _slabCommitted?.levelId ?? p.levelId ?? '',
            elementCount: 1,
            id:           _slabId,
            ifcGuid:      p.ifcGuid,
            polygon:      _slabPolygon,
            position:     p.position,
            width:        p.width,
            depth:        p.depth,
            thickness:    _slabCommitted?.thickness ?? p.thickness,
            baseOffset:   _slabCommitted?.baseOffset ?? p.baseOffset,
            // §CW90-style type parity: the handler folds `systemTypeId` into the
            // record it commits, so the commit is the one place both spellings agree.
            materialId:   _slabCommitted?.materialId ?? p.materialId ?? p.systemTypeId,
          });
          // §REFUSE-SLAB-HOLES-AND-COLOUR — after the emit, never instead of it.
          announceSlabFieldsWithNoDestination('slab.create', [
            { id: _slabId, rec: _slabCommitted },
          ]);
          break;
        }

        case 'slab.batch.create': {
          // TASK-01: emit one 'slab.created' per element — same pattern as wall.batch.create.
          // CreateSlabPayload uses `boundary` (plan polygon) which maps to `polygon` in the
          // initTools §FT1 subscriber and legacy SlabStore.  Also accepts `polygon` directly
          // for callers that use the older field name.
          // §FIX-SLAB-BATCH-CEB-SHAPE (P3-C1 · B1-SLAB-04) — THE SURVIVING HALF OF
          // THE ASYMMETRY §FIX-SLAB-CEB-BOUNDARY CLOSED FOR THE SINGLE CASE ABOVE.
          //
          // ⛔ TWO DEFECTS, BOTH MEASURED, BOTH THE SHAPE OF THE ONE ABOVE:
          //
          //  1. THE MINTED ID WAS DROPPED IN SILENCE. `CreateSlabBatch.ts:101` does
          //     `const id = (s.id ?? createId("slab"))` — the handler is ALLOWED to
          //     mint. This loop opened with `if (!s.id ...) continue;`, so an AI or
          //     generator batch that names no ids COMMITTED N slabs to the plugin
          //     store and emitted ZERO `slab.created`. No mesh, no plan symbol, no
          //     snapshot row, and no console line saying so. That is exactly
          //     B2-COL-01 / B2-BEAM-03 / B1-SLAB-01, in a fourth family.
          //
          //  2. THE WORLD Vec3 BOUNDARY WAS RELAYED AS A PLAN RING, KEEPING `y`.
          //     The cast here DECLARED `boundary` as {x, y}[]; it is
          //     `SlabData["boundary"]`, a world Vec3 (`CreateSlab.ts:101`), and the
          //     declaration was wrong in the one direction that hides the defect
          //     from tsc. `planPolygonFromCommittedBoundary` exists above to state
          //     the single rule that is correct under BOTH live conventions — the
          //     plan `y` is taken from `z`, never from `y`. Relaying the ring raw
          //     takes the LEVEL ELEVATION as the plan depth, so every vertex of a
          //     true Vec3 batch collapses onto one line: the zero-area sliver that
          //     function's own header documents. The §FIX-SLAB-ZERO-AREA convention
          //     (world Z in BOTH `y` and `z`) is why this stayed invisible — it
          //     hides the defect for the tools that use it and leaves it for every
          //     other producer.
          //
          // ⭐ NO SECOND SLAB PATH IS ADDED. Every part below is machinery the single
          // case already runs: `indexCommittedById<CommittedSlab>` (already computed
          // here for the holes/colour refusal, and then NOT read by the emit) and
          // `planPolygonFromCommittedBoundary`. The resolution ladder is the single
          // case's, in the same order, so the two cannot drift apart again.
          const p = record.payload as {
            slabs?: Array<{
              id?: string;
              levelId?: string;
              /** WORLD Vec3 — `SlabData["boundary"]`. NOT a plan ring. */
              boundary?: Array<{ x: number; y: number; z: number }>;
              /** The plan-tool alias: {x: worldX, y: worldZ} — already plan-shaped. */
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
          // §REFUSE-SLAB-HOLES-AND-COLOUR — the batch arm of the same refusal. Read
          // from the COMMIT rather than the request, because `CreateSlabBatch` is
          // where the ring validation and the id minting happen; a batch is also
          // where an AI or generator run puts fifty slabs through at once, which is
          // exactly the case a per-element warn would drown.
          const _batchSlabCommits = indexCommittedById<CommittedSlab>(record.forward ?? []);
          announceSlabFieldsWithNoDestination(
            'slab.batch.create',
            [..._batchSlabCommits.entries()].map(([id, rec]) => ({ id, rec })),
          );
          type _BatchSlabSpec = NonNullable<typeof p.slabs>[number];
          const _batchSlabSpecs: ReadonlyArray<_BatchSlabSpec> = p.slabs ?? [];
          const _batchSlabCommitRows = [..._batchSlabCommits.entries()];
          // POSITIONAL PAIRING IS USED ONLY WHERE IT IS EXACTLY DETERMINED. The
          // handler builds its records in payload order and `produceCommand` emits
          // one `add` per new key in assignment order, so entry i pairs with commit
          // i — but only while the two lists are the same length. Any other shape
          // falls back to id lookup alone: degraded, never wrong, which is the
          // doctrine `indexCommittedById` already states for an empty map.
          const _batchSlabPositional =
            _batchSlabSpecs.length > 0 && _batchSlabCommitRows.length === _batchSlabSpecs.length;
          const _batchSlabPairs: Array<{ spec: _BatchSlabSpec; rec: CommittedSlab | undefined; id: string | undefined }> =
            _batchSlabSpecs.length > 0
              ? _batchSlabSpecs.map((spec, i) => {
                  const byId = spec.id !== undefined ? _batchSlabCommits.get(spec.id) : undefined;
                  const row = _batchSlabPositional ? _batchSlabCommitRows[i] : undefined;
                  return { spec, rec: byId ?? row?.[1], id: spec.id ?? row?.[0] };
                })
              // A payload carrying no `slabs` list still commits records when the
              // dispatcher spelled the list differently; relay those rather than none.
              : _batchSlabCommitRows.map(([id, rec]) => ({ spec: {} as _BatchSlabSpec, rec, id }));

          const _batchSlabDropped: string[] = [];
          for (const { spec, rec, id } of _batchSlabPairs) {
            const _slabPolygon =
              spec.polygon
              ?? planPolygonFromCommittedBoundary(rec?.boundary)
              ?? planPolygonFromCommittedBoundary(spec.boundary);
            if (id === undefined || id.length === 0 || _slabPolygon === undefined) {
              _batchSlabDropped.push(id === undefined || id.length === 0 ? '<no id>' : id);
              continue;
            }
            events.emit('slab.created', {
              commandId:    record.id,
              commandType:  'slab.create',
              levelId:      rec?.levelId ?? spec.levelId ?? _batchSlabLevelId,
              elementCount: 1,
              id,
              ifcGuid:      spec.ifcGuid,
              polygon:      _slabPolygon,
              position:     { x: 0, y: 0, z: 0 },
              thickness:    rec?.thickness ?? spec.thickness,
              baseOffset:   rec?.baseOffset ?? spec.baseOffset,
              materialId:   rec?.materialId ?? spec.materialId ?? spec.systemTypeId,
            });
          }
          if (_batchSlabDropped.length > 0) {
            // REFUSE BY NAME, ONCE PER BATCH — the single case's disposition, sized
            // for fifty slabs. A bare `continue` is what made defect 1 invisible.
            console.error(
              '[CommandEventBridge] §FIX-SLAB-BATCH-CEB-SHAPE: REFUSED ' +
              _batchSlabDropped.length + ' of ' + _batchSlabPairs.length +
              ' slab(s) in a slab.batch.create — ' + _batchSlabDropped.slice(0, 5).join(', ') +
              (_batchSlabDropped.length > 5 ? ', …' : '') + '. Each neither carried nor ' +
              'committed a usable id AND outline, so no slab.created was emitted and no mesh, ' +
              'plan symbol or snapshot row will exist for it. The command itself may still ' +
              'have committed to the plugin store.',
            );
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
            mullionMaterialId?: string;
            mullionColor?: string;
            glazingMaterialId?: string;
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
            // §CW90-PLAN-TYPE-PARITY (C84 EI-11) — the armed TYPE, first-class.
            // The `materialId` fold above is kept for DTO parity, but it is
            // ambiguous by construction (three legacy slots, one id); these four
            // carry the resolved type in `CurtainWallData`'s own spelling so the
            // §P3.1-CW mirror can place them without guessing.
            systemTypeId:      p.systemTypeId,
            mullionMaterialId: p.mullionMaterialId,
            mullionColor:      p.mullionColor,
            glazingMaterialId: p.glazingMaterialId,
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
              mullionMaterialId?: string;
              mullionColor?: string;
              glazingMaterialId?: string;
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
              // §CW90-PLAN-TYPE-PARITY — same four fields as the single case.
              systemTypeId:      cw.systemTypeId,
              mullionMaterialId: cw.mullionMaterialId,
              mullionColor:      cw.mullionColor,
              glazingMaterialId: cw.glazingMaterialId,
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
          // §FIX-CEB-READ-THE-COMMIT (B2-COL-01) — EMIT FROM THE COMMIT, NOT FROM
          // THE REQUEST. This is the whole column defect and it was ONE guard:
          //
          //   `if (!c.id || !c.origin) continue;`
          //
          // `CreateColumnBatch.ts:100` mints `const id = (c.id ?? createId('column'))`
          // and `:113` defaults `origin: c.origin ?? {x:0,y:0,z:0}`, so BOTH halves of
          // that guard test a field the handler is explicitly allowed to supply. A
          // batch of N id-less columns committed N records to the plugin store and
          // emitted ZERO `column.created` events — with no console line, because
          // `continue` is silent. Single `column.create` was unaffected (its callers
          // pre-generate), which is exactly why the family read `renders_3d: YES`
          // while batch creation drew nothing.
          //
          // The committed `ColumnData` carries EVERY field this emit needs, already
          // defaulted and already schema-parsed, so relaying it removes the payload's
          // second copy of the default table as well. No ordering assumption is made:
          // the commit is keyed by the id the store actually holds.
          const _colCommits = indexCommittedById<CommittedColumn>(record.forward ?? []);
          if (_colCommits.size > 0) {
            for (const [_colId, c] of _colCommits) {
              events.emit('column.created', {
                commandId:    record.id,
                commandType:  'column.create',
                levelId:      c.levelId ?? _batchColLevelId,
                elementCount: 1,
                id:           _colId,
                origin:       c.origin,
                shape:        c.shape,
                width:        c.width,
                depth:        c.depth,
                height:       c.height,
                baseOffset:   c.baseOffset,
                rotation:     c.rotation,
                materialId:   c.materialId,
              });
            }
            break;
          }
          // FALLBACK — the handler mutated through some other patch shape, so the
          // index is empty. Degraded, never wrong: this is the pre-existing payload
          // relay, with the `!c.id` half of the guard kept (an id-less member cannot
          // be named without the commit) and a NAMED refusal where it used to be a
          // bare `continue`.
          console.warn(
            '[CommandEventBridge] §FIX-CEB-READ-THE-COMMIT: column.batch.create ' +
            'committed no indexable records (forward patches: ' +
            (record.forward?.length ?? 0) + '); falling back to the request payload.',
          );
          for (const c of (p.columns ?? [])) {
            if (!c.id) {
              console.error(
                '[CommandEventBridge] §FIX-CEB-READ-THE-COMMIT: SKIPPED an id-less member of ' +
                'column.batch.create — the commit could not be indexed and the payload names ' +
                'no id, so no column.created was emitted for it and no mesh will be built.',
              );
              continue;
            }
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
              // §FIX-BEAM-BATCH-CEB-STEEL — declared here because
              // `CreateBeamBatchPayload.beams` IS `readonly CreateBeamPayload[]`
              // (`CreateBeamBatch.ts:38`), and `CreateBeamPayload` has carried all
              // three since §FIX-BEAM-CEB-STEEL (`CreateBeam.ts:43-45`). They were
              // absent from THIS local view only, so a producer that sent them had
              // no way to reach the emit below.
              loadBearing?: boolean;
              fireRating?: string;
              steelProfileName?: string;
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
              // ── §FIX-BEAM-BATCH-CEB-STEEL (C84 EI-2a · C100) ─────────────────
              // ⛔ THE SINGLE EMIT AND THE BATCH EMIT DISAGREED, AND THE BATCH ONE
              // WAS WRONG. `beam.create` (~L1165 above) has relayed `loadBearing`,
              // `fireRating` and `steelProfileName` since §FIX-BEAM-CEB-STEEL
              // (L-974); this loop listed none of them. `BeamData.sectionType`
              // branches `'rectangular' | 'UB' | 'UC'` on `steelProfileName`
              // (`beamCreatedMirror.ts:155`), so THE SAME steel beam drew as a
              // rolled UB when placed one at a time and as a plain concrete
              // rectangle when placed by an AI structural batch or
              // `CreateBeamsOnAllLevels`. Column is the counter-example the audit
              // named: all three of ITS emit sites carry one identical key set.
              //
              // ⭐ THE READER ALREADY EXISTED — this is a WIRING fix, not a new
              // carrier. `beamCreatedMirror.ts:177-181` reads all three off the
              // event (`loadBearing ?? BEAM_LOAD_BEARING_DEFAULT`, then the two
              // conditional spreads), and `types.ts:714+` has declared them on
              // `'beam.created'` all along. Only this hop was silent.
              //
              // ⚠ THE REQUEST, NOT THE COMMIT — the one place this case must NOT
              // copy `beam.create`. `CreateBeamBatchHandler.execute` builds its
              // seed from EIGHT fields (`CreateBeamBatch.ts:101-108`:
              // id/levelId/shape/width/depth/rotation/materialId/baseLine) and
              // omits these three, so the committed record's `loadBearing` is
              // `Beam.parse`'s own `.default(true)` (`Beam.ts:75`) — a SCHEMA
              // DEFAULT, not an authored value. Reading the commit first would
              // therefore convert an authored `loadBearing: false` into `true` and
              // report it as fidelity. The batch handler's own drop is a SECOND,
              // upstream half of this defect and is NOT fixed here (that file is
              // not this lane's); closing this hop is what puts the profile on the
              // MESH, because the mirror builds `BeamData` from the EVENT.
              //
              // Conditional spread, the §FIX-ROOF-CEB-MATERIAL / C100 §2.1 idiom:
              // an unstated value stays UNSTATED rather than being asserted as
              // `undefined`, so the mirror's own default owns the unstated case.
              ...(b.loadBearing      !== undefined ? { loadBearing:      b.loadBearing }      : {}),
              ...(b.fireRating       !== undefined ? { fireRating:       b.fireRating }       : {}),
              ...(b.steelProfileName !== undefined ? { steelProfileName: b.steelProfileName } : {}),
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
          //
          // ── §REFUSE-FURNITURE-L0-VOCABULARY ────────────────────────────────
          // ⛔ DO NOT ADD `catalogId` / `activeLod` / `representations` /
          // `materialSlots` / `scale` / `size` TO THIS EMIT. The 2026-08-31 audit
          // scored them dropped, and they are — but the mechanism is RIVAL
          // VOCABULARY, not a narrow subset, and widening this emit would fix
          // nothing while reporting that it had:
          //  · The L0 schema says {catalogId, origin, scale, size, activeLod,
          //    representations, materialSlots} (ADR-0027 §2, written by
          //    `CreateFurniture.ts:98-104`). The legacy `FurnitureData` and every
          //    shipped builder say {furnitureType, position, w/l/h, material,
          //    color, furnitureCategory, kitchenConfig, wardrobeCabinetConfig}.
          //    `FurnitureTypes.ts` and `FurnitureFragmentBuilder.ts` score ZERO
          //    mentions of all four L0 names.
          //  · The only geometry consumers of the L0 vocabulary are
          //    `packages/geometry-kernel/src/producers/furniture.ts` and
          //    `plugins/furniture/src/committer/furniture-committer.ts` — the
          //    committer half, which `_RIVAL-SYSTEM-committers-vs-fragment-builders.json`
          //    measured as NOT REACHABLE (its bootstrap needs a canvas;
          //    `src/main.ts:421` passes null).
          // So the destination for these six is the COMMITTER pipeline, and the fix
          // is to make that reachable — not to smuggle L0 nouns onto a legacy
          // channel whose subscriber returns early on `!ev.furnitureType`
          // (`initTools.ts:2970`). ⚠ THAT EARLY RETURN IS THE REAL DEFECT AND IT IS
          // SILENT: an ADR-0027-shaped furniture.create (catalogId, no
          // furnitureType) yields no store record, no mesh and no warning. It is in
          // `initTools.ts`, which this lane does not own; recorded here by name so
          // the next reader of THIS file is not sent to widen the wrong hop.
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

        // ═════════════════════════════════════════════════════════════════════
        // §REFUSE-NARROW-CHANNELS — the six cases below, and `lighting.create`,
        // measured 2026-08-31 (audit/full-stack/2026-08-31/builders). READ THIS
        // BEFORE WIDENING ANY OF THEM.
        // ═════════════════════════════════════════════════════════════════════
        // The audit scored `lighting` as the widest fidelity gap in the repo (3 of
        // 18 authored fields survive) and `room` / `grid` / `plumbing` /
        // `structural` / `annotation` / `dimension` as DEAD CHANNELS — three
        // envelope keys each, and nothing subscribes. The tempting fix is to widen
        // all seven emits. It would be wrong, and the audit's own closing sentence
        // says why: *"'wire the committers' and 'widen the CEB emit' are RIVAL
        // remedies for the same symptoms, and applying both would mint a third
        // geometry path."*
        //
        // REFUSED BY NAME, with the measured reason per family:
        //
        //  · `lighting` — the loss PREDATES this hop. `CreateLightingCommand.ts:124-132`
        //    writes six fields (fixtureType, position, rotation, hostId, tags,
        //    properties); thirteen of the eighteen L0 fields have no slot in the
        //    COMMAND, so there is nothing at this bridge to relay. Of the two that
        //    do reach here, `rotation` has no destination either: the §FT-LIGHTING
        //    mirror builds `LightingData` from FIVE fields (`initTools.ts:2818-2824`
        //    — id, type, levelId, fixtureType, position) and has no rotation slot.
        //    And the SUBSTITUTION downstream is deliberate and declared:
        //    `LightingFragmentBuilder.ts:334` — *"Lens tint, DERIVED from the row's
        //    kelvin — never authored"* — so widening this emit would put authored
        //    photometry on a bus whose consumer has committed, in writing, to the
        //    catalogue instead. The honest gap is that the L0 schema authors
        //    kelvin / lumens / beamAngleDeg / dropLength / isEmergency as if they
        //    were settable while the LOD-200 builder declares they are not. That is
        //    a SCHEMA-vs-RENDERER contract to settle (C84), not a payload to widen.
        //
        //  · `room`, `grid`, `plumbing`, `structural`, `annotation`, `dimension` —
        //    NOTHING SUBSCRIBES. Re-measured at this head:
        //      grep -rn "'plumbing.created'" --include=*.ts apps packages plugins \
        //        | grep -v node_modules | grep -v __tests__
        //    returns the emitter, its `types.ts` declaration, and three COMMENTS in
        //    `copyPayloads.ts:1415`, `duplicateToLevel.ts:365` and
        //    `CopyPlanToolHandler.ts:652` that already recorded exactly this. Every
        //    one of the six draws — where it draws at all — through its LEGACY leg:
        //    a command writes the plugin/legacy store, the store fires its own DOM
        //    event, and `initBuilders`' listener meshes it. Widening a payload no
        //    listener reads cannot change a pixel; it can only make the census say
        //    the channel is rich. `room.created` is the sharpest case — it has TWO
        //    emitters with DIFFERENT shapes (this file, and
        //    `packages/stores/src/aggregate-commands/roomCreate.ts:111`), a latent
        //    collision that only stays latent because nobody listens.
        //
        //  ⭐ THE THIRD OPTION, ALREADY PROVEN IN THIS FILE. `boundaryLine.created`
        //    emits FIVE keys — the narrowest event of any family — and loses
        //    NOTHING, because its mirror reads the RECORD (`initTools.ts:1839
        //    _boundaryLineRecord`) and uses the event only to name which id changed,
        //    refusing BY NAME when neither the commit nor the store can answer. A
        //    narrow event plus a store read cannot go stale and cannot arrive half
        //    populated. Whoever closes these six should copy THAT, not this file's
        //    named-subset idiom.
        //
        //  · `provenance` / `confidence` — dropped on EVERY channel here, by design.
        //    They are C79 authorship metadata, not geometry; no mirror, builder or
        //    plan symbol reads either (`grep -n 'ev\.provenance\|ev\.confidence'`
        //    over apps/editor/src/engine -> RC=1, 0 hits). Counted as "dropped" by
        //    the audit's field-set difference, but there is no consumer to starve.
        //    Named here so the zero is a measured zero rather than an oversight.

        case 'lighting.create': {
          // §FT-LIGHTING (LIGHTING-BUS-MIGRATION, C11 §11.11): forward the geometry
          // so the initTools §FT-LIGHTING bridge can mirror the fixture into the
          // legacy LightingStore → LightingFragmentBuilder 3D mesh.
          // ⛔ DO NOT WIDEN — see §REFUSE-NARROW-CHANNELS directly above.
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
            /** §FIX-ROOF-CEB-MATERIAL — present on the payload since L-978
             *  (roofCopyPayload), read by nothing on this hop until now. */
            materialId?: string;
            materialColor?: string;
            systemTypeId?: string;
          };
          // §FIX-ROOF-CEB-MATERIAL (B2-ROOF-01) — READ THE COMMIT, for the id and
          // for the two finish fields this emit dropped.
          //
          // ⛔ THE ID HALF IS THE LATENT DROP THE ROOF FAMILY SHARES WITH SLAB,
          // CEILING AND CURTAIN-WALL. CreateRoof.ts:56 does
          // `const id = (cmd.id ?? createId('roof'))`, so a dispatcher that omits
          // the id gets a COMMITTED roof; this case then relayed `id: p.id` ===
          // undefined and the §P3.2-RF subscriber's `!ev.id` guard returned.
          // Committed, invisible, silent. Every reachable dispatcher pre-generates
          // TODAY (RoofPlanToolHandler:258, CopyPlanToolHandler:529,
          // duplicateToLevel), which is why this is latent rather than an outage —
          // and exactly why it belongs at the bridge rather than in a note asking
          // every future dispatcher to remember. Wall is the only family already
          // immune, for precisely this reason: it reads the committed patch id.
          //
          // ⛔ THE MATERIAL HALF IS ALREADY FIRING, AND IT IS A FIDELITY DEFECT,
          // NOT A REACHABILITY ONE. materialId / materialColor exist on BOTH sides
          // — L0 `Roof` (Roof.ts:77-78) and legacy `RoofData` (RoofTypes.ts:107-108)
          // — and `roofCopyPayload` has sent both since L-978. Only this hop failed
          // to list them, so a copied or AI-authored roof reached the legacy store
          // (the store RoofFragmentBuilder, the 2-D plan projector, the IFC exporter
          // and ProjectSerializer all read) wearing the DEFAULT finish, while every
          // seven-fact milestone for the family still read YES. A chain that asks
          // only "did something draw?" cannot see this class of defect at all;
          // "something drew" is not the claim "the user's roof drew".
          const _roofCommits = indexCommittedById<CommittedRoof>(record.forward ?? []);
          const _roofId = p.id ?? (_roofCommits.size === 1
            ? [..._roofCommits.keys()][0]
            : undefined);
          const _roofCommitted = _roofId !== undefined ? _roofCommits.get(_roofId) : undefined;
          if (_roofId === undefined) {
            // REFUSE BY NAME — the §FIX-BEAM-CEB-BASELINE / §FIX-SLAB-CEB-BOUNDARY
            // disposition. Emitting an id-less roof.created IS the silent drop:
            // the subscriber's guard swallows it and nothing says a roof went missing.
            console.error(
              '[CommandEventBridge] §FIX-ROOF-CEB-MATERIAL: REFUSED a roof.create — its ' +
              'payload carried no id and the command committed ' + _roofCommits.size +
              ' record(s), so no single committed roof could be named. No roof.created was ' +
              'emitted and no mesh, plan symbol or snapshot row will exist for it. The ' +
              'command itself may still have committed to the plugin store.',
            );
            break;
          }
          events.emit('roof.created', {
            commandId:   record.id,
            commandType: 'roof.create',
            levelId:     _roofCommitted?.levelId ?? p.levelId ?? '',
            id:          _roofId,
            boundary:    p.boundary,
            shape:       p.shape,
            overhang:    p.overhang,
            thickness:   p.thickness,
            pitch:       p.pitch,
            // §FIX-ROOF-CEB-MATERIAL — the COMMIT first, because CreateRoofHandler is
            // where systemTypeId is resolved and where the L0 schema's own defaults
            // land. `p.systemTypeId` is the last resort, the same ladder beam.create
            // and slab.create already use in the two cases above.
            materialId:    _roofCommitted?.materialId ?? p.materialId ?? p.systemTypeId,
            materialColor: _roofCommitted?.materialColor ?? p.materialColor,
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
              // ── REFUSED BY NAME: the six keys `floor.create` carries and this
              //    fan-out does not — `label`, `systemTypeId`, `layers`,
              //    `finishSpec`, `serviceHoles`, `hostRoomId` ─────────────────────
              // The 2026-08-31 builders audit calls this "the worst-fidelity member
              // in the repo" and attributes the loss to this narrowed emit. Measured
              // at the source, the attribution is wrong: `BalconyAssembly.ts:232-247`
              // builds the finish `Floor` from boundary / baseOffset / thickness plus
              // conditional `materialId` and `materialColor`, and authors NONE of the
              // six. There is no value at this bridge to carry.
              //
              // ⛔ THE HALF THAT IS REAL, AND WHERE IT LIVES. The assembly DOES author
              // `materialColor` (`:245`) — and `'floor.created'` declares no
              // `materialColor` key, while the §P3.2-FL mirror substitutes a hardcoded
              // `finishColor: '#D4C4A8'` whenever `ev.finishSpec` is absent
              // (`initTools.ts:2491-2495`). So a balcony's authored finish colour is
              // lost, but it is lost between an event that has no slot for it and a
              // mirror that reads only the legacy blob — the SAME shape
              // §FIX-CEILING-BRIDGE-FINISH closed for ceilings by teaching the mirror
              // `ev.materialColor ?? DEFAULT`. Adding the key here alone would mint a
              // key nothing reads. Named rather than half-done: the pair is
              // `floor.created.materialColor` + the §P3.2-FL read, and they must land
              // together.
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
              // ── §FIX-LIFT-CEB-GLAZING sibling: REFUSED BY NAME ───────────────
              // The 2026-08-31 builders audit records this fan-out as emitting 9
              // keys against `wall.create`'s 14, losing `systemTypeId`,
              // `materialColor`, `layers` and `curve` — "a LAYERED wall created as
              // part of a lift shaft loses its layer stack at the bridge".
              //
              // ⭐ MEASURED, AND THE AUDIT'S MECHANISM IS WRONG FOR THIS SITE. The
              // loss is not at this relay. `LiftAssembly.ts:449-469` constructs the
              // enclosure-side wall record from `base` (id, parentId, childrenIds,
              // levelId, baseLine, height, baseOffset) plus `type`, `thickness`,
              // `openings` and a conditional `materialId`. It authors NO
              // `systemTypeId`, NO `materialColor`, NO `layers` and NO `curve` —
              //   grep -nE 'systemTypeId|layers|curve|materialColor' \
              //        packages/geometry-lift/src/LiftAssembly.ts  ->  RC=1, 0 hits.
              // A shaft side is a straight, unlayered, untyped wall by construction,
              // so relaying those four would add keys that are `undefined` on every
              // lift and report a fidelity gain that does not exist. If shaft walls
              // are ever to carry a wall TYPE, the field must first be authored in
              // `LiftAssembly` — and this relay then needs the four lines, not
              // before.
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
          // ── §FIX-LIFT-CEB-GLAZING (C84 EI-2a · C100 §2.1) ──────────────────
          // ⛔ A GLASS LIFT LOST ITS GLASS MATERIAL, AND THE MIRROR SAID SO EVERY
          // TIME. `LiftAssembly.ts:446-448` folds the AUTHORED `lift.glassMaterialId`
          // into the enclosure side's generic `materialId`; this fan-out then
          // relayed that generic id and nothing else. `curtainWallCreatedMirror.ts:147`
          // warns per element on exactly that shape — *"carries materialId … which
          // has no unambiguous slot in the legacy CurtainWallData (mullionMaterialId
          // | glazingMaterialId | systemTypeId). The wall is mirrored WITHOUT it"* —
          // so every standalone-glass lift glazed in the builder's default.
          //
          // ⭐ THE DESTINATION ALREADY EXISTS AND IS UNAMBIGUOUS. `glazingMaterialId`
          // is declared on `'curtain-wall.created'` (`types.ts`, §CW90-PLAN-TYPE-PARITY),
          // is read at `curtainWallCreatedMirror.ts:194` into
          // `CurtainWallData.glazingMaterialId`, and is documented there as "the
          // wall's default panel material, inherited by every synced cell" — which
          // is precisely what a lift's glass is. Wiring, not a new carrier.
          //
          // ⚠ THE AUTHORED FIELD, NOT THE ASSEMBLY'S FALLBACK. It is read from the
          // COMMITTED LIFT record's own `glassMaterialId` (`CreateLift.ts:449`
          // spreads it only when the caller stated one) rather than from the side's
          // folded `materialId`, because the latter is `lift.glassMaterialId ??
          // LIFT_GLASS_MATERIAL_ID` — relaying that would assert a library id the
          // user never chose. Unstated stays unstated (C100 §2.1).
          const _liftGlassMaterialId = (() => {
            const lifts = _liftCommitted.get('lift');
            const rec = p.liftId ? lifts?.get(p.liftId) : undefined;
            const v = rec?.['glassMaterialId'];
            return typeof v === 'string' && v.length > 0 ? v : undefined;
          })();
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
              // §FIX-LIFT-CEB-GLAZING — see the block above the loop.
              ...(_liftGlassMaterialId !== undefined
                ? { glazingMaterialId: _liftGlassMaterialId }
                : {}),
            });
            _liftGlassSides++;
          }

          // ── §FIX-LIFT-CEB-GLAZING, THE HALF THIS HOP CANNOT CLOSE ───────────
          // REFUSED BY NAME, both numbers stated, per C74/CA-18. The audit
          // (2026-08-31, `builders/lift.json`) records this fan-out as losing FOUR
          // material fields against the primary `curtain-wall.create` emit; ONE of
          // them is carried above and THREE ARE NOT, and the reason is not this
          // file:
          //
          //   · `systemTypeId`       — `LiftAssembly.ts:428-449` builds the
          //   · `mullionMaterialId`    enclosure-side record from `base` +
          //   · `mullionColor`         seven keys (type, mullionThickness,
          //                            panelThickness, bayWidth, bayHeight,
          //                            panels, materialId). None of the three is
          //                            among them, and the L0 `Lift` payload
          //                            (`CreateLift.ts:118-127`) authors no
          //                            curtain-wall system type at all.
          //
          // So there is NO VALUE AT THIS BRIDGE to carry: forwarding
          // `cw['systemTypeId']` would emit a key that is `undefined` on every
          // lift ever created and would report a fix that changed nothing. The
          // shortfall is at the ASSEMBLY (an authored shaft-glazing TYPE does not
          // exist yet), not at the relay. Stated here so the next reader measures
          // `LiftAssembly` rather than re-auditing this emit.

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
              // ── REFUSED BY NAME: `systemTypeId`, `layers`, `curve` ───────────
              // The 2026-08-31 builders audit records this fan-out as losing those
              // three against `wall.create`. Measured at the source rather than
              // assumed: `PoolAssembly.ts:140-170` builds the basin wall from
              // baseLine / height / thickness / baseOffset / openings plus the two
              // conditional material fields, and authors none of the three. The
              // pool's OWN `systemTypeId` IS authored — but the assembly spreads it
              // onto the FLOOR SLAB (`:195`) and the WATER (`:221`), never onto the
              // basin walls, so there is no value here to relay. Smuggling
              // `pool.systemTypeId` onto a wall would be the R-12 breach the water
              // refusal below already names: a wall arriving typed as something it
              // is not. The gap is one hop upstream, in the assembly.
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
          //     ⭐ §POOL95 — AND AS OF THIS LANE IT DOES RENDER, THROUGH ITS OWN
          //     CHANNEL. `water.created` is a typed event with a subscriber
          //     (`initTools.ts`) and a mesh builder (`geometry-slab/src/water/
          //     WaterBuilder.ts`). The paragraph below used to read "'water' has no
          //     typed event, no subscriber and no mesh builder anywhere in the tree"
          //     and printed on every pool anybody made; all three now exist, so the
          //     water is emitted here rather than counted as a casualty.
          //
          //     ⛔ STILL NOT `slab.created`. Everything the refusal above says is
          //     still true — this is a SECOND channel for a SECOND family, not the
          //     slab channel with a blue material on it.
          let _poolWaterMirrored = 0;
          for (const [waterId, water] of _poolCommitted.get('water') ?? []) {
            if (water['parentId'] !== p.poolId) continue;
            events.emit('water.created', {
              commandId:   record.id,
              commandType: 'pool.create',
              levelId:     (water['levelId'] as string | undefined) ?? _poolLevelId,
              waterId,
              poolId:      p.poolId,
              boundary:    water['boundary'] as ReadonlyArray<{ x: number; y: number; z: number }> | undefined,
              // Absolute world-Y, both of them, carried verbatim off the commit —
              // never re-derived from a depth and a freeboard here. The assembly is
              // the ONE place those become elevations (ADR-0124 §7).
              surfaceElevation: water['surfaceElevation'] as number | undefined,
              bottomElevation:  water['bottomElevation']  as number | undefined,
              color:            water['color']   as string | undefined,
              opacity:          water['opacity'] as number | undefined,
              // ── REFUSED BY NAME: `materialId`, `systemTypeId` ─────────────────
              // The 2026-08-31 builders audit records both as dropped here, and
              // rates it "the mildest instance — the appearance is correct, only
              // the material-library link is lost". Measured before acting:
              //  · `systemTypeId` IS on the committed record (`PoolAssembly.ts:221`
              //    spreads `pool.systemTypeId` onto the water) — so the value
              //    exists. `materialId` is NOT: the assembly never authors one.
              //  · NEITHER HAS A DESTINATION. The §FT-WATER subscriber calls
              //    `waterMeshBuilder.updateWater({...})` with eight fields
              //    (`initTools.ts:1946-1953`) and `WaterMeshBuilder`'s input type
              //    declares no material slot at all. Emitting `systemTypeId` would
              //    add a key the one and only subscriber cannot pass on.
              // The C100 §2.1 half-implementation is real — the resolved CACHE
              // (`color`, `opacity`) draws and the MASTER id does not — but closing
              // it needs a material slot on `WaterMeshBuilder`, not a wider event.
            });
            _poolWaterMirrored++;
          }

          const _poolWaterCount = _poolCommitted.get('water')?.size ?? 0;
          const _poolUnmirrored: string[] = [];
          if (_poolWaterCount > _poolWaterMirrored) {
            _poolUnmirrored.push(
              `${_poolWaterCount - _poolWaterMirrored} WATER record(s) whose parentId is ` +
              `not this pool — not emitted, because a water body belongs to the pool that ` +
              `holds it and mirroring a foreign one would render water in someone else's basin`);
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
