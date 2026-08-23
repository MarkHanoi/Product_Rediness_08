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
          // ⚠ AND THE MIRROR CENSUS IS STATED, NOT ASSUMED, because it is PARTIAL and
          // a partial fix reported as a whole one is the defect this lane exists to
          // avoid. Measured 2026-08-23 with BOTH ripgrep and `grep -rn` (they have
          // disagreed in this repo before), over apps/editor/src + runtime-composer/src:
          //     'wall.created'        -> 2 subscribers   ✅ LIVE
          //     'door.created'        -> 0 subscribers   ❌ typed event exists, nothing listens
          //     'curtainwall.created' -> 0 subscribers, AND NO SUCH EVENT IS DECLARED
          // So: a WALL-HOSTED lift has all four enclosure sides of kind 'wall' and
          // mirrors COMPLETELY. A STANDALONE-GLASS lift has one wall (the landing side)
          // and three curtain-wall sides, so three of its four sides have nowhere to go.
          // Those three are NOT mirrored as walls — a curtain wall drawn as a wall is a
          // lie about the element (C84 EI-9) — they are REPORTED, by name and count, at
          // the bottom of this case. The founder placed a standalone glass lift, so what
          // this commit buys him is the landing side plus a console line that names
          // exactly what is still missing, instead of silence.
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

          // (2) ⛔ THE MEMBERS WITH NOWHERE TO GO — NAMED, COUNTED, AND SAID OUT LOUD.
          //     This is the deliverable the founder's report actually asks for: a create
          //     that produces no visible element must SAY so. It is one line per lift,
          //     not per member, and it names the store, the count and the reason, so the
          //     next reader does not have to re-derive the census above.
          const _liftUnmirrored: string[] = [];
          const _liftGlass = _liftCommitted.get('curtainwall')?.size ?? 0;
          const _liftDoors = _liftCommitted.get('door')?.size ?? 0;
          const _liftParts = _liftCommitted.get('liftPart')?.size ?? 0;
          if (_liftGlass > 0) {
            _liftUnmirrored.push(
              `${_liftGlass} curtain-wall enclosure side(s) — no 'curtainwall.created' ` +
              `event is DECLARED at all, so there is nothing to emit and nothing to ` +
              `subscribe; mirroring them as walls instead would be C84 EI-9`);
          }
          if (_liftDoors > 0) {
            _liftUnmirrored.push(
              `${_liftDoors} landing door(s) — 'door.created' IS declared in ` +
              `RuntimeEvents but has ZERO subscribers, so emitting it would be a ` +
              `channel that reads as live and is dead at the far end`);
          }
          if (_liftParts > 0) {
            _liftUnmirrored.push(
              `${_liftParts} cabin part(s) — no legacy family and no fragment builder`);
          }
          if (_liftUnmirrored.length > 0) {
            console.warn(
              `[CommandEventBridge] §FIX-LIFT-LOST-BETWEEN-DISPATCH-AND-STORE (L-7820): ` +
              `lift ${p.liftId ?? '(unnamed)'} COMMITTED to its plugin stores and ` +
              `${_liftWallSides} of its enclosure side(s) reached the legacy mirror. ` +
              `THE FOLLOWING MEMBERS REACHED NO MIRROR AND WILL NOT RENDER: ` +
              _liftUnmirrored.join('; ') + '. ' +
              `This is a PARTIAL create, not a failed one and not a complete one — the ` +
              `lift record is real, undoable and schedulable, and part of it is invisible. ` +
              `Closing it means declaring 'curtainwall.created' + a mirror, and giving ` +
              `'door.created' a subscriber. See docs/02-decisions/contracts/C104-*.md §10.`);
          }
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
