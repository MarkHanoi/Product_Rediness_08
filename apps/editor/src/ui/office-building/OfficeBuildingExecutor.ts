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
import { batchCoordinator } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import {
    AddLevelCommand,
    CreateSlabCommand,
    CreateRoomBoundingLinesBatchCommand,
} from '@pryzm/command-registry';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { OfficeBuildingOk, OfficeZone } from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';

const _tracer = trace.getTracer('@pryzm/editor', '0.1.0');
const DEFAULT_SLAB_THICKNESS_M = 0.2;
const PERIMETER_WALL_THICKNESS_M = 0.2;

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

/** Convert one zone's outer (and optional inner) polygon into closed bounding-line
 *  segments on `levelId`. The executor draws the ring outlines so room detection
 *  reads the concentric office zones. Pure helper. */
function zoneBoundingLines(zone: OfficeZone, levelId: string): BoundingLineItem[] {
    const items: BoundingLineItem[] = [];
    const ring = (poly: readonly Pt2[]): void => {
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!;
            const b = poly[(i + 1) % poly.length]!;
            items.push({ id: `office-rbl-${createId('annotation')}`, levelId, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
        }
    };
    ring(zone.outerPolygon);
    if (zone.innerPolygon && zone.innerPolygon.length >= 3) ring(zone.innerPolygon);
    return items;
}

/** §OFFICE-TOWER-BUILD — a perimeter wall ring from an n-gon footprint: one wall per
 *  edge (consecutive edges share the exact corner endpoint, so the ring closes). */
function buildPerimeterRing(footprint: readonly Pt2[], levelId: string, heightM: number): WallRingPayload {
    const walls: Array<Record<string, unknown>> = [];
    for (let i = 0; i < footprint.length; i++) {
        const a = footprint[i]!;
        const b = footprint[(i + 1) % footprint.length]!;
        walls.push({
            id: createId('wall'),
            levelId,
            baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
            height: heightM,
            thickness: PERIMETER_WALL_THICKNESS_M,
        });
    }
    return { walls, levelId };
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
        const disc = plate.zones[plate.zones.length - 1]!.outerPolygon as readonly Pt2[];
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

                    // (b) Perimeter wall ring (segmented n-gon façade) for this storey.
                    const ring = buildPerimeterRing(disc, levelId, floorToFloorM);
                    this._dispatchWallBatch(runtime, ring, `perimeter-L${index}`);
                    wallCount += ring.walls.length;

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
            });
        } catch (e) {
            console.warn('[office-building] tower batch failed (skipped):', e);
        }

        console.log(
            `[office-building] built ${storeyCount}-storey circular tower — ` +
            `${slabCount} slab(s), ${wallCount} perimeter wall segment(s), ` +
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
}
