// solarCodec.ts — §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110)
//
// Single source of truth for the message contract shared by the MAIN-THREAD
// `SolarWorkerPool` and the OFF-MAIN-THREAD `solar.worker.ts`, plus the pure
// pack/unpack helpers for the probe payload.
//
// The heavy sun-hours raycast (ground grid + façade study) reduces to ONE batch:
// "given occluder footprints + sun params + a list of probe points, return the
// per-probe lit fraction". The compute itself lives in the pure, THREE-free
// `computeSunIntensitiesForProbes` (apps/editor/src/ui/climate/siteMetricGrids) — the
// SAME function the main-thread fallback calls — so a worker result is byte-identical
// to the synchronous result: the worker changes ONLY where the CPU runs, never the math.
//
// TRANSFER: probes + the result travel as `Float64Array` typed arrays (transferable, so
// the buffers move rather than copy). DOUBLE precision keeps a worker result BYTE-IDENTICAL
// to the synchronous main-thread compute (single precision would diverge in the LSBs of
// both the probe coords and the intensity). Occluder footprints are small plain objects
// (structured-clone). No DOM, no THREE, no rAF here — safe from both a
// DedicatedWorkerGlobalScope and the main thread.

// §FIX-SOLAR-WORKER-NO-RANDOM (L-178, 2026-07-07) — the pure sun-hours raycast CORE + its
// message types live HERE, the worker's leaf module, imported ONLY by `solar.worker.ts`,
// `SolarWorkerPool`, and (re-exported by) `siteMetricGrids`. WHY: the worker used to import
// `computeSunIntensitiesForProbes` straight from `siteMetricGrids`, which statically pulls in
// the WHOLE climate/street analysis graph (@pryzm/climate-host, @pryzm/street-analytics,
// climateChartData, …). A transitive dependency in THAT graph runs a secure-crypto id
// generator at MODULE LOAD; inside a DedicatedWorkerGlobalScope that path is unusable and
// threw `secure crypto unusable, insecure Math.random not allowed`, so the worker died on
// startup and every sun-hours field fell back to the ~1-min synchronous main-thread raycast.
// Moving the raycast core to this leaf makes the worker's static import graph exactly
// { solarCodec → @pryzm/solar-analysis } — all PURE, deterministic, crypto-free — so the
// worker actually runs. The compute is byte-identical to before (same functions, moved not
// changed); `siteMetricGrids` re-exports them so every existing main-thread caller is
// unchanged, guaranteeing worker==main.
import type { Pt } from '@pryzm/street-analytics';
import { pointInRingEvenOdd } from '@pryzm/geometry-kernel';
import {
    generateSunSamples,
    juneSolsticeDayOfYear,
    decemberSolsticeDayOfYear,
    marchEquinoxDayOfYear,
    buildOccluderIndex,
    type OccluderBox,
    type OccluderIndex,
    type SunSample,
} from '@pryzm/solar-analysis';

/** A building footprint in the site-ENU frame (east/north metres) + its height. */
export interface MetricFootprint {
    /** Outer ring, site-ENU metres (east = x, north = z to match StreetGrid's XZ). */
    readonly ring: readonly Pt[];
    readonly heightM: number;
    readonly floors?: number;
}

/** A sun-hours analysis day preset (Forma pattern). */
export type SunDayPreset = 'summer' | 'winter' | 'equinox';

/** A probe point for the sun raycast. A WALL probe carries an outward normal (metric
 *  east/north) so back-facing sun samples are self-shaded; a GROUND/ROOF probe leaves
 *  the normal undefined (all above-horizon samples count). */
export interface SunProbe {
    readonly east: number;
    readonly north: number;
    readonly up: number;
    /** Outward wall normal (metric east/north). Omit for ground/roof probes. */
    readonly normE?: number;
    readonly normN?: number;
}

/** Sun parameters for a probe-compute batch (site position + analysis day + cadence). */
export interface SunProbeParams {
    readonly latDeg: number;
    readonly lngDeg: number;
    readonly sunDay?: SunDayPreset;
    /** Sun-sample cadence (minutes). Default 15. */
    readonly stepMinutes?: number;
}

/** Doubles per packed probe: east, north, up, normE, normN. A ground/roof probe stores
 *  NaN for the two normal slots (⇒ no back-face cull). */
export const PROBE_STRIDE = 5;

/** Pack probes into a flat `Float64Array` (transferable). NaN normals ⇒ ground/roof. */
export function packProbes(probes: readonly SunProbe[]): Float64Array {
    const arr = new Float64Array(probes.length * PROBE_STRIDE);
    for (let i = 0; i < probes.length; i++) {
        const p = probes[i]!;
        const o = i * PROBE_STRIDE;
        arr[o] = p.east;
        arr[o + 1] = p.north;
        arr[o + 2] = p.up;
        arr[o + 3] = p.normE ?? Number.NaN;
        arr[o + 4] = p.normN ?? Number.NaN;
    }
    return arr;
}

