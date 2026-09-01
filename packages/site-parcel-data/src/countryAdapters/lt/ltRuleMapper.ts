// E6-LT — LITHUANIA (LT) · the PURE rule mapper: ASGR consolidation attributes → E1a
// `SiteIntelRule` objects, PLUS the minted planning entities those rules cite (the R1 referent
// contract: "every `basis` reference MUST resolve to a MINTED entity"). Same shape and same
// boundary as the EE exemplar (`ee/eeRuleMapper.ts`) — TOTAL, PURE, DETERMINISTIC: same
// polygon in → byte-identical rules out. No fetch, no clock (the caller passes `fetchedAtIso`),
// no business logic. It does NOT decide what may be built; it records what the state serves,
// with its legal address, and REFUSES BY NAME where the state's own encoding is unsafe.
//
// ══ THE NAMED BLOCKER: MAX_INTENS — RESOLVED AS **REFUSED**, WITH EVIDENCE ═════════════════
// The lane brief required settling `MAX_INTENS` from the official ASGR methodology first, and
// refusing if it did not settle. Both halves were executed on 2026-09-01:
//
//   (a) THE OFFICIAL SPECIFICATION WAS FETCHED AND READ. VTPSI "TPDR, TPDRIS duomenų,
//       teikiamų į Lietuvos erdvinės informacijos portalą, specifikacija", 2024-06-18 —
//       https://www.geoportal.lt/download/Specifikacijos/VTPSI_LEIP_specifikacija_20240628.pdf
//       (fetched 2026-09-01, 1,191,746 bytes, 21 pages, PDF 1.7). Its Table 20 (ASGR layer
//       attributes) gives every dimensioned field its unit IN THE TEXT — `MAX_AUK_M`
//       "…pastatų aukštis (**metrais**)", `MAX_TANKIS` "…užstatymo tankis, **procentai**",
//       `MIN_APZELD` "…dalys **procentais**" — and gives `MAX_INTENS` ONLY a data type
//       ("Skaičius, 1 ženklas po kablelio" — a number with one decimal) and NO UNIT AT ALL.
//       The same contrast repeats in the sibling per-TPD dispositions layer (`sprendiniai`
//       layer 82, aliases read live 2026-09-01: `MAX_TANKIS` ", procentai", `MAX_AUK_M` ", m",
//       `MAX_SKL_PL` ", kv. m", `MAX_INTENS` — nothing). The specification therefore does NOT
//       settle the unit; it declines to state one.
//   (b) THE METHODOLOGY IT DEFERS TO IS NOT PUBLISHED. The spec says the data is
//       "rekomendacinio pobūdžio, rengiami pagal **ASGR sudarymo metodiką**" — compiled per the
//       ASGR compilation methodology — and that methodology could not be obtained
//       (geoportal.lt/download/Specifikacijos/ directory → HTTP 403;
//       tpdr.planuojustatau.lt/assets/ASGR_metodika.pdf → HTTP 404; web search surfaces no
//       public copy). Recorded, not guessed.
//   (c) AND THE SERVED DATA IS DEMONSTRABLY **MIXED-ENCODING**, which is stronger than
//       "ambiguous" — no methodology sentence could rescue it. Measured live 2026-09-01:
//       • ASGR: 23,932 filled `MAX_INTENS` of 175,570 polygons — 22,921 ≤ 10 and **1,011 > 10,
//         of which 122 > 100**.
//       • The per-TPD `sprendiniai` layer 82: 25,270 filled — 949 > 10, 56 > 100.
//       • The > 10 rows are internally coherent ONLY under a PERCENT reading, and the ≤ 10 rows
//         ONLY under a RATIO reading, in the same column, from different documents:
//           TPD T00071674 — `MAX_INTENS 59` with `MAX_TANKIS 21`(%) and 3 storeys. A footprint
//             of 21% over 3 storeys cannot exceed a floor-area ratio of 0.63, so 59 is
//             impossible as a ratio and exact as a percent (0.59).
//           TPD T00087142 (the 20-parcel baseline plan) — `MAX_INTENS 1` with `MAX_TANKIS 45`(%)
//             and `MAX_AUK_M 25` m. A ratio of 1.0 is ordinary; a percent reading would mean
//             0.01 floor-area ratio on a plot permitted 45% coverage, which is impossible.
//         Two documents, one column, two incompatible encodings — and NO served flag
//         distinguishes them.
//
// ⇒ **MAX_INTENS IS REFUSED.** It is emitted as a FIRST-CLASS, VISIBLE tier-6 rule (never
// dropped), value `null`, carrying an R2 `valueBasis` of
// `{scheme:'lt-asgr-intensity-unit', code:'UNRESOLVED-RATIO-OR-PERCENT'}` so the refusal is
// MACHINE-VISIBLE, and a confidence note carrying BOTH numbers (C74): the raw served value and
// what it would mean under each reading, which differ by 100x. A consumer that computes GFA
// from this rule has ignored a null value at tier 6 AND a present `valueBasis` — both of which
// the frozen schema makes unmissable. A wrong intensity unit is a 100x error in buildable area;
// the refusal is the correct answer (E4 control 9, C74, §CONTEXT-DATA-HONESTY).
//
// ⛔ DO NOT "FIX" THIS BY PICKING A READING. The disambiguation that WOULD work — comparing
// each value against the coverage x storey ceiling — needs a storey count ASGR does not serve,
// and is deterministic INFERENCE (tier 3) plus business logic, i.e. a different lane's work
// under E4 control 10. It is recorded in the findings file, not performed here.
//
// ══ ZERO IS UNKNOWN, MEASURED (E4 control 9: UNKNOWN != 0 != no-limit) ══════════════════════
// Every one of the four numerics has a large zero population that cannot be a legal value, and
// for the one field where zero IS semantically coherent the data refuses to support that
// reading either. Measured 2026-09-01 (returnCountOnly, 175,570 polygons):
//   MAX_AUK_M  = 0 → 3,045 rows (< 0: none). A maximum permitted height of zero is a
//     prohibition the register expresses no other way; it is fill quality.
//   MAX_TANKIS = 0 → 3,945 rows; 2,570 of them share a row with `MAX_AUK_M = 0`.
//   MAX_INTENS = 0 → 2,095 rows (refused anyway).
//   MIN_APZELD = 0 → 1,802 rows. A *minimum* of zero IS coherent ("no green share required"),
//     so this one was checked rather than assumed: 1,343 of the 1,802 (74.5%) co-occur with an
//     unfilled-looking `MAX_AUK_M = 0`, while 441 sit beside a real positive height. BOTH
//     populations exist and nothing served separates them — and reading it as a real zero is
//     the PERMISSIVE error (asserting a permission the register never gave, the L-616
//     overstatement). It is therefore tier-6 UNKNOWN too, with the measurement in the note.
// Out-of-domain values are refused the same way: `MAX_TANKIS > 100` (16 rows, up to 2931) and
// `< 0` (2 rows) cannot be percentages of a plot.
// No upper bound is imposed on `MAX_AUK_M`: the register declares none, and inventing a
// national height ceiling here would be exactly the kind of guess this file exists to prevent
// (the 6 rows above 200 m are recorded in the findings, not silently clipped).
//
// ══ R3 VALIDITY — DECIDED FROM FIELD SEMANTICS AND PROVEN BY MEASUREMENT ════════════════════
// See `ltAsgrProvider.ts`'s header for the cross-service proof that ASGR's `<FIELD>D` is the
// instrument's APPROVAL date (`ribos.TVIRT_DATA`), not its registration date. Consequently:
//   • CLASSIFICATION rules (the four fields that carry per-value provenance) →
//     `validityBasis: 'legal'` with that approval date.
//   • NUMERIC rules → `validityBasis: 'ingestion'` with the fetch date, because ASGR serves NO
//     provenance column for them at all: naming one of the polygon's cited documents as the
//     source of a number the register never attributed would be a fabricated legal address.
//     The candidate documents travel in the note so a human can resolve it; the machine must
//     not pretend it is resolved. A point-in-time evaluator must treat 'ingestion' windows as
//     NOT answering "was this in force on date D" — which, for these values, is the truth.
//
// ══ R5 NORMATIVE FORCE ═════════════════════════════════════════════════════════════════════
// Every ASGR rule carries `normativeForce: 'rekomendacinio pobūdžio'` — mirrored VERBATIM from
// the VTPSI specification, never harmonised. ASGR is a consolidation; the binding instrument is
// the underlying TPD. This is the exact live form `provenance.ts` names as R5's LT example.

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
import {
    LT_ASGR_NUMERIC_FIELDS,
    type LtAsgrClassificationField,
    type LtAsgrClassifiedValue,
    type LtAsgrNumericField,
    type LtAsgrPolygon,
    type LtTpdRegisterRow,
} from './ltAsgrProvider.js';
import { LT_ASGR_SOURCE_ID, LT_TPDR_RIBOS_SOURCE_ID } from './ltSourceRefs.js';

