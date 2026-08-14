// ADR-0271 P4b — Spain (Catastro) adapter for the *manzana* (BLOCK) parcels.
//
// WHY THIS EXISTS. `computeBuildableEnvelope` refuses a `block-derived-alignment` zone without a
// block ring, because PGM Art. 242.2 derives the *profunditat edificable* FROM the block rather
// than stating it. This is the client half of the source: a thin fetch+parse of the same-origin
// proxy (`server/parcelZoningProxy.js` → `/api/catastro/block`), which owns the two keyless
// upstream calls and the manzana filter.
//
// HOW THE BLOCK IS IDENTIFIED, and both facts were established against LIVE responses rather
// than documentation — the distinction matters, because the first version of this route was
// written from docs and could never have worked:
//   • BBOX `GetFeature` on `cp:CadastralParcel` DOES return features (21 for a Passeig de Gràcia
//     bbox), contradicting this repo's own scoping note that the WFS is ID-keyed with no BBOX.
//   • The refcat encodes the manzana in its FIRST 5 CHARACTERS — one bbox split cleanly into
//     `02297` (13 parcels) and `03286` (8), two real adjacent Eixample blocks.
// Verified end to end for the pilot parcel: manzana `02297`, 23 parcels, ~14,090 m² — which is
// its own sanity check, a Cerdà manzana being nominally 113 × 113 ≈ 12,769 m².
//
// PURE (no THREE / Cesium / DOM). Resolves to `null` on any failure and NEVER throws, mirroring
// `CatastroParcelProvider` and C57 §1.5. **On this path a null costs an ABSENT envelope, while a
// wrong block ring costs a WRONG *profunditat edificable* — so refusing is always the correct
// failure.** That asymmetry is the whole design.

import { trace } from '@opentelemetry/api';
import type { LatLon } from '../boundaryProjection.js';

const _tracer = trace.getTracer('pryzm.parcel');

/** The same-origin proxy route. Env-overridable, mirroring the parcel provider. */
export const CATASTRO_BLOCK_ENDPOINT =
    (import.meta.env.VITE_CATASTRO_BLOCK_ENDPOINT as string | undefined) ??
    '/api/catastro/block';

/** One parcel of the block, as the proxy returns it. */
export interface BlockParcel {
    readonly refcat: string;
    /** Closed WGS84 ring (lat/lon), already normalised from GML by the proxy. */
    readonly ring: ReadonlyArray<LatLon>;
    readonly areaM2: number;
}

/**
 * §STREET-WIDTH-NEIGHBOURS (L-537) — a parcel of a DIFFERENT manzana lying within 100 m of this
 * block, i.e. a candidate frontage across a street. No area: it is only ever ray-hit, never measured.
 */
export interface NeighbourParcel {
    readonly refcat: string;
    readonly ring: ReadonlyArray<LatLon>;
}

export interface BlockFeature {
    /** The 5-char manzana code the siblings were filtered by. */
    readonly manzana: string;
    readonly parcels: ReadonlyArray<BlockParcel>;
    /** Total cadastral area (m²) — a cheap plausibility read: a Cerdà block is ~13–14,000 m². */
    readonly totalAreaM2: number;
    /**
     * §STREET-WIDTH-NEIGHBOURS — surrounding blocks' parcels, for the *amplada de vial*
     * measurement (L-537). Empty is NORMAL and non-fatal: it costs a street width, therefore a
     * height, and the caller falls back to no constructed height — never to a guessed one.
     *
     * §GR-10/GR-14 — `null` vs `[]` ARE DIFFERENT FACTS (C78 §1.4, C71 §4.4):
     *   · `null` — the response carried NO `neighbours` array at all. The question
     *     was never answered: an older proxy, a truncated body, a route that does
     *     not ship the bbox sweep. NOTHING was learned about this block.
     *   · `[]`   — it WAS answered, and no usable neighbouring parcel came back.
     *     A genuine finding: an isolated or edge-of-coverage block.
     * Both still cost the street width, so the OUTCOME is the same refusal — but
     * they have different CAUSES and therefore different fixes, and an operator
     * reading coverage telemetry cannot chase a server gap that is reported as a
     * geographic fact. Empty may only ever mean "zero results".
     */
    readonly neighbours: ReadonlyArray<NeighbourParcel> | null;
    /**
     * How many neighbour rows were DROPPED as unparseable (see the failure-policy
     * note in `parseBlockResponse`). `neighbours: []` with this `> 0` is a THIRD
     * fact again — the server answered, and every row it sent was unusable — which
     * an empty list alone would have reported as "isolated block".
     */
    readonly neighboursDropped: number;
}

