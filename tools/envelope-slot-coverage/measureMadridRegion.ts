#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-SLOT-COVERAGE — THE COMUNIDAD DE MADRID (REGION) ARM. Two goals, one artefact.
//
//   npx tsx tools/envelope-slot-coverage/measureMadridRegion.ts
//   npx tsx tools/envelope-slot-coverage/measureMadridRegion.ts --n 40 --seed 20260802 --skip-a
//
// ⚠ THE CAPITAL (INE 28079) IS NOT MEASURED HERE AND MUST NEVER BE FOLDED IN. It is a separate
// registration (`esMadridNZ1.ts` / `esMadridPgoum97.ts`, publisher `sigma.madrid.es`). This arm
// measures the 178 OTHER municipalities' surface — `esMadridSpacm.ts` + `esMadridSpacmAdapter.ts`
// over `sitcm:VPLA_V_ORDENANZA` on `idem.comunidad.madrid` — on two proving municipalities.
//
// GOAL A — FEASIBILITY EVIDENCE FOR A POLYGON `contains` ROUTING PREDICATE.
//   `esMadridSpacm.ts` §CM-REGISTRATION-BLOCKED records that the Madrid-capital and Boadilla bboxes
//   interleave by 4.35 km so NO RECTANGLE can route between them, and names the competent
//   authority's own municipal boundary layer `Callejero:SIGI_V_MUNICIPIOS` (179 polygons, keyless,
//   same endpoint as the ordinance corpus) as the unblocker. This arm FETCHES it with the exact
//   request shape `tools/madrid-spacm-probe/02-paging-and-domains.mjs` §(b) already used, SAVES it,
//   and MEASURES: bytes · vertices · the CRS it arrives in · the INE-key property · whether 079 and
//   022 are geometrically disjoint · 20 known points through the SHIPPED even-odd PIP
//   (`geometry/pointInRingsEvenOdd.ts`) · Douglas-Peucker at 20 m / 50 m with the same 20 points
//   plus a seeded 3,000-point control re-classified. ⛔ NOTHING IS WIRED INTO `registry.ts`.
//
// GOAL B — REAL PARCELS THROUGH THE SHIPPED ADAPTER.
//   ~40 REAL Catastro parcels per municipality, drawn UNIFORMLY over the municipality's FULL INSPIRE
//   CP population exactly as `tools/cold-start-probe/catastroParcelFrame.mjs` does (ATOM → per-
//   municipality ZIP → GML; the request construction, PK-magic assertion and publisher-gap collapse
//   are copied from that file, its parser/sampler are IMPORTED). For each centroid, ONE
//   `INTERSECTS(GEOMETRY1, POINT(x y))` in EPSG:25830 against `sitcm:VPLA_V_ORDENANZA` — the shape
//   `tools/madrid-envelope-engine/probe/05-prove-one-parcel.mjs` proved (an EPSG:4326 filter answers
//   HTTP 200 + `features: []`, indistinguishable from "no polygon here"). ⚠ WITHOUT the probe's
//   `CD_MUNICIPIO='0XX'` pre-filter, deliberately: a row from a neighbouring municipality at the
//   centroid is a real ambiguity the product would meet, and pre-filtering would hide it.
//   Then the SHIPPED `adaptSpacmRow`, with the ámbito register for the municipality fetched live
//   (the `04-capture-ambitos.mjs` shape) and joined through the SHIPPED `buildAmbitoIndex` /
//   `resolveAmbito` — the same `AdapterContext` `proveParcel.ts` builds.
//
// ⚠ TWO FRAMES PER MUNICIPALITY, NEVER BLENDED:
//   • AS SHIPPED — `CM_SPACM_REGISTRATION_BLOCKED` is true and `CM_SPACM_ENVELOPE_VERIFIED` is
//     false. Nothing routes to this adapter by click, and every record it would produce carries
//     `verification-gate-closed`. ⇒ 0 numbers reach a user. The ordinance answer is used here as
//     a WITNESS only (the same rule `measureEs.ts` applies to the Catastro `nonBuildable` witness):
//     a legally-grounded refusal (public system / non-urban soil / ámbito delegation) is a fact
//     about the LAND that makes the envelope question moot, so it is F2 regardless of whether
//     PRYZM shows the card — which as shipped it does not.
//   • IF SIGNED — the same records with `verificationGateOpen: true`. A DEMONSTRATION of what a
//     founder signature (L-449) would open; not an authorisation, and stated as neither.
//
// ⚠ >1 ORDINANCE ROW AT A CENTROID IS AMBIGUOUS AND IS REFUSED, NEVER PICKED — even when the rows
//   are byte-identical. A selector returning two rows has not selected (the routing guard's own
//   rule, applied one layer down).
//
// ⚠ A SERVICE FAILURE IS NEVER A ZERO. HTTP ≠ 200, an OWS ExceptionReport, a non-JSON body and a
//   timeout are all `service-failure`, excluded from every denominator and counted. Catastro's own
//   failure modes (HTTP 200 + text/html "not found" page, non-ZIP enclosure) are asserted on the
//   bytes, as the frame builder does.
//
// LAYERING — a measurement tool, not a layered package; its functions take no OTel span (same
// posture as every other file in this directory).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
    adaptSpacmRow,
    type AdapterContext,
    type SpacmOrdenanzaRow,
} from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAdapter.js';
import {
    buildAmbitoIndex,
    resolveAmbito,
    type AmbitoRow,
} from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAmbitoJoin.js';
import {
    isDrawable,
    isKnown,
    type CommonEnvelopeRecord,
    type EnvelopeRules,
} from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';
import {
    CM_SPACM_ENVELOPE_VERIFIED,
    CM_SPACM_JURISDICTION_ID,
    CM_SPACM_REGISTRATION_BLOCKED,
} from '../../packages/site-parcel-data/src/rulepacks/esMadridSpacm.js';
import { pointInRingsEvenOdd } from '../../packages/site-parcel-data/src/geometry/pointInRingsEvenOdd.js';
import { resolveRegisteredJurisdictionAt } from '../../packages/site-parcel-data/src/rulepacks/registry.js';
import {
    ENVELOPE_SLOTS,
    renderMarkdown,
    report,
    type EnvelopeSlot,
    type PointResult,
} from './slots.js';
import { writeArtefact } from './shared.js';
// The PROVEN request/transport discipline of the regional WFS probe — imported, never re-derived.
import { get, getJson, hits, q, WFS } from '../madrid-spacm-probe/lib.mjs';
// The PROVEN Catastro frame builder's parser, sampler, enclosure matcher and inverse projection.
import {
    drawUniform,
    findEnclosure,
    mulberry32,
    parseParcels,
    USER_AGENT,
    utmToWgs84,
} from '../cold-start-probe/catastroParcelFrame.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const CACHE = path.join(OUT, '.cache');
fs.mkdirSync(CACHE, { recursive: true });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ARGS
// ═════════════════════════════════════════════════════════════════════════════════════════════

