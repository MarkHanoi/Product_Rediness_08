// ApplyPredictedRoomGeometryCommand — SAFE MODE ROOM RESHAPE.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS CLOSES
// ═══════════════════════════════════════════════════════════════════════════════
// Until this command existed, PREVIEW and EXECUTION used DIFFERENT ALGORITHMS to
// answer the same question — "what shape will this room be after the wall moves?"
//
//   • PREVIEW ran `predictRoomGeometry` (@pryzm/room-topology): PURE, per-room,
//     over the room's OWN declared `boundingWallIds`, with typed per-room refusals
//     (`TOPOLOGY_CHANGE_POSSIBLE`, `OPEN_LOOP`, `CURVED_WALL_UNSUPPORTED`, …).
//     The founder's `Kitchen: 12.4 m² → 10.8 m²` card is that algorithm's output.
//   • EXECUTION ran nothing of the kind. The wall committed, `RoomTopologyObserver`
//     fired `ReDetectRoomsCommand` on a debounce, and `RoomDetectionEngine` —
//     a LEVEL-WIDE, MUTATING, re-partitioning flood trace with a 0.05 m weld
//     (vs the predictor's 1 mm `COINCIDENT_M`) — computed the committed polygon.
//
// Two algorithms, two answers, no comparison. The number the human approved was
// not the number that got written, and nothing in the system could tell.
//
// THIS COMMAND WRITES WHAT IT WAS GIVEN AND NEVER RECOMPUTES. Its payload IS the
// prediction the preview showed. There is no engine call here, no re-trace, no
// second opinion — by construction, not by discipline. That is the whole point:
// `check-room-reshape-fidelity` asserts the committed polygon is byte-identical to
// the predicted one, and it can only be true if this file never computes geometry.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT IT DELIBERATELY DOES **NOT** DO — stated so absence is never inferred
// ═══════════════════════════════════════════════════════════════════════════════
//  • It does NOT detect rooms. It cannot create a room, cannot delete one, and
//    cannot change a room's membership (`boundingWallIds`). A move that SPLITS or
//    MERGES rooms is a DETECTION question; the predictor refuses it as
//    `TOPOLOGY_CHANGE_POSSIBLE` and no such room ever reaches this payload.
//  • It does NOT touch semantics. `name`, `roomNumber`, `occupancyType`,
//    `finishes`, `ifcData`, `revitId`, `properties`, `boundingWallIds` and
//    `metadata.createdAt/createdBy` are read-through untouched — see
//    `GEOMETRY_FIELDS` and the explicit reconstruction in `_applyGeometry`.
//    Room IDENTITY survives a reshape; that is `check-room-identity-survives-wall-move`.
//  • It does NOT silently skip. A room in the plan that is NOT in the payload
//    (because its prediction was UNDETERMINED) is not "unchanged" — it is
//    reported in `untouchedUndetermined`, and the observer's fallback redetect is
//    NOT suppressed for its level. Converting UNDETERMINED into "nothing changed"
//    is the founder's named non-negotiable and the §CONTEXT-DATA-HONESTY family
//    defect (known + unknown = [] ).
//  • It does NOT stamp `authored` provenance. A consequence-reshaped room was
//    produced by a deterministic rule over inputs the system holds, so it is
//    `computed` — or `regenerated` when it overwrites a value that was already
//    there (C75 §1.1). `SystemWritableOrigin = Exclude<ValueOrigin,'authored'>`
//    makes stamping `authored` a COMPILE ERROR, so this is enforced, not promised.
//
// ═══════════════════════════════════════════════════════════════════════════════
// UNDO (C03 §4.5–4.8) — produceWithPatches (Immer), the G-NEW-05 mandated idiom
// ═══════════════════════════════════════════════════════════════════════════════
// The discipline is DetectAllRoomsCommand's — capture the pre-state of every room
// this command rewrites, mutate only what changed, and on undo restore the
// pre-state verbatim — but the CAPTURE is Immer `produceWithPatches` (via the
// package's `PatchSnapshot` landing zone), NOT a structuredClone snapshot, which
// `check-structuredclone-new-commands` prohibits for new commands. Each written
// room keeps its `inversePatches`; undo applies them to the room's CURRENT record,
// which reconstructs the pre-execute record BYTE-EQUAL — pinned by
// `__tests__/applyPredictedRoomGeometryUndoRoundtrip.test.ts`, which was watched
// green against the snapshot-clone implementation before this migration. The
// blast radius is unchanged (it only ever UPDATES; it never adds or removes).
//
// ⚠ `DetectAllRoomsCommand` IS NOT MODIFIED BY THIS PHASE and must not be.
// ⚠ `ReDetectRoomsCommand` is `nonUndoable` ("automatic background operation").
//   THIS command is UNDOABLE — that is the difference that lets a wall drag and
//   its room consequences share ONE undo unit. The gesture id is supplied by
//   `ConsequenceExecutionService` via `withGestureId`, so the wall mutation and
//   this room mutation are the SAME gesture and one Ctrl+Z reverts both
//   (`check-room-reshape-undo`).

