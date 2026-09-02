// LANE PORTO-FLIP (§PORTO-SIGN-OFF blocker 4 · ADR-0379) — THE FRONTAGE EXTRACTOR: construct
// the *frente urbana* member set for the moda da cércea.
//
// THE LEGAL DEFINITION THIS IMPLEMENTS (both pinned, SOURCES.md §A.0.3, VERIFIED-PRIMARY):
//   • Art. 3.º l) *frente urbana* — "plane of façades fronting a public way, between two
//     successive intersecting public ways".
//   • Art. 3.º o) *moda da cércea* — "the cércea with the greatest extent along a built urban
//     frontage" — EXTENT along the frontage is the article's own weight, which is why every
//     member this module emits carries `extent_m` (frontage length share), never a bare count.
//
// WHAT THIS MODULE IS: the "adapter/kernel work (lane A row 1)" ADR-0379 §4 names — the ONE
// producer of `ContextSetInput` members for Porto's `context-aggregate` rule. Members are
// INJECTED into the evaluator by design (`evaluateContextAggregate` constructs nothing); this
// module constructs them from injected RAW context data and refuses honestly when it cannot:
//   • `context-set-unavailable` — the frontage cannot be established (degenerate way, subject
//     side indeterminate) or the fabric cannot be MEASURED (fronting buildings whose
//     cércea-comparable height no wired source serves — excluding them could flip the mode,
//     the exact silent-drop ADR-0379's poisoned-member rule forbids one seat later).
//   • `available` + zero members — the frontage IS established and genuinely has no built
//     members. Empty ≠ unavailable (§CONTEXT-DATA-HONESTY): the evaluator refuses each under
//     its own code.
//
// DIVISION OF LABOUR WITH THE EVALUATOR (stated so nobody "fixes" it into a gap):
//   • height ABSENT (`corniceHeightM: null`)       → THIS module refuses (set not constructible).
//   • height PRESENT but POISONED (NaN, negative)  → passed through VERBATIM; the evaluator's
//     `invalid-member` guard refuses the whole evaluation (ADR-0379 §3). Coercing or dropping
//     here would blind that guard.
//
// SOURCE DOCTRINE (envelope-architecture audit Part IV §T2): surveyed as-is heights are a legal
// INPUT here "only because a rule names it, and the output is still the rule's, not the
// fabric's". The candidate channels are the context-buildings federation (`buildingsFederation/`)
// and BD-class per-point slices (`fr/frBdTopoNeighbours.ts` is the FR exemplar); NO PT channel
// serves cércea-comparable heights today (measured 2026-09-02: OSM Porto FUC frontages carry
// `height` on 3/115 buildings, all street furniture, and `building:levels` is a storey count —
// a storeys×assumption derivation is the NL_STOREY_DERIVED_HEIGHT class and does NOT enter as a
// measured cércea). A caller with no honest source passes nothing and the card says so.
//
// C12 §8 DISCIPLINE: this module fetches NOTHING (no new Overpass query, no new WFS). The way +
// buildings arrive from the runtime's existing context fetch through `PtChainDeps`.
//
// PURE + deterministic (C58 §1.1). P8: OTel span on the exported entry point.

import { trace } from '@opentelemetry/api';
import type {
    ContextFabricMember,
    ContextSetInput,
} from '../../rulepacks/declarative/evaluateContextAggregate.js';

const tracer = trace.getTracer('pryzm.siteintel.pt');

/* ────────────────────────────── input model ─────────────────────────────── */

export interface PtFrontagePoint {
    readonly lat: number;
    readonly lon: number;
}

/**
 * The public way carrying the frontage — the centreline BETWEEN TWO SUCCESSIVE INTERSECTING
 * PUBLIC WAYS (Art. 3.º l's own boundary; the CALLER clips at the intersections — the clip is
 * part of establishing the frontage, and a caller that cannot clip passes nothing, which reads
 * as unavailable at the chain).
 */
export interface PtFrontageWay {
    /** Stable provenance id of the way, e.g. `osm:way/23246489`. */
    readonly sourceId: string;
    /** The way's name as served, or null. */
    readonly name: string | null;
    /** ≥ 2 points; a degenerate polyline refuses. */
    readonly path: readonly PtFrontagePoint[];
}

/** One context building, with per-member provenance. */
export interface PtFrontageBuilding {
    /** Stable provenance id, e.g. `osm:way/225566609` — travels onto the member's `sourceId`. */
    readonly sourceId: string;
    /**
     * A cércea-comparable height in metres — measured from MEAN GROUND AT THE FAÇADE ALIGNMENT
     * to the eave/parapet (Art. 3.º g / ADR-0377 `mean-ground-at-facade`), or null when the
     * channel serves NO such measure. ⚠ A roof/ridge height, a storey count × an assumed
     * storey height, or an unstated-datum height MUST arrive as null — mixing datums makes the
     * moda a statistic over two populations (ADR-0377), and a storey derivation is the
     * NL_STOREY_DERIVED_HEIGHT class, unsigned.
     */
    readonly corniceHeightM: number | null;
    /** How `corniceHeightM` was measured — or why it is null. Honest provenance, per member. */
    readonly heightProvenance: string;
    /** Footprint ring (≥ 3 points; closed or open). */
    readonly ring: readonly PtFrontagePoint[];
}

