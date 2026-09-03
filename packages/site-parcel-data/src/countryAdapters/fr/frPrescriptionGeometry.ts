// LANE FR-PRESCRIPTIONS — FRANCE (FR) · THE PRESCRIPTION→GEOMETRY CONSUMER (the P1
// authoritative-geometry tier, STR-EUROPEAN-ENVELOPE-SOURCES §9).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS — AND DELIBERATELY IS NOT
// ═════════════════════════════════════════════════════════════════════════════════════════════
// France's Géoportail de l'urbanisme (GPU) PUBLISHES the geometric consequence of planning rules
// nationally, keyless (`data.geopf.fr/wfs`, quantified live 2026-09-02, envelope-geometry-census):
//   • `prescription_surf` `typepsc='14'`               — 5,291 SECTEURS DE PLAN DE MASSE (R151-40):
//                                                        the buildable VOLUME drawn as a polygon.
//   • `prescription_lin`  `typepsc='15'`               — 69,739 MARGES DE RECUL (R151-39): the
//                                                        setback drawn as a line the façade meets.
//   • `prescription_surf` `typepsc='39' AND stypepsc='02'` — 61,176 HEIGHT-LIMIT polygons; the
//                                                        number is IN THE LIBELLE, zone-dependent.
//
// This module CONSUMES that drawn geometry into a PARTIAL ENVELOPE CONTRIBUTION SET that feeds the
// EXISTING engine's `explicit-area` / height path (ADR-0270 `explicitArea.ts`,
// `computeBuildableEnvelope`). It is NOT a new solver — it produces the inputs the solver already
// accepts, exactly as `resolveMadridNZ1Ring` / the DK byggefelt path feed the same primitive
// (STR §9 P1: "explicit authoritative envelope geometry — USE IT", never re-derive it).
//
// It UPGRADES the FR no-extraction refusal (frNoExtraction.ts) to a PARTIAL DRAWN ENVELOPE wherever
// GPU geometry exists; where it does not, the A.5 degradation ladder
// (STR-ENVELOPE-SUFFICIENCY-LEGENDS §A.5) NAMES the missing slot — a partial envelope with a named
// gap is a saleable product; a blank page is not.
//
// ⚠ NEVER-OVERSTATE, structurally (C58 §1.4 / §1.14.4 / L-616):
//   • The plan-masse polygon is the LOAD-BEARING footprint; clipping it to the parcel is the
//     ENGINE's job (`solveExplicitArea` = parcel ∩ footprint), never inflated here.
//   • A height LIBELLE gives a NUMBER and a TOP measurement point ("au faîtage" = to the ridge) but
//     NOT the ground DATUM plane (that lives in the règlement text). Per ADR-0377 the datum is
//     `unknown`, and `unknown` REFUSES to be applied as a plane-anchored cap: the number is carried
//     as a representable-and-flagged study upper bound (`appliesAsBindingCap: false`), never
//     multiplied into a volume on an unresolved plane (the E8 DE «72,2 m über NHN» class).
//   • Municipal typology discipline is imperfect: a `typepsc=14` feature can be upload noise
//     ("Voies classée bruyante type I"). The consumer FILTERS by code AND VERIFIES by libelle/txt,
//     and RECORDS what it declined — a mis-coded feature is never drawn as a plan-masse.
//
// PROVENANCE: every contribution carries the repo's 8-field `RuleSourceRef` legal address (F1–F8) +
// the R3 `validityBasis` axis — `idurba` is the plan+version (plan_id), `datvalid`/`DATAPPRO` the
// validity date, `nomfic`(#page) the règlement address. The provenance shape is the existing
// `FrSliceProvenance` (frNoExtraction.ts), reused not re-minted.
//
// PURE (C58 §1.9): no I/O, no clock (`fetchedAtIso` is an INPUT), no THREE, no DOM, no RNG. Same
// inputs → byte-identical output (determinism). The ONE impure seam below
// (`frPrescriptionGeoFeaturesAtPoint`) REUSES `frGpuClient`'s classified GET — it does not
// duplicate the fetch (L-12874: no new refusal-token spelling is minted).

