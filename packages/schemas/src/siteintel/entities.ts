// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I · BRIEF §11) — the 17
// canonical entities of the European site-intelligence model, minimal fields
// only, as pure Zod schemas.
//
// The 17 (plan §E1a, verbatim): Parcel, Building, Terrain, Road, Plan, Zone,
// Prescription, Restriction, Regulation, Rule, Scenario, Envelope,
// DevelopmentPotential, Source, Evidence, Version, Confidence — plus Document,
// which REPORT §I's field table adds as the addressable legal text (Confidence
// lives in ./confidence.ts; everything else is here).
//
// Every name is `SiteIntel`-prefixed: the bare names collide with existing
// authorities that keep their jobs (C84 EI-9 — one authority per concept):
//   - `Parcel` (site/Parcel.ts, C19) — the COMMITTED editor parcel, scene-XZ,
//     immutable ring. SiteIntelParcel is the SOURCE-side canonical record in
//     native CRS; the commit seam between them is `ParcelProvenance` (C57 §1.4).
//   - `BuildableEnvelope` (site/zoning/BuildableEnvelope.ts, C58) — THE
//     scene-space envelope DETERMINATION artefact with the refusal vocabulary.
//     SiteIntelEnvelope is the canonical-model CATALOGUE record (native CRS,
//     ruleSetVersion-keyed) and links to a determination, never replaces one.
//   - `LandBasis` (site/zoning/LandBasis.ts, C63) — the denominator vocabulary;
//     the DK wire codelist in ./vocabularies/dk.ts feeds it via adapter logic.
//   - `FetchOutcome` (site/zoning/FetchOutcome.ts) — failure ≠ absence at the
//     FETCH layer; these entities are the shapes a successful fetch lands in.
//
// Non-negotiable invariants carried from REPORT §I (verbatim substance):
//   UNKNOWN ≠ 0 ≠ no-limit (L4 EE-4) · failure ≠ absence (L7 §1.2) ·
//   denominator is data, never assumed (L2 DK-2) · surveyed ≠ normative on
//   every height/floor/GFA attribute (L3 synthesis 4) · measure in native CRS
//   only (L3 ES-5 Madrid EPSG:4326 silent-zero trap; PL EPSG:2180,
//   EE EPSG:3301, LT EPSG:3346).
//
// L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM.

import { z } from 'zod';
import { JsonValueSchema } from './json.js';
import { SiteIntelConfidenceSchema } from './confidence.js';
import { IsoDateStringSchema, RuleProvenanceSchema } from './provenance.js';

/** Opaque canonical-model entity id. */
export const SiteIntelIdSchema = z.string().min(1);
export type SiteIntelId = z.infer<typeof SiteIntelIdSchema>;

/* ────────────────────────────── geometry ────────────────────────────────── */

/**
 * Geometry in the source's NATIVE CRS — the CRS travels WITH the coordinates,
 * always. REPORT §I: "measure in native CRS only" (the Madrid EPSG:4326
 * silent-zero trap). Coordinates are a GeoJSON-shaped geometry object kept as
 * JSON: L0 validates the envelope, not the ring math (that is L2 geometry work,
 * and doing it here would need a CRS database — I/O).
 */
export const NativeCrsGeometrySchema = z.object({
    /** e.g. `"EPSG:3301"` (EE), `"EPSG:3346"` (LT), `"EPSG:2180"` (PL), `"EPSG:25831"`. */
    crs: z.string().regex(/^[A-Z]+:[A-Za-z0-9.:]+$/, 'expected an authority:code CRS id'),
    /** GeoJSON geometry `type`. */
    kind: z.enum(['Point', 'LineString', 'Polygon', 'MultiPolygon', 'MultiLineString', 'MultiPoint']),
    /** GeoJSON `coordinates` for {@link kind}, uninterpreted at L0. */
    coordinates: JsonValueSchema,
});
export type NativeCrsGeometry = z.infer<typeof NativeCrsGeometrySchema>;

/* ─────────────────────────────── Parcel ─────────────────────────────────── */

