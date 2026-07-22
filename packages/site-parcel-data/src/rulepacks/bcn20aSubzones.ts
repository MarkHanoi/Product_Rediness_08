// L-591 / ADR-0271 — THE `20a` SUBZONE PARAMETER TABLE (*Zona d'ordenació en edificació aïllada*),
// Barcelona (INE 08019).
//
// ONE table, read ONCE from the primary source, consumed by the pack, by the height resolver and
// by the edificabilitat resolver. There is no second copy of any number in this repository, which
// is the only structural defence against the failure this family of files exists to prevent: the
// same figure transcribed twice and later corrected once.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SOURCE, AND EXACTLY WHICH TEXT WAS READ
// ─────────────────────────────────────────────────────────────────────────────────────────────
// `docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf` — the MMAMB re-edition
// of the *Normativa Urbanística Metropolitana*. Read with COORDINATES (pypdf `visitor_text`,
// grouping on `tm[5]`, sorting on `tm[4]`, splitting the two columns at the x-midpoint); plain
// `extract_text()` interleaves the columns and is what made three prior research rounds declare
// these tables unrecoverable (L-590).
//
// ⚠⚠ **BARCELONA DOES NOT USE THE BASE PGM TEXT OF ARTS. 342 AND 343.** Both articles carry a
// footnote in the base text — footnote 55 on Art. 342 ("Veure modificació per al Municipi de
// Barcelona a la pàg. 179, pàg. 185 i veure gràfic detallat a la pàg. 183") and footnote 56 on
// Art. 343 ("… a la pàg. 181 …"). Printed pages 177–183 carry:
//
//     "**Modificació de les Normes urbanístiques del PGM per a l'ordenació de l'edificació
//       aïllada, de Barcelona.** Aprovada definitivament per Acord de la Subcomissió d'Urbanisme
//       del municipi de Barcelona de 20 d'octubre de 2004 (DOGC núm. 4277 de 10/12/04)"
//
// and every article inside it is headed *"(d'aplicació al municipi de Barcelona exclusivament)"*.
// Printed pages 184–188 carry a SECOND, separate Barcelona modification of the same date and DOGC
// — *"…en relació al nombre màxim d'habitatges per parcel·la…"* — which re-states Arts. 336, 341
// and 342 (it does NOT touch Art. 343).
//
// **EVERY NUMBER BELOW IS TRANSCRIBED FROM THE BARCELONA-EXCLUSIVE TEXT**, printed pp. 179–183
// (PDF pp. 180–184), cross-read against its duplicate at printed pp. 185–187 (PDF pp. 186–188)
// where the second modification repeats it. Where the two Barcelona copies and the base PGM text
// agree — which, for the parameter tables, they do throughout — that agreement is recorded in
// `BCN_20A_BARCELONA_DELTAS` rather than assumed.
//
// ⚠ NOTHING HERE IS `certified`. This PDF is a re-edition of the 1988 *text refós*: it was
// manually re-typeset and carries documented transcription errors elsewhere in the same volume
// (Arts. 251.3a, 330, 331). It is a PRIMARY-SOURCE-GRADE reading of a SECONDARY edition. The
// citation string says so.
//
// PURE (C58 §1.1): data only. No I/O, no clock, no RNG, no THREE, no DOM.
// Strategic context: C58 §1.1/§1.2/§1.4/§1.7a/§1.11, ADR-0270, ADR-0271, ADR-0272, L-590.

/** Which half of Art. 338's split a subzone belongs to. The two halves are governed by DIFFERENT
 *  articles — plurifamiliar by Art. 342, unifamiliar by Art. 343 — so this is not a label, it is
 *  what selects the citation. */
export type Bcn20aFamily = 'plurifamiliar' | 'unifamiliar';

/**
 * Separation distances to the parcel boundaries, Art. 342.7 (plurifamiliar) / Art. 343.3
 * (unifamiliar), stated by the ordinance in the order *front – lateral – fons*.
 *
 * ⚠ These map ONTO our `setback` rule exactly — front/side/rear — and that is the finding
 * recorded in the pack header: `20a` is the first packed Barcelona clau whose ordinance speaks
 * the same geometric language our C58 §2.2 model was built for.
 */