/** Unpack a flat probe `Float64Array` back into `SunProbe[]`. NaN normals ⇒ omitted. */
export function unpackProbes(packed: Float64Array): SunProbe[] {
    const n = Math.floor(packed.length / PROBE_STRIDE);
    const out: SunProbe[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const o = i * PROBE_STRIDE;
        const normE = packed[o + 3]!;
        const normN = packed[o + 4]!;
        out[i] = Number.isNaN(normE) || Number.isNaN(normN)
            ? { east: packed[o]!, north: packed[o + 1]!, up: packed[o + 2]! }
            : { east: packed[o]!, north: packed[o + 1]!, up: packed[o + 2]!, normE, normN };
    }
    return out;
}

/** The requestId used by the worker's startup handshake message. */
export const SOLAR_WORKER_READY_ID = '__solar_ready__';

/** Request posted to the solar worker: a probe batch + occluders + sun params. */
export interface SolarWorkerRequest {
    readonly requestId: string;
    /** Monotonic sequence — a HIGHER seq supersedes (cancels) any in-flight lower one. */
    readonly seq: number;
    /** Packed probes (`PROBE_STRIDE` doubles each). Transferred, not copied. */
    readonly probes: Float64Array;
    readonly occluders: readonly MetricFootprint[];
    readonly params: SunProbeParams;
}

/** A one-shot cancel for an in-flight request (posted when a newer build supersedes). */
export interface SolarWorkerCancel {
    readonly cancel: true;
    /** Cancel every request whose seq is ≤ this. */
    readonly seq: number;
}