interface Args {
    readonly n: number;
    readonly seed: number;
    readonly gapMs: number;
    readonly skipA: boolean;
    readonly skipB: boolean;
    readonly controlPoints: number;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const getArg = (k: string, d: string): string => {
        const i = argv.indexOf(k);
        return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
    };
    return {
        n: Number(getArg('--n', '40')),
        seed: Number(getArg('--seed', '20260802')),
        gapMs: Number(getArg('--gap', '300')),
        skipA: argv.includes('--skip-a'),
        skipB: argv.includes('--skip-b'),
        controlPoints: Number(getArg('--control', '3000')),
    };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const say = (s: string): void => { process.stderr.write(`${s}\n`); };

// ═════════════════════════════════════════════════════════════════════════════════════════════
// PROJECTION — WGS84 → ETRS89 / UTM 30N (EPSG:25830), forward, GRS80.
//
// COPIED VERBATIM from `tools/madrid-envelope-engine/probe/05-prove-one-parcel.mjs`
// (`wgs84ToUtm30n`), which is not exported from that file. The inverse (`utmToWgs84`) is IMPORTED
// from the Catastro frame builder. ETRS89 and WGS84 differ by < 1 m in Iberia.
// ═════════════════════════════════════════════════════════════════════════════════════════════

function wgs84ToUtm30n(lon: number, lat: number): { x: number; y: number } {
    const a = 6378137.0;
    const f = 1 / 298.257222101;
    const k0 = 0.9996;
    const lon0 = ((30 - 1) * 6 - 180 + 3) * Math.PI / 180;
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const phi = lat * Math.PI / 180;
    const lam = lon * Math.PI / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const T = Math.tan(phi) ** 2;
    const C = ep2 * Math.cos(phi) ** 2;
    const A = (lam - lon0) * Math.cos(phi);
    const M = a * (
        (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
        - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
        + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
        - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi)
    );
    const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6
        + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    const y = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
        + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
    return { x, y };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// GOAL A — the boundary layer
// ═════════════════════════════════════════════════════════════════════════════════════════════

type Pt = readonly [number, number];
type Ring = readonly Pt[];

interface Muni {
    readonly code: string;       // CDMUNICIPIO, 3-digit
    readonly name: string;       // DSMUNICIPIO
    readonly geomType: string;
    readonly rings: Ring[];      // every ring of every polygon part, in the ARRIVAL frame
    readonly vertexCount: number;
    readonly bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

interface TestPoint {
    readonly label: string;
    readonly lat: number;
    readonly lon: number;
    /** The 3-digit code the author EXPECTS, or null where the author holds no confident prior. */
    readonly expect: string | null;
    readonly band: boolean;
}

/**
 * 20 known points. The ASSERTION is "exactly one municipality contains each point"; `expect` is
 * the author's prior, printed so a disagreement is visible — the polygon is the competent
 * authority's and wins. `band` marks points inside the 4.35 km interleave
 * (lon ∈ [-3.888963, -3.837814], the intersection of the two bboxes quoted in `esMadridSpacm.ts`).
 */
const TEST_POINTS: readonly TestPoint[] = [
    { label: 'Puerta del Sol (Madrid capital)', lat: 40.41694, lon: -3.70347, expect: '079', band: false },
    { label: 'Boadilla del Monte — Plaza de la Cruz (town centre)', lat: 40.40560, lon: -3.87760, expect: '022', band: true },
    { label: 'Colmenar Viejo — Plaza del Pueblo', lat: 40.65880, lon: -3.76580, expect: '045', band: false },
    { label: 'Moralzarzal — Plaza de la Constitución', lat: 40.67590, lon: -3.97020, expect: '090', band: false },
    { label: 'Alcalá de Henares — Plaza de Cervantes', lat: 40.48200, lon: -3.36430, expect: '005', band: false },
    { label: 'Getafe — Plaza de la Constitución', lat: 40.30570, lon: -3.73280, expect: '065', band: false },
    { label: 'Casa de Campo — lake', lat: 40.41930, lon: -3.74410, expect: '079', band: false },
    { label: 'Casa de Campo — west edge', lat: 40.42500, lon: -3.77800, expect: '079', band: false },
    { label: 'El Pardo — village', lat: 40.51650, lon: -3.77470, expect: '079', band: false },
    { label: 'Monte de El Pardo — western sector (band)', lat: 40.53000, lon: -3.86000, expect: null, band: true },
    { label: 'Monte de El Pardo — north-west (band)', lat: 40.56000, lon: -3.85000, expect: null, band: true },
    { label: 'Boadilla — Ciudad Financiera (east edge, band)', lat: 40.43700, lon: -3.85500, expect: '022', band: true },
    { label: 'Boadilla — Las Lomas (band; 05-prove candidate)', lat: 40.42000, lon: -3.86000, expect: '022', band: true },
    { label: 'Boadilla — Olivar de Mirabal (band; 05-prove candidate)', lat: 40.40320, lon: -3.87120, expect: '022', band: true },
    { label: 'Boadilla — proven parcel 4228504VK2742N (committed capture)', lat: 40.40119316, lon: -3.89331002, expect: '022', band: false },
    { label: 'Boadilla east edge / Pozuelo frontier (band)', lat: 40.40000, lon: -3.84500, expect: null, band: true },
    { label: 'Pozuelo — Ciudad de la Imagen (just east of the band)', lat: 40.39300, lon: -3.83300, expect: null, band: false },
    { label: 'Majadahonda — centre (band longitude, north of Boadilla)', lat: 40.47300, lon: -3.87200, expect: '080', band: true },
    { label: 'Ventorro del Cano — Boadilla/Alcorcón/Madrid corner (band)', lat: 40.36500, lon: -3.84000, expect: null, band: true },
    { label: 'Cuatro Vientos aerodrome (Madrid capital)', lat: 40.37070, lon: -3.78500, expect: '079', band: false },
];

function ringsOf(geometry: { type: string; coordinates: unknown }): Ring[] {
    if (geometry.type === 'Polygon') return geometry.coordinates as Ring[];
    if (geometry.type === 'MultiPolygon') return (geometry.coordinates as Ring[][]).flat();
    return [];
}

function bboxOfRings(rings: readonly Ring[]): Muni['bbox'] {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const r of rings) for (const [x, y] of r) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}

/** Which municipalities contain the point (bbox prefilter, then the SHIPPED even-odd PIP). */
function containing(munis: readonly Muni[], x: number, y: number): Muni[] {
    const out: Muni[] = [];
    for (const m of munis) {
        const b = m.bbox;
        if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
        if (pointInRingsEvenOdd({ x, y }, m.rings)) out.push(m);
    }
    return out;
}

// ── Douglas-Peucker, iterative, on a closed ring (first == last kept as anchors). ─────────────
function perpDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(ring: Ring, tol: number): Ring {
    const n = ring.length;
    if (n < 5) return ring;
    const keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    // A closed ring's two anchors coincide, so the first split must be forced at the farthest
    // vertex from the anchor point — otherwise every vertex has distance-to-a-degenerate-segment
    // and the ring collapses to its anchor.
    let far = 1; let farD = -1;
    for (let i = 1; i < n - 1; i++) {
        const d = Math.hypot(ring[i]![0] - ring[0]![0], ring[i]![1] - ring[0]![1]);
        if (d > farD) { farD = d; far = i; }
    }
    keep[far] = 1;
    const stack: Array<[number, number]> = [[0, far], [far, n - 1]];
    while (stack.length > 0) {
        const [s, e] = stack.pop()!;
        if (e - s < 2) continue;
        let idx = -1; let maxD = tol;
        for (let i = s + 1; i < e; i++) {
            const d = perpDist(ring[i]!, ring[s]!, ring[e]!);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (idx >= 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]!);
    // A ring needs ≥ 4 coordinates (3 distinct + closure) to enclose anything.
    return out.length >= 4 ? out : ring;
}

function simplifyMunis(munis: readonly Muni[], tol: number): Muni[] {
    return munis.map((m) => {
        const rings = m.rings.map((r) => douglasPeucker(r, tol));
        return { ...m, rings, vertexCount: rings.reduce((a, r) => a + r.length, 0), bbox: bboxOfRings(rings) };
    });
}

// ── Disjointness of two polygons: vertex containment + proper segment crossings. ────────────
function orient(a: Pt, b: Pt, c: Pt): number {
    const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
}

/** Proper crossing: the segments cross at a single interior point of both. */
function properCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const o1 = orient(a, b, c); const o2 = orient(a, b, d);
    const o3 = orient(c, d, a); const o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
}

interface Seg { readonly a: Pt; readonly b: Pt; readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number }

function segments(rings: readonly Ring[], clip: Muni['bbox']): Seg[] {
    const out: Seg[] = [];
    for (const r of rings) {
        for (let i = 0; i + 1 < r.length; i++) {
            const a = r[i]!; const b = r[i + 1]!;
            const minX = Math.min(a[0], b[0]); const maxX = Math.max(a[0], b[0]);
            const minY = Math.min(a[1], b[1]); const maxY = Math.max(a[1], b[1]);
            if (maxX < clip.minX || minX > clip.maxX || maxY < clip.minY || minY > clip.maxY) continue;
            out.push({ a, b, minX, maxX, minY, maxY });
        }
    }
    return out;
}

interface DisjointVerdict {
    readonly bboxesOverlap: boolean;
    readonly verticesOfAInsideB: number;
    readonly verticesOfBInsideA: number;
    readonly properCrossings: number;
    readonly sharedVertices: number;
    readonly segmentPairsTested: number;
    readonly interiorsDisjoint: boolean;
}

function disjointness(A: Muni, B: Muni): DisjointVerdict {
    const ov = !(A.bbox.maxX < B.bbox.minX || A.bbox.minX > B.bbox.maxX
        || A.bbox.maxY < B.bbox.minY || A.bbox.minY > B.bbox.maxY);
    let aInB = 0; let bInA = 0;
    for (const r of A.rings) for (const [x, y] of r) if (pointInRingsEvenOdd({ x, y }, B.rings)) aInB++;
    for (const r of B.rings) for (const [x, y] of r) if (pointInRingsEvenOdd({ x, y }, A.rings)) bInA++;
    // Shared vertices (exact coordinate identity) — evidence of a shared border, not of overlap.
    const keyOf = (p: Pt): string => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const aKeys = new Set<string>();
    for (const r of A.rings) for (const p of r) aKeys.add(keyOf(p));
    let shared = 0;
    for (const r of B.rings) for (const p of r) if (aKeys.has(keyOf(p))) shared++;
    // Proper crossings, restricted to the bbox overlap region.
    const clip = {
        minX: Math.max(A.bbox.minX, B.bbox.minX), maxX: Math.min(A.bbox.maxX, B.bbox.maxX),
        minY: Math.max(A.bbox.minY, B.bbox.minY), maxY: Math.min(A.bbox.maxY, B.bbox.maxY),
    };
    let crossings = 0; let pairs = 0;
    if (ov) {
        const sa = segments(A.rings, clip); const sb = segments(B.rings, clip);
        for (const s of sa) for (const t of sb) {
            if (s.maxX < t.minX || s.minX > t.maxX || s.maxY < t.minY || s.minY > t.maxY) continue;
            pairs++;
            if (properCross(s.a, s.b, t.a, t.b)) crossings++;
        }
    }
    // ⚠ A vertex of A that lies exactly ON B's border can read "inside" under even-odd at the
    // sub-millimetre level; that is why the verdict also demands zero proper crossings, and why
    // the shared-vertex count is printed beside it rather than folded in.
    return {
        bboxesOverlap: ov, verticesOfAInsideB: aInB, verticesOfBInsideA: bInA,
        properCrossings: crossings, sharedVertices: shared, segmentPairsTested: pairs,
        interiorsDisjoint: crossings === 0 && (aInB === 0 || aInB === shared) && (bInA === 0 || bInA === shared),
    };
}

interface GoalA {
    readonly request: string;
    readonly http: { status: number; contentType: string; bytes: number; owsException: string | null; transportError: string | null };
    readonly savedTo: string | null;
    readonly featureCount: number | null;
    readonly crsDeclared: string | null;
    readonly crsInferred: 'projected-metres' | 'geographic-degrees' | null;
    readonly propertyKeys: string[];
    readonly ineKeyProperty: { name: string; format: string; distinct: number; allThreeDigit: boolean } | null;
    readonly geometryTypes: Record<string, number>;
    readonly totalVertices: number;
    readonly totalRings: number;
    readonly perMuni: Record<string, { name: string; vertices: number; rings: number; geomType: string; bboxWgs84: { minLon: number; maxLon: number; minLat: number; maxLat: number } }>;
    readonly quotedBboxes: Record<string, { lon: [number, number]; lat: [number, number] }>;
    readonly disjoint079v022: DisjointVerdict | null;
    readonly points: Array<{ label: string; lat: number; lon: number; band: boolean; expect: string | null; hits: string[]; hitNames: string[]; exactlyOne: boolean; expectAgrees: boolean | null; dp20: string[]; dp50: string[]; dp20Same: boolean; dp50Same: boolean }>;
    readonly pointsExactlyOne: number;
    readonly simplified: Record<string, { toleranceM: number; vertices: number; reductionPct: number; approxJsonBytes: number; vertices079: number; vertices022: number; testPointsIdentical: number; disjoint079v022: DisjointVerdict | null; control: { n: number; identical: number; differ: number; zeroHitsFull: number; zeroHitsSimplified: number; multiHitsFull: number; multiHitsSimplified: number } }>;
    readonly controlFull: { n: number; zeroHits: number; oneHit: number; multiHits: number } | null;
    readonly notes: string[];
}

async function goalA(args: Args): Promise<{ result: GoalA; munis: Muni[] | null; frame: 'projected-metres' | 'geographic-degrees' | null }> {
    const notes: string[] = [];
    // ⭐ THE EXACT REQUEST SHAPE of `02-paging-and-domains.mjs` §(b). No `srsName`: the CRS the
    // features ARRIVE in is one of the things being measured.
    const params = {
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: 'Callejero:SIGI_V_MUNICIPIOS', outputFormat: 'application/json', count: '1000',
    };
    const url = q(params);
    say(`[A] GET ${url}`);
    const r = await getJson(url, { timeoutMs: 600_000 });
    const http = { status: r.status, contentType: r.contentType, bytes: r.bytes, owsException: r.owsException, transportError: r.transportError };
    const empty: GoalA = {
        request: url, http, savedTo: null, featureCount: null, crsDeclared: null, crsInferred: null,
        propertyKeys: [], ineKeyProperty: null, geometryTypes: {}, totalVertices: 0, totalRings: 0, perMuni: {},
        quotedBboxes: {
            '079': { lon: [-3.888963, -3.518126], lat: [40.312065, 40.643280] },
            '022': { lon: [-3.952589, -3.837814], lat: [40.377684, 40.456197] },
        },
        disjoint079v022: null, points: [], pointsExactlyOne: 0, simplified: {}, controlFull: null, notes,
    };
    if (!r.ok || !r.json) {
        notes.push(`UPSTREAM REFUSED — HTTP ${r.status} · ${r.owsException ?? r.transportError ?? 'non-JSON body'}. Goal A stops here; a service failure is NEVER a zero.`);
        return { result: empty, munis: null, frame: null };
    }
    const savedTo = path.join(OUT, 'cm-sigi-municipios.geojson');
    fs.writeFileSync(savedTo, r.body, 'utf8'); // the exact bytes the server sent
    const fc = r.json as { type: string; features: Array<{ type: string; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }>; crs?: { type: string; properties: { name: string } }; numberMatched?: number; numberReturned?: number };
    const features = fc.features ?? [];
    say(`[A] ${features.length} features · ${r.bytes.toLocaleString()} bytes · crs ${fc.crs?.properties?.name ?? '(none declared)'}`);

    // CRS — declared, then inferred from magnitude (a declared CRS can lie; the magnitude cannot).
    const first = features.find((f) => f.geometry)?.geometry;
    const firstPt = first ? (ringsOf(first)[0]?.[0] ?? null) : null;
    const crsInferred = firstPt === null ? null : Math.abs(firstPt[0]) > 180 || Math.abs(firstPt[1]) > 90 ? 'projected-metres' : 'geographic-degrees';
    if (fc.numberMatched !== undefined && fc.numberMatched !== features.length) {
        notes.push(`numberMatched=${fc.numberMatched} but ${features.length} returned — a PARTIAL page, not the layer.`);
    }

    // Properties + the INE-key property.
    const keys = features.length ? Object.keys(features[0]!.properties) : [];
    const codeKey = keys.find((k) => /^CD_?MUNICIPIO$/i.test(k)) ?? null;
    let ineKeyProperty: GoalA['ineKeyProperty'] = null;
    if (codeKey) {
        const vals = features.map((f) => String(f.properties[codeKey] ?? ''));
        ineKeyProperty = {
            name: codeKey,
            format: vals.every((v) => /^\d{3}$/.test(v)) ? '3-digit zero-padded (INE-5 with the `28` province prefix stripped)' : `mixed: ${[...new Set(vals.map((v) => v.length))].join('/')} chars`,
            distinct: new Set(vals).size,
            allThreeDigit: vals.every((v) => /^\d{3}$/.test(v)),
        };
    } else {
        notes.push(`no CDMUNICIPIO-like property among ${keys.join(', ')}`);
    }

    const geometryTypes: Record<string, number> = {};
    const munis: Muni[] = [];
    for (const f of features) {
        const gt = f.geometry?.type ?? '(null geometry)';
        geometryTypes[gt] = (geometryTypes[gt] ?? 0) + 1;
        if (!f.geometry) continue;
        const rings = ringsOf(f.geometry);
        munis.push({
            code: codeKey ? String(f.properties[codeKey]) : '?',
            name: String(f.properties['DSMUNICIPIO'] ?? f.properties['DS_MUNICIPIO'] ?? ''),
            geomType: gt,
            rings,
            vertexCount: rings.reduce((a, rr) => a + rr.length, 0),
            bbox: bboxOfRings(rings),
        });
    }
    const totalVertices = munis.reduce((a, m) => a + m.vertexCount, 0);
    const totalRings = munis.reduce((a, m) => a + m.rings.length, 0);

    const toWgs = (x: number, y: number): { lat: number; lon: number } =>
        crsInferred === 'projected-metres' ? utmToWgs84(x, y, 30) : { lon: x, lat: y };
    const perMuni: GoalA['perMuni'] = {};
    for (const code of ['079', '022', '045', '090', '080']) {
        const m = munis.find((mm) => mm.code === code);
        if (!m) { notes.push(`municipality ${code} NOT in the layer`); continue; }
        const sw = toWgs(m.bbox.minX, m.bbox.minY); const ne = toWgs(m.bbox.maxX, m.bbox.maxY);
        perMuni[code] = {
            name: m.name, vertices: m.vertexCount, rings: m.rings.length, geomType: m.geomType,
            bboxWgs84: { minLon: +sw.lon.toFixed(6), maxLon: +ne.lon.toFixed(6), minLat: +sw.lat.toFixed(6), maxLat: +ne.lat.toFixed(6) },
        };
    }

    // Disjointness of 079 and 022, in the arrival frame (metres if projected).
    const m079 = munis.find((m) => m.code === '079'); const m022 = munis.find((m) => m.code === '022');
    const disjoint = m079 && m022 ? disjointness(m079, m022) : null;
    if (disjoint) say(`[A] 079 vs 022: bboxOverlap=${disjoint.bboxesOverlap} crossings=${disjoint.properCrossings} aInB=${disjoint.verticesOfAInsideB} bInA=${disjoint.verticesOfBInsideA} shared=${disjoint.sharedVertices} pairs=${disjoint.segmentPairsTested} ⇒ disjoint=${disjoint.interiorsDisjoint}`);

    // The 20 points — projected into the arrival frame, through the SHIPPED PIP.
    const toFrame = (lat: number, lon: number): { x: number; y: number } =>
        crsInferred === 'projected-metres' ? wgs84ToUtm30n(lon, lat) : { x: lon, y: lat };
    const dp20 = simplifyMunis(munis, crsInferred === 'projected-metres' ? 20 : 20 / 111_320);
    const dp50 = simplifyMunis(munis, crsInferred === 'projected-metres' ? 50 : 50 / 111_320);
    if (crsInferred !== 'projected-metres') notes.push('DP tolerances applied in DEGREES (÷111,320 m/°) because the features arrived geographic — longitude tolerance is therefore ~25 % looser than stated at 40° N.');
    const points: GoalA['points'] = [];
    for (const p of TEST_POINTS) {
        const { x, y } = toFrame(p.lat, p.lon);
        const hitsFull = containing(munis, x, y);
        const h20 = containing(dp20, x, y).map((m) => m.code).sort();
        const h50 = containing(dp50, x, y).map((m) => m.code).sort();
        const codes = hitsFull.map((m) => m.code).sort();
        points.push({
            label: p.label, lat: p.lat, lon: p.lon, band: p.band, expect: p.expect,
            hits: codes, hitNames: hitsFull.map((m) => m.name),
            exactlyOne: codes.length === 1,
            expectAgrees: p.expect === null ? null : codes.length === 1 && codes[0] === p.expect,
            dp20: h20, dp50: h50,
            dp20Same: JSON.stringify(h20) === JSON.stringify(codes),
            dp50Same: JSON.stringify(h50) === JSON.stringify(codes),
        });
    }
    const pointsExactlyOne = points.filter((p) => p.exactlyOne).length;

    // Seeded control over the layer's own bbox: does simplification create gaps/overlaps?
    const all = bboxOfRings(munis.flatMap((m) => m.rings));
    const rnd = mulberry32(args.seed);
    const ctrl: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < args.controlPoints; i++) {
        ctrl.push({ x: all.minX + rnd() * (all.maxX - all.minX), y: all.minY + rnd() * (all.maxY - all.minY) });
    }
    const fullHits = ctrl.map((c) => containing(munis, c.x, c.y).map((m) => m.code).sort().join('|'));
    const controlFull = {
        n: ctrl.length,
        zeroHits: fullHits.filter((h) => h === '').length,
        oneHit: fullHits.filter((h) => h !== '' && !h.includes('|')).length,
        multiHits: fullHits.filter((h) => h.includes('|')).length,
    };
    const simplified: GoalA['simplified'] = {};
    for (const [label, set, tol] of [['dp20', dp20, 20], ['dp50', dp50, 50]] as const) {
        const sHits = ctrl.map((c) => containing(set, c.x, c.y).map((m) => m.code).sort().join('|'));
        let identical = 0;
        for (let i = 0; i < ctrl.length; i++) if (sHits[i] === fullHits[i]) identical++;
        const s079 = set.find((m) => m.code === '079'); const s022 = set.find((m) => m.code === '022');
        const v = set.reduce((a, m) => a + m.vertexCount, 0);
        const approxJsonBytes = JSON.stringify(set.map((m) => ({ c: m.code, n: m.name, r: m.rings.map((rr) => rr.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)])) }))).length;
        simplified[label] = {
            toleranceM: tol, vertices: v, reductionPct: +((1 - v / totalVertices) * 100).toFixed(1), approxJsonBytes,
            vertices079: s079?.vertexCount ?? 0, vertices022: s022?.vertexCount ?? 0,
            testPointsIdentical: points.filter((p) => (label === 'dp20' ? p.dp20Same : p.dp50Same)).length,
            disjoint079v022: s079 && s022 ? disjointness(s079, s022) : null,
            control: {
                n: ctrl.length, identical, differ: ctrl.length - identical,
                zeroHitsFull: controlFull.zeroHits, zeroHitsSimplified: sHits.filter((h) => h === '').length,
                multiHitsFull: controlFull.multiHits, multiHitsSimplified: sHits.filter((h) => h.includes('|')).length,
            },
        };
    }

    return {
        result: {
            ...empty, savedTo, featureCount: features.length, crsDeclared: fc.crs?.properties?.name ?? null, crsInferred,
            propertyKeys: keys, ineKeyProperty, geometryTypes, totalVertices, totalRings, perMuni,
            disjoint079v022: disjoint, points, pointsExactlyOne, simplified, controlFull,
        },
        munis,
        frame: crsInferred,
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// GOAL B — real parcels through the shipped adapter
// ═════════════════════════════════════════════════════════════════════════════════════════════

interface City {
    readonly key: string;
    readonly ine: string;
    readonly cd: string;
    readonly name: string;
}

const CITIES: readonly City[] = [
    { key: 'boadilla-del-monte', ine: '28022', cd: '022', name: 'BOADILLA DEL MONTE' },
    { key: 'colmenar-viejo', ine: '28045', cd: '045', name: 'COLMENAR VIEJO' },
];

// ── Catastro INSPIRE CP — the request construction of `catastroParcelFrame.mjs`, cache relocated. ──
interface Fetched { outcome: 'ok' | 'http-error' | 'timeout' | 'network-error'; status: number | null; body?: Buffer | string; message?: string; contentType?: string }

let _lastReq = 0;
async function politeFetch(url: string, { timeoutMs = 600_000, binary = false } = {}): Promise<Fetched> {
    const gap = Date.now() - _lastReq;
    if (gap < 400) await sleep(400 - gap);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ac.signal, headers: { 'user-agent': USER_AGENT as string } });
        _lastReq = Date.now();
        if (!res.ok) return { outcome: 'http-error', status: res.status, message: `HTTP ${res.status}`, contentType: res.headers.get('content-type') ?? '' };
        const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
        return { outcome: 'ok', status: res.status, body, contentType: res.headers.get('content-type') ?? '' };
    } catch (e) {
        _lastReq = Date.now();
        return { outcome: ac.signal.aborted ? 'timeout' : 'network-error', status: null, message: e instanceof Error ? e.message : String(e) };
    } finally { clearTimeout(timer); }
}