function isFiniteNum(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Parse one parcel row. Returns null unless it is fully usable — a partial row is dropped
 *  rather than repaired, because a repaired ring is a fabricated boundary. */
function parseParcel(raw: unknown): BlockParcel | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const refcat = typeof o.refcat === 'string' && o.refcat.length > 0 ? o.refcat : null;
    if (!refcat || !Array.isArray(o.ring)) return null;

    const ring: LatLon[] = [];
    for (const p of o.ring) {
        if (!p || typeof p !== 'object') return null;
        const q = p as Record<string, unknown>;
        if (!isFiniteNum(q.lat) || !isFiniteNum(q.lon)) return null;
        ring.push({ lat: q.lat, lon: q.lon });
    }
    // A ring under 3 points is not a polygon; silently keeping it would reach the dissolve and
    // be reported there as a malformed tiling, hiding the real cause one layer up.
    if (ring.length < 3) return null;

    return { refcat, ring, areaM2: isFiniteNum(o.areaM2) && o.areaM2 > 0 ? o.areaM2 : 0 };
}

/**
 * Parse the proxy's JSON. Exported so a test can pin the shape with no network.
 *
 * ⚠ Returns null for `{ block: null }` in ALL its forms — `_upstreamFailed`, `_tooFewSiblings`,
 * `_shapeUnrecognised`. The caller must not distinguish them to decide whether to RENDER: every
 * one of them means "we do not have a trustworthy block", and only a trustworthy block may
 * produce a depth. The markers exist for diagnostics, not for a fallback branch — inventing one
 * would recreate the empty-vs-failed conflation that cost four deploys in the Overpass path.
 */
