// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-CONCEPT-LEXICON (lane ENVELOPE-IBERIA, 2026-09-04) — THE DR 5/2019 DICTIONARY AS A
// TYPE-CHECKER, plus the VERSION BOUNDARY and the terminology traps that INVERT RESULTS.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS IS. `docs/04-reference/jurisdictions/pt/PT-ENVELOPE-DERIVATION-DOCTRINE.md` (founder
// transmission, 2026-09-04) §12 step 7 requires, verbatim:
//
//   ⭐ "Type-check every token against the DR 5/2019 (or 9/2009) lexicon — abbreviation, unit,
//      formula. REJECT what does not type-check rather than guessing."
//
// Nothing in this repo could do that. This module is that check, and nothing more: pure data +
// pure functions over a raw regulamento token. It mints NO number, reads NO service, and decides
// NO envelope — it decides only *"is this token a concept I can name, in a unit I can name, under
// the dictionary version that governs this plan?"*, and says NO loudly when it is not.
//
// ── WHY IT IS A SEPARATE MODULE FROM `ptPdmDataModel.ts` (and NOT a rival to it) ──────────────
// `ptPdmDataModel.ts` already holds the doctrine's §6 — the CLOSED 18-category soil nomenclature
// (Aviso 9282/2021), the `ETIQUETA` join field, the condicionantes codes and the topology
// guarantee. That is ZONE IDENTITY, and it is national SCHEMA. This module holds the PARAMETER
// DICTIONARY (DR 5/2019), which is national STATUTE and a different instrument with a different
// version boundary. Consumers use both; neither restates the other.
//
// ⛔ AND NEITHER OF THEM MINTS A NUMBER. `ptPdmDataModel.ts`'s header says it: the national PDM
// schema carries no cércea, no índice, no pisos, no afastamento. Doctrine §11 says the same from
// the other side — *"C1–C5, D1 are REGULAMENTO TEXT ONLY; these fields do not exist in the
// national PDM schema and never will."* This lexicon is what lets a regulamento TRANSCRIBER be
// checked; it is not a source of values.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE THREE DEFECT CLASSES THIS FILE EXISTS TO MAKE IMPOSSIBLE
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// 1. **`COS` READ AS SPANISH COVERAGE.** In a Portuguese regulamento `COS` is `Iu` — a FLOOR-AREA
//    RATIO. In Spain, *coeficiente de ocupación del suelo* is COVERAGE. This lane owns BOTH
//    countries' rulepacks, so it is precisely the seat where the wrong reading would be carried
//    across, and the error is silent: a plausible number lands in the wrong slot. `Iu` values are
//    routinely > 1 and `maxCoverage` is `z.number().max(1)`, so a `COS` of 1,2 read as coverage
//    would be REJECTED by the schema — but a `COS` of 0,6 would be ACCEPTED, and would understate
//    the envelope by the ratio of the two concepts. There is no arithmetic that recovers it.
//
// 2. **`cércea` READ AS `Hf`.** Doctrine §9: *"`cércea` = **altura da edificação (H)**, NEVER
//    altura da fachada (`Hf`). Reading it as `Hf` UNDER-READS the envelope by the roof volume."*
//    ⚠⚠ SEE `PT_CERCEA_LOCAL_DEFINITION_CONFLICT` BELOW — Porto's own regulamento defines it the
//    OTHER way, and that conflict is REPORTED, never resolved by this file.
//
// 3. **THE VERSION BOUNDARY (doctrine §2.6).** DR 5/2019 governs procedures whose START DECISION
//    postdates **2019-09-27**; earlier plans are read against **DR 9/2009**. Applying the 2019
//    definitions to a 2016 plan is, in the doctrine's own words, *"a silent error you must not
//    make"* — a well-formed wrong answer with no symptom. `resolveConceptDictionaryVersion()`
//    REFUSES when the procedural start date is not in hand. It never defaults, because a default
//    here is exactly the silent error.
//
// PURITY: L2-pure. Data + pure functions. No I/O, no THREE, no DOM.
//
// Strategic context — PT-ENVELOPE-DERIVATION-DOCTRINE.md §2, §2.6, §9, §12 step 7; C58 §1.6
// (per-field provenance); §fake-more-capable-than-real (a lexicon that guessed would be a defect
// factory); L-616 (never overstate — and never silently UNDERSTATE either, which is trap 2).

