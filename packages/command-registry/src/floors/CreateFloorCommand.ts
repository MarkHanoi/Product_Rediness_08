/**
 * CreateFloorCommand
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/03-FLOOR-COMMAND-PIPELINE-CONTRACT.md §4.1
 *
 * Spatial registration order (MANDATORY):
 * ① floorStore.add()
 * ② bimManager.registerElement()
 * ③ elementRegistry.registerSemantic()
 *
 * Undo reversal order (MANDATORY):
 * ① elementRegistry.unregister()
 * ② bimManager.unregisterElement()
 * ③ floorStore.remove()
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '../types';
import {
  FloorData,
  FloorBoundary,
  FloorFinishSpec,
  FloorLayer,
  FloorServiceHole,
  FloorIfcData,
  FloorVertex,
  FloorSketch,
} from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { ensureFloorCCW as ensureCCW, validateFloorPolygon as validatePolygon } from '@pryzm/core-app-model';
import { resolveFinishSeating, DEFAULT_FINISH_THICKNESS_M } from '@pryzm/core-app-model';
// §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — the inner-face inset is a DOMAIN RULE of
// the floor-finish element type, so it is resolved HERE (the single create chokepoint), not
// in each tool. `@pryzm/room-topology` is an existing declared dependency of this package
// (CreateFloorsByRoomTypeCommand already imports it); both symbols are called at execute()
// time only, never at module evaluation, so the command-registry ↔ room-topology cycle is
// not exercised at load (see MEMORY §SCC: no barrel access at module load).
import { resolveRoomFinishBoundary, ringsCoincide, curtainWallAsRoomFinishWall, type RoomFinishWall } from '@pryzm/room-topology';
// §C83-S5 — the IMPOSSIBLE-class "two finishes over one floor area" predicate and
// THE renderer that carries its code. Pure, same package, no store access.
import {
  evaluateFloorFinishPlacement,
  floorRegionRefusalText,
  type ExistingFloorRegion,
} from './FloorRegionOverlap';
// §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — see the block in execute() for WHY the CREATE
// arm needs this and not just the UPDATE arm.
import { ReseatLevelElementsCommand } from '../seating/ReseatLevelElementsCommand';
// §REGION-HOST-ATTRIBUTION (C79 §6.3 row 6) — the ONE shared builder both finish
// families route through. See `roomBoundarySketch.ts` for the §10.3 design decision
// (DERIVE FROM THE ROOM) and the named gap it leaves open.
import {
  buildRoomFinishBoundarySketch,
  formatFinishBoundaryAttributionReport,
  type IdentifiedFinishWall,
} from '../rooms/roomBoundarySketch';

export interface CreateFloorPayload {
  /** Pre-generated UUID — MUST come from the calling tool. Never generate here. */
  floorId: string;
  /** Pre-generated IFC GUID — stable across undo/redo cycles. */
  ifcGuid: string;
  polygon: FloorVertex[];
  /** Y offset above level datum (m). FFL = level.elevation + baseOffset.
   *  §A.21.D48: when OMITTED, the finish is auto-seated on the slab top so its
   *  bottom rests at the slab top and it stacks UP by `finishThicknessM` (no
   *  overlap with the slab). Pass an explicit value to pin the finish manually. */
  baseOffset?: number;
  /** Assembly thickness (m). §A.21.D48: when OMITTED the floor is treated as a
   *  thin applied FINISH (see `finishThicknessM`), NOT a 75 mm structural floor.
   *  Pass an explicit value for a structural / authored-thickness floor. */
  thickness?: number;
  /** §A.21.D48 — applied finish thickness (m) for the bare finish path. Default
   *  0.015 (15 mm). Ignored when an explicit `thickness` or `layers` is supplied. */
  finishThicknessM?: number;
  /** §A.21.D48 — slab TOP face offset relative to the level datum (m). The finish
   *  is seated on top of this. Default 0 (default slab top = level datum). */
  slabTopOffsetM?: number;
  levelId: string;
  label?: string;
  systemTypeId?: string;
  layers?: FloorLayer[];
  finishSpec?: Partial<FloorFinishSpec>;
  serviceHoles?: FloorServiceHole[];
  /** The structural slab directly below this floor finish (SLAB BINDING CONSTRAINT). */
  hostSlabId?: string;
  /** Room this floor is linked to — finish data is absorbed from the room at creation time. */
  hostRoomId?: string;
  /**
   * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — what `polygon` MEANS. This is the
   * caller's declaration of INTENT, not a geometry switch:
   *
   *   • `'room-centreline'` — `polygon` is the host room's boundary ring, which runs along
   *     the wall CENTRELINES. The command derives the real finish boundary from it by
   *     insetting each edge to its bounding wall's INNER FACE. Every room-derived path
   *     (3D FloorTool AUTO_FROM_ROOM, CreateFloorsByRoomTypeCommand, any future tool that
   *     floors a room) declares this.
   *   • `'explicit-polygon'` — `polygon` is the user's / the file's stated geometry and is
   *     stored VERBATIM. Hand-drawn floors (3D FloorTool DRAW), room-independent finishes
   *     (roof decks, lobby discs), project load, IFC import and paste declare this.
   *
   * OMITTED → the command infers: a polygon that IS the host room's centreline ring
   * (`ringsCoincide`) is a room-derived boundary whose author forgot to say so — exactly the
   * L-240 defect — and is inset. Anything else is stored verbatim. This is what makes the
   * rule impossible for a future tool to bypass by omission.
   */
  boundarySource?: 'room-centreline' | 'explicit-polygon';
  /**
   * §DUP-CARRIES-THE-RELATIONSHIP (C79 §5 / §2.1) — an ALREADY-ATTRIBUTED boundary,
   * supplied by a caller that HOLDS the correspondence instead of one that must
   * re-derive it. Stored VERBATIM; `hostRoomId`-based attribution is not run.
   *
   * WHO SUPPLIES IT, and why the room-derived path cannot serve them:
   * `DuplicateFloorPlanCommand` MINTS the target level's walls, so it knows
   * `sourceWallId → newWallId` as a function (§2.1 in its strongest sense). The
   * room, by contrast, lives on the SOURCE level — nothing duplicates rooms — so
   * `_buildBoundarySketch` would attribute a first-floor finish to GROUND-floor
   * walls. `FinishHostDependencyTracker` keys on `hostId` alone and consults no
   * level (FinishHostDependencyTracker.ts:237), so that finish would then follow
   * the wrong storey's wall: strictly worse than the inert finish it replaces.
   *
   * BOTH FACTS TRAVEL IN ONE FIELD deliberately. `sketch` is what the follow reads;
   * `boundingWallIds` is the §7.2(a) claim a reader and a grep-auditor see. Two
   * optional fields could be half-supplied and would then disagree — C79 §7.4's
   * per-path divergence. One object cannot.
   */
  hostReferences?: {
    sketch: FloorSketch;
    boundingWallIds: string[];
  };
  createdBy?: string;
}

