// E7-LU — LUXEMBOURG (LU) · the PURE rule mapper: `PAG_PAG_NQ_PAP` COS/CUS/CSS/DL columns →
// E1a `SiteIntelRule` objects, PLUS the minted planning entities those rules cite (the R1
// referent contract: "every `basis` reference MUST resolve to a MINTED entity").
//
// Same shape and same boundary as the EE exemplar (`ee/eeRuleMapper.ts`) — TOTAL, PURE,
// DETERMINISTIC: same row in → byte-identical rules out. No fetch, no clock (the caller passes
// `fetchedAtIso`), no business logic. It does NOT decide what may be built; it records what the
// state serves, with its legal address, and REFUSES BY NAME where the state's own encoding is
// unsafe.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ THE FOUR COEFFICIENTS ARE FOUR DIFFERENT QUANTITIES OVER THREE DIFFERENT DENOMINATORS.
//     THEY ARE NOT INTERCHANGEABLE. THE STATUTE SAYS SO, VERBATIM, AND IT IS QUOTED BELOW.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// SOURCE OF THE DEFINITIONS — fetched and read 2026-09-01, not paraphrased from memory:
// the official CONSOLIDATED text of the loi ACDU + its règlements grand-ducaux, published by
// the Ministère des Affaires intérieures
// (`https://maint.gouvernement.lu/dam-assets/dossiers/documents/pag/loi-acdu-rgd-textes-consolids-octobre2023.pdf`,
// HTTP 200, 1,086,381 bytes, consolidation stamped October 2023), **Annexe II — Terminologie du
// degré d'utilisation du sol** of the règlement grand-ducal du 8 mars 2017 concernant le contenu
// du plan d'aménagement général d'une commune. Quoted VERBATIM, in French, because a translated
// denominator is a lost denominator:
//
//   A. Coefficient d'utilisation du sol [CUS]
//      « On entend par coefficient d'utilisation du sol le rapport entre la somme des surfaces
//        construites brutes de tous les niveaux et la surface totale du TERRAIN À BÂTIR BRUT,
//        pour autant que la hauteur d'étage moyenne ne dépasse pas 5 mètres. Pour tous les
//        niveaux dont la hauteur moyenne d'étage est comprise entre 5 mètres et 10 mètres, la
//        surface construite brute est multipliée par 2. Pour tous les niveaux dont la hauteur
//        d'étage moyenne dépasse 10 mètres, la surface construite brute est multipliée par 3. »
//
//   B. Coefficient d'occupation du sol [COS]
//      « On entend par coefficient d'occupation du sol le rapport entre la surface d'emprise au
//        sol de la ou des constructions (au niveau du terrain naturel) et la surface du
//        TERRAIN À BÂTIR NET. »
//
//   C. Coefficient de scellement du sol [CSS]
//      « On entend par coefficient de scellement du sol le rapport entre la surface de sol
//        scellée et la surface du TERRAIN À BÂTIR NET. »
//
//   D. Densité de logement [DL]
//      « On entend par densité de logement le rapport entre le nombre d'unités de logement et
//        le TERRAIN À BÂTIR BRUT exprimé en HECTARES. »
//
//   E. Terrain à bâtir brut — « tous les fonds situés en zone urbanisée ou destinée à être
//      urbanisée, non encore ou partiellement viabilisés. »
//   F. Terrain à bâtir net  — « tous les fonds situés en zone urbanisée ou destinée à être
//      urbanisée DÉDUCTION FAITE de toutes les surfaces privées et publiques nécessaires à sa
//      viabilisation. »
//
// ⇒ THE CONSEQUENCES, EACH OF WHICH IS ENCODED BELOW RATHER THAN WRITTEN IN PROSE ONLY:
//
//   1. COS and CSS are ratios over **terrain à bâtir NET**; CUS is a ratio over **terrain à
//      bâtir BRUT**; DL is a count per **hectare of terrain à bâtir BRUT**. NET ⊂ BRUT by the
//      statute's own wording ("déduction faite"), so COS × area and CUS × area are computed
//      against DIFFERENT areas. Multiplying all four by one parcel area is the C63 Aarhus trap
//      in a Luxembourgish accent — every field parses clean and the answer is wrong.
//   2. **NEITHER denominator is a cadastral parcel, and NEITHER is served as a number anywhere
//      in the artefact.** `terrain à bâtir brut/net` are planning constructs whose area depends
//      on the viabilisation deduction, which the PAG does not publish. So no rule here may be
//      multiplied by a `PAG_PAG_FOND_DE_PLAN` parcel area. Each rule says so in-band.
//   3. **CUS's numerator is NON-LINEAR.** Storeys averaging 5–10 m count DOUBLE, storeys over
//      10 m count TRIPLE. `CUS × area` is therefore an upper bound on *weighted* floor area,
//      not on floor area. A consumer that treats CUS as a plain FAR overstates on any building
//      with tall storeys. This rides `valueBasis` and the note, never a comment alone.
//   4. **They are ZONE AVERAGES, and the statute permits individual lots to EXCEED them.**
//      Art. 26, verbatim: « Pour tout plan d'aménagement particulier "nouveau quartier", les
//      coefficients précités constituent des VALEURS MOYENNES qui sont à respecter pour
//      l'ensemble des fonds couverts par un même degré d'utilisation du sol. Ces coefficients
//      peuvent par conséquent être DÉPASSÉS pour certains lots ou parcelles. » That is an R5
//      normative-force fact and it is mirrored verbatim on EVERY rule.
//
// ⛔ REFUSE RATHER THAN CONVERT. There is no COS→CUS, CUS→COS, CSS→COS or DL→anything conversion
// in this file, and none may be added: the conversions do not exist, because the quantities do
// not share a denominator, a numerator or a dimension. `LU_COEFFICIENT_VOCABULARY` is the ONE
// table, and each row carries its own basis; a consumer reading two rows must read two bases.
//
// ══ THE UNKNOWN RULE (E4 control 9: UNKNOWN ≠ 0 ≠ unlimited ≠ no-restriction) ═══════════════
// Every null AND every zero is a tier-6 UNKNOWN row, emitted and never dropped. Each guard is
// justified by a MEASUREMENT taken from the artefact itself on 2026-09-01 (n = 3,017), not by
// assumption — the LT `MIN_APZELD` standard:
//
//   • MAXIMA — nulls. `COS_MAX`/`CUS_MAX`/`CSS_MAX` are non-null on 3,010 (99.8%); `DL_MAX` on
//     2,950 (97.8%). The null pattern is exactly two shapes: **7 rows with all four null**
//     (e.g. `'Livange 07 - Kromstucker (pour la rétention)'` x3, `'Hamm - (ZAD)'`) and **60 rows
//     with only `DL_MAX` null**. Nothing served says which is "no limit" and which is unfilled.
//   • MAXIMA — zeros. `COS_MAX = 0` on **12** rows, `CSS_MAX = 0` on **10**, `DL_MAX = 0` on
//     **123**. ⚠ THIS LANE CORRECTS E5-B §A-13, which states the 12 `COS_MAX=0` rows "are all
//     ZAD". MEASURED: **3 name ZAD · 5 name "voirie" (road portions) · 1 names "(Partie SPEC)" ·
//     3 name neither.** The zeros are still MEANINGFUL — a road-portion sub-zone plausibly has
//     zero coverage — but "all ZAD" is not what the data says. And **111 of the 123 `DL_MAX = 0`
//     rows sit beside a POSITIVE `COS_MAX`** (`'Moersdorf MD03 - Schotterwerk'` COS 0.5 / CUS 1.2
//     / CSS 0.75 / DL 0), i.e. buildable land with a stated zero dwelling density — coherent as a
//     real value AND indistinguishable from an unfilled slot. Both populations exist; nothing
//     served separates them.
//   • MINIMA. `COS_MIN` 46.0% non-null, `CUS_MIN` 51.6%, `DL_MIN` 52.5% — and of those,
//     1,345 / 1,509 / 1,445 respectively are **zero**. THE DECIDING MEASUREMENT: across the 94
//     communes, `COS_MIN` is ALWAYS-null in 28, ALWAYS-filled in 34, and **MIXED in 32**
//     (`DL_MIN`: 26 / 36 / 32) — and 1,363 rows carry an all-null minima triple against 1,235
//     carrying an all-zero one. NULL and 0 are therefore two MUNICIPAL ENCODINGS of the same
//     fact ("no minimum set"), not two different facts. Both map to tier-6 UNKNOWN.
//
// ⇒ 3,017 − 2,826 (all four maxima strictly positive) = **191 rows = 6.33%** carry at least one
// absent-or-zero coefficient. Every one of those rows still emits its full rule set; the
// affected parameters simply carry `value: null` at tier 6. Independently re-measured this lane
// against the artefact — the numbers above are this lane's own `sqlite3` census, not E5's.
//
// ══ R3 VALIDITY — `'ingestion'` ON EVERY RULE, AND THE REASON IS MEASURED ═══════════════════
// `PAG_PAG_NQ_PAP` has FIFTEEN columns and **not one of them is a date**. The entire 27-table
// artefact carries exactly one date column, `PAG_PAG_MODIFICATION_PAG.DATE_MODIF`, on **1 row**,
// unrelated to any zone. There is no adoption date, no in-force date, no version window per
// feature. Naming the dataset's publication timestamp as a rule's legal validity would be a
// fabricated legal address, so every LU rule is `validityBasis: 'ingestion'` + the fetch date,
// and a point-in-time evaluator will correctly refuse to say these were in force on any date.
// The dataset's own refresh stamp travels in the note, as a fact about the FETCH.
//
// ══ R5 NORMATIVE FORCE ═════════════════════════════════════════════════════════════════════
// Verbatim from Art. 26 (see consequence 4 above), never harmonised, never a boolean.
//
// ══ WHAT LUXEMBOURG DOES NOT SERVE (the honest half of "the near-free country") ═════════════
// NO max height. NO setback distances. NO storey count. NO building depth. Nowhere in the model
// — measured across all 27 tables. Those live in the PAP and in the DOCX partie écrite whose
// FILENAME (`NOM_FICHIER_EC`) is the only thing served. And the numerics exist for the 3,017
// "nouveau quartier" zones ONLY: the **18,743 `PAG_PAG_ZONES_QE`** existing-quarter zones — where
// most buildable land in a mature country actually is — carry zero numerics. This adapter emits
// nothing it does not have; the absence is stated in `LU_APPLICABILITY_LADDER`, not papered over.

