/**
 * @file WallCandidateScorer.ts
 * @description Multi-signal wall candidate scoring system for the PDF-to-BIM pipeline.
 *
 * Replaces the single-criterion Phase G isolated-annotation filter with a
 * weighted, six-signal scoring system. No single property defines a wall —
 * a real wall scores high across ALL signals simultaneously.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - Pure utility: NO store access, NO command execution, NO scene interaction.
 *  - No side effects. Takes inputs, returns WallScore[].
 *  - Does NOT mutate any passed-in data structures.
 *  - Designed for strict TypeScript ("strict": true). No implicit any.
 *
 * SIGNALS AND WEIGHTS:
 *  | Signal                  | Weight | Rationale                                              |
 *  |-------------------------|--------|--------------------------------------------------------|
 *  | Thickness               |   3    | Real walls >= 8px. Text/dim lines are 1–5px.           |
 *  | Room boundary membership|   3    | Real wall borders >= 1 enclosed polygon region.        |
 *  | Topological connection  |   1    | Endpoint near another wall, OR has door/window opening.|
 *  | Length                  |   1    | World-space length >= 0.6m. Annotation stubs shorter.  |
 *  | Orientation             |   1    | Within 5° of dominant cardinal or diagonal axis.       |
 *  | Pixel density uniformity|   1    | Uniform dark-pixel density (default full credit, no    |
 *  |                         |        | image data available at scoring stage).                |
 *
 * DECISION THRESHOLDS:
 *  - totalScore >= 8 → 'accept'
 *  - totalScore 5–7  → 'review' (kept with reviewFlag = true)
 *  - totalScore < 5  → 'reject' (rejectReason: 'low_wall_score')
 *
 * DOOR / WINDOW RULE:
 *  A wall with an assigned opening (door or window) receives full topological
 *  connection credit (weight 1) even if its endpoints do not snap to any other
 *  wall endpoint. The opening physically connects the wall to the adjacent space.
 *
 * EXTERIOR WALL GUARD:
 *  Exterior walls are never penalised — the batcher applies an explicit guard
 *  (`aiWallType === 'exterior'`) and skips the scorer decision for them.
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Public types ───────────────────────────────────────────────────────────────

/**
 * A wall candidate after world-space conversion, junction resolution, and
 * crossing split — ready for scoring.
 * In the batcher context, `wallUUID` is set to the wall's AI id (e.g. "w3", "w3_s0")
 * so that it can be used as a Map key for the scoring round before stable UUIDs are
 * assigned.
 */
export interface ResolvedWall {
    /** Unique identifier for scoring. Set to aiId in the batcher. */
    wallUUID: string;
    /** Claude's original wall id (e.g. "w3"). Sub-segments: "w3_s0". */
    aiId: string;
    /** World-space start point (XZ plane). */
    start: THREE.Vector3;
    /** World-space end point (XZ plane). */
    end: THREE.Vector3;
    /** Estimated wall thickness in image pixels (from Claude B1). */
    thicknessPx: number;
    /** Wall type classification from Claude B1. */
    aiWallType: 'exterior' | 'interior' | 'unknown';
    /** Raw pixel coordinates as returned by Claude (before world-space conversion). */
    rawPixel: {
        startPx: { x: number; y: number };
        endPx: { x: number; y: number };
    };
}

/**
 * A resolved opening (door or window) used for topological connection scoring.
 * Only `hostWallAiId` and `type` are needed for scoring.
 */
export interface ResolvedOpening {
    /** Claude's opening id (e.g. "o1"). */
    id: string;
    /** AI wall id this opening is hosted in (Claude B2's hostWallId). */
    hostWallAiId: string;
    /** Opening type — doors and windows both grant topological connection credit. */
    type: 'door' | 'window';
}

