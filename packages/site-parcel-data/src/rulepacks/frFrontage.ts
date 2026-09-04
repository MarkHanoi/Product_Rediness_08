// FRANCE — FRONTAGE DERIVATION: which parcel edges face a road, and how wide the road is.
// Founder blocker review 2026-09-04 §10.2 (move 4): *"the cheapest item on this list, it unblocks
// every `15.01` road-setback rule, and it's a prerequisite for A4."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IT ANSWERS, AND ON WHICH AXIS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The 100-parcel audit could not label frontage with any of the six extraction failures, because
// frontage is not an extraction: it is *"a deterministic spatial computation over national
// reference geometry"* (FR-100-PARCEL audit §6.1). It lives on the REACHABILITY axis as
// `derivable`. This module is that computation — over the cadastre parcel ring and the BD TOPO
// road network, both already fetched, both authoritative geometry.
//
// Two questions, deliberately kept apart, because they have different reachabilities:
//
//   • PHYSICAL frontage 🔵 (`derivable`) — does this edge run along a road corridor? Geometry
//     answers it: distance from the edge to the road centreline within half the carriageway width
//     plus a tolerance, over a majority of the edge's length, at a near-parallel angle.
//   • LEGAL frontage 🟡 — is the road it faces a *voie publique* (so the edge sits on the
//     alignement, the public-domain limit R.111-16 measures from), or a *voie privée* (whose
//     effective width R.111-16 assimilates to the regulatory width)? BD TOPO publishes a private
//     flag on the troncon; where it is absent the legal class is `unknown`, never inferred from
//     the road looking public.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE EXISTING SOLVER THIS EXTENDS (grep-for-the-existing-solver-first)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `geometry/blockRing.ts#classifyBlockFrontages` already classifies BLOCK edges as front/side from
// the edge MIDPOINT's distance to a road and the edge/road angle. This module keeps its two
// thresholds (12 m, 25°) as defaults and extends the test in the one way a PARCEL edge needs:
// SAMPLING ALONG THE EDGE with a front FRACTION, because a long rural parcel edge may touch a
// road for a third of its length and a midpoint test sees either all or nothing. It does not
// replace `classifyBlockFrontages`, which answers a block-level question with an OSM road set.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HOW THE RESULT IS SEATED
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   A3 (frontage classification per edge) — `resolved / derivable / estimated`. `estimated`
//      because the classification depends on DECLARED thresholds (tolerance, fraction, angle) —
//      `RuleRecoveryReport.resolvedEstimated` names "an assumed-parameter frontage class" as
//      exactly this case. It is a typed outcome, excluded from the authoritative numerator.
//   A4 (right-of-way width per frontage) — one state PER FRONT EDGE. `resolved / derivable /
//      published-structured` when BD TOPO publishes the troncon's width (the number is theirs; we
//      only attached it to an edge); `unrecovered / graphic / derivable` when it does not — the
//      width is then in the carriageway GEOMETRY and un-measured (`geometry/streetWidth.ts` is the
//      measurer; this module does not re-implement it).
//
// PURE + deterministic (C58 §1.1/§1.9). Scene XZ metres in, states out. No I/O.

import type { Pt, RuleSourceRef, RuleState } from '@pryzm/schemas';
import { pointSegmentDistance } from '@pryzm/site-validators';

/* ───────────────────────────── inputs ─────────────────────────────── */

/** One BD TOPO `troncon_de_route` (or equivalent) as a centreline polyline in scene XZ metres. */
export interface FrRoadSegment {
    readonly id: string;
    readonly points: readonly Pt[];
    /** Carriageway width (m) as PUBLISHED (BD TOPO `largeur_de_chaussee`), or null when absent. */
    readonly widthM: number | null;
    /** BD TOPO private-road flag as published, or null when the attribute is absent. */
    readonly isPrivate: boolean | null;
    /** BD TOPO `nature` verbatim (e.g. "Route à 1 chaussée", "Chemin", "Sentier"), or null. */
    readonly nature: string | null;
}

