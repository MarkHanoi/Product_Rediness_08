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
import { BCN_ENSANCHE_ZONE_CODES, BCN_ORDINANCE_REF } from './esBarcelonaEnsanche.js';
import {
    BCN_SEMIINTENSIVA_ZONE_CODES,
    BCN_13B_ORDINANCE_REF,
} from './esBarcelonaSemiintensiva.js';

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
    return null;
}