/** The publishing authority string carried in every LT rule's source ref. */
export const LT_RULE_AUTHORITY = 'VTPSI (Valstybinė teritorijų planavimo ir statybos inspekcija)';

/** The ASGR dataset name carried in every LT rule's source ref. */
export const LT_RULE_DATASET = 'ASGR';

/**
 * R5, verbatim from the VTPSI LEIP specification (2024-06-18, Table 19 row 2):
 * *"Duomenys yra rekomendacinio pobūdžio"*. Mirrored, never harmonised, never translated into
 * a boolean.
 */
export const LT_ASGR_NORMATIVE_FORCE = 'rekomendacinio pobūdžio';

/* ═══════════════════════ the MAX_INTENS refusal (the named blocker) ═════════════════════ */

/** R2 `valueBasis.scheme` for the unresolved LT intensity unit. */
export const LT_INTENSITY_UNIT_SCHEME = 'lt-asgr-intensity-unit';
/** R2 `valueBasis.code` — the refusal, machine-visible. */
export const LT_INTENSITY_UNIT_UNRESOLVED = 'UNRESOLVED-RATIO-OR-PERCENT';

/**
 * The refusal text, carried on EVERY `MAX_INTENS` rule. It states BOTH numbers (C74): what the
 * served value means under each reading. `raw` is the value verbatim as served.
 */
