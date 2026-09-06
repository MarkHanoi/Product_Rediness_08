// §LANDUSE-SEA-RECLIP-IN-PLACE (L-12972, founder Sète 2026-09-06: "really slow rendering the 3d
// view once the parcel has been selected — especially since latest deployment").
//
// ⭐ THE FOUNDER NAMED THE WRONG CAUSE AND SO DID THE FIRST TRIAGE. He blamed the trees; the
// triage blamed the relief splitter's arithmetic. Both were measured and both are wrong:
//   · The trees are ONE batched `Primitive` with a hard instance cap (§FORMA-CTX-TREES).
//   · The splitter's own arithmetic is CHEAP. MEASURED 2026-09-06 on a Sète-shaped corpus THREE
//     TIMES the size of the founder's run (43 551 pieces from 3 442 features against his 13 788
//     from 1 342): the whole pure decomposition — seat points, 3–5 relief probes per feature, the
//     split decision, `drapePieceLengthM`, and every Sutherland–Hodgman grid clip — costs
//     **296 ms** end to end. It cannot be 15 s of anything.
//
// WHAT IT ACTUALLY IS, AND IT IS A COASTAL-ONLY DEFECT. `loadContextSea` ends with
//     if (this.contextSeaRingsLonLat.length > 0) void this.loadContextLanduse(lat, lon, true);
// (`CesiumViewport.ts`, §FORMA-CTX-LANDUSE-SEA-CLIP, added L-642 2026-07-29). Its purpose is one
// line of the landuse pass: the `keptAreas` filter that drops any land-use polygon whose centroid
// is inside a sea ring, so the grey does not bleed past the coast. To get that one filter re-run it
// FORCES THE WHOLE LAYER AGAIN — re-fetch, re-decompose, re-sample, `clearContextLanduse()`, and
// rebuild every entity.
//
// That was affordable in July, when a landuse pass was 1 342 flat polygons at ONE scalar height.
// §GROUND-DRAPE-ON-RELIEF (L-12924, 2026-09-05 — "the latest deployment") made a pass on relief
// cost, at Sète, **13 788 pieces from 1 342 areas** plus **two terrain round-trips** that now queue
// behind a FIFO mutex where only one flight may be in the air (§GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME,
// L-12952). The founder's console shows the consequence twice over: the identical piece count
// printed TWICE in one session, and "8 round-trip(s) for 34 caller(s) asking 96828 point(s)".
// Córdoba is inland, has no sea rings, and never enters this path — which is exactly why the
// founder sees it at Sète and not there.
//
// THE FIX IS THE ONE THE BUILDINGS ALREADY USE. §CTX-BUILDINGS-INPLACE-RESEAT (L-635) replaced a
// `loadContextBuildings(force)` RE-FETCH with an in-place edit of the entities already on screen
// ("0/6370 context building(s) lifted … no re-fetch, no race"). The sea re-clip is the same shape:
// its only effect is to REMOVE the pieces of areas that are over water. So it becomes a removal —
// no fetch, no decomposition, no terrain sample, no rebuild of the 13 787 pieces that were never
// in question.
//
// ⛔ IT REMOVES NOTHING THE FULL RE-RUN WOULD HAVE KEPT, AND KEEPS NOTHING IT WOULD HAVE REMOVED.
// `landuseAreaClipCentroid` computes the SAME vertex-mean the `keptAreas` filter computes — the
// plain mean over every stored vertex, closing duplicate included — so the two agree by
// construction, and `contextLanduseSeaClip.spec.ts` pins that against the filter's own source. This
// is not "drop features to buy speed" (the standing prohibition): the surviving drape is
// piece-for-piece what the forced reload would have produced.
//
// Pure: no Cesium, no DOM, no `window`. The viewport executes these verdicts; the tests pin them.
//
// P8: every exported function carries an OpenTelemetry span.
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.context-landuse-sea-clip');

