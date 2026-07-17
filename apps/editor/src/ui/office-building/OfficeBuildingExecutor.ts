// Office building — editor executor (the multi-storey circular TOWER builder).
//
// §OFFICE-TOWER-BUILD (founder 2026-06-30: "Build only made one flat disc — I need a
// recognizable office TOWER"). Given the PURE orchestrator result (`OfficeBuildingOk`:
// per-floor descriptors with elevations + the representative circular plate), it emits a
// real multi-storey circular building in ONE batchCoordinator.runBatch (one undo unit):
//
//   (a) TOWER MASSING — one CIRCULAR FLOOR SLAB per storey, stacked at the floor-to-floor
//       height up to the FEASIBLE storey count (Task A), so the 3D view shows a stacked
//       circular tower, not a single disc.
//   (b) PERIMETER SHELL — a segmented wall ring (the n-gon footprint edges as wall
//       segments) around EACH storey's edge, so it reads as a building with a façade
//       (and the Forma white-materials / façade-analysis have a perimeter to paint on).
//   (c) CORE + ZONES on the REPRESENTATIVE floor — the central core (a solid slab) + the
//       concentric desk-zone room-bounding lines (open-plan ring, perimeter offices /
//       collab pods, circulation rings) so the floor plate reads as an office layout in
//       plan.
//
// Chunked / batched: levels are minted first (AddLevelCommand), then ALL slabs + walls +
// zone lines run inside ONE runBatch (skipRedetectRooms) — mirroring the residential
// building executor — so an N-storey emit doesn't freeze the main thread.
//
// P6: every mutation flows through the command bus / commandManager (no direct store
// writes). P2: no THREE here. P8: one OpenTelemetry span at the exported `execute`
// boundary. The pure orchestrator already carries its own spans.

import { trace } from '@opentelemetry/api';
import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
// §OFFICE-PERIMETER-GLAZING — background-tab-resilient deferral. The perimeter wall
// ring lands via the bus (`wall.batch.create`) ASYNC, so the curtain-glazing windows
// are punched in a deferred pass that polls for the host walls to appear in the store,
// mirroring ResidentialBuildingExecutor._finishGroundCommercialWindows.
import { deferWork } from '@pryzm/frame-scheduler';
import { createId } from '@pryzm/schemas';
import {
    AddLevelCommand,
    CreateSlabCommand,
    CreateRoomBoundingLinesBatchCommand,
    CreateWallOpeningsBatchCommand,
    CreateRoofCommand,
    CreateStairCommand,
    CreateVerticalCirculationCommand,
    CreateCurtainWallCommand,
    BatchCreateRoomsCommand,
    CreateFloorCommand,
} from '@pryzm/command-registry';
import { clampOpeningToWall } from '@pryzm/ai-host';
// §OFFICE-CORE-WELLPROPORTIONED — mirror the residential building's PROVEN core + finish pipeline:
// name the shipped rooms via the graph-authoritative RoomData factory (so they carry real names,
// not "Room 00-NNN"), register the stairwell void (so the floor finish is CUT over the open stair),
// and lay a real floor finish. All the SAME commands/mechanisms ResidentialBuildingExecutor uses.
import { roomDataFromGraphSpec, type RoomData } from '@pryzm/room-topology';
import { computeStairFootprintRect } from '@pryzm/geometry-stair';
import { recordStairVoid, getStairVoidsForLevel, resetStairVoids } from '../house-layout/houseStairVoids.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { OfficeBuildingOk, OfficeZone } from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
// §OFFICE-INTERIOR-FITOUT (founder 2026-07-01) — PURE placement math for the core square + lobby.
// (Furniture placement — desks/chairs/meeting/cafe — moved to Command 2 = officeFurnish.ts per the
// §OFFICE-ARCH-FURNISH-SPLIT; this executor now emits ARCHITECTURE ONLY.)
import { coreSquare } from './officeInteriorFitout.js';
// §OFFICE-CORE-SERVICES + §OFFICE-CIRCULATION-FIRST — PURE planning math for the full core
// (vertical circulation + toilets, scaled by floor size) and the circulation-solved-first floor
// architecture (primary circulation → escape routes → support rooms → partitions + glazed offices).
import {
    planOfficeCore,
    planOfficeFloorArchitecture,
    officeFloorArchitectureBoundingLineSegments,
    type OfficeCorePlan,
    type WallSeg,
} from './officeCorePlan.js';
// §OFFICE-ARCH-FURNISH-SPLIT — the seam to Command 2 (Furnish Office). Command 1 (this executor)
// stashes the furnish context here; Command 2 reads it. Optionally furnish inline (preview toggle).
import { setOfficeFurnishContext, type OfficeFurnishContext } from './officeBuildContext.js';
import { furnishOfficeInterior } from './officeFurnish.js';
// §FIX-OFFICE-ENVELOPE-NOT-DISPOSED (L-321) — after the detailed tower lands, pin the 3D view to
// full detail so the massing-LOD "grey envelope" (LevelScoped3DCullingService auto-escalates a tall
// heavy model to 'massing') is turned OFF and the detailed floors are the only geometry shown.
import { showOfficeFullDetail } from './officeShowFullDetail.js';
import { beginBuildingGeneration } from '../generation/buildingGenerationLifecycle.js';
// §FIX-OFFICE-MISSING-PER-STOREY-SLABS (L-322) — a visible full-disc FLOOR PLATE on every storey the
// detailed per-room finish pass does not cover, so the tower is not a hollow glass shell. PURE spec math.
import { buildStoreyFloorPlates } from './officeStoreyFloors.js';
// ── §OFFICE-PERIMETER-GLAZING (founder 2026-06-30) — curtain glazing per segment ──────
//
// The founder's rule: the circular office tower reads as a GLASS CURTAIN-WALL tower —
// EVERY perimeter wall segment on EVERY storey gets ONE window that fills almost the FULL
// WIDTH of the segment (a small masonry jamb at each end so it never overruns the corner)
// and almost the FULL HEIGHT (sill near the floor, head near the slab soffit). We host a
// real PUNCHED WINDOW (a C15 hosted opening, type 'window') in each segment rather than a
// curtain-wall element — see the ADR-0092 §OFFICE-PERIMETER-GLAZING amendment for the
// rationale. A commercial glazing system type makes it render as real see-through glass so
// the Forma white-materials / façade-analysis classify it as GLASS. The PURE placement math
// lives in `officePerimeterGlazing.ts` (DOM-free) so it is unit-testable in plain Node.
import {
    perimeterGlazingSpec,
    isFinitePlanPt,
    ringPlanSegments,
    resampleRing,
    GLAZING_SYSTEM_TYPE_ID,
} from './officePerimeterGlazing.js';

const _tracer = trace.getTracer('@pryzm/editor', '0.1.0');
const DEFAULT_SLAB_THICKNESS_M = 0.2;
const PERIMETER_WALL_THICKNESS_M = 0.2;
// §OFFICE-INTERIOR-FITOUT — core enclosure wall gauge (RC shaft) + roof cap thickness.
const CORE_WALL_THICKNESS_M = 0.2;
const ROOF_THICKNESS_M = 0.25;
// §OFFICE-CIRCULATION-FIRST — internal partition + glazed-enclosure wall gauge (lighter than the RC
// shell/core), so the internal office subdivisions read as partitions, not structure.
const PARTITION_WALL_THICKNESS_M = 0.12;
// §OFFICE-CORE-SERVICES — switchback-stair riser/tread constants (mirror the resi executor's band).
const STAIR_RISER_TARGET_M = 0.18;
const STAIR_RISER_MIN_M = 0.15;
const STAIR_RISER_MAX_M = 0.19;
const STAIR_TREAD_M = 0.27;
/** Cap the DETAILED (fully-serviced + furnishable) floors so a tall tower doesn't freeze — the
 *  ground + the representative office floor get the core services + circulation-first layout; the
 *  rest stay shell massing (perimeter + glazing + core walls + slab). */
const MAX_FITOUT_DESKS = 60;

/** One curtain-glazing window spec hosted in a perimeter wall segment. */
interface PerimeterGlazingSpec {
    readonly wallId: string;
    readonly levelId: string;
    readonly offset: number;     // m along the wall from its start
    readonly width: number;      // m (≈ segment − 2·jamb)
    readonly sillHeight: number; // m above the floor
    readonly height: number;     // m (≈ floor-to-floor − header − sill)
}

interface CommandManagerLike {
    execute?: (cmd: unknown, ctx?: { source?: string }) => { success?: boolean } | undefined;
}
function getCommandManager(): CommandManagerLike | undefined {
    return (window as unknown as { commandManager?: CommandManagerLike }).commandManager;
}

interface Pt2 { readonly x: number; readonly z: number }

interface BoundingLineItem {
    id: string;
    levelId: string;
    start: { x: number; z: number };
    end: { x: number; z: number };
}

/** A pre-minted perimeter-wall ring payload for one storey (one wall per n-gon edge). */
interface WallRingPayload {
    readonly walls: ReadonlyArray<Record<string, unknown>>;
    readonly levelId: string;
}

/** A perimeter-wall ring + the per-segment geometry the glazing pass needs (host wall
 *  id + segment length) so each segment can host a near-full curtain window. */
interface WallRing {
    readonly payload: WallRingPayload;
    readonly segments: ReadonlyArray<{ readonly wallId: string; readonly lengthM: number }>;
}

/** Convert one zone's outer (and optional inner) polygon into closed bounding-line
 *  segments on `levelId`. The executor draws the ring outlines so room detection reads the
 *  concentric office zones. The endpoint validation lives in the pure `ringPlanSegments`
 *  (§RBL-PLACEMENT-AT-SOURCE) so it is unit-testable; this only stamps ids + levelId. */
function zoneBoundingLines(zone: OfficeZone, levelId: string): BoundingLineItem[] {
    const items: BoundingLineItem[] = [];
    const ring = (poly: readonly Pt2[]): void => {
        for (const seg of ringPlanSegments(poly)) {
            items.push({ id: `office-rbl-${createId('annotation')}`, levelId, start: seg.start, end: seg.end });
        }
    };
    ring(zone.outerPolygon);
    if (zone.innerPolygon && zone.innerPolygon.length >= 3) ring(zone.innerPolygon);
    return items;
}

/** §OFFICE-TOWER-BUILD — a perimeter wall ring from an n-gon footprint: one wall per
 *  edge (consecutive edges share the exact corner endpoint, so the ring closes). Also
 *  returns the per-segment geometry (host wall id + length) so §OFFICE-PERIMETER-GLAZING
 *  can host a near-full curtain window in each segment. A degenerate / non-finite edge is
 *  skipped (no wall, no segment) so a bad vertex never mints a zero-length wall. */