export interface Bcn20aSeparations {
    /** *front* — to the street/vial boundary, metres. */
    readonly front_m: number;
    /** *lateral* — to each side boundary, metres. */
    readonly side_m: number;
    /** *fons* — to the rear boundary, metres. */
    readonly rear_m: number;
    /**
     * *Separació entre edificacions d'una mateixa parcel·la en relació amb les alçades* — the
     * final column of the same table (1 or 1/2 of the taller building's height).
     *
     * ⚠ **RECORDED, NOT APPLIED.** It governs the spacing of two or more SEPARATE buildings on one
     * parcel. PRYZM solves a single buildable envelope, so there is no place in the model where
     * this constraint could bind, and pretending otherwise would be worse than omitting it. See
     * `BCN_20A_UNMODELLED_RULES`.
     */
    readonly interBuildingHeightRatio: number;
}

/** Auxiliary constructions — Art. 342.9 / Art. 343.2 final columns. */
export interface Bcn20aAuxiliary {
    /** Max height of an auxiliary construction, metres. `null` ⇒ *"no s'admet"*. */
    readonly maxHeight_m: number | null;
    /** Max share of the parcel it may occupy, as a fraction. `null` ⇒ *"no s'admet"*. */
    readonly maxOccupation: number | null;
}

/** One `20a` subzone, as the ordinance states it. */
export interface Bcn20aSubzone {
    /** The MUC clau, e.g. `'20a/9u'`. This is what `ZoningRecord.zoneCode` carries. */
    readonly clau: string;
    /** The ordinance's own Roman numeral (Art. 338.2), e.g. `'IVb'`. */
    readonly subzone: string;
    readonly family: Bcn20aFamily;

    /**
     * **Art. 340.1** — *índex d'edificabilitat NETA*, m² sostre / m² sòl.
     *
     * ⚠ For `20a/8` this is the ordinance's headline figure and it is NOT the operative one: the
     * Barcelona Art. 342.5 table makes the realisable index a function of the *amplada de vial*
     * (0,60 → 1,50). For `20a/9u` Art. 340.2 makes it a function of the parcel area (1,00 → 0,75).
     * Both are flagged by `edificabilitatIsConstructed` and both resolve elsewhere — this field is
     * the ARTICLE 340 VALUE, never "the answer for this parcel".
     */
    readonly edificabilitatNeta: number;

    /**
     * `true` when Art. 340.1's figure is not directly usable per-parcel because a later article
     * turns it into a construction. The pack ships `plotRatioFAR: null` for these — a scalar there
     * would publish one street's (or one parcel size's) answer for the whole subzone.
     */
    readonly edificabilitatIsConstructed: boolean;

    /** **Art. 342.1 / Art. 343.1** — *superfície mínima de parcel·la*, m². */
    readonly minParcel_m2: number;
    /** **Art. 342.1 / Art. 343.1** — *longitud mínima de façana*, m. */
    readonly minFacade_m: number;

    /**
     * **Art. 342.2 / Art. 343.1** — *ocupació màxima de parcel·la*, as a fraction (0.40 = 40 %).
     *
     * ⚠ Barcelona **Art. 249.1** defines HOW it is measured: the orthogonal projection onto a
     * horizontal plane of the whole volume, above OR below grade, *cossos sortints* included,
     * applied to the portion of the parcel qualified as buildable zone.
     */
    readonly maxCoverage: number;

    /**
     * **Art. 342.3 / Art. 343.2** — *alçada màxima*, m, and *nombre límit de plantes* expressed as
     * PB+N (so `floorsAboveGround` EXCLUDES the ground floor, matching `AlcadaBand`).
     *
     * `null` ⇒ the height is a CONSTRUCTION, not a subzone constant. True for exactly one subzone:
     * V (`20a/8`), whose height varies with the *amplada de vial* (Art. 342.5).
     */
    readonly maxHeight_m: number | null;
    readonly floorsAboveGround: number | null;

    readonly separations: Bcn20aSeparations;
    readonly auxiliary: Bcn20aAuxiliary;
}