/** Per-wall scoring result. */
export interface WallScore {
    /** Matches ResolvedWall.wallUUID for lookup. */
    wallUUID: string;
    /** Sum of all signal scores. Max theoretical = 10 (3+3+1+1+1+1). */
    totalScore: number;
    /** Per-signal breakdown for diagnostic output. */
    breakdown: {
        thickness: number;
        roomBoundary: number;
        topologicalConnection: number;
        length: number;
        orientation: number;
        pixelDensity: number;
    };
    /** Final scoring decision. */
    decision: 'accept' | 'review' | 'reject';
    /** True when decision is 'review' — batcher surfaces this in rationale. */
    reviewFlag: boolean;
    /** Set to 'low_wall_score' when decision is 'reject'. */
    rejectReason?: 'low_wall_score';
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum world-space wall length to earn the length signal point. */
const MIN_WALL_LENGTH_M = 0.6;

/**
 * Topological connection snap radius (metres).
 * An endpoint within this distance of another wall's endpoint counts as connected.
 */
const SNAP_M = 0.3;

/**
 * Minimum area (m²) for a flood-filled region to count as a valid room.
 * Regions smaller than this are narrow gaps, annotation spaces, or corridor slivers.
 */
const MIN_ROOM_AREA_M2 = 0.5;

/**
 * Grid downscale factor for room-boundary rasterization.
 * Each grid cell represents GRID_SCALE × GRID_SCALE image pixels.
 * At 1500px wide with GRID_SCALE=4, the grid is 375 wide — fast BFS, ~187k cells max.
 */
const GRID_SCALE = 4;

/** Minimum wall thickness in pixels for the thickness signal. */
const THICKNESS_MIN_PX = 8;

/** Orthogonal angle tolerance in degrees (0°, 90°). */
const ORTHO_TOL_DEG = 5;

/** Score thresholds. */
const ACCEPT_THRESHOLD = 8;
const REVIEW_MIN_THRESHOLD = 5;

// ── WallCandidateScorer ────────────────────────────────────────────────────────

/**
 * Pure, side-effect-free wall candidate scorer.
 *
 * Call `score()` once per batch. The scorer processes all walls together so
 * that cross-wall signals (room boundary, topological connection, orientation)
 * can be computed correctly.
 */
export class WallCandidateScorer {
    /**
     * Score all wall candidates.
     *
     * @param walls          - Resolved wall list (after crossing split).
     * @param openings       - AI-detected openings (before wall assignment).
     * @param imageWidthPx   - Width of the original AI image in pixels.
     * @param imageHeightPx  - Height of the original AI image in pixels.
     * @param pxPerMeter     - Image-space pixels per world-space metre.
     * @returns              Per-wall WallScore[] in the same order as `walls`.
     */
    score(
        walls: ResolvedWall[],
        openings: ResolvedOpening[],
        imageWidthPx: number,
        imageHeightPx: number,
        pxPerMeter: number,
    ): WallScore[] {
        if (walls.length === 0) return [];

        // Step A: Compute room boundary membership for all walls (flood-fill)
        const roomBorderCount = this._computeRoomBoundaryMembership(
            walls,
            imageWidthPx,
            imageHeightPx,
            pxPerMeter,
        );

        // Step B: Build lookup: wallUUID → has opening (door or window)
        // An opening matches if hostWallAiId equals aiId exactly, or is the parent
        // of a sub-segment (e.g., hostWallAiId="w3" matches aiId="w3_s0").
        const wallHasOpening = new Map<string, boolean>();
        for (const wall of walls) {
            const matched = openings.some(
                (o) =>
                    o.hostWallAiId === wall.aiId ||
                    wall.aiId.startsWith(o.hostWallAiId + '_s'),
            );
            wallHasOpening.set(wall.wallUUID, matched);
        }

        // Step C: Compute dominant non-orthogonal angles across the wall set
        const dominantAngles = this._computeDominantAngles(walls);

        // Step D: Score each wall
        return walls.map((wall) => {
            const breakdown = {
                thickness: this._scoreThickness(wall),
                roomBoundary: this._scoreRoomBoundary(wall, roomBorderCount),
                topologicalConnection: this._scoreTopologicalConnection(
                    wall,
                    walls,
                    wallHasOpening,
                ),
                length: this._scoreLength(wall),
                orientation: this._scoreOrientation(wall, dominantAngles),
                pixelDensity: this._scorePixelDensity(),
            };

            const totalScore =
                breakdown.thickness +
                breakdown.roomBoundary +
                breakdown.topologicalConnection +
                breakdown.length +
                breakdown.orientation +
                breakdown.pixelDensity;

            let decision: 'accept' | 'review' | 'reject';
            let reviewFlag = false;
            let rejectReason: 'low_wall_score' | undefined;

            if (totalScore >= ACCEPT_THRESHOLD) {
                decision = 'accept';
            } else if (totalScore >= REVIEW_MIN_THRESHOLD) {
                decision = 'review';
                reviewFlag = true;
            } else {
                decision = 'reject';
                rejectReason = 'low_wall_score';
            }

            const result: WallScore = {
                wallUUID: wall.wallUUID,
                totalScore,
                breakdown,
                decision,
                reviewFlag,
            };
            if (rejectReason !== undefined) {
                result.rejectReason = rejectReason;
            }
            return result;
        });
    }

