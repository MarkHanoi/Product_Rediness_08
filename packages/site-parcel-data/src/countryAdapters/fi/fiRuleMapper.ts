// E7-FI — FINLAND (FI) · the PURE rule mapper: one Ryhti plan-index feature -> E1a
// `SiteIntelRule` objects with DIRECT provenance, PLUS the minted `SiteIntelPlan` and
// `SiteIntelDocument` entities those rules cite (the R1 referent contract).
//
// TOTAL, PURE, DETERMINISTIC: same feature in -> byte-identical rules out. No fetch, no clock
// (the caller passes `fetchedAtIso`), no business logic. It does NOT decide what may be built;
// it records what the state serves, with its legal address.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MAPPER REFUSES TO DO, AND WHY THAT IS THE POINT OF THE LANE
// ══════════════════════════════════════════════════════════════════════════════════════════
// Finland's open Ryhti channel serves NO building-right numbers. Not empty ones — none. The
// 33 served fields were censused across all 6,282 valid-plan features and contain zero
// occurrences of `tehokkuusluku` (FAR), `kerrosluku` (storeys), `kayttotarkoitus` (use code),
// `rakennusoikeus`, `kerrosala` or `korkeus`.
//
// So this mapper emits NO `floorAreaRatio`, NO `maxHeight`, NO `coveragePercent` — not even
// at tier 6. THAT RESTRAINT IS DELIBERATE AND IT IS THE CONTROL-9 SPLIT THE BRIEF DEMANDED:
//
//   • A tier-6 UNKNOWN rule asserts "this source HAS this parameter and it is unknown for
//     this feature." Emitting `floorAreaRatio: null, tier 6` from the Ryhti index would be a
//     FALSE claim about the source — it would tell a consumer that Ryhti has an FAR column
//     which happens to be empty here, and would make the missing capability look like
//     ordinary per-feature sparsity that more coverage would fix.
//   • The honest encoding of "the system does not serve this field yet" is an ABSENT
//     CAPABILITY: {@link FI_RYHTI_UNSERVED_PARAMETERS}, carried on the mapped result and in
//     the source row's probe log. It is a fact about the SOURCE, not about a feature.
//
// Tier-6 rules ARE emitted, freely, for the other half of the split: DECLARED fields that are
// empty or placeholder-filled for a given plan (`approval_date` null on 1,143 of 6,282,
// sentinel on 303; `documents` null on 907). Those are per-feature facts and they stay
// VISIBLE, never dropped.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// THE SEVEN SEATS (family verdict section 6-E) — filled, or the reason stated
// ══════════════════════════════════════════════════════════════════════════════════════════
// R1 basis   — every rule cites the minted `SiteIntelPlan` returned in the same result. The
//              plan BOUNDARY rides `applicability.geometry` INLINE, because `SiteIntelPlan`
//              has no geometry field (only `geometryRef`, which must point at an entity, and
//              this adapter mints no geometry entity). Both legs, one referent.
// R1 rank    — null, and Finland is a FOURTH case that must not be folded into the other
//              three. See {@link FI_RANK_ABSENCE_REASON}.
// R1 useScope— empty on every rule. The register serves NO use axis at all: `kayttotarkoitus`
//              has zero occurrences in 6,282 features. Not "not use-conditioned" — the axis
//              does not exist on this channel.
// R2 valueBasis — absent on every rule, and the reason is structural rather than a gap: this
//              mapper emits no percentage, ratio or area value, because the source serves
//              none. The denominator question cannot arise for a value that does not exist.
//              The moment Ryhti serves `tehokkuusluku`, a `valueBasis` becomes MANDATORY on
//              it (`e` is floor area / plot area, and WHICH plot area is exactly the C63
//              denominator question) — that is a note for whoever wires the plan objects.
// R3 validityBasis — 'legal' ONLY when `approval_date` classifies as `served`. The sentinel
//              and the corrupt 1068 date both yield 'ingestion' + the fetch date. This is the
//              seat the Finnish sentinel attacks most directly.
// R5 normativeForce — for a YLEISKAAVA the register serves `legal_effect_of_local_master_plan`
//              and the state's own Finnish words ride the rule verbatim
//              ("Oikeusvaikutteinen yleiskaava" / "Oikeusvaikutukseton yleiskaava"). For an
//              ASEMAKAAVA no force flag is served at all -> null, which is NOT an assertion
//              of bindingness. Two different facts, two different encodings.
// UNKNOWN    — keyed off the DECLARED field set, not the served bag, so a server that starts
//              omitting null keys cannot silently delete a parameter. Each guard is justified
//              by a measurement in its own note.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// THE CODELIST TABLES ARE FROZEN, MEASURED, AND THROW ON A STRANGER
// ══════════════════════════════════════════════════════════════════════════════════════════
// Every table below was fetched VERBATIM from the Finnish national codelist service on
// 2026-09-01 (`koodistot.suomi.fi/codelist-api/api/v1/coderegistries/rytj/codeschemes/
// <scheme>/codes/`). They are CLOSED state codelists, so a code outside one is a national
// schema change, and this mapper THROWS BY NAME rather than absorb it (section 6-E). The
// labels are the state's own Finnish, never translated. SUPERSEDED and DRAFT members are
// included because they are LIVE in the data: `RY_Kaavalaji` code 39 is SUPERSEDED and
// appears on 643 features; `oikeusvaik_YK` code 14 is DRAFT.