/** The raw injected context — what a `PtChainDeps.resolveFrenteUrbanaAt` dep resolves. */
export interface PtFrenteUrbanaData {
    /** The subject point (the parcel/click) — fixes WHICH SIDE of the way the frontage is. */
    readonly subject: PtFrontagePoint;
    readonly way: PtFrontageWay;
    readonly buildings: readonly PtFrontageBuilding[];
}

/* ────────────────────────────── output model ────────────────────────────── */

/** The extraction: the evaluator's input plus the frontage identity the card cites. */
export interface PtFrenteUrbanaExtraction {
    readonly contextSet: ContextSetInput;
    /** Way identity for the citation chain (null only when the way itself was refused). */
    readonly wayName: string | null;
    readonly waySourceId: string | null;
    /** Clipped frontage length (m), or null when the way was refused. */
    readonly wayLengthM: number | null;
    /** Fronting buildings found on the subject's side (measured + unmeasured). */
    readonly frontingCount: number;
    /** Fronting buildings with NO cércea-comparable height (they force `unavailable`). */
    readonly unmeasuredCount: number;
}

/* ────────────────────────────── constants ───────────────────────────────── */

/**
 * Lateral band (m) from the way centreline within which a footprint fronts the way. The scale
 * is the ordinance's own building-depth order: profundidade 25 m / 30 m (Art. 24.º n.º 1 d) /
 * Art. 27.º n.º 1 d)) measured FROM the alinhamento — a façade sits at the front of that band,
 * so 30 m comfortably contains every fronting façade without reaching the next street back
 * (Porto FUC blocks are ≥ 2 bands deep).
 */
export const PT_FRONTAGE_BAND_M = 30;

/**
 * Minimum projected span (m) for a footprint to count as a fronting façade — below this a
 * touching corner or a sliver projects, not a façade. Well under any real Porto street front.
 */
export const PT_FRONTAGE_MIN_EXTENT_M = 2;

/** Subject closer to the centreline than this cannot fix a side (lateral sign unstable). */
const SUBJECT_SIDE_MIN_OFFSET_M = 0.5;

/* ────────────────────────────── geometry core ───────────────────────────── */

/** Equirectangular lon/lat → local metres about `origin` (city-scale; exactness not needed —
 *  extents feed a mode over ~3 m-quantised heights, and the same projection maps every input). */
function toLocalM(p: PtFrontagePoint, origin: PtFrontagePoint): { x: number; y: number } {
    const kLat = 111_320; // m per degree latitude
    const kLon = kLat * Math.cos((origin.lat * Math.PI) / 180);
    return { x: (p.lon - origin.lon) * kLon, y: (p.lat - origin.lat) * kLat };
}

interface Projection {
    /** Distance along the way from its first vertex (m), clamped to the polyline. */
    readonly chainage: number;
    /** Signed lateral offset (m): sign = which side of the way. */
    readonly offset: number;
}

/** Project a point onto a polyline: nearest point over all segments, with signed side. */
function projectOntoPolyline(
    pt: { x: number; y: number },
    line: readonly { x: number; y: number }[],
): Projection {
    let best: { d2: number; chainage: number; offset: number } | null = null;
    let acc = 0;
    for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]!;
        const b = line[i + 1]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const segLen = Math.sqrt(len2);
        if (segLen === 0) continue;
        let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * dx;
        const py = a.y + t * dy;
        const ex = pt.x - px;
        const ey = pt.y - py;
        const d2 = ex * ex + ey * ey;
        // Signed side via the segment normal (cross product sign), from the UNCLAMPED segment
        // direction — stable for points beside the segment, which is the band case we keep.
        const cross = dx * (pt.y - a.y) - dy * (pt.x - a.x);
        const offset = Math.sign(cross) * Math.sqrt(d2);
        if (best === null || d2 < best.d2) {
            best = { d2, chainage: acc + t * segLen, offset };
        }
        acc += segLen;
    }
    /* v8 ignore next — callers validate ≥ 2 distinct points first. */
    if (best === null) return { chainage: 0, offset: 0 };
    return { chainage: best.chainage, offset: best.offset };
}

function polylineLength(line: readonly { x: number; y: number }[]): number {
    let acc = 0;
    for (let i = 0; i < line.length - 1; i++) {
        const dx = line[i + 1]!.x - line[i]!.x;
        const dy = line[i + 1]!.y - line[i]!.y;
        acc += Math.sqrt(dx * dx + dy * dy);
    }
    return acc;
}

/* ────────────────────────────── the extractor ───────────────────────────── */

function unavailableExtraction(why: string): PtFrenteUrbanaExtraction {
    return {
        contextSet: { status: 'unavailable', why },
        wayName: null,
        waySourceId: null,
        wayLengthM: null,
        frontingCount: 0,
        unmeasuredCount: 0,
    };
}

