/**
 * DxfToBimTracer.ts — Phase 2, §31
 *
 * Heuristic tracer: converts DXF line segments from a selected overlay
 * into wall CommandProposals dispatched to commandProposalStore.
 *
 * CONTRACT (§31 §7.2 AI Trace Rules):
 *   - Opt-in only — invoked explicitly by user action.
 *   - ALL proposals dispatched to commandProposalStore only.
 *   - No proposals auto-applied; user approves each one (§04-BIM-AI-MODIFICATION-PROTOCOL).
 *   - No direct commandManager.execute() calls.
 *   - Minimum wall length: MIN_WALL_LENGTH_M (200mm).
 *   - Only LINE / POLYLINE entities traced — no arcs, circles, or splines.
 *   - Only selected layers are traced.
 */

import { v4 as uuidv4 } from 'uuid';
import * as THREE from '@pryzm/renderer-three/three';
import { commandProposalStore } from '@pryzm/command-registry';
import type { CommandProposal } from '@pryzm/command-registry';
import type { DxfOverlayState } from '@pryzm/input-host';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/** Minimum segment length to generate a wall proposal (§31 Phase 2 rules) */
const MIN_WALL_LENGTH_M = 0.2;

/** Snap-to-axis threshold in degrees */
const AXIS_SNAP_DEG = 15;

export interface TraceOptions {
    /** Layer names to include — undefined means all visible layers */
    layerNames?: string[];
    /** Default wall height in metres */
    wallHeight: number;
    /** Default wall thickness in metres */
    wallThickness: number;
    /** Active level ID to assign to proposed walls */
    levelId: string;
}

interface WallCandidate {
    start: { x: number; z: number };
    end: { x: number; z: number };
    length: number;
    layer: string;
}

/**
 * Trace DXF line segments from the active overlay and push wall proposals
 * to commandProposalStore.
 *
 * @returns number of proposals generated
 */
export function traceDxfToWalls(
    overlayState: DxfOverlayState,
    opts: TraceOptions,
): number {
    const candidates = extractWallCandidates(overlayState, opts);
    if (candidates.length === 0) {
        console.log('[DxfToBimTracer] No eligible line segments found');
        return 0;
    }

    let count = 0;
    for (const c of candidates) {
        // Map to XZ world coords (accounting for group offset)
        const groupPos = overlayState.group.position;
        const startWorld = { x: c.start.x + groupPos.x, z: c.start.z + groupPos.z };
        const endWorld   = { x: c.end.x   + groupPos.x, z: c.end.z   + groupPos.z };

        // Cast to any — DXF trace proposals are intent-only and reviewed
        // before execution. They carry the same payload shape as AI proposals.
        const proposal = {
            id: uuidv4(),
            intentType: 'CreateWall',
            rationale: `Wall traced from DXF layer "${c.layer}" (${c.length.toFixed(2)}m)`,
            confidence: classifyConfidence(c),
            validation: { ok: true, warnings: ['User review required'] },
            command: {
                id: uuidv4(),
                type: 'CreateWall' as any,
                timestamp: Date.now(),
                targetIds: [] as string[],
                params: {
                    start: [startWorld.x, startWorld.z],
                    end:   [endWorld.x,   endWorld.z],
                    height: opts.wallHeight,
                    thickness: opts.wallThickness,
                    levelId: opts.levelId,
                },
                canExecute: () => ({ ok: true }),
                execute: () => ({ success: true, affectedElementIds: [] }),
                undo: () => {},
            },
        } as any as CommandProposal;

        commandProposalStore.add(proposal);
        count++;
    }

    _bus.emit('ai-proposal-added', { count }); // F.events.18
    console.log(`[DxfToBimTracer] Generated ${count} wall proposals from DXF overlay`);
    return count;
}

// ── Internals ──────────────────────────────────────────────────────────────────

function extractWallCandidates(
    overlayState: DxfOverlayState,
    opts: TraceOptions,
): WallCandidate[] {
    const candidates: WallCandidate[] = [];
    const targetLayers = opts.layerNames ? new Set(opts.layerNames) : null;

    for (const child of overlayState.group.children) {
        if (!child.visible) continue;
        const layerName = child.userData?.layerName as string | undefined;
        if (!layerName) continue;
        if (targetLayers && !targetLayers.has(layerName)) continue;

        const ls = child as THREE.LineSegments;
        const geo = ls.geometry;
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
        if (!posAttr) continue;

        // Each segment is a pair of positions
        for (let i = 0; i < posAttr.count; i += 2) {
            const x0 = posAttr.getX(i);     const z0 = posAttr.getZ(i);
            const x1 = posAttr.getX(i + 1); const z1 = posAttr.getZ(i + 1);

            const dx = x1 - x0;
            const dz = z1 - z0;
            const length = Math.sqrt(dx * dx + dz * dz);

            if (length < MIN_WALL_LENGTH_M) continue;

            // Snap near-axis segments
            const { sx, sz, ex, ez } = snapToAxis(x0, z0, x1, z1, AXIS_SNAP_DEG);

            candidates.push({
                start: { x: sx, z: sz },
                end:   { x: ex, z: ez },
                length,
                layer: layerName,
            });
        }
    }

    return candidates;
}

function snapToAxis(
    x0: number, z0: number, x1: number, z1: number, thresholdDeg: number,
): { sx: number; sz: number; ex: number; ez: number } {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const angleDeg = Math.abs(Math.atan2(dz, dx) * (180 / Math.PI));
    const thresh = thresholdDeg;

    // Near horizontal (angle ~ 0 or 180)
    if (angleDeg < thresh || angleDeg > (180 - thresh)) {
        return { sx: x0, sz: z0, ex: x1, ez: z0 };
    }
    // Near vertical (angle ~ 90)
    if (Math.abs(angleDeg - 90) < thresh) {
        return { sx: x0, sz: z0, ex: x0, ez: z1 };
    }
    return { sx: x0, sz: z0, ex: x1, ez: z1 };
}

function classifyConfidence(c: WallCandidate): number {
    // Long axis-aligned segments in wall-related layers get higher confidence
    const isAxisAligned = isNearAxis(c.start, c.end, AXIS_SNAP_DEG);
    const isLong = c.length > 1.0;
    const isWallLayer = /wall|arch|str|elem/i.test(c.layer);

    if (isAxisAligned && isLong && isWallLayer) return 0.90;
    if (isAxisAligned && isLong)                return 0.75;
    if (isAxisAligned)                          return 0.60;
    return 0.45;
}

function isNearAxis(
    start: { x: number; z: number },
    end: { x: number; z: number },
    thresholdDeg: number,
): boolean {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const angleDeg = Math.abs(Math.atan2(dz, dx) * (180 / Math.PI));
    return (angleDeg < thresholdDeg || angleDeg > (180 - thresholdDeg)
         || Math.abs(angleDeg - 90) < thresholdDeg);
}
