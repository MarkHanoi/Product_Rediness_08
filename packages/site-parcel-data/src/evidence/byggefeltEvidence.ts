// DK gap G3 — the BYGGEFELT LEGAL-STATUS CLASSIFIER: Plandata WFS properties → `PlacementEvidence`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE UNBLOCK THIS IMPLEMENTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `rulepacks/dkEnvelopePlacement.ts` tier 1 (a published byggefelt polygon as the footprint) was
// gated shut because `vedtaget` = ADOPTED ≠ BINDING and nothing could prove bindingness. The gate is
// now OPEN: `DescribeFeatureType` on `theme_pdk_byggefelt_vedtaget` exposes two booleans that DECLARE
// it, so `legalStatusSource = 'metadata'` — Denmark is the first jurisdiction where the authority
// publishes the legal status as a machine-readable field rather than as plan prose.
//
//   `bygkunifelt`   — *byggeri kun i felt*  — build ONLY within the field  → BINDING
//   `bygvejledende` — byggefelt er *vejledende* — the field is advisory     → ILLUSTRATIVE
//
// VERIFIED-LIVE 2026-07-31, n = 57,035 adopted byggefelter, every count via `resultType=hits` +
// `CQL_FILTER` (never a head sample — WFS storage order is not random; see the §5 caution in
// docs/04-reference/jurisdictions/dk/findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md):
//
//   BINDING        `bygkunifelt=true AND bygvejledende=false`  13,629  23.9%
//   ADVISORY       `bygvejledende=true` (excl. the 179)        36,921  64.7%
//   NEITHER        both false                                   6,101  10.7%
//   CONTRADICTORY  both true                                      179   0.31%
//   NULL           either flag null                               205   0.36%
//
// CORROBORATION (this session, and NEW): the register publishes a codelist
// `pdk:theme_pdk_codelist_byggefelttype_v` whose four official categories are
//   1 "Byggefelt med begrænsende byggeret"          (with LIMITING building right)
//   2 "Byggefelt med delvist begrænsende byggeret"  (with PARTIALLY limiting building right)
//   3 "Vejledende byggefelt"                        (ADVISORY byggefelt)
//   4 "Særligt udpeget byggefelt"                   (specially designated)
// — which independently confirms that "vejledende" is an official ADVISORY category and that
// "begrænsende byggeret" (a limiting building right) is the binding one. The codelist is NOT joined
// to the feature by any published key (the feature carries no `byggefelttype` column; `objektkode` is
// 30, the object class, not a type code), so the two booleans remain the operative signal and the
// codelist is corroboration, not a second source. See §O1 in the findings doc.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §DO-NOT-TEXT-CLASSIFY-THE-ADVISORY-SET
// ══════════════════════════════════════════════════════════════════════════════════════════════
// 64.7% of byggefelter are declared advisory. It is TEMPTING to run a text heuristic over their
// lokalplan PDFs to "recover" some as binding. DO NOT. `bygvejledende=true` is an explicit MUNICIPAL
// DECLARATION about the municipality's own instrument; overriding it with our heuristic would
// second-guess the publishing authority — the exact inversion of what this architecture is for.
// The correctly-scoped target for a future text parser is the 10.7% `(false,false)` bucket, where the
// register DECLINES to classify and the plan text genuinely is the only remaining source. That is a
// ~6,100-record problem, not a 57,000-record one.
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no clock. The WFS fetch lives in
// `providers/ByggefeltProducer.ts`; this module only classifies what that fetch returned, so the
// state machine is unit-testable against recorded fixtures with no network.
//
// Strategic context — DENMARK-GAP-ROADMAP.md G3/G6/G11, ADR-0279 §2/§6, C58 §1.4/§1.6, L-619.

import type { Pt } from '@pryzm/schemas';
import {
    EVIDENCE_CONFIDENCE,
    type EvidenceCrs,
    type EvidencePolygon,
    type LegalStatus,
    type LegalStatusUnknownCause,
    type PlacementEvidence,
} from './placementEvidence.js';
import { dkByggefeltFromRing, type DkByggefelt } from '../rulepacks/dkEnvelopePlacement.js';
import type { ExplicitAreaPart } from '../geometry/explicitArea.js';

