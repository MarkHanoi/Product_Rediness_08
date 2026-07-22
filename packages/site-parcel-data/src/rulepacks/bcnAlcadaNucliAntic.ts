// L-591 — PGM **Art. 320.3a**, the *alçada reguladora màxima* table for Barcelona clau **`12`**
// (*Zona de Nucli Antic, Subzona I — substitució de l'edificació antiga*).
//
// ⚠⚠ THE ARTICLE NUMBER. IT IS **320.3a**, AND IT IS NOT 317.
// -----------------------------------------------------------
// The sourcing brief that opened this work carried "believed **Art. 317**, sitting immediately
// before Art. 318". **That is wrong, and the primary text says so twice over:**
//
//   • **Art. 317** is *Estàndards en operacions de reforma interior* — the PERI land-cession
//     percentages and the net dwelling density. It contains no height rule of any kind, in either
//     the metropolitan text (p. 105) or the Barcelona-exclusive text (p. 184).
//   • The height table is introduced by **Art. 320 — *Condicions d'edificació*, apartat 3a
//     *Alçades***: *"l'alçada reguladora màxima i el nombre de plantes es determinen segons
//     l'amplada del vial al qual doni l'edificació d'acord amb el quadre següent"* (p. 106).
//
// Citing 317 for a height would be L-526 repeated: a confident citation to an article that does
// not govern the field. The pack's own test suite pins this.
//
// ⚠⚠ THE TABLE IS **NOT** IN THE BASE 1988 TEXT OF THIS VOLUME — AND THAT MATTERS
// -------------------------------------------------------------------------------
// On p. 106 the sentence *"d'acord amb el quadre següent:"* is followed by **no quadre at all**.
// The re-edition's own text layer carries no numeric table anywhere on that page (verified: 172
// text-showing operators, zero width-band figures, no image XObjects, and no numbered *Taula*
// belongs to it — *Taula 6* is the industrial-category matrix of Art. 288). This is the same
// documented transcription-defect class as Arts. 251.3a / 330 / 331.
//
// ⇒ **Had this pack been built from the base text alone, the height would have had to be `null`.**
// It is not, because a *different and better* source exists for 08019 — and the volume itself
// points at it.
//
// WHERE THE TABLE BELOW ACTUALLY COMES FROM, AND WHY IT IS THE RIGHT ONE FOR 08019
// --------------------------------------------------------------------------------
// **Footnote 46 on Art. 320** (p. 105) reads: *"Veure modificació per al Municipi de Barcelona a
// la pàg. 274."* Page 274 opens:
//
//   *"Modificació de les Normes urbanístiques del Pla General Metropolità per a la modificació de
//    les alçades reguladores en el tipus d'ordenació segons alineació de vial, **al terme
//    municipal de Barcelona**. Aprovada definitivament per la Subcomissió d'Urbanisme del
//    Municipi de Barcelona, en la sessió de 2 de març de 2007. (DOGC núm. 4893 de 29/05/2007)."*
//
// and on p. 275, under *Secció 2a. Zona de nucli antic (12)* → *Art. 320.- Condicions
// d'edificació* → *3a. Alçades*, it prints the **articulat proposat** — the resulting full text of
// the apartat — with the quadre transcribed in `BCN_ALCADA_NUCLI_ANTIC_TABLE` below.
//
// ⇒ There is a complete, unbroken citation chain from the zone article to a Barcelona-specific,
// DOGC-published table. It is not an inference from a neighbouring zone, and it is not the
// metropolitan text applied to a municipality that has overridden it.
//
// ⚠ THE +0,35 m IS NOT A TRANSCRIPTION SLIP — IT IS A MEASUREMENT CHANGE
// ----------------------------------------------------------------------
// The values below sit exactly 0,35 m above the generic PGM ladder (7,55 / 10,60 / 13,65 / 16,70).
// That is deliberate and stated in the same modification: it also rewrites **Art. 239** so the
// *alçada* is measured *"fins a la intersecció amb el pla horitzontal que conté la línia
// d'arrencada de la coberta, o amb el pla superior dels elements resistents en el cas de terrat o
// coberta plana"* — i.e. the last slab's thickness is now INSIDE the regulated height. **The
// building did not grow; the measuring point moved.** Anyone "correcting" these to the 7,55 ladder
// would be mixing one document's numbers with another document's datum.
//
// ⚠ THE BANDS ARE **NOT** 13b's BANDS. Clau 12 breaks at **8 / 12 / 15**; Art. 328 (13b) breaks at
// 8 / 11 / 15. Copying either table onto the other moves a real building by a storey between 11 m
// and 12 m of street width.
//
// ⚠ TWO CLAUSES OF THE 1988 Art. 320.3a ARE **ABSENT** FROM THE 2007 BARCELONA TEXT — see
// `BCN_ART320_CLAUSES_NOT_IN_THE_2007_TEXT`. They are recorded, and they are NOT applied.
//
// CONFIDENCE. `estimated-ruleset`, and nothing here is `certified`. Our copy is the MMAMB
// re-edition of the 1976 NNUU / 1988 *text refós*, manually re-typeset, with documented
// transcription errors elsewhere in the volume (Arts. 251.3a, 330, 331) and — as established
// above — an outright missing table on the very page this article lives on. A re-typeset
// reproduction of a DOGC page is strong evidence and it is not the DOGC.
//
// PURE + deterministic (C58 §1.1): no I/O, no THREE, no DOM, no clock, no RNG.
// Strategic context: C58 §1.1/§1.2/§1.4/§1.7a/§1.11, ADR-0270, ADR-0271, L-526, L-590.