import {
    SiteIntelDocumentSchema,
    SiteIntelPlanSchema,
    SiteIntelRuleSchema,
    type NativeCrsGeometry,
    type RuleBasisRef,
    type RuleDerivation,
    type RuleValueLocation,
    type SiteIntelDocument,
    type SiteIntelPlan,
    type SiteIntelRule,
} from '@pryzm/schemas';
import { FI_PLAN_BOUNDARY_CRS, type FiDateReading, type FiPlanIndexFeature } from './fiPlanProvider.js';
import { FI_RYHTI_PLAN_SOURCE_ID } from './fiSourceRefs.js';

/** The publishing authority string carried in every FI rule's source ref. */
export const FI_RULE_AUTHORITY = 'SYKE (Ryhti — rakennetun ympariston tietojarjestelma)';

/** The dataset string carried in every FI rule's source ref. */
export const FI_RULE_DATASET = 'ryhti_plan OGC API Features — valid plan index';

/* ────────────────────────── frozen state codelists ────────────────────── */

/** `RY_Kaavalaji` — plan kind. 16 codes, fetched verbatim 2026-09-01. */
export const FI_PLAN_TYPE_CODES: Readonly<Record<string, string>> = Object.freeze({
    '1': 'Maakuntakaava',
    '11': 'Kokonaismaakuntakaava',
    '12': 'Vaihemaakuntakaava',
    '2': 'Yleiskaava',
    '21': 'Yleiskaava',
    '22': 'Vaiheyleiskaava',
    '23': 'Osayleiskaava',
    '24': 'Kuntien yhteinen yleiskaava',
    '25': 'Maanalainen yleiskaava',
    '3': 'Asemakaava',
    '31': 'Asemakaava',
    '32': 'Vaiheasemakaava',
    '33': 'Ranta-asemakaava',
    '34': 'Vaiheranta-asemakaava',
    '35': 'Maanalaisten tilojen asemakaava',
    // SUPERSEDED in the codelist and LIVE on 643 features — omitting it would throw on real data.
    '39': 'Asemakaava (ohjeellinen tonttijako)',
});

/** `kaavaelinkaari` — plan lifecycle. 17 codes, fetched verbatim 2026-09-01. */
export const FI_LIFECYCLE_CODES: Readonly<Record<string, string>> = Object.freeze({
    '01': 'Kaavoitusaloite',
    '02': 'Vireilletullut',
    '03': 'Valmistelu',
    '04': 'Kaavaehdotus',
    '05': 'Muutettu kaavaehdotus',
    '06': 'Hyvaksytty kaava',
    '07': 'Oikaisukehotuksen alainen',
    '08': 'Valituksen alainen',
    '09': 'Oikaisukehotuksen alainen ja valituksen alainen',
    '10': 'Osittain voimassa',
    '11': 'Voimassa ennen kaavan lainvoimaisuutta',
    '12': 'Lainvoimainen',
    '13': 'Voimassa',
    '14': 'Kumoutunut',
    '15': 'Rauennut',
    '16': 'Hylatty',
    '17': 'Keskeytetty',
});

/**
 * `RY_DigitaalinenAlkupera` — DIGITAL ORIGIN. 5 codes, fetched verbatim 2026-09-01.
 *
 * ⭐ THIS IS THE MOST IMPORTANT TABLE IN THE FILE. It is the state's OWN per-feature
 * declaration of how much of the plan was actually digitised, and the census is decisive:
 *   code 04 "Rajaus digitoitu" (THE BOUNDARY IS DIGITISED)  5,630 of 5,635 detail plans
 *                                                             638 of   647 master plans
 *   code 0401 "Rajaus useamman kunnan alueella"                 1 detail, 9 master
 *   code 01 "Tietomallin mukaan laadittu" (data-model native)    3 detail, 0 master
 *   code 02 "Kokonaan digitoitu"                                 1 detail, 0 master
 * So 6,278 of 6,282 valid-plan features (99.94%) say, in the register's own vocabulary, that
 * only the OUTLINE was digitised — and exactly THREE features nationally claim to be
 * data-model native. That is what "Ryhti is filling" means measured rather than asserted, and
 * it is why no plan provision is available as an attribute: the state has not claimed to have
 * digitised any.
 */
export const FI_DIGITAL_ORIGIN_CODES: Readonly<Record<string, string>> = Object.freeze({
    '01': 'Tietomallin mukaan laadittu',
    '02': 'Kokonaan digitoitu',
    '03': 'Osittain digitoitu',
    '04': 'Rajaus digitoitu',
    '0401': 'Rajaus useamman kunnan alueella',
});

/** `oikeusvaik_YK` — master-plan legal effect. 6 codes, fetched verbatim 2026-09-01. */
export const FI_MASTER_PLAN_LEGAL_EFFECT_CODES: Readonly<Record<string, string>> = Object.freeze({
    '1': 'Oikeusvaikutteinen yleiskaava',
    '2': 'Oikeusvaikutukseton yleiskaava',
    '11': 'Yleiskaavan kaytto rakentamisluvan perusteena',
    '12': 'Yleiskaavan kaytto rakentamisluvan myontamisen perusteena rantavyohykkeella',
    '13': 'Yleiskaavan kaytto tuulivoimalan rakentamisluvan perusteena',
    // DRAFT in the codelist; included so a first live occurrence does not throw spuriously.
    '14': 'Yleiskaavan kaytto aurinkovoimalan rakentamisluvan perusteena',
});

