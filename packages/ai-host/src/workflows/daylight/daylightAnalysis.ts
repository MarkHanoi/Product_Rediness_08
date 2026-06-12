// §27 / §61 — Per-room OFFLINE daylight analytic pass — the core.
//
// READ types.ts FIRST for the frame / units contract. Summary: world-metres,
// plan frame { x, z } (z = plan "up", North = −z), vertical axis world-Y up.
//
// ── THE MODEL (and its v1 simplifications) ──────────────────────────────────
//
// Per room we lay a deterministic grid of floor sample points (point-in-polygon),
// and for a set of sun positions over a representative day/year we test, for each
// (sample point × sun sample), whether direct sun reaches that point THROUGH one
// of the room's own window apertures. A contribution is accrued, weighted by the
// flux geometry, and integrated → a per-room raw insolation, normalised to [0,1].
//
// The occlusion model is the SPIKE §B "room-as-box" idealisation:
//   • The room's floor is lit ONLY through its window apertures. A sun ray that
//     would hit the façade OUTSIDE every aperture rectangle is blocked by the
//     opaque wall (this IS the occlusion test — no separate wall mesh needed).
//   • The sun must be ABOVE the horizon AND on the OUTWARD side of the aperture's
//     façade (S · outwardNormal > 0), else the façade can't admit it.
//   • A self-shadow guard: the horizontal P→aperture path must stay inside the
//     room polygon, so a concave room's own re-entrant wall blocks a grazing ray.
//
// Each admitted contribution is weighted by:
//   • cos(incidence on the floor)         = sin(elevation)  (flux on a horizontal
//                                            working plane — low sun spreads thin)
//   • a window solid-angle proxy          = apertureArea / (π · d²), d = distance
//                                            from the sample point to the aperture
//                                            hit point (a bigger / nearer window
//                                            subtends more sky → more light)
//   • the sun sample's own weight         (seasonal / hourly frequency)
//
// On top of the direct beam we add a small SKY-DIFFUSE term per (floor point ×
// aperture): a window admits ambient skylight regardless of the sun's azimuth,
// so a NORTH-facing window (which receives no direct beam in the N hemisphere)
// still beats a windowless room — matching the founder's "depends on window size
// and location" for ALL orientations. The diffuse term uses the same solid-angle
// proxy but a flat (sun-independent) skylight luminance, scaled by
// `diffuseSkyWeight` so the direct beam still dominates orientation.
//
// Integrating Σ over points × samples (+ the per-point diffuse) and dividing by
// the point count gives a raw-per-sample insolation; dividing THAT by
// `fullDaylightRawPerSample` and clamping to [0,1] gives the normalised score.
// Monotonicity (unit-tested): bigger window > smaller; lower sill > higher;
// sun-facing > sun-away > windowless = 0.
//
// ── v1 SIMPLIFICATIONS (honest caveats — NOT yet modelled) ──────────────────
//   • NO inter-room occlusion: a neighbouring room / its furniture / a context
//     building never shadows this room. Each room is analysed in isolation.
//   • The sky-diffuse term is an ISOTROPIC ambient proxy (a CIE-overcast /
//     ground-reflected model would weight the sky patch by altitude). It exists
//     so non-sun-facing windows rank above windowless; it is NOT a calibrated
//     absolute lux. The whole pass is a defensible RELATIVE metric ("which room
//     is brighter, and why"), not a code-compliant daylight-factor.
//   • NO glazing transmittance / frame factor: the aperture is treated as a clear
//     rectangular hole. A future pass can scale by a per-window τ.
//   • The sun is a point (no solar-disc soft penumbra) — fine for an analytic mean.
//
// PURE + DETERMINISTIC: zero THREE / Cesium / DOM, no Date.now, no Math.random.
// Same inputs → byte-identical outputs (the grid + sample order are deterministic).

import type {
    BuildingDaylightResult,
    DaylightOptions,
    Pt2,
    RoomDaylightInput,
    RoomDaylightResult,
    SunSample,
    WindowAperture,
    WindowContribution,
} from './types.js';