export function parseBlockResponse(json: unknown): BlockFeature | null {
    if (!json || typeof json !== 'object') return null;
    const block = (json as Record<string, unknown>).block;
    if (!block || typeof block !== 'object') return null;

    const b = block as Record<string, unknown>;
    const manzana = typeof b.manzana === 'string' && b.manzana.length > 0 ? b.manzana : null;
    if (!manzana || !Array.isArray(b.parcels)) return null;

    const parcels: BlockParcel[] = [];
    for (const raw of b.parcels) {
        const p = parseParcel(raw);
        // ⚠ ONE BAD PARCEL INVALIDATES THE BLOCK. Skipping it would silently shrink the manzana,
        // and a smaller block leaves a smaller interior courtyard, which yields a DEEPER
        // permitted build than the ordinance allows. The failure must not be partial.
        if (!p) return null;
        parcels.push(p);
    }
    // §BLOCK-SINGLETON-MANZANA (L-586) — a 1–2 parcel block is admitted ONLY on the server's
    // explicit `freeStanding: true` verdict, which it reaches by measuring that no other parcel in
    // the bbox touches this one (city blocks are separated by streets). Seven of the 100 manzanas
    // in the live Barcelona sweep are genuine single-parcel blocks — four of them full ~12,000 m²
    // Eixample illes — and the old blanket `< 3` refusal cost every one of them a depth, a width,
    // a height and a real footprint.
    //
    // ⚠ THE DEFAULT IS STILL REFUSAL. Only the literal `true` opens the gate: `false`, `null`,
    // absent, or any other shape all keep the old behaviour, so an older server, a truncated
    // response or a proxy that rewrote the body cannot talk this client into trusting a partial
    // block. The client never re-derives the verdict — it has no bbox to measure against, and a
    // second, weaker implementation of the same test is exactly the parallel code path C58 forbids.
    if (parcels.length < 3 && b.freeStanding !== true) return null;

    // §STREET-WIDTH-NEIGHBOURS (L-537) — DELIBERATELY the opposite failure policy to the block
    // parcels above. A malformed BLOCK parcel invalidates the whole block, because a shrunken
    // manzana yields a deeper permitted build than the ordinance allows. A malformed NEIGHBOUR
    // only removes one candidate opposing frontage: the worst it can do is make a street
    // unmeasurable, and an unmeasurable street produces NO height rather than a wrong one. So one
    // bad neighbour is dropped and the rest are kept.
    //
    // §GR-10/GR-14 — the ABSENT array stays absent. The old body seeded
    // `neighbours = []` and only filled it when `b.neighbours` was an array, so a
    // response that never mentioned neighbours became the positive claim "this
    // block has no neighbouring parcels" — and both consumers then refused with
    // reasons that named a geographic fact for what was a missing answer. `null`
    // is now carried through, and dropped rows are COUNTED rather than silently
    // shortening the list (C78 §1.4).
    let neighbours: NeighbourParcel[] | null = null;
    let neighboursDropped = 0;
    if (Array.isArray(b.neighbours)) {
        neighbours = [];
        for (const raw of b.neighbours) {
            const p = parseParcel(raw);
            if (p) neighbours.push({ refcat: p.refcat, ring: p.ring });
            else neighboursDropped++;
        }
    }

    return {
        manzana,
        parcels,
        totalAreaM2: parcels.reduce((s, p) => s + p.areaM2, 0),
        neighbours,
        neighboursDropped,
    };
}

/**
 * Fetch the block a parcel belongs to. Never throws; resolves to `null` on any doubt.
 *
 * The returned rings are WGS84 and still need projecting into scene-XZ (via the same
 * `buildBoundaryFromLatLonRing` path the parcel boundary uses) before
 * `dissolveParcelsToBlockRing` can consume them — reprojection stays at the edge, per C57 §1.1.
 */
export async function fetchBlockForParcel(
    refcat: string,
    signal?: AbortSignal,
    /**
     * §BLOCK-CENTROID-REUSE (L-533) — the subject parcel's centroid, when the caller already has
     * it. The proxy otherwise spends a WHOLE extra round-trip on a slow government WFS re-fetching
     * this parcel purely to centre its bbox — a number the caller was already handed moments
     * earlier when it resolved the clau. Supplying it halves the route's latency. Optional by
     * design: any caller without a centroid still gets a correct block.
     */
    centroid?: { lat: number; lon: number },
): Promise<BlockFeature | null> {
    if (typeof refcat !== 'string' || refcat.trim() === '') return null;
    const span = _tracer.startSpan('pryzm.parcel.fetchBlock');
    try {
        const centroidQuery =
            centroid && Number.isFinite(centroid.lat) && Number.isFinite(centroid.lon)
                ? `&lat=${encodeURIComponent(String(centroid.lat))}&lon=${encodeURIComponent(String(centroid.lon))}`
                : '';
        const url = `${CATASTRO_BLOCK_ENDPOINT}?refcat=${encodeURIComponent(refcat.trim())}${centroidQuery}`;
        const res = await fetch(url, { signal });
        if (!res.ok) {
            span.setAttribute('result', 'http-error');
            return null;
        }
        const parsed = parseBlockResponse(await res.json());
        span.setAttribute('result', parsed ? 'ok' : 'no-block');
        if (parsed) {
            span.setAttribute('manzana', parsed.manzana);
            span.setAttribute('siblingCount', parsed.parcels.length);
        }
        return parsed;
    } catch {
        // Abort / network / parse — all non-fatal. The site simply has no block, and the engine
        // will decline to produce a depth rather than invent one.
        span.setAttribute('result', 'threw');
        return null;
    } finally {
        span.end();
    }
}