interface FrameOutcome {
    ok: boolean;
    reason?: string;
    message?: string;
    atomUrl: string;
    enclosure?: { url: string; dgcCode: string; matchedBy: string; warning: string | null };
    gmlBytes?: number;
    parcelCount?: number;
    srs?: string | null;
    parcels?: Array<{ ref: string; areaM2: number | null; lat: number; lon: number; srs: string }>;
    attempts?: unknown[];
}

async function buildFrameHere(city: City): Promise<FrameOutcome> {
    const prov = city.ine.slice(0, 2);
    const atomUrl = `https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/${prov}/ES.SDGC.CP.atom_${prov}.xml`;
    const atomPath = path.join(CACHE, `atom_${prov}.xml`);
    let xml: string;
    if (fs.existsSync(atomPath)) {
        xml = fs.readFileSync(atomPath, 'utf8');
    } else {
        const r = await politeFetch(atomUrl);
        if (r.outcome !== 'ok') return { ok: false, reason: r.outcome, message: r.message, atomUrl };
        xml = r.body as string;
        fs.writeFileSync(atomPath, xml);
    }
    // ⚠ NAME is authoritative, the code a hint (the DGC/INE collision — see the frame builder).
    const hit = findEnclosure(xml, city.ine, city.name) as { url: string; code: string; matchedBy: string; warning?: string } | null;
    if (!hit) return { ok: false, reason: 'not-in-atom', message: `INE ${city.ine} (${city.name}) has no enclosure in province ${prov}'s ATOM`, atomUrl };
    const enclosure = { url: hit.url, dgcCode: hit.code, matchedBy: hit.matchedBy, warning: hit.warning ?? null };

    const gmlPath = path.join(CACHE, `CP_${city.ine}.gml`);
    if (!fs.existsSync(gmlPath) || fs.statSync(gmlPath).size === 0) {
        const zipPath = path.join(CACHE, `CP_${city.ine}.zip`);
        const attempts: unknown[] = [];
        if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0
            || fs.readFileSync(zipPath).subarray(0, 2).toString('latin1') !== 'PK') {
            let saved: Buffer | null = null;
            const variants = [hit.url];
            if (/\s{2,}/.test(hit.url)) variants.push(hit.url.replace(/\s{2,}/g, ' '));
            for (const v of variants) {
                const r = await politeFetch(v, { binary: true });
                if (r.outcome !== 'ok') { attempts.push({ url: v, outcome: r.outcome, message: r.message }); continue; }
                const buf = r.body as Buffer;
                const isZip = buf.subarray(0, 2).toString('latin1') === 'PK';
                attempts.push({ url: v, outcome: isZip ? 'zip' : 'not-a-zip', bytes: buf.length, contentType: r.contentType });
                if (isZip) { saved = buf; break; }
            }
            if (!saved) return { ok: false, reason: 'enclosure-not-a-zip', message: 'every candidate enclosure URL answered with something that is not a ZIP (HTTP 200 + text/html is Catastro\'s not-found page)', atomUrl, enclosure, attempts };
            fs.writeFileSync(zipPath, saved);
        }
        const xdir = path.join(CACHE, `x_${city.ine}`);
        try {
            execFileSync('powershell', ['-NoProfile', '-Command',
                `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${xdir}' -Force`], { stdio: 'pipe' });
        } catch (e) {
            return { ok: false, reason: 'unzip-failed', message: String((e as Error).message ?? e).slice(0, 300), atomUrl, enclosure };
        }
        const gml = fs.readdirSync(xdir).find((f) => f.toLowerCase().endsWith('.gml'));
        if (!gml) return { ok: false, reason: 'no-gml-in-zip', message: `archive for ${city.ine} holds no .gml`, atomUrl, enclosure };
        fs.renameSync(path.join(xdir, gml), gmlPath);
    }
    const parcels = parseParcels(gmlPath) as FrameOutcome['parcels'];
    return {
        ok: true, atomUrl, enclosure, gmlBytes: fs.statSync(gmlPath).size,
        parcelCount: parcels!.length, srs: parcels![0]?.srs ?? null, parcels,
    };
}