import {
    SiteIntelPlanSchema,
    SiteIntelRuleSchema,
    SiteIntelZoneSchema,
    type NativeCrsGeometry,
    type RuleBasisRef,
    type RuleDerivation,
    type RuleValueLocation,
    type SiteIntelPlan,
    type SiteIntelRule,
    type SiteIntelZone,
} from '@pryzm/schemas';
import type { LuNqPapRow, LuServedGeometry } from './luPagGpkgClient.js';
import { LU_NATIVE_CRS } from './luJurisdiction.js';
import { LU_PAG_SOURCE_ID } from './luSources.js';

/* ═════════════════════════════ authority + force ════════════════════════════ */

/** The publishing authority string carried in every LU rule's source ref. */
export const LU_RULE_AUTHORITY = 'Ministère des Affaires intérieures (Aménagement communal)';

/** The dataset name carried in every LU rule's source ref (the GeoPackage layer). */
export const LU_RULE_DATASET = 'PAG_PAG_NQ_PAP';

/**
 * R5, VERBATIM from the règlement grand-ducal du 8 mars 2017 (contenu du PAG), Art. 26,
 * read 2026-09-01 in the official consolidated text. Mirrored, never translated, never reduced
 * to a boolean — and load-bearing: it says the served number may be EXCEEDED on an individual
 * lot, which no `maxX` parameter name can express.
 */
