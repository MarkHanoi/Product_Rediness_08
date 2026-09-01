// E7-NO — NORWAY (NO) · the PURE rule mapper: NAP reguleringsplan attributes -> E1a
// `SiteIntelRule` objects with DIRECT provenance, PLUS the minted planning entities those
// rules cite (the R1 referent contract).
//
// TOTAL, PURE, DETERMINISTIC: same features in -> byte-identical rules out. No fetch, no clock
// (the caller passes `fetchedAtIso`), no business logic — it does NOT decide what may be
// built; it records what the state serves, with its legal address. It makes exactly TWO
// refusals, both BY NAME, and both structural rather than judgemental:
//   (a) a feature with NO geometry AND no resolvable plan identity has nothing a rule could
//       apply to (the R1 at-least-one-leg case);
//   (b) an `utnytting.utnyttingstype` code outside the CLOSED national codelist — a national
//       schema change, which §6-E says MUST throw rather than be absorbed.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// §R2 — THE DENOMINATOR. THIS IS THE FINDING THE WHOLE LANE TURNS ON.
// ══════════════════════════════════════════════════════════════════════════════════════════
// Norway's degree-of-utilisation is the SOSI compound `Utnytting = { utnyttingstype,
// utnyttingstall }` — a MEASUREMENT-BASIS CODE and a NUMBER. The basis code is a CLOSED
// national codelist, fetched live 2026-09-01 from Kartverket's own register
// (https://register.geonorge.no/api/sosi-kodelister/plan/plan-felles/utnyttingstype.json):
// **16 members**, spanning four incompatible families and five building-code vintages —
//   percent of PLOT area   : 1 BYA-87 · 12 %-BYA-97 · 16 %-BYA · 3 TU · 5 F · 4 U
//   percent of FLOOR area  : 14 %-TU · 18 %-BRA
//   ABSOLUTE square metres : 2 BRA-87 · 13 T-BRA · 6 BGA · 7 BFA · 15 BYA · 17 BRA
//   ⛔ NOT NUMBERS AT ALL   : 10 "Ikke tillatt å bebygge" · 11 "Ikke tillatt med ytterligere
//                             bebyggelse" — i.e. BUILDING IS NOT PERMITTED.
//
// ⛔ AND NAP DOES NOT SERVE THE BASIS CODE. Measured on the live GetFeatureInfo JSON: the key
// `utnytting.utnyttingstype` IS NOT PRESENT on `rparealformalomrade` at all — while its legacy
// sibling `rbformalomrade` DOES carry the key (empty in 7 of 7). Two layers of one service,
// one with the measurement basis and one without.
//
// SO A SERVED `utnyttingstall` IS ONE NUMBER AGAINST SIXTEEN POSSIBLE MEANINGS, TWO OF WHICH
// SAY YOU MAY NOT BUILD. Multiplying it by a parcel area could produce a capacity for a plot
// where construction is forbidden — the C63 Aarhus trap in Norwegian. Per §6-E R2 this mapper
// therefore emits **NO `valueBasis`** and makes the rule's own note say the denominator is
// UNKNOWN and that a consumer must refuse a per-parcel multiply. It NEVER infers a denominator.
// {@link NO_UTNYTTINGSTYPE_CODELIST} is carried so that if NAP ever starts serving the code,
// the mapper emits it verbatim — and throws on a 17th value rather than absorbing it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// §UNKNOWN — THE THREE-WAY GUARD (control 9: UNKNOWN ≠ 0 ≠ unlimited ≠ no-restriction)
// ══════════════════════════════════════════════════════════════════════════════════════════
// `utnyttingstall` can arrive in three materially different states, and collapsing them would
// destroy a fact each time:
//   1. NOT SERVED (key absent, null or empty) — the plan states no utnytting through NAP.
//      Measured fill: **2 of 24** sampled `rparealformalomrade` features nationally.
//   2. ⛔ SERVED BUT DESTROYED IN TRANSPORT — the value arrives as `[Ljava.lang.Double;@<hex>`,
//      a Java array identity string. MEASURED on **6 of 6** filled instances across 3 Bergen
//      plans, in `application/json`, `application/vnd.ogc.gml`, `text/xml; subtype=gml/3.1.1`
//      AND `text/plain`; the hash differs between two requests for the SAME feature, proving
//      it is `Object.toString()` on a fresh array rather than data. The ONLY format that
//      renders the number is `text/html` (measured: `2,540` for Bergen objid 3062). ⛔ THE HTML
//      IS NOT ADOPTED — it is a human template with locale-formatted numbers, scraping it would
//      mint a rival transport for one field, and the number would STILL have no denominator.
//      This state is a tier-6 UNKNOWN whose note says the state HAS a value and this channel
//      cannot carry it — a different fact from "no value stated", and the E8 document lane's
//      entry point.
//   3. A REAL FINITE NUMBER — tier 1, value emitted, still with NO `valueBasis` and still with
//      the refuse-the-multiply note (§R2).
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// §R3 — VALIDITY. Norway is the first adapter in this wave with a genuine IN-FORCE axis.
// `ikrafttredelsesdato` ("date of entry into force") was filled on **30 of 30** sampled
// RpOmråde features. That is positive evidence of legal force, so rules whose plan resolved
// with a well-formed one carry `validityBasis: 'legal'` + that date, and the minted Plan
// carries it as `inForceFrom` — NOT as `adoptedDate`. The adoption axis is a DIFFERENT column,
// `vedtakEndeligPlanDato`, filled on **1 of 30**; it maps to `adoptedDate` and stays null
// otherwise. Mirroring in-force into adoption (or the reverse) would fabricate a legal fact.
// A rule whose plan row did not resolve falls to `'ingestion'` + the fetch date.
//
// §R5 — NORMATIVE FORCE. NAP serves NO per-value force flag on any feature type measured (no
// analogue of DK `bygvejledende` or LT `rekomendacinio pobūdžio`). `normativeForce` is
// therefore null on every rule — and this sentence is the "say so" §6-E requires. It is NOT an
// assertion that the values are non-binding.
//
// §R1 rank — null on every rule, and the reason is the THIRD of §6-E's three: **a ladder
// exists but it is adapter DATA, not a per-rule fact.** NAP serves `plantype` (30/34/35
// observed) per plan, which plausibly encodes a specificity ladder, but this lane did NOT
// resolve the `Plantype` codelist (it is not among the seven codelists the national register
// publishes under `plan/reguleringsplan`), and ranking on unresolved codes would be a guess.
// The instrument ladder lives in `NO_APPLICABILITY_LADDER` (index.ts) as data + caveat.
//
// §VERTICAL LEVEL. Every rule carries the served `vertikalnivå` as its own tier-1 rule AND the
// minted entity's typology code is the NAP LAYER NAME (`rparealformalomrade_vn1`), which
// encodes the level verbatim. A rule set from level 1 is UNDER GROUND; see `noPlanProvider.ts`
// for the measured Bergen case where one parcel carries a 2023 tunnel plan at vn1 and a 1983
// surface plan at vn2.

