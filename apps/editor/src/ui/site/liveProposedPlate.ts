// §MASSING-ON-THE-SITE-VIEWS (lane DRAW-ON-VIEWS, 2026-09-07 · L-13022 · STR §26.6.3) — THE ONE
// RESOLVER of *"which massing candidate is live right now"*, for every surface that draws it.
//
// Founder: the massing option he picks must render, ONE AT A TIME, on the view he is on.
//
// ── THE MEASURED GAP THIS CLOSES ────────────────────────────────────────────────────────────
// The candidate plate drew in exactly ONE scene. `grep -c targetFootprintAreaState` returned **0**
// in both `CesiumViewport.ts` and `SiteBoundaryMap2D.ts`: the picked option landed in the session
// slot, `ParcelBoundarySceneRenderer` drew it on the plan/BIM scene, and the two SITE views — the
// ones the founder is actually looking at when he compares options — drew nothing at all. The
// mechanism was complete; two of its three consumers did not exist. [[authored-but-unwired-is-the-
// bottleneck]]: audit REACHABILITY, not existence.
//
// ── ⭐ "ONE MASSING AT A TIME" IS BY CONSTRUCTION, NOT BY A SECOND RULE ──────────────────────
// `targetFootprintAreaState` holds ONE slot. Picking an option calls `setTargetFootprintProposal`,
// which REPLACES it. Every surface reads that one slot through this one function, so "only one
// candidate renders" is a property of the data, not a rule three renderers each have to remember
// — and there is nowhere for a second, stale plate to live. ⛔ Do NOT add a second slot, a
// per-view override, or a renderer-local cache of the last proposal: any of the three re-opens the
// exact failure this file was written to make impossible.
//
// ── WHY THE PERMITTED AREA IS DERIVED HERE AND NOT THREE TIMES ──────────────────────────────
// `resolveLiveTargetFootprintProposal` needs the CURRENT permitted footprint area to run its
// staleness gate — a plate solved inside a 92 m² permitted footprint is not a proposal about a
// re-solved 61 m² one, and drawing it anyway is a picture of a claim that has been withdrawn
// (§VERIFICATION-ARTIFACT-CAN-PREDATE-SUBJECT, in geometry). That area is
// `insetAreaM2 || shoelace(insetPolygon)` — the envelope's own field preferred, so the renderers
// and the card compare the SAME number. Three copies of that expression would be three chances for
// one surface to keep drawing a plate the other two have already withdrawn, on a float difference.
// One copy, here.
//
// ⚠ THE GATE IS SELF-HEALING ON READ AND THAT IS DELIBERATE. `resolveLiveTargetFootprintProposal`
// CLEARS the slot when it finds it stale, so calling this from three surfaces is idempotent: the
// first read to notice the envelope moved withdraws the plate for all of them, through the same
// notification every subscriber already holds.
//
// PURE except for the two module reads it delegates to. No DOM, no THREE, no Cesium, no I/O.

import { trace } from '@opentelemetry/api';
import { getLastBuildableEnvelope } from './siteDispatch';
import { resolveLiveTargetFootprintProposal } from './targetFootprintAreaState';
import type { TargetFootprintProposal } from './targetFootprintAreaSolver';

const _tracer = trace.getTracer('pryzm.site.liveProposedPlate');

/** A point on the scene ground plane, metres. Matches C19 `Pt`. */
interface PlatePoint {
    readonly x: number;
    readonly z: number;
}

/**
 * Shoelace area (m²) of a scene-XZ ring, sign-independent.
 *
 * ⚠ USED FOR EXACTLY ONE THING: the staleness read below, and only as the FALLBACK when the
 * envelope carries no `insetAreaM2`. It is deliberately NOT a general measurement helper — the
 * card's `permittedStudyFigures` is the ONE producer of the footprint figure the user SEES
 * (C06 §13.3), and a second general-purpose area function is how two surfaces start disagreeing
 * about a number the reader can compare on screen.
 */
function ringAreaM2XZ(ring: ReadonlyArray<PlatePoint>): number {
    if (ring.length < 3) return 0;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twice) / 2;
}

/**
 * The CURRENT permitted buildable footprint area (m²), or `null` when there is no solved envelope.
 *
 * ⛔ `null` IS NOT `0`. Zero would tell the staleness gate that the permitted footprint had shrunk
 * to nothing — a determination — where the truth is that no determination exists. The gate treats
 * the two differently and must be allowed to.
 */
export function currentPermittedFootprintAreaM2(): number | null {
    const env = getLastBuildableEnvelope();
    if (!env) return null;
    const ring = (env.insetPolygon ?? []) as ReadonlyArray<PlatePoint>;
    // `||` rather than `??` on purpose: a recorded `0` is not a usable area either, and the
    // shoelace of the ring the envelope actually carries is the better answer in that case.
    return env.insetAreaM2 || ringAreaM2XZ(ring);
}

/**
 * ⭐ THE ONE READ every surface that draws the massing candidate asks, and the ONLY one they may.
 *
 * Returns the live proposal, or `null` when the user has proposed nothing OR the proposal has gone
 * stale against a re-solved envelope. A surface that receives `null` must draw NOTHING and must
 * take down anything it drew for a previous proposal — a plate left standing after the slot
 * cleared is the stale claim this whole path exists to withdraw.
 *
 * ⛔ NEVER call `getTargetFootprintProposal()` from a renderer. That read skips the staleness gate,
 * and the surface that skips it is the one that keeps drawing a withdrawn massing while its
 * neighbours have already stopped — a disagreement the user reads as a bug in whichever view they
 * happen to trust less.
 */
export function resolveLiveProposedPlate(): TargetFootprintProposal | null {
    const span = _tracer.startSpan('pryzm.site.resolveLiveProposedPlate');
    try {
        const live = resolveLiveTargetFootprintProposal(currentPermittedFootprintAreaM2());
        span.setAttribute('pryzm.proposedPlate.present', live !== null);
        if (live !== null) {
            span.setAttribute('pryzm.proposedPlate.achievedAreaM2', live.achievedAreaM2);
            span.setAttribute('pryzm.proposedPlate.corners', live.ring.length);
        }
        // A ring under three vertices is not a plate. Withheld here rather than in each renderer,
        // so no surface has to remember the check.
        return live !== null && live.ring.length >= 3 ? live : null;
    } catch (e) {
        // ⛔ A READ THAT THROWS DRAWS NOTHING. Returning a partially-resolved plate would put a
        // shape on the ground that no gate had passed.
        console.warn('[site][proposed-plate] §MASSING-ON-THE-SITE-VIEWS resolve failed (non-fatal):', e);
        return null;
    } finally {
        span.end();
    }
}