/**
 * A national parcel identifier under its national SCHEME (REPORT §I:
 * Flurstückskennzeichen, refcat, BFE, EGRID, idu, CAPAKEY, kad. Nr, tunnus…).
 * Scheme is an open string: enumerating national schemes in L0 would make every
 * new country a schema change (the C58 §1.5 argument).
 */
export const NationalParcelIdSchema = z.object({
    country: z.string().regex(/^[A-Z]{2}$/),
    /** e.g. `"refcat"`, `"BFE"`, `"EGRID"`, `"tunnus"`, `"Flurstueckskennzeichen"`. */
    scheme: z.string().min(1),
    value: z.string().min(1),
});
export type NationalParcelId = z.infer<typeof NationalParcelIdSchema>;

/** REPORT §I Parcel — the canonical cadastral parcel record, native CRS. */
export const SiteIntelParcelSchema = z.object({
    id: SiteIntelIdSchema,
    nationalId: NationalParcelIdSchema,
    geometry: NativeCrsGeometrySchema,
    /** m², as PUBLISHED or derived — which one is a provenance fact, not a field default. */
    area: z.number().min(0).nullable(),
    /** Administrative unit (municipality/kommune/gmina…), or null. */
    adminUnit: z.string().min(1).nullable(),
    /** → SiteIntelSource.id */
    source: SiteIntelIdSchema,
    /** → SiteIntelVersion.entityRef (nullable until versioned). */
    version: SiteIntelIdSchema.nullable(),
});
export type SiteIntelParcel = z.infer<typeof SiteIntelParcelSchema>;

/* ─────────────────────────────── Building ───────────────────────────────── */

/**
 * REPORT §I Building.height.method — SURVEYED ≠ NORMATIVE is the L3 synthesis-4
 * invariant: a LiDAR-measured ridge is not a permitted height, and neither may
 * ever silently stand in for the other.
 */
export const BuildingHeightMethodSchema = z.enum(['SURVEYED', 'MODELLED', 'DERIVED_FLOORS']);
export type BuildingHeightMethod = z.infer<typeof BuildingHeightMethodSchema>;

/** REPORT §I Building — footprint + attributes, multi-id (BAG/EHR/ALKIS/catastro…). */
export const SiteIntelBuildingSchema = z.object({
    id: SiteIntelIdSchema,
    /** Overture/GERS id when conflated, or null. */
    gersId: z.string().min(1).nullable(),
    nationalIds: z.array(NationalParcelIdSchema),
    footprint: NativeCrsGeometrySchema,
    height: z.object({
        /** metres, or null + tier-6 confidence upstream — never 0-as-unknown. */
        value: z.number().min(0).nullable(),
        method: BuildingHeightMethodSchema,
        source: SiteIntelIdSchema,
    }),
    floors: z.object({
        above: z.number().int().min(0).nullable(),
        below: z.number().int().min(0).nullable(),
        source: SiteIntelIdSchema,
    }),
    /** Use classification, source vocabulary — open string. */
    use: z.string().min(1).nullable(),
    yearBuilt: z.number().int().nullable(),
    /** LoD of the best available representation (`"LoD0"`…`"LoD2.2"`), open string. */
    lod: z.string().min(1).nullable(),
    source: SiteIntelIdSchema,
    version: SiteIntelIdSchema.nullable(),
});
export type SiteIntelBuilding = z.infer<typeof SiteIntelBuildingSchema>;

/* ─────────────────────────────── Terrain ────────────────────────────────── */

/** REPORT §I Terrain — a reference to a tile/DTM, never inline raster data. */
export const SiteIntelTerrainSchema = z
    .object({
        /** Tile reference (PMTiles/quantized-mesh…), or null. */
        tileRef: z.string().min(1).nullable(),
        /** DTM dataset reference, or null. */
        dtmRef: z.string().min(1).nullable(),
        /** REPORT §I fixes the datum vocabulary; only ELLIPSOIDAL is minted so far. */
        datum: z.enum(['ELLIPSOIDAL']),
        source: SiteIntelIdSchema,
    })
    .refine((t) => t.tileRef !== null || t.dtmRef !== null, {
        message: 'Terrain must carry at least one of tileRef / dtmRef',
    });
export type SiteIntelTerrain = z.infer<typeof SiteIntelTerrainSchema>;