export const LU_NORMATIVE_FORCE =
    'valeurs moyennes à respecter pour l’ensemble des fonds couverts par un même degré ' +
    'd’utilisation du sol; peuvent par conséquent être dépassés pour certains lots ou parcelles';

/** The R2 `valueBasis.scheme` — the statutory terminology annex the codes are taken from. */
export const LU_VALUE_BASIS_SCHEME = 'lu-rgd-2017-03-08-pag-annexe-ii';

/**
 * The CLOSED set of R2 `valueBasis.code` values this adapter may emit — the statutory
 * denominator terms, VERBATIM in French. A code outside this set is a national schema change
 * and MUST throw rather than be absorbed (E7-FAMILY §6 E).
 */
export const LU_VALUE_BASIS_CODES = Object.freeze([
    'terrain-a-batir-brut',
    'terrain-a-batir-net',
    'terrain-a-batir-brut-hectares',
] as const);
export type LuValueBasisCode = (typeof LU_VALUE_BASIS_CODES)[number];

/**
 * LANE LU-ENVELOPE (2026-09-03, additive) — the STATUTORY DENOMINATOR DEFINITIONS, verbatim from
 * Annexe II (règlement grand-ducal du 8 mars 2017, contenu du PAG), previously quoted only in this
 * file's header comment. Exported as DATA so the envelope compile pack
 * (`rulepacks/luPagEnvelope.ts`) can carry the exact French wording in its withhold caveats
 * without duplicating the strings (C84 EI-9 — one authority per concept; a translated denominator
 * is a lost denominator).
 *
 * ⚠ NEITHER term is the cadastral parcel, and NEITHER is served as an AREA anywhere in the PAG
 * artefact — which is precisely why no LU coefficient may be multiplied by a parcel area.
 */
export const LU_TERRAIN_A_BATIR_DEFINITIONS = Object.freeze({
    /** Annexe II E — the CUS / DL denominator. */
    brut:
        'terrain à bâtir brut: « tous les fonds situés en zone urbanisée ou destinée à être ' +
        'urbanisée, non encore ou partiellement viabilisés »',
    /** Annexe II F — the COS / CSS denominator. */
    net:
        'terrain à bâtir net: « tous les fonds situés en zone urbanisée ou destinée à être ' +
        'urbanisée déduction faite de toutes les surfaces privées et publiques nécessaires à sa ' +
        'viabilisation »',
} as const);

/* ═══════════════════════════════ the vocabulary ═════════════════════════════ */