export function ltIntensityRefusalNote(raw: number | null): string {
    if (raw === null) {
        return (
            'MAX_INTENS not served for this polygon. The column is REFUSED regardless: its unit ' +
            'is unresolved (see ltRuleMapper.ts header) — UNKNOWN, never 0 and never no-limit.'
        );
    }
    const asRatio = ltFormatServedSingle(raw, 1);
    const asPercent = ltFormatServedSingle(raw / 100, 3);
    return (
        `REFUSED — MAX_INTENS unit unresolved. Served value ${asRatio}. As a floor-area RATIO ` +
        `that is ${asRatio}; as a PERCENT of a ratio it is ${asPercent} — a 100x difference in ` +
        'buildable area, and the served column demonstrably contains BOTH encodings (measured ' +
        '2026-09-01: 22,921 of 23,932 filled values <= 10, 1,011 > 10 incl. 122 > 100; ' +
        'TPD T00071674 serves 59 against 21% coverage over 3 storeys, which is only coherent as ' +
        'a percent, while TPD T00087142 serves 1 against 45% coverage, which is only coherent ' +
        'as a ratio). The official VTPSI LEIP specification (2024-06-18) states units for ' +
        'MAX_AUK_M/MAX_TANKIS/MIN_APZELD and NONE for MAX_INTENS, and the ASGR compilation ' +
        'methodology it defers to is not published. No unit is guessed here.'
    );
}

/* ═══════════════════════ numeric de-serialisation + domain guards ═══════════════════════ */

/**
 * `MAX_AUK_M` and `MAX_INTENS` are esri `Single` (float32) and arrive widened to float64, so a
 * served `0.2` reads as `0.20000000298023224`. This undoes ONLY that widening, and only when it
 * is PROVABLY lossless: round to the specification's declared decimal count, and keep the
 * rounded value only if it re-narrows to the identical float32. Otherwise the raw value stands.
 * This is de-serialisation, not a transformation of the datum — a silent `toFixed()` would be.
 */
export function ltDeserialiseSingle(value: number, decimals: number): number {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** decimals;
    const rounded = Math.round(value * factor) / factor;
    return Math.fround(rounded) === Math.fround(value) ? rounded : value;
}

/** Format a served Single for human notes without inventing precision. */
function ltFormatServedSingle(value: number, decimals: number): string {
    return String(ltDeserialiseSingle(value, decimals));
}

/** The outcome of reading one numeric regulation value under the domain guards. */
export interface LtNumericReading {
    /** The usable value, or null when the guard refused it. */
    readonly value: number | null;
    /** True when the value is UNKNOWN — never 0, never no-limit. */
    readonly unknown: boolean;
    /** The raw served value, kept for the note. */
    readonly raw: number | null;
    /** Why it was refused, or null when accepted. */
    readonly refusalReason: string | null;
}

/**
 * PURE: read one ASGR numeric under the measured guards documented in the file header.
 * `MAX_INTENS` is ALWAYS refused (the unit blocker) whatever its value.
 */