/* ──────────────────────────────── Road ──────────────────────────────────── */

/**
 * BRIEF §11 names Road among the 17; REPORT §I's field table omits it, so this
 * schema is deliberately MINIMAL — id + geometry + open classification. Street
 * WIDTH is intentionally absent: Spain-scaling evidence says street width has
 * no national source and must be CONSTRUCTED (a derivation, i.e. a Rule with
 * provenance — never a bare field that hides its method).
 */
export const SiteIntelRoadSchema = z.object({
    id: SiteIntelIdSchema,
    geometry: NativeCrsGeometrySchema,
    /** Source classification (functional class / highway tag…), open string. */
    kind: z.string().min(1).nullable(),
    name: z.string().min(1).nullable(),
    source: SiteIntelIdSchema,
    version: SiteIntelIdSchema.nullable(),
});
export type SiteIntelRoad = z.infer<typeof SiteIntelRoadSchema>;

/* ──────────────────────────────── Plan ──────────────────────────────────── */

/** REPORT §I Plan — the planning instrument (B-Plan/lokalplan/PLU/MPZP/…). */
export const SiteIntelPlanSchema = z.object({
    id: SiteIntelIdSchema,
    /**
     * Instrument kind — open string; known values from REPORT §I:
     * POG, MPZP, B-Plan, lokalplan, PLU, PDM, omgevingsplan, detaljplan, dp…
     * Enumerating them in L0 would make every new country a schema change.
     */
    kind: z.string().min(1),
    /**
     * Lifecycle status — open string, MIRRORED from the national register
     * (REPORT §I: "DK serves lifecycle natively; mirror it"). A closed enum here
     * would be an invented harmonisation of 30 national lifecycles.
     */
    status: z.string().min(1),
    adoptedDate: IsoDateStringSchema.nullable(),
    inForceFrom: IsoDateStringSchema.nullable(),
    inForceTo: IsoDateStringSchema.nullable(),
    /** → SiteIntelDocument.id[] */
    documents: z.array(SiteIntelIdSchema),
    /** Reference to the plan-boundary geometry object, or null. */
    geometryRef: SiteIntelIdSchema.nullable(),
    source: SiteIntelIdSchema,
    version: SiteIntelIdSchema.nullable(),
});
export type SiteIntelPlan = z.infer<typeof SiteIntelPlanSchema>;

/* ──────────────────────────────── Zone ──────────────────────────────────── */

/** REPORT §I Zone — a typed region of a Plan. */
export const SiteIntelZoneSchema = z.object({
    id: SiteIntelIdSchema,
    planId: SiteIntelIdSchema,
    typology: z.object({
        /** National code, verbatim (`"13a"`, `"U_GC_P_F"`, `"WA"`, `"R24.B.3.40"`). */
        national: z.string().min(1),
        /** Harmonised code when a cross-country mapping EXISTS, else null — never guessed. */
        harmonised: z.string().min(1).nullable(),
    }),
    geometry: NativeCrsGeometrySchema,
    source: SiteIntelIdSchema,
});
export type SiteIntelZone = z.infer<typeof SiteIntelZoneSchema>;

/* ──────────────────────────── Prescription ──────────────────────────────── */

/**
 * REPORT §I: known kinds are buildingLine | buildingField | heightCeiling |
 * setback (FR typepsc, DE BauGrenze/BauLinie, DK byggefelt, CH Baulinien —
 * "first-class, geometric"). The list is open by the REPORT's own "…".
 */
export const KNOWN_PRESCRIPTION_KINDS = Object.freeze([
    'buildingLine',
    'buildingField',
    'heightCeiling',
    'setback',
] as const);

/** REPORT §I Prescription — a GEOMETRIC constraint drawn by the ordinance. */
export const SiteIntelPrescriptionSchema = z.object({
    id: SiteIntelIdSchema,
    /** See {@link KNOWN_PRESCRIPTION_KINDS}; open per REPORT §I "…". */
    kind: z.string().min(1),
    geometry: NativeCrsGeometrySchema,
    /** National typology of the prescription (scheme + code, e.g. FR `typepsc`). */
    typology: z.object({
        scheme: z.string().min(1),
        code: z.string().min(1),
    }),
    /** Scalar payload where one exists (a heightCeiling's metres), else null. */
    value: z.number().nullable(),
    /** → SiteIntelZone.id or SiteIntelPlan.id. */
    zoneOrPlanRef: SiteIntelIdSchema,
    source: SiteIntelIdSchema,
});
export type SiteIntelPrescription = z.infer<typeof SiteIntelPrescriptionSchema>;