/** `RY_AsiakirjanLaji_YKAK` — attachment kind. 24 codes, fetched verbatim 2026-09-01. */
export const FI_ATTACHMENT_KIND_CODES: Readonly<Record<string, string>> = Object.freeze({
    '01': 'Hakemus',
    '02': 'Havainnekuva',
    '03': 'Kaavakartta',
    '04': 'Kaavamaaraykset',
    '05': 'Kaavakartta ja kaavamaaraykset',
    '06': 'Kaavaselostus',
    '07': 'Karttaliite',
    '08': 'Kirje',
    '09': 'Kuulutus',
    '10': 'Lausunto',
    '11': 'Mielipide',
    '12': 'Muistio',
    '13': 'Muistutus',
    '14': 'Osallistumis- ja arviointisuunnitelma',
    '15': 'Paatos',
    '16': 'Poytakirja',
    '17': 'Raportti',
    '18': 'Selvitys',
    '19': 'Sopimus',
    '20': 'Suunnitelma',
    '21': 'Suunnitteluohje',
    '22': 'Valitus',
    '23': 'Vastine',
    '99': 'Muu asiakirja',
});

/**
 * The attachment kinds that CARRY the kaavamaaraykset (plan provisions). Measured over 7,294
 * attachments: `05` "Kaavakartta ja kaavamaaraykset" x 5,144 and `04` "Kaavamaaraykset"
 * x 1,394 — 6,538 of 7,294 (89.6%). A `03` "Kaavakartta" is the map WITHOUT the provisions and
 * is deliberately excluded: citing it as the provisions document would be a wrong legal
 * address that reads correct.
 */
export const FI_PROVISION_ATTACHMENT_KINDS: readonly string[] = Object.freeze(['04', '05']);

/**
 * PURE: resolve a code against a closed state codelist. Returns null when the code is ABSENT
 * (case-1 emptiness — the caller emits a tier-6 UNKNOWN); THROWS when a code is PRESENT but
 * unrecognised, because that is a national schema change and absorbing it would silently
 * downgrade a new state semantic to "unknown" (section 6-E).
 */
export function resolveFiCode(
    table: Readonly<Record<string, string>>,
    scheme: string,
    code: string | null,
): string | null {
    if (code === null) return null;
    const label = table[code];
    if (label === undefined) {
        throw new Error(
            `fi-rule-mapper: ${scheme} code ${JSON.stringify(code)} is not in the frozen ` +
                `national codelist (${Object.keys(table).length} members, fetched verbatim from ` +
                'koodistot.suomi.fi 2026-09-01). A code outside a CLOSED state codelist is a ' +
                'national schema change, not an unknown value — re-fetch the codelist and extend ' +
                'the table deliberately. Refusing by name rather than absorbing it.',
        );
    }
    return label;
}

/* ─────────────────────── the ABSENT CAPABILITY (case 2) ───────────────── */

/** One parameter Finnish plans legally carry that this SOURCE does not serve at all. */
export interface FiUnservedParameter {
    /** The Finnish field name a reader would look for. */
    readonly finnishField: string;
    /** The canonical parameter it would map to, once a source serves it. */
    readonly canonicalParameter: string;
    /** Where it actually lives today. */
    readonly livesIn: string;
}

/**
 * ⭐ CASE 2 OF THE CONTROL-9 SPLIT: parameters that DO NOT EXIST on this channel.
 *
 * This is NOT a list of empty fields — it is a list of fields the source does not have. It is
 * a fact about the SOURCE and it is recorded here and in the source row, NEVER as a tier-6
 * rule. Measured 2026-09-01: zero literal occurrences of any of these names across all 6,282
 * valid-plan features of both indexes.
 *
 * The first three are the exact fields `parcelProviders/mmlParcelProvider.ts:636`
 * (`RYHTI_ATTRIBUTE_FIELDS`) names as the "second-Denmark gate" and asks a future lane to
 * CONFIRM PRESENT. This lane ran that file's own `RYHTI_IX_PROBE_URL` verbatim: all three are
 * ABSENT, which is that file's stated **Outcome B — index-only, the Hamburg B-Plan pattern**.
 */
export const FI_RYHTI_UNSERVED_PARAMETERS: readonly FiUnservedParameter[] = Object.freeze([
    {
        finnishField: 'tehokkuusluku',
        canonicalParameter: 'floorAreaRatio',
        livesIn: 'the kaavamaaraykset PDF (attachment kind 04/05) — tier 2/4 extraction, not an attribute',
    },
    {
        finnishField: 'kerrosluku',
        canonicalParameter: 'maxStoreys',
        livesIn: 'the kaavamaaraykset PDF (attachment kind 04/05)',
    },
    {
        finnishField: 'kayttotarkoitus',
        canonicalParameter: 'landUseCategories',
        livesIn: 'the kaavakartta/kaavamaaraykset PDF; also the un-served kaavatietomalli plan objects',
    },
    {
        finnishField: 'rakennusoikeus',
        canonicalParameter: 'maxGrossFloorArea',
        livesIn: 'the kaavamaaraykset PDF; computed per block by HSY for 4 municipalities (SeutuRAMAVA)',
    },
    {
        finnishField: 'kerrosala',
        canonicalParameter: 'grossFloorArea',
        livesIn: 'the kaavamaaraykset PDF',
    },
    {
        finnishField: 'korkeus',
        canonicalParameter: 'maxHeight',
        livesIn: 'the kaavamaaraykset PDF',
    },
]);