const DEG = Math.PI / 180;
const EPS = 1e-9;

const DEFAULT_GRID_SPACING_M = 0.5;
const DEFAULT_SAMPLE_HEIGHT_M = 0.0;
const DEFAULT_MAX_SAMPLE_POINTS = 4000;
// Tuned so a full-height glazed sun-facing wall (patio-door scale, sill ≈ 0)
// saturates the per-sample insolation near 1.0, while ordinary windows sit
// mid-range and a small high window stays low. The datum is raw-insolation PER
// floor-sample (the 1/d² weighting means near-window samples dominate, so the
// mean-per-sample of a glazed wall lands ≈ 2.5 — see the probe in the test
// history). Empirically derived; the monotonicity tests pin the ordering, not
// the absolute value, so this is a presentation scale, not a physical constant.
const DEFAULT_FULL_DAYLIGHT_RAW_PER_SAMPLE = 2.5;
// Isotropic sky-diffuse weight (see header). Lets a non-sun-facing window beat
// windowless while keeping the direct beam dominant for orientation.
const DEFAULT_DIFFUSE_SKY_WEIGHT = 0.18;

// ── small vector helpers (XZ plane, metres) ─────────────────────────────────
function sub2(a: Pt2, b: Pt2): Pt2 { return { x: a.x - b.x, z: a.z - b.z }; }
function dot2(a: Pt2, b: Pt2): number { return a.x * b.x + a.z * b.z; }
function len2(a: Pt2): number { return Math.hypot(a.x, a.z); }

/** Polygon bounding box (XZ). */
function bbox(poly: ReadonlyArray<Pt2>): { minX: number; maxX: number; minZ: number; maxZ: number } {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
}

/** Ray-cast point-in-polygon (world XZ). Boundary handling is the standard
 *  half-open rule — deterministic across runs. */