export function readLtNumeric(field: LtAsgrNumericField, raw: number | null): LtNumericReading {
    if (field === 'MAX_INTENS') {
        return { value: null, unknown: true, raw, refusalReason: ltIntensityRefusalNote(raw) };
    }
    if (raw === null) {
        return {
            value: null,
            unknown: true,
            raw: null,
            refusalReason: `ASGR served no ${field} for this polygon — UNKNOWN, never 0 and never no-limit`,
        };
    }
    if (field === 'MAX_AUK_M') {
        if (raw <= 0) {
            return {
                value: null,
                unknown: true,
                raw,
                refusalReason:
                    `ASGR served MAX_AUK_M=${ltFormatServedSingle(raw, 2)} — a maximum permitted ` +
                    'height of zero or less is not a legal value but fill quality (3,045 such ' +
                    'rows nationally, measured 2026-09-01): UNKNOWN, never 0 and never no-limit',
            };
        }
        return { value: ltDeserialiseSingle(raw, 2), unknown: false, raw, refusalReason: null };
    }
    if (field === 'MAX_TANKIS') {
        if (raw <= 0 || raw > 100) {
            return {
                value: null,
                unknown: true,
                raw,
                refusalReason:
                    `ASGR served MAX_TANKIS=${raw} — outside the 0<v<=100 percentage domain the ` +
                    'specification declares ("užstatymo tankis, procentai"). Measured 2026-09-01: ' +
                    '3,945 rows at 0, 16 above 100 (up to 2931), 2 below 0. UNKNOWN, never 0 and ' +
                    'never no-limit',
            };
        }
        return { value: raw, unknown: false, raw, refusalReason: null };
    }
    // MIN_APZELD
    if (raw <= 0 || raw > 100) {
        return {
            value: null,
            unknown: true,
            raw,
            refusalReason:
                `ASGR served MIN_APZELD=${raw}. A minimum green share of zero IS semantically ` +
                'coherent, so this was measured rather than assumed: of the 1,802 zero rows, ' +
                '1,343 (74.5%) co-occur with an unfilled-looking MAX_AUK_M=0 and 441 sit beside a ' +
                'real positive height — both populations exist and nothing served separates them. ' +
                'Reading it as a real zero would assert a permission the register never gave, so ' +
                'it is UNKNOWN (measured 2026-09-01)',
        };
    }
    return { value: raw, unknown: false, raw, refusalReason: null };
}

/* ═══════════════════════ the LT → canonical vocabulary ══════════════════════════════════ */

/** One row of the LT→canonical rule vocabulary. */
export interface LtRuleVocabularyEntry {
    /** The ASGR attribute name, verbatim (layer descriptor, 2026-09-01). */
    readonly ltAttribute: LtAsgrNumericField | LtAsgrClassificationField;
    /** Canonical parameter name emitted into `RuleProvenance.parameter`. */
    readonly parameter: string;
    /** Unit, or null for dimensionless / codelist values. */
    readonly unit: string | null;
    /**
     * R2 `valueBasis` carried on every rule from this attribute, or null.
     *
     * The percentage fields carry their DENOMINATOR (E4 control 8: the denominator must survive
     * normalization). Both are declared by the register against the **žemės sklypas** — the
     * cadastral LAND PLOT — while the ASGR polygon they are served on is a consolidation zone
     * that routinely spans many plots. Losing that distinction is precisely the C63 Aarhus trap
     * (`bebygpct=180, af=1` → a wrong per-parcel GFA while every field parses clean).
     */
    readonly valueBasis: { readonly scheme: string; readonly code: string } | null;
}

/**
 * The measured, closed ASGR rule vocabulary. Numeric parameters reuse the canonical names the
 * EE exemplar already established (`maxHeight`, `coveragePercent`, `floorAreaRatio`) rather
 * than minting synonyms; the four classification axes keep names of their own because
 * collapsing four distinct national axes into one would destroy information the register
 * deliberately separates (each has its OWN provenance columns).
 */
export const LT_RULE_VOCABULARY: readonly LtRuleVocabularyEntry[] = [
    {
        ltAttribute: 'MAX_AUK_M',
        parameter: 'maxHeight',
        unit: 'm',
        // Height above ground, not an absolute altitude: the sibling `sprendiniai` layer 82
        // serves ABSOLUTE altitude as a SEPARATE field (`MAX_AB_ALT`, "pastatų absoliutinė
        // altitudė, m"), so `MAX_AUK_M` is the relative measure by the register's own schema.
        valueBasis: { scheme: 'lt-height-basis', code: 'above-ground-relative' },
    },
    {
        ltAttribute: 'MAX_INTENS',
        parameter: 'floorAreaRatio',
        unit: null,
        valueBasis: { scheme: LT_INTENSITY_UNIT_SCHEME, code: LT_INTENSITY_UNIT_UNRESOLVED },
    },
    {
        ltAttribute: 'MAX_TANKIS',
        parameter: 'coveragePercent',
        unit: '%',
        valueBasis: { scheme: 'lt-denominator', code: 'zemes-sklypas' },
    },
    {
        ltAttribute: 'MIN_APZELD',
        parameter: 'minGreenPercent',
        unit: '%',
        valueBasis: { scheme: 'lt-denominator', code: 'zemes-sklypas' },
    },
    { ltAttribute: 'PAGR_PASK', parameter: 'landUseMainPurpose', unit: null, valueBasis: null },
    { ltAttribute: 'NAUD_BUD', parameter: 'landUseMode', unit: null, valueBasis: null },
    { ltAttribute: 'FUNKC_ZON', parameter: 'functionalZoneType', unit: null, valueBasis: null },
    { ltAttribute: 'NAUD_TIP', parameter: 'territoryUseType', unit: null, valueBasis: null },
];

function vocabularyEntry(attribute: string): LtRuleVocabularyEntry {
    const row = LT_RULE_VOCABULARY.find((e) => e.ltAttribute === attribute);
    // The table is total over both field unions; unreachable by type.
    if (!row) throw new Error(`lt-rule-mapper: no vocabulary row for attribute "${attribute}"`);
    return row;
}

