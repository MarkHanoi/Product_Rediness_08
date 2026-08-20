// §L-1580 (C57 §1.4 / §2.2 · C19 §2.6 · C62 / ADR-0280) — THE PERSISTED CADASTRAL
// PROVENANCE OF A COMMITTED PARCEL.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
//
// C57 §1.4 is normative and was NOT met: "Every fetched parcel carries provenance …
// This populates C19 §2.6 `ProvenanceRecord` on the committed Site" and "Provenance
// is not optional". Measured 2026-08-20: `ParcelFeature` (the FETCHED shape) carries
// `refcat`, `address`, `source`, `metrics` and `confidence`, and the map's info card
// renders all of them — but `dispatchParcelBoundary` accepted ONLY
// `{ polygon, edgeClassifications }`, so every one of those fields died at the commit
// seam. `grep -rn refcat packages/schemas/src` returned ZERO hits: the shipped
// `ProvenanceRecordSchema` has `source | sourceVersion | ingestTimestamp | license |
// actor` and cannot hold a cadastral reference, and C57 §1.4's `sourceCrs` was absent
// from it too.
//
// The consequence was not cosmetic. A committed parcel is the LEGAL datum a C58
// buildability verdict is computed on. Once the map modal closed, nothing in the
// project could say whether that ring was a referencia catastral from a national land
// registry or an OSM building outline picked up as a fallback — and those two carry
// opposite legal weight (C57 §1.13.4 / §1.5).
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────
//
// It is NOT a second copy of `ProvenanceRecord`. `SiteModel.provenance` answers "where
// did this SITE come from" (auto-promoted / user-authored / ifc-import). THIS answers
// "which authority published the parcel polygon, under what identifier, and how well
// does it match what was asked for" — a parcel-scoped fact with fields
// `ProvenanceRecord` structurally cannot hold. C57 §2.2 types its `source` as an open
// `string` (provider id), not the C19 enum, precisely because there are ~20 provider
// ids in `packages/site-parcel-data/src/parcelProviders/registry.ts` and that list
// grows per jurisdiction. An enum here would rot on the next registry row.
//
// It composes `SourceProvenanceSchema` (C62 / ADR-0280), which names itself "the clean
// supertype of the ad-hoc `source` string tags (C57 `ParcelFeature.source`) and
// `ProvenanceRecord` (C19)" — so this is that supertype instantiated, not a rival.
//
// ── THE HONESTY AXES THIS FILE REFUSES TO COLLAPSE ──────────────────────────────
//
//  1. `kind` — 'cadastral' vs 'footprint'. A footprint is the BUILDING outline, not the
//     land boundary, and carries no cadastral reference. Presenting one as a legal
//     parcel is the false-provenance failure C57 §1.5/§1.13.4 and
//     `FootprintParcelProvider.ts:14` forbid by name. It is a separate FIELD, not an
//     inference from a substring of `source`, because a substring test is one rename
//     away from silently reclassifying a footprint as a cadastral parcel.
//  2. `confidence.areaSource` — 'registry-declared' vs 'derived-from-ring'. Whether the
//     area came from the publisher's own registry (INSPIRE areaValue) or from our
//     shoelace over the ring. Collapsing those two was C57 §13 KV-3, fixed by §L-640 at
//     the FETCH layer; persisting only one number would re-collapse it one layer down.
//  3. ABSENCE. `Parcel.provenance` is `null` for every project committed before this
//     landed, and `null` means NOT RECORDED — never "no source", never zero. A UI
//     reading this MUST say so in words (C84 EI-1b: failure and emptiness must not be
//     the same value).

import { z } from 'zod';
import { SourceProvenanceSchema } from './metadata/DataConfidence.js';

/**
 * WHAT the committed ring actually is. THE load-bearing honesty field.
 *
 *  - `cadastral`  — a real land-registry parcel from a named authority (C57 §1.13.3).
 *  - `footprint`  — the OSM/Overture BUILDING outline used as the universal fallback
 *                   where no cadastre is reachable (C57 §1.13.4). NEVER a legal parcel.
 *  - `user-drawn` — the user drew the ring by hand (the C19 universal fallback path).
 *                   Authoritative for the user's INTENT, for nothing else.
 */
export const ParcelSourceKindSchema = z.enum(['cadastral', 'footprint', 'user-drawn']);
export type ParcelSourceKind = z.infer<typeof ParcelSourceKindSchema>;

/** C57 §2.4 — where `areaOfficialM2` came from. The KV-3 distinction (§L-640). */
export const ParcelAreaSourceSchema = z.enum(['registry-declared', 'derived-from-ring']);
export type ParcelAreaSourceKind = z.infer<typeof ParcelAreaSourceSchema>;

