// E6-LT — LITHUANIA (LT) · plan arm: ASGR (the national CONSOLIDATED valid-regulations layer)
// plus the TPDR `ribos` register that gives each cited planning document its identity.
//
// REPORT §J: `planGeometry: PlanProvider — zones, plans, prescriptions, restrictions (typed
// outcomes)`. Schema mapping ONLY. The regulation VALUES ride the parsed property bag out of
// here; turning them into E1a `SiteIntelRule` objects is `ltRuleMapper.ts` (pure), so the
// impure fetch and the pure mapping stay separable (C58 §1.9).
//
// ══ THE PER-VALUE PROVENANCE CORRECTION (measured 2026-09-01 — READ THIS BEFORE EDITING) ════
// The audit lane and `packages/schemas/src/siteintel/vocabularies/lt.ts` both describe the
// `*_TP` / `*_NR` / `*_D` / `*_TPR` provenance suffixes as attaching to "EACH of the four value
// families", where "value" reads as the four NUMERIC regulation fields. Measured against the
// live layer descriptor (`ASGR/MapServer/0?f=json`, 33 fields, 2026-09-01) that is WRONG in two
// ways, and this module encodes the MEASURED truth:
//
//   1. THERE IS NO UNDERSCORE before the suffix. The columns are `PAGR_PASKTP`, `PAGR_PASKNR`,
//      `PAGR_PASKD`, `PAGR_PASKTPR` — NOT `PAGR_PASK_TP`. `ltAsgrProvenanceColumns()` in the
//      L0 vocabulary emits the underscored form, so its output names columns that DO NOT
//      EXIST; this module does not call it.
//   2. THE PROVENANCE FAMILIES ARE THE FOUR **CLASSIFICATION** FIELDS, NOT THE FOUR NUMERICS.
//      Suffixed columns exist for `PAGR_PASK`, `NAUD_BUD`, `FUNKC_ZON`, `NAUD_TIP` and for
//      NOTHING else. `MAX_AUK_M`, `MAX_INTENS`, `MAX_TANKIS`, `MIN_APZELD` carry NO source id,
//      NO document number, NO approval date and NO planning kind. Live proof on the baseline
//      parcel 0101/0054:0328, ASGR OBJECTID 97619: `FUNKC_ZON` cites TPD 203143899 (the Vilnius
//      comprehensive plan, approved 2021-06-02) while `PAGR_PASK`/`NAUD_BUD`/`NAUD_TIP` cite
//      TPD 123025 (a detail plan, approved 2021-12-17) — two documents, two dates, one polygon,
//      and the four numerics on that same polygon belong to NEITHER by any served column.
//   Consequence, enforced in `ltRuleMapper.ts`: classification rules get a LEGAL address and a
//   `validityBasis:'legal'`; numeric rules get NEITHER, and say so (R3 `'ingestion'`).
//
// ══ R3 SETTLED BY CROSS-SERVICE MEASUREMENT, not by assertion ═══════════════════════════════
// The `*D` columns are aliased "TP dokumento **tvirtinimo** data" (APPROVAL date) by the
// service AND by the VTPSI LEIP specification — but the ASGR-generated `APIBENDR` prose calls
// the same value "Registravimo data" (REGISTRATION date). Those are different legal facts, and
// R3 requires deciding WHICH and recording it. Decided by measurement (2026-09-01), because the
// `ribos` register serves BOTH dates as separate columns:
//   TPD 123025    → ASGR *D 2021-12-17 · ribos TVIRT_DATA **2021-12-17** · REGISTRUOTA 2021-12-21
//   TPD 203143899 → ASGR *D 2021-06-02 · ribos TVIRT_DATA **2021-06-02** · REGISTRUOTA 2021-06-08
// The ASGR `*D` equals TVIRT_DATA in both cases and the registration date in neither.
// ⇒ `*D` IS the instrument's APPROVAL date — a LEGAL date axis — and the `APIBENDR` wording is
// the loose one. Do not "correct" the mapping from the prose without re-running this pair.
//
// MEASURED SCHEMA (`ASGR/MapServer/0?f=json` + queries, 2026-09-01):
//   classification: PAGR_PASK (main land-use purpose) · NAUD_BUD (use mode, ";"-joined) ·
//     FUNKC_ZON (functional zone type) · NAUD_TIP (territory use type) — each with
//     `<FIELD>TP` (source TPD system id) · `<FIELD>NR` (document number) · `<FIELD>D`
//     (approval date, epoch ms) · `<FIELD>TPR` (planning kind/subkind, e.g. `K_D`, `B_SAV`).
//   numerics: MAX_AUK_M (Single) · MAX_INTENS (Single) · MAX_TANKIS (SmallInteger) ·
//     MIN_APZELD (SmallInteger).
//   flags: PILN (P/N completeness) · ATN_DOK (ND/D non-spatial-update) · PRIORIT (1/2).
//     ⚠ ALL THREE ARE ENTIRELY UNPOPULATED NATIONALLY: 0 non-null of 175,570 polygons for each,
//     measured by `returnCountOnly` 2026-09-01. They are parsed here because a future fill must
//     not need a code change — but no live row exercises them today, and any test that claims
//     to must label its row SYNTHETIC.
//   prose: APIBENDR (summarising text about the regulation in force) — 175,570 of 175,570
//     non-null; the one field that is ALWAYS served.
//
// COVERAGE HONESTY (measured 2026-09-01): 175,570 ASGR polygons nationally; 141,020 (80.3%)
// carry NO numeric regulation at all; MAX_AUK_M non-null 31,960 (18.2%); MAX_INTENS non-null
// 23,932 (13.6%); MAX_TANKIS 30,393. An `absent` from this layer, and a polygon with null
// numerics, are DIFFERENT facts and both are distinct from "nothing may be built" — the caveat
// travels verbatim in {@link LT_ASGR_ABSENCE_CAVEAT}.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { ArcgisRestFeature } from '../../providers/containers/arcgisRest.js';
import {
    LT_ASGR_LAYER_ID,
    LT_ASGR_SERVICE,
    LT_NATIVE_CRS,
    LT_TPDR_RIBOS_LAYER_ID,
    LT_TPDR_RIBOS_SERVICE,
    ltArcgisQuery,
    ltEpochMsToIsoDate,
    ltEsriOuterRing,
    ltNum,
    ltRingIntersectParams,
    ltStr,
    ltWgs84PointParams,
    ltWhereParams,
    type LtArcgisDeps,
} from './ltArcgisClient.js';

