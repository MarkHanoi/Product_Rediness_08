// Office building — editor executor (LIGHT, same-day demo slice).
//
// Per the demo scope: rather than full per-desk BIM emission for a 40-storey tower
// (too heavy + risky for same-day), this executor emits the representative CIRCULAR
// FLOOR PLATE on the active level as a demo-visible artifact:
//   (a) a structural SLAB over the circular footprint, and
//   (b) the concentric ZONE rings drawn as room-bounding lines (so the core / desk
//       rings / perimeter offices / circulation read in plan).
// All inside ONE batchCoordinator.runBatch → one undo unit. Zone polygons + the desk
// count + analytics flow through the modal so the floor reads correctly and analytics
// work — exactly the fallback the task sanctions.
//
// P6: every mutation flows through the command bus / commandManager (no direct store
// writes). P2: no THREE here. P8: one OpenTelemetry span at the exported `execute`
// boundary. The pure orchestrator already carries its own spans.

import { trace } from '@opentelemetry/api';
import { batchCoordinator } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import {
    CreateSlabCommand,
    CreateRoomBoundingLinesBatchCommand,
} from '@pryzm/command-registry';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { OfficeBuildingOk, OfficeZone } from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';

const _tracer = trace.getTracer('@pryzm/editor', '0.1.0');
const DEFAULT_SLAB_THICKNESS_M = 0.2;

interface CommandManagerLike {
    execute?: (cmd: unknown, ctx?: { source?: string }) => unknown;
}
function getCommandManager(): CommandManagerLike | undefined {
    return (window as unknown as { commandManager?: CommandManagerLike }).commandManager;
}

interface BoundingLineItem {
    id: string;
    levelId: string;
    start: { x: number; z: number };
    end: { x: number; z: number };
}

/** Convert one zone's outer (and optional inner) polygon into closed bounding-line
 *  segments on `levelId`. The executor draws the ring outlines so room detection
 *  reads the concentric office zones. Pure helper. */
function zoneBoundingLines(zone: OfficeZone, levelId: string): BoundingLineItem[] {
    const items: BoundingLineItem[] = [];
    const ring = (poly: readonly { x: number; z: number }[]): void => {
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            // The bounding-line `id` is a plain string (not a branded ElementType).
            items.push({ id: `office-rbl-${createId('annotation')}`, levelId, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
        }
    };
    ring(zone.outerPolygon);
    if (zone.innerPolygon && zone.innerPolygon.length >= 3) ring(zone.innerPolygon);
    return items;
}

export class OfficeBuildingExecutor {
    /**
     * Build the representative circular office floor plate on the active level.
     * Never throws — logs + returns. P8: one span at the exported boundary.
     */
    async execute(runtime: PryzmRuntime, result: OfficeBuildingOk): Promise<void> {
        return _tracer.startActiveSpan('pryzm.editor.officeBuilding.execute', async (span) => {
            try {
                await this._execute(runtime, result);
                span.setAttribute('pryzm.office.execute.desks', result.representativePlate.analytics.deskCount);
                span.end();
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                console.error('[office-building] execute failed:', err);
            }
        });
    }

    private async _execute(runtime: PryzmRuntime, result: OfficeBuildingOk): Promise<void> {
        const cm = getCommandManager();
        if (!cm?.execute) {
            console.warn('[office-building] commandManager unavailable — nothing built.');
            runtime.events?.emit('pryzm:toast', { message: 'Office building: editor not ready.', severity: 'warn' });
            return;
        }
        const level = resolveActiveLevel();
        if (!level?.id) {
            runtime.events?.emit('pryzm:toast', { message: 'No active level — draw a boundary first.', severity: 'error' });
            return;
        }
        const levelId = level.id;
        const plate = result.representativePlate;

        // The circular footprint (outermost ring = full disc).
        const disc = plate.zones[plate.zones.length - 1].outerPolygon;

        // Collect the concentric zone outlines as room-bounding lines.
        const boundaryItems: BoundingLineItem[] = [];
        for (const zone of plate.zones) boundaryItems.push(...zoneBoundingLines(zone, levelId));

        const allLevelIds = [levelId];
        try {
            batchCoordinator.runBatch(() => {
                // Structural slab over the circular plate.
                if (disc.length >= 3) {
                    const xs = disc.map((p) => p.x), zs = disc.map((p) => p.z);
                    const width = Math.max(...xs) - Math.min(...xs);
                    const depth = Math.max(...zs) - Math.min(...zs);
                    cm.execute?.(new CreateSlabCommand({
                        id: createId('slab'),
                        ifcGuid: createId('slab'),
                        width: Math.max(width, 0.1),
                        depth: Math.max(depth, 0.1),
                        thickness: DEFAULT_SLAB_THICKNESS_M,
                        position: { x: 0, y: 0, z: 0 },
                        levelId,
                        polygon: disc.map((p) => ({ x: p.x, y: p.z })),
                    }), { source: 'OFFICE_PIPELINE_SLAB' });
                }
                // Concentric zone outlines.
                if (boundaryItems.length > 0) {
                    cm.execute?.(new CreateRoomBoundingLinesBatchCommand(boundaryItems));
                }
            }, {
                levelIds: allLevelIds,
                totalElementCount: boundaryItems.length + 1,
                skipRedetectRooms: true,
            });
        } catch (e) {
            console.warn('[office-building] plate batch failed (skipped):', e);
        }

        console.log(
            `[office-building] built representative floor plate on level ${levelId} — ` +
            `${plate.zones.length} zones, ${boundaryItems.length} bounding lines, ` +
            `${result.representativePlate.analytics.deskCount} desks. ${result.diagnostic}`,
        );
        runtime.events?.emit('pryzm:toast', {
            message: `Office floor plate built — ${result.representativePlate.analytics.deskCount} desks, core efficiency ${Math.round(result.analytics.coreEfficiencyRatio * 100)}%.`,
            severity: 'success',
        });
    }
}