export interface FrFrontageOptions {
    /** Spacing (m) of the samples taken along each parcel edge. Default 2 m. */
    readonly sampleSpacingM?: number;
    /**
     * Distance (m) added to half the published width to form the corridor. Default 3 m — kerb,
     * verge and cadastral offset. Where the width is unpublished the corridor falls back to
     * `maxDistanceM` (the `classifyBlockFrontages` default, 12 m).
     */
    readonly toleranceM?: number;
    /** Fallback corridor half-width (m) when the road publishes no width. Default 12 m. */
    readonly maxDistanceM?: number;
    /** Largest edge/road angle (°) still read as "runs along". Default 25° (as `classifyBlockFrontages`). */
    readonly maxAngleDeg?: number;
    /** Share of an edge's samples that must sit in a corridor for the edge to be a frontage. Default 0.5. */
    readonly minFrontFraction?: number;
    /**
     * Nature values that are NOT road frontage even when adjacent (a footpath is not a voie the
     * RNU measures from). Default: BD TOPO "Sentier" and "Escalier". Matched case-insensitively.
     */
    readonly excludedNatures?: readonly string[];
}

const DEFAULTS: Required<FrFrontageOptions> = Object.freeze({
    sampleSpacingM: 2,
    toleranceM: 3,
    maxDistanceM: 12,
    maxAngleDeg: 25,
    minFrontFraction: 0.5,
    excludedNatures: Object.freeze(['sentier', 'escalier']),
});

/* ───────────────────────────── outputs ─────────────────────────────── */

export type FrFrontagePhysical = 'road' | 'none';
export type FrFrontageLegal = 'public-road' | 'private-road' | 'unknown';

export interface FrEdgeFrontage {
    /** Edge `i` spans ring vertex `i → i+1` (C19 §2.3 convention). */
    readonly edgeIndex: number;
    readonly a: Pt;
    readonly b: Pt;
    readonly lengthM: number;
    readonly physical: FrFrontagePhysical;
    /** Share of the edge's samples inside a road corridor (0..1). */
    readonly frontFraction: number;
    /** The road that made it a frontage (most samples), or null. */
    readonly roadId: string | null;
    /** That road's PUBLISHED width, or null — never a class-based guess. */
    readonly roadWidthM: number | null;
    readonly legal: FrFrontageLegal;
}

export interface FrFrontageDerivation {
    readonly edges: readonly FrEdgeFrontage[];
    readonly frontEdgeCount: number;
    /** Does at least one edge face a road — the PAU derivation's access input. */
    readonly roadAccess: boolean;
    readonly options: Required<FrFrontageOptions>;
    /** A3 once; A4 once per front edge (see the header). */
    readonly states: readonly RuleState[];
}

/* ───────────────────────────── geometry ─────────────────────────────── */

function openRing(ring: readonly Pt[]): Pt[] {
    if (ring.length < 2) return [...ring];
    const f = ring[0]!;
    const l = ring[ring.length - 1]!;
    return f.x === l.x && f.z === l.z ? ring.slice(0, -1) : [...ring];
}

/** Smallest angle between two undirected lines, in degrees (0..90). */
function undirectedAngleDeg(ax: number, az: number, bx: number, bz: number): number {
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la === 0 || lb === 0) return 90;
    const cos = Math.min(1, Math.abs((ax * bx + az * bz) / (la * lb)));
    return (Math.acos(cos) * 180) / Math.PI;
}

/** Sample points along a→b at `spacing`, always including both ends. */
function samplesAlong(a: Pt, b: Pt, spacing: number): Pt[] {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len === 0) return [a];
    const n = Math.max(1, Math.ceil(len / spacing));
    const out: Pt[] = [];
    for (let k = 0; k <= n; k++) {
        const t = k / n;
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
    return out;
}

/* ───────────────────────────── the derivation ─────────────────────────────── */

/**
 * Classify every parcel edge. **Pure, total, deterministic** — same ring + roads ⇒ same output.
 * Returns an empty edge list for a degenerate ring (< 3 vertices); it never throws.
 */