/** One row of the LU→canonical coefficient vocabulary. */
export interface LuCoefficientVocabularyEntry {
    /** The GeoPackage column name, verbatim. */
    readonly column: keyof Pick<
        LuNqPapRow,
        'cosMin' | 'cosMax' | 'cusMin' | 'cusMax' | 'cssMax' | 'dlMin' | 'dlMax'
    >;
    /** The statutory abbreviation, verbatim. */
    readonly abbreviation: 'COS' | 'CUS' | 'CSS' | 'DL';
    /** The full statutory term, VERBATIM in French — never replaced by the harmonised name. */
    readonly statutoryTerm: string;
    /** Canonical parameter name emitted into `RuleProvenance.parameter`. */
    readonly parameter: string;
    /** Unit, or null for a dimensionless ratio. */
    readonly unit: string | null;
    /** R2 `valueBasis.code` — the SERVED statutory denominator, verbatim. */
    readonly valueBasisCode: LuValueBasisCode;
    /** The denominator sentence, verbatim from Annexe II, carried into every rule's note. */
    readonly denominatorClause: string;
    /** `'max'` or `'min'` — the two are different facts and never collapse. */
    readonly bound: 'max' | 'min';
}

/**
 * THE ONE TABLE. Seven columns, four abbreviations, THREE distinct denominators.
 *
 * ⚠ Read the `valueBasisCode` column before reading the numbers: `coverageRatio` and
 * `floorAreaRatio` do NOT share a denominator, and `dwellingDensity` is not a ratio at all.
 *
 * ⚠ `CSS_MIN` does not exist — and that is the statute, not an omission: Art. 26 permits minima
 * ONLY for CUS and DL (« Des valeurs minima peuvent également être définies pour le coefficient
 * d'utilisation du sol et pour la densité de logement »). The artefact nevertheless ships a
 * `COS_MIN` column and 44 rows carry a strictly positive value in it — a served value the
 * statute does not provide for. It is emitted like any other (recording what the state serves is
 * this file's whole job) with the anomaly named in its note; see §7 of the lane findings.
 */
export const LU_COEFFICIENT_VOCABULARY: readonly LuCoefficientVocabularyEntry[] = [
    {
        column: 'cosMax',
        abbreviation: 'COS',
        statutoryTerm: 'coefficient d’occupation du sol',
        parameter: 'maxCoverageRatio',
        unit: null,
        valueBasisCode: 'terrain-a-batir-net',
        denominatorClause:
            'le rapport entre la surface d’emprise au sol de la ou des constructions (au ' +
            'niveau du terrain naturel) et la surface du terrain à bâtir net',
        bound: 'max',
    },
    {
        column: 'cosMin',
        abbreviation: 'COS',
        statutoryTerm: 'coefficient d’occupation du sol',
        parameter: 'minCoverageRatio',
        unit: null,
        valueBasisCode: 'terrain-a-batir-net',
        denominatorClause:
            'le rapport entre la surface d’emprise au sol de la ou des constructions (au ' +
            'niveau du terrain naturel) et la surface du terrain à bâtir net',
        bound: 'min',
    },
    {
        column: 'cusMax',
        abbreviation: 'CUS',
        statutoryTerm: 'coefficient d’utilisation du sol',
        parameter: 'maxFloorAreaRatio',
        unit: null,
        valueBasisCode: 'terrain-a-batir-brut',
        denominatorClause:
            'le rapport entre la somme des surfaces construites brutes de tous les niveaux et la ' +
            'surface totale du terrain à bâtir brut, pour autant que la hauteur d’étage ' +
            'moyenne ne dépasse pas 5 mètres; les niveaux de 5 à 10 m comptent double, ceux de ' +
            'plus de 10 m comptent triple',
        bound: 'max',
    },
    {
        column: 'cusMin',
        abbreviation: 'CUS',
        statutoryTerm: 'coefficient d’utilisation du sol',
        parameter: 'minFloorAreaRatio',
        unit: null,
        valueBasisCode: 'terrain-a-batir-brut',
        denominatorClause:
            'le rapport entre la somme des surfaces construites brutes de tous les niveaux et la ' +
            'surface totale du terrain à bâtir brut, pour autant que la hauteur d’étage ' +
            'moyenne ne dépasse pas 5 mètres; les niveaux de 5 à 10 m comptent double, ceux de ' +
            'plus de 10 m comptent triple',
        bound: 'min',
    },
    {
        column: 'cssMax',
        abbreviation: 'CSS',
        statutoryTerm: 'coefficient de scellement du sol',
        parameter: 'maxSoilSealingRatio',
        unit: null,
        valueBasisCode: 'terrain-a-batir-net',
        denominatorClause:
            'le rapport entre la surface de sol scellée et la surface du terrain à bâtir net',
        bound: 'max',
    },
    {
        column: 'dlMax',
        abbreviation: 'DL',
        statutoryTerm: 'densité de logement',
        parameter: 'maxDwellingDensity',
        unit: 'dwellings/ha',
        valueBasisCode: 'terrain-a-batir-brut-hectares',
        denominatorClause:
            'le rapport entre le nombre d’unités de logement et le terrain à bâtir brut ' +
            'exprimé en hectares',
        bound: 'max',
    },
    {
        column: 'dlMin',
        abbreviation: 'DL',
        statutoryTerm: 'densité de logement',
        parameter: 'minDwellingDensity',
        unit: 'dwellings/ha',
        valueBasisCode: 'terrain-a-batir-brut-hectares',
        denominatorClause:
            'le rapport entre le nombre d’unités de logement et le terrain à bâtir brut ' +
            'exprimé en hectares',
        bound: 'min',
    },
];