import {
    SiteIntelPlanSchema,
    SiteIntelPrescriptionSchema,
    SiteIntelRuleSchema,
    SiteIntelZoneSchema,
    type NativeCrsGeometry,
    type RuleBasisRef,
    type RuleDerivation,
    type RuleValueLocation,
    type SiteIntelPlan,
    type SiteIntelPrescription,
    type SiteIntelRule,
    type SiteIntelZone,
} from '@pryzm/schemas';
import { isNapJavaArraySentinel } from './noNapClient.js';
import type { NoArealplanId, NoPlanArea, NoPlanObject, NoZoneArea } from './noPlanProvider.js';
import { NO_NAP_SOURCE_ID } from './noSourceRefs.js';

/* ────────────────────────────── vocabulary ─────────────────────────────────────── */

/** The publishing authority string carried in every NO rule's source ref. */
export const NO_RULE_AUTHORITY =
    'NAP — Nasjonal arealplanbase (Direktoratet for byggkvalitet), national copy of the kommunal planregister';

/** R2 `valueBasis.scheme` for the SOSI degree-of-utilisation basis codelist. */
export const NO_UTNYTTINGSTYPE_SCHEME = 'sosi-utnyttingstype';

/**
 * The CLOSED national `Utnyttingstype` codelist, FETCHED 2026-09-01 from Kartverket's register
 * (16 members, verbatim `codevalue = label`). A served code outside this set is a national
 * schema change and {@link readUtnyttingstype} THROWS on it rather than absorbing it (§6-E R2).
 */
export const NO_UTNYTTINGSTYPE_CODELIST: Readonly<Record<string, string>> = Object.freeze({
    '1': 'BYA-87',
    '2': 'BRA-87',
    '3': 'TU',
    '4': 'U',
    '5': 'F',
    '6': 'BGA',
    '7': 'BFA',
    '10': 'Ikke tillatt å bebygge',
    '11': 'Ikke tillatt med ytterligere bebyggelse',
    '12': '%-BYA-97',
    '13': 'T-BRA',
    '14': '%-TU',
    '15': 'BYA',
    '16': '%-BYA',
    '17': 'BRA',
    '18': '%-BRA',
});

/**
 * The two `Utnyttingstype` members that are NOT capacities but PROHIBITIONS. Carried as data
 * because "you may not build" and "we do not know the denominator" are the two halves of the
 * refusal every `utnyttingstall` rule has to state (C74: name both numbers).
 */
export const NO_UTNYTTINGSTYPE_PROHIBITION_CODES = Object.freeze(['10', '11'] as const);

/** Where a reader resolves any of the mirrored SOSI codes. Keyless JSON, probed 2026-09-01. */
export const NO_SOSI_CODELIST_REGISTER = 'https://register.geonorge.no/api/sosi-kodelister/plan';

/** One row of the NO -> canonical rule vocabulary, for the DECLARED zone attribute set. */
export interface NoRuleVocabularyEntry {
    /** The NAP property key, verbatim (dot-flattened SOSI compound where applicable). */
    readonly napKey: string;
    /** Canonical parameter name emitted into `RuleProvenance.parameter`. */
    readonly parameter: string;
    /** Unit, or null for dimensionless codes/ratios. */
    readonly unit: string | null;
    /** Which NAP feature types carry it (measured via GetFeatureInfo key sets). */
    readonly featureTypes: readonly string[];
    /** True when the value is a number whose meaning depends on an unserved denominator. */
    readonly denominatorDependent: boolean;
}