/* ──────────────────────────── Restriction ───────────────────────────────── */

/**
 * REPORT §I Restriction — modelled on the Swiss ÖREB extract. Known themes:
 * heritage | noise | flood | utility | easement (open per REPORT "…").
 */
export const SiteIntelRestrictionSchema = z
    .object({
        id: SiteIntelIdSchema,
        theme: z.string().min(1),
        typeCode: z.string().min(1),
        /** Legal binding status, mirrored from the register (open string). */
        lawStatus: z.string().min(1),
        /** Geometry where the restriction is drawn, or null when only a share is served. */
        geometry: NativeCrsGeometrySchema.nullable(),
        /** Affected share of the parcel [0..1], or null when geometry is served instead. */
        areaShare: z.number().min(0).max(1).nullable(),
        /** → SiteIntelDocument.id[] (the ÖREB "legal provisions" links). */
        legalProvisions: z.array(SiteIntelIdSchema),
        source: SiteIntelIdSchema,
    })
    .refine((r) => r.geometry !== null || r.areaShare !== null, {
        message: 'Restriction must carry geometry or areaShare (or both)',
    });
export type SiteIntelRestriction = z.infer<typeof SiteIntelRestrictionSchema>;

/* ──────────────────────────── Regulation ────────────────────────────────── */

/**
 * BRIEF §11 names Regulation among the 17; REPORT §I's field table addresses
 * the TEXT through Document and the EXTRACT through Rule, so Regulation is the
 * thin named instrument BETWEEN them: the normative body (règlement /
 * Reglement / NTA / regulamento) a plan carries and rules cite into. Minimal
 * by design — its content lives in Documents, its meaning in Rules.
 */
export const SiteIntelRegulationSchema = z.object({
    id: SiteIntelIdSchema,
    /** → SiteIntelPlan.id, or null for plan-independent instruments (national law). */
    planId: SiteIntelIdSchema.nullable(),
    title: z.string().min(1),
    /** Instrument kind, open string (règlement / NTA / ordinance / law …). */
    kind: z.string().min(1),
    /** → SiteIntelDocument.id[] — the text(s) that ARE this regulation. */
    documents: z.array(SiteIntelIdSchema),
    source: SiteIntelIdSchema,
    version: SiteIntelIdSchema.nullable(),
});
export type SiteIntelRegulation = z.infer<typeof SiteIntelRegulationSchema>;

/* ──────────────────────────────── Rule ──────────────────────────────────── */

/**
 * R1 (E1 gate decision §C · verdict §E R1, REVISED-THEN-FROZEN §H): what an
 * applicability `basis` reference points AT — the same `{kind, ref}` shape as
 * `Evidence.from`, over the planning entities (`parcel` added by the §8
 * synthesis to close the entire-parcel leg).
 */
export const RuleBasisKindSchema = z.enum([
    'zone',
    'prescription',
    'plan',
    'restriction',
    'regulation',
    'parcel',
]);
export type RuleBasisKind = z.infer<typeof RuleBasisKindSchema>;

/** One "because of this planning object" reference (the `Evidence.from` shape). */
export const RuleBasisRefSchema = z.object({
    kind: RuleBasisKindSchema,
    ref: SiteIntelIdSchema,
});
export type RuleBasisRef = z.infer<typeof RuleBasisRefSchema>;

/**
 * R1 `rank` — the rule's position in its country's instrument-precedence
 * ladder, MIRRORED from national semantics (DK: byggefelt / delområde /
 * lokalplan / ramme / BR18), never harmonised across countries. RESOLUTION
 * stays in the engine (verdict §F.7): rank is a FACT about the rule; no
 * precedence algorithm lives in the data model.
 */