import {
    fetchAbsent,
    fetchFound,
    fetchTransient,
    UNKNOWN_HEIGHT_DATUM,
    JurisdictionZoningContractSchema,
    type FetchOutcome,
    type HeightDatum,
    type JurisdictionZoningContract,
    type Pt,
    type RuleSourceRef,
} from '@pryzm/schemas';
import {
    buildFrGpuPointUrl,
    frGpuGetJson,
    type FrFetchDeps,
    type FrGpuPointModule,
} from './frGpuClient.js';
import { FR_GPU_AUTHORITY, frYyyymmddToIso, type FrSliceProvenance } from './frNoExtraction.js';
import { parseFrIdurba, parseFrReglementPageAnchor } from './frZoneIdentity.js';

/* ────────────────────────────── the geometry-carrying feature ───────────── */

/** A WGS84 point — GPU geometry is served in EPSG:4326 (`urn:ogc:def:crs:EPSG::4326`). */
export interface FrLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** GeoJSON geometry as API Carto / the WFS deliver it (coordinates in [lon, lat] order). */
export type FrGeoJsonGeometry =
    | { readonly type: 'Polygon'; readonly coordinates: unknown }
    | { readonly type: 'MultiPolygon'; readonly coordinates: unknown }
    | { readonly type: 'LineString'; readonly coordinates: unknown }
    | { readonly type: 'MultiLineString'; readonly coordinates: unknown };

/**
 * ONE GPU prescription feature WITH its geometry — the shape the census transcripts recorded
 * (`fr-presc-surf-14-sample.json` etc.). This is a SUPERSET of `frGpuClient`'s `FrGpuFeature`
 * (which carries `properties` only, geometry deliberately stripped for the zone-identity leg):
 * consuming DRAWN geometry needs the geometry, so this leg keeps it.
 */
export interface FrPrescriptionGeoFeature {
    readonly geometry: FrGeoJsonGeometry | null;
    readonly properties: Record<string, unknown>;
}

/* ────────────────────────────── one part of a footprint / polygon ────────── */

/** One part of a drawn polygon: an outer ring plus the interior holes cut out of it (WGS84). */
export interface FrGeoPart {
    readonly outer: readonly FrLatLon[];
    /** Interior holes — a published "do not build here". NEVER dropped (dropping over-states). */
    readonly holes: readonly (readonly FrLatLon[])[];
}

/* ────────────────────────────── small pure helpers ──────────────────────── */

const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
};
const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

