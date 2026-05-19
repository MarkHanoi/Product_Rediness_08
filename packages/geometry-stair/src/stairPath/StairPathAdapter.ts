/**
 * StairPathAdapter — bridges the 2D path solver result to the 3D stair engine.
 *
 * Converts a SolverResult2D (XZ plan view) into the CreateStairInput format
 * that CreateStairCommand / StairStore.add() expects.
 *
 * Rules:
 *   - Does NOT duplicate any stair geometry logic from StairMeshBuilder.
 *   - World Y of start position = baseLevelElevation.
 *   - Flight directions are normalised 3D vectors (Y=0 in plan view).
 *   - Landing depth = stair width (one landing per interior corner).
 *   - Shape classification follows the StairCreationController convention:
 *       I = 1 flight, L = 2 flights, U = 3 flights (mirrored second run).
 *
 * No DOM, no canvas, no Three.js at import time.
 */

import type { SolverResult2D } from './StairSolver2D';
import type { CreateStairInput } from '@pryzm/command-registry';
import type { Vec3 } from '../StairTypes';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface StairPathAdapterConfig {
    baseLevelId:         string;
    topLevelId:          string;
    baseLevelElevation:  number;  // metres
    topLevelElevation:   number;  // metres (used to pass height context)
    typeId?:             string;
    turnDirection?:      'left' | 'right';
    secondRunSide?:      'left' | 'right';
}

export class StairPathAdapter {
    constructor(private config: StairPathAdapterConfig) {}

    updateConfig(patch: Partial<StairPathAdapterConfig>): void {
        Object.assign(this.config, patch);
    }

    /**
     * Convert a solved 2D stair result into a CreateStairInput.
     * Returns null when the result is not valid or has no segments.
     */
    toCreateStairInput(result: SolverResult2D): CreateStairInput | null {
        if (!result.isValid || result.segments.length === 0) return null;

        const { baseLevelId, topLevelId, baseLevelElevation, typeId,
                turnDirection, secondRunSide } = this.config;

        const firstSeg = result.segments[0];
        const startPos: Vec3 = {
            x: firstSeg.start.x,
            y: baseLevelElevation,
            z: firstSeg.start.z,
        };

        // §STAIR-PREVIEW-MATCH-2026-04-25 — Use the tread depth ACTUALLY DERIVED
        // from the user-drawn polyline (totalLength / totalSteps) rather than the
        // ideal preferred depth (`result.treadDepth = this._treadD`).
        //
        // Why: StairSolver2D distributes total risers proportionally across
        // segments (in the auto-distribute case), so per-segment treadDepth is
        // uniform = totalLength / totalSteps.  The 2D plan preview, the 2D HUD
        // labels ("Run N · X risers · Y mm"), and the validator ALL use this
        // derived value.  Passing the IDEAL value to CreateStairCommand caused
        // the committed stair to use a different tread depth, producing a stair
        // that was visibly larger or smaller than the preview — most pronounced
        // for L/U shapes where the discrepancy was 25%+ ("preview way smaller
        // than the actual stair", per Contract 19 violation).
        //
        // For the explicit-split case (risersBeforeLanding > 0) per-segment
        // tread depths can differ; we use the average as the best single-value
        // approximation since CreateStairCommand only carries one treadDepth.
        const totalLen = result.segments.reduce((s, seg) => s + seg.length, 0);
        const derivedTreadDepth = result.totalSteps > 0 && totalLen > 0
            ? totalLen / result.totalSteps
            : result.treadDepth;

        // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — Build flights with PER-FLIGHT tread
        // depth (= segment.length / segment.stepCount). The 2D solver already
        // computes this on each segment as `seg.treadDepth`, but until now only
        // a single averaged tread depth was carried into CreateStairInput, which
        // caused multi-segment flights to under/over-fill their drawn polyline
        // segments.
        const flights: {
            direction: Vec3;
            riserCount: number;
            startOverride?: Vec3;
            treadDepth?: number;
        }[] = result.segments.map((seg) => ({
            direction:  { x: seg.dir.x, y: 0, z: seg.dir.z },
            riserCount: seg.stepCount,
            // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — per-flight tread depth uses
            // the FLIGHT length (= segment length minus landing consumption).
            // The solver's seg.treadDepth already equals flightLength/stepCount,
            // so this gives each flight exactly its drawn flight portion.
            treadDepth: seg.flightLength > 0 && seg.stepCount > 0
                ? seg.flightLength / seg.stepCount
                : derivedTreadDepth,
            startOverride: undefined as Vec3 | undefined,
        }));

        // ── startOverride for non-first flights ──────────────────────────────
        //
        // §STAIR-PREVIEW-MATCH-2026-04-25 v2: for L-shape (single 90° corner)
        // and U-3-run (two 90° corners) we now PIN every non-first flight's start
        // to the user-drawn polyline corner.  Previously these cases relied on
        // the mesh builder's landing-advance code, which offset flight 2 by
        // `(treadDepth/2 + width/2)` past the corner — making the 3D footprint
        // extend ~½ width beyond the user's drawn polyline.  With per-flight
        // tread depth + corner-pinned startOverride, the 3D footprint matches
        // the 2D preview exactly: each flight occupies its drawn segment, and
        // the landing sits centred on the corner.
        //
        // U-2-run (single ~180° switchback) keeps its dedicated startOverride
        // because the two runs are PARALLEL (not corner-connected); the second
        // run sits laterally offset by one stair width.

        const isUTwoRun = result.shape === 'U' && result.segments.length === 2;

        if (isUTwoRun) {
            const seg1   = result.segments[0];
            const corner = result.landings[0]?.corner;
            if (corner) {
                // Left-hand perpendicular to seg1.dir (matches StairMeshBuilder's perpDir).
                const perpDirX = -seg1.dir.z;
                const perpDirZ =  seg1.dir.x;
                // Use seg1's PER-SEGMENT tread depth (= flights[0].treadDepth) so
                // the U-2 startOverride stays consistent with what flight 1 actually
                // occupies along the travel axis.
                const seg1Tread = flights[0].treadDepth ?? derivedTreadDepth;
                flights[1].startOverride = {
                    x: corner.x + seg1.dir.x * seg1Tread + perpDirX * result.width,
                    y: baseLevelElevation,
                    z: corner.z + seg1.dir.z * seg1Tread + perpDirZ * result.width,
                };
            }
        } else {
            // L-shape (1 corner) and U-3-run (2 corners): pin every non-first
            // flight's start to the FLIGHT-START point of its segment (= corner
            // offset by half the landing's depth along the outbound direction),
            // not the polyline corner itself.  The landing then sits centred on
            // the polyline corner via `landings[].center` (set below) so the
            // landing physically occupies the consumed portion of both adjacent
            // segments — which is exactly what the 2D preview now draws.
            //
            // §STAIR-PREVIEW-MATCH-2026-04-25 v3.
            for (let i = 1; i < result.segments.length; i++) {
                const fStart = result.segments[i].flightStart;
                if (fStart) {
                    flights[i].startOverride = {
                        x: fStart.x,
                        y: baseLevelElevation,
                        z: fStart.z,
                    };
                }
            }
        }

        // Build landings array (one per interior corner).
        // Anti-parallel adjacent runs → U-style landing of depth 2*width.
        // Otherwise (90° corner) → L-style landing of depth = width.
        //
        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — for 90° corners we also pass the
        // landing CENTRE (= polyline corner).  The mesh builder's L-shape
        // branch then places the landing centred on the corner regardless of
        // where flight 1 actually ended (which now stops short of the corner
        // because of landing consumption).  Switchback U-2 landings keep their
        // existing flight-1-relative placement (no `center` override).
        const landings: { depth: number; center?: Vec3 }[] = result.landings.map((landing, i) => {
            const a = result.segments[i]?.dir;
            const b = result.segments[i + 1]?.dir;
            const dot = a && b ? a.x * b.x + a.z * b.z : 0;
            const isSwitchback = dot < -0.7;
            const corner = landing.corner;
            return {
                depth: isSwitchback ? result.width * 2 : result.width,
                center: isSwitchback
                    ? undefined
                    : { x: corner.x, y: baseLevelElevation, z: corner.z },
            };
        });

        // Shape mapping (I/L/U — complex shapes default to L for 3D)
        const shape3D =
            result.shape === 'I' ? 'I' :
            result.shape === 'U' ? 'U' : 'L';

        const input: CreateStairInput = {
            baseLevelId,
            topLevelId,
            shape:            shape3D,
            riserHeight:      result.riserHeight,
            // §STAIR-PREVIEW-MATCH-2026-04-25 — derived treadDepth (totalLen/totalSteps)
            // makes the committed stair runs match the user-drawn polyline lengths.
            treadDepth:       derivedTreadDepth,
            width:            result.width,
            startPosition:    startPos,
            flights,
            landings,
            typeId,
            turnDirection:    turnDirection ?? 'left',
            secondRunSide:    secondRunSide ?? 'left',
        };

        return input;
    }