const tracer = trace.getTracer('pryzm.siteintel.lt');

/**
 * The four ASGR CLASSIFICATION fields — the ONLY fields that carry per-value provenance
 * columns (measured; see the header). Order is the layer's own field order.
 */
export const LT_ASGR_CLASSIFICATION_FIELDS = Object.freeze([
    'PAGR_PASK',
    'NAUD_BUD',
    'FUNKC_ZON',
    'NAUD_TIP',
] as const);
export type LtAsgrClassificationField = (typeof LT_ASGR_CLASSIFICATION_FIELDS)[number];

/** The four ASGR NUMERIC regulation fields — none of which carries provenance columns. */
export const LT_ASGR_NUMERIC_FIELDS = Object.freeze([
    'MAX_AUK_M',
    'MAX_INTENS',
    'MAX_TANKIS',
    'MIN_APZELD',
] as const);
export type LtAsgrNumericField = (typeof LT_ASGR_NUMERIC_FIELDS)[number];

/**
 * The MEASURED provenance column names for one classification field — no underscore before the
 * suffix. This is the corrected sibling of the L0 vocabulary's `ltAsgrProvenanceColumns()`,
 * which emits the underscored form and therefore names columns the service does not have.
 */
export function ltAsgrProvenanceColumnsMeasured(
    field: LtAsgrClassificationField,
): readonly [string, string, string, string] {
    return [`${field}TP`, `${field}NR`, `${field}D`, `${field}TPR`];
}

/** `outFields` for the ASGR query — explicit, never `*`. */
export const LT_ASGR_OUT_FIELDS = [
    'OBJECTID',
    ...LT_ASGR_CLASSIFICATION_FIELDS.flatMap((f) => [f, ...ltAsgrProvenanceColumnsMeasured(f)]),
    ...LT_ASGR_NUMERIC_FIELDS,
    'PILN',
    'ATN_DOK',
    'PRIORIT',
    'APIBENDR',
    'VAIZD',
].join(',');

/** `outFields` for the `ribos` TPD-register query. */
export const LT_TPDR_RIBOS_OUT_FIELDS = [
    'TPD_ID',
    'ROOT_ID',
    'EIL_NR',
    'NR',
    'PAVAD',
    'PL_RUSIS',
    'PL_PORUSIS',
    'PL_PORUSIS_APRASYMAS',
    'BUSENA',
    'BUSENA_APRASYMAS',
    'TVIRT_DATA',
    'REGISTRUOTA',
    'ISIGALIOJO',
    'ISREGISTRUOTA',
    'GALIOJA_NUO',
    'GALIOJA_IKI',
    'TPD_URL',
    'AKTUALI',
    'VIESAS',
].join(',');

