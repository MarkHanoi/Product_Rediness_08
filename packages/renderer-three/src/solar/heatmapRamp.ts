// ADR-0074 P1b (C21 §10) — sun-hours heatmap colour ramp.
//
// PURE + THREE-FREE helper (so it is unit-testable without a GL context). Maps a
// normalised value t ∈ [0,1] to an sRGB { r, g, b } ∈ [0,1] triple along a
// perceptual purple → magenta → orange → yellow ramp. PRYZM-brand-leaning: the
// cold end anchors on the PRYZM purple (#6600FF) rather than the classic blue of
// a generic ThatOpen-style heatmap, and the hot end is a warm yellow. The ramp is
// exposed (stops) so callers / a future legend can introspect or override it.
//
// The renderer-three pass (computeSunHoursOnModel) consumes this to build the
// per-vertex BufferAttribute colours; nothing here touches THREE.

export interface RgbF {
    /** Red   ∈ [0,1] (sRGB). */ readonly r: number;
    /** Green ∈ [0,1] (sRGB). */ readonly g: number;
    /** Blue  ∈ [0,1] (sRGB). */ readonly b: number;
}

/** One colour stop on the ramp: a position t ∈ [0,1] + its sRGB colour. */
export interface RampStop {
    readonly t: number;
    readonly color: RgbF;
}

/**
 * The default sun-hours ramp, cold → hot. PRYZM purple at the cold (low-sun) end
 * through magenta + orange to a warm yellow at the hot (high-sun) end. Stops are
 * ascending in `t`; the first/last anchor t=0 / t=1.
 */
export const DEFAULT_SUN_HOURS_RAMP: ReadonlyArray<RampStop> = [
    { t: 0.0, color: { r: 0.40, g: 0.0, b: 1.0 } }, // #6600FF PRYZM purple (no sun)
    { t: 0.35, color: { r: 0.78, g: 0.10, b: 0.90 } }, // magenta
    { t: 0.6, color: { r: 1.0, g: 0.30, b: 0.45 } }, // pink-red
    { t: 0.8, color: { r: 1.0, g: 0.60, b: 0.10 } }, // orange
    { t: 1.0, color: { r: 1.0, g: 0.95, b: 0.30 } }, // warm yellow (max sun)
];

function clamp01(x: number): number {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return Number.isFinite(x) ? x : 0;
}

function lerp(a: number, b: number, f: number): number {
    return a + (b - a) * f;
}

/**
 * Sample a colour ramp at `t` ∈ [0,1] (clamped). Linear interpolation between the
 * two bracketing stops. Pure + deterministic. `stops` must be non-empty and
 * ascending in `t`; defaults to {@link DEFAULT_SUN_HOURS_RAMP}.
 */
export function sampleRamp(
    t: number,
    stops: ReadonlyArray<RampStop> = DEFAULT_SUN_HOURS_RAMP,
): RgbF {
    if (stops.length === 0) return { r: 0, g: 0, b: 0 };
    const x = clamp01(t);
    if (x <= stops[0]!.t) return stops[0]!.color;
    const last = stops[stops.length - 1]!;
    if (x >= last.t) return last.color;
    for (let i = 0; i < stops.length - 1; i++) {
        const lo = stops[i]!;
        const hi = stops[i + 1]!;
        if (x >= lo.t && x <= hi.t) {
            const span = hi.t - lo.t;
            const f = span > 1e-9 ? (x - lo.t) / span : 0;
            return {
                r: lerp(lo.color.r, hi.color.r, f),
                g: lerp(lo.color.g, hi.color.g, f),
                b: lerp(lo.color.b, hi.color.b, f),
            };
        }
    }
    return last.color;
}

/**
 * Map a sun-hours value to a ramp colour by normalising against `maxHours`.
 * `maxHours <= 0` (no sun anywhere) maps everything to the cold end. Pure.
 */
export function sunHoursToColor(
    sunHours: number,
    maxHours: number,
    stops: ReadonlyArray<RampStop> = DEFAULT_SUN_HOURS_RAMP,
): RgbF {
    const t = maxHours > 1e-9 ? sunHours / maxHours : 0;
    return sampleRamp(t, stops);
}