/**
 * The measured, DECLARED zone-attribute vocabulary. Emission is keyed off THIS table, not off
 * the served bag, so a NAP answer that omits a null key cannot silently delete a parameter
 * from the result (§6-E, control 9).
 */
export const NO_RULE_VOCABULARY: readonly NoRuleVocabularyEntry[] = [
    {
        napKey: 'utnytting.utnyttingstall',
        parameter: 'degreeOfUtilisation',
        unit: null,
        featureTypes: ['rparealformalomrade', 'rbformalomrade'],
        denominatorDependent: true,
    },
    {
        napKey: 'utnytting.utnyttingstall_minimum',
        parameter: 'degreeOfUtilisationMinimum',
        unit: null,
        featureTypes: ['rparealformalomrade', 'rbformalomrade'],
        denominatorDependent: true,
    },
    {
        napKey: 'uteoppholdsareal',
        parameter: 'outdoorAmenityArea',
        unit: null,
        featureTypes: ['rparealformalomrade', 'rbformalomrade'],
        denominatorDependent: true,
    },
    {
        napKey: 'byggverkbestemmelse',
        parameter: 'structureProvisionCode',
        unit: null,
        featureTypes: ['rparealformalomrade', 'rbformalomrade'],
        denominatorDependent: false,
    },
    {
        napKey: 'avkjørselsbestemmelse',
        parameter: 'accessProvisionCode',
        unit: null,
        featureTypes: ['rparealformalomrade', 'rbformalomrade'],
        denominatorDependent: false,
    },
];

/* ────────────────────────────── ids (ONE seat each) ───────────────────────────── */

/** Deterministic id of the minted Plan for a national `arealplanId`. ONE naming seat. */
export function noPlanEntityId(id: NoArealplanId): string {
    return `no-plan-${id.kommunenummer}-${id.planidentifikasjon}`;
}

/**
 * Deterministic id of a minted Zone. Prefers `identifikasjon.lokalId` (a UUID, the DURABLE
 * identity) and falls back to plan + objid. ⛔ It NEVER uses the WMS `fid`, which is measured
 * unstable between two requests for the same object.
 */
export function noZoneEntityId(zone: NoZoneArea): string {
    if (zone.lokalId !== null) return `no-zone-${zone.lokalId}`;
    const objid = zone.raw['objid'];
    const plan = zone.arealplanId;
    const planPart = plan !== null ? `${plan.kommunenummer}-${plan.planidentifikasjon}` : 'noplan';
    return `no-zone-${planPart}-${zone.featureType}-${objid === undefined || objid === null ? 'noobj' : String(objid)}`;
}

/** Deterministic id of a minted Prescription (hensynssone, bestemmelsesområde, juridisk linje…). */
export function noPrescriptionEntityId(obj: NoPlanObject): string {
    if (obj.lokalId !== null) return `no-prescription-${obj.featureType}-${obj.lokalId}`;
    const objid = obj.raw['objid'];
    const plan = obj.arealplanId;
    const planPart = plan !== null ? `${plan.kommunenummer}-${plan.planidentifikasjon}` : 'noplan';
    return `no-prescription-${obj.featureType}-${planPart}-${objid === undefined || objid === null ? 'noobj' : String(objid)}`;
}

/* ────────────────────────────── pure readers ───────────────────────────────────── */

/**
 * PURE: `2023-05-31Z` / `2023-05-31` / `2023-05-31T00:00:00Z` -> `2023-05-31`; anything else
 * -> null. NEVER guesses: a date this cannot read is a date the rule does not claim.
 */
export function readNoIsoDate(raw: string | null): string | null {
    if (raw === null) return null;
    const m = /^(\d{4}-\d{2}-\d{2})(?:Z|T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?|[+-]\d{2}:\d{2})?$/.exec(raw.trim());
    return m ? m[1]! : null;
}

/** The three states a NAP `utnytting` number can arrive in. Distinct by construction. */
export type NoUtnyttingReading =
    | { readonly kind: 'not-served'; readonly raw: unknown }
    | { readonly kind: 'transport-destroyed'; readonly sentinel: string }
    | { readonly kind: 'value'; readonly value: number }
    | { readonly kind: 'unreadable'; readonly raw: unknown };

/**
 * PURE: classify one served `utnytting.*` value under §UNKNOWN's three-way guard. ⛔ The
 * `transport-destroyed` arm is checked FIRST: a Java-array identity string is a non-empty
 * string and `Number()` of it is NaN, so a naive numeric parse would collapse state 2 into
 * state 1 and lose the fact that the state HAS a value.
 */
export function readNoUtnyttingNumber(raw: unknown): NoUtnyttingReading {
    if (isNapJavaArraySentinel(raw)) return { kind: 'transport-destroyed', sentinel: String(raw).trim() };
    if (raw === undefined || raw === null) return { kind: 'not-served', raw };
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? { kind: 'value', value: raw } : { kind: 'unreadable', raw };
    }
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (s === '') return { kind: 'not-served', raw };
        const n = Number(s);
        return Number.isFinite(n) ? { kind: 'value', value: n } : { kind: 'unreadable', raw };
    }
    return { kind: 'unreadable', raw };
}