/** Result posted back by the solar worker. */
export interface SolarWorkerResult {
    readonly requestId: string;
    /** Present on success: per-probe lit fraction (0..1), same order as the input. */
    readonly intensities?: Float64Array;
    /** Present when the worker threw — the pool rejects and the caller falls back. */
    readonly error?: string;
    /** Present when the request was cancelled (superseded) before completing. */
    readonly cancelled?: boolean;
    /** One-time handshake posted at worker startup so the pool knows it is live. */
    readonly ready?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-SOLAR-WORKER-NO-RANDOM (L-178) — pure sun-hours raycast CORE (moved verbatim
// from siteMetricGrids so the worker's graph excludes the crypto-at-load analysis deps).
// PURE analytic ray-vs-extruded-footprint occlusion + NOAA sun samples: no THREE, no DOM,
// no rAF, no RNG, no Date — deterministic and byte-identical on main thread OR worker.
//
// FRAME: (east, north, up) metres. Footprint rings are StreetGrid XZ (x = east, z = north).
// Sun-sample `dir` is the solar-analysis ENU frame { x = East, y = Up, z = South }, so
// north = −dir.z, up = dir.y, east = dir.x.
// ─────────────────────────────────────────────────────────────────────────────

/** An extruded-footprint prism for the analytic shadow-ray test. */
export interface Prism {
    /** Footprint ring in (east, north) metres. */
    readonly ring: ReadonlyArray<{ e: number; n: number }>;
    /** Axis-aligned bbox of the ring (cheap reject). */
    readonly minE: number; readonly maxE: number; readonly minN: number; readonly maxN: number;
    readonly heightM: number;
}

export function toPrisms(footprints: readonly MetricFootprint[]): Prism[] {
    const out: Prism[] = [];
    for (const f of footprints) {
        if (f.ring.length < 3 || !(f.heightM > 0)) continue;
        const ring = f.ring.map((p) => ({ e: p.x, n: p.z }));
        let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
        for (const v of ring) {
            if (v.e < minE) minE = v.e; if (v.e > maxE) maxE = v.e;
            if (v.n < minN) minN = v.n; if (v.n > maxN) maxN = v.n;
        }
        out.push({ ring, minE, maxE, minN, maxN, heightM: f.heightM });
    }
    return out;
}

/** Point-in-polygon (ray casting) in (east, north) — §C73-PIP-CANONICAL:
 *  delegates to THE kernel ray cast with {e,n} accessors (the predicate is
 *  plane-agnostic; no wrapper is minted per naming convention). */
export function pointInRing(e: number, n: number, ring: ReadonlyArray<{ e: number; n: number }>): boolean {
    return pointInRingEvenOdd(e, n, ring.length, (i) => ring[i]!.e, (i) => ring[i]!.n);
}

/**
 * Is the ray from `(e0, n0, up0)` in horizontal direction `(de, dn)` (unit) rising
 * at `slope` (= up.per.horizontal-metre, > 0 toward the sun) BLOCKED by `prism`
 * before it clears the roof? We march the horizontal ray a few steps across the
 * prism's footprint extent; if any step lies inside the ring AND the ray height
 * there is below the roof, it's blocked. Coarse but pure + adequate for a planning
 * heatmap (a stylised shadow, not a survey). */
export function rayBlockedByPrism(
    e0: number, n0: number, up0: number,
    de: number, dn: number, slope: number,
    prism: Prism,
): boolean {
    // How far ahead (horizontal metres) the prism bbox is — quick reject if the ray
    // points away from it.
    const cx = (prism.minE + prism.maxE) / 2;
    const cz = (prism.minN + prism.maxN) / 2;
    const toCx = cx - e0, toCz = cz - n0;
    if (toCx * de + toCz * dn <= 0) return false; // prism is behind the ray
    // March from the bbox near edge to the far edge in ~1.5 m steps.
    const span = Math.hypot(prism.maxE - prism.minE, prism.maxN - prism.minN);
    const reach = Math.hypot(toCx, toCz) + span; // generous upper bound
    const step = Math.max(1.0, span / 8);
    for (let d = 1.0; d <= reach; d += step) {
        const e = e0 + de * d;
        const n = n0 + dn * d;
        if (e < prism.minE - 1 || e > prism.maxE + 1 || n < prism.minN - 1 || n > prism.maxN + 1) {
            // Past the prism extent in the march direction → stop early if we've gone by.
            if (d > 1.0 && (e - cx) * de + (n - cz) * dn > span) break;
            continue;
        }
        if (!pointInRing(e, n, prism.ring)) continue;
        const heightAtD = up0 + slope * d;
        if (heightAtD < prism.heightM) return true; // ray passes through the solid
    }
    return false;
}

/** True when the sun (sample `s`) is occluded for the cell at `(e0, n0)`. */
export function sunBlocked(
    e0: number, n0: number, up0: number,
    s: SunSample,
    prisms: readonly Prism[],
): boolean {
    // Sun direction TOWARD the sun in (east, north, up): east = dir.x, north = −dir.z,
    // up = dir.y. Build the horizontal unit + the vertical slope per horizontal metre.
    const he = s.dir.x;
    const hn = -s.dir.z;
    const hmag = Math.hypot(he, hn);
    if (hmag < 1e-6) return false;          // sun overhead → unobstructed
    const de = he / hmag, dn = hn / hmag;
    const slope = s.dir.y / hmag;           // up per horizontal metre (>0 above horizon)
    for (const p of prisms) {
        if (rayBlockedByPrism(e0, n0, up0, de, dn, slope, p)) return true;
    }
    return false;
}

// §PERF-SUNHOURS-BVH (L-143) — the raycast accelerator. The naive `sunBlocked` above
// loops over EVERY prism per (cell × sun-sample); with ~4700 context buildings that is
// the dominant cost. `PrismShadowIndex` bundles the prisms with a uniform-grid spatial
// index over their bboxes + the tallest roof, so `sunBlockedIndexed` only runs the exact
// `rayBlockedByPrism` test on the handful of prisms the shadow ray could actually cross.
//
// DETERMINISM: the index returns a strict SUPERSET of the prisms whose bbox the ray
// crosses (see buildOccluderIndex's proof); the SAME `rayBlockedByPrism` runs on each
// candidate and the result is OR-ed, so the occlusion answer is byte-identical to the
// naive loop — only faster. Beyond the distance at which the ray rises above the tallest
// roof no prism can block, so the query reach is bounded by that height/slope crossing.
interface PrismShadowIndex {
    readonly prisms: readonly Prism[];
    readonly index: OccluderIndex;
    readonly maxHeightM: number;
}

/** Build the shadow-ray acceleration structure for a prism set (once per grid). */
export function buildPrismShadowIndex(prisms: readonly Prism[]): PrismShadowIndex {
    const boxes: OccluderBox[] = prisms.map((p) => ({ minE: p.minE, maxE: p.maxE, minN: p.minN, maxN: p.maxN }));
    let maxHeightM = 0;
    for (const p of prisms) if (p.heightM > maxHeightM) maxHeightM = p.heightM;
    return { prisms, index: buildOccluderIndex(boxes), maxHeightM };
}

/** True when the sun (sample `s`) is occluded for the cell at `(e0, n0)` — accelerated by
 *  the spatial index. Byte-identical result to `sunBlocked(e0,n0,up0,s,prisms)`. `scratch`
 *  is a reusable candidate-index array (cleared per call) so the hot loop never allocates. */
export function sunBlockedIndexed(
    e0: number, n0: number, up0: number,
    s: SunSample,
    acc: PrismShadowIndex,
    scratch: number[],
): boolean {
    const he = s.dir.x;
    const hn = -s.dir.z;
    const hmag = Math.hypot(he, hn);
    if (hmag < 1e-6) return false;          // sun overhead → unobstructed
    const de = he / hmag, dn = hn / hmag;
    const slope = s.dir.y / hmag;           // up per horizontal metre (>0 above horizon)
    // Beyond `maxReach` the ray height (up0 + slope·d) exceeds the tallest roof, so no
    // prism can block; the index clamps this further to the indexed extent internally.
    const maxReach = slope > 1e-6
        ? Math.max(0, (acc.maxHeightM - up0) / slope)
        : Number.POSITIVE_INFINITY;         // grazing sun — index clamps to its extent
    const candidates = acc.index.queryRaySegment(e0, n0, de, dn, maxReach, scratch);
    const prisms = acc.prisms;
    for (let k = 0; k < candidates.length; k++) {
        if (rayBlockedByPrism(e0, n0, up0, de, dn, slope, prisms[candidates[k]!]!)) return true;
    }
    return false;
}

/** Resolve the analysis day-of-year from a preset (default summer solstice). */
export function sunDayOfYear(preset: SunDayPreset | undefined): number {
    switch (preset) {
        case 'winter': return decemberSolsticeDayOfYear();
        case 'equinox': return marchEquinoxDayOfYear();
        case 'summer':
        default: return juneSolsticeDayOfYear();
    }
}

/**
 * §PERF-SUNHOURS-WORKER — compute the direct-beam sun-hours INTENSITY (0 = shaded …
 * 1 = full sun) for a batch of probe points against a set of occluder footprints. PURE
 * + deterministic (no THREE / DOM / RNG / Date): same probes + occluders + sun params ⇒
 * byte-identical `Float64Array`, whether run on the main thread or inside `solar.worker`.
 *
 * The result at index i is the fraction of above-horizon sun samples reaching probe i
 * unobstructed (for a WALL probe, only front-facing samples can count). It is a DOUBLE
 * (`Float64Array`, which is transferable) and mirrors `prepareSunHoursGrid.evaluateIntensity`
 * EXACTLY — the same `(lit·stepHours)/maxHours` expression — so a worker-computed value is
 * byte-identical to the synchronous main-thread value (the worker changes only speed).
 *
 * @param probes    probe points (packed by the caller; order preserved in the output).
 * @param occluders occluder footprints (context + own massing) for the shadow test.
 * @param params    site lat/lon + analysis day + sample cadence.
 */
export function computeSunIntensitiesForProbes(
    probes: readonly SunProbe[],
    occluders: readonly MetricFootprint[],
    params: SunProbeParams,
): Float64Array {
    const out = new Float64Array(probes.length);
    if (probes.length === 0) return out;
    const stepMinutes = params.stepMinutes && params.stepMinutes > 0 ? params.stepMinutes : 15;
    const samples = generateSunSamples({
        latDeg: params.latDeg,
        lngDeg: params.lngDeg,
        dayOfYear: sunDayOfYear(params.sunDay),
        stepMinutes,
        daylightOnly: true,
    });
    // Same hour scale as prepareSunHoursGrid.evaluateIntensity ⇒ byte-identical result.
    const stepHours = stepMinutes / 60;
    const maxHours = samples.length * stepHours;
    const prisms = toPrisms(occluders);
    const shadow = buildPrismShadowIndex(prisms);
    const scratch: number[] = [];
    for (let i = 0; i < probes.length; i++) {
        const p = probes[i]!;
        const isWall = p.normE !== undefined && p.normN !== undefined
            && (Math.abs(p.normE) + Math.abs(p.normN)) > 1e-6;
        let lit = 0;
        for (const s of samples) {
            if (isWall) {
                // Sun on the OUTWARD side only (back-faces self-shade). east = dir.x,
                // north = −dir.z (same frame as prepareFacadeSunGrid).
                const facing = s.dir.x * p.normE! + (-s.dir.z) * p.normN!;
                if (facing <= 0) continue;
            }
            if (!sunBlockedIndexed(p.east, p.north, p.up, s, shadow, scratch)) lit++;
        }
        out[i] = maxHours > 0 ? (lit * stepHours) / maxHours : 0;
    }
    try {
        console.debug(
            `[span][sunhours-probe-compute] ${probes.length} probe(s) × ${samples.length} sun sample(s) ` +
            `vs ${prisms.length} occluder prism(s).`,
        );
    } catch { /* console unavailable (headless) — span is best-effort */ }
    return out;
}