/* ══════════════════════════ §2.6 — the dictionary version boundary ══════════════════════════ */

/** The two national parameter dictionaries. There is no third, and no plan may define its own. */
export type PtConceptDictionaryVersion = 'DR-5/2019' | 'DR-9/2009';

/**
 * The boundary date, verbatim from doctrine §2.6: DR 5/2019 applies to procedures whose START
 * DECISION postdates 2019-09-27. ISO, so string comparison is date comparison.
 */
export const PT_DICTIONARY_BOUNDARY_DATE = '2019-09-27';

export type PtDictionaryResolution =
    | {
          readonly ok: true;
          readonly version: PtConceptDictionaryVersion;
          /** Why this version — carried onto every value derived under it (doctrine §0.1). */
          readonly basis: string;
      }
    | {
          readonly ok: false;
          /** `unresolved` in the doctrine's confidence vocabulary ⇒ the envelope is BLOCKED. */
          readonly refusalReason: string;
      };

/**
 * PURE: which dictionary governs a plan, from its PROCEDURAL START DATE.
 *
 * ⛔ NOT from the publication date, and not from "today". A plan published in 2021 whose procedure
 * began in 2016 is read against DR 9/2009 — that is the whole point of the boundary, and using
 * the publication date would reproduce the silent error rather than prevent it.
 *
 * ⛔ AND IT REFUSES ON ABSENCE. Doctrine §0.3: *"never silently substitute a default."* An unknown
 * procedural start date makes the dictionary `unresolved`, which blocks the envelope. That is the
 * correct, complete product (§0: *"a cited refusal is a valid, complete product"*).
 */
export function resolveConceptDictionaryVersion(
    proceduralStartDateIso: string | null | undefined,
): PtDictionaryResolution {
    const d = (proceduralStartDateIso ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) {
        return {
            ok: false,
            refusalReason:
                'The plan\'s PROCEDURAL START DATE (the date of the decision to start the ' +
                'procedure) is not in hand, so it cannot be determined whether Decreto ' +
                'Regulamentar 5/2019 or 9/2009 fixes the meaning of this plan\'s parameters. ' +
                'Doctrine §2.6: applying the 2019 definitions to an earlier plan is a silent ' +
                'error; no default is substituted. Resolve the start date (SSAIGT/SNIT dinâmica ' +
                'feed) or refuse.',
        };
    }
    const post = d.slice(0, 10) > PT_DICTIONARY_BOUNDARY_DATE;
    return {
        ok: true,
        version: post ? 'DR-5/2019' : 'DR-9/2009',
        basis:
            `procedural start ${d.slice(0, 10)} is ${post ? 'after' : 'on or before'} the ` +
            `${PT_DICTIONARY_BOUNDARY_DATE} boundary. ⚠ The boundary DATE is stated by ` +
            'PT-ENVELOPE-DERIVATION-DOCTRINE.md §2.6; the transitional ARTICLE of DR 5/2019 that ' +
            'fixes it has NOT been read by PRYZM and is deliberately not cited here.',
    };
}

/* ═══════════════════════════════ §2 — the concepts themselves ═══════════════════════════════ */

/** The unit a concept's VALUE must carry. A value in the wrong unit is rejected, never converted. */
export type PtConceptUnit =
    /** A pure ratio, no unit (`Iu`). */
    | 'dimensionless'
    /** A percentage, 0–100 (`Io`, `Iimp`). */
    | 'percent'
    /** Cubic metres per square metre (`Iv`). */
    | 'm3-per-m2'
    /** Metres (`H`, `Hf`, `Alt`, `h`, `Re`, `Af`, `S`, `Es`). */
    | 'm'
    /** Square metres (`Ac`, `Ai`, `Aimp`, `As`). */
    | 'm2'
    /** Dwellings per hectare (`Dhab`). */
    | 'fogos-per-ha'
    /** An average storey count — ⚠ `Pm` is NOT an integer (doctrine §2.1). */
    | 'storeys-average'
    /** An integer storey count (`piso` counts). */
    | 'storeys-integer';

