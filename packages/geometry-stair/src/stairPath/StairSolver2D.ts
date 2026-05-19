/**
 * StairSolver2D — real-time stair geometry solver for the 2D path tool.
 *
 * Inputs  : polyline of world-space points (XZ plane) + stair parameters.
 * Outputs : per-segment step distributions, landing geometry, validation state.
 *
 * This module is pure computation — no DOM, no canvas, no Three.js.
 * The 3D geometry is produced by the existing StairMeshBuilder; this
 * solver only describes the 2D layout needed for live preview rendering.
 */

import type { Point2D } from './PolylineModel';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One solved stair run (= one polyline segment).
 *
 * §STAIR-PREVIEW-MATCH-2026-04-25 v3 — landings physically occupy a portion of
 * each polyline segment at corners.  The treads only fill the FLIGHT portion
 * (`flightStart` → `flightEnd`, length `flightLength`), leaving the consumed
 * `consumeStart` and `consumeEnd` portions for the adjacent landings to sit
 * inside.  Renderer, adapter and validator all use the flight-portion fields
 * so the 2D preview, the 3D mesh and the validation messages agree.
 */
export interface SegmentSolution {
    start: Point2D;
    end:   Point2D;
    length: number;      // metres — full polyline-segment length
    dir:  Point2D;       // unit vector in XZ
    perp: Point2D;       // unit vector perpendicular to dir (for width offset)
    stepCount: number;   // risers in this segment
    treadDepth: number;  // actual tread depth = flightLength / stepCount
    /** 1-based index of the first riser in this segment across the full stair */
    riserStart: number;

    // ── Landing-aware flight portion (v3) ────────────────────────────────────
    /** Length consumed at this segment's start by the preceding landing (m). */
    consumeStart: number;
    /** Length consumed at this segment's end by the following landing (m). */
    consumeEnd:   number;
    /** Effective length used for treads = length - consumeStart - consumeEnd. */
    flightLength: number;
    /** World-XZ point where the first tread of this flight starts. */
    flightStart:  Point2D;
    /** World-XZ point where the last tread of this flight ends. */
    flightEnd:    Point2D;
}

/** One landing zone between two consecutive runs. */
export interface LandingSolution {
    /** Corner point in world XZ — the turning point between two runs. */
    corner: Point2D;
    /** Approach direction (inbound run). */
    inDir:  Point2D;
    /** Departure direction (outbound run). */
    outDir: Point2D;
    /** Landing square size = stair width. */
    size: number;
    /** Angle between the two runs in degrees (for display). */
    turnAngleDeg: number;
}

/** Shape classification based on number of segments (or 'C' for curved). */
export type StairShape2D = 'I' | 'L' | 'U' | 'complex' | 'C';

/** Full solver output for one frame. */
export interface SolverResult2D {
    /** I / L / U / complex depending on segment count. */
    shape: StairShape2D;
    /** One entry per polyline segment (last may be the live ghost). */
    segments: SegmentSolution[];
    /** One entry per interior corner (= segments.length − 1). */
    landings: LandingSolution[];
    /** Total risers across all segments. */
    totalSteps: number;
    /** Floor-to-floor height divided by totalSteps. */
    riserHeight: number;
    /** Ideal tread depth (user-preferred). */
    treadDepth: number;
    /** Stair width in metres. */
    width: number;
    /** Whether the stair is geometrically valid. */
    isValid: boolean;
    /** Human-readable status/warning. */
    validationMessage: string;
    /** Active risers-before-landing value (may be 0 when not applicable). */
    risersBeforeLanding: number;
}

// ── Solver class ──────────────────────────────────────────────────────────────

export class StairSolver2D {
    private _width      = 1.0;   // metres
    private _riserH     = 0.175; // metres — comfort default (Blondel: 2R+T≈630mm)
    private _treadD     = 0.280; // metres
    private _totalH     = 3.0;   // floor-to-floor height in metres
    /** 0 = auto-distribute proportionally; >0 = explicit risers for first run. */
    private _risersBeforeLanding = 0;
    /** 0 = auto; >0 = explicit risers for second run (only used when segments ≥ 2). */
    private _risersInRun2 = 0;