/** A finite `[lon, lat]` GeoJSON position → `FrLatLon`, or null when malformed. */
function positionToLatLon(pos: unknown): FrLatLon | null {
    if (!Array.isArray(pos) || pos.length < 2) return null;
    const lon = pos[0];
    const lat = pos[1];
    if (typeof lon !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return { lat, lon };
}

/** A GeoJSON linear ring/line (`[[lon,lat],…]`) → `FrLatLon[]`; malformed vertices are DROPPED. */
function ringToLatLon(ring: unknown): FrLatLon[] {
    if (!Array.isArray(ring)) return [];
    const out: FrLatLon[] = [];
    for (const pos of ring) {
        const p = positionToLatLon(pos);
        if (p !== null) out.push(p);
    }
    return out;
}

/**
 * Parse a Polygon/MultiPolygon geometry into `FrGeoPart[]` (WGS84). A Polygon is a single part;
 * a MultiPolygon is N parts. Ring 0 of each polygon is the outer, the rest are holes.
 * Returns `[]` for a non-polygonal or empty geometry (the caller decides what an empty means).
 */
export function parseFrPolygonParts(geometry: FrGeoJsonGeometry | null): FrGeoPart[] {
    if (geometry === null) return [];
    const packInto = (polygon: unknown): FrGeoPart | null => {
        if (!Array.isArray(polygon) || polygon.length === 0) return null;
        const outer = ringToLatLon(polygon[0]);
        if (outer.length < 3) return null;
        const holes: FrLatLon[][] = [];
        for (let h = 1; h < polygon.length; h += 1) {
            const hole = ringToLatLon(polygon[h]);
            if (hole.length >= 3) holes.push(hole);
        }
        return { outer, holes };
    };
    if (geometry.type === 'Polygon') {
        const part = packInto(geometry.coordinates);
        return part === null ? [] : [part];
    }
    if (geometry.type === 'MultiPolygon') {
        if (!Array.isArray(geometry.coordinates)) return [];
        const parts: FrGeoPart[] = [];
        for (const polygon of geometry.coordinates) {
            const part = packInto(polygon);
            if (part !== null) parts.push(part);
        }
        return parts;
    }
    return [];
}

/** Parse a LineString/MultiLineString geometry into `FrLatLon[][]` polylines (WGS84). */
export function parseFrLineStrings(geometry: FrGeoJsonGeometry | null): FrLatLon[][] {
    if (geometry === null) return [];
    if (geometry.type === 'LineString') {
        const line = ringToLatLon(geometry.coordinates);
        return line.length >= 2 ? [line] : [];
    }
    if (geometry.type === 'MultiLineString') {
        if (!Array.isArray(geometry.coordinates)) return [];
        const out: FrLatLon[][] = [];
        for (const line of geometry.coordinates) {
            const parsed = ringToLatLon(line);
            if (parsed.length >= 2) out.push(parsed);
        }
        return out;
    }
    return [];
}

/* ────────────────────────────── provenance (F1–F8) ──────────────────────── */

/** The GPU dataset string a prescription contribution cites, per typepsc. */
export const FR_PRESCRIPTION_DATASET: Readonly<Record<'plan-masse' | 'setback' | 'height', string>> =
    {
        'plan-masse': 'GPU prescription_surf (typepsc=14 secteur de plan de masse, R151-40)',
        setback: 'GPU prescription (typepsc=15 marge de recul / implantation, R151-39)',
        height: 'GPU prescription_surf (typepsc=39 stypepsc=02 hauteur des constructions)',
    };

/** Build the 8-field legal address (F1–F8) for one drawn prescription feature. */
function frPrescriptionSource(
    dataset: string,
    props: Record<string, unknown>,
): RuleSourceRef {
    const idurba = str(props['idurba']);
    const libelle = str(props['libelle']);
    const gid = num(props['gid']);
    const nomfic = typeof props['nomfic'] === 'string' ? (props['nomfic'] as string) : null;
    const urlfic = typeof props['urlfic'] === 'string' ? (props['urlfic'] as string) : null;
    const objectId =
        libelle !== null && gid !== null
            ? `${libelle} (gid ${gid})`
            : (libelle ?? (gid !== null ? `gid ${gid}` : null));
    return {
        country: 'FR',
        authority: FR_GPU_AUTHORITY,
        dataset,
        plan_id: idurba, // F: the plan + version (idurba = commune_INSTRUMENT_approvalDate)
        object_id: objectId,
        document: str(nomfic)?.replace(/#page=\d+$/i, '') ?? null, // règlement PDF address
        article: null,
        page: parseFrReglementPageAnchor(nomfic, urlfic),
    };
}

/**
 * The validity axis (R3): the instrument date when the GPU serves one (`datvalid`/`datappro`, or
 * the approval date embedded in `idurba`) → `legal`; ingestion-versioned otherwise.
 */
function frPrescriptionValidity(
    props: Record<string, unknown>,
    fetchedAtIso: string,
): { readonly validityBasis: 'legal' | 'ingestion'; readonly valid_from: string } {
    const iso =
        frYyyymmddToIso(props['datvalid']) ??
        frYyyymmddToIso(props['datappro']) ??
        parseFrIdurba(str(props['idurba'])).instrumentDate;
    return iso !== null
        ? { validityBasis: 'legal', valid_from: iso }
        : { validityBasis: 'ingestion', valid_from: fetchedAtIso.slice(0, 10) };
}

function frPrescriptionProvenance(
    dataset: string,
    props: Record<string, unknown>,
    fetchedAtIso: string,
): FrSliceProvenance {
    return {
        source: frPrescriptionSource(dataset, props),
        ...frPrescriptionValidity(props, fetchedAtIso),
        retrieved_at: fetchedAtIso,
    };
}

/* ────────────────────────────── the three contribution kinds ────────────── */

/** F-A drawn footprint from a `typepsc=14` secteur de plan de masse (R151-40). WGS84 parts. */
export interface FrDrawnFootprintContribution {
    readonly kind: 'drawn-footprint';
    /** A stable per-feature handle (`fr-plan-masse:<idurba>#<gid>`). */
    readonly ringRef: string;
    /** The drawn buildable volume as WGS84 polygon parts (clip-to-parcel is the ENGINE's job). */
    readonly parts: readonly FrGeoPart[];
    readonly libelle: string | null;
    readonly txt: string | null;
    readonly gid: number | null;
    readonly provenance: FrSliceProvenance;
    readonly note: string;
}

/** The TOP measurement point a height libelle names (NOT the ground datum plane). */
export type FrHeightMeasuredTo = 'faitage' | 'egout' | 'acrotere' | 'unspecified';

/** A height cap parsed from a `typepsc=39/02` polygon libelle (the number is IN the label). */
export interface FrDrawnHeightCap {
    readonly kind: 'drawn-height-cap';
    /** Metres parsed from the libelle, or null when the label states no number (Paris — in text). */
    readonly maxHeight_m: number | null;
    /** The top point the number is measured TO ("au faîtage" = ridge). Verbatim-derived. */
    readonly measuredTo: FrHeightMeasuredTo;
    /**
     * ADR-0377 — the ground DATUM the height is measured FROM. The GPU label states the number and
     * the top point but NOT the plane; per ADR-0377 that absence is `{ kind: 'unknown' }`, and
     * `unknown` REFUSES to be applied as a plane-anchored cap.
     */
    readonly heightDatum: HeightDatum;
    /** ADR-0377 — always `false` here: an `unknown` datum is representable-and-flagged, not applied. */
    readonly appliesAsBindingCap: boolean;
    /** WHY the number does not bind as a cap: the datum is unresolved (or the value is in text). */
    readonly bindingBasis: 'study-upper-bound-datum-unresolved' | 'value-in-reglement-text';
    /** The VERBATIM libelle — the citation ('HAUTEUR DES CONSTRUCTIONS LIMITEE A 9 METRES AU FAITAGE'). */
    readonly citation: string;
    /** The height-zone polygon (WGS84 parts) the cap applies within. */
    readonly parts: readonly FrGeoPart[];
    readonly gid: number | null;
    readonly provenance: FrSliceProvenance;
    readonly datumNote: string;
}

/** A drawn `typepsc=15` marge de recul — the line/zone the façade must be set back to. */
export interface FrDrawnSetbackContribution {
    readonly kind: 'drawn-setback';
    readonly geometryKind: 'lin' | 'surf';
    /** Setback LINES (the `prescription_lin` form) as WGS84 polylines. */
    readonly lines: readonly (readonly FrLatLon[])[];
    /** Setback ZONES (the `prescription_surf` form) as WGS84 polygon parts. */
    readonly parts: readonly FrGeoPart[];
    readonly libelle: string | null;
    readonly gid: number | null;
    readonly provenance: FrSliceProvenance;
    readonly note: string;
}

/* ────────────────────────────── parsers per kind (filter by code, verify by libelle) ─── */

/**
 * `PLAN_MASSE` discipline (census §1: municipal typology is imperfect). A `typepsc=14` feature is a
 * secteur de plan de masse ONLY when its `txt` is `PLAN_MASSE` or its libelle names a *plan de
 * masse* — otherwise it is upload noise (measured: "Voies classée bruyante type I" carried code 14).
 */
export function isFrPlanMasseFeature(props: Record<string, unknown>): boolean {
    if (str(props['typepsc']) !== '14') return false;
    const txt = str(props['txt']);
    if (txt !== null && txt.toUpperCase() === 'PLAN_MASSE') return true;
    const libelle = str(props['libelle']);
    return libelle !== null && /plan\s+(?:de\s+)?masse/i.test(libelle);
}

/** Parse one `typepsc=14` feature into a drawn footprint; null when it is not a valid plan-masse. */
export function parseFrPlanMassePrescription(
    feature: FrPrescriptionGeoFeature,
    fetchedAtIso: string,
): FrDrawnFootprintContribution | null {
    const props = feature.properties;
    if (!isFrPlanMasseFeature(props)) return null;
    const parts = parseFrPolygonParts(feature.geometry);
    if (parts.length === 0) return null; // no drawn geometry ⇒ nothing to contribute
    const idurba = str(props['idurba']);
    const gid = num(props['gid']);
    return {
        kind: 'drawn-footprint',
        ringRef: `fr-plan-masse:${idurba ?? 'unknown'}#${gid ?? 'na'}`,
        parts,
        libelle: str(props['libelle']),
        txt: str(props['txt']),
        gid,
        provenance: frPrescriptionProvenance(FR_PRESCRIPTION_DATASET['plan-masse'], props, fetchedAtIso),
        note:
            'Secteur de plan de masse (R151-40): the buildable volume is DRAWN. This is the F-A ' +
            'explicit-area footprint; the parcel ∩ footprint clip is the engine’s solve ' +
            '(solveExplicitArea), never inflated here.',
    };
}

/**
 * Parse the metres + top measurement point out of a height libelle. Handles the census form
 * ("...LIMITEE A 9 METRES AU FAITAGE") and comma decimals ("7,5 mètres"). Returns null when no
 * number is present (the value is zone-dependent and may live in the règlement text — Paris).
 */
export function parseFrHeightLibelle(
    libelle: string | null,
): { readonly maxHeight_m: number | null; readonly measuredTo: FrHeightMeasuredTo } {
    if (libelle === null) return { maxHeight_m: null, measuredTo: 'unspecified' };
    const lower = libelle.toLowerCase();
    let measuredTo: FrHeightMeasuredTo = 'unspecified';
    if (/fa[iî]tage/.test(lower)) measuredTo = 'faitage';
    else if (/[ée]gout/.test(lower)) measuredTo = 'egout';
    else if (/acrot[eè]re/.test(lower)) measuredTo = 'acrotere';
    // "9 METRES" / "7,5 mètres" / "12 m " — the metric distance in the label.
    const m = lower.match(/(\d+(?:[.,]\d+)?)\s*m(?:[eè]tres?|\b)/i);
    const maxHeight_m = m !== null ? num((m[1] ?? '').replace(',', '.')) : null;
    return { maxHeight_m, measuredTo };
}

/**
 * Parse one `typepsc=39/02` height polygon into a drawn height cap; null when it is not a height
 * limit (the `stypepsc=02` filter + a `HAUTEUR` libelle exclude e.g. the 39/00 "Cone de protection
 * visuelle"). The datum is `unknown` (ADR-0377), so the number NEVER binds as a plane-anchored cap.
 */
export function parseFrHeightCapPrescription(
    feature: FrPrescriptionGeoFeature,
    fetchedAtIso: string,
): FrDrawnHeightCap | null {
    const props = feature.properties;
    if (str(props['typepsc']) !== '39') return null;
    if (str(props['stypepsc']) !== '02') return null;
    const libelle = str(props['libelle']);
    if (libelle === null || !/hauteur/i.test(libelle)) return null;
    const parts = parseFrPolygonParts(feature.geometry);
    if (parts.length === 0) return null;
    const { maxHeight_m, measuredTo } = parseFrHeightLibelle(libelle);
    return {
        kind: 'drawn-height-cap',
        maxHeight_m,
        measuredTo,
        heightDatum: UNKNOWN_HEIGHT_DATUM, // { kind: 'unknown' } — the label names no plane (ADR-0377)
        appliesAsBindingCap: false,
        bindingBasis: maxHeight_m === null ? 'value-in-reglement-text' : 'study-upper-bound-datum-unresolved',
        citation: libelle,
        parts,
        gid: num(props['gid']),
        provenance: frPrescriptionProvenance(FR_PRESCRIPTION_DATASET['height'], props, fetchedAtIso),
        datumNote:
            'The libelle states the number and the TOP measurement point (' +
            measuredTo +
            '); it does NOT state the ground DATUM plane (terrain naturel / rasant — that lives in ' +
            'the règlement text, L-584). Per ADR-0377 the datum is `unknown`, and `unknown` ' +
            'refuses to be applied as a plane-anchored cap: the number is a representable, cited ' +
            'study upper bound, never multiplied into a volume on an unresolved plane.',
    };
}

/** Parse one `typepsc=15` marge de recul (line or zone) into a drawn setback contribution. */
export function parseFrSetbackPrescription(
    feature: FrPrescriptionGeoFeature,
    fetchedAtIso: string,
): FrDrawnSetbackContribution | null {
    const props = feature.properties;
    if (str(props['typepsc']) !== '15') return null;
    const lines = parseFrLineStrings(feature.geometry);
    const parts = parseFrPolygonParts(feature.geometry);
    if (lines.length === 0 && parts.length === 0) return null;
    const geometryKind: 'lin' | 'surf' = lines.length > 0 ? 'lin' : 'surf';
    return {
        kind: 'drawn-setback',
        geometryKind,
        lines,
        parts,
        libelle: str(props['libelle']),
        gid: num(props['gid']),
        provenance: frPrescriptionProvenance(FR_PRESCRIPTION_DATASET['setback'], props, fetchedAtIso),
        note:
            'Marge de recul (R151-39): the façade must be set back TO this drawn geometry. Offsetting ' +
            'the parcel frontage to the line to derive a footprint is a downstream engine step — the ' +
            'drawn constraint is carried here, cited, never turned into a fabricated footprint.',
    };
}

/* ────────────────────────────── the A.5 degradation ladder ──────────────── */

/** One envelope slot (P = plan extent / footprint, V = vertical / height) — filled or named-absent. */
export type FrEnvelopeSlot =
    | { readonly filled: true; readonly source: string }
    | { readonly filled: false; readonly reason: string };

/**
 * The A.5 degradation ladder verdict (STR-ENVELOPE-SUFFICIENCY-LEGENDS §A.5). It NAMES the missing
 * dimension so a partial envelope is a labelled deliverable, never a silent blank.
 */
export interface FrEnvelopeDegradation {
    /** P slot — the plan extent / buildable footprint (plan-masse). */
    readonly footprint: FrEnvelopeSlot;
    /** V slot — the vertical limit (39/02 height polygon). */
    readonly height: FrEnvelopeSlot;
    /** The A.5 row label the (P,V) fill selects, verbatim from the ladder. */
    readonly label: string;
    readonly ladderRef: string;
}

const A5_LADDER_REF = 'STR-ENVELOPE-SUFFICIENCY-LEGENDS §A.5 (degradation ladder)';

function frDegradationLabel(footprintFilled: boolean, heightFilled: boolean): string {
    if (footprintFilled && heightFilled) return 'Footprint + vertical limit derived (drawn envelope)';
    if (footprintFilled && !heightFilled) return 'Footprint derived; vertical extent unresolved';
    if (!footprintFilled && heightFilled) return 'Vertical limit derived; footprint unresolved';
    return 'No drawn envelope geometry at this point — règlement-text path (steps 6–7) governs';
}

/* ────────────────────────────── the contribution set + assembler ────────── */

/** THE PARTIAL DRAWN-ENVELOPE CONTRIBUTION SET — the module's output type. */
export interface FrDrawnEnvelopeContribution {
    readonly country: 'FR';
    readonly product: 'fr-drawn-envelope-contribution';
    readonly point: FrLatLon;
    readonly retrievedAt: string;
    /** The governing plan-masse footprint (lowest gid among the valid ones at the point), or null. */
    readonly footprint: FrDrawnFootprintContribution | null;
    /** Every drawn marge de recul at the point (sorted by gid) — cited, never fabricated into area. */
    readonly setbacks: readonly FrDrawnSetbackContribution[];
    /** The governing height cap (lowest gid among the valid ones), or null. */
    readonly heightCap: FrDrawnHeightCap | null;
    /** The A.5 degradation ladder verdict — names the gap when a slot is empty. */
    readonly degradation: FrEnvelopeDegradation;
    readonly tier: 'partial-drawn-envelope' | 'no-drawn-geometry';
    /** `typepsc=14` features the consumer DECLINED as non-plan-masse noise (the filter's receipts). */
    readonly declinedPlanMasseNoise: readonly { readonly gid: number | null; readonly libelle: string | null }[];
}

/** Everything the fetch layer gathered — outcomes/features in, contribution set out (pure). */
export interface FrDrawnEnvelopeInput {
    readonly point: FrLatLon;
    readonly fetchedAtIso: string;
    /** `prescription_surf` `typepsc=14` features at the parcel. */
    readonly planMasseFeatures?: readonly FrPrescriptionGeoFeature[];
    /** `prescription_lin`/`prescription_surf` `typepsc=15` features at the parcel. */
    readonly setbackFeatures?: readonly FrPrescriptionGeoFeature[];
    /** `prescription_surf` `typepsc=39/02` features at the parcel. */
    readonly heightFeatures?: readonly FrPrescriptionGeoFeature[];
}

const byGid = (a: { readonly gid: number | null }, b: { readonly gid: number | null }): number =>
    (a.gid ?? Number.MAX_SAFE_INTEGER) - (b.gid ?? Number.MAX_SAFE_INTEGER);

/**
 * ASSEMBLE the partial drawn-envelope contribution from GPU prescription features. PURE and total.
 *
 * DISCIPLINE:
 *   • plan-masse is FILTERED by code AND VERIFIED by libelle/txt; declined features are recorded.
 *   • the GOVERNING footprint/height is the lowest-gid valid feature (deterministic pick; at a
 *     parcel one governs — a report can still see the others via the source counts).
 *   • the height NEVER binds as a cap (ADR-0377 `unknown` datum); it is a cited study upper bound.
 *   • the A.5 ladder NAMES which of (P, V) is missing — a partial envelope with a named gap.
 */
export function buildFrDrawnEnvelopeContribution(
    input: FrDrawnEnvelopeInput,
): FrDrawnEnvelopeContribution {
    const { point, fetchedAtIso } = input;

    // ── Plan-masse footprints (filter by code + verify by libelle) ──────────────
    const planMasseFeatures = input.planMasseFeatures ?? [];
    const footprints: FrDrawnFootprintContribution[] = [];
    const declined: { readonly gid: number | null; readonly libelle: string | null }[] = [];
    for (const f of planMasseFeatures) {
        const c = parseFrPlanMassePrescription(f, fetchedAtIso);
        if (c !== null) footprints.push(c);
        else if (str(f.properties['typepsc']) === '14') {
            // a code-14 feature that is NOT a plan-masse (upload noise) — record the receipt
            declined.push({ gid: num(f.properties['gid']), libelle: str(f.properties['libelle']) });
        }
    }
    footprints.sort(byGid);
    const footprint = footprints[0] ?? null;

    // ── Setback lines / zones (all cited; sorted deterministically) ─────────────
    const setbackFeatures = input.setbackFeatures ?? [];
    const setbacks: FrDrawnSetbackContribution[] = [];
    for (const f of setbackFeatures) {
        const c = parseFrSetbackPrescription(f, fetchedAtIso);
        if (c !== null) setbacks.push(c);
    }
    setbacks.sort(byGid);

    // ── Height caps (39/02; the governing one is lowest gid) ────────────────────
    const heightFeatures = input.heightFeatures ?? [];
    const heightCaps: FrDrawnHeightCap[] = [];
    for (const f of heightFeatures) {
        const c = parseFrHeightCapPrescription(f, fetchedAtIso);
        if (c !== null) heightCaps.push(c);
    }
    heightCaps.sort(byGid);
    const heightCap = heightCaps[0] ?? null;

    // ── A.5 degradation ladder ──────────────────────────────────────────────────
    const footprintFilled = footprint !== null;
    const heightFilled = heightCap !== null && heightCap.maxHeight_m !== null;
    const degradation: FrEnvelopeDegradation = {
        footprint: footprintFilled
            ? { filled: true, source: footprint.provenance.source.dataset }
            : {
                  filled: false,
                  reason:
                      'no secteur de plan de masse (typepsc=14) drawn at this point — the buildable ' +
                      'extent is not published as geometry here (règlement-text path, steps 6–7)',
              },
        height: heightFilled
            ? { filled: true, source: heightCap!.provenance.source.dataset }
            : {
                  filled: false,
                  reason:
                      heightCap !== null
                          ? 'a height-limit polygon (typepsc=39/02) is drawn but its libelle states no ' +
                            'number — the value is zone-dependent and lives in the règlement text'
                          : 'no height-limit polygon (typepsc=39/02) drawn at this point — the height ' +
                            'limit, if any, lives in the règlement text',
              },
        label: frDegradationLabel(footprintFilled, heightFilled),
        ladderRef: A5_LADDER_REF,
    };

    const anyGeometry = footprint !== null || setbacks.length > 0 || heightCap !== null;
    return {
        country: 'FR',
        product: 'fr-drawn-envelope-contribution',
        point,
        retrievedAt: fetchedAtIso,
        footprint,
        setbacks,
        heightCap,
        degradation,
        tier: anyGeometry ? 'partial-drawn-envelope' : 'no-drawn-geometry',
        declinedPlanMasseNoise: declined,
    };
}

/* ────────────────────────────── engine-feed: project to scene-XZ + the explicit-area seat ─── */

/**
 * Project a WGS84 ring into scene-XZ metres about an origin (equirectangular; the frame the engine's
 * `explicit-area` clip works in, mirroring the Madrid NZ-1 dispatcher). Shape + area are
 * frame-invariant, so the origin choice does not change the parcel ∩ footprint answer. PURE.
 */
export function projectFrLatLonRingToSceneXZ(
    ring: readonly FrLatLon[],
    origin: FrLatLon,
): Pt[] {
    const M_PER_DEG_LAT = 111_320;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
    return ring.map((p) => ({
        x: (p.lon - origin.lon) * mPerDegLon,
        z: (p.lat - origin.lat) * M_PER_DEG_LAT,
    }));
}

/** Project a drawn footprint's parts into the engine's `ExplicitAreaPart[]` (scene-XZ). PURE. */
export function frFootprintToSceneParts(
    footprint: FrDrawnFootprintContribution,
    origin: FrLatLon,
): { readonly outer: Pt[]; readonly holes: Pt[][] }[] {
    return footprint.parts.map((part) => ({
        outer: projectFrLatLonRingToSceneXZ(part.outer, origin),
        holes: part.holes.map((h) => projectFrLatLonRingToSceneXZ(h, origin)),
    }));
}

/** The `explicit-area` ringRef handle the FR plan-masse pack answers for (STR §9 P1 tier). */
export const FR_PLAN_MASSE_RING_REF = 'fr-gpu:plan-masse/prescription-surf-typepsc-14' as const;

/** The FR national jurisdiction id for the GPU drawn-envelope (explicit-geometry) tier. */
export const FR_GPU_PLAN_MASSE_JURISDICTION_ID = 'fr-gpu-plan-masse' as const;

/**
 * The FR plan-masse `explicit-area` pack — a DECLARATION that the buildable footprint is PUBLISHED
 * as geometry (STR §9 P1), the same kind of pack as `ES_MADRID_NZ1_PACK`. Every numeric field is
 * `null`: the geometry IS the rule, resolved at the provider boundary from the GPU prescription,
 * and the height number (39/02) is a datum-unresolved study bound, never a zone constant here.
 * NOT registered — a standalone seat the drawn-footprint contribution feeds.
 */
export const FR_PLAN_MASSE_EXPLICIT_AREA_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: FR_GPU_PLAN_MASSE_JURISDICTION_ID,
        displayName: "France — GPU secteur de plan de masse (drawn buildable volume, R151-40)",
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-09-02',
        defaultConfidence: 'structured',
        zones: [
            {
                code: 'plan-masse',
                label: 'Secteur de plan de masse — buildable volume drawn (R151-40)',
                geometricRule: { kind: 'explicit-area', ringRef: FR_PLAN_MASSE_RING_REF },
            },
        ],
    });