export interface PtConcept {
    /** The national abbreviation. The ONLY spelling a conformant plan may use (doctrine §2). */
    readonly key: string;
    /** The Portuguese name, as the dictionary states it. */
    readonly pt: string;
    /** What it means, in English, for a reader of this codebase. */
    readonly meaning: string;
    readonly unit: PtConceptUnit;
    /** The defining formula where the dictionary states one, else null. */
    readonly formula: string | null;
    /**
     * The C58 `ZoningRule` seat this concept feeds, or null when PRYZM has NO seat for it.
     * ⚠ `null` is a REPORTABLE GAP, not a shrug — it is the amendment surface this lane names.
     */
    readonly c58Seat:
        | 'plotRatioFAR'
        | 'maxCoverage'
        | 'maxHeight_m'
        | 'maxFloors'
        | 'setbacks.front_m'
        | 'setbacks.side_m'
        | 'setbacks.rear_m'
        | null;
    /** Why there is no seat / what the seat loses. Empty when the mapping is exact. */
    readonly seatNote: string;
}

/**
 * The DR 5/2019 indices and the height quantities — doctrine §2.1 and §2.4, as data.
 *
 * ⚠ NOT the whole 73-concept dictionary. Only the concepts that BEAR ON AN ENVELOPE are encoded,
 * because a half-transcribed 73-row table would invite exactly the "it's in the lexicon so it must
 * be right" reading that this module exists to refuse. `PT_LEXICON_SCOPE` states the boundary and
 * `typeCheckPtToken` reports `unknown-concept` rather than pretending completeness.
 */