/**
 * The ten claus of the `20a` family — **nine numbered subzones** (Art. 338.2: I–V plurifamiliar,
 * VI–IX unifamiliar), with subzona IV splitting into types `a` and `b`, which the MUC publishes as
 * two distinct claus (`20a/9`, `20a/9b`).
 *
 * ⚠ ORDER IS THE ORDINANCE'S, not alphabetical, so a reviewer can read this against pp. 179–183
 * top-to-bottom without re-sorting.
 *
 * ⚠ `20a/6` (subzona I) and `20a/7` (subzona III) were NOT observed in the 1 014-point Barcelona
 * MUC probe (`BARCELONA-COMPLETE-COVERAGE-PLAN.md` §2). They are encoded anyway because the
 * ordinance states them; a clau that never occurs costs nothing, whereas a clau that occurs and is
 * missing costs an envelope. **Absence from the probe is not evidence of absence from the city.**
 */
export const BCN_20A_SUBZONES: readonly Bcn20aSubzone[] = Object.freeze([
    // ── PLURIFAMILIARS — Art. 342 (Barcelona-exclusive text, printed pp. 179–181 / 185–187) ────
    {
        clau: '20a/6',
        subzone: 'I',
        family: 'plurifamiliar',
        edificabilitatNeta: 0.25,
        edificabilitatIsConstructed: false,
        minParcel_m2: 2000,
        minFacade_m: 30,
        maxCoverage: 0.15,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 12, side_m: 8, rear_m: 10, interBuildingHeightRatio: 1 },
        auxiliary: { maxHeight_m: 3.3, maxOccupation: 0.02 },
    },
    {
        clau: '20a/5',
        subzone: 'II',
        family: 'plurifamiliar',
        edificabilitatNeta: 0.5,
        edificabilitatIsConstructed: false,
        minParcel_m2: 1500,
        minFacade_m: 20,
        maxCoverage: 0.2,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 10, side_m: 6, rear_m: 8, interBuildingHeightRatio: 1 },
        auxiliary: { maxHeight_m: 3.3, maxOccupation: 0.03 },
    },
    {
        clau: '20a/7',
        subzone: 'III',
        family: 'plurifamiliar',
        edificabilitatNeta: 0.75,
        edificabilitatIsConstructed: false,
        minParcel_m2: 1000,
        minFacade_m: 16,
        maxCoverage: 0.3,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 8, side_m: 4, rear_m: 6, interBuildingHeightRatio: 1 },
        auxiliary: { maxHeight_m: 3.3, maxOccupation: 0.04 },
    },
    {
        clau: '20a/9',
        subzone: 'IVa',
        family: 'plurifamiliar',
        // 1,00 — and NOT reduced by Art. 340.2, which scopes its reduction to *"les subzones
        // unifamiliars"*. IVa is plurifamiliar, so its 1,00 is unconditional. This is exactly the
        // distinction the brief flagged: 340.2 is an algorithm with a SCOPE, not a global rule.
        edificabilitatNeta: 1.0,
        edificabilitatIsConstructed: false,
        minParcel_m2: 400,
        minFacade_m: 14,
        maxCoverage: 0.4,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 3, side_m: 3, rear_m: 3, interBuildingHeightRatio: 1 },
        // Art. 342.9 — "---  No s'admet" for IVa, IVb and V.
        auxiliary: { maxHeight_m: null, maxOccupation: null },
    },
    {
        clau: '20a/9b',
        subzone: 'IVb',
        family: 'plurifamiliar',
        edificabilitatNeta: 1.0,
        edificabilitatIsConstructed: false,
        minParcel_m2: 1500,
        minFacade_m: 20,
        maxCoverage: 0.25,
        // Art. 342.3, the express exception: "A la subzona IV, subtipus b (20a/9b) l'alçada màxima
        // serà de 15,25 m. i el nombre límit de plantes, el de planta baixa més quatre plantes
        // pis." ⚠ Art. 342.6 further requires that IVb's planta baixa be left open over 75 % of
        // the occupied area — a MASSING condition we record but cannot express (see
        // `BCN_20A_UNMODELLED_RULES`).
        maxHeight_m: 15.25,
        floorsAboveGround: 4,
        separations: { front_m: 8, side_m: 5, rear_m: 6, interBuildingHeightRatio: 0.5 },
        auxiliary: { maxHeight_m: null, maxOccupation: null },
    },
    {
        clau: '20a/8',
        subzone: 'V',
        family: 'plurifamiliar',
        // Art. 340.1 states 1,50 — which Barcelona's Art. 342.5 then makes the TOP of a
        // width-indexed ladder (0,60 · 0,90 · 1,20 · 1,50), reachable only from a vial ≥ 15 m.
        edificabilitatNeta: 1.5,
        edificabilitatIsConstructed: true,
        minParcel_m2: 800,
        minFacade_m: 15,
        maxCoverage: 0.3,
        // NULL — Art. 342.5 keys height and storeys on the *amplada de vial*. See
        // `bcnAlcada20aAillada.ts`. A scalar here would publish one street's answer for the subzone.
        maxHeight_m: null,
        floorsAboveGround: null,
        separations: { front_m: 4, side_m: 4, rear_m: 5, interBuildingHeightRatio: 1 },
        auxiliary: { maxHeight_m: null, maxOccupation: null },
    },

    // ── UNIFAMILIARS — Art. 343 (Barcelona-exclusive text, printed pp. 181–183) ────────────────
    {
        clau: '20a/9u',
        subzone: 'VI',
        family: 'unifamiliar',
        // Art. 340.1 states 1,00. Art. 340.2 reduces it to 0,75 below the 400 m² minimum, and
        // Barcelona's Art. 343.1 adds the floor at which that reduced index is available at all
        // (≥ 200 m² and ≥ 10 m façade). ⇒ a PARCEL-AREA CONSTRUCTION, resolved in
        // `esBarcelona20aAillada.ts`, never a scalar in the pack.
        edificabilitatNeta: 1.0,
        edificabilitatIsConstructed: true,
        minParcel_m2: 400,
        minFacade_m: 14,
        maxCoverage: 0.4,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 3, side_m: 3, rear_m: 3, interBuildingHeightRatio: 0.5 },
        auxiliary: { maxHeight_m: 3.3, maxOccupation: 0.07 },
    },
    {
        clau: '20a/10',
        subzone: 'VII',
        family: 'unifamiliar',
        edificabilitatNeta: 0.75,
        edificabilitatIsConstructed: false,
        minParcel_m2: 600,
        minFacade_m: 16,
        maxCoverage: 0.3,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 5, side_m: 3, rear_m: 5, interBuildingHeightRatio: 0.5 },
        auxiliary: { maxHeight_m: 3.3, maxOccupation: 0.05 },
    },
    {
        clau: '20a/11',
        subzone: 'VIII',
        family: 'unifamiliar',
        edificabilitatNeta: 0.5,
        edificabilitatIsConstructed: false,
        minParcel_m2: 1000,
        minFacade_m: 18,
        maxCoverage: 0.2,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 8, side_m: 5, rear_m: 8, interBuildingHeightRatio: 1 },
        auxiliary: { maxHeight_m: 3.3, maxOccupation: 0.03 },
    },
    {
        clau: '20a/12',
        subzone: 'IX',
        family: 'unifamiliar',
        edificabilitatNeta: 0.25,
        edificabilitatIsConstructed: false,
        minParcel_m2: 2000,
        minFacade_m: 24,
        maxCoverage: 0.1,
        maxHeight_m: 9.15,
        floorsAboveGround: 2,
        separations: { front_m: 12, side_m: 10, rear_m: 12, interBuildingHeightRatio: 1 },
        auxiliary: { maxHeight_m: 3.3, maxOccupation: 0.02 },
    },
]);