/* ────────────────────────────── the impure seam (REUSES frGpuClient's GET) ─── */

/**
 * Fetch the GPU features of ONE prescription module at a point, KEEPING their geometry — the
 * geometry-preserving sibling of `frGpuClient.frGpuFeaturesAtPoint` (which strips geometry for the
 * identity leg). It REUSES `frGpuGetJson` (the ONE classified impure seam) and
 * `buildFrGpuPointUrl` — it does NOT duplicate the fetch. Failure ≠ empty end-to-end; no new
 * refusal-token spelling is minted (L-12874).
 */
export async function frPrescriptionGeoFeaturesAtPoint(
    module: FrGpuPointModule,
    lat: number,
    lon: number,
    deps: FrFetchDeps = {},
): Promise<FetchOutcome<readonly FrPrescriptionGeoFeature[]>> {
    const url = buildFrGpuPointUrl(module, lat, lon);
    const got = await frGpuGetJson(url, `gpu/${module} @ ${lat},${lon} (geom)`, deps);
    if (got.status !== 'found') return got as FetchOutcome<readonly FrPrescriptionGeoFeature[]>;
    const features = (got.value as { features?: unknown }).features;
    if (!Array.isArray(features)) {
        return fetchTransient(`upstream-failed: no features array from ${url}`);
    }
    const clean: FrPrescriptionGeoFeature[] = [];
    for (const f of features) {
        const rec = f as { properties?: unknown; geometry?: unknown };
        const props = rec.properties;
        if (props === null || typeof props !== 'object' || Array.isArray(props)) continue;
        const geometry =
            rec.geometry !== null && typeof rec.geometry === 'object'
                ? (rec.geometry as FrGeoJsonGeometry)
                : null;
        clean.push({ geometry, properties: props as Record<string, unknown> });
    }
    if (clean.length === 0) {
        return fetchAbsent(`no-feature: gpu/${module} @ ${lat},${lon} (geom)`);
    }
    return fetchFound(clean);
}
