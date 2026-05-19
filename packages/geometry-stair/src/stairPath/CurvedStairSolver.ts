/**
 * CurvedStairSolver — geometry solver for the "C" (curved/arc) stair type.
 *
 * A curved stair is a sector of an annulus in plan view:
 *   • inner arc at `innerRadius`
 *   • outer arc at `innerRadius + width`
 *   • steps are pie-wedge slices radiating from the centre
 *
 * Inputs  : center, startAngle, sweepAngle, innerRadius, width, stair params.
 * Outputs : per-step slice geometry + validation.
 *
 * Pure computation — no DOM, no canvas, no Three.js.
 */

import type { Point2D } from './PolylineModel';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One wedge step in plan view. */
export interface CurvedStepSlice {
    /** Angle at which this step starts (radians, measured from +X / east). */
    startAngle: number;
    /** Angle at which this step ends. */
    endAngle:   number;
    /** Arc midpoint on the walking line (used for labels). */
    midAngle:   number;
    /** Inner arc radius (metres). */
    innerR:     number;
    /** Outer arc radius = innerR + width (metres). */
    outerR:     number;
    /** 1-based step number across the whole stair. */
    stepNumber: number;
}

/** Full curved stair solver output. */
export interface CurvedSolverResult {
    /** 'C' shape identifier. */
    shape: 'C';
    /** Centre point of the arc in world XZ. */
    center: Point2D;
    /** Start angle in radians. */
    startAngle: number;
    /** Total sweep in radians (positive = CCW, negative = CW). */
    sweepAngle: number;
    /** Inner radius in metres. */
    innerRadius: number;
    /** Outer radius = innerRadius + width. */
    outerRadius: number;
    /** Stair width in metres. */
    width: number;
    /** Total riser count. */
    stepCount: number;
    /** Actual riser height (totalHeight / stepCount). */
    riserHeight: number;
    /** Arc length at walking line (mid radius) per step. */
    treadArcLength: number;
    /** Arc length at inner edge per step (for validation). */
    innerTreadArc: number;
    /** Arc length at outer edge per step. */
    outerTreadArc: number;
    /** Per-step slice geometry. */
    slices: CurvedStepSlice[];
    /** Whether the stair meets code minimums. */
    isValid: boolean;
    /** Human-readable status/warning. */
    validationMessage: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

// Building code limits
const MIN_RISER    = 0.100; // 100 mm
const MAX_RISER    = 0.220; // 220 mm
const MIN_TREAD_INNER = 0.150; // 150 mm min at inner edge (curved stair special)
const MIN_TREAD_WALK  = 0.220; // 220 mm at walking line (standard)
const MAX_TREAD    = 0.400; // 400 mm max at outer edge
const MIN_INNER_R  = 0.300; // 300 mm minimum inner radius

// ── Solver ────────────────────────────────────────────────────────────────────

export class CurvedStairSolver {
    private _width       = 1.0;
    private _riserH      = 0.175;
    private _totalH      = 3.0;
    private _innerRadius = 0.8;
    /** Sweep angle in degrees (positive = CCW, negative = CW). */
    private _sweepDeg    = 180;

    constructor(params?: {
        width?:       number;
        riserHeight?: number;
        totalHeight?: number;
        innerRadius?: number;
        sweepAngle?:  number;
    }) {
        if (params) this.update(params);
    }

    update(params: {
        width?:       number;
        riserHeight?: number;
        totalHeight?: number;
        innerRadius?: number;
        sweepAngle?:  number;
    }): void {
        if (params.width       != null) this._width       = params.width;
        if (params.riserHeight != null) this._riserH      = params.riserHeight;
        if (params.totalHeight != null) this._totalH      = params.totalHeight;
        if (params.innerRadius != null) this._innerRadius = params.innerRadius;
        if (params.sweepAngle  != null) this._sweepDeg    = params.sweepAngle;
    }

    get width()       { return this._width;       }
    get innerRadius() { return this._innerRadius; }
    get sweepAngle()  { return this._sweepDeg;    }
    get riserHeight() { return this._riserH;      }