function buildPerimeterRing(footprint: readonly Pt2[], levelId: string, heightM: number, facadeColor?: string): WallRing {
    const walls: Array<Record<string, unknown>> = [];
    const segments: Array<{ wallId: string; lengthM: number }> = [];
    for (let i = 0; i < footprint.length; i++) {
        const a = footprint[i];
        const b = footprint[(i + 1) % footprint.length];
        if (!isFinitePlanPt(a) || !isFinitePlanPt(b)) continue;
        const lengthM = Math.hypot(b.x - a.x, b.z - a.z);
        if (lengthM < 0.05) continue;              // degenerate edge — skip
        const wallId = createId('wall');
        walls.push({
            id: wallId,
            levelId,
            baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
            height: heightM,
            thickness: PERIMETER_WALL_THICKNESS_M,
            // §OFFICE-FACADE-GLASS-COLOUR — paint the opaque façade the chosen finish colour (absent
            // ⇒ the wall keeps its default white finish).
            ...(facadeColor ? { materialColor: facadeColor } : {}),
        });
        segments.push({ wallId, lengthM });
    }
    return { payload: { walls, levelId }, segments };
}

export class OfficeBuildingExecutor {
    /**
     * §OFFICE-ARCH-FURNISH-SPLIT — Command 1: build the multi-storey circular office ARCHITECTURE
     * from the orchestrator result. Emits ARCHITECTURE ONLY (façade/glazing · external + internal
     * partition walls · roof · doors · windows · structural core · lift shafts · staircases ·
     * toilets · accessible toilets · kitchenette + support/plant/storage rooms · circulation
     * corridors + glazed office enclosures). NO loose furniture — that is Command 2 (Furnish Office).
     *
     * When `opts.withInterior` is true (the preview toggle's "Architecture + Interior"), the
     * furnish pass runs AFTER the architecture in the same build. Never throws. P8: one span.
     */
    async execute(
        runtime: PryzmRuntime,
        result: OfficeBuildingOk,
        opts?: { withInterior?: boolean; facadeColor?: string; glassColor?: string; innerWallColor?: string },
    ): Promise<void> {
        return _tracer.startActiveSpan('pryzm.editor.officeBuilding.execute', async (span) => {
            try {
                const built = await this._execute(runtime, result, opts);
                span.setAttribute('pryzm.office.execute.stories', built.storeyCount);
                span.setAttribute('pryzm.office.execute.slabs', built.slabCount);
                span.setAttribute('pryzm.office.execute.walls', built.wallCount);
                span.setAttribute('pryzm.office.execute.stairs', built.stairCount);
                span.setAttribute('pryzm.office.execute.lifts', built.liftCount);
                span.setAttribute('pryzm.office.execute.withInterior', opts?.withInterior === true);
                span.setAttribute('pryzm.office.execute.desks', result.representativePlate.analytics.deskCount);
                span.end();
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                console.error('[office-building] execute failed:', err);
            }
        });
    }