export function deriveFrFrontage(
    parcelRing: readonly Pt[],
    roads: readonly FrRoadSegment[],
    ref: RuleSourceRef,
    options: FrFrontageOptions = {},
): FrFrontageDerivation {
    const opts: Required<FrFrontageOptions> = { ...DEFAULTS, ...options };
    const excluded = new Set(opts.excludedNatures.map((s) => s.toLowerCase()));
    const ring = openRing(parcelRing);
    if (ring.length < 3) {
        return { edges: [], frontEdgeCount: 0, roadAccess: false, options: opts, states: [] };
    }

    const usable = roads.filter((r) => r.points.length >= 2 && !(r.nature !== null && excluded.has(r.nature.toLowerCase())));

    const edges: FrEdgeFrontage[] = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const lengthM = Math.hypot(ex, ez);
        const samples = samplesAlong(a, b, opts.sampleSpacingM);

        // Per road: how many samples sit in ITS corridor at a near-parallel angle.
        const hitsByRoad = new Map<string, number>();
        for (const road of usable) {
            const corridor = road.widthM !== null && road.widthM > 0 ? road.widthM / 2 + opts.toleranceM : opts.maxDistanceM;
            let hits = 0;
            for (const s of samples) {
                let inCorridor = false;
                for (let j = 0; j + 1 < road.points.length && !inCorridor; j++) {
                    const ra = road.points[j]!;
                    const rb = road.points[j + 1]!;
                    if (pointSegmentDistance(s, ra, rb) > corridor) continue;
                    if (undirectedAngleDeg(ex, ez, rb.x - ra.x, rb.z - ra.z) > opts.maxAngleDeg) continue;
                    inCorridor = true;
                }
                if (inCorridor) hits += 1;
            }
            if (hits > 0) hitsByRoad.set(road.id, hits);
        }

        // Deterministic winner: most hits, then lexical id — never Map insertion order.
        let bestId: string | null = null;
        let bestHits = 0;
        for (const [id, hits] of [...hitsByRoad.entries()].sort((p, q) => (q[1] - p[1]) || (p[0] < q[0] ? -1 : 1))) {
            bestId = id;
            bestHits = hits;
            break;
        }
        const frontFraction = samples.length === 0 ? 0 : bestHits / samples.length;
        const isFront = bestId !== null && frontFraction >= opts.minFrontFraction;
        const road = isFront ? usable.find((r) => r.id === bestId) ?? null : null;

        edges.push({
            edgeIndex: i,
            a,
            b,
            lengthM,
            physical: isFront ? 'road' : 'none',
            frontFraction,
            roadId: road?.id ?? null,
            roadWidthM: road !== null && road.widthM !== null && road.widthM > 0 ? road.widthM : null,
            legal: road === null ? 'unknown' : road.isPrivate === null ? 'unknown' : road.isPrivate ? 'private-road' : 'public-road',
        });
    }

    const front = edges.filter((e) => e.physical === 'road');
    const states: RuleState[] = [];

    // A3 — the per-edge classification, once. Declared thresholds ⇒ `estimated` (header).
    states.push({
        rule: 'A3',
        status: 'resolved',
        reachability: 'derivable',
        value:
            `${front.length} of ${edges.length} edges road-frontage (physical): ` +
            (front.length === 0 ? 'none' : front.map((e) => `#${e.edgeIndex}→${e.roadId} (${e.legal})`).join(', ')),
        unit: null,
        datum: null,
        provenance: 'estimated',
        ref: {
            ...ref,
            dataset: 'cadastre-parcel × BD TOPO troncon_de_route',
            object_id: null,
            article:
                `derivation — corridor = width/2 + ${opts.toleranceM} m (fallback ${opts.maxDistanceM} m), ` +
                `angle ≤ ${opts.maxAngleDeg}°, front fraction ≥ ${opts.minFrontFraction}`,
        },
    });

    // A4 — one per front edge. The width is BD TOPO's number or it is not a number yet.
    for (const e of front) {
        const edgeRef: RuleSourceRef = {
            ...ref,
            dataset: 'BD TOPO troncon_de_route',
            object_id: e.roadId,
            article: `edge #${e.edgeIndex}`,
        };
        if (e.roadWidthM !== null) {
            states.push({
                rule: 'A4',
                status: 'resolved',
                reachability: 'derivable',
                value: e.roadWidthM,
                unit: 'm',
                datum: null,
                provenance: 'published-structured',
                ref: edgeRef,
            });
        } else {
            states.push({
                rule: 'A4',
                status: 'unrecovered',
                reachability: 'derivable',
                // The number is in the carriageway GEOMETRY, reachable and un-read — the `graphic`
                // rung; `derivable` names the remedy (measure it: geometry/streetWidth.ts).
                failure: 'graphic',
                mechanism: 'present',
                stoppedAt:
                    `road ${e.roadId} publishes no width for edge #${e.edgeIndex} — measure the carriageway from ` +
                    'geometry (streetWidth.ts); a class-based width would be an invented number',
                partial: null,
                ref: edgeRef,
            });
        }
    }

    return { edges, frontEdgeCount: front.length, roadAccess: front.length > 0, options: opts, states };
}