/** GeoJSON order — longitude FIRST — the shape every context loader carries. */
export type LonLat = readonly [number, number];

/**
 * THE centroid the land-use sea clip keys on: the plain mean of every stored ring vertex.
 *
 * ⚠ THIS IS A DELIBERATE COPY OF THE FILTER'S RULE, NOT AN IMPROVEMENT ON IT. It is NOT the
 * area-weighted centroid and NOT `ringCentroidLatLon` (which drops a closing duplicate). It is
 * `cx += p[0] … cx /= area.ring.length` exactly as `loadContextLanduse` writes it, because the
 * whole point is that an in-place clip and a full re-run must reach the SAME verdict for every
 * polygon. A "better" centroid here would silently disagree with the re-run on the polygons
 * nearest the coast — the only ones that matter. `contextLanduseSeaClip.spec.ts` reads the filter
 * out of `CesiumViewport.ts` and asserts the two still agree, so this cannot drift unnoticed.
 *
 * Null for a ring with fewer than 3 vertices or any non-finite coordinate — the filter's own
 * `area.ring.length >= 3` guard, and "unknown" is never silently treated as "not in the sea".
 */
export function landuseAreaClipCentroid(ring: ReadonlyArray<LonLat>): LonLat | null {
    const span = _tracer.startSpan('pryzm.context-landuse-sea-clip.landuseAreaClipCentroid');
    try {
        if (ring.length < 3) return null;
        let cx = 0;
        let cy = 0;
        for (const p of ring) {
            if (!Number.isFinite(p?.[0]) || !Number.isFinite(p?.[1])) return null;
            cx += p[0];
            cy += p[1];
        }
        return [cx / ring.length, cy / ring.length];
    } finally {
        span.end();
    }
}

/**
 * A cheap, order-sensitive signature of the sea rings the drawn land-use was clipped against, so a
 * repeat sea load with the SAME coastline is recognised and costs nothing at all.
 *
 * ⚠ It is a CHANGE DETECTOR, not a hash of the coastline: ring count, each ring's vertex count and
 * its first/last vertex to 6 dp (~0.11 m — the same precision `groundSampleKey` uses). Two genuinely
 * different coastlines that agree on all of those would be missed; the consequence of a miss is a
 * skipped re-clip, which is why the caller ALSO re-clips at the end of every land-use pass rather
 * than trusting this alone. Being wrong in the other direction — reporting a change that did not
 * happen — costs one cheap removal pass and nothing else.
 */
export function seaRingsSignature(rings: ReadonlyArray<ReadonlyArray<LonLat>>): string {
    const span = _tracer.startSpan('pryzm.context-landuse-sea-clip.seaRingsSignature');
    try {
        if (rings.length === 0) return 'sea:0';
        const parts: string[] = [`sea:${rings.length}`];
        for (const r of rings) {
            const a = r[0];
            const b = r[r.length - 1];
            parts.push(
                `${r.length}@${a ? `${a[0].toFixed(6)},${a[1].toFixed(6)}` : '-'}` +
                `:${b ? `${b[0].toFixed(6)},${b[1].toFixed(6)}` : '-'}`,
            );
        }
        return parts.join('|');
    } catch {
        // A malformed ring must never break the drape; report "changed" so the caller re-clips.
        return `sea:unreadable:${Math.random()}`;
    } finally {
        span.end();
    }
}

export interface LanduseSeaClipPlan {
    /** Indices into the input list whose piece must be removed — the polygon is over water. */
    readonly removeIdx: number[];
    /** DISTINCT area centroids tested. THE number this module exists to keep small: 13 788 pieces
     *  of 1 342 areas cost 1 342 point-in-polygon tests, not 13 788. */
    readonly areasTested: number;
    /** Distinct areas that came back inside the sea. */
    readonly areasRemoved: number;
    /** Pieces whose area centroid was never recorded — NOT removed (unknown ≠ in the sea,
     *  §CONTEXT-DATA-HONESTY / C84 EI-6). A non-zero value is itself a finding. */
    readonly unkeyed: number;
}