/**
 * The measured national census of `PAG_PAG_NQ_PAP`, taken by this lane from the artefact on
 * 2026-09-01 (n = 3,017). Carried as DATA so a test can assert the mapper's UNKNOWN population
 * against an independent count rather than against its own behaviour.
 */
export const LU_NQ_PAP_CENSUS_2026_09_01 = Object.freeze({
    rows: 3017,
    distinctCommunes: 94,
    nonNull: Object.freeze({ cosMax: 3010, cusMax: 3010, cssMax: 3010, dlMax: 2950 }),
    strictlyPositive: Object.freeze({ cosMax: 2998, cusMax: 2998, cssMax: 3000, dlMax: 2827 }),
    allFourMaximaNonNull: 2950,
    allFourMaximaStrictlyPositive: 2826,
    /** 3,017 − 2,826 — the rows carrying at least one absent-or-zero coefficient. */
    rowsWithAnyUnknownMaximum: 191,
    zeros: Object.freeze({ cosMax: 12, cssMax: 10, dlMax: 123 }),
    /** The E5 correction: of the 12 `COS_MAX = 0` rows, only 3 name ZAD. */
    cosMaxZeroByDenominationKind: Object.freeze({ zad: 3, voirie: 5, spec: 1, neither: 3 }),
    /** DL_MAX = 0 rows that sit beside a strictly positive COS_MAX. */
    dlMaxZeroWithPositiveCosMax: 111,
} as const);

/* ═══════════════════════════ the UNKNOWN classifier ═════════════════════════ */

/** How a served coefficient cell was classified. */
export type LuCoefficientKind = 'value' | 'unknown-absent' | 'unknown-zero' | 'refused-domain';

/** The result of classifying one served cell. Pure, total. */
export interface LuClassifiedCoefficient {
    readonly kind: LuCoefficientKind;
    /** The number to emit, or null for every non-`value` kind. */
    readonly value: number | null;
    /** The raw served cell, verbatim, for the note. */
    readonly raw: number | null;
}

/**
 * PURE: classify one served coefficient cell under the measured UNKNOWN rule.
 *
 *   null            → `unknown-absent`  (46–52% of minima, 0.2–2.2% of maxima)
 *   0               → `unknown-zero`    (both a coherent reading and an unfilled slot; measured)
 *   < 0             → `refused-domain`  (0 rows measured — a domain breach, refused, not clipped)
 *   COS/CSS > 1     → `refused-domain`  (0 rows measured — a ratio of area over area cannot
 *                                        exceed 1; a value above it is a schema change)
 *   otherwise       → `value`
 *
 * ⚠ NO upper bound is imposed on CUS or DL: the statute declares none (CUS legitimately exceeds
 * 1 — measured range 0.0–10.0 — because its numerator sums every storey, and DL is a count per
 * hectare, measured 0–500). Inventing a ceiling here would be exactly the guess this file exists
 * to prevent.
 */
export function classifyLuCoefficient(
    raw: number | null | undefined,
    entry: LuCoefficientVocabularyEntry,
): LuClassifiedCoefficient {
    if (raw === null || raw === undefined || !Number.isFinite(raw)) {
        return { kind: 'unknown-absent', value: null, raw: raw === undefined ? null : (raw ?? null) };
    }
    if (raw < 0) return { kind: 'refused-domain', value: null, raw };
    if (raw === 0) return { kind: 'unknown-zero', value: null, raw };
    const boundedByOne = entry.abbreviation === 'COS' || entry.abbreviation === 'CSS';
    if (boundedByOne && raw > 1) return { kind: 'refused-domain', value: null, raw };
    return { kind: 'value', value: raw, raw };
}

/* ═══════════════════ minted planning entities (R1 referent) ═════════════════ */

/**
 * Deterministic id of the minted `SiteIntelPlan` for one commune's PAG — ONE naming seat, so the
 * Zone's `planId`, the rules' plan-`basis` fallback and the chain's carried entity can never
 * spell the same plan two ways.
 *
 * The instrument IS the commune's PAG: the artefact is "les géométries de TOUS les PAG", and
 * `CODE_COM` is the only instrument identity it serves. There is no per-zone plan id.
 */