    /**
     * Solve curved stair geometry.
     * @param center    World XZ centre of the arc.
     * @param startAngle Angle in radians where the first step begins.
     * @param sweepOverride Optional override of the sweep angle (radians).
     */
    solve(
        center: Point2D,
        startAngle: number,
        sweepOverride?: number,
    ): CurvedSolverResult {
        const sweepRad = sweepOverride ?? (this._sweepDeg * DEG2RAD);
        const innerR   = Math.max(MIN_INNER_R, this._innerRadius);
        const outerR   = innerR + this._width;
        const walkR    = (innerR + outerR) / 2;

        // Step count
        const stepCount = Math.max(2, Math.round(this._totalH / this._riserH));
        const actualRiserH = this._totalH / stepCount;

        // Angle per step
        const sweepPerStep = sweepRad / stepCount;

        // Build slices
        const slices: CurvedStepSlice[] = [];
        for (let i = 0; i < stepCount; i++) {
            const sa = startAngle + i       * sweepPerStep;
            const ea = startAngle + (i + 1) * sweepPerStep;
            slices.push({
                startAngle: sa,
                endAngle:   ea,
                midAngle:   (sa + ea) / 2,
                innerR,
                outerR,
                stepNumber: i + 1,
            });
        }

        // Tread arc lengths
        const treadArcLength = Math.abs(sweepPerStep) * walkR;
        const innerTreadArc  = Math.abs(sweepPerStep) * innerR;
        const outerTreadArc  = Math.abs(sweepPerStep) * outerR;

        // Validation
        const { isValid, validationMessage } = this._validate(
            actualRiserH, innerTreadArc, treadArcLength, outerTreadArc, innerR,
        );

        return {
            shape: 'C',
            center,
            startAngle,
            sweepAngle:     sweepRad,
            innerRadius:    innerR,
            outerRadius:    outerR,
            width:          this._width,
            stepCount,
            riserHeight:    actualRiserH,
            treadArcLength,
            innerTreadArc,
            outerTreadArc,
            slices,
            isValid,
            validationMessage,
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Given a center and a point on the arc, compute the inner radius
     * (clamped to MIN_INNER_R) and start angle.
     */
    static radiusAndAngle(center: Point2D, pt: Point2D): { radius: number; angle: number } {
        const dx = pt.x - center.x;
        const dz = pt.z - center.z;
        const radius = Math.max(MIN_INNER_R, Math.sqrt(dx * dx + dz * dz));
        const angle  = Math.atan2(dz, dx);
        return { radius, angle };
    }

    /**
     * Compute sweep angle from center + fix point + cursor position.
     * The sign determines CW vs CCW.
     */
    static sweepAngle(
        center: Point2D,
        fixAngle: number,
        cursor: Point2D,
    ): number {
        const dx = cursor.x - center.x;
        const dz = cursor.z - center.z;
        const cursorAngle = Math.atan2(dz, dx);

        // Normalise difference to [-π, π]
        let delta = cursorAngle - fixAngle;
        while (delta >  Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;

        // Clamp to meaningful range [10°, 350°]
        const minSweep =  10 * DEG2RAD;
        const maxSweep = 350 * DEG2RAD;
        if (Math.abs(delta) < minSweep) {
            delta = Math.sign(delta || 1) * minSweep;
        }
        if (Math.abs(delta) > maxSweep) {
            delta = Math.sign(delta) * maxSweep;
        }
        return delta;
    }

    private _validate(
        riserH: number,
        innerTread: number,
        walkTread: number,
        _outerTread: number,
        innerR: number,
    ): { isValid: boolean; validationMessage: string } {
        if (innerR < MIN_INNER_R) {
            return {
                isValid: false,
                validationMessage: `Inner radius too small (min ${Math.round(MIN_INNER_R * 1000)} mm)`,
            };
        }
        if (riserH < MIN_RISER) {
            return {
                isValid: false,
                validationMessage: `Riser too small (${Math.round(riserH * 1000)} mm — min ${MIN_RISER * 1000} mm)`,
            };
        }
        if (riserH > MAX_RISER) {
            return {
                isValid: false,
                validationMessage: `Riser too tall (${Math.round(riserH * 1000)} mm — max ${MAX_RISER * 1000} mm)`,
            };
        }
        if (innerTread < MIN_TREAD_INNER) {
            return {
                isValid: false,
                validationMessage: `Inner tread too narrow (${Math.round(innerTread * 1000)} mm — min ${MIN_TREAD_INNER * 1000} mm at inner edge)`,
            };
        }
        if (walkTread < MIN_TREAD_WALK) {
            return {
                isValid: false,
                validationMessage: `Tread too short at walking line (${Math.round(walkTread * 1000)} mm — min ${MIN_TREAD_WALK * 1000} mm)`,
            };
        }
        if (_outerTread > MAX_TREAD) {
            return {
                isValid: false,
                validationMessage: `Outer tread too wide (${Math.round(_outerTread * 1000)} mm — max ${MAX_TREAD * 1000} mm)`,
            };
        }

        const blondel = 2 * riserH + walkTread;
        const blondelOk = blondel >= 0.560 && blondel <= 0.700;

        const msg = blondelOk
            ? `${Math.round(this._sweepDeg)}° arc · r ${Math.round(riserH * 1000)} mm · t ${Math.round(walkTread * 1000)} mm (walk line)`
            : `⚠ Comfort: 2R+T=${Math.round(blondel * 1000)} mm (ideal 560–700)`;

        return { isValid: true, validationMessage: msg };
    }
}