export const PT_CONCEPTS: readonly PtConcept[] = [
    {
        key: 'Iu',
        pt: 'índice de utilização',
        meaning: 'floor-area ratio — área de construção over área do solo',
        unit: 'dimensionless',
        formula: 'Iu = Ac / As',
        c58Seat: 'plotRatioFAR',
        seatNote:
            'EXACT in shape, but the DENOMINATOR must be checked: `As` may be the parcel or the ' +
            'plan area (C63 §3.2 / LandBasis — "FAR over gross land" and "FAR over the parcel" ' +
            'are not relatable by arithmetic).',
    },
    {
        key: 'Io',
        pt: 'índice de ocupação',
        meaning: 'building footprint as a percentage of the parcel',
        unit: 'percent',
        formula: 'Io = (Ai / As) × 100',
        c58Seat: 'maxCoverage',
        seatNote:
            'The C58 seat is a RATIO 0–1; `Io` is a PERCENTAGE 0–100. A transcriber must divide ' +
            'by 100, and a value of 60 landing in `maxCoverage` fails the schema loudly (max 1) ' +
            'rather than silently — which is the safe direction.',
    },
    {
        key: 'Iimp',
        pt: 'índice de impermeabilização',
        meaning: 'impermeable area as a percentage of the parcel — PAVING INCLUDED',
        unit: 'percent',
        formula: 'Iimp = (Aimp / As) × 100 ; Aimp = Cimp × As',
        c58Seat: null,
        seatNote:
            '⛔ NO SEAT, AND IT MUST NOT BORROW `maxCoverage`. Impermeabilisation counts paving, ' +
            'terraces and circulation as well as the building; reading it as building coverage ' +
            'OVERSTATES the footprint (L-616). Porto Arts. 24/27/30/32 and 36/38 state Iimp ' +
            'caps (0,3 / 0,6 / 70 %) and state NO Io at all — measured 2026-09-04, ' +
            '`índice de ocupação` and `taxa de ocupação` are 0 occurrences in that regulamento.',
    },
    {
        key: 'Iv',
        pt: 'índice volumétrico',
        meaning: 'built volume over área do solo',
        unit: 'm3-per-m2',
        formula: 'Iv = V / As',
        c58Seat: null,
        seatNote: 'No volumetric-intensity seat exists in C58; a volume cap cannot be expressed.',
    },
    {
        key: 'Pm',
        pt: 'número médio de pisos',
        meaning: 'AVERAGE number of storeys',
        unit: 'storeys-average',
        formula: 'Pm = Ac / Ai',
        c58Seat: null,
        seatNote:
            '⛔ NOT `maxFloors`. Doctrine §2.1 states it explicitly: `Pm` is an AVERAGE, not an ' +
            'integer count. Rounding it into `maxFloors` invents a storey the plan never granted ' +
            '(up) or deletes one it did (down).',
    },
    {
        key: 'Dhab',
        pt: 'densidade habitacional',
        meaning: 'dwellings per hectare',
        unit: 'fogos-per-ha',
        formula: 'Dhab = F / As',
        c58Seat: null,
        seatNote: 'A programme constraint, not an envelope constraint. No seat, and none is owed.',
    },
    {
        key: 'H',
        pt: 'altura da edificação',
        meaning:
            'cota de soleira → the HIGHEST POINT including the roof and volumes on it (chimneys ' +
            'and accessory/decorative elements excluded), PLUS the elevação da soleira',
        unit: 'm',
        formula: 'H = (highest point − S) + Es',
        c58Seat: 'maxHeight_m',
        seatNote:
            'The seat is exact, but it is meaningless without `heightDatum` (ADR-0377): `H` is ' +
            'measured from the cota de soleira, which is a THRESHOLD level, not a terrain sample. ' +
            '⛔ There is NO `cota-de-soleira` member in the ratified HeightDatum union — a ' +
            'REPORTED gap; the honest map today is `unknown`, which refuses.',
    },
    {
        key: 'Hf',
        pt: 'altura da fachada',
        meaning:
            'cota de soleira → top of cornija/beirado/platibanda or terrace guard, PLUS Es. ' +
            'STOPS AT THE FAÇADE — the roof volume is above it.',
        unit: 'm',
        formula: 'Hf = (top of façade − S) + Es',
        c58Seat: 'maxHeight_m',
        seatNote:
            '⚠ SHARES A SEAT WITH `H` AND MUST NOT. `Hf` < `H` by the roof; a pack that stores ' +
            'one where the ordinance states the other is wrong by a whole storey-equivalent in ' +
            'either direction. Until C58 can distinguish them, a pack MUST say which it holds in ' +
            '`ordinanceRef` — REPORTED as an amendment need.',
    },
    {
        key: 'Alt',
        pt: 'altitude máxima de edificação',
        meaning:
            'an ABSOLUTE cap in the national altimetric datum, against which ALL constructed ' +
            'elements count',
        unit: 'm',
        formula: null,
        c58Seat: null,
        seatNote:
            '⛔⛔ NEVER COLLAPSE INTO `H` (doctrine §2.4). `Alt` is an absolute altitude and is ' +
            'STRICTER than `H`: on rising ground the same `H` yields a different `Alt`. C58 has ' +
            '`absolute-national` as a DATUM but no seat for a second, independent absolute cap ' +
            'applied ON TOP of a relative one. REPORTED.',
    },
    {
        key: 'h',
        pt: 'altura entre pisos',
        meaning: 'pé-direito of the lower compartment PLUS the upper slab thickness',
        unit: 'm',
        formula: null,
        c58Seat: null,
        seatNote:
            '⭐ THIS IS THE CONVERSION EVERY "N pisos" RULE NEEDS AND NO PLAN GUARANTEES. RGEU ' +
            'art. 65 sets a MINIMUM pé-direito (2,40 m residential / 3,00 m commercial), which ' +
            'makes a metre cap and a storey cap JOINTLY binding — it does NOT license converting ' +
            'storeys to metres, because the minimum is a floor and not the actual `h`.',
    },
    {
        key: 'Re',
        pt: 'recuo',
        meaning: 'alinhamento (public-domain / prédio boundary) → the façade plane',
        unit: 'm',
        formula: null,
        c58Seat: 'setbacks.front_m',
        seatNote:
            '⚠ The `alinhamento` is the PUBLIC-DOMAIN BOUNDARY, NOT THE KERB LINE (doctrine ' +
            '§2.5). Measuring a recuo from a road centreline or a kerb is the Murcia `pgou_ejes` ' +
            'defect in Portuguese.',
    },
    {
        key: 'Af',
        pt: 'afastamento',
        meaning: 'façade → the corresponding property boundary; lateral and tardoz DISTINGUISHED',
        unit: 'm',
        formula: null,
        c58Seat: 'setbacks.side_m',
        seatNote:
            'C58 has `side_m` and `rear_m`, so lateral/tardoz DO have distinct seats — but a ' +
            'single `Af` token does not say which, and a transcriber must resolve it from the ' +
            'article rather than fill both.',
    },
    {
        key: 'Ac',
        pt: 'área de construção',
        meaning:
            'sum of all floors above and below the cota de soleira, measured at the EXTERIOR ' +
            'perimeter of exterior walls; INCLUDES covered circulation and covered exterior ' +
            'spaces; EXCLUDES sótão/cave without regulation pé-direito',
        unit: 'm2',
        formula: null,
        c58Seat: null,
        seatNote:
            'An OUTPUT, not a constraint. ⚠ Its inclusion rules are what make `Iu` comparable ' +
            'across plans; a `Iu` computed with a different `Ac` definition is a different number.',
    },
    {
        key: 'Ai',
        pt: 'área de implantação',
        meaning:
            'closed polygon of the building\'s contact with soil PLUS the exterior perimeter of ' +
            'exterior walls of BASEMENT floors',
        unit: 'm2',
        formula: null,
        c58Seat: null,
        seatNote:
            '⚠ BASEMENTS COUNT. A footprint computed from the above-ground outline alone ' +
            'understates `Ai` and therefore overstates the `Io` headroom.',
    },
    {
        key: 'As',
        pt: 'área do solo',
        meaning: 'the denominator of Iu / Io / Iimp / Iv / Dhab — the parcel or the plan area',
        unit: 'm2',
        formula: null,
        c58Seat: null,
        seatNote:
            '⭐ THE DENOMINATOR IS THE WHOLE QUESTION (C63 §3.2 / `LandBasis`, L-656). Which ' +
            '`As` an index is measured over is a per-article fact and must travel with the value.',
    },
];