export function luPlanEntityId(codeCom: string): string {
    return `lu-plan-${codeCom}`;
}

/** Deterministic id of the minted `SiteIntelZone` for one NQ-PAP row (keyed on the unique UUID). */
export function luZoneEntityId(xtfId: string): string {
    return `lu-zone-nq-pap-${xtfId}`;
}

/** Deterministic rule id. One seat, so no two call sites spell a rule id differently. */
export function luRuleEntityId(xtfId: string, parameter: string): string {
    return `lu-${xtfId}-${parameter}`;
}

function toNativeGeometry(g: LuServedGeometry | null): NativeCrsGeometry | null {
    if (g === null) return null;
    return {
        crs: LU_NATIVE_CRS,
        kind: g.type,
        // Coordinates exactly as served (LUREF eastings/northings, ring order and closing vertex
        // kept, interior rings kept) — uninterpreted at L0 per NativeCrsGeometrySchema's doctrine.
        coordinates: g.coordinates as NativeCrsGeometry['coordinates'],
    };
}

/**
 * PURE: one NQ-PAP row → the minted `SiteIntelPlan` for its commune, or null when no `CODE_COM`
 * is served. `Plan.status` is REQUIRED and MIRRORED — and the artefact's own title is the only
 * status it serves: these are the PAGs « version 2011 » EN VIGUEUR. That phrase is mirrored
 * verbatim rather than translated into a lifecycle token PRYZM invented.
 */
export function mapLuRowToPlan(row: LuNqPapRow): SiteIntelPlan | null {
    if (row.codeCom === null || row.codeCom.trim() === '') return null;
    return SiteIntelPlanSchema.parse({
        id: luPlanEntityId(row.codeCom),
        // The Luxembourgish instrument, verbatim (plan d'aménagement général) — open string.
        kind: 'plan d’aménagement général',
        // VERBATIM from the dataset title on data.public.lu, never harmonised.
        status: 'version 2011 en vigueur',
        // The artefact serves NO date axis at all (see the header). Guessing one would be the
        // fabricated legal address R3 exists to kill.
        adoptedDate: null,
        inForceFrom: null,
        inForceTo: null,
        // No SiteIntelDocument entities are minted: the partie-écrite FILENAME is not a
        // retrievable document identity, and minting one would be a dangling reference. It
        // travels verbatim on every rule's `source.document` instead.
        documents: [],
        geometryRef: null,
        source: LU_PAG_SOURCE_ID,
        version: null,
    });
}

/**
 * PURE: one NQ-PAP row → the minted `SiteIntelZone` the rules cite, or null when the row serves
 * no geometry AND no commune (nothing a Zone could be about).
 */
export function mapLuRowToZone(row: LuNqPapRow, plan: SiteIntelPlan): SiteIntelZone | null {
    const geometry = toNativeGeometry(row.geometry);
    if (geometry === null) return null;
    return SiteIntelZoneSchema.parse({
        id: luZoneEntityId(row.xtfId),
        planId: plan.id,
        typology: {
            // The national code for these zones IS the layer: a "zone soumise à un PAP nouveau
            // quartier" (art. 37). The zone's DENOMINATION is a name, not a code, so it does not
            // go here — it rides `source.object_id`.
            national: 'PAP_NQ',
            // No cross-country mapping EXISTS for LU degré-d'utilisation zoning. Never guessed.
            harmonised: null,
        },
        geometry,
        source: LU_PAG_SOURCE_ID,
    });
}

/* ══════════════════════════ the R1 referent ladder ══════════════════════════ */

interface LuApplicabilityTarget {
    readonly plan: SiteIntelPlan | null;
    readonly zone: SiteIntelZone | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
}

/**
 * The R1 referent ladder — mints what it cites, cites only what it minted:
 *   1. commune resolved + geometry served → mint Plan + Zone; basis cites the Zone.
 *   2. commune resolved, NO geometry      → basis cites the minted Plan.
 *   3. geometry served, NO commune        → carry the geometry INLINE, cite nothing.
 *   4. neither                            → throw BY NAME.
 */
function mintLuApplicabilityTarget(row: LuNqPapRow): LuApplicabilityTarget {
    const plan = mapLuRowToPlan(row);
    const geometry = toNativeGeometry(row.geometry);
    if (plan !== null && geometry !== null) {
        const zone = mapLuRowToZone(row, plan);
        if (zone !== null) {
            return { plan, zone, basis: [{ kind: 'zone', ref: zone.id }], inlineGeometry: null };
        }
    }
    if (plan !== null) {
        return { plan, zone: null, basis: [{ kind: 'plan', ref: plan.id }], inlineGeometry: null };
    }
    if (geometry !== null) {
        return { plan: null, zone: null, basis: [], inlineGeometry: geometry };
    }
    throw new Error(
        `lu-rule-mapper: PAG_PAG_NQ_PAP row ${row.xtfId} ` +
            `(${row.denomination ?? 'unnamed'}) served NO geometry and NO CODE_COM — a rule that ` +
            'applies nowhere is not a rule (R1 at-least-one-leg), and minting a referent from a ' +
            'half-known feature would be the dangling-ref defect. Refusing by name instead of guessing.',
    );
}