    // ── Signal 1: Thickness (weight 3) ──────────────────────────────────────

    private _scoreThickness(wall: ResolvedWall): number {
        return wall.thicknessPx >= THICKNESS_MIN_PX ? 3 : 0;
    }

    // ── Signal 2: Room boundary membership (weight 3) ───────────────────────

    /**
     * Rasterize all walls to a downscaled binary grid, then BFS flood-fill
     * all connected empty-pixel regions. Count how many valid-area rooms each
     * wall borders (via 8-connectivity with its rasterized pixels).
     *
     * Returns a Map<wallUUID, roomCount>.
     */
    private _computeRoomBoundaryMembership(
        walls: ResolvedWall[],
        imageWidthPx: number,
        imageHeightPx: number,
        pxPerMeter: number,
    ): Map<string, number> {
        const gridW = Math.max(1, Math.ceil(imageWidthPx / GRID_SCALE));
        const gridH = Math.max(1, Math.ceil(imageHeightPx / GRID_SCALE));
        const totalCells = gridW * gridH;

        // grid[i] = 0 (empty) | 1 (wall rasterized pixel)
        const grid = new Uint8Array(totalCells);

        // wallPixelSets[wallUUID] = Set of grid cell indices occupied by that wall
        const wallPixelSets = new Map<string, Set<number>>();
        for (const wall of walls) {
            wallPixelSets.set(wall.wallUUID, new Set<number>());
        }

        // Rasterize each wall using Bresenham's line + circular brush
        for (const wall of walls) {
            const pixSet = wallPixelSets.get(wall.wallUUID);
            if (pixSet === undefined) continue;

            const gx1 = Math.floor(wall.rawPixel.startPx.x / GRID_SCALE);
            const gy1 = Math.floor(wall.rawPixel.startPx.y / GRID_SCALE);
            const gx2 = Math.floor(wall.rawPixel.endPx.x / GRID_SCALE);
            const gy2 = Math.floor(wall.rawPixel.endPx.y / GRID_SCALE);
            const radius = Math.max(1, Math.ceil(wall.thicknessPx / GRID_SCALE / 2));

            this._rasterizeLine(grid, gx1, gy1, gx2, gy2, radius, gridW, gridH, pixSet);
        }

        // Minimum room area in grid cells
        const minRoomAreaCells = Math.max(
            4,
            Math.round((MIN_ROOM_AREA_M2 * pxPerMeter * pxPerMeter) / (GRID_SCALE * GRID_SCALE)),
        );

        // regionId[i] = 0 (unvisited empty) | 1 (wall placeholder) | r >= 2 (flood-fill region r)
        const regionId = new Uint32Array(totalCells);
        for (let i = 0; i < totalCells; i++) {
            if (grid[i] === 1) regionId[i] = 1;
        }

        // regionAreas[r] = number of empty cells in region r (index 0,1 unused/reserved)
        const regionAreas: number[] = [0, 0];
        let nextRegion = 2;

        // BFS queue — reused across iterations to avoid repeated allocations
        const queue = new Int32Array(totalCells);

        for (let startIdx = 0; startIdx < totalCells; startIdx++) {
            if (regionId[startIdx] !== 0) continue;

            const thisRegion = nextRegion++;
            regionAreas.push(0);
            regionId[startIdx] = thisRegion;

            let head = 0;
            let tail = 0;
            queue[tail++] = startIdx;
            let area = 0;

            while (head < tail) {
                const cellIdx = queue[head++]!;
                area++;
                const cx = cellIdx % gridW;
                const cy = Math.floor(cellIdx / gridW);

                // 8-connected neighbours
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
                        const ni = ny * gridW + nx;
                        if (regionId[ni] !== 0) continue;
                        regionId[ni] = thisRegion;
                        queue[tail++] = ni;
                    }
                }
            }