/**
 * Why every FI rule carries `rank: null`, stated as its own constant so it cannot be
 * paraphrased into one of the three cases it is not.
 *
 * Finland is a FOURTH case. EE and PL emit `rank: null` because the ladder exists but is
 * adapter DATA; LT emits it because the state ALREADY APPLIED the ladder before serving; DK is
 * the one adapter with a real per-feature rung. Finland is none of those: the ladder exists in
 * statute (asemakaava over yleiskaava over maakuntakaava, and a later asemakaavan muutos over
 * the plan it amends), the register serves NO rung, AND the register has NOT consolidated —
 * it publishes overlapping instruments all stamped `13 = Voimassa` and leaves the ordering
 * unexpressed.
 *
 * MEASURED 2026-09-01 over 29 deterministic sample points drawn from the corpus: **27 of 29
 * (93.1%) fall inside more than one valid detail plan**, mean 2.93, maximum 6. And the dates
 * that might have ordered them are themselves unreliable — `approval_date` is null on 1,143 of
 * 6,282 features and the measured `1900-01-01` sentinel on 303 more.
 *
 * So `rank: null` here means UNRESOLVED, not ABSENT, and a consumer must carry all overlapping
 * plans rather than pick one. Collapsing this into "no ladder exists" would licence exactly the
 * silent pick it forbids.
 */
export const FI_RANK_ABSENCE_REASON =
    'rank null = the instrument ladder EXISTS in Finnish statute but the register serves no ' +
    'per-feature rung and has not consolidated: 27 of 29 sampled points lie inside >1 valid ' +
    'detail plan (mean 2.93, max 6), every one stamped lifecycle 13 Voimassa, and approval_date ' +
    'is null or the 1900-01-01 sentinel on 1,446 of 6,282 features so date ordering is not ' +
    'available either. UNRESOLVED, not absent — carry every overlapping plan, never pick one.';

/** Why no rule carries `useScope` — the axis does not exist on this channel. */
export const FI_USESCOPE_ABSENCE_REASON =
    'useScope empty = the Ryhti plan INDEX serves no land-use axis at all (kayttotarkoitus: ' +
    'zero occurrences across 6,282 features). Not "this rule is not use-conditioned".';

/** Why no rule carries `valueBasis` — no measured value exists for a denominator to qualify. */
export const FI_VALUEBASIS_ABSENCE_REASON =
    'valueBasis absent = this source serves no percentage, ratio or area value, so no ' +
    'denominator question arises. When Ryhti serves tehokkuusluku (e = floor area / plot ' +
    'area), a valueBasis naming WHICH plot area becomes MANDATORY on it.';

/* ─────────────────────────── minted entities (R1) ─────────────────────── */

/** Deterministic id of the minted Plan — ONE naming seat, so no two call sites disagree. */
export function fiPlanEntityId(permanentPlanIdentifier: string): string {
    return `fi-plan-${permanentPlanIdentifier}`;
}

/** Deterministic id of a minted attachment Document. */
export function fiDocumentEntityId(attachmentId: string): string {
    return `fi-document-${attachmentId}`;
}

function boundaryGeometry(feature: FiPlanIndexFeature): NativeCrsGeometry | null {
    if (feature.boundary === null) return null;
    return {
        crs: FI_PLAN_BOUNDARY_CRS,
        kind: feature.boundary.kind,
        // Coordinates exactly as served (ETRS-TM35FIN metres, confirmed by the response CRS
        // token) — uninterpreted at L0 per NativeCrsGeometrySchema's own doctrine.
        coordinates: feature.boundary.coordinates,
    };
}

/**
 * PURE: one plan-index feature -> the minted `SiteIntelPlan`, or null when the register serves
 * no lifecycle status (`Plan.status` is REQUIRED and MIRRORED — an invented status is worse
 * than no entity) or no permanent identifier (nothing to key it by).
 *
 * `inForceTo` is `null` and that is a POSITIVE reading, not an unknown: `period_of_validity_end`
 * is null on all 6,282 features of both VALID indexes, and these collections are filtered to
 * lifecycle 13 "Voimassa". A plan that is in the valid index and carries no end date is
 * currently in force — the OpenFisca `valid_to: null` semantic exactly. Emitting a tier-6
 * UNKNOWN for it would convert a coherent positive fact into uncertainty, which is the
 * control-9 error running in the opposite direction.
 *
 * `geometryRef` is null: the boundary rides the rules' `applicability.geometry` INLINE, because
 * `SiteIntelPlan.geometryRef` must resolve to an entity and this adapter mints no geometry
 * entity (minting a `SiteIntelZone` from a plan OUTLINE would assert a land-use zone the
 * register did not draw — the same error LT's header refuses for ASGR consolidation polygons).
 */