/**
 * The consolidation caveat, verbatim in substance from the VTPSI LEIP specification
 * (2024-06-18, Table 19 row 2): ASGR is built by merging the dispositions of all valid planning
 * documents, newer/more-detailed superseding older/coarser, and *"Duomenys yra rekomendacinio
 * pobudzio"* — the data is RECOMMENDATION-GRADE; the legal source is the underlying TPD.
 * Attached to every `absent` and mirrored into every rule's R5 `normativeForce`.
 */
export const LT_ASGR_ABSENCE_CAVEAT =
    'absent = no ASGR consolidation polygon at this location. ASGR is a recommendation-grade ' +
    'consolidation ("Duomenys yra rekomendacinio pobudzio", VTPSI LEIP spec 2024-06-18) whose ' +
    'legal source is the underlying TPD — absence here is NOT proof that no planning document ' +
    'governs the site, and a polygon with null numerics is NOT a zero and NOT a prohibition ' +
    '(80.3% of the 175,570 national polygons carry no numeric regulation at all, measured ' +
    '2026-09-01)';

/** One classification value together with the provenance the register serves FOR THAT VALUE. */
export interface LtAsgrClassifiedValue {
    /** The ASGR field this value came from. */
    readonly field: LtAsgrClassificationField;
    /** The value, verbatim (e.g. `"KT"`, `"V;B"`, `"U_SK_F"`, `"SI"`), or null when unfilled. */
    readonly value: string | null;
    /** `<FIELD>TP` — the source TPD system identifier (e.g. `"123025"`), or null. */
    readonly tpdSystemId: string | null;
    /** `<FIELD>NR` — the planning document number (e.g. `"T00087142"`), or null. */
    readonly documentNumber: string | null;
    /**
     * `<FIELD>D` — the source document's APPROVAL date, `YYYY-MM-DD`, or null.
     * Proven to be `ribos.TVIRT_DATA` (approval), not the registration date — see the header.
     */
    readonly approvalDate: string | null;
    /** `<FIELD>TPR` — the source document's planning kind/subkind (`"K_D"`, `"B_SAV"`), or null. */
    readonly planningKind: string | null;
}

/** One numeric regulation value, exactly as served — with NO provenance, because none is served. */
export interface LtAsgrNumericValue {
    readonly field: LtAsgrNumericField;
    /** The served number, or null when the column is empty. Uninterpreted here. */
    readonly value: number | null;
}

