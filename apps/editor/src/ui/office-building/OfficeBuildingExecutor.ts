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
} from '@pryzm/command-registry';
import { clampOpeningToWall } from '@pryzm/ai-host';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { OfficeBuildingOk, OfficeZone } from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
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
function buildPerimeterRing(footprint: readonly Pt2[], levelId: string, heightM: number): WallRing {
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
        });
        segments.push({ wallId, lengthM });
    }
    return { payload: { walls, levelId }, segments };
}

export class OfficeBuildingExecutor {
    /**
     * Build the multi-storey circular office tower from the orchestrator result.
     * Never throws — logs + returns. P8: one span at the exported boundary.
     */
    async execute(runtime: PryzmRuntime, result: OfficeBuildingOk): Promise<void> {
        return _tracer.startActiveSpan('pryzm.editor.officeBuilding.execute', async (span) => {
            try {
                const built = await this._execute(runtime, result);
                span.setAttribute('pryzm.office.execute.stories', built.storeyCount);
                span.setAttribute('pryzm.office.execute.slabs', built.slabCount);
                span.setAttribute('pryzm.office.execute.walls', built.wallCount);
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
    ): Promise<{ storeyCount: number; slabCount: number; wallCount: number }> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };
        const cm = getCommandManager();
        if (!cm?.execute) {
            console.warn('[office-building] commandManager unavailable — nothing built.');
            toast('Office building: editor not ready.', 'warn');
            return { storeyCount: 0, slabCount: 0, wallCount: 0 };
        }
        const ground = resolveActiveLevel();
        if (!ground?.id) {
            toast('No active level — draw a boundary first.', 'error');
            return { storeyCount: 0, slabCount: 0, wallCount: 0 };
        }

        const plate = result.representativePlate;
        // The circular footprint (outermost ring = the full disc n-gon).
        const discFull = plate.zones[plate.zones.length - 1]!.outerPolygon as readonly Pt2[];
        if (discFull.length < 3) {
            toast('Office building: degenerate plate — nothing built.', 'warn');
            return { storeyCount: 0, slabCount: 0, wallCount: 0 };
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
            return { storeyCount: 0, slabCount: 0, wallCount: 0 };
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
                    const ring = buildPerimeterRing(disc, levelId, floorToFloorM);
                    this._dispatchWallBatch(runtime, ring.payload, `perimeter-L${index}`);
                    wallCount += ring.payload.walls.length;
                    // §OFFICE-PERIMETER-GLAZING — a near-full-width / near-full-height window per
                    // segment (skip segments too short to host a sensible pane).
                    for (const seg of ring.segments) {
                        const g = perimeterGlazingSpec(seg.lengthM, floorToFloorM);
                        if (!g) continue;
                        glazingSpecs.push({ wallId: seg.wallId, levelId, offset: g.offset, width: g.width, sillHeight: g.sillHeight, height: g.height });
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

                // Concentric zone outlines (the representative floor's office plan).
                if (boundaryItems.length > 0) {
                    cm.execute?.(new CreateRoomBoundingLinesBatchCommand(boundaryItems));
                }
            }, {
                levelIds: [...new Set(levelIds)],
                totalElementCount: slabCount + wallCount + boundaryItems.length,
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
        this._finishPerimeterGlazing(glazingSpecs);

        console.log(
            `[office-building] built ${storeyCount}-storey circular tower — ` +
            `${slabCount} slab(s), ${wallCount} perimeter wall segment(s) ` +
            `(§OFFICE-PERIMETER-COARSEN: ${disc.length}-gon vs ${discFull.length}-gon footprint), ` +
            `${glazingSpecs.length} curtain glazing window(s), ` +
            `${boundaryItems.length} zone line(s) on the representative floor, ` +
            `${plate.analytics.deskCount} desks/floor. ${result.diagnostic}`,
        );
        toast(
            `Office tower built — ${storeyCount} storeys, ${result.analytics.totalDesks.toLocaleString()} desks, ` +
            `core efficiency ${Math.round(result.analytics.coreEfficiencyRatio * 100)}%.`,
            'success',
        );
        return { storeyCount, slabCount, wallCount };
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
    private _finishPerimeterGlazing(specs: ReadonlyArray<PerimeterGlazingSpec>): void {
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
}