function pointInPolygon(p: Pt2, poly: ReadonlyArray<Pt2>): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]!.x, zi = poly[i]!.z;
        const xj = poly[j]!.x, zj = poly[j]!.z;
        if (((zi > p.z) !== (zj > p.z)) &&
            (p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
}

/**
 * Unit sun direction in the world frame { x = East, y = up, z = plan-up }, given
 * a compass azimuth (N=0°, E=90°, clockwise from above) + elevation above the
 * horizon. North is −z, so the "north" component maps to −z.
 *   x (East)  =  sin(az)·cos(el)
 *   z (−North)= −cos(az)·cos(el)
 *   y (up)    =  sin(el)
 */
export function sunDirection(
    azimuthDeg: number, elevationDeg: number,
): { x: number; y: number; z: number } {
    const az = azimuthDeg * DEG;
    const el = elevationDeg * DEG;
    const ce = Math.cos(el);
    return {
        x: Math.sin(az) * ce,
        y: Math.sin(el),
        z: -Math.cos(az) * ce,
    };
}

/**
 * The DEFAULT representative sun-path sample set for a given site latitude:
 * equinox + summer + winter solstice × a morning/noon/afternoon triple, with
 * weights favouring the equinox + midday. Deterministic + pure (no Date). A
 * Northern-hemisphere default; for the Southern hemisphere the noon sun swings
 * to the North, handled by the latitude sign.
 *
 * Solar geometry (simplified, no equation-of-time): at solar noon the sun sits
 * due-equator at elevation `90 − |lat − decl|`; morning/afternoon samples drop
 * elevation + swing the azimuth ±45° toward East/West. Declination: +23.44°
 * (summer), 0 (equinox), −23.44° (winter), relative to the equator-facing side.
 *
 * Samples that fall below the horizon are still returned (elevation may be ≤ 0
 * for a deep-winter low sun) — the analyser skips them, so the set is honest.
 */
export function defaultSunSamples(latitudeDeg: number): SunSample[] {
    const lat = Number.isFinite(latitudeDeg) ? latitudeDeg : 51.5; // London default
    const north = lat >= 0;
    // Azimuth of the equator-facing midday sun: South (180°) in the N hemisphere,
    // North (0°) in the S hemisphere.
    const noonAz = north ? 180 : 0;
    // Morning sun is toward the East (az − 45° from noon, wrapping), afternoon West.
    const eastAz = (noonAz - 45 + 360) % 360;
    const westAz = (noonAz + 45) % 360;

    const decls: Array<{ d: number; w: number; tag: string }> = [
        { d: 23.44, w: 1.0, tag: 'summer' },
        { d: 0, w: 1.5, tag: 'equinox' },     // equinox weighted higher (representative)
        { d: -23.44, w: 0.8, tag: 'winter' },
    ];
    // Elevation of the equator-facing midday sun for a declination, at this lat.
    const noonElev = (decl: number): number => 90 - Math.abs(lat - decl);

    const out: SunSample[] = [];
    for (const { d, w, tag } of decls) {
        const en = noonElev(d);
        // Morning / afternoon ≈ 60% of the noon elevation (a stable, deterministic
        // proxy for the daily arc — we are integrating a representative spread,
        // not simulating a literal clock).
        const eFlank = Math.max(0, en * 0.6);
        out.push({ azimuthDeg: eastAz, elevationDeg: eFlank, weight: 0.7 * w, label: `${tag} AM` });
        out.push({ azimuthDeg: noonAz, elevationDeg: en, weight: 1.0 * w, label: `${tag} noon` });
        out.push({ azimuthDeg: westAz, elevationDeg: eFlank, weight: 0.7 * w, label: `${tag} PM` });
    }
    return out;
}

/** Aperture geometry pre-computed once per window. */
interface ApertureGeom {
    readonly a: Pt2;          // left edge on wall centreline (XZ)
    readonly dir: Pt2;        // unit a→b
    readonly len: number;     // segment length (m)
    readonly outward: Pt2;    // unit outward normal (XZ)
    readonly sillM: number;
    readonly headM: number;
    readonly heightM: number; // head − sill
    readonly area: number;    // len × heightM (m²)
    readonly midH: number;    // (sill + head) / 2
}

function prepAperture(w: WindowAperture): ApertureGeom | null {
    const d = sub2(w.b, w.a);
    const L = len2(d);
    if (L < EPS) return null;
    const dir: Pt2 = { x: d.x / L, z: d.z / L };
    const nLen = len2(w.outwardNormal);
    if (nLen < EPS) return null;
    const outward: Pt2 = { x: w.outwardNormal.x / nLen, z: w.outwardNormal.z / nLen };
    const heightM = w.headM - w.sillM;
    if (heightM <= EPS) return null;
    return {
        a: { x: w.a.x, z: w.a.z }, dir, len: L, outward,
        sillM: w.sillM, headM: w.headM, heightM,
        area: L * heightM, midH: (w.sillM + w.headM) / 2,
    };
}

/**
 * Does the sun ray from floor point P (at world-Y = `pY`, relative floor datum 0)
 * pass OUT through the aperture? If so, return the weighted contribution; else 0.
 *
 * `sun` is the unit direction TOWARD the sun in { x, y, z } (y up). The aperture's
 * façade plane passes through the wall line `a → (a+dir·t)` with horizontal normal
 * `outward`. We intersect the ray P + s·sun with that vertical plane, then test the
 * hit lies within the segment span [0, len] horizontally and [sill, head]
 * vertically, and that the path stays inside the room polygon.
 */
function apertureContribution(
    P: Pt2, pY: number, sun: { x: number; y: number; z: number },
    ap: ApertureGeom, poly: ReadonlyArray<Pt2>,
): number {
    // Sun must be on the OUTWARD side of the façade (else the wall faces away).
    const sunHoriz: Pt2 = { x: sun.x, z: sun.z };
    const facing = dot2(sunHoriz, ap.outward);
    if (facing <= EPS) return 0;

    // Plane: points X with (X − a)·outward = 0 (vertical façade plane, XZ normal).
    // Ray: X(s) = P + s·sun (P has Y = pY). Solve for s where horizontal offset
    // along `outward` reaches the plane. Only the XZ components carry `outward`.
    const toPlane = dot2(sub2(ap.a, P), ap.outward); // signed distance P→plane along outward
    const denom = facing;                            // sun·outward (XZ) > 0
    const s = toPlane / denom;
    if (s <= EPS) return 0; // plane is behind the ray origin

    // Hit point.
    const hx = P.x + s * sun.x;
    const hz = P.z + s * sun.z;
    const hy = pY + s * sun.y;

    // Horizontal position along the aperture segment.
    const along = (hx - ap.a.x) * ap.dir.x + (hz - ap.a.z) * ap.dir.z;
    if (along < -EPS || along > ap.len + EPS) return 0;

    // Vertical band (relative to the floor datum 0; pY already includes the
    // sample working-plane height).
    if (hy < ap.sillM - EPS || hy > ap.headM + EPS) return 0;

    // Self-shadow guard: the horizontal midpoint of P→hit must lie inside the
    // room polygon (a concave wall blocking the grazing path fails this). The
    // hit itself sits ON the façade, so we test the path midpoint.
    const mid: Pt2 = { x: (P.x + hx) / 2, z: (P.z + hz) / 2 };
    if (!pointInPolygon(mid, poly)) return 0;

    // Distance from the sample point to the aperture hit (3-D).
    const dx = hx - P.x, dz = hz - P.z, dy = hy - pY;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 < EPS) return 0;

    // Solid-angle proxy: apertureArea · cos(view) / (π · d²). We fold the view
    // foreshortening (the window seen obliquely subtends less) into `facing`
    // (how square-on the sun is to the façade) — a stable monotone proxy.
    const solidAngle = (ap.area * facing) / (Math.PI * dist2);

    // Floor flux: cosine of incidence on the HORIZONTAL working plane = sin(elev)
    // = sun.y (already the up-component of the unit sun vector). Below horizon
    // (sun.y ≤ 0) contributes nothing.
    const floorCos = sun.y;
    if (floorCos <= EPS) return 0;

    return solidAngle * floorCos;
}