/**
 * PURE: read a served `utnytting.utnyttingstype`. Returns `undefined` when the KEY IS NOT
 * SERVED BY THE FEATURE TYPE (the `rparealformalomrade` case), `null` when the key exists and
 * is empty (the `rbformalomrade` case), and the verbatim code when served.
 *
 * ⛔ THROWS BY NAME on a code outside the closed national codelist — §6-E R2: "Where the code
 * is a closed state codelist, a value outside it is a national schema change and MUST throw,
 * never be absorbed."
 */
export function readUtnyttingstype(raw: unknown): string | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    const s = String(raw).trim();
    if (s === '') return null;
    if (!(s in NO_UTNYTTINGSTYPE_CODELIST)) {
        throw new Error(
            `no-rule-mapper: NAP served utnyttingstype '${s}', which is NOT a member of the closed ` +
                `national SOSI Utnyttingstype codelist (16 members, fetched 2026-09-01 from ` +
                `${NO_SOSI_CODELIST_REGISTER}/plan-felles/utnyttingstype.json: ` +
                `${Object.keys(NO_UTNYTTINGSTYPE_CODELIST).join(', ')}). A 17th value is a NATIONAL ` +
                'SCHEMA CHANGE, and absorbing it would silently attach an unknown measurement basis ' +
                'to a capacity number. Refusing by name (E4 §6-E R2).',
        );
    }
    return s;
}

/* ────────────────────────────── minted entities ────────────────────────────────── */

function ringPolygon(geometry: NoPlanArea['geometry'], crs: string): NativeCrsGeometry | null {
    if (geometry === null) return null;
    const kind = geometry.type;
    if (
        kind !== 'Point' &&
        kind !== 'LineString' &&
        kind !== 'Polygon' &&
        kind !== 'MultiPolygon' &&
        kind !== 'MultiLineString' &&
        kind !== 'MultiPoint'
    ) {
        return null;
    }
    return {
        crs,
        kind,
        // Coordinates exactly as served — uninterpreted at L0 per NativeCrsGeometrySchema.
        coordinates: geometry.coordinates as NativeCrsGeometry['coordinates'],
    };
}

/**
 * PURE: one `RpOmråde` -> the minted `SiteIntelPlan`, or null when it serves no `planstatus`
 * (`Plan.status` is REQUIRED and MIRRORED — a status-less row cannot honestly become a Plan,
 * and its rules then ride the inline-geometry leg).
 *
 * ⚠ `status` mirrors the SOSI **code** verbatim (`'3'`), because that is all NAP serves — there
 * is no `planstatus_navn` column. Resolve it at {@link NO_SOSI_CODELIST_REGISTER}; a
 * PRYZM-side translation table here would be the invented harmonisation the schema forbids.
 */
export function mapNoPlanAreaToPlan(area: NoPlanArea): SiteIntelPlan | null {
    if (area.planstatus === null) return null;
    if (area.arealplanId === null) return null;
    return SiteIntelPlanSchema.parse({
        id: noPlanEntityId(area.arealplanId),
        // The Norwegian instrument, verbatim: an open string per REPORT §I.
        kind: 'reguleringsplan',
        status: area.planstatus,
        // The ADOPTION axis (`vedtakEndeligPlanDato`, 1 of 30 filled) — never the in-force date.
        adoptedDate: readNoIsoDate(area.vedtakEndeligPlanDato),
        // The IN-FORCE axis (`ikrafttredelsesdato`, 30 of 30 filled) — Norway serves it natively.
        inForceFrom: readNoIsoDate(area.ikrafttredelsesdato),
        inForceTo: null,
        // No SiteIntelDocument entities are minted: the kommune planregister card travels
        // VERBATIM on every rule's `source.document` instead (the EE pattern).
        documents: [],
        geometryRef: null,
        source: NO_NAP_SOURCE_ID,
        version: null,
    });
}

/** PURE: one formålområde -> the minted `SiteIntelZone`, or null without geometry or a plan. */
export function mapNoZoneAreaToZone(zone: NoZoneArea, plan: SiteIntelPlan | null): SiteIntelZone | null {
    if (plan === null) return null;
    const geometry = ringPolygon(zone.geometry, zone.crs);
    if (geometry === null) return null;
    const national = zone.arealformaal ?? zone.reguleringsformaal;
    if (national === null) return null;
    return SiteIntelZoneSchema.parse({
        id: noZoneEntityId(zone),
        planId: plan.id,
        typology: {
            // The SOSI code, verbatim. `rparealformalomrade` carries `arealformål` (post-2009
            // pbl); the legacy `rbformalomrade` carries pbl-1985 `reguleringsformål`. Two
            // national vocabularies, both mirrored, neither merged.
            national,
            // No cross-country mapping EXISTS for SOSI arealformål — never guessed.
            harmonised: null,
        },
        geometry,
        source: NO_NAP_SOURCE_ID,
    });
}

/**
 * PURE: one hensynssone / bestemmelsesområde / juridisk-linje object -> the minted
 * `SiteIntelPrescription`, or null without geometry. The typology CODE is the NAP LAYER NAME
 * including its `_vn<n>` suffix, so the vertical level is carried verbatim in the typology
 * rather than reconstructed by a consumer.
 */