/* ═══════════════════════ minted planning entities (R1 referent contract) ════════════════ */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deterministic id of the minted `SiteIntelPlan` for a TPD system id — ONE naming seat, so the
 * Zone's `planId`, a rule's plan `basis` and the chain's carried entity can never spell the
 * same plan two ways.
 */
export function ltPlanEntityId(tpdId: number): string {
    return `lt-plan-${tpdId}`;
}

/** Deterministic id of the minted `SiteIntelZone` for an ASGR polygon. */
export function ltZoneEntityId(objectId: number): string {
    return `lt-asgr-zone-${objectId}`;
}

/**
 * PURE: one resolved `ribos` register row → the minted `SiteIntelPlan`, or null when the row
 * serves no status — `Plan.status` is REQUIRED and MIRRORED (open string, never invented), so a
 * status-less row cannot honestly become a Plan entity (the EE precedent, kept).
 *
 * DATE AXES, kept apart deliberately:
 *   • `adoptedDate` ← `TVIRT_DATA` (approval — the legal act).
 *   • `inForceFrom` ← `ISIGALIOJO` (came into force — served explicitly, so not a guess; where
 *     EE had to leave this null because PLANK serves no in-force axis, LT does serve one).
 *   • `inForceTo` stays **null**. The register's two candidate end-dates are `ISREGISTRUOTA`
 *     (de-registration — a REGISTER act) and `GALIOJA_IKI` (this VERSION's window in the
 *     register). Neither is a legal repeal date; mirroring either into `inForceTo` would
 *     assert a legal fact the register does not serve. Both remain available on
 *     `LtTpdRegisterRow` for a consumer that wants the register axis.
 */
export function mapLtTpdRowToPlan(row: LtTpdRegisterRow): SiteIntelPlan | null {
    if (row.statusName === null) return null;
    return SiteIntelPlanSchema.parse({
        id: ltPlanEntityId(row.tpdId),
        // The Lithuanian instrument kind, verbatim from the register's own subkind code
        // (`K_D` = detail plan, `B_SAV` = municipal comprehensive plan …). An open string per
        // REPORT §I — harmonising 30 national instrument taxonomies at L0 is the forbidden move.
        kind: row.planningSubkind ?? row.planningKind ?? 'TPD',
        status: row.statusName,
        adoptedDate:
            row.approvalDate !== null && ISO_DATE_RE.test(row.approvalDate) ? row.approvalDate : null,
        inForceFrom:
            row.inForceDate !== null && ISO_DATE_RE.test(row.inForceDate) ? row.inForceDate : null,
        inForceTo: null,
        // No SiteIntelDocument entities are minted: the TPD card URL travels VERBATIM on every
        // rule's `source.document`, which is the machine-anchorable citation the chain needs.
        documents: [],
        geometryRef: null,
        source: LT_TPDR_RIBOS_SOURCE_ID,
        version: null,
    });
}

function ringPolygon(
    ring: ReadonlyArray<readonly [number, number]>,
    crs: string,
): NativeCrsGeometry {
    return {
        crs,
        kind: 'Polygon',
        // Coordinates exactly as served ([easting, northing] pairs) — uninterpreted at L0.
        coordinates: [ring.map(([x, y]) => [x, y])],
    };
}

/**
 * PURE: mint the `SiteIntelZone` for an ASGR polygon, or null.
 *
 * The zone identity is the FUNCTIONAL ZONE (`FUNKC_ZON`) and the plan behind it is the document
 * the register itself names as having SET that zone (`FUNKC_ZONTP`) — the polygon's own served
 * per-value provenance, not a pick among its cited documents. That is why one polygon can carry
 * a zone from a comprehensive plan while its use codes come from a detail plan (measured: ASGR
 * OBJECTID 97619).
 */
export function mapLtAsgrPolygonToZone(
    polygon: LtAsgrPolygon,
    plansByTpdId: ReadonlyMap<number, SiteIntelPlan>,
): SiteIntelZone | null {
    if (polygon.objectId === null) return null;
    if (polygon.ring.length < 3) return null;
    const funkc = polygon.classifications.find((c) => c.field === 'FUNKC_ZON');
    if (funkc === undefined || funkc.value === null || funkc.tpdSystemId === null) return null;
    const plan = plansByTpdId.get(Number(funkc.tpdSystemId));
    if (plan === undefined) return null;
    return SiteIntelZoneSchema.parse({
        id: ltZoneEntityId(polygon.objectId),
        planId: plan.id,
        typology: {
            // Verbatim national code (`"U_SK_F"`, `"U_BZ_I_F"`, …).
            national: funkc.value,
            // No cross-country mapping EXISTS for the LT functional-zone classifier — null is
            // the honest answer, never a guessed harmonisation.
            harmonised: null,
        },
        geometry: ringPolygon(polygon.ring, polygon.crs),
        source: LT_ASGR_SOURCE_ID,
    });
}