// ── The ordinance row at a point — the `05-prove-one-parcel.mjs` shape, through lib.mjs. ─────
const ORD_FIELDS = [
    'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'DS_NOM_AMB', 'DS_CLAS_SUE', 'DS_NOMB_ORD',
    'NM_ALTURA', 'NM_N_PLTA', 'NM_OCP_MX', 'NM_FDO_MX_ED',
    'NM_RTR_FRNT', 'NM_RTR_LATL', 'NM_RTR_POST', 'NM_C_ED_ORD', 'NM_C_ED_MAZ', 'NM_FRTE_MIN',
    'DS_LEY', 'DS_DOCU', 'DS_PLANEAM_GRAL', 'FC_BOCM',
];

interface WfsPointOutcome {
    ok: boolean;
    status: number;
    why: string | null;
    rows: SpacmOrdenanzaRow[];
    url: string;
}

async function ordinanceAt(lon: number, lat: number): Promise<WfsPointOutcome> {
    const { x, y } = wgs84ToUtm30n(lon, lat);
    const url = q({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'sitcm:VPLA_V_ORDENANZA',
        outputFormat: 'application/json', propertyName: ORD_FIELDS.join(','),
        CQL_FILTER: `INTERSECTS(GEOMETRY1, POINT(${x.toFixed(2)} ${y.toFixed(2)}))`,
        srsName: 'EPSG:25830', count: '20',
    });
    const r = await getJson(url, { timeoutMs: 120_000 });
    if (!r.ok || !r.json) return { ok: false, status: r.status, why: r.owsException ?? r.transportError ?? 'non-JSON body', rows: [], url };
    const feats = (r.json as { features?: Array<{ properties: SpacmOrdenanzaRow }> }).features;
    if (!Array.isArray(feats)) return { ok: false, status: r.status, why: 'no features[] in body', rows: [], url };
    return { ok: true, status: r.status, why: null, rows: feats.map((f) => f.properties), url };
}

// ── The ámbito register for one municipality — the `04-capture-ambitos.mjs` shape. ───────────
const AMB_FIELDS = [
    'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'DS_NOMB_AMB', 'DS_CLAS_SUE',
    'DS_FIG_DES', 'DS_SIST_ACT', 'DS_ORD_ASOC',
    'NM_C_ED', 'NM_S_MAX_ED', 'NM_S_TOT', 'DS_LEY', 'DS_DOCU', 'FC_AC', 'FC_BOCM',
];
const AMB_TYPES = ['sitcm:VPLA_V_AMBITO', 'sitcm:VPLA_V_AMBITO_MODIF'] as const;

interface RegisterLayer { name: string; numberMatched: number | null; rowsCaptured: number; complete: boolean; error: string | null; rows: AmbitoRow[] }

