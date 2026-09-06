// §RESI-ORCH-MASSING-SHAPES (lane PL-MASSING-OPTIONS, 2026-09-06) — the ONE adapter between the
// live site stores and the PURE shape engine.
//
// `massingShapeOptions.ts` computes; it reads nothing. This file reads, and computes nothing. The
// split is the point: every scoring decision stays in a function a test can hammer with a thousand
// rings, and every store read stays in one place where a stale frame or a missing snapshot is
// visible at a glance.
//
// ── ⭐ THE PROJECTION FRAME IS THE SITE ORIGIN, NOT THE FETCH CENTRE, AND THAT IS THE WHOLE BUG
//      THIS FILE EXISTS TO NOT COMMIT ─────────────────────────────────────────────────────────
// `NeighbourFootprintSnapshot` carries `fetchLat`/`fetchLon` — the point the GIS view fetched
// context AROUND, which is the map centre and drifts as the user pans. The parcel ring and the
// buildable footprint live in the frame pinned by `getCurrentSiteOrigin()` (C12 §1.5). Projecting
// neighbours about the fetch centre would slide every neighbour by `dist(fetchCentre, siteOrigin)`
// — the §SEAM-2 / L-604 residual-shift defect, re-committed one module downstream, where its only
// symptom would be an overlooking figure that is confidently wrong. `resolveBlindFacades` solved
// exactly this by projecting about the pinned origin; this file does the same thing for the same
// reason, and the store keeps raw lon/lat precisely so it CAN be projected on read.
//
// ── HONESTY: FOUR DISTINCT ANSWERS, NEVER COLLAPSED ─────────────────────────────────────────
//   • no site origin              → `latDeg/lngDeg = null` ⇒ the engine withholds the sun figure.
//   • no snapshot ever captured   → `neighbourSnapshotTaken = false` ⇒ overlooking/outlook `null`.
//   • a captured, EMPTY snapshot  → `neighbourSnapshotTaken = true`, `neighbours = []` ⇒ overlooking
//                                   is a MEASURED zero. "Nobody is there" and "we never looked" are
//                                   different facts (§CONTEXT-DATA-HONESTY) and this is the seam
//                                   where they are most often merged.
//   • a neighbour with no height  → `heightM: null`, carried through, EXCLUDED and COUNTED by the
//                                   engine. Never defaulted to 9 m (§L-8705, L-616).
//
// Reads module-level cells only. No DOM, no THREE, no I/O, no clock, no RNG. Never throws.

import { trace } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';
import { getCurrentSiteOrigin } from './siteDispatch';
import { getNeighbourFootprints } from './neighbourFootprintStore';
import { latLonToSceneXZ } from './boundaryProjection';
import { resolveLiveTargetFootprintProposal } from './targetFootprintAreaState';
import type { MassingNeighbour, MassingSitingContext } from './massingShapeOptions';

const _tracer = trace.getTracer('pryzm.site.massingSitingContext');

/**
 * Assemble the live siting context, or `null` when there is no site frame to project into.
 *
 * ⚠ `null` IS NOT "no neighbours". It means PRYZM has no pinned site origin, so the neighbour rings
 * cannot be put in the same frame as the parcel — and a neighbour in the wrong frame is worse than
 * no neighbour, because it produces a number.
 */
export function resolveLiveMassingSitingContext(): MassingSitingContext | null {
    const span = _tracer.startSpan('pryzm.site.resolveLiveMassingSitingContext');
    try {
        const origin = getCurrentSiteOrigin();
        if (origin === null || (origin.lat === 0 && origin.lon === 0)) {
            // Null Island is the `ensureSite` placeholder, not a site (see `resolveSiteFrameOrigin`).
            span.setAttribute('pryzm.massingSiting.origin', 'unset');
            return null;
        }

        const snapshot = getNeighbourFootprints();
        const neighbours: MassingNeighbour[] = [];
        if (snapshot !== null) {
            for (const fp of snapshot.footprints) {
                if (fp.ring.length < 3) continue;
                const ring: Pt[] = fp.ring.map(([lon, lat]) => {
                    const p = latLonToSceneXZ({ lat, lon }, origin.lat, origin.lon);
                    return { x: p.x, z: p.z };
                });
                neighbours.push({
                    ring,
                    // ⛔ `undefined` on the store becomes `null` here, explicitly. The engine's
                    // contract is that `null` is UNKNOWN and is never substituted; letting an
                    // `undefined` fall through would make the two shapes of "absent" differ by
                    // which module you asked.
                    heightM: typeof fp.heightM === 'number' && fp.heightM > 0 ? fp.heightM : null,
                });
            }
        }

        span.setAttribute('pryzm.massingSiting.neighbours', neighbours.length);
        span.setAttribute(
            'pryzm.massingSiting.neighboursWithHeight',
            neighbours.filter((n) => n.heightM !== null).length,
        );
        span.setAttribute('pryzm.massingSiting.snapshotTaken', snapshot !== null);
        return {
            latDeg: origin.lat,
            lngDeg: origin.lon,
            neighbours,
            neighbourSnapshotTaken: snapshot !== null,
            originLabel: `site origin ${origin.lat.toFixed(4)}, ${origin.lon.toFixed(4)}`,
        };
    } catch (e) {
        // A read that throws returns NOTHING, never a half-populated context: a context missing its
        // neighbours would silently become "no neighbours here", which is the one substitution this
        // module's header forbids.
        console.warn('[site][massing-siting] §RESI-ORCH-MASSING-SHAPES siting read failed (non-fatal):', e);
        span.setAttribute('pryzm.massingSiting.threw', true);
        return null;
    } finally {
        span.end();
    }
}

/**
 * The user's live TARGET GROUND-FLOOR AREA — the founder's *"180 sqm brut in ground floor"* — read
 * from the §5 target-area channel.
 *
 * ⭐ ONE CHANNEL, NOT TWO. The card already has a target-area entry whose accepted value lands in
 * `targetFootprintAreaState`. Minting a second "how big do you want the ground floor" input for the
 * shape families would let the two disagree, and the user would have no way to tell which one the
 * shape on the ground was solved against. So the shapes read the SAME number the plate was solved
 * from, through the SAME staleness gate — a proposal measured against a re-solved footprint is
 * withdrawn here exactly as it is everywhere else.
 *
 * @param permittedAreaM2 the CURRENT permitted footprint, for the staleness gate. `null` ⇒ none.
 */
export function resolveLiveTargetGroundFloorAreaM2(permittedAreaM2: number | null): number | null {
    const live = resolveLiveTargetFootprintProposal(permittedAreaM2);
    if (live === null) return null;
    // ⚠ THE TARGET, NOT THE ACHIEVED AREA. The user asked for 180; the uniform-erosion plate may
    // have landed at 179.4. The shape families are solving the SAME question the user asked, so
    // they solve against what was asked — and each candidate then prints its own achieved figure.
    return Number.isFinite(live.targetAreaM2) && live.targetAreaM2 > 0 ? live.targetAreaM2 : null;
}
