// §W2A-ROOF-FORM-HONESTY — ADR-0299 §RECOVERY-MUST-REFUSE applied to roof form.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT THIS TYPE EXISTS TO MAKE IMPOSSIBLE
// ─────────────────────────────────────────────────────────────────────────────
// `produceRoof` used to substitute a DIFFERENT ROOF FORM silently:
//
//   producers/roof.ts:182  mansard whose skirt ring collapsed → built a HIP
//   producers/roof.ts:205  mansard whose top ring collapsed   → reused the skirt
//   producers/roof.ts:153  hip whose ridge ring collapsed     → apex pyramid
//
// and `RoofGeometryBuilder` mirrored all three (:615, :617, :518) plus
// `pitched → flat` at :506/:367/:399/:546/:598/:627. Every one of them returned
// an ordinary `BufferGeometry` with NO log, NO flag and NO hash difference. The
// user asked for a mansard, got a hip, and the result was dimensioned,
// scheduled and quantity-taken-off as authoritative. That is precisely the
// "wrong but plausible enough to be read as a modelling quirk" failure ADR-0299
// was written about, and `SlabFragmentBuilder.refuseNonSimpleRings`
// (§REFUSE-NONSIMPLE-SLAB-RING) is the precedent this file matches.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS REPORTS RATHER THAN THROWS
// ─────────────────────────────────────────────────────────────────────────────
// `produceRoof` is called from `RoofCommitter.onAdd/onUpdate` with NO try/catch
// anywhere in `scene-committer`, so throwing would take down the whole commit
// pass — a crash is not a better answer than a roof. The precedent does the same
// thing: `refuseNonSimpleRings` RETURNS A REASON, it does not throw.
//
// So the refusal is made real by three properties, not by an exception:
//
//   1. It is a DISCRIMINATED UNION. A degraded roof and a faithful roof are not
//      the same value and cannot be confused by a caller that reads the tag
//      (doctrine: failure and emptiness are never the same value).
//   2. It is folded into the GEOMETRY HASH. `RoofCommitter.onUpdate` skips the
//      rebuild when `desc.hash` is unchanged — so without this, a roof that
//      silently degraded could be hash-identical to a faithful one and the skip
//      would conceal the change. It cannot now.
//   3. `canProduceRoofForm` is exported so the layer that can actually REFUSE
//      IN FRONT OF THE USER — a command handler, before it commits — can ask
//      the question BEFORE geometry exists, instead of discovering it after.
//
// PURE: no THREE, no DOM, no I/O, no clock, no RNG.

import type { Roof } from '@pryzm/protocol';
import { offsetPolygon, type Pt2 } from '../../../pure/polygonOffset.js';
import { inradius, ensureCCW, type Pt } from './polygon.js';

export type RoofShape = Roof['shape'];

/**
 * What the producer was asked for, and what it was actually able to build.
 *
 * `kind: 'faithful'` — the requested form was produced.
 * `kind: 'degraded'` — a DIFFERENT form was produced, and `reason` says why.
 *   `degraded` is never silent: it is logged AND folded into the hash.
 */
export type RoofFormResolution =
    | { readonly kind: 'faithful'; readonly shape: RoofShape }
    | {
          readonly kind: 'degraded';
          /** What the user asked for. */
          readonly requested: RoofShape;
          /** What was actually built. NEVER equal to `requested`. */
          readonly produced: RoofShape | 'pyramid';
          /** The geometric fact that made `requested` unbuildable here. */
          readonly reason: string;
      };

/** Stable, hash-safe encoding. `''` for a faithful roof so faithful hashes are
 *  byte-identical to their pre-§W2A values (no cache-wide invalidation). */
export function encodeRoofFormResolution(r: RoofFormResolution): string {
    return r.kind === 'faithful' ? '' : `|DEGRADED:${r.requested}->${r.produced}`;
}

/** The single §DIAG-ROOF line. Emitted once per degraded production, never for a
 *  faithful one (so the log stays a signal rather than noise). */
export function describeRoofFormResolution(r: RoofFormResolution): string | null {
    if (r.kind === 'faithful') return null;
    return (
        `[geometry-kernel] §DIAG-ROOF §W2A-ROOF-FORM-HONESTY requestedShape=${r.requested} ` +
        `producedShape=${r.produced} — the requested form is NOT buildable on this footprint ` +
        `(${r.reason}). The committed geometry is a ${r.produced}, not a ${r.requested}; ` +
        `do NOT read it as an authoritative ${r.requested}.`
    );
}

/**
 * PRE-FLIGHT: can this footprint carry this roof form at all?
 *
 * Exported so a command handler can refuse IN FRONT OF THE USER before
 * committing, rather than the user discovering a different roof afterwards.
 * Same geometry the producer uses, so the two cannot disagree.
 *
 * @returns `null` when the form is buildable, else the reason it is not.
 */
export function canProduceRoofForm(
    boundary: readonly Pt[],
    shape: RoofShape,
    overhang: number,
): string | null {
    if (boundary.length < 3) return 'boundary has fewer than 3 points';
    const ccw = ensureCCW(boundary);
    const eave =
        overhang > 0
            ? offsetPolygon(ccw as Pt2[], overhang).polygon
            : (ccw as Pt2[]);
    const ring = (eave.length >= 3 ? eave : (ccw as Pt2[])) as Pt[];

    if (shape === 'flat' || shape === 'mono' || shape === 'gable') return null;

    const r = inradius(ring);
    if (!(r > 0)) return 'footprint admits no inward offset (zero inradius)';

    if (shape === 'hip') {
        // A hip whose ridge ring collapses to a point is a PYRAMID — a genuine
        // limiting case of a hip, not a different form. So a hip is always
        // buildable; only the ridge shape varies.
        return null;
    }

    // mansard — needs BOTH a skirt ring and a distinct top ring. If the skirt
    // ring cannot be produced there is no mansard here, only a hip wearing its
    // name.
    const skirt = offsetPolygon(ring as Pt2[], -r * 0.4);
    if (skirt.polygon.length < 3 || skirt.degenerate) {
        return `mansard skirt ring at ${(r * 0.4).toFixed(3)}m inward is not producible: ${skirt.reason ?? 'collapsed'}`;
    }
    const top = offsetPolygon(ring as Pt2[], -r);
    if (top.polygon.length < 3 || top.degenerate) {
        return `mansard top ring at ${r.toFixed(3)}m inward is not producible: ${top.reason ?? 'collapsed'}`;
    }
    return null;
}