/**
 * Isotropic sky-diffuse contribution from one aperture to one floor point,
 * INDEPENDENT of the sun's azimuth: a window admits ambient skylight from every
 * direction, so a non-sun-facing window still lights the room. Computed once per
 * (point × aperture). The skylight is "seen" through the aperture centre; we use
 * the same solid-angle proxy (area / π·d²) with a flat luminance, gated on the
 * aperture-centre being inside the room's outward half-space + the path staying
 * in the polygon (self-shadow). Returns 0 when the window can't see this point.
 */
function diffuseContribution(
    P: Pt2, ap: ApertureGeom, poly: ReadonlyArray<Pt2>,
): number {
    // Aperture centre (XZ, at mid-height — Y folds out of the horizontal proxy).
    const cx = ap.a.x + ap.dir.x * (ap.len / 2);
    const cz = ap.a.z + ap.dir.z * (ap.len / 2);
    // The point must be on the INTERIOR side of the façade (vector P→centre must
    // point outward, i.e. align with the outward normal).
    const toC: Pt2 = { x: cx - P.x, z: cz - P.z };
    if (dot2(toC, ap.outward) <= EPS) return 0;
    // Self-shadow: the path midpoint must lie inside the room polygon.
    const mid: Pt2 = { x: (P.x + cx) / 2, z: (P.z + cz) / 2 };
    if (!pointInPolygon(mid, poly)) return 0;
    const dx = cx - P.x, dz = cz - P.z, dy = ap.midH; // vertical rise to mid-head
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 < EPS) return 0;
    return (ap.area) / (Math.PI * dist2);
}

