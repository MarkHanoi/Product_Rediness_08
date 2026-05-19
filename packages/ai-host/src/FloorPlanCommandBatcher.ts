/**
 * @file FloorPlanCommandBatcher.ts
 * @description Converts FloorPlanAnalysis into CommandProposal[] and pushes them
 * to commandProposalStore.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - NEVER mutates stores directly.
 *  - NEVER calls builders.
 *  - Creates concrete Command instances (IDs generated here, Tool layer §2.6).
 *  - Proposals are tagged with source: 'pdf_import' for grouping in AI Actions.
 *  - All coordinate mapping is done via FloorPlanUnderlayTool.pixelToWorld().
 *  - Post-processing (endpoint snapping, merge) is deterministic, zero AI cost.
 *
 * PHASE A CHANGES (from audit):
 *  - CORNER_SNAP_THRESHOLD_M reduced 0.20 → 0.10 (FIX-8a: prevents over-merging distinct walls)
 *  - MIN_WALL_LENGTH_M = 0.15 added — walls shorter than 15cm are filtered as artefacts (FIX-8b)
 *  - DUPLICATE_WALL_THRESHOLD_M = 0.25 added — duplicate wall detection implemented (FIX-8c)
 *  - FIX-3 implemented: opening-to-wall spatial proximity fallback when hostWallId lookup fails
 *
 * PHASE D CHANGES (PDF_TO_BIM_DEEP_AUDIT §14 Phase D):
 *  - applyCornerSnap() removed — replaced by WallIntersectionResolver.resolveWallJunctions()
 *    which adds angle-aware corner merging and T-junction snapping.
 *  - detectAndLogCrossings() called after junction resolution to log true wall crossings
 *    (segment splitting deferred to Phase E).
 *  - buildWallGraph() called after the main wall loop to construct the node-edge adjacency
 *    structure from accepted walls (foundation for Phase E topology).
 *  - BatchResult now includes wallGraph: WallGraph for downstream Phase E consumption.
 *
 * PHASE E CHANGES (PDF_TO_BIM_DEEP_AUDIT §14 Phase E):
 *  - detectAndLogCrossings() replaced by splitWallsAtCrossings() — true crossing walls are
 *    now split at their intersection point into sub-segments before the wall loop, giving
 *    the WallGraph correct topology at every node (Phase E Step 1 prerequisite).
 *  - computeTopology(wallGraph) called after buildWallGraph() to derive rooms and outer face.
 *  - Slab: Phase E uses the mathematically computed outer face polygon (topology.outerFacePolygon)
 *    expanded by EXTERIOR_HALF_THICKNESS (0.10 m). Falls back to AI slab if no valid outer face.
 *  - Openings: assignOpeningsToWalls() provides deterministic graph-based spatial assignment
 *    as the PRIMARY lookup — no AI hostWallId memory needed. Falls back to wallAiIdToEntry
 *    only when the spatial assignment misses (opening > 0.5 m from all walls).
 *  - BatchResult now includes rooms: DetectedRoom[] for downstream consumption.
 *
 * DOOR FIX v2 CHANGES:
 *  - Gap-probe tiebreaker added to opening wall assignment: after graph spatial assignment
 *    selects a host wall, findCollinearEndpoints() is run as a probe. If it returns null
 *    (no real gap on the assigned wall), all accepted walls are scanned by perpendicular
 *    distance and the nearest wall WITH a confirmed gap wins instead. This fixes cases where
 *    the opening centre is equidistant from two walls and the graph picks the wrong one.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { v4 as uuid } from 'uuid';
import { CommandProposal } from '@pryzm/command-registry';
import { CreateWallCommand } from '@pryzm/command-registry';
import { CreateSlabCommand } from '@pryzm/command-registry';
import { CreateFurnitureCommand } from '@pryzm/command-registry';
import { CreatePlumbingFixtureCommand } from '@pryzm/command-registry';
import { FloorPlanAnalysis, DetectedWall } from './FloorPlanAIFactory.js';
import { FloorPlanUnderlayTool } from '@pryzm/input-host';
import { FurnitureType } from '@pryzm/geometry-furniture';
import { CreateWallOpeningCommand } from '@pryzm/command-registry';
import {
    resolveWallJunctions,
    splitWallsAtCrossings,
    buildWallGraph,
    WallGraph,
} from './WallIntersectionResolver.js';
import {
    computeTopology,
    assignOpeningsToWalls,
    DetectedRoom,
} from './PlanarTopologyEngine.js';
import {
    type WallDiagnosticRecord,
    type PostProcessingStats,
    type OpeningDiagnosticRecord,
} from './FloorPlanDiagnostics.js';
import {
    WallCandidateScorer,
    type ResolvedWall,
    type ResolvedOpening,
} from './WallCandidateScorer.js';
import { findCollinearEndpoints } from './DoorGeometricValidator.js';
import {
    PARALLEL_WALL_MIN_SEP_M,
    PARALLEL_WALL_ANGLE_TOL_DEG,
    PARALLEL_WALL_OVERLAP_RATIO,
} from './PdfToBimConstraints.js';
import { detectGeometricDoorGaps } from './WallTerminatorDoorDetector.js';

// ── Config ─────────────────────────────────────────────────────────────────────

const SNAP_GRID_M = 0.05;

/**
 * Phase D: Corner junction threshold passed to WallIntersectionResolver.
 * Two endpoints within this distance are merged if the wall angle is valid (≥ 20°).
 * Kept at 0.10 m — same value as the former CORNER_SNAP_THRESHOLD_M (FIX-8a).
 */
const CORNER_SNAP_THRESHOLD_M = 0.10;

/**
 * FIX-8b: Minimum wall length after world-space conversion.
 * Walls shorter than 15cm are almost always rasterization artefacts or
 * dimension-line stubs — they are filtered before proposal creation.
 */
const MIN_WALL_LENGTH_M = 0.15;

/**
 * FIX-8c: Duplicate wall detection threshold.
 * A wall whose both endpoints match an already-accepted wall within this
 * distance (in either direction) is considered a duplicate and skipped.
 */
const DUPLICATE_WALL_THRESHOLD_M = 0.25;

const DEFAULT_WALL_HEIGHT = 3.0;
const DEFAULT_WALL_THICKNESS = 0.2;
const DEFAULT_SLAB_THICKNESS = 0.2;

// ── Furniture type mapping ─────────────────────────────────────────────────────

const FURNITURE_TYPE_MAP: Record<string, FurnitureType> = {
    bed: 'bed',
    wardrobe: 'wardrobe',
    corner_wardrobe: 'corner_wardrobe',
    sofa: 'corner_sofa',
    corner_sofa: 'corner_sofa',
    white_corner_sofa: 'white_corner_sofa',
    dining_table: 'dining_table',
    dining_chair: 'dining_chair',
    coffee_table: 'coffee_table',
    bedside_table: 'bedside_table',
    entrance_table: 'entrance_table',
    shower_glass_panel: 'shower_glass_panel',
};