const BY_KEY: ReadonlyMap<string, PtConcept> = new Map(PT_CONCEPTS.map((c) => [c.key, c]));

/** What this lexicon does and does not cover — stated so absence is never read as "not a concept". */
export const PT_LEXICON_SCOPE =
    'DR 5/2019 fixes 73 technical concepts. This module encodes ONLY the subset that bears on a ' +
    'buildable envelope (the six indices, the six height/datum quantities, recuo/afastamento, and ' +
    'the three areas). A token this module answers `unknown-concept` for may still be a real ' +
    'national concept — the answer means "this lexicon cannot type-check it", never "it is not a ' +
    'concept". Doctrine §12 step 7 requires rejection in both cases.';

/* ═══════════════════════════ §9 — the traps, as an ALIAS TABLE ══════════════════════════════ */

export interface PtTermAlias {
    /** The raw token as a regulamento writes it, normalised (see `normalisePtTerm`). */
    readonly alias: string;
    /** The canonical concept key it resolves to. */
    readonly concept: string;
    /**
     * ⛔ Set when reading this alias the "obvious" way INVERTS or CORRUPTS the result. Carried
     * into the type-check outcome so a transcriber sees the trap at the moment of transcription,
     * not in a post-hoc audit.
     */
    readonly trap: string | null;
}

/**
 * Doctrine §9 as data. Every row is a term a Portuguese regulamento actually uses for a concept
 * whose national abbreviation is different.
 */
