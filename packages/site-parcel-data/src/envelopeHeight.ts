// §L-590b / ADR-0273 — ATTACH A CONSTRUCTED HEIGHT TO A SOLVED ENVELOPE, TIER-SAFELY.
//
// WHY THIS EXISTS, AND WHY IT IS AT L2 RATHER THAN IN THE EDITOR
// --------------------------------------------------------------
// The Barcelona *alçada reguladora* is a per-street CONSTRUCTION (C58 §1.12): the packs ship
// `maxHeight_m: null` because a scalar would publish one street's answer for a whole zone, and the
// resolved figure is attached AFTER the solve by the caller that measured the *amplada de vial*.
// `apps/editor/src/ui/site/siteDispatch.ts` does that today with an inline object spread:
//
//     { ...envelope, maxHeight_m: h, maxFloors: f, maxVolumeM3: envelope.insetAreaM2 * h, … }
//
// That is exactly right for a single-prism envelope and **silently wrong for a tiered one**, in two
// ways that a spread cannot see:
//
//   1. It would leave `tiers` describing the OLD heights while the top-level fields describe the
//      new one — the disagreement `BuildableEnvelopeSchema`'s principal-tier refinement exists to
//      forbid (C58 §1.7b.2). The envelope would no longer parse as its own type.
//   2. The height belongs to ONE tier. On Art. 350.2 the street-width figure is the Art. 350.2.c
//      height, which governs only inside the block band; the block-interior tier's 5 m comes from
//      Art. 350.2.e and must not move. Overwriting the envelope's height overwrites a claim about
//      the wrong part of the building (C58 §1.11).
//
// A helper HERE — beside the solver, pure and tested — is what keeps that reasoning out of an L5
// UI file. The same argument that moved "which pack answers for clau X" into `registry.ts` and the
// `block-constructed` tier into the engine (§L-572): a rule about the DETERMINATION must not live
// in one of its consumers, because the next consumer will not know it exists.
//
// ⚠ IT DOES NOT DECIDE ANYTHING. It does not choose a height, does not pick which tier, does not
// invent a volume. The caller supplies the resolved height and the id of the tier the governing
// article assigns it to; this function only keeps the envelope internally consistent afterwards.
//
// PURE + deterministic (C58 §1.1/§1.9). Strategic context: ADR-0273, C58 §1.7b/§1.12, §L-590b.

import type { BuildableEnvelope, DerivationEntry, EnvelopeTier } from '@pryzm/schemas';
import { principalTier } from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import { computeFarLimitedHeight, farLimitedHeightCaveat } from './farLimitedHeight.js';

export interface ConstructedHeightPatch {
    /** The resolved height, metres. */
    readonly height_m: number;
    /** Total levels including the ground floor, or null where the table states none. */
    readonly maxFloors: number | null;
    /**
     * Which tier this height governs. **Required for a tiered envelope and ignored for a
     * single-prism one**, because on a tiered envelope "the height" is not a property of the
     * envelope at all — it is a property of one tier, and guessing which would be the C58 §1.11
     * error. An id that matches no tier leaves the envelope untouched: refusing to attach is the
     * honest failure, since attaching to the wrong tier is undetectable downstream.
     */
    readonly tierId?: string;
    /**
     * The `maxHeight` derivation row the caller built (it alone knows the article, the width tier
     * and the "why" string). Appended verbatim — this function never authors a citation.
     */
    readonly derivationRow?: DerivationEntry;
    /**
     * The parcel ring, so the occupation cap can bind the study volume on a tiered envelope
     * exactly as the engine does (C58 §1.7b.6). Omit and the cap is not applied — which
     * OVER-states, so callers with a `maxCoverage` zone must pass it.
     */
    readonly parcelRing?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
}

/**
 * Return a copy of `envelope` carrying a constructed height. PURE; never throws; returns the input
 * unchanged when the patch cannot be applied honestly.
 *
 * Single-prism envelopes (`tiers: []`) behave exactly as the inline spread did — that equivalence
 * is asserted in the tests, because this helper must not quietly change the shipped 13a/13b answer
 * on its way to serving a zone that is not registered yet.
 */