async function fetchRegister(cd: string): Promise<RegisterLayer[]> {
    const out: RegisterLayer[] = [];
    for (const typeName of AMB_TYPES) {
        const cql = `CD_MUNICIPIO='${cd}'`;
        const h = await hits(typeName, cql);
        const layer: RegisterLayer = { name: typeName.split(':')[1]!, numberMatched: h.count, rowsCaptured: 0, complete: false, error: null, rows: [] };
        if (h.count === null) {
            layer.error = `hits failed — ${h.diag.owsException ?? h.diag.transportError ?? `HTTP ${h.diag.status}`}`;
            out.push(layer); continue;
        }
        const seen = new Set<unknown>();
        for (let s = 0; s < h.count; s += 1000) {
            const r = await getJson(q({
                service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: typeName,
                outputFormat: 'application/json', count: '1000', startIndex: String(s),
                propertyName: AMB_FIELDS.join(','), sortBy: 'CDID', CQL_FILTER: cql,
            }), { timeoutMs: 300_000 });
            if (!r.ok || !r.json) { layer.error = `page ${s} failed — ${r.owsException ?? r.transportError ?? `HTTP ${r.status}`}`; break; }
            const feats = (r.json as { features: Array<{ properties: Record<string, unknown> }> }).features;
            if (feats.length === 0) break;
            for (const f of feats) {
                const p = f.properties;
                if (seen.has(p['CDID'])) continue;
                seen.add(p['CDID']);
                const row: Record<string, unknown> = {};
                for (const k of AMB_FIELDS) if (k in p) row[k] = p[k];
                layer.rows.push(row as AmbitoRow);
            }
        }
        layer.rowsCaptured = layer.rows.length;
        layer.complete = layer.error === null && layer.rows.length === h.count;
        out.push(layer);
    }
    return out;
}

// ── Slot mapping: the adapter's per-dimension `rules` → the eight shared slots. ─────────────
//
// ⚠ `computeBuildableEnvelope` is NOT run here. The adapter emits a `GeometricRule`, not a
// `ZoningRulePack`, and constructing a pack around it would be wiring the CM registration this
// arm is forbidden to wire. A slot is counted RESOLVED when the record is drawable (no refusal,
// envelope non-null, grammar known) AND the dimension is `isKnown` — `published-attribute` or
// `derived`, in band, non-zero. `permittedUse` is never resolved: the adapter does not read
// `DS_US_PRED`. `depth_m` (NM_FDO_MX_ED) has no slot in the shared eight and is reported beside.
const RULE_TO_SLOT: ReadonlyArray<readonly [keyof EnvelopeRules, EnvelopeSlot]> = [
    ['setbackFront_m', 'setback.front'],
    ['setbackSide_m', 'setback.side'],
    ['setbackRear_m', 'setback.rear'],
    ['height_m', 'maxHeight'],
    ['storeys', 'maxFloors'],
    ['plotRatioFAR', 'maxFAR'],
    ['occupationPct', 'maxCoverage'],
];

function slotsOf(rec: CommonEnvelopeRecord): EnvelopeSlot[] {
    if (!isDrawable(rec)) return [];
    const out: EnvelopeSlot[] = [];
    for (const [k, s] of RULE_TO_SLOT) if (isKnown(rec.rules[k])) out.push(s);
    return out;
}

interface ParcelRow {
    readonly ref: string;
    readonly areaM2: number | null;
    readonly lat: number;
    readonly lon: number;
    readonly sigiHits: string[] | null;
    readonly shippedClaim: string;
    readonly wfs: { ok: boolean; status: number; why: string | null; rowCount: number; cdids: unknown[]; cdMunicipios: string[]; ordinances: string[] };
    readonly register: { matches: number; figure: string | null } | null;
    readonly shipped: { refusals: string[]; drawable: boolean } | null;
    readonly signed: { refusals: string[]; legallyGroundedRefusals: string[]; drawable: boolean; grammar: string; envelopeKind: string | null; known: Record<string, boolean>; farSource: string | null; contradiction: boolean; soilClass: string | null; ambito: string | null } | null;
    readonly clsShipped: PointResult['cls'];
    readonly clsSigned: PointResult['cls'];
}

interface CityOutcome {
    readonly city: City;
    readonly frame: Omit<FrameOutcome, 'parcels'>;
    readonly register: Array<Omit<RegisterLayer, 'rows'>>;
    readonly drawn: number;
    readonly rows: ParcelRow[];
    readonly shipped: PointResult[];
    readonly signed: PointResult[];
    readonly census: Record<string, unknown>;
}