    // Building code limits (sensible BIM defaults)
    private static readonly MIN_RISER = 0.100; // 100 mm
    private static readonly MAX_RISER = 0.220; // 220 mm
    private static readonly MIN_TREAD = 0.220; // 220 mm
    private static readonly MAX_TREAD = 0.360; // 360 mm
    private static readonly MIN_SEG_LEN = 0.30; // 300 mm — minimum meaningful run

    constructor(params?: {
        width?: number;
        riserHeight?: number;
        treadDepth?: number;
        totalHeight?: number;
        risersBeforeLanding?: number;
        risersInRun2?: number;
    }) {
        if (params) this.update(params);
    }

    update(params: {
        width?:               number;
        riserHeight?:         number;
        treadDepth?:          number;
        totalHeight?:         number;
        risersBeforeLanding?: number;
        risersInRun2?:        number;
    }): void {
        if (params.width               != null) this._width  = params.width;
        if (params.riserHeight         != null) this._riserH = params.riserHeight;
        if (params.treadDepth          != null) this._treadD = params.treadDepth;
        if (params.totalHeight         != null) this._totalH = params.totalHeight;
        if (params.risersBeforeLanding != null) this._risersBeforeLanding = params.risersBeforeLanding;
        if (params.risersInRun2 != null) this._risersInRun2 = params.risersInRun2;
    }

    get width()               { return this._width;  }
    get treadDepth()          { return this._treadD; }
    get riserHeight()         { return this._riserH; }
    get risersBeforeLanding() { return this._risersBeforeLanding; }