export const RuleApplicabilityRankSchema = z.object({
    /** National ladder id, verbatim (e.g. `"dk-plandata"`) — one scheme per country's ladder. */
    scheme: z.string().min(1),
    /** 1-based rung within the named ladder, 1 = most specific (DK: byggefelt 1 … BR18 5). */
    level: z.number().int().min(1),
});
export type RuleApplicabilityRank = z.infer<typeof RuleApplicabilityRankSchema>;

/**
 * REPORT §I Rule.applicability — WHERE / FOR-WHAT / AT-WHICH-RANK the rule
 * applies, as the R1 TYPED VALUE OBJECT (E1 gate decision §C · verdict §E R1;
 * REVISED-THEN-FROZEN §H). A value object, NOT an independently-identified
 * entity: no audited country serves applicability as an addressable object
 * (verdict §F.1). Replaces the three untyped legs
 * (`geometryRef`/`zoneRef`/`predicate`) — the old shape no longer parses.
 *
 * ⚠ CONTRACT (R1 companion sentence, verdict §E — non-schema, binding on every
 * producer): every `basis` reference MUST resolve to a MINTED entity — an
 * adapter that cites a planning object (e.g. an EE hoonestusala) mints the
 * Prescription/Zone it cites; emitting an unresolvable string reproduces the
 * dangling-`geometryRef` defect this object replaces (gate decision §B.2).
 *
 * Temporal legs deliberately STAY where they are (`valid_from`/`valid_to` on
 * provenance, `Version`, `Scenario.asOfDate`) — proven; moving them is churn
 * (verdict §E R1).
 *
 * At least one of `basis` / `geometry` / `condition` must be present — a rule
 * that applies "nowhere in particular" is not a rule (unchanged from the
 * three-leg form). `useScope` and `rank` are QUALIFIERS, not legs: they narrow
 * or rank an applicability, they cannot found one.
 */
export const RuleApplicabilitySchema = z
    .object({
        /** Typed planning-object refs — the "because of this planning object" answer. */
        basis: z.array(RuleBasisRefSchema).default([]),
        /**
         * Inline geometry for the residual case where the spatial scope is
         * served as bare geometry with no planning object behind it.
         */
        geometry: NativeCrsGeometrySchema.nullable().default(null),
        /**
         * Verbatim national use tokens (EE otstarve, DK anvgen, DE Baugebiet
         * kinds…), NEVER harmonised at L0 — same doctrine as
         * `Zone.typology.national`. Empty = the rule is not use-conditioned
         * (or the register serves no use axis).
         */
        useScope: z.array(z.string().min(1)).default([]),
        /** Instrument-ladder rank, or null = the register serves no rank axis. */
        rank: RuleApplicabilityRankSchema.nullable().default(null),
        /** JSON-Logic predicate over parcel/context facts (evaluated by E1b) — carrier, never ontology. */
        condition: JsonValueSchema.nullable().default(null),
    })
    .refine((a) => a.basis.length > 0 || a.geometry !== null || a.condition !== null, {
        message:
            'Rule applicability must carry at least one leg: a basis ref, an inline geometry, or a condition',
    });
export type RuleApplicability = z.infer<typeof RuleApplicabilitySchema>;

/**
 * REPORT §I Rule — "see provenance JSON below": the Rule IS the per-rule
 * provenance record (parameter/value/unit/source/derivation/confidence/
 * valid_from/valid_to — OpenFisca-pattern time-versioning) plus identity, an
 * optional JSON-Logic body for non-scalar expressions, and applicability.
 * Composing `RuleProvenanceSchema` whole rather than duplicating its fields
 * keeps ONE authority for the shape (C84 EI-9) — drift between "a rule" and
 * "a rule's provenance" is unrepresentable.
 */
export const SiteIntelRuleSchema = z.object({
    id: SiteIntelIdSchema,
    /** Scalar/conditional expression when not a bare value (REPORT §I `body?: JSONLogic`). */
    body: JsonValueSchema.nullable().default(null),
    applicability: RuleApplicabilitySchema,
    /** The §11 record: parameter/value/unit/source/derivation/confidence/validity. */
    provenance: RuleProvenanceSchema,
});
export type SiteIntelRule = z.infer<typeof SiteIntelRuleSchema>;

/* ─────────────────────────────── Source ─────────────────────────────────── */