/**
 * Compute the per-room daylight metric. Pure + deterministic.
 *
 * @param input       room polygon + window apertures (world-metres XZ).
 * @param sunSamples  sun positions to integrate over (caller-supplied, e.g.
 *                    `defaultSunSamples(lat)`). Below-horizon samples are skipped.
 * @param opts        grid / normalisation tuning (all defaulted).
 */
export function computeRoomDaylight(
    input: RoomDaylightInput,
    sunSamples: ReadonlyArray<SunSample>,
    opts: DaylightOptions = {},
): RoomDaylightResult {
    const spacing = opts.gridSpacingM ?? DEFAULT_GRID_SPACING_M;
    const sampleH = opts.sampleHeightM ?? DEFAULT_SAMPLE_HEIGHT_M;
    const fullRaw = opts.fullDaylightRawPerSample ?? DEFAULT_FULL_DAYLIGHT_RAW_PER_SAMPLE;
    const maxPts = opts.maxSamplePoints ?? DEFAULT_MAX_SAMPLE_POINTS;
    const diffuseW = opts.diffuseSkyWeight ?? DEFAULT_DIFFUSE_SKY_WEIGHT;
    // The aperture sill/head are RELATIVE to the room floor datum (0), so the
    // sample working-plane Y used in the band test is simply `sampleHeightM`
    // (the height above the floor at which we measure). `input.floorY` is the
    // room's world-Y placement but the aperture band is floor-relative, so the
    // analytic test stays in the floor frame and floorY drops out.
    const pYrel = sampleH;

    const poly = input.polygon;
    const apertures = input.windows.map(prepAperture).filter((g): g is ApertureGeom => g !== null);

    // Degenerate room → 0.
    if (poly.length < 3) {
        return emptyResult(input, 0);
    }

    // ── deterministic floor sample grid (point-in-polygon) ──────────────────
    const { minX, maxX, minZ, maxZ } = bbox(poly);
    const spanX = Math.max(0, maxX - minX);
    const spanZ = Math.max(0, maxZ - minZ);
    let step = spacing > EPS ? spacing : DEFAULT_GRID_SPACING_M;
    // Cap the grid count: enlarge `step` until nx·nz ≤ maxPts.
    let nx = Math.floor(spanX / step) + 1;
    let nz = Math.floor(spanZ / step) + 1;
    while (nx * nz > maxPts && step < 100) {
        step *= 1.5;
        nx = Math.floor(spanX / step) + 1;
        nz = Math.floor(spanZ / step) + 1;
    }
    // Centre the grid in the bbox so the sampling is stable + symmetric.
    const startX = minX + (spanX - step * (nx - 1)) / 2;
    const startZ = minZ + (spanZ - step * (nz - 1)) / 2;

    const points: Pt2[] = [];
    for (let iz = 0; iz < nz; iz++) {
        const z = startZ + iz * step;
        for (let ix = 0; ix < nx; ix++) {
            const x = startX + ix * step;
            const p: Pt2 = { x, z };
            if (pointInPolygon(p, poly)) points.push(p);
        }
    }
    // A small / awkward polygon may straddle every grid cell boundary → use the
    // centroid as a single fallback sample so a real room is never scored 0 for
    // want of a grid hit.
    if (points.length === 0) {
        points.push(centroidOf(poly));
    }

    // The diffuse term is added once per (point × aperture). To keep it on the
    // SAME integration scale as the direct beam (which sums over every above-
    // horizon sun sample), scale it by the total above-horizon sample weight so
    // both terms grow with the same sun-path resolution. Computed once.
    let aboveHorizonWeight = 0;
    for (const s of sunSamples) {
        if ((s.elevationDeg ?? 0) > 0) aboveHorizonWeight += Math.max(0, s.weight ?? 1);
    }

    // ── integrate over points × sun samples (direct) + per-point diffuse ─────
    const perWindowRaw = new Array<number>(apertures.length).fill(0);
    let raw = 0;
    let litTests = 0;
    let totalTests = 0;

    for (const P of points) {
        // Direct beam: cast each above-horizon sun sample at each aperture.
        for (const s of sunSamples) {
            if ((s.elevationDeg ?? 0) <= 0) continue; // below horizon
            const w = s.weight ?? 1;
            if (w <= 0) continue;
            const dir = sunDirection(s.azimuthDeg, s.elevationDeg);
            totalTests++;
            let litThisTest = false;
            for (let wi = 0; wi < apertures.length; wi++) {
                const c = apertureContribution(P, pYrel, dir, apertures[wi]!, poly);
                if (c > 0) {
                    const weighted = c * w;
                    raw += weighted;
                    perWindowRaw[wi]! += weighted;
                    litThisTest = true;
                }
            }
            if (litThisTest) litTests++;
        }
        // Isotropic sky-diffuse: ambient skylight through each visible aperture,
        // independent of the sun azimuth (so a north window beats windowless).
        if (diffuseW > 0 && aboveHorizonWeight > 0) {
            for (let wi = 0; wi < apertures.length; wi++) {
                const d = diffuseContribution(P, apertures[wi]!, poly);
                if (d > 0) {
                    const weighted = d * diffuseW * aboveHorizonWeight;
                    raw += weighted;
                    perWindowRaw[wi]! += weighted;
                }
            }
        }
    }

    const sampleCount = points.length;
    const rawPerSample = sampleCount > 0 ? raw / sampleCount : 0;
    const score = clamp01(rawPerSample / (fullRaw > EPS ? fullRaw : DEFAULT_FULL_DAYLIGHT_RAW_PER_SAMPLE));
    const sunlitFraction = totalTests > 0 ? litTests / totalTests : 0;

    const windows: WindowContribution[] = apertures.map((_, wi) => ({
        windowIndex: wi,
        label: input.windows[wi]?.label,
        raw: perWindowRaw[wi]!,
        fraction: raw > EPS ? perWindowRaw[wi]! / raw : 0,
    })).sort((p, q) => q.raw - p.raw);

    return {
        roomId: input.roomId,
        name: input.name,
        roomType: input.roomType,
        score,
        raw,
        sampleCount,
        sunlitFraction,
        windows,
    };
}