import {
    // §L-586 — the guard is the substitution allowance OR the measurement's own error bar,
    // whichever is larger. Shared with Arts. 327/328 so three articles keying on the SAME
    // *amplada de vial* cannot drift apart on what "too close to a band edge" means.
    effectiveBandEdgeGuard_m,
    type AlcadaBand,
    type AlcadaResolution,
} from './bcnAlcadaReguladora.js';

/**
 * ⚠ **THE ONE PARAMETER OF THIS MODULE THAT NO SOURCE STATES.**
 *
 * The Art. 320.3a bands are published as *"De menys de 8 m"*, *"De 8 m a menys de 12 m"*, *"De 12 m
 * a menys de 15 m"*, *"De 15 m endavant"*.
 *
 * ⚠ NOTE THE DIFFERENCE FROM Arts. 327/328, WHICH IS WHY THIS CONSTANT IS NOT SIMPLY RE-EXPORTED:
 * this table's wording is **already half-open in the ordinance's own words** — *"de 8 m a menys de
 * 12 m"* explicitly excludes 12 and, by the *"de 8 m"* opening, explicitly includes 8. So for the
 * INTERIOR edges (8, 12, 15) the convention is **stated**, not adopted.
 *
 * What remains unstated is only the degenerate reading of the FIRST band (*"de menys de 8 m"*
 * bounds it above but not below) and that is not a decision any parcel can turn on. We therefore
 * record `statedByOrdinance: true` — a rare and welcome case, and it must not be quietly
 * downgraded to match the neighbouring articles' `false`.
 */
export const BCN_ART320_EDGE_CONVENTION = {
    /** `true` ⇒ `[min, max)`, lower-inclusive / upper-exclusive. */
    lowerInclusive: true,
    /**
     * ⚠ TRUE, unlike Arts. 327/328. The 2007 Barcelona text writes the bands as *"de 8 m a menys
     * de 12 m"* — lower-inclusive and upper-exclusive in so many words.
     */
    statedByOrdinance: true,
    why:
        'PGM Art. 320.3a as modified for the municipality of Barcelona (DOGC 4893, 29-05-2007) ' +
        'writes its bands as "de 8 m a menys de 12 m" / "de 12 m a menys de 15 m" / "de 15 m ' +
        'endavant". Lower-inclusive, upper-exclusive is the ORDINANCE\'S OWN wording here, not an ' +
        'adopted convention — which is the difference from Arts. 327 and 328, where the ranges ' +
        'are printed without an inclusive/exclusive rule and the convention had to be adopted.',
} as const;