export function mapFiFeatureToPlan(
    feature: FiPlanIndexFeature,
    documents: readonly SiteIntelDocument[],
): SiteIntelPlan | null {
    if (feature.permanentPlanIdentifier === null) return null;
    const status = resolveFiCode(
        FI_LIFECYCLE_CODES,
        'kaavaelinkaari',
        feature.lifecycleStatusCode,
    );
    if (status === null) return null;
    const kind = resolveFiCode(FI_PLAN_TYPE_CODES, 'RY_Kaavalaji', feature.planTypeCode);
    return SiteIntelPlanSchema.parse({
        id: fiPlanEntityId(feature.permanentPlanIdentifier),
        // The Finnish instrument name verbatim from the state codelist; falls back to the
        // register's own `plan_type_name_fin` string, and only then to the generic word.
        kind: kind ?? feature.planTypeNameFin ?? 'kaava',
        status,
        adoptedDate: feature.approvalDate.kind === 'served' ? feature.approvalDate.iso : null,
        inForceFrom: feature.validityBegin.kind === 'served' ? feature.validityBegin.iso : null,
        inForceTo: null, // positive: valid index + no end date = currently in force (see doc).
        documents: documents.map((d) => d.id),
        geometryRef: null, // see the doc comment — the boundary rides the rules inline.
        source: FI_RYHTI_PLAN_SOURCE_ID,
        version: null,
    });
}

/**
 * PURE: the feature's attachments -> minted `SiteIntelDocument` entities. Only attachments
 * with a resolvable uuid are minted (the uuid is the document's national identity, and an
 * identity-less document cannot be cited stably).
 */
export function mapFiAttachmentsToDocuments(
    feature: FiPlanIndexFeature,
    fetchedAtIso: string,
): readonly SiteIntelDocument[] {
    const out: SiteIntelDocument[] = [];
    for (const att of feature.attachments) {
        if (att.attachmentId === null) continue;
        const kindLabel = resolveFiCode(
            FI_ATTACHMENT_KIND_CODES,
            'RY_AsiakirjanLaji_YKAK',
            att.attachmentKindCode,
        );
        out.push(
            SiteIntelDocumentSchema.parse({
                id: fiDocumentEntityId(att.attachmentId),
                url: att.uri,
                // The state's own Finnish document-kind word, verbatim; never translated.
                kind: kindLabel ?? 'Ryhti-kaava-asiakirja (laji ei palvella)',
                identity: {
                    scheme: 'fi-ryhti-planattachmentdocument',
                    value: att.attachmentId,
                },
                // The register serves no attachment version axis.
                version: null,
                // The URI was RESOLVED to bytes by the lane's probe, but this mapper does not
                // fetch; the date is the caller's fetch date for the INDEX that cited it.
                retrievedDate: fetchedAtIso,
            }),
        );
    }
    return out;
}

/* ─────────────────────────────── rule building ────────────────────────── */

/** One row of the FI -> canonical rule vocabulary — only what the source actually serves. */
export interface FiRuleVocabularyEntry {
    /** The Ryhti field name, verbatim. */
    readonly ryhtiField: string;
    /** Canonical parameter name emitted into `RuleProvenance.parameter`. */
    readonly parameter: string;
    /** Unit, or null — every FI index value is a code or a date, so all are null. */
    readonly unit: string | null;
    /** Which of the two valid indexes carries it. */
    readonly indexes: readonly ('detail' | 'master')[];
}

/**
 * The measured, closed FI rule vocabulary. SHORT ON PURPOSE — it is exactly what the plan
 * INDEX serves. Compare EE's fourteen numeric ehitusoigus attributes: Finland serves none of
 * that shape, and the gap is {@link FI_RYHTI_UNSERVED_PARAMETERS}, not a thin mapping.
 */
export const FI_RULE_VOCABULARY: readonly FiRuleVocabularyEntry[] = Object.freeze([
    { ryhtiField: 'plan_type', parameter: 'planType', unit: null, indexes: ['detail', 'master'] },
    {
        ryhtiField: 'plan_life_cycle_status',
        parameter: 'planLifecycleStatus',
        unit: null,
        indexes: ['detail', 'master'],
    },
    {
        ryhtiField: 'digital_origin',
        parameter: 'planDigitalOrigin',
        unit: null,
        indexes: ['detail', 'master'],
    },
    {
        ryhtiField: 'legal_effect_of_local_master_plan',
        parameter: 'masterPlanLegalEffect',
        unit: null,
        indexes: ['master'],
    },
    {
        ryhtiField: 'approval_date',
        parameter: 'planApprovalDate',
        unit: null,
        indexes: ['detail', 'master'],
    },
    {
        ryhtiField: 'period_of_validity_begin',
        parameter: 'planValidityBegin',
        unit: null,
        indexes: ['detail', 'master'],
    },
    {
        ryhtiField: 'documents',
        parameter: 'planProvisionsDocument',
        unit: null,
        indexes: ['detail', 'master'],
    },
]);

interface FiValidity {
    readonly validityBasis: 'legal' | 'ingestion';
    readonly valid_from: string;
    /** Why, in words, for the rule note when the basis is `ingestion`. */
    readonly reason: string | null;
}