/* ═══════════════════════ rule construction ═════════════════════════════════════════════ */

/** What one mapped ASGR polygon yields: the minted referents + the rules that cite them. */
export interface LtMappedRuleSet {
    /** The minted Plan entities, one per DISTINCT TPD the polygon cites (may be several). */
    readonly plans: readonly SiteIntelPlan[];
    /** The minted Zone the rules' `basis` cites, or null (see the referent ladder). */
    readonly zone: SiteIntelZone | null;
    readonly rules: readonly SiteIntelRule[];
}

interface LtRuleSourceRef {
    country: string;
    authority: string;
    dataset: string;
    plan_id: string | null;
    object_id: string | null;
    document: string | null;
    article: null;
    page: null;
}

function ltObjectLabel(polygon: LtAsgrPolygon): string | null {
    return polygon.objectId === null ? null : `ASGR polygon OBJECTID ${polygon.objectId}`;
}

interface BuildRuleArgs {
    readonly id: string;
    readonly parameter: string;
    readonly value: number | string | boolean | null;
    readonly unit: string | null;
    readonly valueBasis: { readonly scheme: string; readonly code: string } | null;
    readonly source: LtRuleSourceRef;
    readonly tier: 1 | 2 | 6;
    readonly derivation: RuleDerivation;
    readonly valueLocation: RuleValueLocation;
    readonly note: string | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
    readonly useScope: readonly string[];
    readonly validityBasis: 'legal' | 'ingestion';
    readonly validFrom: string;
}

function buildRule(a: BuildRuleArgs): SiteIntelRule {
    return SiteIntelRuleSchema.parse({
        id: a.id,
        body: null,
        applicability: {
            basis: a.basis,
            geometry: a.inlineGeometry,
            useScope: a.useScope,
            // ASGR is ALREADY the consolidation: "naujesni ir detalesnio lygmens dokumentai
            // pakeičia senesnius ir mažesnio detalumo" (newer/more-detailed supersede
            // older/coarser). The precedence has been APPLIED by the state before we see it, so
            // there is no per-rule rung left to mirror — rank:null is R1's honest "no rank axis
            // served", not an omission. The LADDER itself is adapter DATA
            // (LT_APPLICABILITY_LADDER in index.ts).
            rank: null,
            condition: null,
        },
        provenance: {
            parameter: a.parameter,
            value: a.value,
            unit: a.unit,
            source: a.source,
            derivation: a.derivation,
            valueLocation: a.valueLocation,
            ...(a.valueBasis !== null ? { valueBasis: a.valueBasis } : {}),
            confidence: a.note !== null ? { tier: a.tier, note: a.note } : { tier: a.tier },
            normativeForce: LT_ASGR_NORMATIVE_FORCE,
            validityBasis: a.validityBasis,
            valid_from: a.validFrom,
            valid_to: null,
        },
    });
}

/**
 * The candidate-document note carried on every NUMERIC rule: ASGR attributes no document to
 * these columns, so the polygon's cited documents are named as CANDIDATES, never as the source.
 */
function ltNumericProvenanceNote(polygon: LtAsgrPolygon): string {
    const cited = polygon.classifications
        .filter((c) => c.tpdSystemId !== null)
        .map(
            (c) =>
                `${c.field}←TPD ${c.tpdSystemId}` +
                (c.documentNumber !== null ? ` (${c.documentNumber}` : ' (') +
                (c.approvalDate !== null ? `, approved ${c.approvalDate}` : '') +
                ')',
        );
    const list = cited.length > 0 ? cited.join('; ') : 'none';
    return (
        'ASGR serves NO per-value provenance for its numeric regulation columns — the ' +
        '*TP/*NR/*D/*TPR families attach to PAGR_PASK/NAUD_BUD/FUNKC_ZON/NAUD_TIP only ' +
        '(measured against the live layer descriptor 2026-09-01). This value therefore has no ' +
        `served legal address and no served validity date. Candidate documents on this polygon: ${list}. ` +
        'They are NOT asserted as this value\'s source; validityBasis is "ingestion" for exactly ' +
        'that reason.'
    );
}

/**
 * PURE: one ASGR polygon (+ the register rows its cited TPDs resolved to) → the minted
 * referents + `SiteIntelRule[]`.
 *
 * Emits, always and in this order:
 *   • four CLASSIFICATION rules — value verbatim (or tier-6 UNKNOWN when the field is empty),
 *     each with its OWN served legal address and `validityBasis:'legal'`;
 *   • four NUMERIC rules — every one present, including `MAX_INTENS` as the named REFUSAL and
 *     every unfilled/out-of-domain slot as a tier-6 UNKNOWN (E4 control 9 + the §10 test-wide
 *     rule that a silently dropped attribute fails the chain even when every emitted number is
 *     right);
 *   • one `APIBENDR` prose rule when the summarising text is served (100% of polygons,
 *     measured) — `valueLocation:'in-document-text'` at tier 2, never parsed for numbers here.
 *
 * The ONE structural refusal it can make is the EE precedent's: a polygon with NO minted zone
 * AND no served ring has nothing a rule could apply to, and it throws BY NAME rather than emit
 * a rule that applies nowhere.
 */