export class CreateFloorCommand implements Command {
    readonly affectedStores = ["floor"] as const;
  readonly id: string;
  readonly type = CommandType.CREATE_FLOOR;
  readonly timestamp: number;
  readonly targetIds: string[];

  /**
   * §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — the re-seat this creation caused, retained so
   * `undo()` puts every moved element back on the exact Y it held before. `null` when the
   * new finish moved nothing (the common case: no furniture over it yet).
   */
  private _reseat: ReseatLevelElementsCommand | null = null;

  constructor(private readonly _payload: CreateFloorPayload) {
    this.id = `cmd-floor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.floorId];
  }

  canExecute(context: CommandContext): CommandValidationResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) return { ok: false, reason: 'FloorStore not available in CommandContext.' };

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    if (!levelId) return { ok: false, reason: 'Missing levelId.' };

    const level = context.bimManager.getLevelById(levelId);
    if (!level) return { ok: false, reason: `Level "${levelId}" not found in BimManager.` };

    const polyValidation = validatePolygon(this._payload.polygon);
    if (!polyValidation.valid) {
      return { ok: false, reason: `Invalid polygon: ${polyValidation.reasons.join('; ')}` };
    }

    // §A.21.D48 — bare finish floors default to a thin applied finish thickness,
    // not the legacy 75 mm structural default; explicit thickness still validated.
    const thickness = this._payload.thickness ?? this._payload.finishThicknessM ?? DEFAULT_FINISH_THICKNESS_M;
    if (thickness <= 0) {
      return { ok: false, reason: 'Floor thickness must be > 0.' };
    }

    // ── §C83-S5 — TWO FINISHES MAY NOT COVER ONE FLOOR AREA ──────────────────
    //
    // The founder's report, verbatim: *"the user tries to create a different
    // floor finish in the room - and creates an overlapping one - wrong!"*
    // C83 §1.1 classes this IMPOSSIBLE: two finishes over one patch of floor are
    // two mutually exclusive claims about one surface, and no context reverses
    // that. So it refuses here, at the ONE create chokepoint every path reaches
    // — the 3D FloorTool, the plan handler's bus route, the four building
    // executors, IFC import, paste and project restore.
    //
    // ⚠ This arm is the BACKSTOP, not the delivery. `CommandManagerImpl:217`
    // renders `blockingIssues[0]` into `result.info[0]`, and L-884 measured that
    // **no tool renders `result.info[0]`** — a refusal that stops here reaches
    // devtools and nothing else. The user-facing half is
    // `apps/editor/src/engine/consequence/floorFinishGate.ts`, called by the
    // tools BEFORE they build the command. This arm exists so that the creators
    // that never pass a tool — import, paste, an executor, a future handler —
    // cannot author the defect silently.
    //
    // Suppressed during project restore and building generation (C83 §3.1). The
    // restore half is load-bearing: projects saved by build 46232e2d may ALREADY
    // contain overlapping finishes, and refusing on replay would turn a visual
    // defect into a project that will not open. A rule introduced today may not
    // retroactively refuse yesterday's documents.
    const _c83g = globalThis as unknown as {
      __pryzmProjectLoadActive?: boolean;
      __pryzmBuildingGenActive?: boolean;
    };
    if (_c83g.__pryzmProjectLoadActive !== true && _c83g.__pryzmBuildingGenActive !== true) {
      // Evaluate the ring the model would actually HOLD, not the payload's. For a
      // `'room-centreline'` payload those differ by the L-240 inner-face inset,
      // and checking the pre-inset ring would over-state the claimed area by half
      // a wall thickness on every edge. `_resolveBoundary` is read-only.
      const resolved = this._resolveBoundary(context);
      const existing: ExistingFloorRegion[] = (
        typeof floorStore.getAll === 'function' ? (floorStore.getAll() as FloorData[]) : []
      ).map((f) => ({
        id: f.id,
        levelId: f.levelId,
        polygon: f.boundary?.polygon ?? [],
        ...(f.label !== undefined ? { label: f.label } : {}),
        ...(f.systemTypeId !== undefined ? { systemTypeId: f.systemTypeId } : {}),
        ...(f.hostRoomId !== undefined ? { hostRoomId: f.hostRoomId } : {}),
      }));

      const spatial = evaluateFloorFinishPlacement(
        { id: this._payload.floorId, levelId, polygon: resolved },
        existing,
      );
      if (!spatial.valid) {
        // §REFUSAL-IDENTITY — the SHARED renderer, never
        // `spatial.reason ?? '<fallback>'`. `reason` stays the machine token;
        // `blockingIssues[0]` is the human sentence, which CommandManagerImpl:217
        // prefers (§FIX-VALIDATION-REASON-IS-HUMAN-READABLE, L-813).
        const refusalText = floorRegionRefusalText(spatial.violations, spatial.offers);
        console.warn(`[CreateFloorCommand] §C83-S5 REFUSED: ${refusalText}`);
        return {
          ok: false,
          reason: 'FIN_REGION_ALREADY_FINISHED',
          blockingIssues: [refusalText],
        };
      }
    }

    return { ok: true };
  }

  execute(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[CreateFloorCommand] FloorStore not available.');

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    if (!levelId) throw new Error('SpatialAuthorityError: Missing levelId.');

    const level = context.bimManager.getLevelById(levelId);
    if (!level) throw new Error(`SpatialAuthorityError: Level "${levelId}" not found.`);

    const floorId = this._payload.floorId;
    const now = Date.now();

    // §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — THE chokepoint. A floor finish is
    // bounded by the INNER FACES of its bounding walls; that is a rule of the element type,
    // so it is applied here, once, for every creation path — not re-implemented per tool
    // (which is how L-213 left the 3D FloorTool AUTO path shipping the raw centreline).
    // Derivation happens BEFORE ensureCCW, exactly as the batch path did it, so the batch
    // output is byte-identical.
    const polygon = ensureCCW(this._resolveBoundary(context));
    // §A.21.D48 — seat the finish ON the slab top: a thin finish whose BOTTOM rests
    // at the slab top (no shared volume → no Z-fighting, clash-detectable). Explicit
    // thickness / baseOffset / layers are honoured verbatim (structural / IFC paths).
    const { thickness, baseOffset } = resolveFinishSeating({
      finishThicknessM: this._payload.finishThicknessM,
      thickness: this._payload.thickness,
      baseOffset: this._payload.baseOffset,
      hasLayers: !!(this._payload.layers && this._payload.layers.length > 0),
      slabTopOffsetM: this._payload.slabTopOffsetM,
    });

    const layers = this._payload.layers
      ? structuredClone(this._payload.layers)
      : undefined;

    // Absorb room finish data if this floor is linked to a room
    let roomMaterialName: string | undefined;
    let roomMaterialColor: string | undefined;
    if (this._payload.hostRoomId) {
      const roomStore = (context.stores as any).roomStore;
      const room = roomStore?.getById(this._payload.hostRoomId);
      if (room?.finishes?.floor) {
        roomMaterialName = room.finishes.floor.materialName;
        roomMaterialColor = room.finishes.floor.materialColor;
      }
    }

    const finishSpec: FloorFinishSpec = {
      finishColor: roomMaterialColor ?? '#D4C4A8',
      finishPattern: 'none',
      exposedScreed: false,
      ...this._payload.finishSpec,
      ...(roomMaterialName ? { materialName: roomMaterialName } : {}),
    };

    const ifcData: FloorIfcData = {
      guid: this._payload.ifcGuid,
      ifcClass: 'IfcCovering',
      predefinedType: 'FLOORING',
    };

    const floorCount = floorStore.getAll().length + 1;
    const label = this._payload.label ?? `Floor-${floorCount.toString().padStart(2, '0')}`;

    const boundary: FloorBoundary = {
      polygon,
      baseOffset,
      thickness,
      detectionMethod: 'manual-polygon',
    };

    // §REGION-HOST-ATTRIBUTION (C79 §1.1, §2, §3, §4.3) — THE chokepoint, and the
    // same one the inner-face inset already runs through, so every creation path
    // (3D tool, plan tool, batch, AI, import, paste) gets references or a named
    // reason. Built from the FINAL stored ring so the edges are index-aligned with
    // `boundary.polygon`. `boundingWallIds` was `[]` UNCONDITIONALLY here — C79
    // §7.1's named anti-pattern, none of the three legal branches — and
    // `FloorData.sketch` (reference-capable, all five §1.1 facts) was never written
    // by any path. Both are now populated by construction.
    const sketch = this._buildBoundarySketch(context, polygon);

    const newFloor: FloorData = {
      id: floorId,
      type: 'floor',
      levelId,
      parentId: levelId,
      label,
      floorNumber: `F.${floorCount.toString().padStart(2, '0')}`,
      boundary,
      systemTypeId: this._payload.systemTypeId,
      layers,
      finishSpec,
      slope: undefined,
      serviceHoles: this._payload.serviceHoles ? structuredClone(this._payload.serviceHoles) : [],
      sketch: sketch.outerLoop.edges.length > 0 ? { outerLoop: sketch.outerLoop } : undefined,
      coveredRoomIds: this._payload.hostRoomId ? [this._payload.hostRoomId] : [],
      // §7.2(a) POPULATE — exactly the walls that PRODUCED an edge of this floor's
      // boundary, never the room's whole declared set (a wall that produced no edge
      // is not a wall this floor is bounded by; writing it would be a §2.3 wrong
      // host dressed as thoroughness). Empty here is now a MEASURED zero with a
      // named reason in the report below, not an unconditional literal.
      boundingWallIds: sketch.boundingWallIds,
      hostSlabId: this._payload.hostSlabId,
      hostRoomId: this._payload.hostRoomId,
      colour: undefined,
      opacity: 1,
      visible: true,
      properties: {},
      ifcData,
      metadata: {
        createdAt: now,
        modifiedAt: now,
        createdBy: this._payload.createdBy ?? 'user',
        version: 1,
      },
    };

    // §01 §5 Spatial registration order ①②③
    floorStore.add(newFloor);
    context.bimManager.registerElement(floorId, levelId);
    try {
      elementRegistry.registerSemantic(floorId, 'floor');
    } catch {
      // Already registered on redo — safe to ignore.
    }

    // §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — THE CREATE ARM WAS MISSING.
    //
    // `ReseatLevelElementsCommand` was written for exactly this defect and wired into
    // `UpdateFloorCommand`, `UpdateFloorLayersCommand` and `UpdateCeilingCommand` — but
    // NOT here. So the single most common authoring order in the product was still broken:
    //
    //   1. Furnish a room  → furniture/plumbing/lighting seat on the BARE SLAB
    //                        (`resolveFflOffsetAt` → null → 'slab-top'), y = level.elevation.
    //   2. Apply the floor finish → FFL rises by `boundary.baseOffset` (15 mm by default,
    //                        §A.21.D48 `DEFAULT_FINISH_THICKNESS_M`).
    //   3. Nothing re-seats. Every item is now buried 15 mm in the finish.
    //
    // That is the SAME founder-reported symptom §FIX-INTERIOR-FFL-SEATING closed for the
    // creation order "floor first"; only the trigger differs, and covering only the UPDATE
    // arm is C11 §5.4's "convergence by coincidence" one rung up.
    //
    // MEASURED (BIM 2.0 certification F-3): the round-trip comparator read
    // `plumbing.cert-pl-1.position.y: expected 0 got 0.015` and the same for furniture. The
    // loader was NOT applying a phantom offset — `CreatePlumbingFixtureCommand` and
    // `CreateFurnitureCommand` never read `payload.position.y` at all, they DERIVE it from
    // the seating datum (C11 §5.4). `ImportProjectCommand` restores floor finishes at
    // Step 5c, BEFORE furniture (Step 7) and plumbing (Step 10), so on reload the fixture
    // was seated correctly at 0.015 while the LIVE model still held the stale 0. The restore
    // was right and the live model was wrong. Fixing it here — not by carrying the authored
    // y through the loader — is what makes the two agree, and carrying it would have
    // re-broken §FIX-INTERIOR-FFL-SEATING by freezing a stale datum forever.
    //
    // Unconditional, unlike the UPDATE arm's `_datumRelevant` gate: a NEW visible finish
    // always changes the FFL over the area it covers (there is no "colour-only" create).
    // The re-seat is idempotent and computes an absolute target, so items already at the
    // right height are skipped and never enter the undo record. During project load this
    // is a scan of two empty stores.
    const affected = [floorId];
    const reseat = new ReseatLevelElementsCommand(levelId);
    const r = reseat.execute(context);
    if (r.success && r.affectedElementIds.length > 0) {
      // Retain ONLY when it moved something — an empty run has nothing to undo and would
      // leave a misleading no-op in the undo record (mirrors UpdateFloorCommand).
      this._reseat = reseat;
      affected.push(...r.affectedElementIds);
    }

    return { success: true, affectedElementIds: affected };
  }

  /**
   * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — resolve the floor's stored boundary
   * from the payload's DECLARED intent (see `boundarySource`).
   *
   * Room-derived boundary  → inset the centreline ring to the bounding walls' inner faces
   *                          via the single canonical `resolveRoomFinishBoundary`.
   * Explicit / user-drawn  → returned VERBATIM. A hand-drawn polygon is the user's stated
   *                          geometry and is never silently re-inset (C11 §Floor-finish
   *                          boundary). Hosting a drawn floor in a room (FloorTool's
   *                          centroid autodetect) is a LINK, not a re-derivation.
   *
   * Fail-safe on every branch: returns the payload polygon unchanged, so a floor is always
   * created. Never applies a second offset — it only ever insets a ring it has PROVEN to be
   * a centreline, so "converge, don't compensate" holds by construction.
   */
  private _resolveBoundary(context: CommandContext): FloorVertex[] {
    const src = this._payload.polygon;
    const hostRoomId = this._payload.hostRoomId;
    // No host room → nothing to derive from (roof decks, lobby discs, IFC slabs, paste).
    if (!hostRoomId || !src || src.length < 3) return src;
    if (this._payload.boundarySource === 'explicit-polygon') return src;

    const roomStore = (context.stores as any).roomStore as
      | { getById?: (id: string) => { boundary?: { polygon?: Array<{ x: number; z: number }> }; boundingWallIds?: string[] } | undefined }
      | undefined;
    const wallStore = (context.stores as any).wallStore as
      | { getById?: (id: string) => RoomFinishWall | undefined; getByLevel?: (levelId: string) => RoomFinishWall[] }
      | undefined;
    if (!roomStore || !wallStore) return src;

    if (this._payload.boundarySource !== 'room-centreline') {
      // UNDECLARED payload — infer. A polygon that IS the host room's centreline ring is a
      // room-derived boundary that forgot to declare itself (the L-240 defect shape). Any
      // correctly-inset finish lies strictly inside the ring, so it can never match here →
      // an already-derived boundary can never be inset twice.
      const centreline = roomStore.getById?.(hostRoomId)?.boundary?.polygon;
      if (!ringsCoincide(src, centreline)) return src;
    }

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    const derived = resolveRoomFinishBoundary(
      src.map(v => ({ x: v.x, z: v.z })),
      {
        roomId: hostRoomId,
        levelId,
        lookup: {
          getRoomById:    (id) => roomStore.getById?.(id),
          // §CW90 item 4 — a room's boundingWallIds may name CURTAIN walls
          // (room-bounding since the 2026-08-25 founder ruling). A wall-store
          // miss falls through to the curtain-wall store, adapted to the
          // mullion face, instead of silently degrading that edge to inset 0.
          getWallById:    (id) => wallStore.getById?.(id)
              ?? curtainWallAsRoomFinishWall(
                  (context.stores as any).curtainWallStore?.getById?.(id)
                  ?? (context.stores as any).curtainWallStore?.get?.(id)),
          getWallsByLevel: (lid) => wallStore.getByLevel?.(lid) ?? [],
        },
      },
    );
    return derived.length >= 3 ? (derived as FloorVertex[]) : src;
  }

  /**
   * §REGION-HOST-ATTRIBUTION (C79 §6.3 row 6) — attribute the FINAL stored boundary
   * to the walls that produced it, via the ONE shared builder `CreateCeilingCommand`
   * also uses (§3.4: one relationship, one edge shape; §7.4: no per-path divergence).
   *
   * Fail-safe on every branch, exactly like `_resolveBoundary`: an unavailable store
   * yields an all-free sketch with the counts saying so — never a thrown creation and
   * never a silently-empty `boundingWallIds` that looks like "no walls" (§2.6).
   */
  private _buildBoundarySketch(context: CommandContext, polygon: FloorVertex[]) {
    // §DUP-CARRIES-THE-RELATIONSHIP — a caller that HOLDS the correspondence wins
    // over re-derivation. Placed FIRST so the room path cannot run and cannot
    // produce a second, rival attribution (§7.4). See `hostReferences` on the
    // payload for why the room path is not merely redundant here but wrong.
    const carried = this._payload.hostReferences;
    if (carried) {
      return {
        outerLoop: carried.sketch.outerLoop,
        boundingWallIds: carried.boundingWallIds,
      };
    }

    const roomStore = (context.stores as any).roomStore as
      | { getById?: (id: string) => { boundingWallIds?: string[] } | undefined }
      | undefined;
    const wallStore = (context.stores as any).wallStore as
      | { getById?: (id: string) => IdentifiedFinishWall | undefined }
      | undefined;

    const sketch = buildRoomFinishBoundarySketch(
      polygon.map(v => ({ x: v.x, z: v.z })),
      this._payload.hostRoomId,
      {
        getRoomById: (id) => roomStore?.getById?.(id),
        getWallById: (id) => {
          const w = wallStore?.getById?.(id);
          // The wall store keys by id, so a record fetched by `id` IS that wall —
          // carry the id through even when the record does not repeat it. This is
          // by construction, not a lookup (§2.1).
          return w ? ({ ...w, id: w.id ?? id } as IdentifiedFinishWall) : undefined;
        },
      },
    );

    // §2.6 — the counts are REPORTED, never absorbed. Zero-host and all-host are
    // different readings at the caller. Gated like the batch §DIAG lines so the
    // string is not built on the hot creation path unless diagnostics are on.
    const g = globalThis as unknown as { __pryzmLayoutDiag?: boolean; __pryzmFloorDiag?: boolean };
    if ((g.__pryzmLayoutDiag === true || g.__pryzmFloorDiag === true) && typeof console !== 'undefined') {
      console.log(formatFinishBoundaryAttributionReport('floor', sketch.attribution));
    }
    return sketch;
  }

  undo(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[CreateFloorCommand.undo] FloorStore not available.');

    const floorId = this._payload.floorId;
    const existing = floorStore.getById(floorId);
    if (!existing) {
      console.warn(`[CreateFloorCommand.undo] Floor "${floorId}" not found — already removed?`);
      return { success: true, affectedElementIds: [] };
    }

    // §FIX-SEATING-DYNAMIC-REDATUM (W1-4) — put the dependents back BEFORE removing the
    // host, while they still hold the Y this command gave them. The re-seat records
    // absolute before/after values so order is not strictly load-bearing, but it mirrors
    // how execute() built the pair (and how UpdateFloorCommand.undo is written).
    if (this._reseat) {
      this._reseat.undo(context);
      this._reseat = null;
    }

    // Undo reversal order ①②③
    try { elementRegistry.unregister(floorId); } catch { /* already unregistered */ }
    try { context.bimManager.unregisterElement(floorId); } catch { /* already unregistered */ }
    floorStore.remove(floorId);

    return { success: true, affectedElementIds: [floorId] };
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { ...this._payload },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
