// L-583 — WHICH *alçada reguladora* ARTICLE GOVERNS THIS CLAU? One question, answered in the data
// layer.
//
// THE DEFECT THIS EXISTS TO PREVENT, and it is not hypothetical
// -------------------------------------------------------------
// The L5 dispatcher (`apps/editor/src/ui/site/siteDispatch.ts`) constructed the height by calling
// `resolveAlcadaReguladora` — the **Art. 327** table — and stamping the literal string
// `"PGM Art. 327.2 alçada reguladora"` into the derivation row. That was correct while the only
// packed claus were `13a`/`13E`. **The moment `13b` is registered, that same line would give a
// 13b parcel Art. 327's numbers under Art. 327's citation** — a wrong height, published with a
// confident citation to an article that does not govern that land. Art. 327 is Subzona I; Subzona
// II is Art. 328, four bands instead of six, topping out at PB+4 instead of PB+6.
//
// Registering a pack without this module would therefore have been strictly WORSE than the honest
// coverage-gap refusal it replaces: a refusal costs an absent envelope, a mis-cited height costs
// credibility (C58 §1.4, L-526).
//
// WHY IT LIVES HERE AND NOT IN THE EDITOR (C58 §1.5, and the same argument as `registry.ts`)
// ------------------------------------------------------------------------------------------
// "Which article gives the height for clau X" is JURISDICTION KNOWLEDGE. The registry already
// moved "which pack answers for clau X" out of L5 for exactly this reason; the height article is
// the same kind of fact and belongs beside it. Adding the next clau's height table becomes a data
// addition in this package, never an edit to an L5 file.
//
// ⚠ IT RETURNS `null` FOR AN UNKNOWN CLAU, AND THAT IS THE POINT. A packed zone whose height
// article we have not encoded must produce NO height — not a neighbouring zone's table. The
// caller then omits the height row honestly, which is the behaviour every 13a parcel already has
// whenever no street width can be established.
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.1/§1.4/§1.5/§1.11, L-525a, L-526,
// L-552, L-583 §2 + §4.

import { resolveAlcadaReguladora, type AlcadaResolution } from './bcnAlcadaReguladora.js';
import { resolveAlcadaSemiintensiva } from './bcnAlcadaSemiintensiva.js';
import { resolveAlcadaIndustrial, type PlaParcialRegime } from './bcnAlcadaIndustrial.js';
import { BCN_ENSANCHE_ZONE_CODES, BCN_ORDINANCE_REF } from './esBarcelonaEnsanche.js';
import {
    BCN_SEMIINTENSIVA_ZONE_CODES,
    BCN_13B_ORDINANCE_REF,
} from './esBarcelonaSemiintensiva.js';
import { BCN_INDUSTRIAL_ZONE_CODES, BCN_22A_ORDINANCE_REF } from './esBarcelonaIndustrial.js';

/** The answer, with the citation that belongs to it — the two must never be assembled separately. */
export interface ZonedAlcadaResolution {
    /** The resolution from THIS zone's own table (may itself be a refusal). */
    readonly resolution: AlcadaResolution;
    /** The governing article, e.g. `'Art. 327.2'` / `'Art. 328'`. Shown in the derivation row. */
    readonly article: string;
    /** That zone pack's full ordinance citation. */
    readonly ordinanceRef: string;
}

/**
 * Resolve the *alçada reguladora màxima* for a Barcelona clau from an *amplada de vial*.
 *
 * Returns `null` when PRYZM has encoded no height article for that clau — the caller must then
 * publish NO height. It must never substitute another zone's table.
 *
 * @param zoneCode   the municipal clau (`'13a'`, `'13E'`, `'13b'`, …).
 * @param amplada_m  the street width in metres.
 * @param opts.trustedOfficialWidth  TRUE only for an *ample oficial* from the planning street
 *   database — see each resolver on why a measured width is refused near a band edge.
 */
export function resolveBcnAlcadaForZone(
    zoneCode: string,
    amplada_m: number,
    opts: {
        readonly trustedOfficialWidth?: boolean;
        /**
         * §L-586 — the measurement's own error bar (`ResolvedAmplada.measurementSpread_m`).
         * Widens the band-edge guard when it exceeds the 0.5 m substitution allowance; never
         * narrows it. Honoured identically by Art. 327 and Art. 328.
         */
        readonly measurementSpread_m?: number | null;
        /**
         * §L-590 — clau `22a` ONLY. Which regime of PGM Art. 350 governs this parcel?
         *
         * Art. 350.2's height table applies solely to industrial land *mancada de Pla Parcial*;
         * land with a definitively-approved Pla Parcial falls under Art. 350.1, whose height comes
         * from that plan's own plànols/ordenances. Defaults to `'unknown'` ⇒ the 22a branch
         * refuses. **There is deliberately no permissive default**: "we found no Pla Parcial" and
         * "no Pla Parcial exists" are the same absence of data and must not become the same
         * ordinance claim.
         *
         * Ignored by the 13a/13E and 13b branches — Arts. 327/328 have no such gate.
         */
        readonly planParcialRegime?: PlaParcialRegime;
    } = {},
): ZonedAlcadaResolution | null {
    if ((BCN_ENSANCHE_ZONE_CODES as readonly string[]).includes(zoneCode)) {
        return {
            resolution: resolveAlcadaReguladora(amplada_m, opts),
            // Subzona I. The `.2` is the height clause within the article (L-526).
            article: 'Art. 327.2',
            ordinanceRef: BCN_ORDINANCE_REF,
        };
    }
    if ((BCN_SEMIINTENSIVA_ZONE_CODES as readonly string[]).includes(zoneCode)) {
        return {
            resolution: resolveAlcadaSemiintensiva(amplada_m, opts),
            // Subzona II. No sub-clause number is cited because the retrieved material does not
            // establish one — Art. 328 is what the source names, and inventing "328.2" by analogy
            // with 327.2 would be a fabricated precision (L-526).
            article: 'Art. 328',
            ordinanceRef: BCN_13B_ORDINANCE_REF,
        };
    }
    // §L-590 — clau 22a (*zona industrial*). THE POINT OF THIS BRANCH: without it, the day 22a is
    // registered it would fall through to `null` (no height — survivable) or, worse, be "fixed" by
    // someone adding it to one of the branches above, which is the Art. 327-for-13b defect this
    // whole module exists to prevent. Art. 350.2.c is THREE bands (9 / 13 / 17 m, PB+1…PB+3) with
    // an open-ended top; Art. 327 is six and Art. 328 is four, and none of the three tables shares
    // a single figure with another.
    if ((BCN_INDUSTRIAL_ZONE_CODES as readonly string[]).includes(zoneCode)) {
        return {
            resolution: resolveAlcadaIndustrial(amplada_m, {
                trustedOfficialWidth: opts.trustedOfficialWidth,
                measurementSpread_m: opts.measurementSpread_m,
                planParcialRegime: opts.planParcialRegime,
            }),
            // The SUB-CLAUSE is cited because the source states it: the table is lettered `c`
            // inside paragraph 2 of Art. 350, and paragraph 1 states a different rule for
            // different parcels. "Art. 350" alone would be uncheckable; "Art. 350.2.c" is exactly
            // what a reader can turn to on p. 116.
            article: 'Art. 350.2.c',
            ordinanceRef: BCN_22A_ORDINANCE_REF,
        };
    }
    return null;
}