import type { Patch } from 'immer';
import {
  Command, CommandType, CommandValidationResult, CommandResult,
  SerializedCommand, CommandContext,
} from '../types';
import { producePatchedSlice, applyPatchesToSlice } from '../PatchSnapshot';
import type { RoomData, RoomVertex } from '@pryzm/room-topology';
// NOTE: `semanticGraphManager` is deliberately NOT imported. This command cannot
// change `boundingWallIds`, so the `boundedBy` edges it would rebuild are still
// correct; clearing and re-adding them would be churn that can only lose
// information. See the side-index note in `execute`.
import { roomSpatialIndex } from '@pryzm/core-app-model';

// ─── Payload — the PREDICTION, verbatim ───────────────────────────────────────

/**
 * One room's predicted geometry, exactly as `predictRoomGeometry` produced it and
 * exactly as the preview rendered it. Structurally equal to `PredictedGeometry`
 * (`@pryzm/command-bus`), restated here rather than imported so this L2 command
 * package does not take an L1→L2 shape dependency it does not otherwise need; the
 * planner's own `PredictedGeometry` assigns to it without a cast.
 */
export interface PredictedRoomGeometry {
  readonly elementId: string;
  /** The predicted ring. WRITTEN VERBATIM to `boundary.polygon`. */
  readonly polygon: readonly RoomVertex[];
  readonly area: number;
  readonly perimeter: number;
  readonly centroid: RoomVertex;
  readonly boundingBox: {
    readonly minX: number; readonly minZ: number;
    readonly maxX: number; readonly maxZ: number;
  };
}

/**
 * A room the plan KNEW was affected but whose geometry could NOT be predicted.
 * Carried in the payload — not omitted — so the command can REPORT it. An
 * unpredicted room is never touched and never counted as unchanged.
 */
export interface UndeterminedRoomGeometry {
  readonly elementId: string;
  /** The predictor's typed refusal, e.g. `TOPOLOGY_CHANGE_POSSIBLE`. */
  readonly reason: string;
  readonly detail: string;
}

/** Per-room outcome of the apply, for the caller's report. */
export interface AppliedRoomOutcome {
  readonly roomId: string;
  readonly outcome:
    /** Geometry written verbatim. */
    | 'applied'
    /** The predicted ring was byte-identical to the stored one — nothing to write. */
    | 'already-identical'
    /** Named in the payload but absent from the room store — reported, never invented. */
    | 'room-not-found'
    /** The store rejected the update; the reason is carried. */
    | 'store-rejected';
  readonly detail?: string;
}

// ─── The command ──────────────────────────────────────────────────────────────

/**
 * The fields this command is permitted to write. Anything not on this list is
 * read through from the existing record UNCHANGED. Enumerated as data so the
 * intent is greppable and so a future field addition is a deliberate edit rather
 * than an accidental widening via object spread.
 */
const GEOMETRY_FIELDS = Object.freeze([
  'boundary.polygon',
  'computed.area',
  'computed.grossArea',
  'computed.perimeter',
  'computed.volume',
  'computed.centroid',
  'computed.boundingBox',
] as const);