/**
 * Decide which drawn land-use pieces the freshly-loaded sea removes.
 *
 * `centroids[i]` is the clip centroid of the AREA piece `i` belongs to (many pieces share one area
 * after §GROUND-DRAPE-ON-RELIEF splits it), or null when it was never recorded. `inSea` is the
 * viewport's even-odd ring test (§C73-PIP-CANONICAL) — injected, so this module stays pure and the
 * test can drive it with a known coastline.
 *
 * ⭐ The de-duplication is the whole performance argument: `inSea` walks every sea ring, and Sète's
 * live-coastline supplement is not small. One test per DISTINCT area, memoised on the centroid key,
 * turns 13 788 walks into 1 342.
 *
 * ⛔ A piece with no recorded centroid is KEPT. "I do not know where this area is" and "this area is
 * over the sea" are not the same value, and only one of them may delete something the founder can
 * see (his other standing complaint is that things go MISSING).
 */
export function planLanduseSeaClip(input: {
    readonly centroids: ReadonlyArray<LonLat | null | undefined>;
    readonly inSea: (lon: number, lat: number) => boolean;
}): LanduseSeaClipPlan {
    const span = _tracer.startSpan('pryzm.context-landuse-sea-clip.planLanduseSeaClip');
    try {
        const verdict = new Map<string, boolean>();
        const removeIdx: number[] = [];
        let unkeyed = 0;
        let areasRemoved = 0;
        for (let i = 0; i < input.centroids.length; i++) {
            const c = input.centroids[i];
            if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) { unkeyed++; continue; }
            const key = `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
            let hit = verdict.get(key);
            if (hit === undefined) {
                try { hit = input.inSea(c[0], c[1]); } catch { hit = false; }
                verdict.set(key, hit);
                if (hit) areasRemoved++;
            }
            if (hit) removeIdx.push(i);
        }
        return { removeIdx, areasTested: verdict.size, areasRemoved, unkeyed };
    } finally {
        span.end();
    }
}

export type LanduseReclipAction = 'skip-unchanged' | 'clip-in-place' | 'full-reload' | 'nothing-drawn';

/**
 * WHICH of the three answers the sea's arrival deserves. Named as a pure decision because the
 * expensive one must be reachable ONLY by the case that genuinely needs it.
 *
 *   · `nothing-drawn`   — no land-use entities yet. The pass still to come applies the sea rings in
 *                         its own `keptAreas` filter, so there is nothing to do and NOTHING to force.
 *   · `skip-unchanged`  — the drawn drape was already clipped against exactly these rings.
 *   · `clip-in-place`   — the rings changed and no area has been removed in place yet, so every
 *                         removal this coastline implies is still ahead of us: a removal is enough.
 *   · `full-reload`     — the rings changed AFTER an in-place removal already happened. A removal
 *                         cannot RESTORE a piece, and a shrinking sea must be able to bring the grey
 *                         back, so this one case pays for the full re-run the old code always paid.
 *                         ⛔ Do not "optimise" this branch away: dropping it would make a receding
 *                         coastline permanently eat the land-use behind it, which is the founder's
 *                         MISSING-things complaint traded for his SLOW complaint.
 */
export function decideLanduseReclip(input: {
    readonly drawnPieces: number;
    readonly clippedAgainstSignature: string | null;
    readonly currentSignature: string;
    readonly areasRemovedInPlace: number;
}): LanduseReclipAction {
    const span = _tracer.startSpan('pryzm.context-landuse-sea-clip.decideLanduseReclip');
    try {
        if (input.drawnPieces <= 0) return 'nothing-drawn';
        if (input.clippedAgainstSignature === input.currentSignature) return 'skip-unchanged';
        return input.areasRemovedInPlace > 0 ? 'full-reload' : 'clip-in-place';
    } finally {
        span.end();
    }
}