/**
 * R3: the typed validity axis. `legal` requires POSITIVE evidence of legal force — an approval
 * date the register serves FOR THIS PLAN, well-formed and plausible. The sentinel, the
 * implausible 1068 date, a malformed value and an absent value ALL fall to `ingestion` + the
 * fetch date, each naming which. That distinction is the whole point: the sentinel is what a
 * naive reader turns into "in force since 1900-01-01", and 4,240 features carry it while
 * simultaneously carrying a real approval date.
 */
export function fiValidity(approval: FiDateReading, fetchedAtIso: string): FiValidity {
    if (approval.kind === 'served' && approval.iso !== null) {
        return { validityBasis: 'legal', valid_from: approval.iso, reason: null };
    }
    const why =
        approval.kind === 'sentinel'
            ? `approval_date is the measured placeholder ${JSON.stringify(approval.raw)} ` +
              '(1900-01-01 appears on 5,986/6,282 time_of_initiation, 5,654/6,282 ' +
              'date_of_validity and 3,673/6,282 period_of_validity_begin values, and 4,240 ' +
              'features carry it beside a REAL approval_date) — a placeholder, not a date'
            : approval.kind === 'implausible'
              ? `approval_date ${JSON.stringify(approval.raw)} is below the plausibility floor ` +
                '1800-01-01 — register corruption, measured as exactly 1 such value across 5 ' +
                'date fields x 6,282 features (AK-004907, almost certainly a transposed 1968)'
              : approval.kind === 'malformed'
                ? `approval_date ${JSON.stringify(approval.raw)} is not a calendar date`
                : 'the register serves no approval_date for this plan (null on 1,143 of 6,282 ' +
                  'valid-plan features)';
    return { validityBasis: 'ingestion', valid_from: fetchedAtIso, reason: why };
}

interface BuildRuleArgs {
    readonly id: string;
    readonly parameter: string;
    readonly value: number | string | boolean | null;
    readonly unit: string | null;
    readonly feature: FiPlanIndexFeature;
    readonly fetchedAtIso: string;
    readonly tier: 1 | 2 | 6;
    readonly derivation: RuleDerivation;
    readonly valueLocation: RuleValueLocation;
    readonly note: string | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
    readonly normativeForce: string | null;
    readonly documentUrl: string | null;
}

function buildRule(a: BuildRuleArgs): SiteIntelRule {
    const v = fiValidity(a.feature.approvalDate, a.fetchedAtIso);
    const note =
        a.note !== null && v.reason !== null
            ? `${a.note} · validity: ${v.reason}`
            : (a.note ?? v.reason);
    return SiteIntelRuleSchema.parse({
        id: a.id,
        body: null,
        applicability: {
            basis: a.basis,
            geometry: a.inlineGeometry,
            // R1 useScope: the register serves NO use axis (FI_USESCOPE_ABSENCE_REASON).
            useScope: [],
            // R1 rank: UNRESOLVED, not absent (FI_RANK_ABSENCE_REASON).
            rank: null,
            condition: null,
        },
        provenance: {
            parameter: a.parameter,
            value: a.value,
            unit: a.unit,
            source: {
                country: 'FI',
                authority: FI_RULE_AUTHORITY,
                dataset: FI_RULE_DATASET,
                plan_id: a.feature.permanentPlanIdentifier,
                object_id: a.feature.planKey,
                document: a.documentUrl,
                article: null,
                page: null,
            },
            derivation: a.derivation,
            valueLocation: a.valueLocation,
            // R2 valueBasis is deliberately ABSENT everywhere — FI_VALUEBASIS_ABSENCE_REASON.
            confidence: note !== null ? { tier: a.tier, note } : { tier: a.tier },
            normativeForce: a.normativeForce,
            validityBasis: v.validityBasis,
            valid_from: v.valid_from,
            // Positive: the valid index + a null period_of_validity_end (0 non-null across
            // 6,282) = currently in force. See mapFiFeatureToPlan.
            valid_to: null,
        },
    });
}

/* ────────────────────────── the mapped result ─────────────────────────── */

/** What one mapped feature yields: the minted referents + the rules that cite them. */
export interface FiMappedRuleSet {
    /** The minted Plan the rules cite, or null (no permanent id / no lifecycle status). */
    readonly plan: SiteIntelPlan | null;
    /** The minted attachment Documents. */
    readonly documents: readonly SiteIntelDocument[];
    readonly rules: readonly SiteIntelRule[];
    /**
     * CASE 2, carried on every result so a consumer cannot miss it: the parameters this
     * SOURCE does not serve. Never rules — see the header.
     */
    readonly unservedParameters: readonly FiUnservedParameter[];
}

/**
 * R5 for a master plan: the state's own Finnish legal-effect words, verbatim, joined when the
 * register serves several. Detail plans get null — the register serves no force flag for an
 * asemakaava, and null is NOT an assertion of bindingness.
 */
function fiNormativeForce(feature: FiPlanIndexFeature): string | null {
    if (feature.masterPlanLegalEffectCodes.length === 0) return null;
    const labels = feature.masterPlanLegalEffectCodes.map(
        (c) => resolveFiCode(FI_MASTER_PLAN_LEGAL_EFFECT_CODES, 'oikeusvaik_YK', c)!,
    );
    return labels.join('; ');
}