export function mapNoPlanObjectToPrescription(
    obj: NoPlanObject,
    zoneOrPlanRef: string,
): SiteIntelPrescription | null {
    const geometry = ringPolygon(obj.geometry, obj.crs);
    if (geometry === null) return null;
    return SiteIntelPrescriptionSchema.parse({
        id: noPrescriptionEntityId(obj),
        // The SOSI class name, verbatim (`RpSikringSone`, `RpBåndleggingSone`,
        // `RpBestemmelseOmråde`, `RpJuridiskLinje`…). `kind` is open per REPORT §I's own "…".
        kind: obj.objekttypenavn ?? obj.featureType,
        geometry,
        typology: { scheme: 'no-nap-layer', code: `${obj.featureType}_vn${obj.level}` },
        // Scalar payloads ride the Rules, not the geometry.
        value: null,
        zoneOrPlanRef,
        source: NO_NAP_SOURCE_ID,
    });
}

/* ────────────────────────────── rule construction ──────────────────────────────── */

function noSourceRef(
    dataset: string,
    objectLabel: string | null,
    plan: NoPlanArea | null,
): {
    country: string;
    authority: string;
    dataset: string;
    plan_id: string | null;
    object_id: string | null;
    document: string | null;
    article: null;
    page: null;
} {
    const planId =
        plan?.arealplanId !== null && plan?.arealplanId !== undefined
            ? `${plan.arealplanId.kommunenummer}/${plan.arealplanId.planidentifikasjon}`
            : null;
    return {
        country: 'NO',
        authority: NO_RULE_AUTHORITY,
        dataset,
        plan_id: planId,
        object_id: objectLabel,
        // The kommune planregister card — where the BESTEMMELSER live. Every tier-6 UNKNOWN
        // this mapper emits points a reader at it.
        document: plan?.link ?? null,
        article: null,
        page: null,
    };
}

/**
 * R3: the typed validity axis. `'legal'` + the plan's IN-FORCE date when one resolved
 * well-formed; `'ingestion'` + the fetch date otherwise. Positive evidence only.
 */
export function noValidity(
    plan: NoPlanArea | null,
    fetchedAtIso: string,
): { readonly validityBasis: 'legal' | 'ingestion'; readonly valid_from: string } {
    const inForce = plan !== null ? readNoIsoDate(plan.ikrafttredelsesdato) : null;
    if (inForce !== null) return { validityBasis: 'legal', valid_from: inForce };
    return { validityBasis: 'ingestion', valid_from: fetchedAtIso };
}

interface BuildRuleArgs {
    readonly id: string;
    readonly parameter: string;
    readonly value: number | string | boolean | null;
    readonly unit: string | null;
    readonly dataset: string;
    readonly objectLabel: string | null;
    readonly plan: NoPlanArea | null;
    readonly fetchedAtIso: string;
    readonly tier: 1 | 2 | 6;
    readonly derivation: RuleDerivation;
    readonly valueLocation: RuleValueLocation;
    readonly note: string | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
    readonly useScope: readonly string[];
    readonly valueBasis?: { readonly scheme: string; readonly code: string };
}

function buildRule(a: BuildRuleArgs): SiteIntelRule {
    const v = noValidity(a.plan, a.fetchedAtIso);
    return SiteIntelRuleSchema.parse({
        id: a.id,
        body: null,
        applicability: {
            basis: a.basis,
            geometry: a.inlineGeometry,
            useScope: a.useScope,
            // §R1 rank: null — a ladder exists but it is adapter DATA, not a per-rule fact
            // (NO_APPLICABILITY_LADDER). See the header for why `plantype` is NOT ranked.
            rank: null,
            condition: null,
        },
        provenance: {
            parameter: a.parameter,
            value: a.value,
            unit: a.unit,
            source: noSourceRef(a.dataset, a.objectLabel, a.plan),
            derivation: a.derivation,
            valueLocation: a.valueLocation,
            confidence: a.note !== null ? { tier: a.tier, note: a.note } : { tier: a.tier },
            ...(a.valueBasis !== undefined ? { valueBasis: a.valueBasis } : {}),
            // §R5: NAP serves no per-value normative-force flag on any measured feature type.
            normativeForce: null,
            validityBasis: v.validityBasis,
            valid_from: v.valid_from,
            valid_to: null,
        },
    });
}

/* ────────────────────────────── the R1 referent ladder ─────────────────────────── */

interface MintedTarget {
    readonly plan: SiteIntelPlan | null;
    readonly zone: SiteIntelZone | null;
    readonly basis: readonly RuleBasisRef[];
    readonly inlineGeometry: NativeCrsGeometry | null;
}

/**
 * The R1 referent ladder — mints what it cites and cites only what it minted:
 *   1. plan resolved (with status) + zone geometry -> mint Plan + Zone; basis cites the Zone.
 *   2. plan resolved, no zone geometry -> basis cites the minted Plan.
 *   3. plan NOT resolvable, geometry served -> carry the geometry INLINE, cite nothing.
 *   4. neither -> THROW BY NAME.
 */