/* ═══════════════════════════════ rule building ══════════════════════════════ */

/** What one mapped row yields: the minted referents + the rules that cite them. */
export interface LuMappedRuleSet {
    readonly plan: SiteIntelPlan | null;
    readonly zone: SiteIntelZone | null;
    readonly rules: readonly SiteIntelRule[];
}

function luSourceRef(row: LuNqPapRow): {
    country: string;
    authority: string;
    dataset: string;
    plan_id: string | null;
    object_id: string | null;
    document: string | null;
    article: string;
    page: null;
} {
    return {
        country: 'LU',
        authority: LU_RULE_AUTHORITY,
        dataset: LU_RULE_DATASET,
        // The commune code IS the plan identity this artefact serves.
        plan_id: row.codeCom,
        // The zone's own name plus its UUID — the DENOMINATION alone is NOT unique (2,845 of
        // 3,017 distinct), so the transfer id travels with it.
        object_id:
            row.denomination !== null && row.denomination.trim() !== ''
                ? `${row.denomination} (xtf_id ${row.xtfId})`
                : `xtf_id ${row.xtfId}`,
        // The written part is served as a FILENAME, not a URL. Carried verbatim — it is what a
        // human needs to find the partie écrite — and never dressed up as a retrievable document.
        document: row.nomFichierEc,
        // The statutory address of the VALUE's definition, not of the value.
        article:
            'RGD 08/03/2017 (contenu du PAG), Annexe II — Terminologie du degré ' +
            'd’utilisation du sol; valeurs fixées sous Art. 26',
        page: null,
    };
}

interface BuildLuRuleArgs {
    readonly row: LuNqPapRow;
    readonly entry: LuCoefficientVocabularyEntry;
    readonly classified: LuClassifiedCoefficient;
    readonly fetchedAtIso: string;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
}

/**
 * The note every LU coefficient rule carries. It is the C74 both-numbers discipline applied to a
 * DENOMINATOR rather than to a value: it names the statutory basis, states that the basis is not
 * served as an area, and — for a tier-6 row — names the measurement that made it tier 6.
 */
function luNote(a: BuildLuRuleArgs): string {
    const e = a.entry;
    const head =
        `${e.abbreviation} (${e.statutoryTerm}), ${e.bound}. BASIS: ${e.denominatorClause}. ` +
        'The denominator is a PLANNING construct (terrain à bâtir brut/net), NOT a cadastral ' +
        'parcel, and its area is NOT served anywhere in this artefact — do not multiply this ' +
        'value by a parcel area. The coefficient is a ZONE AVERAGE that individual lots may ' +
        'exceed (RGD 08/03/2017 Art. 26).';
    const cusCaveat =
        e.abbreviation === 'CUS'
            ? ' CUS is NOT a plain floor-area ratio: storeys averaging 5–10 m count DOUBLE and ' +
              'those over 10 m count TRIPLE in its numerator, so CUS x area bounds WEIGHTED floor ' +
              'area, not floor area.'
            : '';
    const cosMinCaveat =
        e.column === 'cosMin'
            ? ' ⚠ ANOMALY: Art. 26 permits minima only for CUS and DL, yet the artefact ships a ' +
              'COS_MIN column with 44 strictly-positive values nationally. Recorded as served; ' +
              'the statutory footing for a COS minimum is UNRESOLVED.'
            : '';
    switch (a.classified.kind) {
        case 'value':
            return head + cusCaveat + cosMinCaveat;
        case 'unknown-absent':
            return (
                head +
                cusCaveat +
                cosMinCaveat +
                ` UNKNOWN: ${e.column} was served as NULL. Measured nationally 2026-09-01 ` +
                `(n=${LU_NQ_PAP_CENSUS_2026_09_01.rows}): the maxima are non-null on 97.8–99.8% ` +
                'of rows and the minima on 46.0–52.5%, and across the 94 communes COS_MIN is ' +
                'always-null in 28, always-filled in 34 and MIXED in 32 — so NULL and 0 are two ' +
                'municipal encodings of "no value set", not two facts. UNKNOWN ≠ 0 ≠ unlimited ≠ ' +
                'no-restriction (E4 control 9).'
            );
        case 'unknown-zero':
            return (
                head +
                cusCaveat +
                cosMinCaveat +
                ` UNKNOWN: ${e.column} was served as 0. Measured nationally 2026-09-01: ` +
                'COS_MAX=0 on 12 rows (3 named ZAD, 5 named "voirie", 1 "(Partie SPEC)", 3 ' +
                'neither — this lane CORRECTS the "all ZAD" reading), CSS_MAX=0 on 10, DL_MAX=0 ' +
                'on 123 of which 111 sit beside a strictly-positive COS_MAX (buildable land with ' +
                'a stated zero dwelling density). Both a real-zero and an unfilled-slot ' +
                'population exist and NOTHING SERVED SEPARATES THEM, so the value is refused ' +
                'rather than read either way. UNKNOWN ≠ 0 (E4 control 9).'
            );
        case 'refused-domain':
            return (
                head +
                cusCaveat +
                cosMinCaveat +
                ` REFUSED: ${e.column} was served as ${String(a.classified.raw)}, which is ` +
                'outside the domain the statute defines for it (a ratio of an area to an area ' +
                'cannot be negative, and COS/CSS cannot exceed 1). Measured nationally ' +
                '2026-09-01: ZERO rows breach either bound, so a breach is a national schema ' +
                'change, not a data point — refused by name, never clipped.'
            );
    }
}