/** The Plandata WFS layer these evidence records come from — carried for QA routing + re-fetch. */
export const DK_BYGGEFELT_LAYER = 'theme_pdk_byggefelt_vedtaget';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE RAW SHAPE
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The byggefelt attributes this classifier reads, exactly as GeoServer emits them.
 *
 * ⚠ TYPED AS `unknown` DELIBERATELY. GeoServer returns real JSON booleans on the GeoJSON output
 * format but the STRINGS `'true'`/`'false'` on the GML output format, and a field may be absent or
 * `null`. Typing these as `boolean` would make the coercion invisible and let a `'false'` string —
 * which is TRUTHY in JavaScript — read as binding. That is a one-character path to over-stating a
 * building envelope, so the raw type stays honest and `wfsBool` is the single coercion point.
 */
export interface DkByggefeltProperties {
    readonly id?: unknown;
    readonly planid?: unknown;
    readonly lokplan_id?: unknown;
    readonly komnr?: unknown;
    readonly kommunenavn?: unknown;
    readonly lp_plannr?: unknown;
    readonly lp_plannavn?: unknown;
    readonly doklink?: unknown;
    readonly datovedt?: unknown;
    /** *byggeri kun i felt* — build ONLY within the field. TRUE ⇒ binding. */
    readonly bygkunifelt?: unknown;
    /** byggefelt er *vejledende* — the field is advisory. TRUE ⇒ illustrative. */
    readonly bygvejledende?: unknown;
    readonly [k: string]: unknown;
}

/**
 * Coerce a WFS boolean to `true | false | null`, where **`null` means "no value was published"**.
 *
 * ⚠ THE `null` RETURN IS THE POINT (§NULL-IS-NOT-FALSE). 205 of 57,035 features carry no value for
 * these flags. Collapsing that to `false` would silently reclassify "the municipality did not tell
 * us" into "the municipality told us it does not bind" — two different legal statements with two
 * different remedies (re-ingest vs read the plan). This is the L-422/457/467/469 failure class at
 * field granularity.
 *
 * Accepts: JSON `true`/`false`; the strings `'true'`/`'false'`/`'t'`/`'f'`/`'1'`/`'0'` (case- and
 * whitespace-insensitive). ANYTHING ELSE — including an unrecognised string — returns `null` rather
 * than a guess, so a schema drift surfaces as "unknown" instead of a fabricated determination.
 */
export function wfsBool(v: unknown): boolean | null {
    if (v === true || v === false) return v;
    if (typeof v === 'string') {
        const t = v.trim().toLowerCase();
        if (t === 'true' || t === 't' || t === '1') return true;
        if (t === 'false' || t === 'f' || t === '0') return false;
        return null;
    }
    if (typeof v === 'number') {
        if (v === 1) return true;
        if (v === 0) return false;
        return null;
    }
    return null;
}