/**
 * Construct the frente-urbana member set (Art. 3.º l) for the moda da cércea (Art. 3.º o) from
 * injected raw context. Deterministic; every failure is the honest `unavailable` (the set could
 * not be constructed) — the evaluator owns `empty`, `tie` and `invalid-member` one seat later.
 */
export function extractPtFrenteUrbana(data: PtFrenteUrbanaData): PtFrenteUrbanaExtraction {
    const span = tracer.startSpan('pryzm.siteintel.pt.extractPtFrenteUrbana');
    try {
        const origin = data.subject;
        const wayLocal = data.way.path.map((p) => toLocalM(p, origin));
        const wayLength = polylineLength(wayLocal);
        span.setAttribute('pryzm.way', data.way.sourceId);
        span.setAttribute('pryzm.buildings', data.buildings.length);
        if (data.way.path.length < 2 || wayLength < PT_FRONTAGE_MIN_EXTENT_M) {
            return unavailableExtraction(
                `frontage way ${data.way.sourceId} is degenerate (${data.way.path.length} ` +
                    `point(s), ${wayLength.toFixed(1)} m) — a frente urbana runs BETWEEN two ` +
                    'successive intersecting public ways (Art. 3.º l) and cannot be established ' +
                    'on a degenerate centreline.',
            );
        }

        const subjLocal = toLocalM(data.subject, origin); // (0,0) by construction
        const subj = projectOntoPolyline(subjLocal, wayLocal);
        if (Math.abs(subj.offset) < SUBJECT_SIDE_MIN_OFFSET_M) {
            return unavailableExtraction(
                `the subject point sits on the way centreline of ${data.way.sourceId} ` +
                    `(lateral offset ${Math.abs(subj.offset).toFixed(2)} m < ` +
                    `${SUBJECT_SIDE_MIN_OFFSET_M} m) — which SIDE carries the frontage cannot ` +
                    'be established, and the two sides are different frentes urbanas (Art. 3.º l).',
            );
        }
        const side = Math.sign(subj.offset);

        // Fronting members: footprint vertices on the subject's side, inside the lateral band,
        // within the clipped way's chainage. Extent = projected chainage span (the article's
        // "extensão ao longo de uma frente urbana").
        interface Fronting {
            readonly building: PtFrontageBuilding;
            readonly extentM: number;
        }
        const fronting: Fronting[] = [];
        for (const b of data.buildings) {
            if (b.ring.length < 3) continue; // not a footprint — cannot front anything
            let min = Number.POSITIVE_INFINITY;
            let max = Number.NEGATIVE_INFINITY;
            for (const v of b.ring) {
                const proj = projectOntoPolyline(toLocalM(v, origin), wayLocal);
                if (Math.sign(proj.offset) !== side) continue;
                if (Math.abs(proj.offset) > PT_FRONTAGE_BAND_M) continue;
                if (proj.chainage < min) min = proj.chainage;
                if (proj.chainage > max) max = proj.chainage;
            }
            const extentM = max - min;
            if (!Number.isFinite(extentM) || extentM < PT_FRONTAGE_MIN_EXTENT_M) continue;
            fronting.push({ building: b, extentM });
        }

        const unmeasured = fronting.filter((f) => f.building.corniceHeightM === null);
        if (unmeasured.length > 0) {
            const ids = unmeasured
                .map((f) => f.building.sourceId)
                .sort()
                .slice(0, 8)
                .join(', ');
            return {
                contextSet: {
                    status: 'unavailable',
                    why:
                        `${unmeasured.length} of ${fronting.length} fronting building(s) on ` +
                        `${data.way.name ?? data.way.sourceId} carry NO cércea-comparable ` +
                        `measured height (${ids}${unmeasured.length > 8 ? ', …' : ''}; ` +
                        `e.g. ${unmeasured[0]!.building.heightProvenance}) — excluding them ` +
                        'could flip the mode (the same reasoning as ADR-0379\'s poisoned-member ' +
                        'rule), so the member set cannot be honestly constructed.',
                },
                wayName: data.way.name,
                waySourceId: data.way.sourceId,
                wayLengthM: wayLength,
                frontingCount: fronting.length,
                unmeasuredCount: unmeasured.length,
            };
        }

        // Every fronting member is measured: emit VERBATIM (a poisoned value — NaN, negative —
        // passes through for the evaluator's `invalid-member` guard; see the header).
        const members: ContextFabricMember[] = fronting
            .map((f) => ({
                value_m: f.building.corniceHeightM as number,
                extent_m: f.extentM,
                sourceId: f.building.sourceId,
            }))
            .sort((a, b) => (a.sourceId! < b.sourceId! ? -1 : a.sourceId! > b.sourceId! ? 1 : 0));

        return {
            contextSet: { status: 'available', members },
            wayName: data.way.name,
            waySourceId: data.way.sourceId,
            wayLengthM: wayLength,
            frontingCount: fronting.length,
            unmeasuredCount: 0,
        };
    } finally {
        span.end();
    }
}