export const PT_TERM_ALIASES: readonly PtTermAlias[] = [
    {
        alias: 'cos',
        concept: 'Iu',
        trap:
            '⛔ CROSS-JURISDICTION TRAP. In a PORTUGUESE regulamento `COS` is the índice de ' +
            'utilização — a FLOOR-AREA RATIO. In SPAIN, `COS` (coeficiente de ocupación del ' +
            'suelo) is COVERAGE. This lane owns both countries\' rulepacks, so this is the exact ' +
            'seat where the Spanish reading would be carried across. A PT `COS` written into ' +
            '`maxCoverage` is silently wrong whenever it happens to be ≤ 1.',
    },
    { alias: 'indice de construcao', concept: 'Iu', trap: null },
    { alias: 'indice de utilizacao', concept: 'Iu', trap: null },
    { alias: 'indice de edificacao', concept: 'Iu', trap:
        '⚠ Porto\'s regulamento uses `índice de edificação` and defines it in its OWN Art. 3.º m). ' +
        'It is Iu-shaped (área de edificação ÷ parcel area) but the numerator is the plan\'s own ' +
        '`área de edificação`, whose exclusions differ from the national `Ac`. Type-checks as Iu; ' +
        'the DENOMINATOR AND NUMERATOR definitions must still be read from the article.' },
    { alias: 'indice de edificabilidade', concept: 'Iu', trap:
        '⚠ Lisboa\'s RPDML uses `Ie` and defines it in its OWN Art. 38.º n.º 3 as ∑Sp / As, where ' +
        '`Sp` is *superfície de pavimento* — a numerator with different exclusions from the ' +
        'national `Ac` (Sp excludes varandas and covered collective exterior space; Ac INCLUDES ' +
        'them). Two Ie values from two municípios are not comparable without the numerator.' },
    { alias: 'ie', concept: 'Iu', trap: null },
    { alias: 'percentagem de ocupacao', concept: 'Io', trap: null },
    { alias: 'indice de implantacao', concept: 'Io', trap: null },
    { alias: 'cas', concept: 'Io', trap: null },
    { alias: 'taxa de ocupacao', concept: 'Io', trap: null },
    {
        alias: 'cercea',
        concept: 'H',
        trap:
            '⛔ `cércea` is the altura da EDIFICAÇÃO (H) — to the highest point INCLUDING the ' +
            'roof — NEVER the altura da fachada (Hf). Reading it as Hf under-reads the envelope ' +
            'by the entire roof volume. ⚠⚠ BUT SEE `PT_CERCEA_LOCAL_DEFINITION_CONFLICT`: at ' +
            'least one municipal regulamento defines it the other way, and this alias does not ' +
            'settle that case — it flags it.',
    },
    { alias: 'area bruta', concept: 'Ac', trap: null },
    { alias: 'area coberta', concept: 'Ac', trap: null },
    { alias: 'area de pavimento', concept: 'Ac', trap: null },
    { alias: 'superficie de pavimento', concept: 'Ac', trap:
        '⚠ Lisboa\'s `superfície de pavimento` (RPDML Art. 4.º d) EXCLUDES varandas, sótão and ' +
        'cave without regulation pé-direito and covered collective exterior spaces. The national ' +
        '`Ac` INCLUDES covered exterior spaces. They are NOT the same area; a yield computed ' +
        'with one and compared against the other is wrong.' },
    { alias: 'area total de construcao', concept: 'Ac', trap: null },
    { alias: 'altura da edificacao', concept: 'H', trap: null },
    { alias: 'altura da fachada', concept: 'Hf', trap: null },
    { alias: 'altitude maxima de edificacao', concept: 'Alt', trap: null },
    { alias: 'recuo', concept: 'Re', trap: null },
    { alias: 'afastamento', concept: 'Af', trap: null },
    { alias: 'pe direito', concept: 'h', trap:
        '⚠ RGEU art. 65 states a MINIMUM pé-direito (2,40 m residential / 3,00 m commercial). ' +
        'A minimum is a FLOOR, not the actual `h`: it does NOT license converting a storey count ' +
        'to metres. It makes a metre cap and a storey cap JOINTLY binding, which is a different ' +
        'and weaker statement.' },
    { alias: 'numero medio de pisos', concept: 'Pm', trap: null },
];

/**
 * The alias index. Built from the EXPLICIT trap table above PLUS the dictionary's own Portuguese
 * NAMES, derived from `PT_CONCEPTS` rather than re-typed — a hand-copied second list of the same
 * names is exactly the drift this codebase keeps paying for. The explicit table WINS on collision,
 * because that is where the traps live and a derived row carries none.
 */