const PLUMBING_TYPE_MAP: Record<string, 'toilet' | 'sink' | 'bath'> = {
    toilet: 'toilet',
    sink: 'sink',
    bath: 'bath',
};

// ── Snap helpers ───────────────────────────────────────────────────────────────

function snapToGrid(v: number, gridSize: number): number {
    return Math.round(v / gridSize) * gridSize;
}

function snapVec3(v: THREE.Vector3, gridSize: number): THREE.Vector3 {
    return new THREE.Vector3(
        snapToGrid(v.x, gridSize),
        v.y,
        snapToGrid(v.z, gridSize),
    );
}

/**
 * FIX-3 helper: perpendicular distance from a 2D point to a line segment (XZ plane),
 * and the projected offset along the segment.
 * Returns { distance, projectedOffset } where projectedOffset is clamped to [0, segLen].
 */
function pointToSegmentDistanceXZ(
    point: THREE.Vector3,
    segStart: THREE.Vector3,
    segEnd: THREE.Vector3,
): { distance: number; projectedOffset: number } {
    const segVec = new THREE.Vector3(segEnd.x - segStart.x, 0, segEnd.z - segStart.z);
    const segLen = segVec.length();
    if (segLen < 0.001) {
        return {
            distance: new THREE.Vector3(point.x - segStart.x, 0, point.z - segStart.z).length(),
            projectedOffset: 0,
        };
    }
    const segDir = segVec.clone().normalize();
    const toPoint = new THREE.Vector3(point.x - segStart.x, 0, point.z - segStart.z);
    const proj = Math.max(0, Math.min(segLen, toPoint.dot(segDir)));
    const closestX = segStart.x + segDir.x * proj;
    const closestZ = segStart.z + segDir.z * proj;
    const dist = new THREE.Vector3(point.x - closestX, 0, point.z - closestZ).length();
    return { distance: dist, projectedOffset: proj };
}

// ── Confidence boost helper ────────────────────────────────────────────────────

function boostConfidence(
    raw: 'high' | 'medium' | 'low',
    boost: boolean,
): 'high' | 'medium' | 'low' {
    if (!boost) return raw;
    if (raw === 'low') return 'medium';
    if (raw === 'medium') return 'high';
    return 'high';
}

// ── Default furniture dimensions (meters) ──────────────────────────────────────

const FURNITURE_DEFAULTS: Record<string, { width: number; length: number; height: number }> = {
    bed: { width: 1.6, length: 2.0, height: 0.5 },
    wardrobe: { width: 1.2, length: 0.6, height: 2.2 },
    corner_wardrobe: { width: 1.5, length: 1.5, height: 2.2 },
    sofa: { width: 2.0, length: 0.85, height: 0.85 },
    corner_sofa: { width: 2.4, length: 1.6, height: 0.85 },
    white_corner_sofa: { width: 2.4, length: 1.6, height: 0.85 },
    dining_table: { width: 1.6, length: 0.9, height: 0.75 },
    dining_chair: { width: 0.45, length: 0.45, height: 0.9 },
    coffee_table: { width: 1.0, length: 0.5, height: 0.45 },
    bedside_table: { width: 0.5, length: 0.4, height: 0.55 },
    entrance_table: { width: 0.8, length: 0.3, height: 0.8 },
    shower_glass_panel: { width: 0.9, length: 0.9, height: 2.0 },
    toilet: { width: 0.36, length: 0.66, height: 0.8 },
    sink: { width: 0.5, length: 0.4, height: 0.85 },
    bath: { width: 0.75, length: 1.7, height: 0.6 },
};

// ── Main batcher ───────────────────────────────────────────────────────────────

export interface BatchOptions {
    analysis: FloorPlanAnalysis;
    underlayTool: FloorPlanUnderlayTool;
    targetLevelId: string;
    wallHeight?: number;
    includeWalls?: boolean;
    includeSlab?: boolean;
    includeFurniture?: boolean;
    includePlumbing?: boolean;
    includeOpenings?: boolean;
}

export interface BatchResult {
    proposals: CommandProposal[];
    skippedCount: number;
    summary: {
        walls: number;
        slab: number;
        furniture: number;
        plumbing: number;
        openings: number;
        rooms: number;
    };
    /** Wall UUID → world start/end (XZ plane) — used by the import panel room overlay renderer. */
    wallUUIDToWorld: Map<string, { worldStart: { x: number; z: number }; worldEnd: { x: number; z: number } }>;
    wallGraph: WallGraph;
    rooms: DetectedRoom[];
    wallDiagnostics: WallDiagnosticRecord[];
    postProcessingStats: PostProcessingStats;
    openingDiagnostics: OpeningDiagnosticRecord[];
}