function mintTarget(zone: NoZoneArea, planArea: NoPlanArea | null): MintedTarget {
    const plan = planArea !== null ? mapNoPlanAreaToPlan(planArea) : null;
    const mintedZone = mapNoZoneAreaToZone(zone, plan);
    if (plan !== null && mintedZone !== null) {
        return { plan, zone: mintedZone, basis: [{ kind: 'zone', ref: mintedZone.id }], inlineGeometry: null };
    }
    if (plan !== null) {
        return { plan, zone: null, basis: [{ kind: 'plan', ref: plan.id }], inlineGeometry: null };
    }
    const inline = ringPolygon(zone.geometry, zone.crs);
    if (inline !== null) return { plan: null, zone: null, basis: [], inlineGeometry: inline };
    throw new Error(
        `no-rule-mapper: ${zone.featureType} feature ${noZoneEntityId(zone)} served NO geometry and ` +
            'its plan identity did not resolve — a rule that applies nowhere is not a rule (R1 ' +
            'at-least-one-leg). Refusing by name instead of minting a dangling referent.',
    );
}

/* ────────────────────────────── the mapping ────────────────────────────────────── */

/** What one mapped formålområde yields: the minted referents + the rules that cite them. */
export interface NoMappedRuleSet {
    readonly plan: SiteIntelPlan | null;
    readonly zone: SiteIntelZone | null;
    readonly rules: readonly SiteIntelRule[];
}

const DENOMINATOR_REFUSAL_NOTE =
    'DENOMINATOR UNKNOWN — a per-parcel multiply MUST be refused. Norway measures degree of ' +
    'utilisation as the SOSI compound Utnytting = {utnyttingstype, utnyttingstall}, and NAP ' +
    'does NOT serve utnyttingstype on rparealformalomrade (the key is absent from the feature ' +
    'type; measured 2026-09-01). The national codelist has 16 members: 6 are a percentage of ' +
    'PLOT area, 2 a percentage of FLOOR area, 6 an ABSOLUTE m2, and 2 (codes 10, 11) are not ' +
    'capacities at all but PROHIBITIONS on building. So the served number has 16 possible ' +
    'meanings, 2 of which mean construction is not permitted. No valueBasis is emitted and ' +
    'none is inferred (E4 control 8, §6-E R2).';

const TRANSPORT_DESTROYED_NOTE =
    'UNKNOWN because the TRANSPORT DESTROYED THE VALUE, not because the plan is silent — a ' +
    'materially different fact. NAP renders utnytting.utnyttingstall as a Java array identity ' +
    'string ("[Ljava.lang.Double;@<hex>") in EVERY machine format (application/json, ' +
    'application/vnd.ogc.gml, text/xml;subtype=gml/3.1.1, text/plain); the hex differs between ' +
    'two requests for the SAME feature, so it is an object identity, not data. Measured on 6 of ' +
    '6 filled instances across 3 Bergen plans, 2026-09-01. Only text/html renders the number, ' +
    'and that is a human presentation template with locale-formatted decimals — this adapter ' +
    'does not scrape it. Recover the value from the plan document named in source.document.';

const NOT_SERVED_NOTE =
    'UNKNOWN — NAP served no value for this attribute on this formalomrade. UNKNOWN is not 0, ' +
    'not unlimited and not "no restriction" (E4 control 9): Norwegian plan provisions ' +
    '(bestemmelser) routinely set limits that the SOSI attribute model leaves empty, and those ' +
    'live in the document named in source.document. Measured national fill on this attribute ' +
    'family: utnyttingstall 2 of 24 sampled formalomrader; uteoppholdsareal, byggverkbestemmelse ' +
    'and avkjorselsbestemmelse 0 of 24.';

/**
 * PURE: one formålområde (+ the RpOmråde it belongs to, when resolved) -> the minted referents
 * + `SiteIntelRule[]`. Every `basis` ref resolves to an entity RETURNED HERE (the R1 referent
 * contract), and every rule validates against `SiteIntelRuleSchema`.
 */
