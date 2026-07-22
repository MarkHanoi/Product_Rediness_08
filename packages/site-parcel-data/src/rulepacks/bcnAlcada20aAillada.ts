// L-591 — PGM **Art. 342.5**, Barcelona-exclusive text: the *amplada de vial* ladder for `20a`
// **subzona V (clau `20a/8`)**, and ONLY for subzona V.
//
// ⚠⚠ THE SCOPE QUESTION THE BRIEF ASKED, ANSWERED FROM THE TEXT — AND THE ANSWER IS "V ONLY"
// -------------------------------------------------------------------------------------------
// The temptation is to read a street-width height table in an *edificació aïllada* zone as the
// zone's height rule. It is not. Art. 342.3 sets the height for the WHOLE plurifamiliar family as
// a flat **9,15 m / PB+2**, then names its exceptions in the same sentence:
//
//     "L'alçada màxima autoritzada i el nombre límit de plantes s'estableix en 9,15 m. i en
//      planta baixa més dues plantes pis, **excepte per a la subzona IV, tipus b (20a/9b) i la
//      subzona V (20a/8)**, els valors de les quals són els que s'estableixen a continuació."
//
// IVb's exception is a second SCALAR (15,25 m / PB+4, Art. 342.3). V's exception is Art. 342.5's
// TABLE. No other subzone is named, and **Art. 343 — the unifamiliar article — contains no width
// table at all**: its own Art. 343.2 table gives 9,15 m / PB+2 flat for VI, VII, VIII and IX.
//
// ⇒ Generalising this ladder to any other `20a` clau would put a 16,70 m building on land the
// ordinance caps at 9,15 m. That is the L-526 failure class — a real number, correctly
// transcribed, cited to an article that does not govern the parcel.
//
// WHY BARCELONA'S COPY AND NOT THE BASE PGM'S
// -------------------------------------------
// Base PGM Art. 342.5 (printed p. 112) has THREE columns: amplada · alçada · plantes. Barcelona's
// Art. 342.5 (printed p. 179, Taula 10; repeated printed p. 186, Taula 11) has **FOUR** — it adds
// an **edificabilitat** column, and states the consequence in prose:
//
//     "L'edificabilitat màxima que es podrà materialitzar en aquesta subzona ve condicionada per
//      l'amplada del vial a què dóna front la parcel·la, variant des de l'índex net d'1,50 m²
//      sostre/m² sòl per als vials d'amplada igual o superior a 15 m., fins al de 0,60 m²
//      sostre/m² sòl per als vials de menys de 8 m. d'amplada, tot això en funció de l'ocupació
//      màxima 30 per 100 i del nombre límit de plantes admissible segons l'amplada del vial."
//
// So in `20a/8` the Art. 340.1 headline of 1,50 is the TOP OF A LADDER, reachable only from a
// vial ≥ 15 m. Shipping 1,50 as the subzone's FAR would over-state a narrow-street parcel by up to
// **2,5×**. The height and the index come off the SAME ROW and this module returns them together
// — they must never be assembled from separate lookups.
//
// THE BAND-EDGE GUARD IS REUSED, NOT RE-DERIVED
// ---------------------------------------------
// Identical reasoning to Arts. 327/328 (`bcnAlcadaReguladora.ts`, `bcnAlcadaSemiintensiva.ts`):
// the input is a decimetric measurement standing in for a declared *ample oficial*, and a width
// within the guard of a band edge means the NOISE, not the measurement, is choosing the storey
// band. ⚠ It matters MORE here than for 13a/13b, because in `20a/8` a band crossing moves TWO
// numbers at once — 3,05 m of height AND 0,30 of edificabilitat.
//
// PURE + deterministic (C58 §1.1): no I/O, no clock, no RNG, no THREE, no DOM.
// Strategic context: C58 §1.1/§1.2/§1.4/§1.11, ADR-0271, L-590, L-591.

import {
    effectiveBandEdgeGuard_m,
    type AlcadaBand,
    type AlcadaResolution,
} from './bcnAlcadaReguladora.js';

/** The clau this module — and only this clau — answers for. */
export const BCN_20A_V_CLAU = '20a/8';

/**
 * One row of Barcelona's Art. 342.5 table. It is `AlcadaBand` plus the column Barcelona added.
 *
 * ⚠ `edificabilitatNeta` LIVES ON THE BAND on purpose. Height and index are the same table row;
 * splitting them into two lookups is how a parcel ends up with a 16,70 m height under a 0,60
 * index, or the reverse.
 */
export interface Bcn20aVBand extends AlcadaBand {
    /** *Edificabilitat* for this width band, m² sostre / m² sòl (Barcelona Taula 10/11). */
    readonly edificabilitatNeta: number;
}

/**
 * ⚠ **NO SOURCE STATES THE INCLUSIVE/EXCLUSIVE RULE AT THE BAND EDGES**, exactly as for Arts. 327
 * and 328. The ordinance writes "De 8 a menys d'11 m" / "D'11 a menys de 15 m" / "De 15 m o més",
 * which — unlike the 13a/13b sources — actually DOES resolve it: *"a menys d'11"* excludes 11 and
 * *"de 15 m o més"* includes 15. So here the half-open reading is **stated by the ordinance**, not
 * adopted, and this flag records that difference rather than copying 13b's caveat wholesale.
 */