async function goalBCity(city: City, args: Args, munis: Muni[] | null, frameCrs: 'projected-metres' | 'geographic-degrees' | null): Promise<CityOutcome> {
    say(`[B] ${city.name} — building the Catastro frame`);
    const frame = await buildFrameHere(city);
    const { parcels, ...frameMeta } = frame;
    if (!frame.ok || !parcels) {
        say(`[B] ${city.name} — FRAME FAILED: ${frame.reason} ${frame.message ?? ''}`);
        return { city, frame: frameMeta, register: [], drawn: 0, rows: [], shipped: [], signed: [], census: { frameFailure: frame.reason } };
    }
    say(`[B] ${city.name} — ${frame.parcelCount!.toLocaleString()} parcels (${(frame.gmlBytes! / 1e6).toFixed(1)} MB GML, srs ${frame.srs}) — drawing ${args.n} (seed ${args.seed})`);
    const drawn = drawUniform(parcels, args.n, args.seed) as NonNullable<FrameOutcome['parcels']>;

    say(`[B] ${city.name} — fetching the ámbito register for CD_MUNICIPIO='${city.cd}'`);
    const register = await fetchRegister(city.cd);
    for (const l of register) say(`[B]   ${l.name.padEnd(20)} matched ${l.numberMatched ?? 'NULL'} captured ${l.rowsCaptured} complete=${l.complete}${l.error ? ` ERROR ${l.error}` : ''}`);
    const usableLayers = register.filter((l) => l.error === null);
    const index = buildAmbitoIndex(usableLayers.map((l) => ({ name: l.name, rows: l.rows })));
    const registerUsable = usableLayers.length === register.length;

    const rows: ParcelRow[] = [];
    const shipped: PointResult[] = [];
    const signed: PointResult[] = [];
    let i = 0;
    for (const p of drawn) {
        i++;
        await sleep(args.gapMs);
        const wfs = await ordinanceAt(p.lon, p.lat);
        let sigiHits: string[] | null = null;
        if (munis) {
            const fp = frameCrs === 'projected-metres' ? wgs84ToUtm30n(p.lon, p.lat) : { x: p.lon, y: p.lat };
            sigiHits = containing(munis, fp.x, fp.y).map((m) => m.code);
        }
        const claim = resolveRegisteredJurisdictionAt(p.lat, p.lon);
        const shippedClaim = claim.kind === 'resolved' ? `resolved→${claim.jurisdiction.jurisdictionId}` : claim.kind;
        const base = { lat: p.lat, lon: p.lon, slots: [] as EnvelopeSlot[] };
        const cdMunicipios = wfs.rows.map((r) => String(r.CD_MUNICIPIO ?? ''));
        const ordinances = [...new Set(wfs.rows.map((r) => String(r.DS_NOMB_ORD ?? '(null)')))];
        const wfsMeta = { ok: wfs.ok, status: wfs.status, why: wfs.why, rowCount: wfs.rows.length, cdids: wfs.rows.map((r) => r.CDID), cdMunicipios, ordinances };

        let regRes: ParcelRow['register'] = null;
        let shippedRec: ParcelRow['shipped'] = null;
        let signedRec: ParcelRow['signed'] = null;
        let clsShipped: PointResult['cls'];
        let clsSigned: PointResult['cls'];
        let zoneLabel: string | null = null;
        let whyShipped: string;
        let whySigned: string;
        let slotsSigned: EnvelopeSlot[] = [];

        if (!wfs.ok) {
            clsShipped = clsSigned = 'service-failure';
            whyShipped = whySigned = `VPLA_V_ORDENANZA INTERSECTS query failed — HTTP ${wfs.status} · ${wfs.why}`;
        } else if (wfs.rows.length === 0) {
            clsShipped = clsSigned = 'no-plan-served';
            whyShipped = whySigned = 'VPLA_V_ORDENANZA serves NO polygon at this parcel centroid (HTTP 200, features: [] in EPSG:25830)';
        } else if (wfs.rows.length > 1) {
            zoneLabel = ordinances.join(' | ');
            clsShipped = clsSigned = 'f1-gap';
            whyShipped = whySigned = `AMBIGUOUS — ${wfs.rows.length} ordinance polygons intersect the centroid (CDID ${wfsMeta.cdids.join(', ')} · CD_MUNICIPIO ${[...new Set(cdMunicipios)].join('/')} · «${zoneLabel}»). Refused, never picked.`;
        } else {
            const row = wfs.rows[0]!;
            zoneLabel = String(row.DS_NOMB_ORD ?? '(null)');
            const cd3 = String(row.CD_MUNICIPIO ?? '');
            const ambName = row.DS_NOM_AMB == null ? null : String(row.DS_NOM_AMB);
            // ⚠ The register is the municipality's OWN; a row from a neighbouring municipality is
            // joined against ITS register only if we hold it — we hold only this city's.
            const res = registerUsable && cd3 === city.cd
                ? resolveAmbito(index, cd3, ambName)
                : { matches: 0, figure: null };
            regRes = { matches: res.matches, figure: res.figure };
            const ctx: AdapterContext = {
                parcel: { id: p.ref, cadastralRef: p.ref, area_m2: p.areaM2 },
                instrumentKeyMatches: res.matches,
                instrumentFigure: res.figure,
                ambitoResolvesInRegister: res.matches > 0,
            };
            const recShipped = adaptSpacmRow(row, ctx);
            const recSigned = adaptSpacmRow(row, { ...ctx, verificationGateOpen: true });
            shippedRec = { refusals: recShipped.refusals.map((r) => r.reason), drawable: isDrawable(recShipped) };
            const known: Record<string, boolean> = {};
            for (const k of Object.keys(recSigned.rules) as Array<keyof EnvelopeRules>) known[k] = isKnown(recSigned.rules[k]);
            signedRec = {
                refusals: recSigned.refusals.map((r) => r.reason),
                legallyGroundedRefusals: recSigned.refusals.filter((r) => r.legallyGrounded).map((r) => r.reason),
                drawable: isDrawable(recSigned), grammar: recSigned.grammar,
                envelopeKind: recSigned.envelope?.kind ?? null, known,
                farSource: recSigned.rules.plotRatioFAR.sourceField,
                contradiction: recSigned.contradictions.length > 0,
                soilClass: recSigned.zoningCode.soilClass, ambito: ambName,
            };
            // ── IF SIGNED ──
            if (signedRec.drawable) {
                clsSigned = 'resolved';
                slotsSigned = slotsOf(recSigned);
                whySigned = `grammar ${recSigned.grammar} · envelope kind ${recSigned.envelope?.kind} · register matches ${res.matches}`;
            } else if (signedRec.legallyGroundedRefusals.length > 0) {
                clsSigned = 'f2-correct-null';
                whySigned = `${signedRec.legallyGroundedRefusals.join('+')}: ${recSigned.refusals.find((r) => r.legallyGrounded)!.headline.slice(0, 160)}`;
            } else {
                clsSigned = 'f1-gap';
                whySigned = `${signedRec.refusals.join('+')}: ${recSigned.refusals[0]?.headline.slice(0, 160) ?? '(no refusal, no envelope)'}`;
            }
            // ── AS SHIPPED — witness rule (see header). ──
            if (signedRec.legallyGroundedRefusals.length > 0) {
                clsShipped = 'f2-correct-null';
                whyShipped = `[ordinance witness] ${signedRec.legallyGroundedRefusals.join('+')} — the land itself grants no private envelope; as shipped no card from this adapter reaches the user either (registration blocked; shipped registry says ${shippedClaim})`;
            } else {
                clsShipped = 'f1-gap';
                whyShipped = `as shipped: ${shippedRec.refusals.join('+')} — CM_SPACM_REGISTRATION_BLOCKED=${CM_SPACM_REGISTRATION_BLOCKED}, CM_SPACM_ENVELOPE_VERIFIED=${CM_SPACM_ENVELOPE_VERIFIED}; shipped registry says ${shippedClaim}; 0 numbers reach a user`;
            }
        }

        rows.push({ ref: p.ref, areaM2: p.areaM2, lat: p.lat, lon: p.lon, sigiHits, shippedClaim, wfs: wfsMeta, register: regRes, shipped: shippedRec, signed: signedRec, clsShipped, clsSigned });
        shipped.push({ ...base, cls: clsShipped, zoneLabel, area: `${CM_SPACM_JURISDICTION_ID}/${city.cd}`, slots: [], why: whyShipped });
        signed.push({ ...base, cls: clsSigned, zoneLabel, area: `${CM_SPACM_JURISDICTION_ID}/${city.cd}`, slots: slotsSigned, why: whySigned });
        say(`[B] ${city.cd} ${String(i).padStart(2)}/${drawn.length} ${p.ref} rows=${wfs.ok ? wfs.rows.length : 'ERR'} ${zoneLabel ?? ''} → signed:${clsSigned}${slotsSigned.length ? ` [${slotsSigned.join(',')}]` : ''} shipped:${clsShipped} sigi=${sigiHits?.join('|') ?? '—'} claim=${shippedClaim}`);
    }

    // ── Census over the single-row parcels ──
    const single = rows.filter((r) => r.signed !== null);
    const count = (pred: (r: ParcelRow) => boolean): number => single.filter(pred).length;
    const tally = (xs: (string | null)[]): Record<string, number> => {
        const m: Record<string, number> = {};
        for (const x of xs) m[x ?? '(null)'] = (m[x ?? '(null)'] ?? 0) + 1;
        return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
    };
    const census = {
        parcelsDrawn: drawn.length,
        wfsFailures: rows.filter((r) => !r.wfs.ok).length,
        zeroRows: rows.filter((r) => r.wfs.ok && r.wfs.rowCount === 0).length,
        oneRow: single.length,
        multiRows: rows.filter((r) => r.wfs.ok && r.wfs.rowCount > 1).length,
        multiRowDetail: rows.filter((r) => r.wfs.ok && r.wfs.rowCount > 1).map((r) => ({ ref: r.ref, n: r.wfs.rowCount, cdids: r.wfs.cdids, cdMunicipios: r.wfs.cdMunicipios, ordinances: r.wfs.ordinances })),
        rowsFromOtherMunicipality: rows.filter((r) => r.wfs.ok && r.wfs.cdMunicipios.some((c) => c !== city.cd)).length,
        sigiCentroidInExpected: munis ? rows.filter((r) => r.sigiHits && r.sigiHits.length === 1 && r.sigiHits[0] === city.cd).length : null,
        sigiCentroidElsewhere: munis ? rows.filter((r) => r.sigiHits && !(r.sigiHits.length === 1 && r.sigiHits[0] === city.cd)).map((r) => ({ ref: r.ref, hits: r.sigiHits })) : null,
        shippedRegistryClaims: tally(rows.map((r) => r.shippedClaim)),
        // per-parameter isKnown over single-row parcels (regardless of refusals) — "published,
        // non-zero, in band" — this is NOT "resolved"; see the slot mapping note.
        paramKnown: {
            height_m: count((r) => r.signed!.known['height_m']!),
            storeys: count((r) => r.signed!.known['storeys']!),
            occupationPct: count((r) => r.signed!.known['occupationPct']!),
            depth_m_NM_FDO_MX_ED: count((r) => r.signed!.known['depth_m']!),
            setbackFront_m: count((r) => r.signed!.known['setbackFront_m']!),
            setbackSide_m: count((r) => r.signed!.known['setbackSide_m']!),
            setbackRear_m: count((r) => r.signed!.known['setbackRear_m']!),
            setbackTripleComplete: count((r) => r.signed!.known['setbackFront_m']! && r.signed!.known['setbackSide_m']! && r.signed!.known['setbackRear_m']!),
            plotRatioFAR_any: count((r) => r.signed!.known['plotRatioFAR']!),
            plotRatioFAR_from_NM_C_ED_ORD: count((r) => r.signed!.known['plotRatioFAR']! && r.signed!.farSource === 'NM_C_ED_ORD'),
            plotRatioFAR_from_NM_C_ED_MAZ: count((r) => r.signed!.known['plotRatioFAR']! && r.signed!.farSource === 'NM_C_ED_MAZ'),
            minFrontage_m: count((r) => r.signed!.known['minFrontage_m']!),
        },
        impossibleStoreyHeight: count((r) => r.signed!.contradiction),
        grammar: tally(single.map((r) => r.signed!.grammar)),
        refusalsSigned: tally(single.flatMap((r) => r.signed!.refusals.length ? r.signed!.refusals : ['(none — drawable)'])),
        refusalsShipped: tally(single.flatMap((r) => r.shipped!.refusals)),
        drawableIfSigned: count((r) => r.signed!.drawable),
        drawableAsShipped: count((r) => r.shipped!.drawable),
        ordinances: tally(single.map((r) => r.wfs.ordinances[0] ?? null)),
        soilClasses: tally(single.map((r) => r.signed!.soilClass)),
        ambitoNamed: count((r) => r.signed!.ambito !== null),
        ambitoResolvedInRegister: count((r) => (r.register?.matches ?? 0) > 0),
        ambitoAmbiguous: count((r) => (r.register?.matches ?? 0) > 1),
    };

    return { city, frame: frameMeta, register: register.map(({ rows: _r, ...rest }) => rest), drawn: drawn.length, rows, shipped, signed, census };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// MARKDOWN
// ═════════════════════════════════════════════════════════════════════════════════════════════

const fmt = (n: number): string => n.toLocaleString('en-GB');
const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)} %`);

function renderGoalA(a: GoalA): string[] {
    const L: string[] = [
        '## GOAL A — `Callejero:SIGI_V_MUNICIPIOS` as a polygon `contains` routing gate (FEASIBILITY EVIDENCE, NOT WIRED)',
        '',
        `> Request (the exact shape of \`tools/madrid-spacm-probe/02-paging-and-domains.mjs\` §b): \`${a.request}\``,
        '',
        `> HTTP ${a.http.status} · \`${a.http.contentType}\` · **${fmt(a.http.bytes)} bytes**${a.http.owsException ? ` · OWS exception: ${a.http.owsException}` : ''}${a.http.transportError ? ` · transport: ${a.http.transportError}` : ''}`,
        '',
    ];
    if (a.featureCount === null) {
        L.push('⛔ **The upstream did not answer. Goal A stops here — a service failure is NEVER a zero.**', '', ...a.notes.map((n) => `- ${n}`));
        return L;
    }
    L.push(
        `- Saved verbatim to \`${path.relative(HERE, a.savedTo!).replace(/\\/g, '/')}\` — **${fmt(a.http.bytes)} bytes**, **${a.featureCount} features** (the layer's own census is 179).`,
        `- CRS the features ARRIVE in: declared \`${a.crsDeclared ?? '(none)'}\` · inferred from coordinate magnitude: **${a.crsInferred}**.`,
        `- Geometry types: ${Object.entries(a.geometryTypes).map(([k, v]) => `${k} × ${v}`).join(', ')} · **${fmt(a.totalRings)} rings · ${fmt(a.totalVertices)} vertices** in total.`,
        `- Properties: \`${a.propertyKeys.join('`, `')}\`.`,
        a.ineKeyProperty
            ? `- The INE key: property **\`${a.ineKeyProperty.name}\`**, ${a.ineKeyProperty.format}; ${a.ineKeyProperty.distinct} distinct values over ${a.featureCount} features${a.ineKeyProperty.allThreeDigit ? '' : ' ⚠ NOT all 3-digit'}. Compose INE-5 as \`'28' + ${a.ineKeyProperty.name}\` — the same key \`sitcm:VPLA_V_ORDENANZA.CD_MUNICIPIO\` uses (\`'079'\` returns 22,181 rows; \`'28079'\` returns ZERO on a clean 200).`
            : '- ⚠ No INE-key property found.',
        '',
        '### Per-municipality (the two that interleave, plus the two Goal-B municipalities and Moralzarzal)',
        '',
        '| CDMUNICIPIO | DSMUNICIPIO | geometry | rings | vertices | bbox WGS84 lon | bbox WGS84 lat | bbox quoted in `esMadridSpacm.ts` (read 2026-08-02) |',
        '|---|---|---|---:|---:|---|---|---|',
    );
    for (const [code, m] of Object.entries(a.perMuni)) {
        const qb = a.quotedBboxes[code];
        L.push(`| ${code} | ${m.name} | ${m.geomType} | ${m.rings} | ${fmt(m.vertices)} | [${m.bboxWgs84.minLon}, ${m.bboxWgs84.maxLon}] | [${m.bboxWgs84.minLat}, ${m.bboxWgs84.maxLat}] | ${qb ? `lon [${qb.lon.join(', ')}] lat [${qb.lat.join(', ')}]` : '—'} |`);
    }
    const d = a.disjoint079v022;
    L.push('', '### Are 079 (MADRID) and 022 (BOADILLA DEL MONTE) geometrically disjoint?', '');
    if (!d) {
        L.push('⚠ One of the two polygons is missing from the layer — not measured.');
    } else {
        L.push(
            `- bboxes overlap: **${d.bboxesOverlap}** (this is the 4.35 km interleave the registration is blocked on).`,
            `- vertices of 079 strictly inside 022 (shipped even-odd PIP): **${d.verticesOfAInsideB}** · vertices of 022 inside 079: **${d.verticesOfBInsideA}**.`,
            `- PROPER segment crossings between the two boundaries (${fmt(d.segmentPairsTested)} bbox-overlapping segment pairs tested): **${d.properCrossings}**.`,
            `- shared boundary vertices (identical to 1 mm): **${d.sharedVertices}** — ${d.sharedVertices > 0 ? 'they SHARE A BORDER (neighbours), which a rectangle can never express' : 'no shared vertices (not neighbours in this layer)'}.`,
            `- ⇒ **interiors disjoint: ${d.interiorsDisjoint ? 'YES' : 'NO'}**.`,
        );
    }
    L.push(
        '',
        `### 20 known points through the SHIPPED even-odd PIP (\`geometry/pointInRingsEvenOdd.ts\`) — **${a.pointsExactlyOne} of ${a.points.length} land in exactly ONE municipality**`,
        '',
        '`band` = inside the 4.35 km longitudinal interleave of the two quoted bboxes. `expect` is the author\'s prior; the polygon wins.',
        '',
        '| point | lat, lon | band | hits (CDMUNICIPIO → DSMUNICIPIO) | exactly one | expect | agrees | DP-20 m same | DP-50 m same |',
        '|---|---|:-:|---|:-:|---|:-:|:-:|:-:|',
    );
    for (const p of a.points) {
        L.push(`| ${p.label} | ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} | ${p.band ? '●' : ''} | ${p.hits.map((h, i) => `${h} → ${p.hitNames[i]}`).join(' ; ') || '(none)'} | ${p.exactlyOne ? '✓' : '✗ (' + p.hits.length + ')'} | ${p.expect ?? '—'} | ${p.expectAgrees === null ? '—' : p.expectAgrees ? '✓' : '✗'} | ${p.dp20Same ? '✓' : '✗'} | ${p.dp50Same ? '✓' : '✗'} |`);
    }
    L.push('', '### Simplified sizes (Douglas-Peucker, per ring, in the arrival frame) and whether classification survives', '');
    L.push(`| variant | tolerance | vertices | reduction | approx JSON bytes (2-dp coords) | 079 vertices | 022 vertices | 20 test points identical | 079∩022 interiors disjoint | seeded control (n=${a.controlFull?.n ?? 0}) identical | control zero-hit (full → simp) | control multi-hit (full → simp) |`);
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|:-:|---:|---|---|');
    L.push(`| full | 0 m | ${fmt(a.totalVertices)} | 0 % | ${fmt(a.http.bytes)} (as served) | ${fmt(a.perMuni['079']?.vertices ?? 0)} | ${fmt(a.perMuni['022']?.vertices ?? 0)} | ${a.points.length}/${a.points.length} | ${a.disjoint079v022?.interiorsDisjoint ? 'YES' : 'NO'} | — | ${a.controlFull?.zeroHits ?? '—'} | ${a.controlFull?.multiHits ?? '—'} |`);
    for (const [k, s] of Object.entries(a.simplified)) {
        L.push(`| ${k} | ${s.toleranceM} m | ${fmt(s.vertices)} | ${s.reductionPct} % | ${fmt(s.approxJsonBytes)} | ${fmt(s.vertices079)} | ${fmt(s.vertices022)} | ${s.testPointsIdentical}/${a.points.length} | ${s.disjoint079v022 ? (s.disjoint079v022.interiorsDisjoint ? 'YES' : `NO (${s.disjoint079v022.properCrossings} crossings)`) : '—'} | ${s.control.identical}/${s.control.n} (${pct(s.control.identical, s.control.n)}) | ${s.control.zeroHitsFull} → ${s.control.zeroHitsSimplified} | ${s.control.multiHitsFull} → ${s.control.multiHitsSimplified} |`);
    }
    L.push(
        '',
        '> ⚠ Simplifying neighbours INDEPENDENTLY opens hairline gaps and slivers along shared borders — that is what the control\'s zero-hit / multi-hit deltas measure. A production simplification would have to be topology-preserving (simplify shared edges once) or accept a "near a border → ask both" fallback. The control points are uniform over the layer\'s bbox, so most of the delta sits on borders in open country, not on parcels.',
    );
    if (a.notes.length) L.push('', '**Notes:**', ...a.notes.map((n) => `- ${n}`));
    return L;
}