export function mapLtAsgrPolygonToRules(
    polygon: LtAsgrPolygon,
    tpdRows: ReadonlyMap<number, LtTpdRegisterRow>,
    fetchedAtIso: string,
): LtMappedRuleSet {
    // 1. Mint a Plan for every DISTINCT TPD this polygon's provenance columns cite.
    const plansByTpdId = new Map<number, SiteIntelPlan>();
    for (const [tpdId, row] of tpdRows) {
        const plan = mapLtTpdRowToPlan(row);
        if (plan !== null) plansByTpdId.set(tpdId, plan);
    }

    // 2. The R1 referent ladder — mint what you cite, cite only what you minted.
    const zone = mapLtAsgrPolygonToZone(polygon, plansByTpdId);
    const hasRing = polygon.ring.length >= 3;
    let basis: readonly RuleBasisRef[];
    let inlineGeometry: NativeCrsGeometry | null;
    if (zone !== null) {
        basis = [{ kind: 'zone', ref: zone.id }];
        inlineGeometry = null;
    } else if (hasRing) {
        // Residual bare-geometry leg: the polygon is real and drawn, but its functional-zone
        // identity or the document behind it did not resolve — a half-known planning object is
        // NOT minted (the dangling-ref defect gate decision §B.2 removed).
        basis = [];
        inlineGeometry = ringPolygon(polygon.ring, polygon.crs);
    } else {
        throw new Error(
            `lt-rule-mapper: ASGR polygon ${ltObjectLabel(polygon) ?? '<no OBJECTID>'} served NO ` +
                'geometry and no resolvable zone identity — a rule that applies nowhere is not a ' +
                'rule (R1 at-least-one-leg). Refusing by name instead of guessing.',
        );
    }

    const objectLabel = ltObjectLabel(polygon);
    const idBase = `lt-asgr-${polygon.objectId ?? 'noobjectid'}`;
    const rules: SiteIntelRule[] = [];

    // 3. CLASSIFICATION rules — each carries the provenance the register serves FOR IT.
    for (const c of polygon.classifications) {
        const entry = vocabularyEntry(c.field);
        const row = c.tpdSystemId !== null ? tpdRows.get(Number(c.tpdSystemId)) : undefined;
        const source: LtRuleSourceRef = {
            country: 'LT',
            authority: LT_RULE_AUTHORITY,
            dataset: LT_RULE_DATASET,
            // The NATIONAL plan identifier: the TPD registration number the provenance column
            // serves (`T00087142`), falling back to the system id when only that is served.
            plan_id: c.documentNumber ?? c.tpdSystemId,
            object_id: objectLabel,
            // The machine-anchorable citation — the TPD card URL, when the register resolved.
            document: row?.documentUrl ?? null,
            article: null,
            page: null,
        };
        const legal = c.approvalDate !== null && ISO_DATE_RE.test(c.approvalDate);
        const provenanceNote =
            c.tpdSystemId === null
                ? 'ASGR served no provenance columns for this classification field'
                : `per-value provenance served by ASGR: ${c.field}TP=${c.tpdSystemId}` +
                  (c.documentNumber !== null ? `, ${c.field}NR=${c.documentNumber}` : '') +
                  (c.approvalDate !== null ? `, ${c.field}D=${c.approvalDate} (TPD approval date` +
                      ', proven = ribos.TVIRT_DATA 2026-09-01)' : '') +
                  (c.planningKind !== null ? `, ${c.field}TPR=${c.planningKind}` : '');
        if (c.value === null) {
            rules.push(
                buildRule({
                    id: `${idBase}-${entry.parameter}`,
                    parameter: entry.parameter,
                    value: null,
                    unit: entry.unit,
                    valueBasis: entry.valueBasis,
                    source,
                    tier: 6,
                    derivation: 'DIRECT',
                    valueLocation: 'attribute',
                    note: `ASGR served no ${c.field} for this polygon — UNKNOWN, never an absence of regulation. ${provenanceNote}`,
                    basis,
                    inlineGeometry,
                    useScope: [],
                    validityBasis: legal ? 'legal' : 'ingestion',
                    validFrom: legal ? c.approvalDate! : fetchedAtIso,
                }),
            );
            continue;
        }
        rules.push(
            buildRule({
                id: `${idBase}-${entry.parameter}`,
                parameter: entry.parameter,
                // Verbatim, including the ";"-joined `NAUD_BUD` list — splitting a national
                // code list into a typology decision is business logic and lives above the
                // adapter (the EE `otstarve` precedent).
                value: c.value,
                unit: entry.unit,
                valueBasis: entry.valueBasis,
                source,
                tier: 1,
                derivation: 'DIRECT',
                valueLocation: 'attribute',
                note: provenanceNote,
                basis,
                inlineGeometry,
                useScope: [],
                validityBasis: legal ? 'legal' : 'ingestion',
                validFrom: legal ? c.approvalDate! : fetchedAtIso,
            }),
        );
    }

    // 4. NUMERIC rules — no served provenance, so no fabricated legal address (see the header).
    const numericNote = ltNumericProvenanceNote(polygon);
    const numericSource: LtRuleSourceRef = {
        country: 'LT',
        authority: LT_RULE_AUTHORITY,
        dataset: LT_RULE_DATASET,
        plan_id: null,
        object_id: objectLabel,
        document: null,
        article: null,
        page: null,
    };
    for (const field of LT_ASGR_NUMERIC_FIELDS) {
        const entry = vocabularyEntry(field);
        const served = polygon.numerics.find((n) => n.field === field)?.value ?? null;
        const reading = readLtNumeric(field, served);
        rules.push(
            buildRule({
                id: `${idBase}-${entry.parameter}`,
                parameter: entry.parameter,
                value: reading.value,
                unit: entry.unit,
                valueBasis: entry.valueBasis,
                source: numericSource,
                tier: reading.unknown ? 6 : 1,
                derivation: 'DIRECT',
                valueLocation: 'attribute',
                note:
                    (reading.refusalReason !== null ? `${reading.refusalReason} · ` : '') +
                    numericNote +
                    ltCompletenessCaveat(polygon),
                basis,
                inlineGeometry,
                useScope: [],
                // ASGR attributes no document — and therefore no legal date — to these columns.
                validityBasis: 'ingestion',
                validFrom: fetchedAtIso,
            }),
        );
    }

    // 5. APIBENDR — the qualitative remainder, served verbatim as prose (the NL
    // `waardeInRegeltekst` / EE `tingimus` split). Tier 2, NOT tier 1: the frozen tier
    // projection guard rejects tier 1 + in-document-text at parse. Extracting numbers out of it
    // is a downstream tier-4 (AI) → tier-5 (human-validated) job, NEVER done here.
    if (polygon.summaryText !== null) {
        rules.push(
            buildRule({
                id: `${idBase}-apibendrinimas`,
                parameter: 'apibendrinimas',
                value: polygon.summaryText,
                unit: null,
                valueBasis: null,
                source: numericSource,
                tier: 2,
                derivation: 'DIRECT',
                valueLocation: 'in-document-text',
                note:
                    'ASGR summarising text (APIBENDR), served verbatim on 175,570 of 175,570 ' +
                    'polygons (measured 2026-09-01). ⚠ Its own wording calls the source date ' +
                    '"Registravimo data" while the field it restates is the APPROVAL date ' +
                    '(proven against ribos.TVIRT_DATA) — do not parse dates out of this prose. ' +
                    'Numeric limits inside it require the gated extraction pipeline (tier 4→5), ' +
                    'never inline parsing.' + ltCompletenessCaveat(polygon),
                basis,
                inlineGeometry,
                useScope: [],
                validityBasis: 'ingestion',
                validFrom: fetchedAtIso,
            }),
        );
    }

    return { plans: [...plansByTpdId.values()], zone, rules };
}