/** Score every room + return a summary sorted brightest-first. Pure. */
export function computeBuildingDaylight(
    rooms: ReadonlyArray<RoomDaylightInput>,
    sunSamples: ReadonlyArray<SunSample>,
    opts: DaylightOptions = {},
): BuildingDaylightResult {
    const results = rooms.map(r => computeRoomDaylight(r, sunSamples, opts));
    const sorted = results.slice().sort((a, b) => b.score - a.score);
    const meanScore = sorted.length > 0
        ? sorted.reduce((acc, r) => acc + r.score, 0) / sorted.length
        : 0;
    return {
        rooms: sorted,
        meanScore,
        brightestRoomId: sorted.length > 0 ? sorted[0]!.roomId : undefined,
        darkestRoomId: sorted.length > 0 ? sorted[sorted.length - 1]!.roomId : undefined,
    };
}

// ── helpers ─────────────────────────────────────────────────────────────────
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function centroidOf(poly: ReadonlyArray<Pt2>): Pt2 {
    let cx = 0, cz = 0, A = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        const cr = p.x * q.z - q.x * p.z;
        A += cr; cx += (p.x + q.x) * cr; cz += (p.z + q.z) * cr;
    }
    A *= 0.5;
    if (Math.abs(A) < EPS) {
        // Degenerate — fall back to the vertex mean.
        let sx = 0, sz = 0;
        for (const p of poly) { sx += p.x; sz += p.z; }
        return { x: sx / poly.length, z: sz / poly.length };
    }
    return { x: cx / (6 * A), z: cz / (6 * A) };
}

function emptyResult(input: RoomDaylightInput, score: number): RoomDaylightResult {
    return {
        roomId: input.roomId, name: input.name, roomType: input.roomType,
        score, raw: 0, sampleCount: 0, sunlitFraction: 0, windows: [],
    };
}