export function mapNoZoneToRules(
    zone: NoZoneArea,
    planArea: NoPlanArea | null,
    fetchedAtIso: string,
): NoMappedRuleSet {
    const target = mintTarget(zone, planArea);
    const dataset = `${zone.featureType}_vn${zone.level}`;
    const objectLabel =
        zone.feltbetegnelse !== null
            ? `${zone.objekttypenavn ?? zone.featureType} ${zone.feltbetegnelse}`
            : (zone.lokalId ?? zone.objekttypenavn ?? zone.featureType);
    const idBase = noZoneEntityId(zone);
    // R1 useScope: the zone's own national use token, verbatim. Every rule below is a rule
    // ABOUT that use — this is the narrowing qualifier, not a leg.
    const useToken = zone.arealformaal ?? zone.reguleringsformaal;
    const useScope = useToken !== null ? [useToken] : [];

    const rules: SiteIntelRule[] = [];
    const common = {
        dataset,
        objectLabel,
        plan: planArea,
        fetchedAtIso,
        derivation: 'DIRECT' as const,
        valueLocation: 'attribute' as const,
        basis: target.basis,
        inlineGeometry: target.inlineGeometry,
    };

    // ── the served CODES (tier 1, mirrored verbatim, never translated) ──────────────
    if (zone.arealformaal !== null) {
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-landUsePurpose`,
                parameter: 'landUsePurpose',
                value: zone.arealformaal,
                unit: null,
                tier: 1,
                note: `SOSI RpArealformål code, verbatim; resolve at ${NO_SOSI_CODELIST_REGISTER}/reguleringsplan/rparealformal.json`,
                useScope,
            }),
        );
    }
    if (zone.reguleringsformaal !== null) {
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-legacyLandUsePurpose`,
                parameter: 'legacyLandUsePurpose',
                value: zone.reguleringsformaal,
                unit: null,
                tier: 1,
                note: 'pbl-1985 reguleringsformål code from the legacy RbFormålOmråde type, verbatim — a DIFFERENT national vocabulary from RpArealformål, not merged with it',
                useScope,
            }),
        );
    }
    if (zone.eierform !== null) {
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-ownershipForm`,
                parameter: 'ownershipForm',
                value: zone.eierform,
                unit: null,
                tier: 1,
                note: `SOSI Eierformtype code, verbatim; resolve at ${NO_SOSI_CODELIST_REGISTER}-felles/eierformtype.json`,
                useScope,
            }),
        );
    }
    if (zone.feltbetegnelse !== null) {
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-fieldDesignation`,
                parameter: 'fieldDesignation',
                value: zone.feltbetegnelse,
                unit: null,
                tier: 1,
                note: 'the field label on the plan drawing — the key a reader uses to find this area in the bestemmelser text',
                useScope,
            }),
        );
    }
    // ⭐ The vertical level, as a first-class rule: a level-1 rule set is UNDER GROUND.
    rules.push(
        buildRule({
            ...common,
            id: `${idBase}-verticalLevel`,
            parameter: 'verticalLevel',
            value: zone.servedVertikalnivaa ?? String(zone.level),
            unit: null,
            tier: 1,
            note:
                'SOSI Vertikalnivå code, verbatim. Level 1 is UNDER GROUND (tunnel) — a consumer ' +
                'that reads a level-1 formålområde as surface development rights is wrong. ' +
                'Measured at Bergen teig 4601-167/714: a 2023 light-rail tunnel plan at level 1 ' +
                'and a different 1983 surface plan at level 2, over one parcel.',
            useScope,
        }),
    );

    // ── the DECLARED numeric/provision vocabulary (emitted whether or not served) ────
    for (const entry of NO_RULE_VOCABULARY) {
        if (!entry.featureTypes.includes(zone.featureType)) continue;
        const raw =
            entry.napKey === 'utnytting.utnyttingstall'
                ? zone.utnyttingstallRaw
                : entry.napKey === 'utnytting.utnyttingstall_minimum'
                  ? zone.utnyttingstallMinimumRaw
                  : entry.napKey === 'uteoppholdsareal'
                    ? zone.uteoppholdsarealRaw
                    : entry.napKey === 'byggverkbestemmelse'
                      ? zone.byggverkbestemmelseRaw
                      : zone.avkjorselsbestemmelseRaw;
        const reading = readNoUtnyttingNumber(raw);

        // §R2: the basis code, when the feature type serves it at all. THROWS on a code
        // outside the closed national codelist.
        const typeCode = entry.denominatorDependent ? readUtnyttingstype(zone.utnyttingstypeRaw) : undefined;
        const valueBasis =
            typeof typeCode === 'string'
                ? { scheme: NO_UTNYTTINGSTYPE_SCHEME, code: typeCode }
                : undefined;
        const basisNote = !entry.denominatorDependent
            ? null
            : valueBasis !== undefined
              ? `denominator SERVED: utnyttingstype ${valueBasis.code} = ${NO_UTNYTTINGSTYPE_CODELIST[valueBasis.code]}` +
                ((NO_UTNYTTINGSTYPE_PROHIBITION_CODES as readonly string[]).includes(valueBasis.code)
                    ? ' — ⛔ this code is a PROHIBITION on building, NOT a capacity'
                    : '')
              : typeCode === null
                ? `${DENOMINATOR_REFUSAL_NOTE} (on this feature type the utnyttingstype KEY EXISTS and is EMPTY — measured 0 of 7 on rbformalomrade)`
                : DENOMINATOR_REFUSAL_NOTE;

        const joinNote = (head: string): string => (basisNote !== null ? `${head} · ${basisNote}` : head);

        if (reading.kind === 'value') {
            rules.push(
                buildRule({
                    ...common,
                    id: `${idBase}-${entry.parameter}`,
                    parameter: entry.parameter,
                    value: reading.value,
                    unit: entry.unit,
                    tier: 1,
                    note: entry.denominatorDependent ? joinNote('value served') : null,
                    useScope,
                    ...(valueBasis !== undefined ? { valueBasis } : {}),
                }),
            );
        } else if (reading.kind === 'transport-destroyed') {
            rules.push(
                buildRule({
                    ...common,
                    id: `${idBase}-${entry.parameter}`,
                    parameter: entry.parameter,
                    value: null,
                    unit: entry.unit,
                    tier: 6,
                    note: joinNote(`${TRANSPORT_DESTROYED_NOTE} Served token: ${reading.sentinel}.`),
                    useScope,
                    ...(valueBasis !== undefined ? { valueBasis } : {}),
                }),
            );
        } else if (reading.kind === 'unreadable') {
            rules.push(
                buildRule({
                    ...common,
                    id: `${idBase}-${entry.parameter}`,
                    parameter: entry.parameter,
                    value: null,
                    unit: entry.unit,
                    tier: 6,
                    note: joinNote(
                        `UNKNOWN — NAP served ${JSON.stringify(String(raw))} for ${entry.napKey}, which is ` +
                            'neither a finite number nor the known transport sentinel. Not coerced.',
                    ),
                    useScope,
                    ...(valueBasis !== undefined ? { valueBasis } : {}),
                }),
            );
        } else {
            rules.push(
                buildRule({
                    ...common,
                    id: `${idBase}-${entry.parameter}`,
                    parameter: entry.parameter,
                    value: null,
                    unit: entry.unit,
                    tier: 6,
                    note: joinNote(NOT_SERVED_NOTE),
                    useScope,
                    ...(valueBasis !== undefined ? { valueBasis } : {}),
                }),
            );
        }
    }

    // `beskrivelse` — the qualitative remainder, served verbatim as prose. Tier 2, and
    // `in-document-text`: a value living only in rule prose is tier-2 territory (the frozen
    // provenance guard rejects tier 1 + in-document-text at parse). Extracting numbers out of
    // it is the gated E8 pipeline's job, never inline parsing here.
    if (zone.beskrivelse !== null) {
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-beskrivelse`,
                parameter: 'zoneDescription',
                value: zone.beskrivelse,
                unit: null,
                tier: 2,
                derivation: 'DIRECT',
                valueLocation: 'in-document-text',
                note: 'free-text plan description served verbatim — numeric limits inside it require the gated extraction pipeline (tier 4->5), never inline parsing',
                useScope,
            }),
        );
    }

    return { plan: target.plan, zone: target.zone, rules };
}

/**
 * PURE: one `RpOmråde` -> the PLAN-LEVEL rules (lifecycle codes and the provisions pointer).
 * Separate from the zone rules because they apply to the whole plan, not to one use.
 */
export function mapNoPlanAreaToRules(area: NoPlanArea, fetchedAtIso: string): NoMappedRuleSet {
    const plan = mapNoPlanAreaToPlan(area);
    const geometry = ringPolygon(area.geometry, area.crs);
    let basis: readonly RuleBasisRef[] = [];
    let inlineGeometry: NativeCrsGeometry | null = null;
    if (plan !== null) basis = [{ kind: 'plan', ref: plan.id }];
    else if (geometry !== null) inlineGeometry = geometry;
    else {
        throw new Error(
            `no-rule-mapper: RpOmråde ${area.lokalId ?? '<no lokalId>'} served neither a resolvable ` +
                'plan identity nor geometry — a rule that applies nowhere is not a rule (R1 ' +
                'at-least-one-leg). Refusing by name.',
        );
    }
    const dataset = `${area.featureType}_vn${area.level}`;
    const idBase =
        area.arealplanId !== null
            ? `no-${area.arealplanId.kommunenummer}-${area.arealplanId.planidentifikasjon}-vn${area.level}`
            : `no-plan-${area.lokalId ?? 'unknown'}-vn${area.level}`;
    const common = {
        dataset,
        objectLabel: area.plannavn ?? area.lokalId,
        plan: area,
        fetchedAtIso,
        derivation: 'DIRECT' as const,
        valueLocation: 'attribute' as const,
        basis,
        inlineGeometry,
        useScope: [] as readonly string[],
    };
    const rules: SiteIntelRule[] = [];
    const codeRules: ReadonlyArray<readonly [string, string | null, string]> = [
        ['planType', area.plantype, `SOSI Plantype code, verbatim; NOT ranked — this lane did not resolve the Plantype codelist, and ranking on unresolved codes would be a guess (§R1 rank)`],
        ['planStatus', area.planstatus, `SOSI Planstatus code, verbatim; resolve at ${NO_SOSI_CODELIST_REGISTER}`],
        [
            'planProvisionsCode',
            area.planbestemmelse,
            'SOSI Planbestemmelse code, verbatim — the register\'s own statement about whether this plan carries textual provisions (bestemmelser). Their CONTENT is not in NAP; the document is at source.document.',
        ],
        ['legalReference', area.lovreferanse, 'SOSI Lovreferanse code, verbatim — which planning act the plan was adopted under'],
    ];
    for (const [parameter, value, note] of codeRules) {
        if (value === null) continue;
        rules.push(buildRule({ ...common, id: `${idBase}-${parameter}`, parameter, value, unit: null, tier: 1, note }));
    }
    if (area.plannavn !== null) {
        rules.push(
            buildRule({ ...common, id: `${idBase}-planName`, parameter: 'planName', value: area.plannavn, unit: null, tier: 1, note: null }),
        );
    }
    if (area.informasjon !== null) {
        // ⚠ MEASURED CONTENT: this column carries the plan's HEIGHT DATUM as prose —
        // "Høydereferanse NN2000" and "Høydereferanse Trondheim lokal" were both observed.
        // A height read from such a plan is measured against a datum that is sometimes LOCAL.
        rules.push(
            buildRule({
                ...common,
                id: `${idBase}-planInformation`,
                parameter: 'planInformation',
                value: area.informasjon,
                unit: null,
                tier: 2,
                valueLocation: 'in-document-text',
                note:
                    'free-text plan information, verbatim. ⚠ MEASURED: this column is where NAP ' +
                    'carries the plan\'s VERTICAL DATUM — "Høydereferanse NN2000" and ' +
                    '"Høydereferanse Trondheim lokal" both observed (6 of 30 sampled plans). Any ' +
                    'absolute height from this plan is measured against that datum, and a LOCAL ' +
                    'datum is not NN2000. Parsing it is the gated document pipeline\'s job.',
            }),
        );
    }
    return { plan, zone: null, rules };
}