    /**
     * Main entry point — call on every mouse move.
     * `points` is the complete preview path (committed + live cursor).
     */
    solve(points: Point2D[]): SolverResult2D {
        const empty = this._empty();

        if (points.length < 2) {
            return { ...empty, validationMessage: 'Click to set start point' };
        }

        // Compute total risers from floor-to-floor height
        const totalSteps = Math.max(2, Math.round(this._totalH / this._riserH));
        const actualRiser = this._totalH / totalSteps;

        // Build per-segment geometry
        const rawSegments = this._buildSegments(points);
        if (rawSegments.length === 0) {
            return { ...empty, validationMessage: 'Move mouse to set direction' };
        }

        // Build landing geometry at every interior corner (FIRST — needed for
        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 consumption, since consumption
        // amounts depend on the landing turn type at each corner).
        const landings = this._buildLandings(points, this._width);

        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — reserve the portion of each
        // segment that the adjacent landing physically occupies.  After this,
        // each segment's `flightLength` < `length` whenever it borders a
        // landing, and `flightStart`/`flightEnd` mark where treads begin/end.
        this._applyLandingConsumption(rawSegments, landings, this._width);

        // Total FLIGHT length across all segments — used for proportional step
        // distribution so segments with more flight space get more risers.
        const totalFlightLength = rawSegments.reduce((s, r) => s + r.flightLength, 0);

        // Distribute steps — respects risersBeforeLanding when set
        const segments = this._distributeSteps(rawSegments, totalSteps, totalFlightLength);

        // Classify shape — pass landings so U can be detected by ~180° turn angle
        const shape = this._classifyShape(segments.length, landings);

        // Validate
        const { isValid, validationMessage } = this._validate(segments, actualRiser);

        return {
            shape,
            segments,
            landings,
            totalSteps,
            riserHeight: actualRiser,
            treadDepth:  this._treadD,
            width:       this._width,
            isValid,
            validationMessage,
            risersBeforeLanding: this._risersBeforeLanding,
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _empty(): SolverResult2D {
        return {
            shape: 'I',
            segments: [],
            landings: [],
            totalSteps: 0,
            riserHeight: this._riserH,
            treadDepth:  this._treadD,
            width:       this._width,
            isValid:     false,
            validationMessage: '',
            risersBeforeLanding: this._risersBeforeLanding,
        };
    }

    /** Convert raw point pairs → SegmentSolution (without step counts yet). */
    private _buildSegments(points: Point2D[]): SegmentSolution[] {
        const segs: SegmentSolution[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end   = points[i + 1];
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length < 0.001) continue;

            const dir:  Point2D = { x: dx / length, z: dz / length };
            const perp: Point2D = { x: -dir.z, z: dir.x };

            segs.push({
                start, end, length, dir, perp,
                stepCount: 0, treadDepth: this._treadD, riserStart: 1,
                // Landing consumption gets filled in by _applyLandingConsumption().
                consumeStart: 0, consumeEnd: 0,
                flightLength: length,
                flightStart: start,
                flightEnd:   end,
            });
        }
        return segs;
    }

    /**
     * Distribute `totalSteps` risers across segments.
     *
     * When `_risersBeforeLanding > 0` and there are multiple segments:
     *   • Segment 0 gets exactly `_risersBeforeLanding` steps.
     *   • The rest of the segments proportionally share the remainder.
     * Otherwise falls back to proportional distribution.
     *
     * Guarantees every segment gets at least 1 step.
     */
    private _distributeSteps(
        segs: SegmentSolution[],
        totalSteps: number,
        totalFlightLength: number,
    ): SegmentSolution[] {
        if (totalFlightLength < 0.001) return segs;

        const n = segs.length;
        const counts = new Array<number>(n).fill(0);

        // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — proportional weight is the
        // FLIGHT length (segment length minus landing-consumed portions), not
        // the raw segment length.  Without this, a long segment with a wide
        // landing reservation receives more steps than its tread space can fit.
        const lenOf = (seg: SegmentSolution) => Math.max(0.001, seg.flightLength);

        const rbl  = this._risersBeforeLanding;
        const rbl2 = this._risersInRun2;

        if (rbl > 0 && n >= 2) {
            // Explicit split at the first landing
            const firstCount = Math.min(Math.max(1, rbl), totalSteps - (n - 1));
            counts[0] = firstCount;

            if (rbl2 > 0 && n >= 3) {
                // Also pin second run's count
                const secondCount = Math.min(Math.max(1, rbl2), totalSteps - firstCount - (n - 2));
                counts[1] = secondCount;

                const remaining3 = totalSteps - firstCount - secondCount;
                const restSegs3  = segs.slice(2);
                const restLen3   = restSegs3.reduce((s, seg) => s + lenOf(seg), 0);

                if (restLen3 < 0.001 || n === 3) {
                    // Only one remaining segment — give it all the rest
                    counts[n - 1] = Math.max(1, remaining3);
                } else {
                    for (let i = 2; i < n; i++) {
                        counts[i] = Math.max(1, Math.floor((lenOf(segs[i]) / restLen3) * remaining3));
                    }
                    let allocated3 = counts.reduce((a, b) => a + b, 0);
                    counts[n - 1] += totalSteps - allocated3;
                    counts[n - 1]  = Math.max(1, counts[n - 1]);
                }
            } else {
                // Proportional for segments after run 1
                const remaining = totalSteps - firstCount;
                const restSegs  = segs.slice(1);
                const restLen   = restSegs.reduce((s, seg) => s + lenOf(seg), 0);

                if (restLen < 0.001) {
                    const perSeg = Math.max(1, Math.round(remaining / (n - 1)));
                    for (let i = 1; i < n; i++) counts[i] = perSeg;
                    const allocated = counts.reduce((a, b) => a + b, 0);
                    counts[n - 1] += totalSteps - allocated;
                    counts[n - 1]  = Math.max(1, counts[n - 1]);
                } else {
                    for (let i = 1; i < n; i++) {
                        counts[i] = Math.max(1, Math.floor((lenOf(segs[i]) / restLen) * remaining));
                    }
                    let allocated = counts.reduce((a, b) => a + b, 0);
                    let diff      = totalSteps - allocated;
                    const order   = [...segs.keys()].slice(1).sort((a, b) => lenOf(segs[b]) - lenOf(segs[a]));
                    let oi = 0;
                    while (diff > 0) { counts[order[oi++ % order.length]]++; diff--; }
                    while (diff < 0) {
                        const idx = order[oi++ % order.length];
                        if (counts[idx] > 1) { counts[idx]--; diff++; }
                        else { break; }
                    }
                }
            }
        } else {
            // Proportional distribution by flight length
            for (let i = 0; i < n; i++) {
                counts[i] = Math.max(1, Math.floor((lenOf(segs[i]) / totalFlightLength) * totalSteps));
            }
            let allocated = counts.reduce((a, b) => a + b, 0);
            let diff = totalSteps - allocated;
            if (diff > 0) {
                const order = [...segs.keys()].sort((a, b) => lenOf(segs[b]) - lenOf(segs[a]));
                for (let i = 0; i < diff; i++) counts[order[i % n]]++;
            } else if (diff < 0) {
                const order = [...segs.keys()].sort((a, b) => lenOf(segs[a]) - lenOf(segs[b]));
                for (let i = 0; i < -diff; i++) {
                    if (counts[order[i % n]] > 1) counts[order[i % n]]--;
                }
            }
        }

        // Assign riserStart offsets and per-segment tread.  Tread depth is now
        // computed from the FLIGHT portion so each tread butts cleanly against
        // the adjacent landing's edge (no overlap, no gap).
        let riserStart = 1;
        return segs.map((s, i) => {
            const sc = counts[i];
            const result: SegmentSolution = {
                ...s,
                stepCount:  sc,
                treadDepth: lenOf(s) / sc,
                riserStart,
            };
            riserStart += sc;
            return result;
        });
    }

    /**
     * §STAIR-PREVIEW-MATCH-2026-04-25 v3 — reserve the portion of each polyline
     * segment that the adjacent landing physically occupies.
     *
     * Geometry recap (matches StairMeshBuilder's L-shape branch):
     *   The landing is BoxGeometry(width, _, landing.depth) rotated so its
     *   local +Z (depth axis) aligns with the OUTBOUND flight's direction.
     *   It is centred at the polyline corner.  Therefore:
     *     - Along the OUTBOUND direction, the landing extends ±depth/2.
     *     - Perpendicular to the outbound direction (= ±inbound for a 90°
     *       corner), the landing extends ±width/2.
     *
     *   Consumed portion of each adjacent segment (along its own dir):
     *     - inbound segment's END  : width/2          (perpendicular dim)
     *     - outbound segment's START: landing.depth/2 (parallel dim)
     *
     *   For the default L/U-3-run case landing.depth = width, so both sides
     *   consume `width/2`.  For a 180° switchback (U-2-run) the landing sits
     *   perpendicular to the runs and does not consume travel-axis length —
     *   we set consumption to 0 there.
     */
    private _applyLandingConsumption(
        segs: SegmentSolution[],
        landings: LandingSolution[],
        width: number,
    ): void {
        for (let i = 0; i < landings.length; i++) {
            const turn = landings[i].turnAngleDeg;
            // 90° corner (60°…150° band) → square landing centred on corner.
            // 180° switchback (>150°)    → no in-axis consumption.
            const isSwitchback = turn >= 150;
            if (isSwitchback) continue;

            const inSeg  = segs[i];
            const outSeg = segs[i + 1];
            if (!inSeg || !outSeg) continue;

            // Both halves equal width/2 because we set landing.depth = width.
            inSeg.consumeEnd    = Math.max(inSeg.consumeEnd,    width / 2);
            outSeg.consumeStart = Math.max(outSeg.consumeStart, width / 2);
        }

        // Recompute flightLength + flightStart + flightEnd for every segment.
        for (const seg of segs) {
            const flightLen = Math.max(0, seg.length - seg.consumeStart - seg.consumeEnd);
            seg.flightLength = flightLen;
            seg.flightStart = {
                x: seg.start.x + seg.dir.x * seg.consumeStart,
                z: seg.start.z + seg.dir.z * seg.consumeStart,
            };
            seg.flightEnd = {
                x: seg.end.x - seg.dir.x * seg.consumeEnd,
                z: seg.end.z - seg.dir.z * seg.consumeEnd,
            };
        }
    }

    /** Build landing geometry at each interior corner. */
    private _buildLandings(points: Point2D[], width: number): LandingSolution[] {
        const landings: LandingSolution[] = [];
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const cur  = points[i];
            const next = points[i + 1];

            const inDx  = cur.x - prev.x, inDz  = cur.z - prev.z;
            const outDx = next.x - cur.x, outDz = next.z - cur.z;
            const inLen  = Math.sqrt(inDx * inDx + inDz * inDz);
            const outLen = Math.sqrt(outDx * outDx + outDz * outDz);
            if (inLen < 0.001 || outLen < 0.001) continue;

            const inDir:  Point2D = { x: inDx / inLen,   z: inDz / inLen };
            const outDir: Point2D = { x: outDx / outLen, z: outDz / outLen };

            const dot = inDir.x * outDir.x + inDir.z * outDir.z;
            const turnAngleDeg = Math.round(Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI));

            landings.push({ corner: cur, inDir, outDir, size: width, turnAngleDeg });
        }
        return landings;
    }

    private _classifyShape(segCount: number, landings?: { turnAngleDeg: number }[]): StairShape2D {
        if (segCount <= 1) return 'I';
        if (segCount === 2) {
            // Distinguish L (≈90°) from U (≈180°) by the first landing's turn angle
            const turnAngle = landings?.[0]?.turnAngleDeg ?? 0;
            return turnAngle >= 150 ? 'U' : 'L';
        }
        if (segCount === 3) return 'U';
        return 'complex';
    }

    private _validate(segs: SegmentSolution[], actualRiser: number): { isValid: boolean; validationMessage: string } {
        if (segs.length === 0) {
            return { isValid: false, validationMessage: 'Draw at least one stair run' };
        }

        if (actualRiser < StairSolver2D.MIN_RISER) {
            return {
                isValid: false,
                validationMessage: `Riser too small (${Math.round(actualRiser * 1000)} mm — min ${StairSolver2D.MIN_RISER * 1000} mm)`,
            };
        }
        if (actualRiser > StairSolver2D.MAX_RISER) {
            return {
                isValid: false,
                validationMessage: `Riser too tall (${Math.round(actualRiser * 1000)} mm — max ${StairSolver2D.MAX_RISER * 1000} mm)`,
            };
        }

        for (const seg of segs) {
            if (seg.treadDepth < StairSolver2D.MIN_TREAD) {
                return {
                    isValid: false,
                    validationMessage: `Run too short — tread ${Math.round(seg.treadDepth * 1000)} mm (min ${StairSolver2D.MIN_TREAD * 1000} mm)`,
                };
            }
            if (seg.treadDepth > StairSolver2D.MAX_TREAD) {
                return {
                    isValid: false,
                    validationMessage: `Run too long — tread ${Math.round(seg.treadDepth * 1000)} mm (max ${StairSolver2D.MAX_TREAD * 1000} mm)`,
                };
            }
            if (seg.length < StairSolver2D.MIN_SEG_LEN) {
                return {
                    isValid: false,
                    validationMessage: `Run is too short (min ${Math.round(StairSolver2D.MIN_SEG_LEN * 1000)} mm)`,
                };
            }
            // §STAIR-PREVIEW-MATCH-2026-04-25 v3 — after reserving landing
            // space, the remaining flight portion must still be long enough
            // to fit at least one tread.  Otherwise the user's polyline is
            // too short for the chosen width / number of corners.
            if (seg.flightLength < StairSolver2D.MIN_TREAD) {
                return {
                    isValid: false,
                    validationMessage: `Run too short for landing — extend this segment (need ≥ ${Math.round((seg.consumeStart + seg.consumeEnd + StairSolver2D.MIN_TREAD) * 1000)} mm)`,
                };
            }
        }

        const blondel = 2 * actualRiser + segs[0].treadDepth;
        const blondelOk = blondel >= 0.560 && blondel <= 0.700;

        // Build per-segment summary for multi-run stairs
        const segSummary = segs.length > 1
            ? segs.map((s, i) => `R${i + 1}:${s.stepCount}`).join(' + ') + ' steps'
            : `${segs[0].stepCount} steps`;

        return {
            isValid: true,
            validationMessage: blondelOk
                ? `${segSummary} · r ${Math.round(actualRiser * 1000)} mm · t ${Math.round(segs[0].treadDepth * 1000)} mm`
                : `⚠ Comfort: 2R+T=${Math.round(blondel * 1000)} mm (ideal 560–700)`,
        };
    }
}