export const BCN_ART342_5_EDGE_CONVENTION = {
    /** `true` ⇒ `[min, max)`, lower-inclusive / upper-exclusive. */
    lowerInclusive: true,
    /** ⚠ TRUE, and this is the one place in the Barcelona packs where it is. */
    statedByOrdinance: true,
    why:
        'Barcelona Art. 342.5 writes the bands as "De menys de 8 m", "De 8 a menys d\'11 m", ' +
        '"D\'11 a menys de 15 m", "De 15 m o més metres". The Catalan "a menys de X" excludes X ' +
        'and "X o més" includes X, so the half-open [min, max) reading is the ORDINANCE\'S, not a ' +
        'convention we adopted. (Contrast BCN_ART328_EDGE_CONVENTION, where it is adopted.)',
} as const;

/**
 * **Barcelona Art. 342.5, Taula 10 (printed p. 179) / Taula 11 (printed p. 186)** — subzona V,
 * clau `20a/8`. Both printings were read; they agree.
 *
 * ⚠ DO NOT "align" these with the Art. 328 table. The HEIGHTS are numerically identical to clau
 * 13b's (7,55 · 10,60 · 13,65 · 16,70) and the band edges are identical too — **that coincidence
 * is a fact about the PGM's 3,05 m storey module, not a shared rule.** They are different
 * articles governing different ordering types (*edificació aïllada* vs *alineació a vial*), and
 * Art. 342.5 carries a fourth column Art. 328 does not have. Importing 13b's table here to "avoid
 * duplication" would mean a future correction to one silently rewrote the other — the precise
 * argument `bcnAlcadaSemiintensiva.ts` makes for staying separate from Art. 327.
 */
export const BCN_ALCADA_20A_V_TABLE: readonly Bcn20aVBand[] = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 7.55, floorsAboveGround: 1, edificabilitatNeta: 0.6 },
    { minWidth_m: 8, maxWidth_m: 11, height_m: 10.6, floorsAboveGround: 2, edificabilitatNeta: 0.9 },
    { minWidth_m: 11, maxWidth_m: 15, height_m: 13.65, floorsAboveGround: 3, edificabilitatNeta: 1.2 },
    {
        minWidth_m: 15,
        maxWidth_m: Infinity,
        height_m: 16.7,
        floorsAboveGround: 4,
        edificabilitatNeta: 1.5,
    },
]);

/** The Art. 342.5 answer: a height resolution, plus the index that came off the SAME row. */
export type Bcn20aVResolution =
    | (Extract<AlcadaResolution, { ok: true }> & {
          readonly band: Bcn20aVBand;
          /** Barcelona Art. 342.5 — the realisable *edificabilitat* for this width band. */
          readonly edificabilitatNeta: number;
      })
    | Extract<AlcadaResolution, { ok: false }>;

function bandFor(w: number): Bcn20aVBand {
    return (
        BCN_ALCADA_20A_V_TABLE.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
        BCN_ALCADA_20A_V_TABLE[BCN_ALCADA_20A_V_TABLE.length - 1]!
    );
}

/**
 * Resolve subzona V's *alçada reguladora* **and** its realisable *edificabilitat* from an
 * *amplada de vial*.
 *
 * PURE, deterministic, never throws. Returns `ok: false` rather than a number whenever the input
 * cannot legitimately decide the row — an absent height costs a study volume, a wrong one costs a
 * wrong building.
 *
 * @param amplada_m  street width in metres. Pass the OFFICIAL width when one exists.
 * @param opts.trustedOfficialWidth  TRUE only for an *ample oficial* from the planning street
 *   database. An official width is exact by definition and may sit on a band edge legitimately,
 *   at which point `BCN_ART342_5_EDGE_CONVENTION` — which here IS the ordinance's own reading —
 *   decides.
 * @param opts.measurementSpread_m  §L-586: the measurement's own error bar. Widens the guard,
 *   never narrows it.
 */
export function resolveAlcada20aSubzonaV(
    amplada_m: number,
    opts: {
        readonly trustedOfficialWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): Bcn20aVResolution {
    if (typeof amplada_m !== 'number' || !Number.isFinite(amplada_m) || amplada_m <= 0) {
        return { ok: false, reason: 'bad-input', straddles: [] };
    }

    if (!opts.trustedOfficialWidth) {
        const guard = effectiveBandEdgeGuard_m(opts.measurementSpread_m);
        const low = bandFor(Math.max(0.000001, amplada_m - guard));
        const high = bandFor(amplada_m + guard);
        // ⚠ Compared on HEIGHT, matching Arts. 327/328 — and it is equivalent to comparing the
        // index, because every row of this table differs in both. Asserted in the tests so a
        // future edit that broke the correspondence would fail rather than silently let a
        // straddling width pick an edificabilitat.
        if (low.height_m !== high.height_m) {
            return { ok: false, reason: 'band-edge', straddles: [low.height_m, high.height_m] };
        }
    }

    const band = bandFor(amplada_m);
    return {
        ok: true,
        height_m: band.height_m,
        floorsAboveGround: band.floorsAboveGround,
        band,
        edificabilitatNeta: band.edificabilitatNeta,
        // NULL, and deliberately. The Art. 21 cornice increment belongs to Barcelona's *Ordenança
        // de Rehabilitació i Millora de l'Eixample* (2002). A `20a/8` parcel is neither the
        // Eixample nor an *alineació a vial* zone, so carrying it across would cite a document
        // that does not govern this land — the same reasoning that nulls it for 13b.
        corniceIncrementMax_m: null,
    };
}