const ALIASES: ReadonlyMap<string, PtTermAlias> = (() => {
    const m = new Map<string, PtTermAlias>();
    for (const c of PT_CONCEPTS) {
        const alias = normalisePtTerm(c.pt);
        if (alias.length > 0) m.set(alias, { alias, concept: c.key, trap: null });
    }
    for (const a of PT_TERM_ALIASES) m.set(a.alias, a);
    return m;
})();

/**
 * ⚠⚠ A MEASURED CONFLICT BETWEEN THE NATIONAL DICTIONARY AND A MUNICIPAL REGULAMENTO — RECORDED,
 * NOT RESOLVED.
 *
 * Doctrine §9 says `cércea` = `H` (to the highest point, roof included). **Porto's PDM Regulamento
 * (Janeiro 2023) Art. 3.º g) defines it as the vertical dimension from the mean ground level at
 * the façade alignment to the top of the eave / parapet / terrace guard** — i.e. exactly the
 * national `Hf`, stopping at the façade. That transcription is VERIFIED-PRIMARY and verbatim
 * (`docs/04-reference/jurisdictions/pt/sources/SOURCES.md` §A.0.3, dual-engine re-verified against
 * a sha256-pinned PDF), so this is not a transcription error to correct.
 *
 * It is one of exactly two things, and PRYZM cannot decide which:
 *   (a) Porto's procedure PREDATES 2019-09-27, so DR 9/2009 governs its vocabulary and the 2019
 *       definition simply does not bind it (doctrine §2.6) — in which case the two are not in
 *       conflict at all; or
 *   (b) Porto's definition is NON-CONFORMANT with a dictionary the doctrine calls obligatory —
 *       in which case the regulamento's own words still bind the parcel, and the national reading
 *       would be the wrong one.
 *
 * ⛔ EITHER WAY THE CONSEQUENCE IS THE SAME AND IT IS NOT A DEFAULT: a Porto `cércea` value must
 * be recorded as `Hf`-shaped with this note attached, never silently promoted to `H`. Promoting it
 * would OVERSTATE the envelope by the roof volume on every Porto parcel — the L-616 direction.
 * Resolving it needs the PDMP's procedural start date, which is a `SSAIGT/SNIT` lookup nobody has
 * run.
 */
export const PT_CERCEA_LOCAL_DEFINITION_CONFLICT = {
    concept: 'cércea',
    nationalReading: 'H — altura da edificação, to the highest point including the roof',
    municipalReading:
        'Porto PDM Art. 3.º g) — mean ground level at the façade alignment to the top of the ' +
        'eave / parapet / terrace guard (Hf-shaped)',
    citation:
        'PT-ENVELOPE-DERIVATION-DOCTRINE.md §9 vs docs/04-reference/jurisdictions/pt/sources/' +
        'SOURCES.md §A.0.3 (Porto Art. 3.º g), VERIFIED-PRIMARY)',
    unresolvedBecause:
        'the PDMP\'s PROCEDURAL START DATE is not in hand, so §2.6 cannot say which dictionary ' +
        'version governs its vocabulary',
    safeHandling:
        'record the value as Hf-shaped and attach this note; NEVER promote it to H (that would ' +
        'overstate by the roof volume on every Porto parcel)',
} as const;

/* ═════════════════════════════ §12 step 7 — the type-check itself ═══════════════════════════ */