/** REPORT §I Source.protocol — closed set, verbatim. */
export const SourceProtocolSchema = z.enum(['WFS2', 'OGCAPI', 'REST', 'ATOM', 'bulk']);
export type SourceProtocol = z.infer<typeof SourceProtocolSchema>;

/** REPORT §G licence traffic-light. */
export const LicenceColourSchema = z.enum(['GREEN', 'YELLOW', 'RED']);
export type LicenceColour = z.infer<typeof LicenceColourSchema>;

/**
 * REPORT §I Source — one row of the source registry. The prose ancestor is the
 * per-row probe notes in `packages/site-parcel-data/src/parcelProviders/
 * registry.ts` and `docs/04-reference/jurisdictions/**` (internal review §1.1:
 * "the per-row notes are a working source registry") — this is that registry's
 * typed form, not a rival of the runtime provider registry.
 */
export const SiteIntelSourceSchema = z.object({
    id: SiteIntelIdSchema,
    country: z.string().regex(/^[A-Z]{2}$/),
    authority: z.string().min(1),
    dataset: z.string().min(1),
    /** Service/download URL as a string — L0 never fetches it. */
    endpoint: z.string().min(1),
    protocol: SourceProtocolSchema,
    licence: z.object({
        /** SPDX id or national licence name (`"CC-BY-4.0"`, `"Licencia Catastro"`). */
        id: z.string().min(1),
        colour: LicenceColourSchema,
        /** When a human last read the licence TEXT (BRIEF §9 discipline). */
        verifiedDate: IsoDateStringSchema.nullable(),
        /** → SiteIntelDocument.id of the licence text, or null. */
        textRef: SiteIntelIdSchema.nullable(),
    }),
    /** BRIEF §10 access option 1..6 (query/cache/mirror/cloud-optimise/derived-only/metadata+on-demand). */
    accessOption: z.number().int().min(1).max(6),
    /** Access gate where one exists (`"MitID"`, `"free API key form"`), or null = keyless. */
    gate: z.string().min(1).nullable(),
    /** Dated probe log — the registry's evidence that the endpoint answers. */
    probes: z.array(
        z.object({
            date: IsoDateStringSchema,
            note: z.string().min(1),
        }),
    ),
    /*
     * ── Source-Registry NOW-thin columns (E1 gate decision §F item 5 · verdict §E
     * "Source-registry columns … (4 nullable)" · supplement §7) ──────────────────
     * All four are NULLABLE + default(null), additive, zero migration. null means
     * "the audit lane files record nothing for this column" — it is an honest
     * absence, never a claim (§CONTEXT-DATA-HONESTY). Values are carried VERBATIM
     * from the lane files / prose registries this schema typifies; open strings,
     * no closed enums — a closed vocabulary here would be an invented
     * harmonisation of per-lane wording (same doctrine as `Plan.kind`).
     */
    /** What the dataset is about (`"cadastre"`, `"planning"`, `"buildings-3d"`, `"terrain"`…) — the brief's theme column. */
    theme: z.string().min(1).nullable().default(null),
    /** Coverage note verbatim from the lane files (`"full"`, `"mainland only, per-município"`, `"236 of 290 kommuner"`). */
    coverage: z.string().min(1).nullable().default(null),
    /** Update cadence verbatim from the lane files (`"daily FGDB mirror"`, `"annual Jan-1 snapshots since 2012"`). */
    updateFrequency: z.string().min(1).nullable().default(null),
    /**
     * The E1b/E1c coordination column (supplement §7: "what turns the registry from
     * documentation into the sequencing instrument"): where the PRYZM adapter stands
     * against this source, in the lane files' own status tokens (`"live"`,
     * `"documented"`, `"blocked"`, `"deferred-stub"` — heightSources.mjs `impl` +
     * registry.ts L-449 vocabulary), never a harmonised enum.
     */
    adapterStatus: z.string().min(1).nullable().default(null),
});
export type SiteIntelSource = z.infer<typeof SiteIntelSourceSchema>;

/* ────────────────────────────── Evidence ────────────────────────────────── */