/** An ASGR consolidation polygon: the raw served values + native-CRS ring, nothing coerced. */
export interface LtAsgrPolygon {
    /** `OBJECTID` — the layer's GIS identifier, the only stable per-polygon handle served. */
    readonly objectId: number | null;
    /** The four classification values, each with its OWN provenance. */
    readonly classifications: readonly LtAsgrClassifiedValue[];
    /** The four numeric regulation values, provenance-less by design of the source. */
    readonly numerics: readonly LtAsgrNumericValue[];
    /** `PILN` completeness flag (`P` full / `N` possibly incomplete), or null (measured: always null). */
    readonly completenessFlag: string | null;
    /** `ATN_DOK` non-spatial-update flag (`ND` / `D`), or null (measured: always null). */
    readonly nonSpatialUpdateFlag: string | null;
    /** `PRIORIT` implementation-priority code, or null (measured: always null). */
    readonly priority: number | null;
    /** `APIBENDR` — the summarising prose about the regulation in force. Always served. */
    readonly summaryText: string | null;
    /** Outer ring exactly as served ([easting, northing] pairs). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly crs: string;
}

/**
 * A registered TPD (planning document) row from `ribos` — the plan identity, its lifecycle
 * status and BOTH date axes kept apart.
 */
export interface LtTpdRegisterRow {
    /** `TPD_ID` — the version's system identifier, the join key ASGR's `<FIELD>TP` carries. */
    readonly tpdId: number;
    /** `ROOT_ID` — the document's root-version id (the versioning axis). */
    readonly rootId: number | null;
    /** `EIL_NR` — the version ordinal. */
    readonly versionNumber: number | null;
    /** `NR` — the TPD registration number (e.g. `T00087142`): the NATIONAL plan identifier. */
    readonly registrationNumber: string | null;
    /** `PAVAD` — the document title, verbatim. */
    readonly title: string | null;
    /** `PL_RUSIS` / `PL_PORUSIS` — planning kind and subkind codes, verbatim. */
    readonly planningKind: string | null;
    readonly planningSubkind: string | null;
    /** `BUSENA_APRASYMAS` — lifecycle status, verbatim (`"Registruotas"`, …). MIRRORED, never harmonised. */
    readonly statusName: string | null;
    /** `TVIRT_DATA` — the APPROVAL date. The legal act. */
    readonly approvalDate: string | null;
    /** `REGISTRUOTA` — the REGISTER entry date. An administrative act; never a rule's `valid_from`. */
    readonly registeredDate: string | null;
    /** `ISIGALIOJO` — the date the document came INTO FORCE. */
    readonly inForceDate: string | null;
    /** `ISREGISTRUOTA` — de-registration date, or null. A REGISTER act; see the mapper's note. */
    readonly deregisteredDate: string | null;
    /** `GALIOJA_NUO` / `GALIOJA_IKI` — this VERSION's validity window in the register. */
    readonly versionValidFrom: string | null;
    readonly versionValidTo: string | null;
    /** `TPD_URL` — the document card URL. The machine-anchorable citation. */
    readonly documentUrl: string | null;
    /** `AKTUALI` / `VIESAS` — currency and publicity flags, as served. */
    readonly current: number | null;
    readonly publiclyVisible: number | null;
}

/* ────────────────────────────── pure parsers ──────────────────────────── */

/** PURE: one ASGR feature → `LtAsgrPolygon`. Total; never throws. */
export function parseLtAsgrPolygon(
    feature: ArcgisRestFeature,
    crs: string = LT_NATIVE_CRS,
): LtAsgrPolygon {
    const a = feature.attributes;
    const classifications: LtAsgrClassifiedValue[] = LT_ASGR_CLASSIFICATION_FIELDS.map((field) => {
        const [tp, nr, d, tpr] = ltAsgrProvenanceColumnsMeasured(field);
        return {
            field,
            value: ltStr(a, field),
            tpdSystemId: ltStr(a, tp),
            documentNumber: ltStr(a, nr),
            approvalDate: ltEpochMsToIsoDate(a[d]),
            planningKind: ltStr(a, tpr),
        };
    });
    const numerics: LtAsgrNumericValue[] = LT_ASGR_NUMERIC_FIELDS.map((field) => ({
        field,
        value: ltNum(a, field),
    }));
    return {
        objectId: ltNum(a, 'OBJECTID'),
        classifications,
        numerics,
        completenessFlag: ltStr(a, 'PILN'),
        nonSpatialUpdateFlag: ltStr(a, 'ATN_DOK'),
        priority: ltNum(a, 'PRIORIT'),
        summaryText: ltStr(a, 'APIBENDR'),
        ring: ltEsriOuterRing(feature.geometry),
        crs,
    };
}

/** PURE: one `ribos` feature → `LtTpdRegisterRow`, or null without a `TPD_ID`. */
export function parseLtTpdRegisterRow(feature: ArcgisRestFeature): LtTpdRegisterRow | null {
    const a = feature.attributes;
    const tpdId = ltNum(a, 'TPD_ID');
    if (tpdId === null) return null;
    return {
        tpdId,
        rootId: ltNum(a, 'ROOT_ID'),
        versionNumber: ltNum(a, 'EIL_NR'),
        registrationNumber: ltStr(a, 'NR'),
        title: ltStr(a, 'PAVAD'),
        planningKind: ltStr(a, 'PL_RUSIS'),
        planningSubkind: ltStr(a, 'PL_PORUSIS'),
        statusName: ltStr(a, 'BUSENA_APRASYMAS'),
        approvalDate: ltEpochMsToIsoDate(a['TVIRT_DATA']),
        registeredDate: ltEpochMsToIsoDate(a['REGISTRUOTA']),
        inForceDate: ltEpochMsToIsoDate(a['ISIGALIOJO']),
        deregisteredDate: ltEpochMsToIsoDate(a['ISREGISTRUOTA']),
        versionValidFrom: ltEpochMsToIsoDate(a['GALIOJA_NUO']),
        versionValidTo: ltEpochMsToIsoDate(a['GALIOJA_IKI']),
        documentUrl: ltStr(a, 'TPD_URL'),
        current: ltNum(a, 'AKTUALI'),
        publiclyVisible: ltNum(a, 'VIESAS'),
    };
}

/* ────────────────────────────── fetch legs ────────────────────────────── */

function withAsgrCaveat<T>(outcome: FetchOutcome<T>): FetchOutcome<T> {
    return outcome.status === 'absent'
        ? { status: 'absent', reason: `${outcome.reason} — ${LT_ASGR_ABSENCE_CAVEAT}` }
        : outcome;
}

/**
 * ASGR polygons INTERSECTING a parcel ring — the server-side exact-intersection form. `ring` is
 * `[easting, northing]` pairs exactly as the cadastre serves them, so this adapter does no
 * geometry math at all (the EE lane's centroid defect and its bbox-over-cover alternative were
 * both read before this was written; neither is repeated here).
 */
export async function resolveLtAsgrForRing(
    ring: ReadonlyArray<readonly [number, number]>,
    deps: LtArcgisDeps = {},
): Promise<FetchOutcome<readonly LtAsgrPolygon[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lt.resolveAsgrForRing',
        async (span): Promise<FetchOutcome<readonly LtAsgrPolygon[]>> => {
            try {
                const outcome = await ltArcgisQuery(
                    LT_ASGR_SERVICE,
                    LT_ASGR_LAYER_ID,
                    ltRingIntersectParams(ring, LT_ASGR_OUT_FIELDS, true),
                    `ASGR intersects parcel ring (${ring.length} pts)`,
                    deps,
                );
                if (outcome.status !== 'found') {
                    span.setStatus(
                        outcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return withAsgrCaveat(outcome);
                }
                span.setAttribute('lt.asgr.polygons', outcome.value.length);
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    status: 'found',
                    value: outcome.value.map((f) => parseLtAsgrPolygon(f)),
                };
            } finally {
                span.end();
            }
        },
    );
}

