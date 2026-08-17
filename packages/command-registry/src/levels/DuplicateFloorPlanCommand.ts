/**
 * DuplicateFloorPlanCommand
 *
 * Clones every element on a source level to one or more target levels.
 * Cloned element types: Walls (+ their openings), Slabs, Floor finishes,
 * Ceilings, Columns, Furniture.
 *
 * Elevation handling
 * ──────────────────
 * Each target level has a different elevation than the source.  World-Y values
 * for all cloned elements are shifted by (targetElevation - sourceElevation)
 * so geometry lands at the correct storey height.
 *
 * Undo
 * ────
 * Removes every element created by this command.  The stable pre-generated
 * IDs mean redo is idempotent (§2.6 contract).
 *
 * Contract compliance
 * ───────────────────
 *   §01 §2.6 — element IDs pre-generated and deterministic across redo.
 *   §01 §2.7 — no direct builder calls; geometry rebuild driven by store events.
 *   §01 §3.5 — bimManager.registerElement() called by sub-commands, not here.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * §DUP-CARRIES-THE-RELATIONSHIP (L-949, founder-reported · C79 §5 · C71 §3)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE REPORT, verbatim: *"the first floor was created by duplicate ground level
 * to first floor — and those floors don't get the slab, floor finishes or ceiling
 * moving along. But walls they do."*
 *
 * That single sentence contains TWO defects, and closing only the first is worse
 * than closing neither.
 *
 * ── DEFECT ONE: the finishes were not in the loop at all ──────────────────
 * This command read FOUR stores — `wallStore`, `slabStore`, `columnStore`,
 * `furnitureStore`. It never read `floorStore` or `ceilingStore`. Floor finishes
 * and ceilings were therefore NEVER CREATED on the target level. They were not
 * failing to follow; they did not exist. §NO-EMPTY-MEANS-UNKNOWN: a level with no
 * floors now reports "none", and the report below states which families were
 * found and which were empty.
 *
 * ── DEFECT TWO: the dependency graph was never re-established ─────────────
 * The command did NO reference remapping. Walls appear to survive duplication
 * only because `joinedTo` is **RE-DERIVED FROM GEOMETRY** by the junction
 * resolver after the walls land — the founder's own log shows it (*"2 partner(s)
 * via joinedTo-graph → 2 baseline re-seat(s), partners accounted 2/2"*). Nothing
 * re-derives an AUTHORED HOST REFERENCE. So even the slab this command DID copy
 * crossed over with `sketch` dropped (`CreateSlabCommand` accepts `sketch`; this
 * command simply never passed it), leaving it absent from
 * `SlabDependencyTracker`'s graph AND `SlabWallConnectivityService`'s — both of
 * which open with `if (!slab.sketch) return;`. An inert slab, forever.
 *
 * C79 §5 states the rule both halves broke: *"the connection is a persistent
 * RELATIONSHIP, not a coincidence of coordinates."* This command copied the
 * coordinates and dropped the relationship.
 *
 * ── WHY THE REMAP MUST REMAP AND MAY NEVER CARRY AN ID THROUGH ────────────
 * `FinishHostDependencyTracker.graph` and `SlabDependencyTracker.graph` key on
 * `hostId` ALONE and consult no level. A duplicated FIRST-floor finish still
 * naming a GROUND-floor wall would follow that ground-floor wall — cross-storey
 * action at a distance, strictly worse than an inert element. Every host that
 * cannot be rebound is therefore DEGRADED to a free line and COUNTED, never
 * carried across. See `remapHostReferences.ts`.
 *
 * ── WHAT IS DELIBERATELY NOT REBOUND, stated rather than hidden ───────────
 *   · `hostRoomId` / `coveredRoomIds` are DROPPED on every duplicated finish.
 *     Rooms are not duplicated by this command (or any other), so the source
 *     room lives on the source level; keeping the link would make a first-floor
 *     finish claim a ground-floor room. C79 §2.3 — no host beats a wrong host.
 *     Room re-detection on the new level may relink them later; this command
 *     does not pretend to.
 *   · A ceiling's `hostSlabId` is dropped: `CreateCeilingPayload` exposes no way
 *     to set it, so there is no honest channel to rebind it through. A floor's
 *     IS rebound, because `CreateFloorPayload.hostSlabId` exists.
 * Both are named in the returned `info` so a caller reads them, not infers them.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { CreateWallCommand } from '../walls/CreateWallCommand';
import { CreateWallOpeningCommand } from '../walls/CreateWallOpeningCommand';
import { CreateSlabCommand } from '../slabs/CreateSlabCommand';
import { CreateColumnCommand } from '../columns/CreateColumnCommand';
import { CreateFurnitureCommand } from '../furniture/CreateFurnitureCommand';
import { CreateFloorCommand } from '../floors/CreateFloorCommand';
import { CreateCeilingCommand } from '../ceilings/CreateCeilingCommand';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import {
    remapHostReferences,
    formatHostRemapReport,
    type HostRemapReport,
} from './remapHostReferences';

export interface DuplicateFloorPlanPayload {
    sourceLevelId:  string;
    targetLevelIds: string[];
}

export class DuplicateFloorPlanCommand implements Command {
    readonly affectedStores = ['wall', 'slab', 'floor', 'ceiling', 'column', 'furniture', 'level'] as const;
    readonly id:        string;
    readonly type =     CommandType.DUPLICATE_FLOOR_PLAN;
    readonly timestamp: number;
    targetIds:          string[] = [];

    private _createdWallIds:      string[] = [];
    private _createdSlabIds:      string[] = [];
    private _createdColumnIds:    string[] = [];
    private _createdFurnitureIds: string[] = [];
    /**
     * The finish sub-commands are retained as OBJECTS, not as bare ids like the four
     * families above, and the difference is load-bearing: `CreateFloorCommand.execute`
     * spawns a `ReseatLevelElementsCommand` (§FIX-SEATING-DYNAMIC-REDATUM) and holds
     * its inverse. Removing the floor from the store by id would leave every item it
     * re-seated stranded 15 mm high. Only the command that made the change can put it
     * back, so `undo()` calls the sub-command's own `undo()`.
     */
    private _createdFloorCmds:   CreateFloorCommand[]   = [];
    private _createdCeilingCmds: CreateCeilingCommand[] = [];
    private _createdFloorIds:    string[] = [];
    private _createdCeilingIds:  string[] = [];

    constructor(private payload: DuplicateFloorPlanPayload) {
        this.id        = `cmd-dup-fp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.bimManager.getLevelById(this.payload.sourceLevelId)) {
            return { ok: false, reason: `Source level "${this.payload.sourceLevelId}" not found.` };
        }
        if (!this.payload.targetLevelIds.length) {
            return { ok: false, reason: 'No target levels specified.' };
        }
        for (const tId of this.payload.targetLevelIds) {
            if (tId === this.payload.sourceLevelId) {
                return { ok: false, reason: 'Source and target level cannot be the same.' };
            }
            if (!ctx.bimManager.getLevelById(tId)) {
                return { ok: false, reason: `Target level "${tId}" not found.` };
            }
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        // §2.6 Redo idempotency — if elements were already created and are still
        // present in the store, skip re-execution.
        if (this._createdWallIds.length > 0) {
            const allPresent = this._createdWallIds.every(id => ctx.stores.wallStore.getById(id));
            if (allPresent) {
                return {
                    success: true,
                    affectedElementIds: this._all(),
                    info: ['DuplicateFloorPlan: redo idempotency — elements already present.'],
                };
            }
        }

        const srcLevel = ctx.bimManager.getLevelById(this.payload.sourceLevelId);
        if (!srcLevel) return { success: false, affectedElementIds: [], info: ['Source level not found.'] };

        // ── Gather source elements ────────────────────────────────────────────
        // §NO-EMPTY-MEANS-UNKNOWN — the finish stores are OPTIONAL on CommandContext
        // (`types.ts:448,450`), so "store absent" and "store present and empty" are
        // two different facts and are kept apart: `null` means this runtime cannot
        // duplicate that family at all, `[]` means it has none to duplicate. The
        // report at the bottom prints whichever is true.
        const srcWalls     = ctx.stores.wallStore.getByLevel(this.payload.sourceLevelId);
        const srcSlabs     = ctx.stores.slabStore.getAll().filter(s => s.levelId === this.payload.sourceLevelId);
        const srcColumns   = ctx.stores.columnStore.getAll().filter(c => c.levelId === this.payload.sourceLevelId);
        const srcFurniture = ctx.stores.furnitureStore.getAll().filter(f => f.levelId === this.payload.sourceLevelId);

        const floorStore   = ctx.stores.floorStore;
        const ceilingStore = ctx.stores.ceilingStore;
        const srcFloors    = floorStore
            ? floorStore.getAll().filter(f => f.levelId === this.payload.sourceLevelId)
            : null;
        const srcCeilings  = ceilingStore
            ? ceilingStore.getAll().filter(c => c.levelId === this.payload.sourceLevelId)
            : null;

        /** The SOURCE level's wall ids — used only to tell "its twin was refused"
         *  from "it was never a wall of this level" in the remap report. */
        const srcWallIdSet = new Set(srcWalls.map(w => w.id));

        const createdWalls:     string[] = [];
        const createdSlabs:     string[] = [];
        const createdColumns:   string[] = [];
        const createdFurniture: string[] = [];
        const createdFloors:    string[] = [];
        const createdCeilings:  string[] = [];
        const floorCmds:        CreateFloorCommand[]   = [];
        const ceilingCmds:      CreateCeilingCommand[] = [];
        /** Every remap outcome across every family and every target level, folded
         *  into one line at the end rather than one line per element. */
        const remapTotals: HostRemapReport = {
            remapped: 0, degraded: 0, unmappedHostIds: [], alreadyFree: 0, droppedWithoutGeometry: 0,
        };
        const foldRemap = (r: HostRemapReport) => {
            remapTotals.remapped += r.remapped;
            remapTotals.degraded += r.degraded;
            remapTotals.alreadyFree += r.alreadyFree;
            remapTotals.droppedWithoutGeometry += r.droppedWithoutGeometry;
            remapTotals.unmappedHostIds.push(...r.unmappedHostIds);
        };

        for (let li = 0; li < this.payload.targetLevelIds.length; li++) {
            const targetLevelId = this.payload.targetLevelIds[li];
            const tgtLevel = ctx.bimManager.getLevelById(targetLevelId);
            if (!tgtLevel) {
                console.warn(`[DuplicateFloorPlan] Target level "${targetLevelId}" not found — skipping.`);
                continue;
            }

            const elevDelta = tgtLevel.elevation - srcLevel.elevation;

            /**
             * §DUP-CARRIES-THE-RELATIONSHIP — THE correspondence, built AS the walls
             * are minted rather than searched for afterwards. This is what makes the
             * rebind §2.1-exact ("by construction") instead of the §2.2 proximity
             * match C79 forbids: it is not a lookup over candidates, it is the
             * function this loop itself defines. A wall whose creation is REFUSED
             * never enters the map, so nothing downstream can bind to a wall that
             * does not exist.
             */
            const wallIdMap = new Map<string, string>();
            /** `sourceSlabId → newSlabId`, for rebinding a floor finish's `hostSlabId`. */
            const slabIdMap = new Map<string, string>();

            // ── Walls ─────────────────────────────────────────────────────────
            for (let wi = 0; wi < srcWalls.length; wi++) {
                const w       = srcWalls[wi];
                const newWallId = `wall-dup-${this.id}-${li}-${wi}`;

                const wallCmd = new CreateWallCommand(newWallId, {
                    start:        { x: w.baseLine[0].x, z: w.baseLine[0].z },
                    end:          { x: w.baseLine[1].x, z: w.baseLine[1].z },
                    height:       w.height,
                    thickness:    w.thickness,
                    levelId:      targetLevelId,
                    baseOffset:   w.baseOffset ?? 0,
                    materialId:   w.materialId,
                    materialColor: w.materialColor,
                    systemTypeId: w.systemTypeId,
                    curve: w.curve ? {
                        control:  { x: w.curve.control.x, y: w.curve.control.y + elevDelta, z: w.curve.control.z },
                        segments: w.curve.segments,
                    } : undefined,
                });

                const vr = wallCmd.canExecute(ctx);
                if (!vr.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping wall ${w.id}: ${vr.reason}`);
                    continue;
                }
                const wr = wallCmd.execute(ctx);
                if (!wr.success) continue;
                createdWalls.push(newWallId);
                wallIdMap.set(w.id, newWallId);

                // Clone openings (doors + windows) embedded on the source wall
                if (w.openings && w.openings.length > 0) {
                    for (let oi = 0; oi < w.openings.length; oi++) {
                        const op = w.openings[oi];
                        const openCmd = new CreateWallOpeningCommand({
                            wallId: newWallId,
                            openingData: {
                                ...op,
                                id:        `op-dup-${this.id}-${li}-${wi}-${oi}`,
                                elementId: `el-dup-${this.id}-${li}-${wi}-${oi}`,
                            },
                        });
                        const ovr = openCmd.canExecute(ctx);
                        if (!ovr.ok) {
                            console.warn(`[DuplicateFloorPlan] Skipping opening ${op.id}: ${ovr.reason}`);
                            continue;
                        }
                        openCmd.execute(ctx);
                    }
                }
            }

            // ── Slabs ─────────────────────────────────────────────────────────
            for (let si = 0; si < srcSlabs.length; si++) {
                const s       = srcSlabs[si];
                const newSlabId = `slab-dup-${this.id}-${li}-${si}`;

                // §DUP-CARRIES-THE-RELATIONSHIP — the half this command was ALREADY
                // able to do and never did. `CreateSlabPayload.sketch` has existed
                // the whole time (`CreateSlabCommand.ts:34`); the duplicate simply
                // never passed it, so every duplicated slab landed with
                // `sketch === undefined` and sat in nobody's dependency graph.
                //
                // Slab sketch coordinates are `{x, y}` where y IS world-Z
                // (`SketchTypes.ts` / `WallFaceResolver`: "the returned Segment2D is
                // in slab 2D space: x = world.x, y = world.z"), so the ring fallback
                // below is built in that frame — NOT the finishes' `{x, z}`.
                let slabSketch = s.sketch;
                if (s.sketch) {
                    const ring = s.polygon;
                    const remapped = remapHostReferences(
                        s.sketch.outerLoop.edges,
                        wallIdMap,
                        (i) => (ring && ring.length >= 3
                            ? { start: { ...ring[i % ring.length]! }, end: { ...ring[(i + 1) % ring.length]! } }
                            : undefined),
                        srcWallIdSet,
                    );
                    foldRemap(remapped.report);
                    if (remapped.report.droppedWithoutGeometry > 0) {
                        // A loop that lost an edge is not this slab's boundary. Refusing
                        // the sketch (and keeping the copied polygon) is honest: the slab
                        // exists at the right shape and states that it follows nothing.
                        console.warn(
                            `[DuplicateFloorPlan] ${formatHostRemapReport('slab', newSlabId, remapped.report, srcWallIdSet)} ` +
                            `Sketch NOT carried — this slab will NOT follow any wall.`,
                        );
                        slabSketch = undefined;
                    } else {
                        slabSketch = {
                            outerLoop: { edges: remapped.edges },
                            // Inner loops are cut-outs. `SlabDependencyTracker` indexes them
                            // too (SlabDependencyTracker.ts:140), so they get the same rebind
                            // — a hole bound to the source storey is the same defect one
                            // level down.
                            innerLoops: s.sketch.innerLoops?.map((loop) => {
                                const r = remapHostReferences(loop.edges, wallIdMap, undefined, srcWallIdSet);
                                foldRemap(r.report);
                                return { edges: r.edges };
                            }),
                        };
                    }
                }

                const slabCmd = new CreateSlabCommand({
                    id:        newSlabId,
                    ifcGuid:   `guid-slab-dup-${this.id}-${li}-${si}`,
                    width:     s.width,
                    depth:     s.depth,
                    thickness: s.thickness,
                    position:  { x: s.position.x, y: s.position.y + elevDelta, z: s.position.z },
                    levelId:   targetLevelId,
                    polygon:   s.polygon ? s.polygon.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })) : undefined,
                    holes:     s.holes as { x: number; y: number }[][] | undefined,
                    sketch:    slabSketch,
                });

                const sv = slabCmd.canExecute(ctx);
                if (!sv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping slab ${s.id}: ${sv.reason}`);
                    continue;
                }
                const sr = slabCmd.execute(ctx);
                if (sr.success) {
                    createdSlabs.push(newSlabId);
                    slabIdMap.set(s.id, newSlabId);
                }
            }

            // ── Floor finishes ────────────────────────────────────────────────
            // DEFECT ONE, first half. Ordered AFTER slabs so `hostSlabId` can be
            // rebound to a slab that already exists on the target level.
            for (let fi = 0; srcFloors && fi < srcFloors.length; fi++) {
                const f = srcFloors[fi]!;
                const newFloorId = `floor-dup-${this.id}-${li}-${fi}`;

                const carried = this._carryFinishReferences(
                    'floor', newFloorId, f.sketch, f.boundary.polygon, f.boundingWallIds,
                    wallIdMap, srcWallIdSet, foldRemap,
                );

                const floorCmd = new CreateFloorCommand({
                    floorId: newFloorId,
                    ifcGuid: `guid-floor-dup-${this.id}-${li}-${fi}`,
                    // The stored ring is ALREADY inset to the walls' inner faces
                    // (L-240 ran when the source was authored). Declaring it explicit
                    // is what stops a second inset being applied — "converge, don't
                    // compensate".
                    polygon: f.boundary.polygon.map(p => ({ x: p.x, z: p.z })),
                    boundarySource: 'explicit-polygon',
                    baseOffset: f.boundary.baseOffset,
                    thickness:  f.boundary.thickness,
                    levelId:    targetLevelId,
                    label:      f.label,
                    systemTypeId: f.systemTypeId,
                    layers:     f.layers ? structuredClone(f.layers) : undefined,
                    finishSpec: structuredClone(f.finishSpec),
                    // Hosted sub-elements get FRESH ids: `elementId` is registered in
                    // BimManager and ElementRegistry, and re-using the source's would
                    // collide two storeys onto one registration.
                    serviceHoles: f.serviceHoles?.map((h, hi) => ({
                        ...structuredClone(h),
                        id:        `fh-dup-${this.id}-${li}-${fi}-${hi}`,
                        elementId: `fhe-dup-${this.id}-${li}-${fi}-${hi}`,
                    })),
                    // Rebound, not carried: the source slab is on the source storey.
                    hostSlabId: f.hostSlabId ? slabIdMap.get(f.hostSlabId) : undefined,
                    // `hostRoomId` deliberately omitted — see the class header.
                    ...(carried ? { hostReferences: carried } : {}),
                });

                const fv = floorCmd.canExecute(ctx);
                if (!fv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping floor ${f.id}: ${fv.reason}`);
                    continue;
                }
                const fr = floorCmd.execute(ctx);
                if (fr.success) {
                    createdFloors.push(newFloorId);
                    floorCmds.push(floorCmd);
                }
            }

            // ── Ceilings ──────────────────────────────────────────────────────
            // DEFECT ONE, second half.
            for (let ci = 0; srcCeilings && ci < srcCeilings.length; ci++) {
                const c = srcCeilings[ci]!;
                const newCeilingId = `ceil-dup-${this.id}-${li}-${ci}`;

                const carried = this._carryFinishReferences(
                    'ceiling', newCeilingId, c.sketch, c.boundary.polygon, c.boundingWallIds,
                    wallIdMap, srcWallIdSet, foldRemap,
                );

                const ceilCmd = new CreateCeilingCommand({
                    ceilingId: newCeilingId,
                    ifcGuid:   `guid-ceil-dup-${this.id}-${li}-${ci}`,
                    polygon:   c.boundary.polygon.map(p => ({ x: p.x, z: p.z })),
                    boundarySource: 'explicit-polygon',
                    height:     c.boundary.height,
                    thickness:  c.boundary.thickness,
                    baseOffset: c.boundary.baseOffset,
                    levelId:    targetLevelId,
                    label:      c.label,
                    systemTypeId: c.systemTypeId,
                    layers:     c.layers ? structuredClone(c.layers) : undefined,
                    finishSpec: structuredClone(c.finishSpec),
                    holeElements: c.holeElements?.map((h, hi) => ({
                        ...structuredClone(h),
                        id:        `ch-dup-${this.id}-${li}-${ci}-${hi}`,
                        elementId: `che-dup-${this.id}-${li}-${ci}-${hi}`,
                    })),
                    ...(carried ? { hostReferences: carried } : {}),
                });

                const cv = ceilCmd.canExecute(ctx);
                if (!cv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping ceiling ${c.id}: ${cv.reason}`);
                    continue;
                }
                const cr = ceilCmd.execute(ctx);
                if (cr.success) {
                    createdCeilings.push(newCeilingId);
                    ceilingCmds.push(ceilCmd);
                }
            }

            // ── Columns ───────────────────────────────────────────────────────
            for (let ci = 0; ci < srcColumns.length; ci++) {
                const c      = srcColumns[ci];
                const newColId = `col-dup-${this.id}-${li}-${ci}`;

                const colCmd = new CreateColumnCommand({
                    id:               newColId,
                    position:         { x: c.position.x, y: c.position.y + elevDelta, z: c.position.z },
                    height:           c.height,
                    rotation:         c.rotation,
                    profile:          c.profile,
                    width:            c.width,
                    depth:            c.depth,
                    baseOffset:       c.baseOffset ?? 0,
                    levelId:          targetLevelId,
                    materialId:       c.materialId,
                    materialColor:    c.materialColor,
                    steelProfileName: c.steelProfileName,
                });

                const cv = colCmd.canExecute(ctx);
                if (!cv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping column ${c.id}: ${cv.reason}`);
                    continue;
                }
                const cr = colCmd.execute(ctx);
                if (cr.success) createdColumns.push(newColId);
            }

            // ── Furniture ─────────────────────────────────────────────────────
            for (let fi = 0; fi < srcFurniture.length; fi++) {
                const f      = srcFurniture[fi];
                const newFurId = `fur-dup-${this.id}-${li}-${fi}`;

                const furCmd = new CreateFurnitureCommand({
                    id:           newFurId,
                    furnitureType: f.furnitureType,
                    position:     { x: f.position.x, y: f.position.y + elevDelta, z: f.position.z },
                    rotation:     f.rotation,
                    levelId:      targetLevelId,
                    baseOffset:   f.baseOffset ?? 0,
                    width:        f.width,
                    length:       f.length,
                    height:       f.height,
                    material:     f.material,
                    color:        f.color,
                });

                const fv = furCmd.canExecute(ctx);
                if (!fv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping furniture ${f.id}: ${fv.reason}`);
                    continue;
                }
                const fr = furCmd.execute(ctx);
                if (fr.success) createdFurniture.push(newFurId);
            }
        }

        this._createdWallIds      = createdWalls;
        this._createdSlabIds      = createdSlabs;
        this._createdColumnIds    = createdColumns;
        this._createdFurnitureIds = createdFurniture;
        this._createdFloorIds     = createdFloors;
        this._createdCeilingIds   = createdCeilings;
        this._createdFloorCmds    = floorCmds;
        this._createdCeilingCmds  = ceilingCmds;
        this.targetIds            = this._all();

        const total   = this.targetIds.length;
        const lvlCount = this.payload.targetLevelIds.length;
        // §NO-EMPTY-MEANS-UNKNOWN — "this runtime has no floor store" and "this level
        // has no floors" are printed as different sentences, because they call for
        // different actions from whoever reads the log.
        const finishCensus = (kind: string, src: unknown[] | null) =>
            src === null ? `${kind}: STORE NOT AVAILABLE (none duplicated)` : `${src.length}${kind}`;
        console.log(
            `[DuplicateFloorPlan] Duplicated ${srcWalls.length}W / ` +
            `${srcSlabs.length}Sl / ${finishCensus('Fl', srcFloors)} / ${finishCensus('Ce', srcCeilings)} / ` +
            `${srcColumns.length}Co / ${srcFurniture.length}Fu ` +
            `source elements → ${lvlCount} level(s). Created ${total} new elements.`
        );
        console.log(`[DuplicateFloorPlan] ${formatHostRemapReport('level', this.payload.sourceLevelId, remapTotals, srcWallIdSet)}`);

        const info = [
            `Floor plan duplicated to ${lvlCount} level(s): ` +
            `${createdWalls.length} walls, ${createdSlabs.length} slabs, ` +
            `${createdFloors.length} floor finishes, ${createdCeilings.length} ceilings, ` +
            `${createdColumns.length} columns, ${createdFurniture.length} furniture items created.`,
            `${remapTotals.remapped} host reference(s) rebound to the new level's walls; ` +
            `${remapTotals.degraded} could not be rebound and no longer follow a wall.`,
        ];
        // Stated to the CALLER, not just to devtools — these are the two links this
        // command knowingly does not rebuild (see the class header).
        if (createdFloors.length > 0 || createdCeilings.length > 0) {
            info.push(
                'Duplicated finishes are NOT linked to a room: rooms are not duplicated, ' +
                'so the source room belongs to the source level and re-using it would be a wrong host.',
            );
        }
        if (srcCeilings?.some(c => !!c.hostSlabId)) {
            info.push('Duplicated ceilings carry no hostSlabId — CreateCeilingCommand exposes no channel to set one.');
        }
        if (srcFloors === null || srcCeilings === null) {
            info.push(
                `Finish stores unavailable in this context (${srcFloors === null ? 'floorStore ' : ''}` +
                `${srcCeilings === null ? 'ceilingStore' : ''}`.trim() +
                ') — those families were NOT duplicated. This is an absent capability, not an empty level.',
            );
        }

        return { success: true, affectedElementIds: this.targetIds, info };
    }

    /**
     * §DUP-CARRIES-THE-RELATIONSHIP — rebind ONE finish record's authored host
     * references onto the target level's walls. Shared by the floor and the ceiling
     * arms because C79 §3.4 gives one relationship one edge shape and §7.4 forbids
     * the two families' paths diverging; the only difference between them is the
     * word in the log.
     *
     * Returns `undefined` when there is nothing honest to carry — the record had no
     * sketch (the relationship was never recorded), or the rebind lost an edge. In
     * both cases the finish is still created, with its geometry intact, and the log
     * says plainly that it will not follow a wall. That is C79 §2.3 applied: a
     * finish that states it follows nothing is strictly better than one that claims
     * to follow the storey below.
     */
    private _carryFinishReferences(
        kind: 'floor' | 'ceiling',
        newId: string,
        sketch: { outerLoop: { edges: ReadonlyArray<{ type: string; hostId?: string; fallback?: unknown }> } } | undefined,
        ring: ReadonlyArray<{ x: number; z: number }>,
        sourceBoundingWallIds: ReadonlyArray<string>,
        wallIdMap: ReadonlyMap<string, string>,
        srcWallIdSet: ReadonlySet<string>,
        foldRemap: (r: HostRemapReport) => void,
    ): { sketch: any; boundingWallIds: string[] } | undefined {
        if (!sketch) {
            // §NO-EMPTY-MEANS-UNKNOWN — RELATIONSHIP_NOT_RECORDED on the source. There
            // is nothing to rebind and inventing one by re-tracing is exactly the §2.2
            // after-the-fact geometric query C79 forbids.
            console.warn(
                `[DuplicateFloorPlan] ${kind} "${newId}": the SOURCE ${kind} carries no sketch ` +
                `(relationship never recorded) — the duplicate cannot follow a wall either.`,
            );
            return undefined;
        }

        const remapped = remapHostReferences(
            sketch.outerLoop.edges,
            wallIdMap,
            // Finish sketch coordinates are `{x, z}` (world X-Z), unlike the slab's
            // `{x, y}`. Edge i of the sketch is ring[i] → ring[i+1] by construction
            // (`roomBoundarySketch.ts`), so this is the element's OWN geometry, not a
            // guess.
            (i) => (ring.length >= 3
                ? { start: { x: ring[i % ring.length]!.x, z: ring[i % ring.length]!.z },
                    end:   { x: ring[(i + 1) % ring.length]!.x, z: ring[(i + 1) % ring.length]!.z } }
                : undefined),
            srcWallIdSet,
        );
        foldRemap(remapped.report);

        if (remapped.report.droppedWithoutGeometry > 0 || remapped.edges.length < 3) {
            // `UpdateFloorBoundaryCommand.canExecute` refuses `outerLoopEdges.length < 3`
            // anyway, so writing a short loop would produce a record the follow path can
            // never act on — a relationship on paper only.
            console.warn(
                `[DuplicateFloorPlan] ${formatHostRemapReport(kind, newId, remapped.report, srcWallIdSet)} ` +
                `Sketch NOT carried — this ${kind} will NOT follow any wall.`,
            );
            return undefined;
        }

        if (remapped.report.degraded > 0) {
            console.warn(`[DuplicateFloorPlan] ${formatHostRemapReport(kind, newId, remapped.report, srcWallIdSet)}`);
        }

        // §7.2(a) POPULATE — recomputed from the edges that SURVIVED the rebind, never
        // the source's array translated wholesale. A wall whose edge degraded is not a
        // wall this finish is bounded by any more, and listing it would be a §2.3 wrong
        // host dressed as thoroughness.
        const boundingWallIds = [...new Set(
            remapped.edges
                .filter(e => e.type === 'hostReference' && typeof e.hostId === 'string')
                .map(e => e.hostId as string),
        )];
        void sourceBoundingWallIds;

        return { sketch: { outerLoop: { edges: remapped.edges } }, boundingWallIds };
    }

    undo(ctx: CommandContext): CommandResult {
        // Finishes FIRST, and through their own sub-commands. `CreateFloorCommand`
        // spawned a `ReseatLevelElementsCommand` whose inverse only IT holds, so a
        // store-level removal here would strand every item that finish re-seated.
        // Reverse order mirrors how execute() built them.
        for (let i = this._createdCeilingCmds.length - 1; i >= 0; i--) {
            try { this._createdCeilingCmds[i]!.undo(ctx); } catch (e) {
                console.warn('[DuplicateFloorPlan.undo] ceiling sub-command undo failed:', e);
            }
        }
        for (let i = this._createdFloorCmds.length - 1; i >= 0; i--) {
            try { this._createdFloorCmds[i]!.undo(ctx); } catch (e) {
                console.warn('[DuplicateFloorPlan.undo] floor sub-command undo failed:', e);
            }
        }

        for (const wallId of this._createdWallIds) {
            if (!ctx.stores.wallStore.getById(wallId)) continue;
            const wall = ctx.stores.wallStore.getById(wallId)!;
            for (const childId of wall.childrenIds ?? []) {
                ctx.bimManager.unregisterElement?.(childId);
                elementRegistry.unregister(childId);
            }
            ctx.bimManager.unregisterElement?.(wallId);
            elementRegistry.unregister(wallId);
            ctx.stores.wallStore.remove(wallId);
        }

        for (const slabId of this._createdSlabIds) {
            if (!ctx.stores.slabStore.getById(slabId)) continue;
            ctx.bimManager.unregisterElement?.(slabId);
            elementRegistry.unregister(slabId);
            ctx.stores.slabStore.remove(slabId);
        }

        for (const colId of this._createdColumnIds) {
            if (!ctx.stores.columnStore.get(colId)) continue;
            ctx.bimManager.unregisterElement?.(colId);
            elementRegistry.unregister(colId);
            ctx.stores.columnStore.remove(colId);
        }

        for (const furId of this._createdFurnitureIds) {
            const furStore = (ctx.stores as any).furnitureStore;
            if (!furStore?.getById?.(furId)) continue;
            elementRegistry.unregister(furId);
            furStore.remove(furId);
        }

        return { success: true, affectedElementIds: this._all() };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }

    private _all(): string[] {
        return [
            ...this._createdWallIds,
            ...this._createdSlabIds,
            ...this._createdFloorIds,
            ...this._createdCeilingIds,
            ...this._createdColumnIds,
            ...this._createdFurnitureIds,
        ];
    }
}