/** Accent- and case-insensitive normalisation for matching served/transcribed PT vocabulary. */
export function normalisePtTerm(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export type PtTokenCheck =
    | {
          readonly ok: true;
          readonly concept: PtConcept;
          /** The alias row that matched, when the token was not the canonical key. */
          readonly via: PtTermAlias | null;
          /** ⛔ Non-null ⇒ a reading of this token INVERTS or CORRUPTS the result. Surface it. */
          readonly trap: string | null;
          readonly dictionaryVersion: PtConceptDictionaryVersion;
      }
    | {
          readonly ok: false;
          readonly reason:
              /** No concept and no alias matched. */
              | 'unknown-concept'
              /** The concept is known but the stated unit is not the one the dictionary fixes. */
              | 'unit-mismatch'
              /** The value is not a finite number, or is outside the concept's admissible range. */
              | 'value-not-admissible';
          readonly detail: string;
      };

/**
 * ⭐ DOCTRINE §12 STEP 7, IMPLEMENTED: *"type-check every token against the lexicon — abbreviation,
 * unit, formula. REJECT what does not type-check rather than guessing."*
 *
 * It answers about a TOKEN, not about a parcel. `ok: true` means "this is a national concept, in
 * its national unit, and here is the trap you must not fall into" — it does NOT mean the value is
 * correct, applicable, or in force. Those are `B1`/`B5` questions this function has no input for.
 *
 * ⛔ IT NEVER CONVERTS. A `Io` of 60 offered as `dimensionless` is REJECTED, not divided by 100:
 * a silent conversion is indistinguishable from a correct reading, and the doctrine's rule is
 * "reject rather than guess". The caller fixes the transcription.
 */
export function typeCheckPtToken(
    rawTerm: string,
    opts: {
        readonly dictionaryVersion: PtConceptDictionaryVersion;
        /** The unit the transcriber believes the value carries. Omit to check the term only. */
        readonly unit?: PtConceptUnit;
        /** The value, when one is offered. Omit to check the term only. */
        readonly value?: number;
    },
): PtTokenCheck {
    const raw = (rawTerm ?? '').trim();
    const norm = normalisePtTerm(raw);

    // The canonical key first — case-sensitively, because `H` and `h` are DIFFERENT concepts
    // (altura da edificação vs altura entre pisos) and a case-insensitive match would conflate
    // them. That conflation is a metre-scale error in the height slot.
    let concept = BY_KEY.get(raw) ?? null;
    let via: PtTermAlias | null = null;
    if (concept === null) {
        const alias = ALIASES.get(norm) ?? null;
        if (alias !== null) {
            concept = BY_KEY.get(alias.concept) ?? null;
            via = alias;
        }
    }
    if (concept === null) {
        return {
            ok: false,
            reason: 'unknown-concept',
            detail:
                `"${raw}" matches no DR 5/2019 abbreviation and no recorded municipal alias. ` +
                `${PT_LEXICON_SCOPE} Doctrine §12 step 7: reject rather than guess.`,
        };
    }

    if (opts.unit !== undefined && opts.unit !== concept.unit) {
        return {
            ok: false,
            reason: 'unit-mismatch',
            detail:
                `"${raw}" is ${concept.key} (${concept.pt}), which the national dictionary fixes ` +
                `in \`${concept.unit}\` — the token was offered as \`${opts.unit}\`. NOT converted: ` +
                'a silent conversion is indistinguishable from a correct reading. Fix the ' +
                'transcription, or refuse.',
        };
    }

    if (opts.value !== undefined) {
        const v = opts.value;
        if (!Number.isFinite(v) || v < 0) {
            return {
                ok: false,
                reason: 'value-not-admissible',
                detail: `${concept.key} was offered the non-admissible value ${String(v)}.`,
            };
        }
        if (concept.unit === 'percent' && v > 100) {
            return {
                ok: false,
                reason: 'value-not-admissible',
                detail:
                    `${concept.key} (${concept.pt}) is a PERCENTAGE and ${v} exceeds 100. This is ` +
                    'the signature of a ratio written into a percent seat (or the reverse); it is ' +
                    'rejected rather than rescaled.',
            };
        }
        if (concept.unit === 'storeys-integer' && !Number.isInteger(v)) {
            return {
                ok: false,
                reason: 'value-not-admissible',
                detail: `${concept.key} is an integer storey count; ${v} is not an integer.`,
            };
        }
    }

    return {
        ok: true,
        concept,
        via,
        trap: via?.trap ?? null,
        dictionaryVersion: opts.dictionaryVersion,
    };
}

/** Every concept in this lexicon for which PRYZM has NO C58 seat — the amendment surface, derived. */
export function ptConceptsWithoutC58Seat(): readonly PtConcept[] {
    return PT_CONCEPTS.filter((c) => c.c58Seat === null);
}