            regionAreas[thisRegion] = area;
        }

        // Identify valid room regions (area >= minRoomAreaCells, region id >= 2)
        const validRooms = new Set<number>();
        for (let r = 2; r < regionAreas.length; r++) {
            const area = regionAreas[r];
            if (area !== undefined && area >= minRoomAreaCells) {
                validRooms.add(r);
            }
        }

        // For each wall, count distinct valid rooms its pixels are 8-connected to
        const result = new Map<string, number>();
        for (const wall of walls) {
            const pixSet = wallPixelSets.get(wall.wallUUID);
            if (pixSet === undefined) {
                result.set(wall.wallUUID, 0);
                continue;
            }

            const borderedRooms = new Set<number>();
            for (const cellIdx of pixSet) {
                const cx = cellIdx % gridW;
                const cy = Math.floor(cellIdx / gridW);

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
                        const ni = ny * gridW + nx;
                        const r = regionId[ni];
                        if (r !== undefined && validRooms.has(r)) {
                            borderedRooms.add(r);
                        }
                    }
                }
            }

            result.set(wall.wallUUID, borderedRooms.size);
        }

        return result;
    }

    /**
     * Bresenham's line algorithm with a circular brush of `radius` grid cells.
     * Writes 1 into `grid` at each covered cell and records cell indices in `outPixels`.
     */
    private _rasterizeLine(
        grid: Uint8Array,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        radius: number,
        gridW: number,
        gridH: number,
        outPixels: Set<number>,
    ): void {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        let cx = x1;
        let cy = y1;
        const r2 = radius * radius;

        for (;;) {
            // Paint circular brush at (cx, cy)
            for (let ry = -radius; ry <= radius; ry++) {
                for (let rx = -radius; rx <= radius; rx++) {
                    if (rx * rx + ry * ry > r2) continue;
                    const nx = cx + rx;
                    const ny = cy + ry;
                    if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
                    const idx = ny * gridW + nx;
                    grid[idx] = 1;
                    outPixels.add(idx);
                }
            }

            if (cx === x2 && cy === y2) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }
            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
    }

    private _scoreRoomBoundary(wall: ResolvedWall, roomBorderCount: Map<string, number>): number {
        const count = roomBorderCount.get(wall.wallUUID) ?? 0;
        return count >= 1 ? 3 : 0;
    }

    // ── Signal 3: Topological connection (weight 1) ──────────────────────────

    private _scoreTopologicalConnection(
        wall: ResolvedWall,
        allWalls: ResolvedWall[],
        wallHasOpening: Map<string, boolean>,
    ): number {
        // Door or window opening: the opening physically connects the wall to the
        // adjacent space, granting full topological connection credit.
        if (wallHasOpening.get(wall.wallUUID) === true) return 1;

        // Endpoint proximity: at least one endpoint is within SNAP_M of another wall's endpoint.
        for (const other of allWalls) {
            if (other.wallUUID === wall.wallUUID) continue;
            if (
                wall.start.distanceTo(other.start) < SNAP_M ||
                wall.start.distanceTo(other.end) < SNAP_M ||
                wall.end.distanceTo(other.start) < SNAP_M ||
                wall.end.distanceTo(other.end) < SNAP_M
            ) {
                return 1;
            }
        }

        return 0;
    }

    // ── Signal 4: Length (weight 1) ─────────────────────────────────────────

    private _scoreLength(wall: ResolvedWall): number {
        const len = wall.start.distanceTo(wall.end);
        return len >= MIN_WALL_LENGTH_M ? 1 : 0;
    }

    // ── Signal 5: Orientation (weight 1) ────────────────────────────────────

    /**
     * Find dominant non-orthogonal angles across all walls (for diagonal-wing plans).
     * Returns angle values in [0, 180) degrees that appear in >= 2 walls and
     * account for >= 50% of the peak bin count (5° bins).
     */
    private _computeDominantAngles(walls: ResolvedWall[]): number[] {
        const ORTHO_EXCLUSION = 10; // degrees — exclude angles near 0° or 90°

        const angles: number[] = walls.map((w) => {
            const dx = w.end.x - w.start.x;
            const dz = w.end.z - w.start.z;
            let a = (Math.atan2(dz, dx) * 180) / Math.PI;
            // Fold into [0, 180)
            if (a < 0) a += 180;
            if (a >= 180) a -= 180;
            return a;
        });

        const nonOrtho = angles.filter(
            (a) =>
                Math.abs(a) > ORTHO_EXCLUSION &&
                Math.abs(a - 90) > ORTHO_EXCLUSION &&
                Math.abs(a - 180) > ORTHO_EXCLUSION,
        );

        if (nonOrtho.length < 2) return [];

        // 5-degree bins
        const bins = new Map<number, number>();
        for (const a of nonOrtho) {
            const bin = Math.round(a / 5) * 5;
            bins.set(bin, (bins.get(bin) ?? 0) + 1);
        }

        if (bins.size === 0) return [];

        const maxCount = Math.max(...bins.values());
        if (maxCount < 2) return [];

        return Array.from(bins.entries())
            .filter(([, count]) => count >= 2 && count >= maxCount * 0.5)
            .map(([bin]) => bin);
    }

    private _scoreOrientation(wall: ResolvedWall, dominantAngles: number[]): number {
        const dx = wall.end.x - wall.start.x;
        const dz = wall.end.z - wall.start.z;
        let angle = (Math.atan2(dz, dx) * 180) / Math.PI;
        // Fold into [0, 180)
        if (angle < 0) angle += 180;
        if (angle >= 180) angle -= 180;

        // Orthogonal: 0° or 90° (within tolerance)
        if (
            angle <= ORTHO_TOL_DEG ||
            Math.abs(angle - 90) <= ORTHO_TOL_DEG ||
            Math.abs(angle - 180) <= ORTHO_TOL_DEG
        ) {
            return 1;
        }

        // Dominant non-orthogonal axes (diagonal wings)
        for (const dom of dominantAngles) {
            if (Math.abs(angle - dom) <= ORTHO_TOL_DEG) return 1;
        }

        return 0;
    }

    // ── Signal 6: Pixel density uniformity (weight 1) ───────────────────────

    /**
     * Coefficient of variation of dark-pixel counts sampled along the segment.
     * Because the image raster data is not available at the scoring stage
     * (only Claude's JSON analysis is passed to the batcher), this signal defaults
     * to awarding full credit. A real wall is not penalised for lack of image access.
     *
     * If image data is provided in a future extension of this scorer, replace this
     * method with actual column-by-column dark-pixel sampling.
     */
    private _scorePixelDensity(): number {
        return 1;
    }
}