function buildLuRule(a: BuildLuRuleArgs): SiteIntelRule {
    const isKnown = a.classified.kind === 'value';
    const tier: 1 | 6 = isKnown ? 1 : 6;
    const derivation: RuleDerivation = 'DIRECT';
    const valueLocation: RuleValueLocation = 'attribute';
    return SiteIntelRuleSchema.parse({
        id: luRuleEntityId(a.row.xtfId, a.entry.parameter),
        body: null,
        applicability: {
            basis: a.basis,
            geometry: a.inlineGeometry,
            // The artefact serves NO use axis on NQ-PAP rows (the CATEGORIE vocabulary lives on
            // PAG_PAG_ZONAGE, a different layer with no numerics and no served join). An empty
            // useScope is the honest "not use-conditioned here" — never a guessed token.
            useScope: [],
            // Luxembourg serves NO per-rule instrument ladder. rank:null here means: the ladder
            // exists in law (PAG → PAP → règlement sur les bâtisses) but is NOT a per-feature
            // fact this register serves, so it stays adapter DATA in LU_APPLICABILITY_LADDER.
            rank: null,
            condition: null,
        },
        provenance: {
            parameter: a.entry.parameter,
            value: a.classified.value,
            unit: a.entry.unit,
            source: luSourceRef(a.row),
            derivation,
            valueLocation,
            confidence: { tier, note: luNote(a) },
            // R2 — emitted on EVERY row, tier-6 included: the denominator is a served fact about
            // the rule regardless of whether the value is known (the DK doctrine).
            valueBasis: { scheme: LU_VALUE_BASIS_SCHEME, code: a.entry.valueBasisCode },
            // R5 — Art. 26, verbatim.
            normativeForce: LU_NORMATIVE_FORCE,
            // R3 — see the header: the artefact carries no date column on this layer at all.
            validityBasis: 'ingestion',
            valid_from: a.fetchedAtIso,
            valid_to: null,
        },
    });
}

/**
 * PURE: one `PAG_PAG_NQ_PAP` row → the minted Plan/Zone + one `SiteIntelRule` per vocabulary
 * entry. SEVEN rules are emitted for EVERY row — a coefficient the register left null or zero
 * becomes a VISIBLE tier-6 UNKNOWN rule, never a dropped row (E4 control 9; the brief's
 * "tier-6 UNKNOWN rows, visible, never dropped").
 *
 * Every rule validates against `SiteIntelRuleSchema` (a value with no legal address is not a
 * value — the parse enforces it), and every `basis` ref resolves to an entity RETURNED HERE.
 */
export function mapLuNqPapRowToRules(row: LuNqPapRow, fetchedAtIso: string): LuMappedRuleSet {
    const target = mintLuApplicabilityTarget(row);
    const rules: SiteIntelRule[] = [];
    for (const entry of LU_COEFFICIENT_VOCABULARY) {
        const classified = classifyLuCoefficient(row[entry.column], entry);
        rules.push(
            buildLuRule({
                row,
                entry,
                classified,
                fetchedAtIso,
                basis: target.basis,
                inlineGeometry: target.inlineGeometry,
            }),
        );
    }
    return { plan: target.plan, zone: target.zone, rules };
}

/**
 * PURE helper for consumers and tests: how many of a mapped rule set are tier-6 UNKNOWN.
 * Exists so the UNKNOWN population can be COUNTED against the national census rather than
 * eyeballed (the acceptance's "tier-6 UNKNOWNs visible and counted").
 */
export function countLuUnknownRules(rules: readonly SiteIntelRule[]): number {
    return rules.filter((r) => r.provenance.confidence.tier === 6).length;
}
