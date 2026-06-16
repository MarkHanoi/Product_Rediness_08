// ADR-0074 (P1 L2 core) — per-surface sun-hours ACCUMULATION.
//
// Given a set of surfaces (each: outward normal + world sample points) and a
// deterministic sun-sample set, accumulate how many hours of DIRECT-BEAM sun each
// surface sees over the analysis window. A sun sample contributes `stepHours`
// (= stepMinutes / 60) to a sample point when ALL hold:
//   (a) the sun is above the horizon  — guaranteed for emitted samples, but
//       re-checked (altitudeDeg > 0) so a daylightOnly:false set is handled;
//   (b) the surface is SUN-FACING      — dot(normal, sunDir) > 0;
//   (c) the point is NOT occluded      — !isOccluded(point, sunDir), the injected
//       oracle the renderer-three GPU shadow pass supplies later.
//
// Per-surface sun-hours is the MEAN across its sample points (texels), so it is
// resolution-independent. AVG/MAX/MIN across surfaces give the ThatOpen-style
// readout. PURE + DETERMINISTIC: no THREE, no RNG, no Date — same inputs,
// same surfaces, same oracle ⇒ byte-identical output.

import type { IsOccluded, SolarSurface, SunHoursResult, SunSample, SurfaceSunHours, Vec3 } from './types.js';

const EPS = 1e-9;

function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export interface AccumulateOptions {
    /** Hours represented by one sun sample (the Δt slice). When omitted it is
     *  derived from `stepMinutes`; default 15 min ⇒ 0.25 h. Supply explicitly to
     *  match the cadence used in `generateSunSamples`. */
    readonly stepMinutes?: number;
    /** When true, the per-sample contribution is weighted by the cosine of
     *  incidence — dot(normal, sunDir) — so a grazing sun contributes less than a
     *  square-on sun (irradiance-style). When false (DEFAULT) every lit sample
     *  contributes a full `stepHours` (pure geometric "is the sun visible" hours,
     *  the ThatOpen sun-HOURS metric). */
    readonly normalWeighted?: boolean;
}

/**
 * Accumulate per-surface sun-hours. Pure + deterministic.
 *
 * @param surfaces   surfaces to score (outward normal + world sample points).
 * @param samples    sun samples to integrate over (e.g. `generateSunSamples(...)`).
 * @param isOccluded INJECTED occlusion oracle — `(point, sunDir) => blocked?`.
 *                   The renderer-three GPU pass provides the real one; tests
 *                   inject a deterministic mock.
 * @param opts       stepMinutes (Δt) + normal-weighting toggle.
 */
export function accumulateSunHours(
    surfaces: ReadonlyArray<SolarSurface>,
    samples: ReadonlyArray<SunSample>,
    isOccluded: IsOccluded,
    opts: AccumulateOptions = {},
): SunHoursResult {
    const stepMinutes = opts.stepMinutes && opts.stepMinutes > 0 ? opts.stepMinutes : 15;
    const stepHours = stepMinutes / 60;
    const normalWeighted = opts.normalWeighted ?? false;

    // Above-horizon sample count (re-checked so daylightOnly:false sets behave).
    let aboveHorizon = 0;
    for (const s of samples) if (s.altitudeDeg > 0) aboveHorizon++;

    const surfaceResults: SurfaceSunHours[] = surfaces.map((surface) => {
        const points = surface.samplePoints;
        const n = points.length;

        if (n === 0) {
            return {
                surfaceId: surface.id,
                sunHours: 0,
                minPointSunHours: 0,
                maxPointSunHours: 0,
                samplePointCount: 0,
            };
        }

        let total = 0;
        let minPoint = Infinity;
        let maxPoint = -Infinity;

        for (const point of points) {
            let pointHours = 0;
            for (const s of samples) {
                if (s.altitudeDeg <= 0) continue;            // (a) above horizon
                const facing = dot(surface.normal, s.dir);
                if (facing <= EPS) continue;                 // (b) sun-facing
                if (isOccluded(point, s.dir)) continue;      // (c) not occluded
                pointHours += normalWeighted ? stepHours * facing : stepHours;
            }
            total += pointHours;
            if (pointHours < minPoint) minPoint = pointHours;
            if (pointHours > maxPoint) maxPoint = pointHours;
        }

        return {
            surfaceId: surface.id,
            sunHours: total / n,
            minPointSunHours: minPoint === Infinity ? 0 : minPoint,
            maxPointSunHours: maxPoint === -Infinity ? 0 : maxPoint,
            samplePointCount: n,
        };
    });

    // AVG / MAX / MIN across surfaces (the ThatOpen-style building readout).
    let avg = 0;
    let max = -Infinity;
    let min = Infinity;
    let maxSurfaceId: string | undefined;
    let minSurfaceId: string | undefined;
    if (surfaceResults.length > 0) {
        let sum = 0;
        for (const r of surfaceResults) {
            sum += r.sunHours;
            if (r.sunHours > max) { max = r.sunHours; maxSurfaceId = r.surfaceId; }
            if (r.sunHours < min) { min = r.sunHours; minSurfaceId = r.surfaceId; }
        }
        avg = sum / surfaceResults.length;
    } else {
        max = 0;
        min = 0;
    }

    return {
        surfaces: surfaceResults,
        stepHours,
        sampleCount: aboveHorizon,
        avgSunHours: avg,
        maxSunHours: max,
        minSunHours: min,
        ...(maxSurfaceId !== undefined ? { maxSurfaceId } : {}),
        ...(minSurfaceId !== undefined ? { minSurfaceId } : {}),
    };
}