/**
 * PGM **Art. 320.3a**, clau `12` — as modified for the **municipality of Barcelona** by the
 * Subcomissió d'Urbanisme de Barcelona, 2 March 2007, **DOGC 4893 of 29-05-2007**; reproduced at
 * p. 275 of the MMAMB *Normativa Urbanística Metropolitana* re-edition committed under
 * `docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf`.
 *
 * | Ample de vial | Alçada reguladora màxima | Nombre màxim de plantes |
 * |---|---|---|
 * | De menys de 8 m        | **7,90 m**  | PB i 1 pis  |
 * | De 8 m a menys de 12 m | **11,25 m** | PB i 2 pisos |
 * | De 12 m a menys de 15 m| **14,60 m** | PB i 3 pisos |
 * | De 15 m endavant       | **17,95 m** | PB i 4 pisos |
 *
 * ⚠ FOUR bands, top one open-ended, ceiling PB+4. **Do not extend it.** The equivalent 22a table
 * (Art. 350.c) turned out to have only THREE bands, and Art. 327 has SIX — the band count is a
 * per-article fact and every attempt so far to predict one from another has been wrong (L-590 §3).
 *
 * ⚠ `floorsAboveGround` counts *plantes pis* only — the *planta baixa* is the "PB" and is NOT in
 * this number, matching Arts. 327/328's field and the `AlcadaBand` contract. A consumer wanting a
 * total storey count adds one.
 */
export const BCN_ALCADA_NUCLI_ANTIC_TABLE: ReadonlyArray<AlcadaBand> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 7.9, floorsAboveGround: 1 },
    { minWidth_m: 8, maxWidth_m: 12, height_m: 11.25, floorsAboveGround: 2 },
    { minWidth_m: 12, maxWidth_m: 15, height_m: 14.6, floorsAboveGround: 3 },
    { minWidth_m: 15, maxWidth_m: Infinity, height_m: 17.95, floorsAboveGround: 4 },
]);

/**
 * ⚠⚠ **RECORDED SO THEY ARE NEVER SILENTLY RE-INTRODUCED — AND NOT APPLIED BY ANY CODE PATH.**
 *
 * The 1988 metropolitan Art. 320.3a (p. 106) contains two clauses that the 2007 Barcelona
 * *articulat proposat* (p. 275) does not reproduce. The 2007 document prints the resulting FULL
 * text of the apartat, so an absent clause is a DELETION for 08019, not an omission by us.
 *
 * **1. `narrowFacadeCap` — the narrow-frontage height cap.** 1988: *"Això no obstant, als solars
 * amb una longitud de façana inferior a 6,50 m., l'alçada màxima permesa mai no podrà depassar la
 * de 10,60 metres, corresponent a planta baixa i dos pisos."*
 *
 * ⚠ ITS DIRECTION IS THE DANGEROUS ONE. Dropping a cap RAISES the permitted height on narrow
 * plots — the C58 §1.4 over-statement direction — so this deletion is the one finding in this
 * module that could cost a real building. Three reasons it is nonetheless not applied:
 *   (a) the 2007 text governs 08019 and does not contain it;
 *   (b) its trigger is the parcel's **façade length**, which this resolver is not given and the
 *       envelope path does not currently establish — applying it would require inventing the
 *       input as well as reinstating the rule;
 *   (c) its 10,60 m figure belongs to the PRE-2007 datum (see the module header on the +0,35 m
 *       measurement change), so pasting it into a post-2007 table would mix two datums.
 * ⇒ If façade length ever becomes available, this is a re-open, not a re-derive: the question to
 * answer first is whether the 2007 modification deleted the cap or merely did not restate it.
 *
 * **2. `readjustmentAllowance` — the ±10 % integration readjustment.** 1988: *"es permetrà
 * reajustar el valor d'aquella fins a un màxim del 10 per 100 per tal d'aconseguir una millor
 * integració de l'edifici…"*. The 2007 text stops at *"…s'hauran de respectar conjuntament."*
 * ⇒ Not applied, and it never could have been: it is a discretionary planning allowance granted
 * case by case, not an entitlement PRYZM may extrude (C58 §1.11).
 */