/** ASGR polygons at a WGS84 point (the map-click path) — same caveat handling. */
export async function resolveLtAsgrAtWgs84Point(
    lat: number,
    lon: number,
    deps: LtArcgisDeps = {},
): Promise<FetchOutcome<readonly LtAsgrPolygon[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lt.resolveAsgrAtPoint',
        async (span): Promise<FetchOutcome<readonly LtAsgrPolygon[]>> => {
            try {
                const outcome = await ltArcgisQuery(
                    LT_ASGR_SERVICE,
                    LT_ASGR_LAYER_ID,
                    ltWgs84PointParams(lat, lon, LT_ASGR_OUT_FIELDS),
                    `ASGR @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                    deps,
                );
                if (outcome.status !== 'found') {
                    span.setStatus(
                        outcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return withAsgrCaveat(outcome);
                }
                span.setStatus({ code: SpanStatusCode.OK });
                return { status: 'found', value: outcome.value.map((f) => parseLtAsgrPolygon(f)) };
            } finally {
                span.end();
            }
        },
    );
}

/**
 * The `ribos` register row for one `TPD_ID` — the join that turns an ASGR `<FIELD>TP` string
 * into a planning document with a status, an approval date and a citable URL. Without it no
 * `SiteIntelPlan` can be minted (status is REQUIRED and MIRRORED — inventing one is the
 * defect, not the caution).
 */
export async function resolveLtTpdRegisterRow(
    tpdId: number,
    deps: LtArcgisDeps = {},
): Promise<FetchOutcome<LtTpdRegisterRow>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lt.resolveTpdRegisterRow',
        async (span): Promise<FetchOutcome<LtTpdRegisterRow>> => {
            try {
                span.setAttribute('lt.tpdId', tpdId);
                const outcome = await ltArcgisQuery(
                    LT_TPDR_RIBOS_SERVICE,
                    LT_TPDR_RIBOS_LAYER_ID,
                    ltWhereParams(`TPD_ID = ${tpdId}`, LT_TPDR_RIBOS_OUT_FIELDS, false),
                    `ribos TPD_ID=${tpdId}`,
                    deps,
                );
                if (outcome.status !== 'found') {
                    span.setStatus(
                        outcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return outcome;
                }
                const row = parseLtTpdRegisterRow(outcome.value[0]!);
                if (row === null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: unparsable ribos row (TPD_ID=${tpdId})`);
                }
                span.setStatus({ code: SpanStatusCode.OK });
                return { status: 'found', value: row };
            } finally {
                span.end();
            }
        },
    );
}

/**
 * Every DISTINCT TPD system id an ASGR polygon cites across its four classification families,
 * in first-seen order. Pure — this is the set the chain resolves against `ribos`, and the
 * reason one polygon can mint MORE THAN ONE plan (measured: OBJECTID 97619 cites two).
 */
export function ltAsgrCitedTpdIds(polygon: LtAsgrPolygon): readonly number[] {
    const seen: number[] = [];
    for (const c of polygon.classifications) {
        if (c.tpdSystemId === null) continue;
        const n = Number(c.tpdSystemId);
        if (!Number.isInteger(n)) continue;
        if (!seen.includes(n)) seen.push(n);
    }
    return seen;
}