export class ApplyPredictedRoomGeometryCommand implements Command {
  readonly affectedStores = ['room'] as const;
  id = crypto.randomUUID();
  type = CommandType.APPLY_PREDICTED_ROOM_GEOMETRY;
  timestamp = Date.now();
  targetIds: string[] = [];

  /** The fields this command may write — exposed so gates can assert the scope. */
  static readonly GEOMETRY_FIELDS = GEOMETRY_FIELDS;

  /**
   * Immer inverse patches for every room this command rewrote, in write order
   * (G-NEW-05). Undo applies each room's `inversePatches` to its CURRENT record,
   * reconstructing the pre-execute record byte-equal — the patch-based form of
   * the `DetectAllRoomsCommand.undoSteps.preserved` discipline. Patches cannot
   * alias the record about to be mutated: their values are captured from the
   * untouched base by `produceWithPatches`.
   */
  private _undoEntries: Array<{ id: string; inversePatches: readonly Patch[] }> = [];

  /** Per-room outcomes of the last execute — the caller's honest report. */
  private _outcomes: AppliedRoomOutcome[] = [];

  constructor(
    /** The PREDICTED geometry. Written verbatim; never recomputed. */
    private readonly predicted: readonly PredictedRoomGeometry[],
    /**
     * Rooms whose prediction was UNDETERMINED. NOT touched by this command, and
     * surfaced by {@link undeterminedRooms} so the caller can (a) report them and
     * (b) decline to suppress the observer's fallback redetect for their levels.
     */
    private readonly undetermined: readonly UndeterminedRoomGeometry[] = [],
  ) {}

  /** Rooms named as UNDETERMINED — reported, never silently skipped. */
  get undeterminedRooms(): readonly UndeterminedRoomGeometry[] { return this.undetermined; }

  /** Per-room outcomes of the last execute. */
  get outcomes(): readonly AppliedRoomOutcome[] { return this._outcomes; }

  canExecute(ctx: CommandContext): CommandValidationResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { ok: false, reason: 'RoomStore not available' };

    // A payload with no determined predictions is a VALID no-op — but only when the
    // command is honest about why. If every affected room came back UNDETERMINED,
    // executing writes nothing, and the WARNING is what stops that reading as
    // "the move changed no rooms".
    if (this.predicted.length === 0) {
      return this.undetermined.length > 0
        ? { ok: true, warnings: [
            `No room geometry to apply: all ${this.undetermined.length} affected room(s) came back UNDETERMINED ` +
            `(${this.undetermined.map((u) => `${u.elementId}:${u.reason}`).join(', ')}). ` +
            `Their geometry is UNCHANGED and UNVERIFIED — this is NOT a determination that the move did not affect them.`,
          ] }
        : { ok: true, warnings: ['No predicted room geometry supplied — this command will write nothing.'] };
    }