export const BCN_ART320_CLAUSES_NOT_IN_THE_2007_TEXT = Object.freeze({
    /** 1988 Art. 320.3a: façana < 6,50 m ⇒ ARM ≤ 10,60 m (PB+2). NOT APPLIED — see the doc above. */
    narrowFacadeCap: Object.freeze({
        facadeLengthBelow_m: 6.5,
        cappedHeight_m: 10.6,
        cappedFloorsAboveGround: 2,
        sourceText: '1988 metropolitan Art. 320.3a, p. 106',
    }),
    /** 1988 Art. 320.3a: up to +10 % on the ARM for integration. NOT APPLIED — discretionary. */
    readjustmentAllowanceFraction: 0.1,
} as const);

/**
 * Resolve the *alçada reguladora màxima* for a clau `12` parcel from an *amplada de vial*.
 *
 * PURE, deterministic, never throws. Returns `ok: false` rather than a number whenever the input
 * cannot legitimately decide the answer — the same asymmetry Arts. 327/328 apply, for the same
 * reason: an absent height costs a flat study volume; a wrong one costs a wrong building.
 *
 * ⚠ THE BAND-EDGE GUARD MATTERS MORE HERE THAN ANYWHERE ELSE WE HAVE ENCODED. The *nucli antic*
 * is the medieval fabric: its streets are the narrowest in the city, so a large share of them sit
 * near the 8 m edge — the one edge that decides between PB+1 and PB+2, i.e. between a two- and a
 * three-storey building. Refusing near it is not caution, it is the only defensible answer.
 *
 * @param amplada_m  the street width in metres. **Pass the OFFICIAL width when you have one.**
 * @param opts.trustedOfficialWidth  TRUE only when `amplada_m` came from the planning street
 *   database (the *ample oficial*), never from measuring geometry. An official width is exact by
 *   definition, so it may sit ON a band edge legitimately — at which point
 *   `BCN_ART320_EDGE_CONVENTION` decides, and for THIS article that convention is the ordinance's
 *   own wording rather than an adopted one.
 * @param opts.measurementSpread_m  §L-586 — `StreetWidthMeasurement.spread_m`. Widens the guard;
 *   never narrows it.
 */
export function resolveAlcadaNucliAntic(
    amplada_m: number,
    opts: {
        readonly trustedOfficialWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): AlcadaResolution {
    if (typeof amplada_m !== 'number' || !Number.isFinite(amplada_m) || amplada_m <= 0) {
        return { ok: false, reason: 'bad-input', straddles: [] };
    }

    const bandFor = (w: number): AlcadaBand =>
        BCN_ALCADA_NUCLI_ANTIC_TABLE.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
        BCN_ALCADA_NUCLI_ANTIC_TABLE[BCN_ALCADA_NUCLI_ANTIC_TABLE.length - 1]!;

    if (!opts.trustedOfficialWidth) {
        // Would nudging the measured width by the guard change the storey band? If so, the
        // measurement is not what decided the answer — the noise is — and we must not answer.
        const guard = effectiveBandEdgeGuard_m(opts.measurementSpread_m);
        const low = bandFor(Math.max(0.000001, amplada_m - guard));
        const high = bandFor(amplada_m + guard);
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
        // NULL, and deliberately. The Art. 21 cornice increment belongs to Barcelona's *Ordenança
        // de Rehabilitació i Millora de l'**Eixample*** (2002). The nucli antic is not the
        // Eixample — it is, definitionally, the fabric the Eixample was built OUTSIDE. Carrying
        // that allowance here would cite a document that does not govern this land.
        corniceIncrementMax_m: null,
    };
}