    private async _execute(
        runtime: PryzmRuntime,
        result: OfficeBuildingOk,
        opts?: { withInterior?: boolean; facadeColor?: string; glassColor?: string; innerWallColor?: string },
    ): Promise<{ storeyCount: number; slabCount: number; wallCount: number; stairCount: number; liftCount: number }> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };
        // §OFFICE-FACADE-GLASS-COLOUR — validate the façade + glass colours to a #rrggbb hex. An
        // invalid/absent façade colour ⇒ undefined (the all-white default look, mirroring
        // ResidentialBuildingExecutor). Glass defaults to a light blue tint so the tower keeps its
        // current glazed reading when absent.
        const hex = /^#[0-9a-fA-F]{6}$/;
        const facadeColor = (typeof opts?.facadeColor === 'string' && hex.test(opts.facadeColor)) ? opts.facadeColor : undefined;
        const glassColor = (typeof opts?.glassColor === 'string' && hex.test(opts.glassColor)) ? opts.glassColor : undefined;
        // §OFFICE-INNER-WALL-COLOUR (founder 2026-07-01: "add an INNER-WALL colour — interior
        // partitions can differ from the façade"). Painted on the INTERNAL partition walls + the
        // core/toilet partition walls (the RC shell + roof keep the façade colour, glazing the glass
        // colour). Absent ⇒ undefined ⇒ the partitions keep the current default look.
        const innerWallColor = (typeof opts?.innerWallColor === 'string' && hex.test(opts.innerWallColor)) ? opts.innerWallColor : undefined;
        const cm = getCommandManager();
        if (!cm?.execute) {
            console.warn('[office-building] commandManager unavailable — nothing built.');
            toast('Office building: editor not ready.', 'warn');
            return { storeyCount: 0, slabCount: 0, wallCount: 0, stairCount: 0, liftCount: 0 };
        }
        const ground = resolveActiveLevel();
        if (!ground?.id) {
            toast('No active level — draw a boundary first.', 'error');
            return { storeyCount: 0, slabCount: 0, wallCount: 0, stairCount: 0, liftCount: 0 };
        }
        // §OFFICE-CORE-WELLPROPORTIONED — clear the stairwell-void registry at the START of each
        // build so a re-generate never cuts the finish over a stale void (mirrors resetStairVoids()
        // in ResidentialBuildingExecutor / HouseLayoutExecutor).
        resetStairVoids();

        const plate = result.representativePlate;
        // The circular footprint (outermost ring = the full disc n-gon).
        const discFull = plate.zones[plate.zones.length - 1]!.outerPolygon as readonly Pt2[];
        if (discFull.length < 3) {
            toast('Office building: degenerate plate — nothing built.', 'warn');
            return { storeyCount: 0, slabCount: 0, wallCount: 0, stairCount: 0, liftCount: 0 };
        }
        // §OFFICE-PERIMETER-COARSEN (founder 2026-06-30: "too many elements — stuck on creation")
        // — the orchestrator's circular footprint is a fine ≈64-gon → ≈2560 perimeter walls +
        // windows at 40 storeys (the dominant creation cost). Resample the perimeter DOWN to a
        // ≤24-gon (still visually round at building scale) for BOTH the slab outline AND the
        // wall/window ring, so they stay aligned and the per-storey element count drops ~3×.
        // The analytics / feasibility / radius are untouched (this is an emission-only decimation).
        const disc = resampleRing(discFull) as readonly Pt2[];
        if (disc.length < 3) {
            toast('Office building: degenerate plate — nothing built.', 'warn');
            return { storeyCount: 0, slabCount: 0, wallCount: 0, stairCount: 0, liftCount: 0 };
        }

        // §OFFICE-TOWER-BUILD — build EVERY feasible storey (Task A already clamped the
        // count). Ground reuses the active level; storeys 1…N-1 are minted above it at the
        // floor-to-floor cascade, so the tower stacks instead of collapsing to one disc.
        const floorToFloorM = result.floorToFloorM > 0 ? result.floorToFloorM : 4.0;
        const baseElevationM = ground.elevation ?? 0;
        const storeyCount = Math.max(1, result.floors.length);
        // The representative-floor index (the orchestrator's archetype is floorIndex 1, an
        // open-plan office floor) — carries the core + desk-zone plan. Falls back to 0.
        const repIndex = result.floors.findIndex((f) => f.hasOfficePlate);
        const representativeFloorIndex = repIndex >= 0 ? repIndex : 0;

        // ── Mint one editor level per storey (ground reuses the active level). ──────────
        const levelIdByIndex = new Map<number, string>();
        levelIdByIndex.set(0, ground.id);
        const stamp = Date.now();
        for (let i = 1; i < storeyCount; i++) {
            const levelId = `L-office-${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}`;
            const elevation = baseElevationM + i * floorToFloorM;
            const name = `Level ${i.toString().padStart(2, '0')}`;
            const res = cm.execute?.(
                new AddLevelCommand({ levelId, name, elevation, height: floorToFloorM }),
                { source: 'OFFICE_PIPELINE_LEVEL' },
            );
            if (!res?.success) {
                // Degrade gracefully: stop minting but still build what we have.
                console.warn('[office-building] AddLevelCommand failed at storey', i, '— building shorter tower');
                break;
            }
            levelIdByIndex.set(i, levelId);
        }
        const levelIds = [...levelIdByIndex.values()];

        // Bounding box of the disc (slabs are sized by bbox + carry the exact polygon).
        const xs = disc.map((p) => p.x), zs = disc.map((p) => p.z);
        const discWidth = Math.max(...xs) - Math.min(...xs);
        const discDepth = Math.max(...zs) - Math.min(...zs);

        // Core disc (solid slab) on the representative floor.
        const coreZone = plate.zones.find((z) => z.kind === 'core');
        const coreDisc = (coreZone?.outerPolygon ?? []) as readonly Pt2[];

        // Representative-floor zone outlines as room-bounding lines (the plan layout).
        const boundaryItems: BoundingLineItem[] = [];
        // §OFFICE-PERIMETER-GLAZING — one near-full curtain window per perimeter segment on
        // EVERY storey. Collected here (host wall id known at emit time) and punched in a
        // deferred pass once the perimeter walls land (the bus wall.batch.create is async).
        const glazingSpecs: PerimeterGlazingSpec[] = [];

        // ── §OFFICE-INTERIOR-FITOUT (founder 2026-07-01) — the missing INSIDE of the tower. ──
        // Ground (0), the representative office floor, and the top storey are the DETAILED floors
        // (a believable few, not all 40 — performance-aware per the founder's scope). Everything
        // collected here lands in the ONE structural batch (walls/roof) + deferred passes (door
        // openings + furniture + lights + finishes), mirroring the residential executor.
        const groundLevelId = levelIdByIndex.get(0)!;
        // Level minting can break early (degrade to a shorter tower), so the TOP detailed floor is
        // the HIGHEST index that actually minted, not blindly storeyCount−1.
        const mintedIndices = [...levelIdByIndex.keys()].sort((a, b) => a - b);
        const topStoreyIndex = mintedIndices[mintedIndices.length - 1] ?? 0;
        const topLevelId = levelIdByIndex.get(topStoreyIndex)!;
        const repLevelId = levelIdByIndex.get(representativeFloorIndex) ?? groundLevelId;
        // Plate radius (the disc is origin-centred) drives every ring placement below.
        const discRadiusM = Math.max(...disc.map((p) => Math.hypot(p.x, p.z)));
        const coreRadiusM = plate.coreRadiusM;
        // §OFFICE-ENTRANCE — pick an entrance direction (+X) on the ground perimeter. The nearest
        // perimeter wall segment to this heading hosts the double front door; the lobby faces it.
        const entranceAngle = 0;
        // §OFFICE-CORE-WALLS — a square RC enclosure inscribed in the circular core, with one
        // door onto the open-plan lobby. Built on EVERY storey (the shaft is continuous); the
        // door is punched deferred once the walls land. `core` may be null on a tiny plate.
        const core = coreSquare(coreRadiusM);
        // Core-wall payloads (per storey) + the deferred fire-door specs (host wall known at emit).
        const coreWallPayloads: Array<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }> = [];
        interface CoreDoorSpec { wallId: string; offset: number; width: number; levelId: string }
        const coreDoorSpecs: CoreDoorSpec[] = [];
        // §OFFICE-ENTRANCE — the ground perimeter wall ring (host for the entrance door). Captured
        // from the ground storey's ring so the deferred entrance pass can host the door.
        let groundRing: WallRing | undefined;

        // §GEN-CONTINUOUS-OVERLAY + §AUTO-WEBGL-HEAVY-PROACTIVE (L-367) — the tower build
        // truly begins here (levels minted; the first HEAVY structural sub-batch is about
        // to render). Fire the proactive WebGPU→WebGL swap BEFORE it (a 40-storey tower is
        // the worst WebGPU heavy-scene case) and open ONE continuous overlay held across
        // every architecture + fit-out + furnish sub-batch (released on batch-idle settle).
        beginBuildingGeneration('office-building', { title: 'Generating your building', label: 'Building structure…' });

        let slabCount = 0, wallCount = 0;
        try {
            batchCoordinator.runBatch(() => {
                for (const [index, levelId] of levelIdByIndex) {
                    // (a) Circular floor slab for this storey.
                    cm.execute?.(new CreateSlabCommand({
                        id: createId('slab'),
                        ifcGuid: createId('slab'),
                        width: Math.max(discWidth, 0.1),
                        depth: Math.max(discDepth, 0.1),
                        thickness: DEFAULT_SLAB_THICKNESS_M,
                        position: { x: 0, y: 0, z: 0 },
                        levelId,
                        polygon: disc.map((p) => ({ x: p.x, y: p.z })),
                    }), { source: 'OFFICE_PIPELINE_SLAB' });
                    slabCount++;

                    // (b) Perimeter wall ring (segmented n-gon façade) for this storey — ONE
                    //     batched wall.batch.create (NOT per-segment wall.create), so room
                    //     re-detection is suppressed by the surrounding skipRedetectRooms batch
                    //     instead of firing once per segment.
                    const ring = buildPerimeterRing(disc, levelId, floorToFloorM, facadeColor);
                    this._dispatchWallBatch(runtime, ring.payload, `perimeter-L${index}`);
                    wallCount += ring.payload.walls.length;
                    // §OFFICE-ENTRANCE — remember the GROUND ring so the deferred entrance pass can
                    // host the front door on the perimeter segment nearest the entrance heading.
                    if (index === 0) groundRing = ring;
                    // §OFFICE-PERIMETER-GLAZING — a near-full-width / near-full-height window per
                    // segment (skip segments too short to host a sensible pane).
                    for (const seg of ring.segments) {
                        const g = perimeterGlazingSpec(seg.lengthM, floorToFloorM);
                        if (!g) continue;
                        glazingSpecs.push({ wallId: seg.wallId, levelId, offset: g.offset, width: g.width, sillHeight: g.sillHeight, height: g.height });
                    }

                    // §OFFICE-CORE-WALLS (founder 2026-07-01: "the central core as real enclosing
                    // WALLS, not just a slab") — a square RC enclosure inscribed in the circular core,
                    // on EVERY storey (the shaft is continuous), with ONE fire/lobby door on the +X
                    // edge (punched deferred once the walls land). Mirrors ResidentialBuildingExecutor
                    // ._buildCorePerimeter (one wall per edge, shared corners, one door spec).
                    if (core) {
                        // §OFFICE-CORE-WALL-INNER-COLOUR (founder 2026-07-01) — the RC core enclosure
                        // (stair/lift/WC shaft) is an INTERIOR partition, so it reads the INNER-WALL
                        // colour, NOT the façade colour. Only the EXTERNAL shell + roof take the façade
                        // colour; the glazing takes the glass colour.
                        const cw = this._buildCoreWalls(core.corners, core.doorEdgeIndex, levelId, floorToFloorM, innerWallColor);
                        if (cw.payload.walls.length > 0) {
                            this._dispatchWallBatch(runtime, cw.payload, `core-L${index}`);
                            coreWallPayloads.push(cw.payload);
                            coreDoorSpecs.push(...cw.doors);
                            wallCount += cw.payload.walls.length;
                        }
                    }

                    // (c) On the representative floor: core slab + concentric zone plan lines.
                    if (index === representativeFloorIndex) {
                        if (coreDisc.length >= 3) {
                            const cxs = coreDisc.map((p) => p.x), czs = coreDisc.map((p) => p.z);
                            cm.execute?.(new CreateSlabCommand({
                                id: createId('slab'),
                                ifcGuid: createId('slab'),
                                width: Math.max(Math.max(...cxs) - Math.min(...cxs), 0.1),
                                depth: Math.max(Math.max(...czs) - Math.min(...czs), 0.1),
                                thickness: DEFAULT_SLAB_THICKNESS_M,
                                // Raise the core slab a touch so it reads as the core mass, not the floor.
                                position: { x: 0, y: 0.01, z: 0 },
                                levelId,
                                polygon: coreDisc.map((p) => ({ x: p.x, y: p.z })),
                            }), { source: 'OFFICE_PIPELINE_CORE' });
                            slabCount++;
                        }
                        for (const zone of plate.zones) boundaryItems.push(...zoneBoundingLines(zone, levelId));
                    }
                }

                // §OFFICE-ROOF-CAP (founder 2026-07-01: "roof=0 today — cap the top level") — a flat
                // roof slab over the disc on the TOP storey's wall head. Mirrors Residential
                // BuildingExecutor._createRoof: a flat slab extrudes DOWN from its origin, so
                // baseOffset = thickness lifts the slab bottom to rest ON the top-storey wall head.
                this._createRoof(cm, disc, topLevelId, floorToFloorM, facadeColor);

                // Concentric zone outlines (the representative floor's office plan).
                if (boundaryItems.length > 0) {
                    cm.execute?.(new CreateRoomBoundingLinesBatchCommand(boundaryItems));
                }
            }, {
                levelIds: [...new Set(levelIds)],
                totalElementCount: slabCount + wallCount + boundaryItems.length + 1,
                skipRedetectRooms: true,
                // §OFFICE-PERF (founder 2026-06-30) — the office tower is a big repeated-geometry
                // batch (N-gon × storeys slabs/walls) that does NOT need the cosmetic PBR envMap
                // upgrade; skipping it avoids the per-pass compile cost the engine warns about
                // (§FIX-POST-GEOMETRY-COMPILE-V2 "consider setting skipPbrUpgrade=true").
                skipPbrUpgrade: true,
            });
        } catch (e) {
            console.warn('[office-building] tower batch failed (skipped):', e);
        }

        // §OFFICE-PERIMETER-GLAZING — punch the per-segment curtain windows on the (now
        // landing) perimeter walls. Deferred + polled: the bus wall.batch.create is async,
        // so wait for the host walls to appear in the store, then punch all windows in ONE
        // batch (skipRedetectRooms — façade glazing doesn't change room topology).
        this._finishPerimeterGlazing(glazingSpecs, glassColor);

        // §OFFICE-CORE-WALLS — punch the single fire/lobby door per storey on the (now landing)
        // core walls, then mitre the core corners so the shaft reads clean. Deferred + polled.
        this._finishCoreDoors(coreDoorSpecs);
        this._mitreCorners([...coreWallPayloads]);

        // §OFFICE-ENTRANCE — the ground-floor double front door on the perimeter segment nearest
        // the entrance heading (deferred once the ground ring lands).
        if (groundRing) this._finishEntranceDoor(groundRing, entranceAngle, groundLevelId, floorToFloorM);

        // §OFFICE-CORE-SERVICES (SPEC §3 — never generate empty cores) — the FULL core: main
        // switchback stair + fire-escape stair + lift shaft(s) + fire-rated lobby, PLUS a toilet +
        // service block (male · female · accessible WC · cleaning closet · service shaft) whose
        // cubicle counts SCALE with floor size.
        // §OFFICE-CORE-REAL-CIRCULATION (founder 2026-07-01: "we need the REAL stair (check the
        // residential building) placed in the core + a real vertical-circulation LIFT ground→top") —
        // mirror ResidentialBuildingExecutor._createCore: emit a REAL switchback stair + a fire-escape
        // stair per ADJACENT minted-level pair (ground→1, 1→2, … so vertical circulation is CONTINUOUS
        // to roof access, not a decorative one-storey stub on 2 floors), and ONE lift cab per level
        // spanning ground→top. The toilet/lobby/corridor plan (room-lines + partitions) stays on the
        // first detailed floor (one plan floor is enough — the shaft repeats on every storey).
        const corePlan = planOfficeCore(coreRadiusM, plate.analytics.grossFloorAreaM2, plate.analytics.usableAreaM2);
        const detailedIndices = [...new Set([0, representativeFloorIndex])].filter((i) => levelIdByIndex.has(i));
        let stairCount = 0, liftCount = 0;
        if (corePlan) {
            // §OFFICE-INNER-WALL-COLOUR — the toilet/service partitions read the INNER-WALL colour.
            const svc = this._buildCoreServices(cm, corePlan, detailedIndices, levelIdByIndex, floorToFloorM, baseElevationM, innerWallColor);
            stairCount = svc.stairs; liftCount = svc.lifts;
        } else {
            console.log('[office-building] §OFFICE-CORE-SERVICES — core too small for a service plan; kept as shell core.');
        }

        // §OFFICE-CIRCULATION-FIRST (SPEC §4/§9 steps 3–5 — solve circulation BEFORE rooms) — on the
        // representative office floor, define primary circulation + escape routes FIRST, then support
        // rooms (meeting/kitchenette/storage/plant), then internal partitions + glazed office
        // enclosures. All deferred + suppressed so it never triggers the room-redetect storm.
        const floorArch = planOfficeFloorArchitecture({
            discR: discRadiusM,
            coreR: coreRadiusM,
            innerCircOuterR: this._zoneRadius(plate, 'inner-circulation'),
            openPlanOuterR: this._zoneRadius(plate, 'open-plan'),
            perimMidR: this._zoneMidRadius(plate, 'perimeter-office', 'open-plan'),
        });
        // §OFFICE-INNER-WALL-COLOUR — internal office partitions read the inner-wall colour; the
        // glazed enclosures keep the glass colour.
        this._buildFloorArchitecture(cm, floorArch, repLevelId, floorToFloorM, innerWallColor, glassColor);

        // §OFFICE-CORE-WELLPROPORTIONED — name the shipped rooms (so they carry real names, not
        // "Room 00-NNN") + lay the floor finishes (cut over the open stairwell), mirroring the
        // residential building's graph-authoritative room + CreateFloorCommand finish passes.
        this._nameAndFinishFloors(cm, corePlan, floorArch, detailedIndices, levelIdByIndex, floorToFloorM, discRadiusM, coreRadiusM, facadeColor);

        // §FIX-OFFICE-MISSING-PER-STOREY-SLABS (L-322) — the tower read as a HOLLOW glass shell because
        // a visible FINISHED floor was laid on ONLY the first detailed storey (`_nameAndFinishFloors`);
        // every other storey had just the bare structural slab, which doesn't read as a floor through
        // the curtain wall. Lay a full-disc FLOOR PLATE on every OTHER storey via the same proven
        // `CreateFloorCommand` path (mirrors the residential building's per-level public-floor finish),
        // cut over each storey's open-stair voids. Deferred so the structural slabs/walls have settled.
        this._finishStoreyFloors(cm, disc, levelIdByIndex, detailedIndices);

        // §OFFICE-ARCH-FURNISH-SPLIT — stash the furnish context so Command 2 (Furnish Office) can
        // populate THIS architecture without regenerating it (SPEC §1). No furniture is emitted here.
        // Phase 2: the enriched context carries the circulation-first architecture (§4/§9) — the
        // circulation keep-outs + escape spokes + support/glazed rooms — so the modular Furnish Office
        // engine (SPEC §5/§6/§7/§8/§9-8) can place occupancy-scaled modules clear of circulation.
        const primary = floorArch.circulation.find((c) => c.kind === 'primary');
        const secondary = floorArch.circulation.find((c) => c.kind === 'secondary');
        // The circulation-first planner lays 4 axial escape spokes (N/E/S/W); mirror those headings.
        const escapeAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
        // Map the support rooms + glazed enclosures to furnish-room hosts (glazed labels → glazed kinds).
        const rooms: OfficeFurnishContext['rooms'] = [
            ...floorArch.supportRooms.map((r) => ({ kind: r.kind, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 })),
            ...floorArch.glazedEnclosures.map((enc) => {
                const xs = enc.corners.map((c) => c.x), zs = enc.corners.map((c) => c.z);
                const label = enc.label.toLowerCase();
                const kind: OfficeFurnishContext['rooms'][number]['kind'] =
                    label.includes('exec') ? 'glazed-exec'
                    : label.includes('interview') ? 'glazed-interview'
                    : 'glazed-focus';
                return { kind, x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
            }),
        ];
        const furnishCtx: OfficeFurnishContext = {
            repLevelId, groundLevelId, discRadiusM, coreRadiusM,
            openPlanInnerR: this._zoneRadius(plate, 'inner-circulation'),
            openPlanOuterR: this._zoneRadius(plate, 'open-plan'),
            perimMidR: this._zoneMidRadius(plate, 'perimeter-office', 'open-plan'),
            deskCount: Math.min(MAX_FITOUT_DESKS, plate.analytics.deskCount),
            entranceAngle,
            usableAreaM2: plate.analytics.usableAreaM2,
            primaryCorridor: primary ? { innerR: primary.innerR, outerR: primary.outerR } : { innerR: coreRadiusM, outerR: coreRadiusM },
            secondaryCorridor: secondary ? { innerR: secondary.innerR, outerR: secondary.outerR } : { innerR: discRadiusM, outerR: discRadiusM },
            escapeAngles,
            rooms,
        };
        setOfficeFurnishContext(furnishCtx);

        // §OFFICE-ARCH-FURNISH-SPLIT preview toggle — "Architecture + Interior" runs Command 2's
        // furnish pass in the same build (architecture first, then furnish). Default is architecture-
        // only (the furnish runs later via `pryzmFurnishOffice()` / the AI "Furnish Office" command).
        if (opts?.withInterior === true) {
            furnishOfficeInterior(furnishCtx);
        }

        console.log(
            `[office-building] §OFFICE-ARCH-FURNISH-SPLIT built ${storeyCount}-storey circular tower ARCHITECTURE — ` +
            `${slabCount} slab(s), ${wallCount} wall segment(s) ` +
            `(${coreWallPayloads.length} core-wall ring(s)) ` +
            `(§OFFICE-PERIMETER-COARSEN: ${disc.length}-gon vs ${discFull.length}-gon footprint), ` +
            `${glazingSpecs.length} curtain glazing window(s), 1 roof cap, ` +
            `${coreDoorSpecs.length} core door(s), ${groundRing ? 1 : 0} entrance door, ` +
            `§OFFICE-CORE-SERVICES: ${stairCount} stair(s) + ${liftCount} lift(s) + ` +
            `${corePlan ? corePlan.toiletRooms.length : 0} toilet/service room(s) ` +
            `(${corePlan ? corePlan.cubiclesPerGender : 0} cubicles/gender, ${corePlan ? corePlan.band : 'n/a'} floor), ` +
            `§OFFICE-CIRCULATION-FIRST: ${floorArch.circulation.length} circulation ring(s) + ` +
            `${floorArch.supportRooms.length} support room(s) + ${floorArch.glazedEnclosures.length} glazed office(s) ` +
            `[${floorArch.diagnostic}], ${boundaryItems.length} zone line(s). ${result.diagnostic}`,
        );
        toast(
            `Office architecture built — ${storeyCount} storeys, core (${stairCount} stairs + ${liftCount} lifts + WCs), ` +
            `circulation-first floor. Run "Furnish Office" to add furniture.`,
            'success',
        );

        // §FIX-OFFICE-ENVELOPE-NOT-DISPOSED (L-321) — the founder's "solid grey envelope over the
        // tower" is the §FIX-HEAVY-SCENE-MASSING-LOD massing LOD: a ≥15-storey / ≥1000-element tower
        // AUTO-ESCALATES to 'massing', so every out-of-scope storey renders as an opaque grey block
        // and only the active level ±1 stay detailed (the top storey the last AddLevelCommand
        // activated — exactly the founder's screenshot). It is NOT an undisposed generator element:
        // this executor emits only real geometry; resi/house never show it because they are low-rise
        // (below the threshold), so there is nothing for them to "dispose". The office is just the one
        // typology tall + heavy enough to trip it. The user generated a DETAILED building to SEE it, so
        // pin the 3D view to full detail (reversible via the "3D detail" control).
        showOfficeFullDetail();

        return { storeyCount, slabCount, wallCount, stairCount, liftCount };
    }

    /** Dispatch a wall.batch.create through the bus, swallowing async rejection
     *  (mirrors ResidentialBuildingExecutor._dispatchWallBatch). */
    private _dispatchWallBatch(runtime: PryzmRuntime, payload: WallRingPayload, tag: string): void {
        try {
            const r = runtime.bus.executeCommand('wall.batch.create', payload) as unknown;
            if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                (r as Promise<unknown>).catch((e: unknown) => console.warn(`[office-building] wall.batch.create (${tag}) failed on`, payload.levelId, e));
            }
        } catch (e) {
            console.warn(`[office-building] wall.batch.create (${tag}) threw on`, payload.levelId, e);
        }
    }

    /** §OFFICE-PERIMETER-GLAZING — punch one near-full curtain WINDOW into each perimeter
     *  wall segment, on every storey, once the host walls have landed. Mirrors
     *  ResidentialBuildingExecutor._finishGroundCommercialWindows: the perimeter
     *  wall.batch.create is ASYNC via the bus, so poll (≤6 s) for every host wall to appear
     *  in the store, clamp each window to the STORED wall length (never overrun the corner),
     *  then punch ALL windows in ONE batch (type 'window', commercial glazing systemTypeId so
     *  it renders as real see-through GLASS for the Forma white-materials pass). A segment
     *  whose host wall can't fit a minimal pane is DROPPED (degrades gracefully). The
     *  window goes through the command bus (CreateWallOpeningsBatchCommand) as a HOSTED C15
     *  opening — no new mutation path (P6/C11). Never throws. */
    private _finishPerimeterGlazing(specs: ReadonlyArray<PerimeterGlazingSpec>, glassColor?: string): void {
        if (specs.length === 0) return;
        const cm = getCommandManager();
        if (!cm?.execute) { console.warn('[office-building] commandManager unavailable — perimeter glazing skipped'); return; }
        const wallIds = specs.map((s) => s.wallId);
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const ready = (): boolean => !wallStore?.getById ? true : wallIds.every((id) => wallStore.getById!(id) != null);
        const levelIds = [...new Set(specs.map((s) => s.levelId))];
        const tryPunch = (n: number): void => {
            if (!ready() && n > 0) { deferWork(() => tryPunch(n - 1), 150); return; }
            try {
                // Clamp each window to its STORED host-wall length BEFORE emit, so a pane never
                // overruns the committed wall (the occupancy validator rejects an OOB opening).
                const items = specs
                    .map((s) => {
                        const c = this._clampGlazingToStoredWall(s.wallId, s.offset, s.width);
                        return c ? { s, offset: c.offset, width: c.width } : null;
                    })
                    .filter((it): it is { s: PerimeterGlazingSpec; offset: number; width: number } => it !== null);
                if (items.length === 0) { console.warn('[office-building] perimeter glazing — all dropped (no host wall could fit a pane)'); return; }
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand(items.map(({ s, offset, width }) => ({
                        wallId: s.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'window',
                            // §A.21.D12 — the rich window fields on the OPENING drive the WindowBuilder
                            // frame + glazing (CreateWallOpeningCommand reads them into windowStore).
                            windowType: 'single',
                            offset,
                            width,
                            height: s.height,
                            sillHeight: s.sillHeight,
                            elementId: createId('window'),
                            // Commercial anodised-aluminium glazing (low glassOpacity ⇒ transmissive)
                            // so the façade reads as a real glass curtain wall + Forma classifies it
                            // as GLASS, not opaque white.
                            systemTypeId: GLAZING_SYSTEM_TYPE_ID,
                            // §OFFICE-FACADE-GLASS-COLOUR — carry the chosen glass tint on the opening
                            // (forward-compatible: the WindowBuilder reads a glazing tint where set).
                            ...(glassColor ? { glazingColor: glassColor, glassColor } : {}),
                        },
                    }))), { source: 'OFFICE_PIPELINE_GLAZING' });
                }, { levelIds, totalElementCount: items.length, skipRedetectRooms: true, skipPbrUpgrade: true });
                // Flush the host wall meshes so the openings show (mirror of the resi pass).
                deferWork(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.(wallIds); }
                    catch (e) { console.warn('[office-building] glazing rebuildWalls failed (non-fatal):', e); }
                }, 250);
                console.log(`[office-building] perimeter glazing — ${items.length}/${specs.length} curtain windows punched on ${levelIds.length} storey(s)`);
            } catch (e) { console.warn('[office-building] perimeter glazing batch failed (non-fatal):', e); }
        };
        tryPunch(40);
    }

    /** §OFFICE-PERIMETER-GLAZING — clamp a window {offset,width} to the host wall's STORED
     *  length via the pure `clampOpeningToWall`, so a pane computed at generation-time edge
     *  length never overruns the now-committed (possibly mitred) wall. Returns the clamped
     *  span, or `null` to DROP the window when even a minimal pane can't fit. A store miss
     *  (wall not readable) keeps the input verbatim (the punch is gated on landing anyway). */
    private _clampGlazingToStoredWall(
        wallId: string, offset: number, width: number,
    ): { offset: number; width: number } | null {
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const w = wallStore?.getById?.(wallId) as { baseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;
        const bl = w?.baseLine;
        if (!bl || bl.length < 2) return { offset, width };       // can't read → keep verbatim
        const a = bl[0]!, b = bl[1]!;
        const storedLen = Math.hypot(b.x - a.x, b.z - a.z);
        if (!Number.isFinite(storedLen) || storedLen <= 0.05) return { offset, width };
        const res = clampOpeningToWall(offset, width, storedLen);
        if (res === null) return null;
        return { offset: res.offset, width: res.width };
    }

    // ── §OFFICE-INTERIOR-FITOUT (founder 2026-07-01) — roof · core walls · entrance · interior ──

    /** §OFFICE-ROOF-CAP — a flat roof over the disc footprint on the top storey's wall head.
     *  Mirrors ResidentialBuildingExecutor._createRoof: the RoofFootprint is CENTROID-LOCAL
     *  `polygon` + world `centroid`. A flat slab extrudes DOWN from its origin, so baseOffset =
     *  (floorToFloor + thickness) lifts the slab bottom to rest on the top-storey wall head. */
    private _createRoof(
        cm: CommandManagerLike,
        disc: readonly Pt2[],
        topLevelId: string,
        floorToFloorM: number,
        facadeColor?: string,
    ): void {
        try {
            if (disc.length < 3) return;
            // The office disc is origin-centred already, so the centroid is ~(0,0); compute it for
            // robustness and emit the polygon relative to it (RoofFootprint convention).
            let cx = 0, cz = 0;
            for (const p of disc) { cx += p.x; cz += p.z; }
            cx /= disc.length; cz /= disc.length;
            const polygon: [number, number][] = disc.map((p) => [p.x - cx, p.z - cz] as [number, number]);
            cm.execute?.(new CreateRoofCommand(createId('roof'), {
                levelId: topLevelId,
                footprint: { polygon, centroid: [cx, cz] },
                roofType: 'flat',
                overhang: 0,
                // The top storey's FLOOR is topLevel.elevation; the wall head is one floorToFloor
                // above. Lift by floorToFloor + thickness so the flat slab bottom rests on the head.
                baseOffset: floorToFloorM + ROOF_THICKNESS_M,
                thickness: ROOF_THICKNESS_M,
                autoBaseOffset: false,
                // §OFFICE-FACADE-GLASS-COLOUR — paint the roof the façade finish colour (absent ⇒
                // the CreateRoofCommand default stands).
                ...(facadeColor ? { materialColor: facadeColor } : {}),
            }), { source: 'OFFICE_PIPELINE_ROOF' });
        } catch (e) { console.warn('[office-building] roof cap create failed (skipped):', e); }
    }

    /** §OFFICE-CORE-WALLS — one wall per edge of the square core enclosure (consecutive edges
     *  share the exact corner endpoint so the ring closes), with a single centred fire/lobby door
     *  on the `doorEdgeIndex` edge (recorded as a deferred spec, punched once the walls land).
     *  Mirrors ResidentialBuildingExecutor._buildCorePerimeter. */
    private _buildCoreWalls(
        corners: readonly Pt2[],
        doorEdgeIndex: number,
        levelId: string,
        heightM: number,
        // §OFFICE-CORE-WALL-INNER-COLOUR — the RC core enclosure is an INTERIOR partition, so it
        // reads the INNER-WALL colour (not the façade colour). Absent ⇒ the default wall finish.
        innerWallColor?: string,
    ): {
        payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
        doors: Array<{ wallId: string; offset: number; width: number; levelId: string }>;
    } {
        const walls: Array<Record<string, unknown>> = [];
        const doors: Array<{ wallId: string; offset: number; width: number; levelId: string }> = [];
        const DOOR_W = 1.0;
        for (let i = 0; i < corners.length; i++) {
            const a = corners[i]!;
            const b = corners[(i + 1) % corners.length]!;
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            if (len < 0.2) continue;   // degenerate edge — skip
            const wallId = createId('wall');
            walls.push({
                id: wallId,
                levelId,
                baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
                height: heightM,
                thickness: CORE_WALL_THICKNESS_M,
                // §OFFICE-CORE-WALL-INNER-COLOUR — the RC core enclosure is an INTERIOR partition, so
                // it reads the INNER-WALL colour (matching the interior partitions), NOT the façade.
                ...(innerWallColor ? { materialColor: innerWallColor } : {}),
            });
            if (i === doorEdgeIndex) {
                const w = Math.min(DOOR_W, Math.max(0.8, len - 0.4));
                doors.push({ wallId, offset: Math.max(0, (len - w) / 2), width: w, levelId });
            }
        }
        return { payload: { walls, levelId }, doors };
    }

    /** §OFFICE-CORE-WALLS — punch the single fire/lobby door per storey on the (already committed)
     *  core walls. Deferred + polled exactly like the perimeter glazing: the core wall.batch.create
     *  is async via the bus, so wait (≤6 s) for every host wall to land, then punch all door
     *  openings in ONE batch + flush the host meshes. Mirrors ResidentialBuildingExecutor
     *  ._finishCoreDoors. Never throws. */
    private _finishCoreDoors(
        specs: ReadonlyArray<{ wallId: string; offset: number; width: number; levelId: string }>,
    ): void {
        if (specs.length === 0) return;
        const cm = getCommandManager();
        if (!cm?.execute) { console.warn('[office-building] commandManager unavailable — core doors skipped'); return; }
        const wallIds = specs.map((s) => s.wallId);
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const ready = (): boolean => !wallStore?.getById ? true : wallIds.every((id) => wallStore.getById!(id) != null);
        const levelIds = [...new Set(specs.map((s) => s.levelId))];
        const tryPunch = (n: number): void => {
            if (!ready() && n > 0) { deferWork(() => tryPunch(n - 1), 150); return; }
            try {
                const items = specs
                    .map((s) => {
                        const c = this._clampGlazingToStoredWall(s.wallId, s.offset, s.width);
                        return c ? { s, offset: c.offset, width: c.width } : null;
                    })
                    .filter((it): it is { s: typeof specs[number]; offset: number; width: number } => it !== null);
                if (items.length === 0) { console.warn('[office-building] core doors — all dropped (no host wall could fit a leaf)'); return; }
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand(items.map(({ s, offset, width }) => ({
                        wallId: s.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'door',
                            offset,
                            width,
                            height: 2.1,
                            sillHeight: 0,
                            elementId: createId('door'),
                            doorType: 'single',
                            systemTypeId: 'dt-solid-timber',
                        },
                    }))), { source: 'OFFICE_PIPELINE_CORE_DOOR' });
                }, { levelIds, totalElementCount: items.length, skipRedetectRooms: true, skipPbrUpgrade: true });
                deferWork(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.(wallIds); }
                    catch (e) { console.warn('[office-building] core-door rebuildWalls failed (non-fatal):', e); }
                }, 250);
                console.log(`[office-building] core fire doors — ${items.length} punched on ${levelIds.length} storey(s)`);
            } catch (e) { console.warn('[office-building] core doors batch failed (non-fatal):', e); }
        };
        tryPunch(40);
    }

    /** §OFFICE-ENTRANCE — the ground-floor DOUBLE front door. The perimeter ring is landing async,
     *  so wait for its walls, pick the segment whose midpoint direction is nearest the entrance
     *  heading, and punch a centred glazed double door on it. Mirrors the resi entrance punch. */
    private _finishEntranceDoor(
        ring: WallRing,
        entranceAngle: number,
        levelId: string,
        floorToFloorM: number,
    ): void {
        const cm = getCommandManager();
        if (!cm?.execute) { console.warn('[office-building] commandManager unavailable — entrance skipped'); return; }
        const wallIds = ring.segments.map((s) => s.wallId);
        if (wallIds.length === 0) return;
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const ready = (): boolean => !wallStore?.getById ? true : wallIds.every((id) => wallStore.getById!(id) != null);
        const dirX = Math.cos(entranceAngle), dirZ = Math.sin(entranceAngle);
        const tryPunch = (n: number): void => {
            if (!ready() && n > 0) { deferWork(() => tryPunch(n - 1), 150); return; }
            // Pick the perimeter wall whose midpoint heading best matches the entrance direction and
            // is long enough to host a door leaf.
            let best: { wallId: string; len: number; dot: number } | null = null;
            for (const seg of ring.segments) {
                const w = wallStore?.getById?.(seg.wallId) as { baseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;
                const bl = w?.baseLine;
                if (!bl || bl.length < 2) continue;
                const a = bl[0]!, b = bl[1]!;
                const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
                const mr = Math.hypot(mx, mz) || 1;
                const dot = (mx / mr) * dirX + (mz / mr) * dirZ;
                const len = Math.hypot(b.x - a.x, b.z - a.z);
                if (len < 1.4) continue;
                if (!best || dot > best.dot) best = { wallId: seg.wallId, len, dot };
            }
            if (!best) { console.warn('[office-building] entrance — no suitable perimeter wall (skipped)'); return; }
            const MARGIN = 0.4;
            const width = Math.max(1.2, Math.min(2.4, best.len - 2 * MARGIN));
            const offset = Math.max(MARGIN, (best.len - width) / 2);
            try {
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand([{
                        wallId: best!.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'door',
                            offset,
                            width,
                            height: Math.min(2.6, floorToFloorM - 0.3),
                            sillHeight: 0,
                            elementId: createId('door'),
                            doorType: 'double',
                            systemTypeId: 'dt-modern-entrance-glazed',
                        },
                    }]), { source: 'OFFICE_PIPELINE_ENTRANCE' });
                }, { levelIds: [levelId], totalElementCount: 1, skipRedetectRooms: true });
                deferWork(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.([best!.wallId]); }
                    catch (e) { console.warn('[office-building] entrance rebuildWalls failed (non-fatal):', e); }
                }, 250);
                console.log(`[office-building] main entrance — ${width.toFixed(2)}m double door on perimeter wall @ offset ${offset.toFixed(2)}m`);
            } catch (e) { console.warn('[office-building] entrance door batch failed (non-fatal):', e); }
        };
        tryPunch(40);
    }

    /** §OFFICE-CORE-WALLS — run the corner-join / MITRE pass on the committed core walls once they
     *  land (consecutive edges already share the exact corner, so this just RUNS the resolver via
     *  __wallRebuildControl.rebuildWalls). Mirrors ResidentialBuildingExecutor._mitreShellCorners
     *  (simplified: fire once after the walls land + one settle re-arm). Never throws. */
    private _mitreCorners(
        payloads: ReadonlyArray<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }>,
    ): void {
        const ids: string[] = [];
        for (const p of payloads) for (const w of p.walls) {
            const id = (w as { id?: unknown }).id;
            if (typeof id === 'string' && id.length > 0) ids.push(id);
        }
        if (ids.length === 0) return;
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const ready = (): boolean => !wallStore?.getById ? true : ids.every((id) => wallStore.getById!(id) != null);
        const tryMitre = (n: number): void => {
            if (!ready() && n > 0) { deferWork(() => tryMitre(n - 1), 150); return; }
            batchCoordinator.onNextSettle(() => {
                deferWork(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.(ids); }
                    catch (e) { console.warn('[office-building] core mitre rebuildWalls failed (non-fatal):', e); }
                }, 0);
            });
        };
        tryMitre(40);
    }

    /** §OFFICE-INTERIOR-FITOUT — the outer radius (m) of a named zone on the plate (origin-centred).
     *  Returns 0 when the zone is absent. */
    private _zoneRadius(plate: OfficeBuildingOk['representativePlate'], kind: string): number {
        const z = plate.zones.find((zz) => zz.kind === kind);
        return z ? z.outerRadiusM : 0;
    }

    /** §OFFICE-INTERIOR-FITOUT — the MID radius (m) of the band a zone occupies, i.e. between the
     *  inner zone's outer radius and this zone's outer radius. Falls back to a sensible offset. */
    private _zoneMidRadius(plate: OfficeBuildingOk['representativePlate'], kind: string, innerKind: string): number {
        const outer = this._zoneRadius(plate, kind);
        const inner = this._zoneRadius(plate, innerKind);
        if (outer > 0 && inner > 0 && outer > inner) return (outer + inner) / 2;
        return outer > 0 ? outer - 1.5 : 0;
    }

    // ── §OFFICE-CORE-SERVICES (SPEC §3) — full core: stairs · fire stair · lift(s) · toilets ──

    /** §OFFICE-CORE-SERVICES — emit the FULL core content (never empty) on the detailed floors:
     *  a main switchback (U) stair + a fire-escape stair per storey via `CreateStairCommand`, a
     *  lift shaft per storey via `CreateVerticalCirculationCommand`, and the toilet/service block
     *  (male · female · accessible WC · cleaning closet · service shaft) as room-bounding lines +
     *  partition walls. Cubicle counts are already scaled by floor size in `planOfficeCore`. All
     *  emitted through the command bus (P6). Returns stair + lift counts. Never throws. */
    private _buildCoreServices(
        cm: CommandManagerLike,
        core: OfficeCorePlan,
        detailedIndices: readonly number[],
        levelIdByIndex: Map<number, string>,
        floorToFloorM: number,
        baseElevationM: number,
        /** §OFFICE-INNER-WALL-COLOUR — the toilet/service partitions read this inner-wall colour. */
        innerWallColor?: string,
    ): { stairs: number; lifts: number } {
        let stairs = 0, lifts = 0;
        // Room-bounding lines for the fire lobby + toilet/service rooms, drawn on the FIRST detailed
        // floor (they read the same core footprint on every storey; one plan floor is enough).
        const roomLines: BoundingLineItem[] = [];
        const toiletWalls: WallSeg[] = [];

        // §OFFICE-CORE-REAL-CIRCULATION — the CONTINUOUS vertical-circulation spine (mirrors
        // ResidentialBuildingExecutor._createCore): a REAL switchback stair + a fire-escape stair per
        // ADJACENT minted-level pair (ground→1, 1→2, … top-1→top), and ONE lift cab per level spanning
        // ground→top. The minted indices (level minting can break early → shorter tower) are the SINGLE
        // SOURCE for the level pairs, so the stair/lift reach exactly as high as the tower actually built.
        const mintedIndices = [...levelIdByIndex.keys()].sort((a, b) => a - b);
        const topIndex = mintedIndices[mintedIndices.length - 1] ?? 0;
        for (let idx = 0; idx < topIndex; idx++) {
            const fromLevelId = levelIdByIndex.get(idx);
            const toLevelId = levelIdByIndex.get(idx + 1);
            if (!fromLevelId || !toLevelId) continue;   // a gap from an early-broken mint — skip the pair
            const startY = baseElevationM + idx * floorToFloorM;
            const flightRise = floorToFloorM;   // uniform storey height (the office cascade is uniform)
            // ── Vertical circulation: main + fire-escape switchback stairs, one flight PER LEVEL PAIR
            //    (baseLevelId=from, topLevelId=to) so the stair spans the real storey and reaches roof.
            for (const stair of [core.mainStair, core.fireStair]) {
                if (this._emitCoreStair(cm, stair, fromLevelId, toLevelId, startY, flightRise)) stairs++;
            }
        }
        // ── Lift shaft(s): 1 for small/medium, 2 for large+. ONE cab per level spanning ground→top,
        //    so the shaft is visible on EVERY floor (mirrors §RESI-LIFT-EVERY-FLOOR). The top floor
        //    passes base===top (a one-storey cab anchored at its floor, per resolveSpan's fallback).
        for (const idx of mintedIndices) {
            const fromLevelId = levelIdByIndex.get(idx);
            if (!fromLevelId) continue;
            const toLevelId = levelIdByIndex.get(idx + 1) ?? fromLevelId;
            const elevationM = baseElevationM + idx * floorToFloorM;
            for (const lift of core.lifts) {
                try {
                    cm.execute?.(new CreateVerticalCirculationCommand({
                        id: createId('verticalCirculation'),
                        baseLevelId: fromLevelId,
                        topLevelId: toLevelId,
                        kind: 'passenger',
                        origin: { x: lift.cx, y: elevationM, z: lift.cz },
                        rotation: lift.rotationY,
                        shaftWidth: lift.widthM,
                        shaftDepth: lift.depthM,
                    }), { source: 'OFFICE_PIPELINE_LIFT' });
                    lifts++;
                } catch (e) { console.warn('[office-building] §OFFICE-CORE-SERVICES lift create failed (skipped):', e); }
            }
        }

        // Collect the fire-lobby + corridor + toilet room-bounding lines ONCE (first detailed floor).
        {
            const firstDetailed = detailedIndices.find((i) => levelIdByIndex.has(i));
            const planLevelId = firstDetailed != null ? levelIdByIndex.get(firstDetailed) : undefined;
            if (planLevelId) {
                this._rectRoomLines(roomLines, core.fireLobby, planLevelId);
                // §OFFICE-CORE-WELLPROPORTIONED — the CIRCULATION CORRIDOR (founder: "the toilets
                // don't have a run") as bounding lines so it reads as a proper corridor.
                this._rectRoomLines(roomLines, core.corridor, planLevelId);
                for (const r of core.toiletRooms) this._rectRoomLines(roomLines, r, planLevelId);
                toiletWalls.push(...core.toiletWalls);
            }
        }

        // Draw the toilet/service partition walls (opaque) on the FIRST detailed floor, batched.
        const firstDetailed = detailedIndices.find((i) => levelIdByIndex.has(i));
        const firstLevelId = firstDetailed != null ? levelIdByIndex.get(firstDetailed) : undefined;
        if (firstLevelId && (toiletWalls.length > 0 || roomLines.length > 0)) {
            try {
                // Room-bounding lines (fire lobby + toilet/service rooms) in a suppressed batch.
                if (roomLines.length > 0) {
                    batchCoordinator.runBatch(() => {
                        cm.execute?.(new CreateRoomBoundingLinesBatchCommand(roomLines), { source: 'OFFICE_PIPELINE_CORE_ROOMS' });
                    }, { levelIds: [firstLevelId], totalElementCount: roomLines.length, skipRedetectRooms: true, skipPbrUpgrade: true });
                }
                // Partition walls go through the bus (wall.batch.create) like the perimeter/core walls.
                // §OFFICE-INNER-WALL-COLOUR — the toilet/service partitions read the inner-wall colour.
                if (toiletWalls.length > 0) {
                    const payload = this._segsToWallPayload(toiletWalls, firstLevelId, floorToFloorM, PARTITION_WALL_THICKNESS_M, innerWallColor);
                    if (payload.walls.length > 0) this._dispatchWallBatchByLevel(firstLevelId, payload, 'toilet-partitions');
                }
            } catch (e) { console.warn('[office-building] §OFFICE-CORE-SERVICES toilet rooms batch failed (non-fatal):', e); }
        }

        return { stairs, lifts };
    }

    /** §OFFICE-CORE-SERVICES / §OFFICE-CORE-REAL-CIRCULATION — emit ONE switchback (U) stair spanning
     *  the REAL adjacent level pair `baseLevelId → topLevelId` at `elevationM`, its riser/tread sized
     *  to the storey `rise` + kept inside the command's valid band [0.15, 0.19] (else CreateStairCommand
     *  BLOCKS). Mirrors the resi core-stair math (one flight per level pair, contained footprint, slab
     *  void auto-punched in the upper floor). Returns true on success. */
    private _emitCoreStair(
        cm: CommandManagerLike,
        stair: { cx: number; cz: number; widthM: number; runDepthM: number; runDir: { x: number; z: number } },
        baseLevelId: string,
        topLevelId: string,
        elevationM: number,
        rise: number,
    ): boolean {
        // Riser count in the command-valid window [ceil(rise/max), floor(rise/min)], preferring the
        // target 0.18 m — so the riser height is always in [0.15, 0.19] (else CreateStairCommand blocks).
        const minRisers = Math.max(2, Math.ceil(rise / STAIR_RISER_MAX_M));
        const maxRisers = Math.max(minRisers, Math.floor(rise / STAIR_RISER_MIN_M));
        let risers = Math.round(rise / STAIR_RISER_TARGET_M);
        if (risers < minRisers) risers = minRisers;
        if (risers > maxRisers) risers = maxRisers;
        const riserH = rise / risers;
        const before = Math.ceil(risers / 2);
        const after = risers - before;
        const width = Math.max(0.9, Math.min(2.0, stair.widthM));
        const dir = { x: stair.runDir.x, y: 0, z: stair.runDir.z };
        const reverse = { x: -stair.runDir.x, y: 0, z: -stair.runDir.z };
        const perp = { x: -stair.runDir.z, y: 0, z: stair.runDir.x };
        const startPosition = { x: stair.cx, y: elevationM, z: stair.cz };
        const secondStart = {
            x: startPosition.x + dir.x * (before * STAIR_TREAD_M + STAIR_TREAD_M) + perp.x * width,
            y: startPosition.y + before * riserH,
            z: startPosition.z + dir.z * (before * STAIR_TREAD_M + STAIR_TREAD_M) + perp.z * width,
        };
        const flights = [
            { direction: dir, riserCount: before },
            { direction: reverse, riserCount: after, startOverride: secondStart },
        ];
        const landings = [{ depth: 2 * width }];
        try {
            const res = cm.execute?.(new CreateStairCommand({
                id: createId('stair'),
                baseLevelId,
                topLevelId,
                shape: 'U',
                riserHeight: riserH,
                treadDepth: STAIR_TREAD_M,
                width,
                startPosition,
                flights,
                landings,
                secondRunSide: 'left',
                accessibilityType: 'standard',
                // §OFFICE-CORE-REAL-CIRCULATION — the stair now spans a REAL adjacent level pair
                // (baseLevelId → topLevelId), so let CreateStairCommand auto-punch the slab void in
                // the UPPER floor (you walk up THROUGH it) exactly like the residential core stair.
                // The recorded stair void (below) then cuts the floor finish over that same opening.
                autoCreateOpening: true,
            }), { source: 'OFFICE_PIPELINE_STAIR' });
            if (res && (res as { success?: boolean }).success === false) {
                console.warn(`[office-building] §OFFICE-CORE-SERVICES stair rejected (rise=${rise.toFixed(2)} risers=${risers} riserH=${riserH.toFixed(3)} width=${width.toFixed(2)}).`);
                return false;
            }
            // §OFFICE-CORE-WELLPROPORTIONED — register the stairwell void (the SAME oriented-rect
            // footprint the slab opening uses) so the floor-finish pass CUTS the finish over the open
            // stair instead of re-covering it. Mirrors ResidentialBuildingExecutor's recordStairVoid.
            try {
                const vr = computeStairFootprintRect({ shape: 'U', width, treadDepth: STAIR_TREAD_M, startPosition, flights, landings });
                if (vr && vr.length >= 3) recordStairVoid(topLevelId, vr);
            } catch (e) { console.warn('[office-building] §OFFICE-CORE-SERVICES stair void record failed (non-fatal):', e); }
            return true;
        } catch (e) { console.warn('[office-building] §OFFICE-CORE-SERVICES stair create failed (skipped):', e); return false; }
    }

    // ── §OFFICE-CIRCULATION-FIRST (SPEC §4/§9 steps 3–5) — circulation-solved-first floor ─────

    /** §OFFICE-CIRCULATION-FIRST — draw the circulation-first floor plan: circulation rings +
     *  escape spokes as room-bounding lines (circulation FIRST), support rooms (meeting/kitchenette/
     *  storage/plant) as rooms, internal partitions (opaque wall.batch), and glazed office enclosures
     *  (curtain-wall segments). All deferred + suppressed so it never triggers the redetect storm. */
    private _buildFloorArchitecture(
        cm: CommandManagerLike,
        arch: ReturnType<typeof planOfficeFloorArchitecture>,
        levelId: string,
        floorToFloorM: number,
        /** §OFFICE-INNER-WALL-COLOUR — the internal office partitions read this inner-wall colour. */
        innerWallColor?: string,
        glassColor?: string,
    ): void {
        // §FIX-OFFICE-CIRC-RBL-UNDEFINED-PLACEMENT (L-170) — the floor emits room-bounding lines ONLY
        // for the real rectangular SUPPORT rooms; the circulation RINGS are NO LONGER materialised as
        // `office-circ` RoomBoundingLines. WHY the rings were removed (not "populated"):
        //   • They never established room identity — office floors are GRAPH-AUTHORITATIVE
        //     (`_nameAndFinishFloors` dispatches BatchCreateRoomsCommand + markGraphAuthoritative), so
        //     RoomBoundingLines never carve rooms here; auto-detection is explicitly overridden. The
        //     circulation is already represented by the NAMED 'Corridor' / 'Open-Plan Office' rooms.
        //   • They never rendered — RoomBoundingLineStore.add fires `bim-room-bounding-line-added` with
        //     an {id}-only detail (F.events.17), so the shared RoomBoundingLineBuilder receives no
        //     `placement` and the §RBL-PLACEMENT-GUARD skips EVERY line regardless of how finite the
        //     emitted endpoints are (a shared store/builder-wiring issue, not an office-emission one).
        //   • They were pure waste + a redetect storm — each ring outline is a 32-gon per radius, so
        //     3 rings × 2 circles minted ~190 RoomBoundingLine records PER FLOOR (RB-01-722…839+), each
        //     burning a CreateRoomBoundingLineCommand + mark id AND directly notifying
        //     RoomTopologyObserver's per-add RBL subscription (which is NOT gated by the batch's
        //     `skipRedetectRooms`), hammering same-geometry room-redetects until the circuit-breaker
        //     tripped 60+×. Not emitting them removes the flood + the storm AT SOURCE.
        // The remaining support-room lines route through the SAME finite-endpoint + non-degenerate guard
        // (`ringPlanSegments`, via `officeFloorArchitectureBoundingLineSegments`) every office RBL uses.
        const lines: BoundingLineItem[] = [];
        for (const seg of officeFloorArchitectureBoundingLineSegments(arch)) {
            lines.push({ id: `office-room-${createId('annotation')}`, levelId, start: seg.start, end: seg.end });
        }

        // Internal partition walls (opaque) + glazed office enclosures (curtain-wall).
        // §OFFICE-INNER-WALL-COLOUR — internal partitions read the inner-wall colour (absent ⇒ default).
        const partitionPayload = this._segsToWallPayload(arch.partitionWalls, levelId, floorToFloorM, PARTITION_WALL_THICKNESS_M, innerWallColor);

        deferWork(() => {
            try {
                if (lines.length > 0) {
                    batchCoordinator.runBatch(() => {
                        cm.execute?.(new CreateRoomBoundingLinesBatchCommand(lines), { source: 'OFFICE_PIPELINE_CIRCULATION' });
                    }, { levelIds: [levelId], totalElementCount: lines.length, skipRedetectRooms: true, skipPbrUpgrade: true });
                }
                if (partitionPayload.walls.length > 0) this._dispatchWallBatchByLevel(levelId, partitionPayload, 'floor-partitions');
                // Glazed office enclosures — curtain-wall segments (one per enclosure wall).
                const glazedHeight = Math.max(2.4, floorToFloorM - 0.3);
                batchCoordinator.runBatch(() => {
                    for (const enc of arch.glazedEnclosures) {
                        for (const w of enc.walls) {
                            try {
                                cm.execute?.(new CreateCurtainWallCommand({
                                    id: createId('curtainwall'),
                                    start: { x: w.start.x, z: w.start.z },
                                    end: { x: w.end.x, z: w.end.z },
                                    height: glazedHeight,
                                    levelId,
                                    // §OFFICE-FACADE-GLASS-COLOUR — the glazed office glass reads the
                                    // chosen glass tint (absent ⇒ the curtain-wall default light blue).
                                    ...(glassColor ? { glazingColor: glassColor } : {}),
                                }), { source: 'OFFICE_PIPELINE_GLAZED_OFFICE' });
                            } catch (e) { console.warn('[office-building] §OFFICE-CIRCULATION-FIRST glazed enclosure segment skipped:', e); }
                        }
                    }
                }, { levelIds: [levelId], totalElementCount: arch.glazedEnclosures.length * 3, skipRedetectRooms: true, skipPbrUpgrade: true });
                console.log(`[office-building] §OFFICE-CIRCULATION-FIRST — ${arch.circulation.length} circulation ring(s), ${arch.supportRooms.length} support room(s), ${partitionPayload.walls.length} partition wall(s), ${arch.glazedEnclosures.length} glazed office(s) on ${levelId}`);
            } catch (e) { console.warn('[office-building] §OFFICE-CIRCULATION-FIRST floor architecture batch failed (non-fatal):', e); }
        }, 400);
    }

    // ── §OFFICE-CORE-WELLPROPORTIONED — graph-authoritative room NAMING + floor FINISH pass ──────

    /** §OFFICE-CORE-WELLPROPORTIONED — name the shipped rooms + lay floor finishes on the detailed
     *  floors, mirroring ResidentialBuildingExecutor's PROVEN passes:
     *   • ROOM NAMES: build a graph-authoritative `RoomData` (via `roomDataFromGraphSpec`) for every
     *     core/service + open-plan/support/glazed room — each carrying a real NAME (Stair, Fire
     *     Escape Stair, Lift Lobby, WC — Male, …, Open-Plan Office) — and dispatch them via
     *     `BatchCreateRoomsCommand`, then mark the level graph-authoritative so detection never
     *     overrides the names with the auto "Room 00-NNN" label.
     *   • FLOOR FINISH: lay a `CreateFloorCommand` finish over each named room's polygon, CUT around
     *     any recorded stairwell void inside it (via `getStairVoidsForLevel`) so the finish never
     *     covers the open stair — exactly like `_finishPublicFloors`. Core/WC rooms get a tile tone;
     *     the office floor gets the office finish tone. Deferred + suppressed. Never throws. */
    private _nameAndFinishFloors(
        cm: CommandManagerLike,
        corePlan: OfficeCorePlan | null,
        arch: ReturnType<typeof planOfficeFloorArchitecture>,
        detailedIndices: readonly number[],
        levelIdByIndex: Map<number, string>,
        floorToFloorM: number,
        _discRadiusM: number,
        _coreRadiusM: number,
        _facadeColor?: string,
    ): void {
        // Distinct finish tones so each area reads as a FINISHED floor (not raw slab) + the schedule
        // reads the materialName (mirrors ResidentialBuildingExecutor's public-floor palette).
        const OFFICE_FINISH = { color: '#c9c2b6', pattern: 'seamless' as const, name: 'Carpet Tile (Office)' };
        const CORE_FINISH = { color: '#b8b4ad', pattern: 'tile-600x600' as const, name: 'Porcelain Tile 600×600 (Core / WC)' };

        // The named rooms: the core/service rooms + the floor's open-plan/support/glazed rooms.
        const named = [...(corePlan?.namedRooms ?? []), ...arch.namedRooms];
        if (named.length === 0) return;

        // Shoelace helpers (mirror _finishPublicFloors' void-cut math).
        const signedArea = (poly: ReadonlyArray<{ x: number; z: number }>): number => {
            let s = 0;
            for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; }
            return s * 0.5;
        };
        const polyCentroid = (poly: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } => {
            let sx = 0, sz = 0; for (const p of poly) { sx += p.x; sz += p.z; } const n = poly.length || 1; return { x: sx / n, z: sz / n };
        };
        const pointInPoly = (pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const a = poly[i]!, b = poly[j]!;
                if (((a.z > pt.z) !== (b.z > pt.z)) && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
            }
            return inside;
        };
        // §OFFICE-STAIR-VOID-IN-FINISH — CW-wound holes for every recorded stairwell void inside a
        // finish ring, so the finish is CUT around the open stair (canonical hole winding vs CCW ring).
        const voidHolesFor = (levelId: string, ring: ReadonlyArray<{ x: number; z: number }>): Array<Record<string, unknown>> => {
            const holes: Array<Record<string, unknown>> = [];
            for (const v of getStairVoidsForLevel(levelId)) {
                if (v.polygon.length < 3) continue;
                if (!pointInPoly(polyCentroid(v.polygon), ring)) continue;
                const cw = signedArea(v.polygon) > 0 ? [...v.polygon].reverse() : [...v.polygon];
                holes.push({
                    id: createId('opening'), elementId: createId('opening'),
                    subType: 'floor-hatch', shape: 'polygon',
                    polygon: cw.map((p) => ({ x: p.x, z: p.z })), label: 'Stairwell void',
                });
            }
            return holes;
        };

        const roomHeightM = Math.max(2.4, floorToFloorM - 0.3);
        // Name + finish rooms on the FIRST detailed floor (the plan floor); the core shaft repeats
        // on every storey but one named plan floor is enough (mirrors the resi one-plan-floor rule).
        const firstDetailed = detailedIndices.find((i) => levelIdByIndex.has(i));
        const levelId = firstDetailed != null ? levelIdByIndex.get(firstDetailed) : undefined;
        if (!levelId) return;

        deferWork(() => {
            try {
                // ── ROOM NAMES: graph-authoritative RoomData per named room (real names, not "Room NN").
                const rooms: RoomData[] = [];
                let rn = 0;
                for (const nr of named) {
                    if (nr.corners.length < 3) continue;
                    const rd = roomDataFromGraphSpec(
                        { levelId, name: nr.name, polygon: nr.corners.map((c) => ({ x: c.x, z: c.z })), occupancyType: nr.occupancyType },
                        { levelHeightM: roomHeightM, roomNumber: String(++rn).padStart(2, '0') },
                    );
                    if (rd) rooms.push(rd);
                }
                if (rooms.length > 0) {
                    batchCoordinator.runBatch(() => {
                        try {
                            cm.execute?.(new BatchCreateRoomsCommand(rooms), { source: 'OFFICE_PIPELINE_ROOMS' });
                            (window as unknown as { roomTopologyObserver?: { markGraphAuthoritative(l: string): void } })
                                .roomTopologyObserver?.markGraphAuthoritative(levelId);
                        } catch (e) { console.warn('[office-building] §OFFICE-CORE-WELLPROPORTIONED room-name batch failed (non-fatal):', e); }
                    }, { levelIds: [levelId], totalElementCount: rooms.length, skipRedetectRooms: true, skipPbrUpgrade: true });
                }

                // ── FLOOR FINISHES: one thin finish per named room, CUT over any stairwell void inside it.
                let laid = 0;
                batchCoordinator.runBatch(() => {
                    for (const nr of named) {
                        if (nr.corners.length < 3) continue;
                        const ring = nr.corners.map((c) => ({ x: c.x, z: c.z }));
                        // Skip the service shaft (a vertical duct, not a walkable finished floor).
                        if (/shaft/i.test(nr.name)) continue;
                        let area2 = 0;
                        for (let i = 0; i < ring.length; i++) { const a = ring[i]!, b = ring[(i + 1) % ring.length]!; area2 += a.x * b.z - b.x * a.z; }
                        if (Math.abs(area2) / 2 < 0.25) continue;   // < 0.25 m² ⇒ not a real floor
                        const finish = nr.finishGroup === 'core' ? CORE_FINISH : OFFICE_FINISH;
                        const holes = voidHolesFor(levelId, ring);
                        try {
                            cm.execute?.(new CreateFloorCommand({
                                floorId: createId('floor'),
                                ifcGuid: createId('floor'),
                                polygon: ring.map((p) => ({ x: p.x, z: p.z })),
                                levelId,
                                label: nr.name,
                                finishSpec: { finishColor: finish.color, finishPattern: finish.pattern, materialName: finish.name, exposedScreed: false },
                                ...(holes.length > 0 ? { serviceHoles: holes as never } : {}),
                            }), { source: 'OFFICE_PIPELINE_FLOOR_FINISH' });
                            laid++;
                        } catch (e) { console.warn('[office-building] §OFFICE-CORE-WELLPROPORTIONED floor finish failed on', nr.name, '(non-fatal):', e); }
                    }
                }, { levelIds: [levelId], totalElementCount: named.length, skipRedetectRooms: true, skipPbrUpgrade: true });
                console.log(`[office-building] §OFFICE-CORE-WELLPROPORTIONED — named ${rooms.length} room(s) + laid ${laid} floor finish(es) on ${levelId} (voids cut over open stairs)`);
            } catch (e) { console.warn('[office-building] §OFFICE-CORE-WELLPROPORTIONED name+finish batch failed (non-fatal):', e); }
        }, 800);
    }

    /**
     * §FIX-OFFICE-MISSING-PER-STOREY-SLABS (L-322) — lay a full-disc FLOOR PLATE on every storey the
     * detailed per-room finish pass (`_nameAndFinishFloors`, which only finishes the first detailed
     * level) does NOT cover, so the tower is not a hollow glass shell of bare structural slabs. Uses
     * the SAME `CreateFloorCommand` path that already renders the L0 finishes (the proven floor
     * builder), mirroring `ResidentialBuildingExecutor._finishPublicFloors`' per-level public floor.
     * Each plate is CUT over that storey's recorded stairwell voids so an open stair is never floored
     * over. Deferred + one batch (façade/structure has settled; floors don't change room topology).
     * The plate math is PURE (`buildStoreyFloorPlates`); this only stamps ids + dispatches. Never
     * throws.
     */
    private _finishStoreyFloors(
        cm: CommandManagerLike,
        disc: readonly Pt2[],
        levelIdByIndex: Map<number, string>,
        detailedIndices: readonly number[],
    ): void {
        const plates = buildStoreyFloorPlates({
            disc,
            levelIdByIndex,
            detailedIndices,
            stairVoidsFor: (levelId) => getStairVoidsForLevel(levelId),
        });
        if (plates.length === 0) return;
        // A structural-slab tone (exposed screed) so each plate reads as a real floor, distinct from
        // the carpet-tile office finish on the detailed plan floor.
        const STRUCTURAL_FLOOR = { color: '#a9a7a2', pattern: 'seamless' as const, name: 'Concrete Floor Slab' };
        const levelIds = [...new Set(plates.map((p) => p.levelId))];
        deferWork(() => {
            try {
                let laid = 0;
                batchCoordinator.runBatch(() => {
                    for (const plate of plates) {
                        if (plate.polygon.length < 3) continue;
                        const holes = plate.holes.map((h) => ({
                            id: createId('opening'), elementId: createId('opening'),
                            subType: 'floor-hatch', shape: 'polygon',
                            polygon: h.map((p) => ({ x: p.x, z: p.z })), label: 'Stairwell void',
                        }));
                        try {
                            cm.execute?.(new CreateFloorCommand({
                                floorId: createId('floor'),
                                ifcGuid: createId('floor'),
                                polygon: plate.polygon.map((p) => ({ x: p.x, z: p.z })),
                                levelId: plate.levelId,
                                label: 'Floor Slab',
                                finishSpec: { finishColor: STRUCTURAL_FLOOR.color, finishPattern: STRUCTURAL_FLOOR.pattern, materialName: STRUCTURAL_FLOOR.name, exposedScreed: true },
                                ...(holes.length > 0 ? { serviceHoles: holes as never } : {}),
                            }), { source: 'OFFICE_PIPELINE_STOREY_FLOOR' });
                            laid++;
                        } catch (e) { console.warn('[office-building] §FIX-OFFICE-MISSING-PER-STOREY-SLABS floor plate failed on', plate.levelId, '(non-fatal):', e); }
                    }
                }, { levelIds, totalElementCount: plates.length, skipRedetectRooms: true, skipPbrUpgrade: true });
                console.log(`[office-building] §FIX-OFFICE-MISSING-PER-STOREY-SLABS — laid ${laid} full-storey floor plate(s) across ${levelIds.length} storey(s) (every storey now has a visible floor, not a hollow shell)`);
            } catch (e) { console.warn('[office-building] §FIX-OFFICE-MISSING-PER-STOREY-SLABS storey-floor batch failed (non-fatal):', e); }
        }, 900);
    }

    /** Push the four edges of an axis-aligned rectangle room as room-bounding lines. */
    private _rectRoomLines(
        out: BoundingLineItem[],
        r: { x0: number; z0: number; x1: number; z1: number },
        levelId: string,
    ): void {
        const c = [
            { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 },
            { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
        ];
        for (let i = 0; i < c.length; i++) {
            const a = c[i]!, b = c[(i + 1) % c.length]!;
            if (!isFinitePlanPt(a) || !isFinitePlanPt(b)) continue;
            if (Math.hypot(b.x - a.x, b.z - a.z) < 0.01) continue;   // degenerate — skip
            out.push({ id: `office-room-${createId('annotation')}`, levelId, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
        }
    }

    /** Convert wall segments (LOCAL) to a wall.batch.create payload on `levelId`. §OFFICE-FACADE-
     *  GLASS-COLOUR — the opaque partitions/toilet walls read the façade finish colour when set. */
    private _segsToWallPayload(
        segs: readonly WallSeg[],
        levelId: string,
        heightM: number,
        thicknessM: number,
        materialColor?: string,
    ): WallRingPayload {
        const walls: Array<Record<string, unknown>> = [];
        for (const s of segs) {
            if (!isFinitePlanPt(s.start) || !isFinitePlanPt(s.end)) continue;
            if (Math.hypot(s.end.x - s.start.x, s.end.z - s.start.z) < 0.05) continue;
            walls.push({
                id: createId('wall'),
                levelId,
                baseLine: [{ x: s.start.x, y: 0, z: s.start.z }, { x: s.end.x, y: 0, z: s.end.z }],
                height: heightM,
                thickness: thicknessM,
                ...(materialColor ? { materialColor } : {}),
            });
        }
        return { walls, levelId };
    }

    /** Dispatch a wall.batch.create through the bus resolved from `window.runtime` (used by the
     *  deferred floor-architecture + core-service passes, which run outside the structural batch's
     *  `runtime` closure). Swallows async rejection. */
    private _dispatchWallBatchByLevel(levelId: string, payload: WallRingPayload, tag: string): void {
        const rt = (window as unknown as { runtime?: PryzmRuntime }).runtime;
        if (!rt?.bus?.executeCommand) { console.warn(`[office-building] no bus — ${tag} walls skipped on ${levelId}`); return; }
        try {
            const r = rt.bus.executeCommand('wall.batch.create', payload) as unknown;
            if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                (r as Promise<unknown>).catch((e: unknown) => console.warn(`[office-building] wall.batch.create (${tag}) failed on`, levelId, e));
            }
        } catch (e) { console.warn(`[office-building] wall.batch.create (${tag}) threw on`, levelId, e); }
    }
}