export class FloorPlanCommandBatcher {
    static batch(options: BatchOptions): BatchResult {
        const {
            analysis,
            underlayTool,
            targetLevelId,
            wallHeight = DEFAULT_WALL_HEIGHT,
            includeWalls = true,
            includeSlab = true,
            includeFurniture = true,
            includePlumbing = true,
            includeOpenings = true,
        } = options;

        const proposals: CommandProposal[] = [];
        let skipped = 0;
        const summary = { walls: 0, slab: 0, furniture: 0, plumbing: 0, openings: 0, rooms: 0 };

        // ── Diagnostic tracking ────────────────────────────────────────────────
        const wallDiagnostics: WallDiagnosticRecord[] = [];
        const openingDiagnostics: OpeningDiagnosticRecord[] = [];
        const diagStats: PostProcessingStats = {
            tJunctionSnaps: 0,
            cornerMerges: 0,
            crossingSplits: 0,
            tooShortSkipped: 0,
            duplicateSkipped: 0,
            pixelMapFailed: 0,
            isolatedAnnotationSkipped: 0,
            wallsAccepted: 0,
            wallScorerRejected: 0,
            wallScorerReview: 0,
        };

        // ── 1. Walls ────────────────────────────────────────────────────────────
        const acceptedWalls: Array<{
            wallUUID: string;
            start: THREE.Vector3;
            end: THREE.Vector3;
            data: DetectedWall;
        }> = [];

        const wallAiIdToEntry = new Map<string, {
            wallUUID: string;
            worldStart: THREE.Vector3;
            worldEnd: THREE.Vector3;
        }>();

        if (includeWalls) {
            // Step a+b: convert all walls to world space + grid snap
            const wallCoordsRaw: Array<{ start: THREE.Vector3; end: THREE.Vector3; data: DetectedWall }> = [];

            for (const w of analysis.walls) {
                const startWorld = underlayTool.pixelToWorld(w.startPx.x, w.startPx.y);
                const endWorld = underlayTool.pixelToWorld(w.endPx.x, w.endPx.y);
                if (!startWorld || !endWorld) {
                    skipped++;
                    diagStats.pixelMapFailed++;
                    wallDiagnostics.push({
                        index: wallDiagnostics.length,
                        aiId: w.id,
                        aiWallType: w.wallType,
                        aiConfidence: w.confidence,
                        rawPixel: {
                            startPx: w.startPx,
                            endPx: w.endPx,
                            thicknessPx: w.thicknessPx,
                        },
                        worldCoords: null,
                        postProcessing: { isCrossingSplit: false },
                        skipReason: 'pixel_map_failed',
                        status: 'skipped',
                    });
                    continue;
                }

                wallCoordsRaw.push({
                    start: snapVec3(startWorld, SNAP_GRID_M),
                    end: snapVec3(endWorld, SNAP_GRID_M),
                    data: w,
                });
            }

            // Step c1+c2: T-junction and angle-aware corner snap
            const junctionStats = resolveWallJunctions(wallCoordsRaw, CORNER_SNAP_THRESHOLD_M);
            diagStats.tJunctionSnaps = junctionStats.tSnaps;
            diagStats.cornerMerges   = junctionStats.cornerSnaps;

            // Step c2b — Near-miss wall extension pass (inline, no resolver dependency)
            //
            // PURPOSE: Catches walls that stop just short of another wall's centreline —
            // specifically w5 not reaching w12, and w14 not reaching w5 in corridor plans.
            // resolveWallJunctions() uses a 0.15m T-junction threshold. This pass runs at
            // up to 0.50m for endpoints that STILL have no close neighbour after Pass 1.
            //
            // GUARD: only fires on endpoints with no wall neighbour within 0.25m already
            // (prevents double-snapping correctly-resolved junctions).
            //
            // CORRIDOR SAFETY: will not merge walls that should be corridor walls because
            // those walls face each other across open space — they don't have endpoints
            // pointing toward each other. This only fires on endpoints pointing INTO
            // another wall's body (t ∈ [0.05, 0.95] on the target segment).
            {
                const NEAR_MISS_SEARCH_M    = 0.50; // search radius for unconnected endpoints
                const ALREADY_CONNECTED_M   = 0.25; // skip if already has a neighbour this close
                const T_INTERIOR_MIN        = 0.05;
                const T_INTERIOR_MAX        = 0.95;

                for (let i = 0; i < wallCoordsRaw.length; i++) {
                    for (const key of ['start', 'end'] as const) {
                        const ep = wallCoordsRaw[i]![key]!;

                        // Skip if already connected — has a neighbour within ALREADY_CONNECTED_M
                        let alreadyConnected = false;
                        outer: for (let k = 0; k < wallCoordsRaw.length; k++) {
                            if (k === i) continue;
                            for (const kPt of [wallCoordsRaw[k]!.start, wallCoordsRaw[k]!.end]) {
                                const ddx = ep.x - kPt.x;
                                const ddz = ep.z - kPt.z;
                                if (Math.sqrt(ddx * ddx + ddz * ddz) < ALREADY_CONNECTED_M) {
                                    alreadyConnected = true;
                                    break outer;
                                }
                            }
                        }
                        if (alreadyConnected) continue;

                        // Find the nearest wall interior point within NEAR_MISS_SEARCH_M
                        let bestDist = NEAR_MISS_SEARCH_M;
                        let bestSnap: THREE.Vector3 | null = null;

                        for (let j = 0; j < wallCoordsRaw.length; j++) {
                            if (j === i) continue;
                            const segStart = wallCoordsRaw[j]!.start;
                            const segEnd   = wallCoordsRaw[j]!.end;
                            const sdx = segEnd.x - segStart.x;
                            const sdz = segEnd.z - segStart.z;
                            const segLen2 = sdx * sdx + sdz * sdz;
                            if (segLen2 < 1e-8) continue;

                            const t = Math.max(0, Math.min(1,
                                ((ep.x - segStart.x) * sdx + (ep.z - segStart.z) * sdz) / segLen2,
                            ));
                            // Only interior points — endpoint-to-endpoint handled by corner pass
                            if (t < T_INTERIOR_MIN || t > T_INTERIOR_MAX) continue;

                            const cx = segStart.x + t * sdx;
                            const cz = segStart.z + t * sdz;
                            const dist = Math.sqrt((ep.x - cx) ** 2 + (ep.z - cz) ** 2);
                            if (dist < bestDist) {
                                bestDist = dist;
                                bestSnap = new THREE.Vector3(cx, 0, cz);
                            }
                        }

                        if (bestSnap) {
                            console.debug(
                                `[FloorPlanCommandBatcher] Near-miss snap: wall[${i}].${key} ` +
                                `(${ep.x.toFixed(3)},${ep.z.toFixed(3)}) → ` +
                                `(${bestSnap.x.toFixed(3)},${bestSnap.z.toFixed(3)}) ` +
                                `dist=${bestDist.toFixed(3)}m`,
                            );
                            ep.copy(bestSnap);
                            diagStats.tJunctionSnaps++;
                        }
                    }
                }
            }

            // Step c3: Split crossing walls at their intersection points
            const { result: splitEntries, splitCount } = splitWallsAtCrossings(wallCoordsRaw);
            diagStats.crossingSplits = splitCount;

            let wallCoords: Array<{ start: THREE.Vector3; end: THREE.Vector3; data: DetectedWall }>;
            if (splitCount === 0) {
                wallCoords = wallCoordsRaw;
            } else {
                const parentSegCount = new Map<number, number>();
                for (const se of splitEntries) {
                    parentSegCount.set(se.parentIdx, (parentSegCount.get(se.parentIdx) ?? 0) + 1);
                }
                const parentSegIdx = new Map<number, number>();
                wallCoords = splitEntries.map(se => {
                    const count = parentSegCount.get(se.parentIdx) ?? 1;
                    const segIdx = parentSegIdx.get(se.parentIdx) ?? 0;
                    parentSegIdx.set(se.parentIdx, segIdx + 1);
                    const parentData = wallCoordsRaw[se.parentIdx]!.data;
                    return {
                        start: se.start,
                        end: se.end,
                        data: count > 1
                            ? { ...parentData, id: `${parentData.id}_s${segIdx}` }
                            : parentData,
                    };
                });
            }

            // Step f: WallCandidateScorer
            const scorerResolvedWalls: ResolvedWall[] = wallCoords.map(wc => ({
                wallUUID:    wc.data.id,
                aiId:        wc.data.id,
                start:       wc.start,
                end:         wc.end,
                thicknessPx: wc.data.thicknessPx,
                aiWallType:  wc.data.wallType,
                rawPixel: {
                    startPx: wc.data.startPx,
                    endPx:   wc.data.endPx,
                },
            }));

            const scorerResolvedOpenings: ResolvedOpening[] = analysis.openings.map(o => ({
                id:            o.id,
                hostWallAiId:  o.hostWallId,
                type:          o.type,
            }));

            const pxPerMeterForScoring = underlayTool.getState()?.pxPerMeter ?? 100;
            const wallScoreResults = new WallCandidateScorer().score(
                scorerResolvedWalls,
                scorerResolvedOpenings,
                analysis.imageDimensions.widthPx,
                analysis.imageDimensions.heightPx,
                pxPerMeterForScoring,
            );

            const wallScoreMap = new Map(wallScoreResults.map(s => [s.wallUUID, s]));

            for (const wc of wallCoords) {
                const { start, end, data } = wc;
                const wallLength = start.distanceTo(end);

                const splitMatch = data.id.match(/^(.+)_s\d+$/);
                const isCrossingSplit = splitMatch !== null;
                const splitFromAiId  = splitMatch ? splitMatch[1] : undefined;

                const rawPixel = {
                    startPx: data.startPx,
                    endPx:   data.endPx,
                    thicknessPx: data.thicknessPx,
                };

                const thicknessRawM = data.thicknessPx / analysis.imageDimensions.widthPx *
                    (underlayTool.getState()?.planWidthMeters ?? 10);
                const thicknessSnapped = snapToGrid(thicknessRawM, SNAP_GRID_M);
                const thickness = data.wallType === 'exterior'
                    ? Math.max(0.20, Math.min(0.40, thicknessSnapped))
                    : data.wallType === 'interior'
                        ? Math.max(0.10, Math.min(0.25, thicknessSnapped))
                        : Math.max(0.10, Math.min(0.50, thicknessSnapped));

                // Step d: minimum wall length filter
                if (wallLength < MIN_WALL_LENGTH_M) {
                    skipped++;
                    diagStats.tooShortSkipped++;
                    wallDiagnostics.push({
                        index:        wallDiagnostics.length,
                        aiId:         data.id,
                        aiWallType:   data.wallType,
                        aiConfidence: data.confidence,
                        rawPixel,
                        worldCoords: {
                            start:          { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
                            end:            { x: parseFloat(end.x.toFixed(4)),   z: parseFloat(end.z.toFixed(4)) },
                            lengthM:        parseFloat(wallLength.toFixed(4)),
                            thicknessM:     parseFloat(thickness.toFixed(4)),
                            thicknessRawM:  parseFloat(thicknessRawM.toFixed(4)),
                        },
                        postProcessing: { isCrossingSplit, ...(splitFromAiId !== undefined ? { splitFromAiId } : {}) },
                        skipReason: 'too_short',
                        status: 'skipped',
                    });
                    continue;
                }

                // Step e: duplicate wall detection (FIX-8c + near-parallel face-line fix)
                //
                // TWO checks:
                // (A) Endpoint match — catches truly identical walls (both endpoints within threshold).
                // (B) Near-parallel face-line dedup — catches cases where Claude reports BOTH the
                //     inner and outer face of an exterior wall as separate wall segments. These have
                //     parallel directions and their centrelines are < PARALLEL_WALL_MIN_SEP_M apart
                //     but their endpoints do NOT match (offset by wall thickness ~0.3m each end).
                //     Without this, w2/w3, w4/w5, w16/w17 face-line duplicates are never caught.
                //
                // PARALLEL_WALL_MIN_SEP_M (imported from PdfToBimConstraints) = 0.70m.
                // Covers all realistic wall face-line pairs (exterior ≤ 0.40m, interior ≤ 0.20m)
                // without collapsing real parallel corridor walls (always ≥ 0.80m apart).

                const isDuplicate = acceptedWalls.some(accepted => {
                    // (A) Endpoint match check (original FIX-8c)
                    const endpointMatch =
                        (accepted.start.distanceTo(start) < DUPLICATE_WALL_THRESHOLD_M &&
                         accepted.end.distanceTo(end) < DUPLICATE_WALL_THRESHOLD_M) ||
                        (accepted.start.distanceTo(end) < DUPLICATE_WALL_THRESHOLD_M &&
                         accepted.end.distanceTo(start) < DUPLICATE_WALL_THRESHOLD_M);
                    if (endpointMatch) return true;

                    // (B) Near-parallel face-line check — uses PdfToBimConstraints thresholds
                    const aLen = accepted.start.distanceTo(accepted.end);
                    const bLen = start.distanceTo(end);
                    if (aLen < 0.01 || bLen < 0.01) return false;

                    const aDx = (accepted.end.x - accepted.start.x) / aLen;
                    const aDz = (accepted.end.z - accepted.start.z) / aLen;
                    const bDx = (end.x - start.x) / bLen;
                    const bDz = (end.z - start.z) / bLen;

                    // Must be nearly parallel (within PARALLEL_WALL_ANGLE_TOL_DEG)
                    const dot = Math.abs(aDx * bDx + aDz * bDz);
                    const angleDeg = (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
                    if (angleDeg > PARALLEL_WALL_ANGLE_TOL_DEG) return false;

                    // Perpendicular distance between centrelines must be < PARALLEL_WALL_MIN_SEP_M
                    const toPtX = start.x - accepted.start.x;
                    const toPtZ = start.z - accepted.start.z;
                    const perpDist = Math.abs(toPtX * aDz - toPtZ * aDx);
                    if (perpDist >= PARALLEL_WALL_MIN_SEP_M) return false;

                    // Must share ≥ PARALLEL_WALL_OVERLAP_RATIO projected overlap along accepted axis
                    const proj0 = (start.x - accepted.start.x) * aDx + (start.z - accepted.start.z) * aDz;
                    const proj1 = (end.x   - accepted.start.x) * aDx + (end.z   - accepted.start.z) * aDz;
                    const overlapStart = Math.max(0,    Math.min(proj0, proj1));
                    const overlapEnd   = Math.min(aLen, Math.max(proj0, proj1));
                    const overlapLen   = overlapEnd - overlapStart;
                    const minLen       = Math.min(aLen, bLen);
                    return overlapLen >= minLen * PARALLEL_WALL_OVERLAP_RATIO;
                });
                if (isDuplicate) {
                    skipped++;
                    diagStats.duplicateSkipped++;
                    wallDiagnostics.push({
                        index:        wallDiagnostics.length,
                        aiId:         data.id,
                        aiWallType:   data.wallType,
                        aiConfidence: data.confidence,
                        rawPixel,
                        worldCoords: {
                            start:          { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
                            end:            { x: parseFloat(end.x.toFixed(4)),   z: parseFloat(end.z.toFixed(4)) },
                            lengthM:        parseFloat(wallLength.toFixed(4)),
                            thicknessM:     parseFloat(thickness.toFixed(4)),
                            thicknessRawM:  parseFloat(thicknessRawM.toFixed(4)),
                        },
                        postProcessing: { isCrossingSplit, ...(splitFromAiId !== undefined ? { splitFromAiId } : {}) },
                        skipReason: 'duplicate',
                        status: 'skipped',
                    });
                    continue;
                }

                // WallCandidateScorer decision
                const wallScore = wallScoreMap.get(data.id);
                if (data.wallType !== 'exterior' && wallScore?.decision === 'reject') {
                    skipped++;
                    diagStats.wallScorerRejected++;
                    wallDiagnostics.push({
                        index:        wallDiagnostics.length,
                        aiId:         data.id,
                        aiWallType:   data.wallType,
                        aiConfidence: data.confidence,
                        rawPixel,
                        worldCoords: {
                            start:          { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
                            end:            { x: parseFloat(end.x.toFixed(4)),   z: parseFloat(end.z.toFixed(4)) },
                            lengthM:        parseFloat(wallLength.toFixed(4)),
                            thicknessM:     parseFloat(thickness.toFixed(4)),
                            thicknessRawM:  parseFloat(thicknessRawM.toFixed(4)),
                        },
                        postProcessing: { isCrossingSplit, ...(splitFromAiId !== undefined ? { splitFromAiId } : {}) },
                        skipReason: 'low_wall_score',
                        status: 'skipped',
                        wallScore: {
                            totalScore: wallScore.totalScore,
                            breakdown:  wallScore.breakdown,
                            decision:   wallScore.decision,
                        },
                    });
                    continue;
                }

                const isReviewFlagged =
                    data.wallType !== 'exterior' && wallScore?.decision === 'review';
                if (isReviewFlagged) diagStats.wallScorerReview++;

                const connectsCorner = acceptedWalls.some(
                    other =>
                        other.start.distanceTo(start) < 0.01 || other.end.distanceTo(start) < 0.01 ||
                        other.start.distanceTo(end)   < 0.01 || other.end.distanceTo(end)   < 0.01,
                );
                const boostedConf = boostConfidence(data.confidence, connectsCorner);

                const wallId = uuid();

                const cmd = new CreateWallCommand(wallId, {
                    start: { x: start.x, z: start.z },
                    end: { x: end.x, z: end.z },
                    height: wallHeight,
                    thickness: thickness || DEFAULT_WALL_THICKNESS,
                    levelId: targetLevelId,
                });

                const wallTypeLabel = data.wallType === 'exterior' ? 'Exterior' : 'Interior';
                const reviewMarker  = isReviewFlagged ? ' ⚠ review' : '';
                proposals.push({
                    id: uuid(),
                    intentType: 'PDF_IMPORT_WALL',
                    command: cmd,
                    rationale: `[PDF Import] ${wallTypeLabel} wall — confidence: ${boostedConf}${reviewMarker}`,
                    validation: { ok: true },
                    confidence: boostedConf === 'high' ? 0.95 : boostedConf === 'medium' ? 0.75 : 0.5,
                });
                summary.walls++;
                diagStats.wallsAccepted++;

                acceptedWalls.push({ wallUUID: wallId, start: start.clone(), end: end.clone(), data });
                wallAiIdToEntry.set(data.id, { wallUUID: wallId, worldStart: start.clone(), worldEnd: end.clone() });

                wallDiagnostics.push({
                    index:          wallDiagnostics.length,
                    aiId:           data.id,
                    aiWallType:     data.wallType,
                    aiConfidence:   data.confidence,
                    rawPixel,
                    worldCoords: {
                        start:          { x: parseFloat(start.x.toFixed(4)), z: parseFloat(start.z.toFixed(4)) },
                        end:            { x: parseFloat(end.x.toFixed(4)),   z: parseFloat(end.z.toFixed(4)) },
                        lengthM:        parseFloat(wallLength.toFixed(4)),
                        thicknessM:     parseFloat(thickness.toFixed(4)),
                        thicknessRawM:  parseFloat(thicknessRawM.toFixed(4)),
                    },
                    postProcessing: { isCrossingSplit, ...(splitFromAiId !== undefined ? { splitFromAiId } : {}) },
                    status:         'accepted',
                    wallUUID:       wallId,
                    finalConfidence: boostedConf,
                    ...(wallScore && {
                        wallScore: {
                            totalScore: wallScore.totalScore,
                            breakdown:  wallScore.breakdown,
                            decision:   wallScore.decision,
                        },
                    }),
                });
            }
        }

        // Split-wall parent ID aliases
        {
            const parentAliasAdded = new Set<string>();
            for (const [aiId, entry] of wallAiIdToEntry) {
                const splitMatch = aiId.match(/^(.+)_s\d+$/);
                if (splitMatch) {
                    const parentAiId = splitMatch[1]!;
                    if (!parentAliasAdded.has(parentAiId) && !wallAiIdToEntry.has(parentAiId)) {
                        wallAiIdToEntry.set(parentAiId, entry);
                        parentAliasAdded.add(parentAiId);
                    }
                }
            }
        }

        const wallGraph = buildWallGraph(acceptedWalls);
        const topology = computeTopology(wallGraph);
        summary.rooms = topology.rooms.length;

        // Build wall UUID → world XZ coords map (Issue 8: needed by room overlay renderer).
        const wallUUIDToWorld = new Map<string, { worldStart: { x: number; z: number }; worldEnd: { x: number; z: number } }>(
            acceptedWalls.map(aw => [aw.wallUUID, {
                worldStart: { x: aw.start.x, z: aw.start.z },
                worldEnd:   { x: aw.end.x,   z: aw.end.z   },
            }]),
        );

        const wallUUIDToCoords = new Map<string, { worldStart: THREE.Vector3; worldEnd: THREE.Vector3 }>(
            acceptedWalls.map(aw => [aw.wallUUID, { worldStart: aw.start, worldEnd: aw.end }]),
        );

        const wallUUIDToDetectedWall = new Map(
            acceptedWalls.map(aw => [aw.wallUUID, aw.data]),
        );

        const openingCentresForAssignment = includeOpenings
            ? analysis.openings.flatMap(o => {
                const w = underlayTool.pixelToWorld(o.centrePx.x, o.centrePx.y);
                return w ? [{ id: o.id, centre: { x: w.x, z: w.z } }] : [];
            })
            : [];

        const graphOpeningAssignment = assignOpeningsToWalls(openingCentresForAssignment, wallGraph);

        // ── 2. Slab ─────────────────────────────────────────────────────────────
        if (includeSlab) {
            let polygon: { x: number; y: number }[] = [];
            let slabRationale = '';
            let slabConfidence = 0.7;

            if (topology.outerFacePolygon && topology.outerFacePolygon.length >= 3) {
                polygon = topology.outerFacePolygon.map(p => ({
                    x: snapToGrid(p.x, SNAP_GRID_M),
                    y: snapToGrid(p.z, SNAP_GRID_M),
                }));
                slabRationale = `[PDF Import] Floor slab from topology outer face (Phase E) — ${polygon.length} vertices`;
                slabConfidence = 0.92;
            } else if (analysis.slab) {
                for (const px of analysis.slab.polygonPx) {
                    const world = underlayTool.pixelToWorld(px.x, px.y);
                    if (!world) continue;
                    polygon.push({ x: snapToGrid(world.x, SNAP_GRID_M), y: snapToGrid(world.z, SNAP_GRID_M) });
                }
                slabRationale = `[PDF Import] Floor slab from AI plan boundary (topology fallback) — confidence: ${analysis.slab.confidence}`;
                slabConfidence = analysis.slab.confidence === 'high' ? 0.9 : 0.7;
            }

            if (polygon.length >= 3) {
                const centreX = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
                const centreZ = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
                const slabId = uuid();

                const cmd = new CreateSlabCommand({
                    id: slabId,
                    width: 0,
                    depth: 0,
                    thickness: DEFAULT_SLAB_THICKNESS,
                    position: { x: centreX, y: 0, z: centreZ },
                    levelId: targetLevelId,
                    polygon,
                });

                proposals.push({
                    id: uuid(),
                    intentType: 'PDF_IMPORT_SLAB',
                    command: cmd,
                    rationale: slabRationale,
                    validation: { ok: true },
                    confidence: slabConfidence,
                });
                summary.slab++;
            }
        }

        // ── 3. Openings ─────────────────────────────────────────────────────────
        if (includeOpenings && analysis.openings.length > 0) {
            const planWidthMeters = underlayTool.getState()?.planWidthMeters ?? 10;
            const imgWidthPx = analysis.imageDimensions.widthPx;

            for (const opening of analysis.openings) {
                let wallEntry: { wallUUID: string; worldStart: THREE.Vector3; worldEnd: THREE.Vector3 } | undefined;
                let diagAssignMethod: OpeningDiagnosticRecord['assignment']['method'] = 'no_host_found';

                // ── PRIMARY: graph-based spatial assignment ────────────────────
                const graphAssignedWallId = graphOpeningAssignment.get(opening.id);
                if (graphAssignedWallId) {
                    const coords = wallUUIDToCoords.get(graphAssignedWallId);
                    if (coords) {
                        // ── DOOR FIX v2: Gap-probe tiebreaker ─────────────────
                        // The graph assigns the nearest wall by spatial proximity,
                        // but when an opening centre is equidistant from two walls
                        // (e.g. a door on a spine wall vs. a horizontal partition),
                        // the graph may pick the wrong one.
                        //
                        // Strategy: run findCollinearEndpoints() on the graph-assigned
                        // wall as a quick probe. If it returns null (no real gap found),
                        // scan all accepted walls by perpendicular distance from the
                        // opening centre and pick the nearest wall that DOES have a
                        // confirmed gap. Only fall back to the graph assignment if no
                        // alternative has a confirmed gap.
                        const graphAssignedDetectedWall = wallUUIDToDetectedWall.get(graphAssignedWallId);
                        const graphGapProbe = graphAssignedDetectedWall
                            ? findCollinearEndpoints(
                                graphAssignedDetectedWall,
                                analysis.walls,
                                opening.centrePx,
                              )
                            : null;

                        if (graphGapProbe !== null) {
                            // Graph assignment confirmed by gap probe — use it
                            wallEntry = { wallUUID: graphAssignedWallId, ...coords };
                            diagAssignMethod = 'spatial_graph';
                        } else {
                            // Graph assignment has no confirmed gap — scan all walls
                            // for the nearest one with a real gap
                            console.debug(
                                `[FloorPlanCommandBatcher] Opening ${opening.id}: ` +
                                `graph-assigned wall ${graphAssignedWallId} has no confirmed gap — ` +
                                `scanning for better host wall`,
                            );

                            const openingCentreWorld = underlayTool.pixelToWorld(
                                opening.centrePx.x, opening.centrePx.y,
                            );

                            if (openingCentreWorld) {
                                // Build candidates: all accepted walls sorted by perp distance
                                // from the opening centre
                                const candidates = acceptedWalls
                                    .map(aw => {
                                        const { distance } = pointToSegmentDistanceXZ(
                                            openingCentreWorld, aw.start, aw.end,
                                        );
                                        return { aw, distance };
                                    })
                                    .sort((a, b) => a.distance - b.distance)
                                    .slice(0, 6); // only check the 6 nearest walls

                                for (const { aw } of candidates) {
                                    const gapProbe = findCollinearEndpoints(
                                        aw.data,
                                        analysis.walls,
                                        opening.centrePx,
                                    );
                                    if (gapProbe !== null) {
                                        const altCoords = wallUUIDToCoords.get(aw.wallUUID);
                                        if (altCoords) {
                                            console.debug(
                                                `[FloorPlanCommandBatcher] Opening ${opening.id}: ` +
                                                `gap-probe tiebreaker → wall ${aw.wallUUID} ` +
                                                `(gap ${gapProbe.gapWidthPx.toFixed(0)}px)`,
                                            );
                                            wallEntry = { wallUUID: aw.wallUUID, ...altCoords };
                                            diagAssignMethod = 'spatial_graph'; // still spatial, just gap-verified
                                            break;
                                        }
                                    }
                                }
                            }

                            // If gap probe found nothing, fall back to original graph assignment
                            if (!wallEntry) {
                                wallEntry = { wallUUID: graphAssignedWallId, ...coords };
                                diagAssignMethod = 'spatial_graph';
                                console.debug(
                                    `[FloorPlanCommandBatcher] Opening ${opening.id}: ` +
                                    `gap-probe found no better wall — keeping graph assignment`,
                                );
                            }
                        }

                        // Log disagreement with Claude's hostWallId for tracking
                        const aiEntry = wallAiIdToEntry.get(opening.hostWallId);
                        if (aiEntry && aiEntry.wallUUID !== wallEntry.wallUUID) {
                            console.debug(
                                `[FloorPlanCommandBatcher] Opening ${opening.id}: ` +
                                `spatial → wall ${wallEntry.wallUUID}, ` +
                                `AI hostWallId → wall ${aiEntry.wallUUID} (using spatial)`,
                            );
                        }
                    }
                }

                // ── FALLBACK: AI hostWallId ────────────────────────────────────
                if (!wallEntry) {
                    const aiEntry = wallAiIdToEntry.get(opening.hostWallId);
                    if (aiEntry) {
                        wallEntry = aiEntry;
                        diagAssignMethod = 'ai_hostwall_fallback';
                        console.debug(
                            `[FloorPlanCommandBatcher] Opening ${opening.id}: ` +
                            `Phase E spatial missed — falling back to AI hostWallId "${opening.hostWallId}"`,
                        );
                    } else {
                        console.warn(
                            `[FloorPlanCommandBatcher] Opening ${opening.id}: ` +
                            `both spatial and AI hostWallId "${opening.hostWallId}" failed — skipping`,
                        );
                        skipped++;
                        const cwSkip = underlayTool.pixelToWorld(opening.centrePx.x, opening.centrePx.y);
                        openingDiagnostics.push({
                            aiId: opening.id,
                            type: opening.type,
                            aiHostWallId: opening.hostWallId,
                            centrePx: opening.centrePx,
                            centreWorld: cwSkip
                                ? { x: parseFloat(cwSkip.x.toFixed(4)), z: parseFloat(cwSkip.z.toFixed(4)) }
                                : null,
                            widthM: 0,
                            assignment: { method: 'no_host_found', assignedWallUUID: null },
                            status: 'skipped_no_host',
                        });
                        continue;
                    }
                }

                // Convert opening centre pixel → world XZ
                const centreWorld = underlayTool.pixelToWorld(opening.centrePx.x, opening.centrePx.y);
                if (!centreWorld) { skipped++; continue; }

                // Project opening world centre onto wall baseline
                const wallStart = wallEntry.worldStart;
                const wallEnd = wallEntry.worldEnd;
                const { projectedOffset } = pointToSegmentDistanceXZ(centreWorld, wallStart, wallEnd);
                const wallLength = wallStart.distanceTo(wallEnd);

                if (wallLength < 0.01) { skipped++; continue; }

                // ── DoorGeometricValidator: Geometric Feedback Loop ───────────
                // findCollinearEndpoints() validates that a real gap exists and returns
                // correctedCentrePx — a 2D pixel coordinate reconstructed by projecting
                // gapCentreOffset1D back along the wall's unit vector. This point is
                // axis-locked (perpendicular distance to the wall centreline = 0).
                //
                // Priority: Math > Vision.
                // correctedCentrePx overrides the AI-reported centrePx unconditionally
                // when a confirmed gap is found. The AI-provided coordinate is used only
                // when findCollinearEndpoints returns null (no verifiable gap on this wall).
                let offset = projectedOffset;
                const hostDetectedWall = wallUUIDToDetectedWall.get(wallEntry.wallUUID);
                if (hostDetectedWall) {
                    const gapResult = findCollinearEndpoints(
                        hostDetectedWall,
                        analysis.walls,
                        opening.centrePx,
                    );
                    if (gapResult) {
                        // Use correctedCentrePx directly — it is axis-locked and requires
                        // no manual direction-vector reconstruction here.
                        const gapCentreWorld = underlayTool.pixelToWorld(
                            gapResult.correctedCentrePx.x,
                            gapResult.correctedCentrePx.y,
                        );
                        if (gapCentreWorld) {
                            const { projectedOffset: gapWorldOffset } = pointToSegmentDistanceXZ(
                                gapCentreWorld, wallStart, wallEnd,
                            );
                            offset = gapWorldOffset;
                            console.debug(
                                `[FloorPlanCommandBatcher] Opening ${opening.id}: ` +
                                `axis-locked offset ${projectedOffset.toFixed(3)} → ${offset.toFixed(3)} m ` +
                                `(gap ${gapResult.gapWidthPx.toFixed(0)}px, correctedCentrePx used)`,
                            );
                        }
                    }
                }
                if (!isFinite(offset)) { skipped++; continue; }

                // Opening width in metres
                const openingWidthM = Math.max(0.5, Math.min(3.0,
                    snapToGrid(opening.widthPx / imgWidthPx * planWidthMeters, SNAP_GRID_M),
                ));

                // Door-fits-on-wall guard
                const halfW = openingWidthM / 2;
                const WALL_EDGE_TOLERANCE_M = SNAP_GRID_M;
                if (openingWidthM >= wallLength - WALL_EDGE_TOLERANCE_M) {
                    console.warn(
                        `[FloorPlanCommandBatcher] Opening ${opening.id} skipped — ` +
                        `width ${openingWidthM.toFixed(2)} m >= wall length ${wallLength.toFixed(2)} m`,
                    );
                    skipped++;
                    continue;
                }
                const clampedOffset = Math.max(halfW, Math.min(offset, wallLength - halfW));

                const isWindow = opening.type === 'window';
                const openingData = {
                    type: opening.type as 'door' | 'window',
                    ...(isWindow
                        ? { windowType: 'single' as const }
                        : { doorType: 'single' as const }
                    ),
                    width: openingWidthM,
                    height: isWindow ? 1.2 : 2.1,
                    offset: clampedOffset,
                    sillHeight: isWindow ? 0.9 : 0,
                };

                const cmd = new CreateWallOpeningCommand({
                    wallId: wallEntry.wallUUID,
                    openingData,
                });

                proposals.push({
                    id: uuid(),
                    intentType: isWindow ? 'PDF_IMPORT_WINDOW' : 'PDF_IMPORT_DOOR',
                    command: cmd,
                    rationale: `[PDF Import] ${isWindow ? 'Window' : 'Door'} in wall ${opening.hostWallId} — confidence: ${opening.confidence}`,
                    validation: { ok: true },
                    confidence: opening.confidence === 'high' ? 0.9 : opening.confidence === 'medium' ? 0.7 : 0.5,
                });
                summary.openings++;

                openingDiagnostics.push({
                    aiId: opening.id,
                    type: opening.type,
                    aiHostWallId: opening.hostWallId,
                    centrePx: opening.centrePx,
                    centreWorld: { x: parseFloat(centreWorld.x.toFixed(4)), z: parseFloat(centreWorld.z.toFixed(4)) },
                    widthM: parseFloat(openingWidthM.toFixed(4)),
                    assignment: {
                        method: diagAssignMethod,
                        assignedWallUUID: wallEntry.wallUUID,
                    },
                    status: 'accepted',
                });
            }
        }

        // ── 3b. Missed door recovery from geometric gap analysis ─────────────────
        // After B2 openings have been processed, scan the geometric door gaps that
        // the WallTerminatorDoorDetector computed from B1 wall endpoints. Any gap
        // that has no matching B2 opening within RECOVERY_MATCH_RADIUS_PX is a
        // "missed door" — B2 either skipped it (wall not in confirmed list) or
        // was confused by the inpainted image. For each missed gap, we attempt to
        // assign it to the nearest accepted wall and create a synthetic door proposal.
        //
        // Guards to minimise false positives:
        //   1. Both flanking walls (wallAId and wallBId) must be in the accepted walls list.
        //   2. The gap width (converted to metres) must be in a realistic door range (0.5–2.5 m).
        //   3. The synthetic door must fit on its assigned wall (width < wall length).
        //   4. At most MAX_RECOVERY_DOORS are created — prevents cascade of false positives.
        if (includeOpenings && analysis.walls.length > 0) {
            const RECOVERY_MATCH_RADIUS_PX = 60;
            const MAX_RECOVERY_DOORS = 10;

            const recoveryGaps = detectGeometricDoorGaps(analysis.walls);
            const planWidthMeters = underlayTool.getState()?.planWidthMeters ?? 10;
            const imgWidthPx = analysis.imageDimensions.widthPx;
            let recoveryCount = 0;

            for (const gap of recoveryGaps) {
                if (recoveryCount >= MAX_RECOVERY_DOORS) break;

                // Check if a B2 opening already covers this gap (within match radius)
                const alreadyCovered = analysis.openings.some(o => {
                    const dx = o.centrePx.x - gap.centrePx.x;
                    const dy = o.centrePx.y - gap.centrePx.y;
                    return Math.sqrt(dx * dx + dy * dy) < RECOVERY_MATCH_RADIUS_PX;
                });
                if (alreadyCovered) continue;

                // Find wallA and wallB in the accepted walls list
                const wallAEntry = acceptedWalls.find(aw => aw.data.id === gap.wallAId ||
                    aw.data.id.startsWith(gap.wallAId + '_s'));
                const wallBEntry = acceptedWalls.find(aw => aw.data.id === gap.wallBId ||
                    aw.data.id.startsWith(gap.wallBId + '_s'));

                if (!wallAEntry && !wallBEntry) continue; // neither flanking wall accepted — skip

                // Convert gap width to metres and validate it's a realistic door size
                const gapWidthM = gap.gapWidthPx / imgWidthPx * planWidthMeters;
                if (gapWidthM < 0.50 || gapWidthM > 2.50) continue;
                const openingWidthM = Math.max(0.5, Math.min(2.5, snapToGrid(gapWidthM, SNAP_GRID_M)));

                // Convert gap centre to world coordinates
                const gapCentreWorld = underlayTool.pixelToWorld(gap.centrePx.x, gap.centrePx.y);
                if (!gapCentreWorld) continue;

                // Find the nearest accepted wall to the gap centre (prefer a wall
                // that is collinear with the gap's wall direction)
                let bestWall: typeof acceptedWalls[0] | null = null;
                let bestDist = 0.5; // max perpendicular distance in metres to qualify

                for (const aw of acceptedWalls) {
                    const { distance } = pointToSegmentDistanceXZ(gapCentreWorld, aw.start, aw.end);
                    if (distance < bestDist) {
                        bestDist = distance;
                        bestWall = aw;
                    }
                }

                if (!bestWall) continue;

                const wallStart = bestWall.start;
                const wallEnd   = bestWall.end;
                const wallLength = wallStart.distanceTo(wallEnd);
                if (wallLength < 0.01) continue;

                // Fit guard
                if (openingWidthM >= wallLength - SNAP_GRID_M) continue;

                const { projectedOffset } = pointToSegmentDistanceXZ(gapCentreWorld, wallStart, wallEnd);
                const halfW = openingWidthM / 2;
                const clampedOffset = Math.max(halfW, Math.min(projectedOffset, wallLength - halfW));

                const cmd = new CreateWallOpeningCommand({
                    wallId: bestWall.wallUUID,
                    openingData: {
                        type: 'door',
                        doorType: 'single',
                        width: openingWidthM,
                        height: 2.1,
                        offset: clampedOffset,
                        sillHeight: 0,
                    },
                });

                proposals.push({
                    id: uuid(),
                    intentType: 'PDF_IMPORT_DOOR',
                    command: cmd,
                    rationale: `[PDF Import] Door recovered from geometric gap analysis — gap ${gap.gapWidthPx}px (${gapWidthM.toFixed(2)}m) between walls ${gap.wallAId}/${gap.wallBId}`,
                    validation: { ok: true },
                    confidence: 0.60, // medium-low — visual confirmation was skipped
                });
                summary.openings++;
                recoveryCount++;

                openingDiagnostics.push({
                    aiId: `geom_recovery_${recoveryCount}`,
                    type: 'door',
                    aiHostWallId: gap.wallAId,
                    centrePx: gap.centrePx,
                    centreWorld: { x: parseFloat(gapCentreWorld.x.toFixed(4)), z: parseFloat(gapCentreWorld.z.toFixed(4)) },
                    widthM: parseFloat(openingWidthM.toFixed(4)),
                    assignment: { method: 'geometric_recovery', assignedWallUUID: bestWall.wallUUID },
                    status: 'accepted',
                });

                console.debug(
                    `[FloorPlanCommandBatcher] Geometric recovery door ${recoveryCount}: ` +
                    `gap centre (${gap.centrePx.x},${gap.centrePx.y}) → wall ${bestWall.wallUUID} ` +
                    `(perp=${bestDist.toFixed(3)}m, width=${openingWidthM.toFixed(2)}m)`,
                );
            }

            if (recoveryCount > 0) {
                console.log(`[FloorPlanCommandBatcher] Geometric recovery: created ${recoveryCount} missed door(s).`);
            }
        }

        // ── 4. Furniture & Plumbing ─────────────────────────────────────────────
        for (const f of analysis.furniture) {
            const worldCentre = underlayTool.pixelToWorld(f.centrePx.x, f.centrePx.y);
            if (!worldCentre) { skipped++; continue; }

            const isPlumbing = f.furnitureType in PLUMBING_TYPE_MAP;
            const isFurniture = f.furnitureType in FURNITURE_TYPE_MAP;

            if (isPlumbing && includePlumbing) {
                const plumbingId = uuid();
                const fixtureType = PLUMBING_TYPE_MAP[f.furnitureType]!;
                const defaults = FURNITURE_DEFAULTS[f.furnitureType] ?? { width: 0.5, length: 0.6, height: 0.8 };

                const cmd = new CreatePlumbingFixtureCommand({
                    id: plumbingId,
                    fixtureType,
                    position: { x: snapToGrid(worldCentre.x, SNAP_GRID_M), y: 0, z: snapToGrid(worldCentre.z, SNAP_GRID_M) },
                    rotation: { x: 0, y: (f.rotationDeg * Math.PI) / 180, z: 0 },
                    levelId: targetLevelId,
                    baseOffset: 0,
                    width: defaults.width,
                    height: defaults.height,
                    length: defaults.length,
                });

                proposals.push({
                    id: uuid(),
                    intentType: 'PDF_IMPORT_PLUMBING',
                    command: cmd,
                    rationale: `[PDF Import] ${fixtureType} in ${f.room} — confidence: ${f.confidence}`,
                    validation: { ok: true },
                    confidence: f.confidence === 'high' ? 0.9 : f.confidence === 'medium' ? 0.7 : 0.5,
                });
                summary.plumbing++;

            } else if (isFurniture && includeFurniture) {
                const furnitureId = uuid();
                const furnitureType = FURNITURE_TYPE_MAP[f.furnitureType]!;
                const pxPerMeter = underlayTool.getState()?.pxPerMeter ?? 100;
                const widthM = Math.max(0.3, snapToGrid(f.widthPx / pxPerMeter, SNAP_GRID_M));
                const depthM = Math.max(0.3, snapToGrid(f.depthPx / pxPerMeter, SNAP_GRID_M));
                const defaults = FURNITURE_DEFAULTS[f.furnitureType] ?? { width: 1.0, length: 1.0, height: 1.0 };

                const cmd = new CreateFurnitureCommand({
                    id: furnitureId,
                    furnitureType,
                    position: { x: snapToGrid(worldCentre.x, SNAP_GRID_M), y: 0, z: snapToGrid(worldCentre.z, SNAP_GRID_M) },
                    rotation: { x: 0, y: (f.rotationDeg * Math.PI) / 180, z: 0 },
                    levelId: targetLevelId,
                    baseOffset: 0,
                    width: widthM || defaults.width,
                    length: depthM || defaults.length,
                    height: defaults.height,
                    material: 'wood',
                });

                proposals.push({
                    id: uuid(),
                    intentType: 'PDF_IMPORT_FURNITURE',
                    command: cmd,
                    rationale: `[PDF Import] ${f.furnitureType} in ${f.room} — confidence: ${f.confidence}`,
                    validation: { ok: true },
                    confidence: f.confidence === 'high' ? 0.9 : f.confidence === 'medium' ? 0.7 : 0.5,
                });
                summary.furniture++;
            } else {
                skipped++;
            }
        }

        return {
            proposals,
            skippedCount: skipped,
            summary,
            wallUUIDToWorld,
            wallGraph,
            rooms: topology.rooms,
            wallDiagnostics,
            postProcessingStats: diagStats,
            openingDiagnostics,
        };
    }
}