/** A non-empty trimmed string, else null. */
function str(v: unknown): string | null {
    if (typeof v === 'string') {
        const t = v.trim();
        return t.length > 0 ? t : null;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE STATE MACHINE
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The classified legal status of ONE byggefelt record, with the cause when it is `unknown`. */
export interface DkByggefeltClassification {
    readonly legalStatus: LegalStatus;
    readonly unknownCause: LegalStatusUnknownCause | null;
    /** TRUE only for the both-true contradiction — routed to the QA output, never resolved. */
    readonly hasMetadataConflict: boolean;
    readonly confidence: number;
    /** What the source said and what was concluded. Never a justification for a guess. */
    readonly determination: string;
    /** The raw coerced flags, carried so a QA reader can see exactly what was published. */
    readonly bygkunifelt: boolean | null;
    readonly bygvejledende: boolean | null;
}

/**
 * Classify a byggefelt's legal status from its published metadata — THE state machine.
 *
 * Evaluation ORDER is load-bearing and is not the order of the table in the docs:
 *
 *   1. **NULL first.** If either flag is unpublished we cannot evaluate any predicate over it.
 *      Testing `bygkunifelt===true` first would silently absorb a null into "not binding".
 *   2. **CONFLICT second.** Both-true is checked BEFORE either single-flag branch, because both
 *      single-flag branches would otherwise match it and whichever ran first would "win" — an
 *      arbitrary resolution of a contradiction PRYZM has no standing to resolve.
 *   3. Binding, then advisory, then the honest not-declared residue.
 *
 * PURE, total, never throws.
 */
export function classifyByggefeltLegalStatus(
    props: DkByggefeltProperties,
): DkByggefeltClassification {
    const kunIFelt = wfsBool(props.bygkunifelt);
    const vejledende = wfsBool(props.bygvejledende);

    // ── 1. §NULL-IS-NOT-FALSE. An unpublished flag is not a negative declaration. ──────────────
    if (kunIFelt === null || vejledende === null) {
        const which =
            kunIFelt === null && vejledende === null
                ? 'both bygkunifelt and bygvejledende are'
                : kunIFelt === null
                  ? 'bygkunifelt is'
                  : 'bygvejledende is';
        return {
            legalStatus: 'unknown',
            unknownCause: 'metadata-unavailable',
            hasMetadataConflict: false,
            confidence: EVIDENCE_CONFIDENCE.UNKNOWN_METADATA_UNAVAILABLE,
            determination:
                `${which} not published on this feature — the register made NO declaration, which ` +
                'is NOT a declaration of "not binding" (§NULL-IS-NOT-FALSE). Retryable: this may be ' +
                'an ingestion/publication gap rather than a legal one.',
            bygkunifelt: kunIFelt,
            bygvejledende: vejledende,
        };
    }

    // ── 2. CONTRADICTION. Refuse to infer; emit as QA. ────────────────────────────────────────
    if (kunIFelt === true && vejledende === true) {
        return {
            legalStatus: 'unknown',
            unknownCause: 'metadata-conflict',
            hasMetadataConflict: true,
            confidence: EVIDENCE_CONFIDENCE.UNKNOWN_METADATA_CONFLICT,
            determination:
                'CONTRADICTORY metadata: the municipality declared this byggefelt BOTH ' +
                '"byggeri kun i felt" (binding) AND "vejledende" (advisory). These are mutually ' +
                'exclusive. PRYZM REFUSES to pick a winner — there is no principled basis, and the ' +
                'record must be corrected by the publishing municipality. Routed to the QA list.',
            bygkunifelt: kunIFelt,
            bygvejledende: vejledende,
        };
    }

    // ── 3. BINDING — the only state that may place a footprint. ───────────────────────────────
    if (kunIFelt === true && vejledende === false) {
        return {
            legalStatus: 'binding',
            unknownCause: null,
            hasMetadataConflict: false,
            confidence: EVIDENCE_CONFIDENCE.BINDING_DECLARED,
            determination:
                'BINDING: bygkunifelt=true ("byggeri kun i felt" — construction only within the ' +
                'field) and bygvejledende=false. The municipality declared the field a limiting ' +
                'building right in its own machine-readable metadata (legalStatusSource=metadata).',
            bygkunifelt: kunIFelt,
            bygvejledende: vejledende,
        };
    }

    // ── 4. ADVISORY — an explicit municipal declaration. NEVER text-reclassified. ─────────────
    if (vejledende === true) {
        return {
            legalStatus: 'illustrative',
            unknownCause: null,
            hasMetadataConflict: false,
            confidence: EVIDENCE_CONFIDENCE.ILLUSTRATIVE_DECLARED,
            determination:
                'ADVISORY: bygvejledende=true — the municipality explicitly declared this byggefelt ' +
                'vejledende (indicative). It is real published evidence and ranks above nothing, but ' +
                'it may NOT place a footprint, and it must NOT be "recovered" as binding by a text ' +
                'heuristic (§DO-NOT-TEXT-CLASSIFY-THE-ADVISORY-SET).',
            bygkunifelt: kunIFelt,
            bygvejledende: vejledende,
        };
    }

    // ── 5. NEITHER declared — the plan TEXT is the only remaining source (G5). ────────────────
    return {
        legalStatus: 'unknown',
        unknownCause: 'not-declared',
        hasMetadataConflict: false,
        confidence: EVIDENCE_CONFIDENCE.UNKNOWN_NOT_DECLARED,
        determination:
            'NOT DECLARED: bygkunifelt=false and bygvejledende=false — the register declined to ' +
            'classify this byggefelt either way. The lokalplan TEXT is the only remaining source ' +
            '(DK gap G5). This bucket — not the advisory set — is the correctly-scoped target for a ' +
            'future plan-text parser.',
        bygkunifelt: kunIFelt,
        bygvejledende: vejledende,
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PROPERTIES + GEOMETRY → PlacementEvidence[]
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A GeoJSON-shaped byggefelt feature, as `outputFormat=application/json` returns it. Geometry is
 * `Polygon` or `MultiPolygon` in the requested `srsName` (Plandata's native CRS is EPSG:25832).
 */
export interface DkByggefeltFeature {
    readonly id?: unknown;
    readonly properties?: DkByggefeltProperties | null;
    readonly geometry?: {
        readonly type?: unknown;
        /** Polygon: `[ring][pt][x,y]`. MultiPolygon: `[poly][ring][pt][x,y]`. */
        readonly coordinates?: unknown;
    } | null;
}

/** Build the citation from the feature's own identity fields. NEVER fabricated (G11). */
function citationOf(p: DkByggefeltProperties): PlacementEvidence['citation'] {
    const plannr = str(p.lp_plannr);
    const plannavn = str(p.lp_plannavn);
    const kommune = str(p.kommunenavn);
    const url = str(p.doklink);
    // Assemble only from fields that are actually present — an absent name never becomes "unknown".
    const parts: string[] = [];
    if (plannr !== null) parts.push(`Lokalplan ${plannr}`);
    if (plannavn !== null && plannavn !== plannr) parts.push(plannavn);
    const base = parts.length > 0 ? parts.join(' — ') : 'Lokalplan (nummer ikke publiceret)';
    const document = kommune !== null ? `${base} (${kommune})` : base;
    return url !== null ? { document, url } : { document };
}

/** Coerce one GeoJSON linear ring to `Pt[]` in scene-XZ convention (`x` = easting, `z` = northing). */
function ringToPts(raw: unknown): Pt[] | null {
    if (!Array.isArray(raw)) return null;
    const out: Pt[] = [];
    for (const c of raw) {
        if (!Array.isArray(c) || c.length < 2) return null;
        const x = Number(c[0]);
        const z = Number(c[1]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        out.push({ x, z });
    }
    return out.length >= 3 ? out : null;
}

/**
 * Split a GeoJSON Polygon/MultiPolygon into its polygon PARTS, each `{ outer, holes }`.
 *
 * Holes are KEPT. A byggefelt with an interior hole is a published statement about where NOT to
 * build; flattening it to the outer ring would over-state the buildable area (the L-616 direction).
 * They ride through `dkByggefeltFromFeatureEvidence` to `solveExplicitArea`, which decides against
 * the ACTUAL parcel whether a hole bites (refuse) or lies outside the plot (irrelevant). The
 * single-record `dkByggefeltFromEvidence` has no parcel and so can only refuse.
 */
function polygonParts(geometry: DkByggefeltFeature['geometry']): { outer: Pt[]; holes: Pt[][] }[] {
    if (!geometry) return [];
    const type = geometry.type;
    const coords = geometry.coordinates;
    const fromRings = (rings: unknown): { outer: Pt[]; holes: Pt[][] } | null => {
        if (!Array.isArray(rings) || rings.length === 0) return null;
        const outer = ringToPts(rings[0]);
        if (outer === null) return null;
        const holes: Pt[][] = [];
        for (let i = 1; i < rings.length; i += 1) {
            const h = ringToPts(rings[i]);
            if (h !== null) holes.push(h);
        }
        return { outer, holes };
    };
    if (type === 'Polygon') {
        const one = fromRings(coords);
        return one ? [one] : [];
    }
    if (type === 'MultiPolygon' && Array.isArray(coords)) {
        const out: { outer: Pt[]; holes: Pt[][] }[] = [];
        for (const poly of coords) {
            const one = fromRings(poly);
            if (one !== null) out.push(one);
        }
        return out;
    }
    return [];
}

/** Optional reprojection from the WFS CRS into scene-XZ metres, supplied by the caller (L5). */
export type EvidenceProjector = (p: Pt) => Pt;

export interface ByggefeltEvidenceOptions {
    /** The CRS the incoming coordinates are in. Plandata's native output is `EPSG:25832`. */
    readonly sourceCrs?: EvidenceCrs;
    /**
     * Project source coordinates into scene-XZ metres. When supplied, the emitted geometry is
     * stamped `crs: 'scene-xz'` and becomes eligible for tier 1; when omitted the geometry keeps
     * `sourceCrs` and the tier-1 adapter will REFUSE it (the CRS interlock — see `EvidenceCrs`).
     */
    readonly project?: EvidenceProjector | null;
}

/**
 * Convert ONE Plandata byggefelt feature into `PlacementEvidence` — one record per polygon PART.
 *
 * A MultiPolygon byggefelt yields N records sharing one citation and one classification, each
 * carrying `partIndex`/`partCount`. That is deliberate: every published building field stays
 * separately VISIBLE for ranking and QA rather than being collapsed into one opaque blob.
 *
 * ⚠ THE PART SET IS NOW PLACEABLE. `dkByggefeltFromFeatureEvidence` re-assembles all N records into
 * a multi-part footprint, which the `explicit-area` solve clips part-by-part against the parcel
 * (§MULTI-PART-EXPLICIT-AREA). Use `groupEvidenceByFeature` to build the group; the per-record
 * `dkByggefeltFromEvidence` still refuses a multi-part record, because one record is not the feature.
 *
 * PURE. Returns `[]` for a feature with no usable polygon geometry (never a fabricated ring).
 */
export function byggefeltFeatureToEvidence(
    feature: DkByggefeltFeature,
    options: ByggefeltEvidenceOptions = {},
): readonly PlacementEvidence[] {
    const props = feature.properties ?? {};
    const classification = classifyByggefeltLegalStatus(props);
    const parts = polygonParts(feature.geometry);
    if (parts.length === 0) return [];

    const project = options.project ?? null;
    const crs: EvidenceCrs = project ? 'scene-xz' : (options.sourceCrs ?? 'EPSG:25832');
    const map = (pts: readonly Pt[]): readonly Pt[] =>
        project ? pts.map((p) => project(p)) : pts.map((p) => ({ x: p.x, z: p.z }));

    const featureId = str(props.id) ?? str(feature.id);
    const citation = citationOf(props);

    return parts.map((part, index): PlacementEvidence => {
        const geometry: EvidencePolygon = {
            kind: 'polygon',
            outer: map(part.outer),
            holes: part.holes.map((h) => map(h)),
            crs,
        };
        return {
            geometry,
            // The coordinates are Plandata's own — an authority's published GIS layer.
            geometrySource: 'official_gis',
            legalStatus: classification.legalStatus,
            // §POPULATED-FROM-EVIDENCE — 'metadata' ONLY where a flag actually decided it. An
            // `unknown` status has NO source, because there is no determination to attribute.
            legalStatusSource: classification.legalStatus === 'unknown' ? null : 'metadata',
            // The instrument is the lokalplan; we read its legal status off the register's metadata.
            authority: 'plan',
            citation,
            confidence: classification.confidence,
            unknownCause: classification.unknownCause,
            featureId,
            sourceLayer: DK_BYGGEFELT_LAYER,
            hasMetadataConflict: classification.hasMetadataConflict,
            determination: classification.determination,
            partIndex: index,
            partCount: parts.length,
        };
    });
}

/** Convert a whole GeoJSON FeatureCollection of byggefelter. PURE. */
export function byggefeltCollectionToEvidence(
    features: readonly DkByggefeltFeature[],
    options: ByggefeltEvidenceOptions = {},
): readonly PlacementEvidence[] {
    return features.flatMap((f) => byggefeltFeatureToEvidence(f, options));
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE TIER-1 ADAPTER — the ONLY way evidence becomes a placeable footprint
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Why a piece of evidence could not be handed to tier 1 as a footprint. Closed vocabulary. */
export type DkByggefeltAdaptRefusal =
    /** The evidence is not `binding` — tier 1 fires on nothing else (§BYGGEFELT-BINDING-GATE). */
    | 'not-binding'
    /** The geometry is a line, not an area — it cannot be an `explicit-area` footprint. */
    | 'not-a-polygon'
    /** ⚠ THE CRS INTERLOCK. The ring is not in scene-XZ metres. EPSG:25832 eastings/northings are
     *  ALSO metres and ALSO plausible magnitudes, so passing them through would produce a
     *  plausible-looking building in the wrong place rather than an error. Refuse instead. */
    | 'unprojected-crs'
    /**
     * The byggefelt has interior holes and this SINGLE-RECORD adapter carries one ring.
     *
     * ⚠ NO LONGER A CAPABILITY LIMIT OF THE PIPELINE — only of this one function. Use
     * `dkByggefeltFromFeatureEvidence`, which carries holes through to the `explicit-area` solve
     * where they are honoured against the actual parcel.
     */
    | 'holes-unsupported'
    /**
     * The byggefelt is multi-part and this record is only ONE of its parts, so placing it would
     * discard the others.
     *
     * ⚠ NO LONGER A CAPABILITY LIMIT OF THE PIPELINE — only of this one function, which by
     * construction sees a single part and therefore cannot represent the whole feature. The
     * feature-level adapter `dkByggefeltFromFeatureEvidence` takes ALL the parts and places them.
     */
    | 'multi-part-unsupported'
    /** Fewer than 3 usable vertices. */
    | 'degenerate-ring'
    /**
     * §MULTI-PART-EXPLICIT-AREA — the caller handed the feature-level adapter a set of records that
     * is not one complete feature: a missing part, a duplicated `partIndex`, a disagreeing
     * `partCount`, or records from two different features. A GROUPING BUG in the caller, and it must
     * be loud: adapting an incomplete part set would place a fraction of the published footprint and
     * report success — exactly the silent-part-0 failure this design exists to prevent.
     */
    | 'incomplete-parts';

export type DkByggefeltAdaptResult =
    | { readonly ok: true; readonly byggefelt: DkByggefelt }
    | { readonly ok: false; readonly reason: DkByggefeltAdaptRefusal; readonly detail: string };

/**
 * Adapt ONE `PlacementEvidence` record into a single-part `DkByggefelt`.
 *
 * ⚠ USE `dkByggefeltFromFeatureEvidence` FOR ANYTHING REAL. This function sees exactly one part of
 * one feature, so it cannot represent a multi-part byggefelt and correctly refuses one — but that is
 * a limit of THIS FUNCTION'S INPUT, not of the pipeline. 19.4 % of binding Danish byggefelter are
 * multi-part; routing them through here would refuse every one of them.
 *
 * It is deliberately PARANOID: every refusal is a case where passing the value through would produce
 * a plausible-but-wrong building rather than a visible error. `binding` alone is not sufficient —
 * the geometry must also be an area and in the right frame.
 *
 * PURE.
 */
export function dkByggefeltFromEvidence(evidence: PlacementEvidence): DkByggefeltAdaptResult {
    if (evidence.legalStatus !== 'binding') {
        return {
            ok: false,
            reason: 'not-binding',
            detail:
                `legalStatus='${evidence.legalStatus}'` +
                (evidence.unknownCause !== null ? ` (${evidence.unknownCause})` : '') +
                ' — tier 1 places a footprint ONLY on proven-binding geometry (§BYGGEFELT-BINDING-GATE).',
        };
    }
    if (evidence.geometry.kind !== 'polygon') {
        return {
            ok: false,
            reason: 'not-a-polygon',
            detail: 'evidence geometry is a lineString — an explicit-area footprint needs an area',
        };
    }
    const geom = evidence.geometry;
    if (geom.crs !== 'scene-xz') {
        return {
            ok: false,
            reason: 'unprojected-crs',
            detail:
                `evidence geometry is in ${geom.crs}, not scene-XZ metres. Both are metric and both ` +
                'look plausible, so this is refused rather than passed through — supply a projector ' +
                'to the producer (ByggefeltEvidenceOptions.project).',
        };
    }
    if (geom.holes.length > 0) {
        return {
            ok: false,
            reason: 'holes-unsupported',
            detail:
                `byggefelt has ${geom.holes.length} interior hole(s) and ExplicitAreaSource carries ` +
                'a single ring. Dropping the hole would OVER-STATE the buildable area, so tier 1 ' +
                'refuses and a weaker tier must place the footprint.',
        };
    }
    if (evidence.partCount > 1) {
        return {
            ok: false,
            reason: 'multi-part-unsupported',
            detail:
                `byggefelt is a ${evidence.partCount}-part MultiPolygon and this single-record adapter ` +
                `holds only part ${evidence.partIndex} — placing it would discard ` +
                `${evidence.partCount - 1} published buildable field(s). Use ` +
                'dkByggefeltFromFeatureEvidence with ALL of the feature\'s records instead.',
        };
    }
    if (geom.outer.length < 3) {
        return {
            ok: false,
            reason: 'degenerate-ring',
            detail: `byggefelt outer ring has ${geom.outer.length} vertices (< 3)`,
        };
    }
    return {
        ok: true,
        byggefelt: dkByggefeltFromRing(geom.outer, 'binding', evidence.featureId),
    };
}

/**
 * §MULTI-PART-EXPLICIT-AREA — adapt ALL of ONE feature's `PlacementEvidence` records into a
 * multi-part `DkByggefelt`. **This is the real tier-1 chokepoint.**
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FUNCTION EXISTS
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `byggefeltFeatureToEvidence` splits a MultiPolygon into ONE RECORD PER PART, so that every part is
 * separately visible for ranking + QA. That is right for evidence, but it means no single record
 * ever holds the whole published footprint — and a per-record adapter can therefore only ever
 * refuse a multi-part field. Measured: 19.4 % of the 13,629 binding Danish byggefelter are
 * multi-part (n = 1,000 systematic, 2026-07-31), so that refusal was the largest single subtraction
 * from tier-1 reach, and it was a limitation of PRYZM's plumbing, not of the register's data.
 *
 * ⚠ IT VALIDATES THE GROUP RATHER THAN TRUSTING IT. All records must belong to ONE feature, agree on
 * `partCount`, and cover `partIndex` 0…n-1 exactly once. Anything else is a caller GROUPING BUG and
 * refuses `incomplete-parts` — because adapting a partial set would place a FRACTION of the
 * published footprint while reporting success, which is precisely the silent-part-0 failure the old
 * blanket refusal was protecting against.
 *
 * ⚠ HOLES ARE CARRIED, NOT REFUSED. They travel into `ExplicitAreaPart.holes` and are resolved by
 * `solveExplicitArea` against the ACTUAL parcel: a hole that falls outside this plot says nothing
 * about it, and a hole that bites refuses there, with the parcel in hand. Deciding it here — with no
 * parcel — could only ever be a blanket refusal.
 *
 * PURE.
 */
export function dkByggefeltFromFeatureEvidence(
    records: readonly PlacementEvidence[],
): DkByggefeltAdaptResult {
    if (records.length === 0) {
        return { ok: false, reason: 'incomplete-parts', detail: 'no evidence records supplied' };
    }
    const first = records[0]!;
    const expected = first.partCount;

    // ── GROUP INTEGRITY. A caller bug here is a fractional footprint, so it must be loud. ────────
    if (records.length !== expected) {
        return {
            ok: false,
            reason: 'incomplete-parts',
            detail:
                `received ${records.length} record(s) for a feature that declares partCount=${expected}. ` +
                'Adapting an incomplete part set would place a FRACTION of the published footprint ' +
                'and report success.',
        };
    }
    const seen = new Set<number>();
    for (const r of records) {
        if (r.featureId !== first.featureId) {
            return {
                ok: false,
                reason: 'incomplete-parts',
                detail:
                    `records span more than one feature (${String(first.featureId)} and ` +
                    `${String(r.featureId)}) — parts of different byggefelter are not one footprint`,
            };
        }
        if (r.partCount !== expected) {
            return {
                ok: false,
                reason: 'incomplete-parts',
                detail: `records disagree on partCount (${expected} vs ${r.partCount})`,
            };
        }
        if (seen.has(r.partIndex)) {
            return {
                ok: false,
                reason: 'incomplete-parts',
                detail: `partIndex ${r.partIndex} appears more than once`,
            };
        }
        seen.add(r.partIndex);
    }
    for (let i = 0; i < expected; i += 1) {
        if (!seen.has(i)) {
            return {
                ok: false,
                reason: 'incomplete-parts',
                detail: `partIndex ${i} is missing from the group (expected 0…${expected - 1})`,
            };
        }
    }

    // ── THE SAME PARANOID CHECKS AS THE SINGLE-RECORD PATH, applied to every part. ──────────────
    if (first.legalStatus !== 'binding') {
        return {
            ok: false,
            reason: 'not-binding',
            detail:
                `legalStatus='${first.legalStatus}'` +
                (first.unknownCause !== null ? ` (${first.unknownCause})` : '') +
                ' — tier 1 places a footprint ONLY on proven-binding geometry (§BYGGEFELT-BINDING-GATE).',
        };
    }

    const ordered = [...records].sort((a, b) => a.partIndex - b.partIndex);
    const parts: ExplicitAreaPart[] = [];
    for (const r of ordered) {
        if (r.legalStatus !== 'binding') {
            // Parts of one feature share a classification by construction; a disagreement means the
            // group is not really one feature's parts. Refuse rather than place the binding subset.
            return {
                ok: false,
                reason: 'incomplete-parts',
                detail: `part ${r.partIndex} classifies as '${r.legalStatus}' while part 0 is binding`,
            };
        }
        if (r.geometry.kind !== 'polygon') {
            return {
                ok: false,
                reason: 'not-a-polygon',
                detail: `part ${r.partIndex} is a lineString — an explicit-area footprint needs an area`,
            };
        }
        const geom = r.geometry;
        if (geom.crs !== 'scene-xz') {
            return {
                ok: false,
                reason: 'unprojected-crs',
                detail:
                    `part ${r.partIndex} is in ${geom.crs}, not scene-XZ metres. Both are metric and ` +
                    'both look plausible, so this is refused rather than passed through — supply a ' +
                    'projector to the producer (ByggefeltEvidenceOptions.project).',
            };
        }
        if (geom.outer.length < 3) {
            return {
                ok: false,
                reason: 'degenerate-ring',
                detail: `part ${r.partIndex} outer ring has ${geom.outer.length} vertices (< 3)`,
            };
        }
        parts.push({ outer: geom.outer, holes: geom.holes });
    }

    return {
        ok: true,
        byggefelt: { parts, binding: 'binding', featureId: first.featureId },
    };
}

/**
 * Group a ranked evidence list into per-FEATURE part sets, preserving the ranked order of each
 * feature's strongest record.
 *
 * ⚠ A RECORD WITH A NULL `featureId` IS ITS OWN GROUP. Two unidentifiable records must never be
 * merged into one "feature": that would fabricate a footprint out of unrelated geometry. The cost of
 * being wrong in this direction is only a refusal (`incomplete-parts` on a multi-part record with no
 * id), which is the correct direction to fail.
 *
 * PURE.
 */
export function groupEvidenceByFeature(
    evidence: readonly PlacementEvidence[],
): readonly (readonly PlacementEvidence[])[] {
    const groups = new Map<string, PlacementEvidence[]>();
    const order: string[] = [];
    evidence.forEach((e, i) => {
        const key = e.featureId !== null ? `id:${e.featureId}` : `anon:${e.sourceLayer}:${i}`;
        const existing = groups.get(key);
        if (existing === undefined) {
            groups.set(key, [e]);
            order.push(key);
        } else {
            existing.push(e);
        }
    });
    return order.map((k) => groups.get(k)!);
}