/**
 * The completeness caveat appended to every value-bearing rule when the polygon raises one.
 *
 * `PILN='N'` = "galimi pakeitimai dėl nepilno erdvinės informacijos įskaitmeninimo" (changes
 * possible because the spatial information is incompletely digitised) and `ATN_DOK='D'` =
 * "galimi pakeitimai dėl neerdviniais duomenimis atnaujintos informacijos" — both are the
 * register warning that a row may not consolidate every governing document.
 *
 * ⚠ MEASURED 2026-09-01: `PILN`, `ATN_DOK` and `PRIORIT` are non-null on **0 of 175,570**
 * polygons nationally. This mapping is implemented so a future fill needs no code change, but
 * NO LIVE ROW EXERCISES IT — any test covering it must label its input SYNTHETIC.
 */
export function ltCompletenessCaveat(polygon: LtAsgrPolygon): string {
    const parts: string[] = [];
    if (polygon.completenessFlag === 'N') {
        parts.push(
            'PILN=N — the register warns this consolidation may be incomplete (spatial ' +
                'information not fully digitised)',
        );
    }
    if (polygon.nonSpatialUpdateFlag === 'D') {
        parts.push(
            'ATN_DOK=D — the register warns these regulations may have been updated from ' +
                'NON-SPATIAL documents',
        );
    }
    return parts.length === 0 ? '' : ` · ${parts.join(' · ')}`;
}