/** Index by clau. Built once; throws at module load on a duplicate, which would be a transcription
 *  error rather than a resolvable ambiguity (the same argument as `registry.ts`'s `packMap`). */
export const BCN_20A_BY_CLAU: ReadonlyMap<string, Bcn20aSubzone> = (() => {
    const m = new Map<string, Bcn20aSubzone>();
    for (const s of BCN_20A_SUBZONES) {
        if (m.has(s.clau)) {
            throw new Error(`[site-parcel-data] duplicate 20a subzone clau "${s.clau}".`);
        }
        m.set(s.clau, s);
    }
    return m;
})();

/** Every clau this table answers for, in ordinance order. */
export const BCN_20A_ZONE_CODES: readonly string[] = Object.freeze(
    BCN_20A_SUBZONES.map((s) => s.clau),
);

/**
 * ⚠ **BARE `20a` IS DELIBERATELY ABSENT FROM `BCN_20A_ZONE_CODES`.**
 *
 * The MUC does return an unsuffixed `20a` (5 occurrences in the 1 014-point probe). It identifies
 * the ZONE, not the subzone — and the ten subzones differ by a factor of **six** in edificabilitat
 * (0,25 → 1,50), by a factor of four in coverage (10 % → 40 %) and by 9 m in front separation
 * (3 m → 12 m). There is no defensible "typical 20a".
 *
 * So an unsuffixed `20a` keeps the honest coverage-gap refusal, whose copy already says the
 * blocker is *"THIS subzone's own sourced numbers"*. Registering a pack for it would require
 * choosing one subzone's numbers and presenting them as the zone's — the exact category error
 * C58 §1.11 names.
 */