/**
 * PURE: one Ryhti plan-index feature -> the minted referents + `SiteIntelRule[]`.
 *
 * THE ONE STRUCTURAL REFUSAL: a feature with NO permanent plan identifier AND no CRS-confirmed
 * boundary has nothing a rule could apply to, so this throws BY NAME rather than emit a rule
 * that applies nowhere (the R1 at-least-one-leg refine would reject it anyway; the throw names
 * the cause instead of surfacing a Zod path).
 */
export function mapFiPlanIndexFeatureToRules(
    feature: FiPlanIndexFeature,
    fetchedAtIso: string,
): FiMappedRuleSet {
    const documents = mapFiAttachmentsToDocuments(feature, fetchedAtIso);
    const plan = mapFiFeatureToPlan(feature, documents);
    const inlineGeometry = boundaryGeometry(feature);

    // The R1 referent ladder. Finland has no zone and no prescription to mint (see
    // mapFiFeatureToPlan) so the ladder has three rungs, not four.
    let basis: readonly RuleBasisRef[];
    if (plan !== null) {
        basis = [{ kind: 'plan', ref: plan.id }];
    } else if (inlineGeometry !== null) {
        basis = [];
    } else {
        throw new Error(
            'fi-rule-mapper: plan-index feature ' +
                JSON.stringify(feature.permanentPlanIdentifier ?? feature.planKey ?? '<no id>') +
                ' has NO mintable plan identity (permanent_plan_identifier or ' +
                'plan_life_cycle_status missing) AND no CRS-confirmed boundary — a rule that ' +
                'applies nowhere is not a rule (R1 at-least-one-leg), and minting a referent ' +
                'from a half-known feature would be the dangling-ref defect. Refusing by name.',
        );
    }

    const idBase = `fi-${feature.permanentPlanIdentifier ?? feature.planKey ?? 'noid'}`;
    const isMaster = feature.collection === 'pub_valid_lm_plan_ix_gs';
    const normativeForce = fiNormativeForce(feature);
    const rules: SiteIntelRule[] = [];

    const common = { feature, fetchedAtIso, basis, inlineGeometry, normativeForce } as const;

    // ── planType ────────────────────────────────────────────────────────────
    const planTypeLabel = resolveFiCode(
        FI_PLAN_TYPE_CODES,
        'RY_Kaavalaji',
        feature.planTypeCode,
    );
    rules.push(
        buildRule({
            ...common,
            id: `${idBase}-planType`,
            parameter: 'planType',
            value: planTypeLabel,
            unit: null,
            tier: planTypeLabel === null ? 6 : 1,
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            documentUrl: null,
            note:
                planTypeLabel === null
                    ? 'plan_type not served for this feature — UNKNOWN, never a default kind'
                    : `RY_Kaavalaji code ${feature.planTypeCode}, state codelist label verbatim`,
        }),
    );

    // ── planLifecycleStatus ─────────────────────────────────────────────────
    const lifecycleLabel = resolveFiCode(
        FI_LIFECYCLE_CODES,
        'kaavaelinkaari',
        feature.lifecycleStatusCode,
    );
    rules.push(
        buildRule({
            ...common,
            id: `${idBase}-planLifecycleStatus`,
            parameter: 'planLifecycleStatus',
            value: lifecycleLabel,
            unit: null,
            tier: lifecycleLabel === null ? 6 : 1,
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            documentUrl: null,
            note:
                lifecycleLabel === null
                    ? 'plan_life_cycle_status not served for this feature — UNKNOWN'
                    : `kaavaelinkaari code ${feature.lifecycleStatusCode}, label verbatim. ` +
                      'MEASURED CAVEAT: 6,282 of 6,282 features in both VALID indexes carry ' +
                      'code 13 Voimassa, so this value is a property of the COLLECTION filter ' +
                      'as much as of the plan — it does not discriminate between features.',
        }),
    );

    // ── planDigitalOrigin — the state's own fill-state declaration ──────────
    const digitalOriginLabel = resolveFiCode(
        FI_DIGITAL_ORIGIN_CODES,
        'RY_DigitaalinenAlkupera',
        feature.digitalOriginCode,
    );
    rules.push(
        buildRule({
            ...common,
            id: `${idBase}-planDigitalOrigin`,
            parameter: 'planDigitalOrigin',
            value: digitalOriginLabel,
            unit: null,
            tier: digitalOriginLabel === null ? 6 : 1,
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            documentUrl: null,
            note:
                digitalOriginLabel === null
                    ? 'digital_origin not served for this feature — UNKNOWN'
                    : `RY_DigitaalinenAlkupera code ${feature.digitalOriginCode}, label verbatim. ` +
                      'THIS IS THE SOURCE DECLARING ITS OWN FILL STATE: measured 2026-09-01, ' +
                      '6,278 of 6,282 valid-plan features (99.94%) are code 04/0401 "Rajaus ' +
                      'digitoitu" = only the OUTLINE was digitised; exactly 3 nationally are ' +
                      'code 01 "Tietomallin mukaan laadittu". A code-04 plan carries no ' +
                      'machine-readable provisions BY THE STATE\'S OWN ACCOUNT.',
        }),
    );

    // ── masterPlanLegalEffect (R5 source) — master plans only ───────────────
    if (isMaster) {
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-masterPlanLegalEffect`,
                parameter: 'masterPlanLegalEffect',
                value: normativeForce,
                unit: null,
                tier: normativeForce === null ? 6 : 1,
                derivation: 'DIRECT',
                valueLocation: 'attribute',
                documentUrl: null,
                note:
                    normativeForce === null
                        ? 'legal_effect_of_local_master_plan not served for this yleiskaava — ' +
                          'UNKNOWN, and NOT to be read as "oikeusvaikutukseton" (code 2): the ' +
                          'absence of a legal-effect flag is not a flag saying "no legal effect"'
                        : 'oikeusvaik_YK, state codelist label verbatim; also carried as this ' +
                          'and every sibling rule\'s R5 normativeForce. MEASURED: 647 of 647 ' +
                          'master plans carry code 1 "Oikeusvaikutteinen yleiskaava".',
            }),
        );
    }

    // ── planApprovalDate — case-1 emptiness made VISIBLE ────────────────────
    rules.push(
        buildRule({
            ...common,
            id: `${idBase}-planApprovalDate`,
            parameter: 'planApprovalDate',
            value: feature.approvalDate.kind === 'served' ? feature.approvalDate.iso : null,
            unit: null,
            tier: feature.approvalDate.kind === 'served' ? 1 : 6,
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            documentUrl: null,
            note:
                feature.approvalDate.kind === 'served'
                    ? 'approval_date served (trailing Z stripped)'
                    : `approval_date classified ${feature.approvalDate.kind}, raw ` +
                      `${JSON.stringify(feature.approvalDate.raw)} — UNKNOWN. The field EXISTS ` +
                      'and is empty/placeholder for this plan (case 1); this is NOT the same ' +
                      'fact as a parameter the source does not serve (case 2).',
        }),
    );

    // ── planValidityBegin — the sentinel's main home ────────────────────────
    rules.push(
        buildRule({
            ...common,
            id: `${idBase}-planValidityBegin`,
            parameter: 'planValidityBegin',
            value: feature.validityBegin.kind === 'served' ? feature.validityBegin.iso : null,
            unit: null,
            tier: feature.validityBegin.kind === 'served' ? 1 : 6,
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            documentUrl: null,
            note:
                feature.validityBegin.kind === 'served'
                    ? 'period_of_validity_begin served (trailing Z stripped)'
                    : `period_of_validity_begin classified ${feature.validityBegin.kind}, raw ` +
                      `${JSON.stringify(feature.validityBegin.raw)} — UNKNOWN, never a date. ` +
                      'MEASURED: 3,673 of 6,282 features carry exactly 1900-01-01 here.',
        }),
    );

    // ── planProvisionsDocument — the ONLY route to kaavamaaraykset ──────────
    const provisionDocs = feature.attachments.filter(
        (a) =>
            a.attachmentKindCode !== null &&
            FI_PROVISION_ATTACHMENT_KINDS.includes(a.attachmentKindCode),
    );
    if (provisionDocs.length === 0) {
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-planProvisionsDocument`,
                parameter: 'planProvisionsDocument',
                value: null,
                unit: null,
                tier: 6,
                derivation: 'DIRECT',
                valueLocation: 'attribute',
                documentUrl: null,
                note:
                    'no attachment of kind 04 "Kaavamaaraykset" or 05 "Kaavakartta ja ' +
                    'kaavamaaraykset" is served for this plan — UNKNOWN. The register DECLARES ' +
                    'a documents field (case-1 emptiness: null on 907 of 6,282 features), and ' +
                    'since the index serves no provisions as attributes, an absent provisions ' +
                    'PDF means the plan content is not reachable through this channel at all. ' +
                    'A kind-03 "Kaavakartta" is deliberately NOT accepted as a substitute: the ' +
                    'map without the provisions is a wrong legal address that reads correct.',
            }),
        );
    } else {
        for (const att of provisionDocs) {
            const kindLabel = resolveFiCode(
                FI_ATTACHMENT_KIND_CODES,
                'RY_AsiakirjanLaji_YKAK',
                att.attachmentKindCode,
            )!;
            rules.push(
                buildRule({
                    ...common,
                    id: `${idBase}-planProvisionsDocument-${att.attachmentId ?? 'noid'}`,
                    parameter: 'planProvisionsDocument',
                    value: att.uri,
                    unit: null,
                    // Tier 2 (authoritative-document-derived), NEVER tier 1: the frozen
                    // tier-projection guard rejects tier 1 + in-document-text at parse — "a
                    // value living only in rule prose is tier 2 territory".
                    tier: 2,
                    derivation: 'DIRECT',
                    valueLocation: 'in-document-text',
                    documentUrl: att.uri,
                    note:
                        `${kindLabel} (RY_AsiakirjanLaji_YKAK ${att.attachmentKindCode}), served ` +
                        `as ${JSON.stringify(att.nameFin)}. THE NUMBERS LIVE IN THIS PDF AND ` +
                        'NOWHERE ELSE ON THE OPEN CHANNEL — extracting them is a gated tier-4 ' +
                        '(AI) -> tier-5 (human-validated) pipeline job, NEVER inline parsing.',
                }),
            );
        }
    }

    return { plan, documents, rules, unservedParameters: FI_RYHTI_UNSERVED_PARAMETERS };
}