    // A ring below 3 vertices is not a polygon. Refuse the whole command rather
    // than write a degenerate boundary: the predictor's own `DEGENERATE_BOUNDARY` /
    // `COLLAPSED` refusals mean a valid prediction can never be this shape, so
    // seeing one means the payload did not come from the predictor.
    for (const p of this.predicted) {
      if (!Array.isArray(p.polygon) || p.polygon.length < 3) {
        return {
          ok: false,
          reason:
            `Predicted polygon for room ${p.elementId} has ${p.polygon?.length ?? 0} vertices; a ring requires ≥ 3. ` +
            `A prediction from predictRoomGeometry can never be this shape (it refuses with DEGENERATE_BOUNDARY), ` +
            `so this payload did not come from the predictor.`,
        };
      }
    }
    return { ok: true };
  }

  execute(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    this._undoEntries = [];
    this._outcomes = [];
    const written: string[] = [];

    for (const p of this.predicted) {
      const existing = roomStore.getById?.(p.elementId) as RoomData | null | undefined;
      if (!existing) {
        // Named but absent. REPORTED — never created. Creating a room here would be
        // detection, which this command is defined not to do.
        this._outcomes.push({
          roomId: p.elementId, outcome: 'room-not-found',
          detail: `room ${p.elementId} was named in the plan's predicted geometry but is not in the room store; it was NOT created`,
        });
        continue;
      }

      // G-NEW-05: one produceWithPatches pass yields BOTH the post-state record
      // and the inverse patches that are this room's undo capture.
      const { result: next, inversePatches } = producePatchedSlice<RoomData>(
        existing,
        (draft) => this._applyGeometryToDraft(draft, p),
      );

      // Byte-identical ⇒ nothing to write. Skipping the store write here is not a
      // silent skip: the outcome says `already-identical`, which is a POSITIVE
      // determination (the predictor and the store already agree), distinct from
      // "we did not look".
      if (this._geometryEqual(existing, next)) {
        this._outcomes.push({ roomId: p.elementId, outcome: 'already-identical' });
        continue;
      }

      // Capture BEFORE the write, exactly like the snapshot discipline it replaces.
      this._undoEntries.push({ id: p.elementId, inversePatches });

      try {
        roomStore.update(p.elementId, next);
      } catch (err) {
        // The entry we just pushed describes a write that did not happen. Drop it,
        // or undo would "restore" a room that was never changed.
        this._undoEntries.pop();
        const reason = err instanceof Error ? err.message : String(err);
        this._outcomes.push({ roomId: p.elementId, outcome: 'store-rejected', detail: reason });
        continue;
      }

      written.push(p.elementId);
      this._outcomes.push({ roomId: p.elementId, outcome: 'applied' });

      // Side indices — the room's AABB moved, so the spatial entry is stale.
      // §SWALLOW-SIDE-INDEX (see DetectAllRoomsCommand's header): these are derived
      // from the store, never authoritative over it, and the store write above has
      // already committed outside the try.
      //
      // NOTE what is deliberately NOT touched: `semanticGraphManager` boundedBy edges
      // are NOT rebuilt, because this command cannot change `boundingWallIds` — the
      // membership is identical by construction, so the edges are still correct.
      // Clearing and rebuilding them would be churn that could only lose information.
      try {
        roomSpatialIndex.remove(p.elementId);
        roomSpatialIndex.insert(p.elementId, {
          minX: p.boundingBox.minX, minZ: p.boundingBox.minZ,
          maxX: p.boundingBox.maxX, maxZ: p.boundingBox.maxZ,
        });
      } catch { /* §SWALLOW-SIDE-INDEX — see header */ }
    }

    this.targetIds = [...written];

    if (this.undetermined.length > 0) {
      console.debug(
        `[ApplyPredictedRoomGeometryCommand] ${written.length} room(s) reshaped from the PREDICTED geometry; ` +
        `${this.undetermined.length} room(s) UNDETERMINED and therefore NOT touched ` +
        `[${this.undetermined.map((u) => `${u.elementId}:${u.reason}`).join(', ')}] — their geometry is unverified, not unchanged.`,
      );
    }

    return { success: true, affectedElementIds: [...this.targetIds] };
  }

  /**
   * Restore the pre-execute records verbatim (C03 §4.5–4.8) by applying each
   * room's Immer inverse patches to its CURRENT record (G-NEW-05). The result is
   * byte-equal to the record `execute` read — the round-trip test pins this
   * against the snapshot-clone idiom it replaced.
   *
   * Because execute only ever UPDATES existing rooms, undo never has to add or
   * remove one — the room set is invariant across this command, which is why room
   * IDENTITY survives an undo as well as an execute.
   */
  undo(ctx: CommandContext): CommandResult {
    const roomStore = ctx.stores.roomStore;
    if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

    const restored: string[] = [];
    // Reverse order — mirrors the write order, and keeps the semantics identical
    // even if a future store makes updates order-sensitive.
    for (const entry of [...this._undoEntries].reverse()) {
      const current = roomStore.getById?.(entry.id) as RoomData | null | undefined;
      if (!current) {
        // The room vanished outside this undo unit — there is no post-state to
        // invert from. Say so rather than invent a record (this command never
        // creates rooms, in undo any more than in execute).
        console.warn(`[ApplyPredictedRoomGeometryCommand] undo: room ${entry.id} no longer exists — nothing restored`);
        continue;
      }
      let prev: RoomData;
      try {
        prev = applyPatchesToSlice<RoomData>(current, entry.inversePatches);
        roomStore.update(entry.id, prev);
        restored.push(entry.id);
      } catch (err) {
        console.warn(`[ApplyPredictedRoomGeometryCommand] undo failed to restore room ${entry.id}:`, err);
        continue;
      }
      try {
        const bb = prev.computed?.boundingBox;
        roomSpatialIndex.remove(entry.id);
        if (bb) roomSpatialIndex.insert(entry.id, bb);
      } catch { /* §SWALLOW-SIDE-INDEX — see header */ }
    }

    this._undoEntries = [];
    this._outcomes = [];
    return { success: true, affectedElementIds: restored };
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { predicted: this.predicted, undetermined: this.undetermined },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /**
   * Mutate an Immer DRAFT of the existing room so that ONLY the geometry fields
   * carry the PREDICTED values (G-NEW-05: the recipe `produceWithPatches` runs to
   * yield both the post-state and the undo's inverse patches).
   *
   * Written as EXPLICIT per-field assignments, never a spread of the prediction
   * over the record. A spread would silently write any field the prediction
   * happened to carry; this cannot, and reading it tells you exactly what is and
   * is not touched — the assignments below are precisely `GEOMETRY_FIELDS` plus
   * `metadata.modifiedAt`. Every semantic field (`name`, `roomNumber`,
   * `occupancyType`, `finishes`, `ifcData`, `revitId`, `properties`,
   * `boundingWallIds`) is simply never touched by the recipe, so Immer carries it
   * through structurally unchanged.
   *
   * PROVENANCE (C75 §1.1): `boundary.detectionMethod` is left EXACTLY as it was.
   * A reshape does not change HOW the room was originally established — a room the
   * user drew (`manual-boundary`) is still a user-drawn room after a wall move
   * shifted its edge. Overwriting it here would erase authored provenance, and
   * `SystemWritableOrigin` exists precisely so no system write can mint `authored`;
   * the symmetric obligation is that a system write must not DESTROY it either.
   * The C75 value for what THIS command produces is `computed` (a deterministic
   * rule over inputs the system holds) — or `regenerated` where it overwrites an
   * earlier derived value — and never `authored`.
   */
  private _applyGeometryToDraft(draft: RoomData, p: PredictedRoomGeometry): void {
    const height = draft.boundary?.height ?? 0;
    // `boundary`/`computed`/`metadata` are required by RoomData, but the spread
    // this recipe replaced tolerated malformed records missing them; keep that.
    if (!draft.boundary) draft.boundary = {} as RoomData['boundary'];
    if (!draft.computed) draft.computed = {} as RoomData['computed'];
    if (!draft.metadata) draft.metadata = {} as RoomData['metadata'];
    // VERBATIM. Rebuilt vertex-by-vertex so the stored record cannot alias the
    // plan object.
    draft.boundary.polygon = p.polygon.map((v) => ({ x: v.x, z: v.z }));
    draft.computed.area = p.area;
    draft.computed.grossArea = p.area;
    draft.computed.perimeter = p.perimeter;
    draft.computed.volume = p.area * height;
    draft.computed.centroid = { x: p.centroid.x, z: p.centroid.z };
    draft.computed.boundingBox = {
      minX: p.boundingBox.minX, minZ: p.boundingBox.minZ,
      maxX: p.boundingBox.maxX, maxZ: p.boundingBox.maxZ,
    };
    // `createdAt` / `createdBy` / `version` are untouched — a reshape is a
    // modification of an existing room, not a new authorship.
    draft.metadata.modifiedAt = this.timestamp;
  }

  /** Are the geometry fields already byte-equal? Compared on VALUES, not references. */
  private _geometryEqual(a: RoomData, b: RoomData): boolean {
    return JSON.stringify({ p: a.boundary?.polygon, c: a.computed })
      === JSON.stringify({ p: b.boundary?.polygon, c: b.computed });
  }
}