/** C57 §2.4 — the fact-based match tier. NEVER derived from a numeric cutoff. */
export const ParcelMatchTierSchema = z.enum(['high', 'medium', 'low']);
export type ParcelMatchTierValue = z.infer<typeof ParcelMatchTierSchema>;

/**
 * C57 §2.4 `ParcelConfidence`, persisted verbatim.
 *
 * The three raw numeric fields (`areaDeltaPct`, `pointToParcelM`, `candidateMarginM`)
 * are shipped RAW and are explicitly NOT tiered — C57 §2.4's stated Phase-1 limitation.
 * Persisting them changes nothing about that: code MUST NOT derive a sub-tier from them
 * until a measured distribution and founder sign-off exist.
 */
export const PersistedParcelConfidenceSchema = z.object({
    match: ParcelMatchTierSchema,
    areaSource: ParcelAreaSourceSchema,
    /** Registry-declared area (m²), or `null` when the publisher does not publish one. */
    areaOfficialM2: z.number().nullable().default(null),
    /** Shoelace area (m²) over the ring — always present. */
    areaSigM2: z.number(),
    areaDeltaPct: z.number().nullable().default(null),
    pointToParcelM: z.number().nullable().default(null),
    candidateMarginM: z.number().nullable().default(null),
    geometryComplete: z.boolean(),
});
export type PersistedParcelConfidence = z.infer<typeof PersistedParcelConfidenceSchema>;

/**
 * C57 §2.2 `ParcelProvenance` — persisted on the committed C19 Parcel.
 *
 * `source` is the provider id ('catastro' · 'ign-fr' · 'pdok-nl' · 'footprint' …) and
 * `label` is the §1.9 ATTRIBUTION STRING, which is mandatory: "Every provider carries a
 * human-facing `label` … that MUST be shown wherever its data is displayed." It is
 * persisted rather than re-derived at render time, because a re-derivation looks up
 * today's registry row for a parcel fetched months ago and would attribute the data to
 * whichever provider happens to cover that bbox now.
 */
export const ParcelProvenanceSchema = SourceProvenanceSchema.extend({
    /** §L-1580 — cadastral vs footprint vs hand-drawn. See `ParcelSourceKindSchema`. */
    kind: ParcelSourceKindSchema,
    /** C57 §1.9 — the provider's human attribution string. Shown wherever its data is. */
    label: z.string().min(1),
    /**
     * C57 §1.4 / §2.2 — the EPSG the geometry arrived in, BEFORE the edge reprojection to
     * WGS84 ('EPSG:25830', 'EPSG:25832', 'EPSG:4326', …). `null` = the adapter did not
     * record it. NOT a default of 'EPSG:4326': guessing the source CRS is exactly the
     * fabricated-fact failure this record exists to prevent.
     */
    sourceCrs: z.string().min(1).nullable().default(null),
    /**
     * The jurisdiction's own parcel identifier — ES referencia catastral, DK jordstykke
     * id, CH EGRID, or (for `kind: 'footprint'`) the OSM way/relation id. `null` when the
     * source publishes none.
     *
     * ⚠ For `kind: 'footprint'` this is an OSM id and MUST NOT be labelled a cadastral
     * reference (`FootprintParcelProvider.ts:14`).
     */
    refcat: z.string().min(1).nullable().default(null),
    /** Locator / postal-ish string when the source supplies one. **PII** per C22. */
    address: z.string().min(1).nullable().default(null),
    /** The C58 rule-pack key the parcel resolved under ('es-barcelona', 'dk', …). */
    jurisdictionId: z.string().min(1).nullable().default(null),
    /** C57 §1.4 — UTC ISO-8601 fetch time. Required: an un-timestamped fetch is unattributable. */
    ingestTimestamp: z.string().datetime(),
    /** C57 §2.4 — the honesty-gated confidence, or `null` when the adapter computed none. */
    confidence: PersistedParcelConfidenceSchema.nullable().default(null),
});
export type ParcelProvenance = z.infer<typeof ParcelProvenanceSchema>;

/**
 * Is this committed parcel a legal cadastral parcel?
 *
 * THE one predicate. It reads the `kind` FIELD and nothing else — no substring test on
 * `source`, no `match === 'high'` inference. Absent provenance answers `false`, because
 * "not recorded" is not evidence of a cadastre; a caller that needs to distinguish
 * "footprint" from "not recorded" must check for `null` itself, and every UI here does.
 */
export function isCadastralParcel(p: ParcelProvenance | null | undefined): boolean {
    return p?.kind === 'cadastral';
}