/**
 * What an Evidence node points AT (REPORT §I
 * `from→(Source|Document|Rule|Derivation)`), EXTENDED by R4 (E1 gate decision
 * §C · verdict §E R4) with the geometric planning entities
 * (`zone | prescription | restriction | plan | parcel`) so an evidence hop can
 * cite the planning object itself, not only the source it was fetched from.
 * One enum, no new fields — closes challenge gap #7.
 */
export const EvidenceRefKindSchema = z.enum([
    'source',
    'document',
    'rule',
    'derivation',
    'zone',
    'prescription',
    'restriction',
    'plan',
    'parcel',
]);
export type EvidenceRefKind = z.infer<typeof EvidenceRefKindSchema>;

/**
 * REPORT §I Evidence — one hop of the "why is max height X?" chain (§K). The
 * E1c lane wires chains of these through the existing attribution layer; this
 * is only the node shape.
 */
export const SiteIntelEvidenceSchema = z.object({
    id: SiteIntelIdSchema,
    /** The claim this evidence supports, in words. */
    claim: z.string().min(1),
    from: z.object({
        kind: EvidenceRefKindSchema,
        ref: SiteIntelIdSchema,
    }),
    /** How the claim was checked (`"live WFS probe"`, `"dual-pass extraction"`). */
    method: z.string().min(1),
    checkedDate: IsoDateStringSchema,
    /** Content hash of what was seen, for tamper-evidence across re-fetches. */
    hash: z.string().min(1),
});
export type SiteIntelEvidence = z.infer<typeof SiteIntelEvidenceSchema>;

/* ────────────────────────────── Document ────────────────────────────────── */

/** REPORT §I Document — an addressable legal text (règlement/NTA/lokalplan-PDF/law). */
export const SiteIntelDocumentSchema = z.object({
    id: SiteIntelIdSchema,
    url: z.string().min(1),
    /** Document kind, open string (REPORT lists règlement | Reglement | NTA | regulamento | lokalplan-PDF | law). */
    kind: z.string().min(1),
    /** National document-identity scheme + value (idurba / doklink / ELI / …). */
    identity: z.object({
        scheme: z.string().min(1),
        value: z.string().min(1),
    }),
    version: z.string().min(1).nullable(),
    retrievedDate: IsoDateStringSchema.nullable(),
});
export type SiteIntelDocument = z.infer<typeof SiteIntelDocumentSchema>;

/* ────────────────────────────── Scenario ────────────────────────────────── */

/**
 * REPORT §I Scenario — a what-if over a parcel: point-in-time (`asOfDate`
 * answers "what applied on 2025-01-01" against Rule/Plan validity windows) plus
 * explicit parameter overrides.
 */
export const SiteIntelScenarioSchema = z.object({
    id: SiteIntelIdSchema,
    parcelId: SiteIntelIdSchema,
    asOfDate: IsoDateStringSchema,
    overrides: z.array(
        z.object({
            parameter: z.string().min(1),
            value: JsonValueSchema,
        }),
    ),
    /** → SiteIntelEnvelope.id computed under this scenario, or null while pending. */
    envelopeRef: SiteIntelIdSchema.nullable(),
});
export type SiteIntelScenario = z.infer<typeof SiteIntelScenarioSchema>;

/* ────────────────────────────── Envelope ────────────────────────────────── */

/**
 * One solid of a canonical-model envelope: a native-CRS footprint extruded
 * between two heights. ⚠ This is the CATALOGUE form. The scene-space authority
 * for tiered envelopes — with the principal-tier rule, refusal vocabulary and
 * over-statement doctrine — is `EnvelopeTierSchema` / `BuildableEnvelopeSchema`
 * (C58); adapters convert between the two, and any conflict resolves in C58's
 * favour.
 */
export const SiteIntelEnvelopeSolidSchema = z.object({
    label: z.string().min(1),
    footprint: NativeCrsGeometrySchema,
    /** Underside height above the datum, metres. */
    baseHeightM: z.number(),
    /** Height cap, metres — null = geometrically determined but no published vertical limit. */
    maxHeightM: z.number().nullable(),
});
export type SiteIntelEnvelopeSolid = z.infer<typeof SiteIntelEnvelopeSolidSchema>;