function renderGoalBCity(c: CityOutcome): string[] {
    const L: string[] = [
        `## GOAL B — ${c.city.name} (INE ${c.city.ine} · CD_MUNICIPIO '${c.city.cd}')`,
        '',
    ];
    const f = c.frame;
    if (!f.ok) {
        L.push(`⛔ **Catastro frame FAILED — \`${f.reason}\`: ${f.message ?? ''}.** No parcel was drawn; nothing below is a zero.`, '');
        if (f.attempts) L.push('```json', JSON.stringify(f.attempts, null, 1), '```');
        return L;
    }
    L.push(
        `**Frame:** ${fmt(f.parcelCount!)} cadastral parcels — the municipality's FULL Catastro INSPIRE CP population (ATOM \`${f.atomUrl}\` → enclosure DGC ${f.enclosure!.dgcCode}, matched by \`${f.enclosure!.matchedBy}\`${f.enclosure!.warning ? ` ⚠ ${f.enclosure!.warning}` : ''}; GML ${(f.gmlBytes! / 1e6).toFixed(1)} MB, \`${f.srs}\` → WGS84 by the frame builder's inverse UTM). **${c.drawn} drawn uniformly without replacement**, every parcel weighs 1.`,
        '',
        '**Ámbito register (routing half), fetched live per `CD_MUNICIPIO`:**',
        '',
        '| layer | numberMatched (hits) | rows captured | complete | error |',
        '|---|---:|---:|:-:|---|',
        ...c.register.map((l) => `| \`${l.name}\` | ${l.numberMatched ?? 'NULL'} | ${l.rowsCaptured} | ${l.complete ? '✓' : '✗'} | ${l.error ?? ''} |`),
        '',
    );
    const z = c.census as Record<string, any>;
    L.push(
        '### The ordinance query, per parcel centroid (`INTERSECTS(GEOMETRY1, POINT(x y))`, EPSG:25830, no municipality pre-filter)',
        '',
        '| outcome | n | of |',
        '|---|---:|---:|',
        `| WFS service failure (EXCLUDED) | ${z.wfsFailures} | ${c.drawn} |`,
        `| **0 rows** — no ordinance polygon at the centroid | ${z.zeroRows} | ${c.drawn} |`,
        `| **1 row** — adapted | ${z.oneRow} | ${c.drawn} |`,
        `| **>1 rows** — AMBIGUOUS, refused, never picked | ${z.multiRows} | ${c.drawn} |`,
        `| rows carrying a CD_MUNICIPIO ≠ '${c.city.cd}' | ${z.rowsFromOtherMunicipality} | ${c.drawn} |`,
        `| centroid lands in exactly the SIGI polygon '${c.city.cd}' (Goal-A predicate, cross-check) | ${z.sigiCentroidInExpected ?? '—'} | ${c.drawn} |`,
        '',
    );
    if (z.multiRowDetail?.length) {
        L.push('Ambiguous parcels:', '', '| ref | rows | CDIDs | CD_MUNICIPIO | DS_NOMB_ORD |', '|---|---:|---|---|---|');
        for (const m of z.multiRowDetail) L.push(`| ${m.ref} | ${m.n} | ${m.cdids.join(', ')} | ${[...new Set(m.cdMunicipios)].join('/')} | ${m.ordinances.join(' \\| ')} |`);
        L.push('');
    }
    if (z.sigiCentroidElsewhere?.length) {
        L.push(`SIGI cross-check disagreements: ${z.sigiCentroidElsewhere.map((s: any) => `${s.ref} → [${s.hits.join('|')}]`).join('; ')}`, '');
    }
    L.push(
        `**Shipped registry's claim at these ${c.drawn} centroids (\`resolveRegisteredJurisdictionAt\`):** ${Object.entries(z.shippedRegistryClaims as Record<string, number>).map(([k, v]) => `\`${k}\` × ${v}`).join(' · ')}`,
        '',
        `### Per-parameter — published, non-zero, in band (\`isKnown\`) over the ${z.oneRow} single-row parcels — ⚠ NOT "resolved"; a refusal still voids the record`,
        '',
        `| parameter (source column) | known | of ${z.oneRow} |`,
        '|---|---:|---:|',
        `| height (NM_ALTURA) | ${z.paramKnown.height_m} | ${pct(z.paramKnown.height_m, z.oneRow)} |`,
        `| storeys (NM_N_PLTA) | ${z.paramKnown.storeys} | ${pct(z.paramKnown.storeys, z.oneRow)} |`,
        `| coverage (NM_OCP_MX) | ${z.paramKnown.occupationPct} | ${pct(z.paramKnown.occupationPct, z.oneRow)} |`,
        `| depth (NM_FDO_MX_ED) — no shared slot | ${z.paramKnown.depth_m_NM_FDO_MX_ED} | ${pct(z.paramKnown.depth_m_NM_FDO_MX_ED, z.oneRow)} |`,
        `| setback front (NM_RTR_FRNT) | ${z.paramKnown.setbackFront_m} | ${pct(z.paramKnown.setbackFront_m, z.oneRow)} |`,
        `| setback side (NM_RTR_LATL) | ${z.paramKnown.setbackSide_m} | ${pct(z.paramKnown.setbackSide_m, z.oneRow)} |`,
        `| setback rear (NM_RTR_POST) | ${z.paramKnown.setbackRear_m} | ${pct(z.paramKnown.setbackRear_m, z.oneRow)} |`,
        `| setback TRIPLE complete | ${z.paramKnown.setbackTripleComplete} | ${pct(z.paramKnown.setbackTripleComplete, z.oneRow)} |`,
        `| FAR — from NM_C_ED_ORD (per ORDINANCE) | ${z.paramKnown.plotRatioFAR_from_NM_C_ED_ORD} | ${pct(z.paramKnown.plotRatioFAR_from_NM_C_ED_ORD, z.oneRow)} |`,
        `| FAR — from NM_C_ED_MAZ (per MANZANA — block granularity, read only when ORD is absent) | ${z.paramKnown.plotRatioFAR_from_NM_C_ED_MAZ} | ${pct(z.paramKnown.plotRatioFAR_from_NM_C_ED_MAZ, z.oneRow)} |`,
        `| min frontage (NM_FRTE_MIN) | ${z.paramKnown.minFrontage_m} | ${pct(z.paramKnown.minFrontage_m, z.oneRow)} |`,
        `| **impossible storey height** (NM_ALTURA ÷ NM_N_PLTA outside [2.2, 5.0] → \`parameters-contradict\`) | ${z.impossibleStoreyHeight} | ${pct(z.impossibleStoreyHeight, z.oneRow)} |`,
        '',
        `**Grammar:** ${Object.entries(z.grammar as Record<string, number>).map(([k, v]) => `\`${k}\` × ${v}`).join(' · ') || '—'}`,
        '',
        `**Ordinance designations (DS_NOMB_ORD):** ${Object.entries(z.ordinances as Record<string, number>).map(([k, v]) => `${k} × ${v}`).join(' · ') || '—'}`,
        '',
        `**Soil class (DS_CLAS_SUE):** ${Object.entries(z.soilClasses as Record<string, number>).map(([k, v]) => `${k} × ${v}`).join(' · ') || '—'}`,
        '',
        `**Ámbito:** named on ${z.ambitoNamed} of ${z.oneRow} · resolved in the register ${z.ambitoResolvedInRegister} · ambiguous key (>1 instrument) ${z.ambitoAmbiguous}`,
        '',
        `**Refusals — AS SHIPPED (gate closed):** ${Object.entries(z.refusalsShipped as Record<string, number>).map(([k, v]) => `\`${k}\` × ${v}`).join(' · ') || '—'} ⇒ drawable **${z.drawableAsShipped} of ${z.oneRow}** — **as shipped: 0 numbers reach a user** (and \`CM_SPACM_REGISTRATION_BLOCKED\` means no card from this adapter does either).`,
        '',
        `**Refusals — IF SIGNED (\`verificationGateOpen: true\`):** ${Object.entries(z.refusalsSigned as Record<string, number>).map(([k, v]) => `\`${k}\` × ${v}`).join(' · ') || '—'} ⇒ drawable **${z.drawableIfSigned} of ${z.oneRow}**.`,
        '',
        '### Per parcel',
        '',
        '| # | ref | area m² | rows | CD_MUN | DS_NOMB_ORD | soil | ámbito (register matches) | grammar | known: H/P/OCP/FDO/F/S/R/FAR(src) | contradiction | IF SIGNED | AS SHIPPED |',
        '|---:|---|---:|---:|---|---|---|---|---|---|:-:|---|---|',
    );
    let i = 0;
    for (const r of c.rows) {
        i++;
        const s = r.signed;
        const k = s ? `${s.known['height_m'] ? 'H' : '·'}${s.known['storeys'] ? 'P' : '·'}${s.known['occupationPct'] ? 'O' : '·'}${s.known['depth_m'] ? 'D' : '·'}${s.known['setbackFront_m'] ? 'F' : '·'}${s.known['setbackSide_m'] ? 'S' : '·'}${s.known['setbackRear_m'] ? 'R' : '·'}${s.known['plotRatioFAR'] ? `A(${s.farSource === 'NM_C_ED_ORD' ? 'ORD' : 'MAZ'})` : '·'}` : '';
        const signedTxt = r.clsSigned === 'resolved' ? `**resolved** [${c.signed[i - 1]!.slots.join(', ')}]` : `${r.clsSigned}${s ? ` (${s.refusals.join('+') || '—'})` : ''}`;
        L.push(`| ${i} | ${r.ref} | ${r.areaM2 ?? ''} | ${r.wfs.ok ? r.wfs.rowCount : `ERR ${r.wfs.status}`} | ${[...new Set(r.wfs.cdMunicipios)].join('/')} | ${r.wfs.ordinances.join(' \\| ').slice(0, 60)} | ${(s?.soilClass ?? '').slice(0, 40)} | ${s ? `${s.ambito ?? '—'}${r.register ? ` (${r.register.matches})` : ''}` : ''} | ${s?.grammar ?? ''} | ${k} | ${s?.contradiction ? '⚠' : ''} | ${signedTxt} | ${r.clsShipped} |`);
    }
    return L;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
    const args = parseArgs();
    const t0 = Date.now();
    const md: string[] = [
        `# Comunidad de Madrid (REGION, capital excluded) — envelope slot coverage + boundary-gate feasibility, MEASURED ${new Date().toISOString().slice(0, 10)}`,
        '',
        `> Command: \`npx tsx tools/envelope-slot-coverage/measureMadridRegion.ts --n ${args.n} --seed ${args.seed}\` · ONLINE (idem.comunidad.madrid WFS + catastro.hacienda.gob.es ATOM) · slots: ${ENVELOPE_SLOTS.join(', ')}`,
        '',
        `> Shipped state read from \`esMadridSpacm.ts\`: \`CM_SPACM_REGISTRATION_BLOCKED = ${CM_SPACM_REGISTRATION_BLOCKED}\` · \`CM_SPACM_ENVELOPE_VERIFIED = ${CM_SPACM_ENVELOPE_VERIFIED}\` · jurisdiction id \`${CM_SPACM_JURISDICTION_ID}\`. ⛔ **The capital (INE 28079) is a separate registration and is not in any frame below.**`,
        '',
        '> ⚠ TWO FRAMES PER MUNICIPALITY, NEVER BLENDED. **AS SHIPPED**: nothing routes to this adapter by click and every record carries `verification-gate-closed` ⇒ **0 numbers reach a user**; the live ordinance answer is used as a WITNESS only (a legally-grounded refusal — public system / non-urban soil / ámbito delegation — is a fact about the LAND and is F2 whether or not PRYZM shows the card). **IF SIGNED**: the same records under `verificationGateOpen: true` — a demonstration of what an L-449 signature would open, not an authorisation.',
        '',
        '> ⚠ A slot is counted RESOLVED only when the record is DRAWABLE (no refusal, envelope non-null, grammar known) and the dimension is `isKnown`. `computeBuildableEnvelope` is NOT run: the adapter emits a `GeometricRule`, and building a pack around it would wire the registration this arm may not wire. `permittedUse` can never resolve here (the adapter does not read `DS_US_PRED`); `depth` (NM_FDO_MX_ED) has no shared slot and is reported beside the eight.',
        '',
    ];

    let munis: Muni[] | null = null;
    let frameCrs: 'projected-metres' | 'geographic-degrees' | null = null;
    let goalAResult: GoalA | null = null;
    if (!args.skipA) {
        const a = await goalA(args);
        goalAResult = a.result; munis = a.munis; frameCrs = a.frame;
        md.push(...renderGoalA(a.result), '');
    }

    const frames: Record<string, { frame: string; points: PointResult[] }> = {};
    const cities: CityOutcome[] = [];
    if (!args.skipB) {
        const allShipped: PointResult[] = []; const allSigned: PointResult[] = [];
        for (const city of CITIES) {
            const c = await goalBCity(city, args, munis, frameCrs);
            cities.push(c);
            md.push(...renderGoalBCity(c), '');
            if (c.frame.ok) {
                const frameTxt = `${c.drawn} REAL Catastro parcels drawn uniformly (seed ${args.seed}) over ${c.city.name}'s FULL INSPIRE CP population of ${fmt(c.frame.parcelCount!)}; one live \`sitcm:VPLA_V_ORDENANZA\` INTERSECTS query per centroid; the SHIPPED \`adaptSpacmRow\` with the live ámbito register`;
                frames[`${c.city.key} · AS SHIPPED`] = { frame: `${frameTxt} — gate CLOSED (the shipped state).`, points: c.shipped };
                frames[`${c.city.key} · IF SIGNED`] = { frame: `${frameTxt} — \`verificationGateOpen: true\` (DEMONSTRATION, not authorisation).`, points: c.signed };
                allShipped.push(...c.shipped); allSigned.push(...c.signed);
            }
        }
        if (cities.length > 1) {
            frames['ALL · AS SHIPPED'] = { frame: `both municipalities pooled — ${allShipped.length} real Catastro parcels — gate CLOSED.`, points: allShipped };
            frames['ALL · IF SIGNED'] = { frame: `both municipalities pooled — ${allSigned.length} real Catastro parcels — gate OPEN (demonstration).`, points: allSigned };
        }
        md.push('## Slot-coverage frames (the shared classifier — `slots.ts`)', '');
        for (const [k, v] of Object.entries(frames)) md.push(renderMarkdown(`Frame \`${k}\``, report(v.points), v.frame), '');
    }

    md.push(`> Wall time ${((Date.now() - t0) / 1000).toFixed(0)} s.`);

    writeArtefact(
        'es-md-region',
        {
            args,
            shipped: { CM_SPACM_REGISTRATION_BLOCKED, CM_SPACM_ENVELOPE_VERIFIED, CM_SPACM_JURISDICTION_ID },
            goalA: goalAResult,
            goalB: cities.map((c) => ({ city: c.city, frame: c.frame, register: c.register, drawn: c.drawn, census: c.census, rows: c.rows })),
        },
        frames,
        md.join('\n'),
    );
    process.stdout.write(`${md.join('\n')}\n`);
}

main().catch((e) => {
    process.stderr.write(`[envelope-slot-coverage/es-md-region] FAILED: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    process.exit(2);
});