    /**
     * Fire a live 3D preview via the existing StairCreationController mechanism.
     * Uses window CustomEvents so the StairMeshBuilder can react without coupling.
     *
     * This is intentionally lightweight: we dispatch a bim-stair-updated event
     * with isPreview=true, matching what StairCreationController.updatePreview() does.
     */
    dispatchLivePreview(result: SolverResult2D): void {
        const input = this.toCreateStairInput(result);
        if (!input) return;

        const now = new Date().toISOString();

        const previewStair = {
            id:            'stair-path-preview',
            type:          'stair' as const,
            levelId:       'preview',
            baseLevelId:   input.baseLevelId || 'preview',
            topLevelId:    input.topLevelId  || 'preview',
            baseOffset:    0,
            topOffset:     0,
            shape:         input.shape,
            startPosition: input.startPosition,
            width:         input.width,
            riserHeight:   input.riserHeight,
            treadDepth:    input.treadDepth,
            riserCount:    result.totalSteps,
            flights:       input.flights,
            landings:      input.landings,
            turnDirection: input.turnDirection,
            secondRunSide: input.secondRunSide,
            properties: {
                riserVisible:     true,
                nosingType:       'standard' as const,
                nosingDepth:      0.025,
                stringerType:     'none' as const,
                handrailLeft:     false,
                handrailRight:    false,
                handrailHeight:   0.9,
            },
            parameters: {},
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                version:    0,
                source:     'user' as const,
            },
        };

        _bus.emit('bim-stair-updated', { id: previewStair.id }); // F.events.18
    }

    /**
     * Remove the live preview mesh from the 3D scene.
     */
    clearLivePreview(): void {
        _bus.emit('bim-stair-removed', { id: 'stair-path-preview' }); // F.events.18
    }
}