/**
 * REPORT §I Envelope — the canonical-model record of a computed buildable
 * envelope, keyed to the exact rule set that produced it.
 *
 * `isUpperBound` is the never-overstate seam (REPORT §M / C58 §1.4): `true`
 * asserts the envelope never exceeds the legal maximum on any axis; `false` is
 * an honest flag for study geometry that may. It must never silently default.
 */
export const SiteIntelEnvelopeSchema = z.object({
    id: SiteIntelIdSchema,
    parcelId: SiteIntelIdSchema,
    solids: z.array(SiteIntelEnvelopeSolidSchema),
    /** The overall buildable footprint, native CRS. */
    footprint: NativeCrsGeometrySchema,
    maxVolumeM3: z.number().min(0).nullable(),
    maxGfaM2: z.number().min(0).nullable(),
    /** REQUIRED, no default — see doc comment. */
    isUpperBound: z.boolean(),
    /** → SiteIntelEvidence.id[] — the derivation chain (§K). */
    derivationTrace: z.array(SiteIntelIdSchema),
    /** Six-tier confidence of the WHOLE envelope (weakest input governs). */
    confidenceTier: SiteIntelConfidenceSchema,
    /** ISO date the envelope was computed. */
    computedAt: IsoDateStringSchema,
    /** Version id of the rule set used — the E1b reproducibility key. */
    ruleSetVersion: z.string().min(1),
    /** → C58 BuildableDeterminationRecord/BuildableEnvelope id, when one exists. */
    determinationRef: SiteIntelIdSchema.nullable().default(null),
});
export type SiteIntelEnvelope = z.infer<typeof SiteIntelEnvelopeSchema>;

/* ─────────────────────── DevelopmentPotential ───────────────────────────── */

/**
 * REPORT §I DevelopmentPotential — permitted minus existing, per parcel.
 * All numbers nullable: an unknown side makes the delta null too — UNKNOWN is
 * never 0 (a parcel with unknown existing GFA has UNKNOWN spare capacity, not
 * maximal capacity).
 */
export const SiteIntelDevelopmentPotentialSchema = z
    .object({
        parcelId: SiteIntelIdSchema,
        permitted: z.object({
            gfaM2: z.number().min(0).nullable(),
        }),
        existing: z.object({
            gfaM2: z.number().min(0).nullable(),
            source: SiteIntelIdSchema,
        }),
        /** permitted − existing, m²; null whenever either side is null. */
        deltaGfaM2: z.number().nullable(),
        confidence: SiteIntelConfidenceSchema,
        /**
         * ISO date the potential was computed — the time anchor (gate decision
         * §C ride-along per verdict §G item 3 / supplement §6.2: every other
         * computed artefact is pinned; this is the number customers dispute).
         */
        computedAt: IsoDateStringSchema,
        /**
         * → SiteIntelEnvelope.id the permitted side was read from, or null
         * when permitted GFA was rule-direct (no catalogued envelope involved).
         */
        envelopeRef: SiteIntelIdSchema.nullable(),
    })
    .superRefine((dp, ctx) => {
        if (
            (dp.permitted.gfaM2 === null || dp.existing.gfaM2 === null) &&
            dp.deltaGfaM2 !== null
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['deltaGfaM2'],
                message:
                    'deltaGfaM2 must be null when either permitted or existing GFA is unknown — ' +
                    'UNKNOWN ≠ 0 (REPORT §I invariants)',
            });
        }
    });
export type SiteIntelDevelopmentPotential = z.infer<typeof SiteIntelDevelopmentPotentialSchema>;

/* ─────────────────────────────── Version ────────────────────────────────── */

/**
 * REPORT §I Version — the time-versioning spine ("what applied on
 * 2025-01-01?"): every versioned entity row points here.
 */
export const SiteIntelVersionSchema = z.object({
    /** The entity this version row describes (its SiteIntelId). */
    entityRef: SiteIntelIdSchema,
    validFrom: IsoDateStringSchema,
    /** null = current. */
    validTo: IsoDateStringSchema.nullable(),
    /** → the succeeding version's entityRef, or null while current. */
    supersededBy: SiteIntelIdSchema.nullable(),
});
export type SiteIntelVersion = z.infer<typeof SiteIntelVersionSchema>;