export function applyConstructedHeight(
    envelope: BuildableEnvelope,
    patch: ConstructedHeightPatch,
): BuildableEnvelope {
    if (envelope.status !== 'ok') return envelope;
    if (!Number.isFinite(patch.height_m) || patch.height_m <= 0) return envelope;

    const derivation = patch.derivationRow
        ? [...envelope.derivation, patch.derivationRow]
        : envelope.derivation;

    // ── Single prism: today's behaviour, PLUS the L-616 FAR cap now that the height exists. ──────
    //
    // §L-619 (BCN 12 OVERSTATES-FAR fix). The engine's L-616 block is SKIPPED for block-derived
    // zones because they ship `maxHeight_m: null` and the *alçada reguladora* arrives here, AFTER the
    // solve. So clau 12's real 1,40 FAR never bound the volume — the matrix's OVERSTATES-FAR verdict.
    // Now that the height is known, recompute `farLimitedHeight_m` with the SAME helper the engine
    // uses. Requires `parcelRing` (the FAR denominator); without it the FAR cap cannot be computed and
    // is left untouched (an honest no-op, never a fabricated number). FAR-null zones (13a/13b) are
    // unaffected — `computeFarLimitedHeight` returns null → the solid == the shell, unchanged.
    if (envelope.tiers.length === 0) {
        const parcelAreaM2 =
            patch.parcelRing && patch.parcelRing.length >= 3 ? polygonArea(patch.parcelRing) : null;
        const far =
            parcelAreaM2 !== null
                ? computeFarLimitedHeight({
                      maxFAR: envelope.maxFAR,
                      parcelAreaM2,
                      footprintAreaM2: envelope.insetAreaM2,
                      maxHeight_m: patch.height_m,
                      maxFloors: patch.maxFloors,
                  })
                : null;
        const farCaveat =
            far && envelope.maxFAR !== null
                ? farLimitedHeightCaveat(far, envelope.maxFAR, patch.height_m)
                : null;
        return {
            ...envelope,
            maxHeight_m: patch.height_m,
            maxFloors: patch.maxFloors,
            // §NEVER-OVERSTATE-B (E2a, 2026-09-01) — the SAME FAR volume cap as the engine's
            // solve-time site (`ZoningRulesEngine.ts` §NEVER-OVERSTATE-B): `footprintArea ×
            // farLimitedHeight_m` IS the FAR-permitted volume, min'd so it can only LOWER
            // (C58 §1.4). Without this, a constructed-height zone with a real FAR (BCN clau 12,
            // FAR 1,40 — the OVERSTATES-FAR verdict in ENVELOPE-REALISM-MATRIX.md) published
            // the full height-shell volume while its render honestly drew the smaller solid.
            maxVolumeM3:
                far && far.binds && far.farLimitedHeight_m !== null
                    ? Math.min(
                          envelope.insetAreaM2 * patch.height_m,
                          envelope.insetAreaM2 * far.farLimitedHeight_m,
                      )
                    : envelope.insetAreaM2 * patch.height_m,
            farLimitedHeight_m: far ? far.farLimitedHeight_m : envelope.farLimitedHeight_m,
            caveats: farCaveat ? [...envelope.caveats, farCaveat] : envelope.caveats,
            derivation,
        };
    }

    // ── Tiered: the height belongs to ONE tier, and everything else follows from that. ────────
    if (!patch.tierId) return envelope;      // see `tierId` — refusing to attach is the honest fail
    if (!envelope.tiers.some((t) => t.id === patch.tierId)) return envelope;

    const tiers: EnvelopeTier[] = envelope.tiers.map((t) =>
        t.id === patch.tierId
            ? { ...t, maxHeight_m: patch.height_m, maxFloors: patch.maxFloors }
            : t,
    );
    // ⚠ RE-SELECTED, NEVER ASSUMED. Attaching a height can CHANGE which tier is principal — that
    // is the whole point of the null-height case (a 5 m block-interior tier leads until the
    // Art. 350.2.c height arrives, then the band tier takes over). Keeping the old principal here
    // would publish the short tier's ring beside the tall tier's height: an over-statement, and
    // one the schema would then reject.
    const principal = principalTier(tiers)!;
    const parcelAreaM2 =
        patch.parcelRing && patch.parcelRing.length >= 3 ? polygonArea(patch.parcelRing) : null;
    const cap =
        envelope.maxCoverage !== null && parcelAreaM2 !== null
            ? envelope.maxCoverage * parcelAreaM2
            : Infinity;
    const effectiveArea = Math.min(principal.areaM2, cap);

    // §L-619 — the L-616 FAR cap on the PRINCIPAL tier, with the same helper. Only meaningful once
    // the principal tier has a height; FAR-null zones return null (unchanged). Denominator is the lot.
    const far =
        parcelAreaM2 !== null && principal.maxHeight_m !== null
            ? computeFarLimitedHeight({
                  maxFAR: envelope.maxFAR,
                  parcelAreaM2,
                  footprintAreaM2: principal.areaM2,
                  maxHeight_m: principal.maxHeight_m,
                  maxFloors: principal.maxFloors,
              })
            : null;
    const farCaveat =
        far && envelope.maxFAR !== null && principal.maxHeight_m !== null
            ? farLimitedHeightCaveat(far, envelope.maxFAR, principal.maxHeight_m)
            : null;

    return {
        ...envelope,
        tiers,
        insetPolygon: principal.polygon,
        insetAreaM2: principal.areaM2,
        maxHeight_m: principal.maxHeight_m,
        maxFloors: principal.maxFloors,
        // §NEVER-OVERSTATE-B (E2a, 2026-09-01) — FAR caps the tiered study volume too, with the
        // same min-only arithmetic as the two sibling sites (this file above; ZoningRulesEngine).
        maxVolumeM3:
            principal.maxHeight_m === null
                ? null
                : far && far.binds && far.farLimitedHeight_m !== null
                  ? Math.min(
                        effectiveArea * principal.maxHeight_m,
                        principal.areaM2 * far.farLimitedHeight_m,
                    )
                  : effectiveArea * principal.maxHeight_m,
        farLimitedHeight_m: far ? far.farLimitedHeight_m : envelope.farLimitedHeight_m,
        caveats: farCaveat ? [...envelope.caveats, farCaveat] : envelope.caveats,
        derivation,
    };
}