export const BCN_20A_BARE_CLAU_UNRESOLVABLE =
    'Clau "20a" without a subzone suffix identifies the zone, not the subzone. PGM Art. 338.2 ' +
    'establishes ten claus whose net edificabilitat spans 0,25–1,50 m²st/m²s and whose front ' +
    'separation spans 3–12 m; no single value is true of the zone. It therefore remains a ' +
    'coverage gap rather than being packed with a representative subzone (C58 §1.11).';

/**
 * WHAT THE BARCELONA TEXT ACTUALLY CHANGES vs the base PGM Arts. 337–343.
 *
 * Recorded as data because the DEFAULT ASSUMPTION IS THE DANGEROUS ONE: three prior rounds treated
 * the base text as Barcelona's. Both texts were read side by side for this pack; the parameter
 * tables agree, and the deltas are these.
 */
export const BCN_20A_BARCELONA_DELTAS: readonly string[] = Object.freeze([
    'Art. 342.5 (subzona V / 20a/8) — the base PGM table gives only alçada màxima + nombre de ' +
        'plantes per amplada de vial. Barcelona\'s Taula 10/11 adds an EDIFICABILITAT column ' +
        '(0,60 · 0,90 · 1,20 · 1,50) and states in prose that "l\'edificabilitat màxima que es ' +
        'podrà materialitzar en aquesta subzona ve condicionada per l\'amplada del vial a què ' +
        'dóna front la parcel·la". The realisable index in 20a/8 is therefore a construction, not ' +
        'Art. 340.1\'s 1,50. THIS IS THE LARGEST SINGLE DELTA IN THE FAMILY.',
    'Art. 342.10 — dwelling module: base PGM divides the parcel\'s max edificabilitat by 100 m²; ' +
        'Barcelona divides by 80 m². (Same 80 m² module as Art. 323 for claus 13a/13b.)',
    'Art. 342.7 / 343.3 — Barcelona ADDS: "La separació entre edificacions d\'una mateixa ' +
        'parcel·la podrà reduir-se al doble de la distància a la llinda lateral aplicable per a ' +
        'cada subzona, com si es tractés d\'edificacions situades en parcel·les independents." ' +
        'The boundary-separation TABLES themselves are unchanged.',
    'Art. 343.1 — Barcelona states the floor at which subzona VI\'s reduced 0,75 index is ' +
        'available (parcel ≥ 200 m² AND façana ≥ 10 m), which the base text does not, and adds ' +
        'the VII/VIII small-parcel regime (≥ 250 m² + façana ≥ 12 m ⇒ 125 m² of sostre, PB+1, ' +
        'ARM 7 m).',
    'Art. 343.2 — Barcelona ADDS that the small-parcel cases are exempt from the Art. 255 slope ' +
        'reductions where the average slope does not exceed 100 %.',
    'Arts. 249 / 250 / 251 / 252 / 253 / 255 — the GENERAL *edificació aïllada* rules (how ' +
        'occupation is measured, free soil, minimum separations, auxiliary constructions, natural ' +
        'terrain, topographic adaptation) are ALL restated "d\'aplicació al municipi de Barcelona ' +
        'exclusivament" on printed pp. 177–183. Art. 255 is the envelope-relevant one — see ' +
        'BCN_20A_UNMODELLED_RULES.',
    'Arts. 336 and 341 — restated for Barcelona on printed pp. 185–186 by the SECOND, separate ' +
        'modification of the same date (nombre màxim d\'habitatges per parcel·la). Neither is an ' +
        'envelope parameter: 336 governs when a pla especial is required, 341 sets reforma-interior ' +
        'land-share standards (20a: 18–24 % vials, 10–12 % espais verds).',
    'Arts. 337 (definició), 338 (subzones), 339 (tipus d\'ordenació) and **340 (edificabilitat)** ' +
        'are NOT modified for Barcelona. ⚠ Footnote 54 on printed p. 110 sits on **Art. 341**, not ' +
        'on Art. 340 — the base Art. 340 table IS Barcelona\'s.',
]);

/**
 * **Art. 342.10 (Barcelona)** — max dwellings per parcel in the PLURIFAMILIAR subzones =
 * `ceil(max permitted edificabilitat on the parcel ÷ 80 m²)`.
 *
 * ⚠ Base PGM says 100 m². Barcelona says 80 m². Recorded, not applied: it caps the PROGRAMME,
 * never the envelope, and the same 80 m² module already ships for 13a/13b (Art. 323).
 * ⚠ NOT stated for the unifamiliar subzones — Art. 343 has no equivalent clause, and the second
 * Barcelona modification stops at Art. 342. `null` for VI–IX is the ordinance's silence, not ours.
 */
export const BCN_20A_ART342_DWELLING_MODULE_M2 = 80;

/**
 * Rules of the Barcelona `20a` text that are REAL, are ENVELOPE-RELEVANT, and that PRYZM cannot
 * express today. Listed so they are refused knowingly rather than lost silently — a documented
 * "we cannot model this" is a finding; an undocumented omission is a defect.
 */
export const BCN_20A_UNMODELLED_RULES: readonly string[] = Object.freeze([
    'Art. 255 (Barcelona) — SLOPE REDUCTION OF THE EDIFICABILITAT COEFFICIENT. Average parcel ' +
        'slope 30–50 % ⇒ −20 %; 50–100 % ⇒ −40 %; > 100 % ⇒ INEDIFICABLE. Slope is measured ' +
        'perpendicular to the contours, from the natural terrain at the parcel boundaries. ' +
        '⚠ PRYZM extrudes from a FLAT plane and holds no DTM (L-584), so this cannot be applied. ' +
        'It is the single largest known source of over-statement for a hillside 20a parcel — and ' +
        'much of Barcelona\'s 20a fabric IS hillside (Collserola foothills, Vallvidrera, Horta). ' +
        'A consumer must not present a 20a envelope as slope-checked.',
    'Art. 342.7 / 343.3 final column — separation BETWEEN buildings on one parcel, expressed as a ' +
        'ratio of the taller building\'s height (1 or 1/2). PRYZM solves ONE envelope per parcel, ' +
        'so there is no second building for the constraint to bind against.',
    'Art. 342.6 — subzona IVb (20a/9b) must leave its planta baixa open over 75 % of the occupied ' +
        'area; subzones I and II may reach 12,20 m / PB+3 under *construccions amb palafits* ' +
        'conditions. Both are massing conditions with no slot in the envelope model. The palafits ' +
        'allowance is NOT added to I/II\'s 9,15 m — it is conditional and we verify no condition ' +
        '(the same treatment as the Art. 21 cornice increment for 13a).',
    'Art. 342.1 / 343.1 exception cases a/b/c — an undersized parcel may still be buildable if it ' +
        'derives from a pre-1956 public-deed segregation, from the 1953 Pla Comarcal, or is ' +
        'landlocked between built parcels, in which case the Art. 340 index is reduced IN THE SAME ' +
        'PROPORTION as the shortfall. ⚠ The trigger is CADASTRAL LEGAL HISTORY, which PRYZM does ' +
        'not hold; the proportional reduction is therefore reported as MAY-APPLY, never applied.',
    'Art. 343.1 (Barcelona) VII/VIII small-parcel regime — a 20a/10 or 20a/11 parcel of ' +
        '250–600/1000 m² with ≥ 12 m façana may build 125 m² of sostre in PB+1 at ARM 7 m. Gated ' +
        'on the same unheld exception cases, so surfaced as a caveat rather than as a rule.',
    'Art. 342.11 / 343.4–6 — dwelling grouping caps, 30 m maximum continuous built front for row ' +
        'developments, and *habitatges aparionats* (paired houses across a shared boundary, which ' +
        'SUPPRESS the separation at that boundary). Programme and party-configuration rules, not ' +
        'single-envelope geometry.',
]);
