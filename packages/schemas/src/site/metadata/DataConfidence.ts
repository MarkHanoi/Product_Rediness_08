// C62 (DRAFT — ADR-0280) — the shared Data-Confidence, Provenance & Unknown-Reason model.
//
// WHY THIS EXISTS
// ---------------
// The parcel-metadata architecture review (docs/04-reference/PARCEL-METADATA-MODEL-REVIEW.md,
// §"Architectural Findings" #1 + Gap-Matrix P0) found confidence / provenance / unknown-reason
// are RE-INVENTED per subsystem: parcel `ParcelConfidence` (C57 / L-640),
// envelope `EnvelopeConfidence` (C58 §1.2, ProvenanceFlags.ts), heights (ADR-0277). At
// 1k–10k cities that field-centric duplication is unmaintainable drift. The fix is ONE generic,
// domain-INHERITED metadata wrapper every layer reuses, plus a typed `UnknownReason` enum so the
// honesty rule (§CONTEXT-DATA-HONESTY: failure ≠ empty ≠ fabricated) is STRUCTURAL — it lives in
// the wrapper, not re-hand-rolled in every field.
//
// This is the clean SUPERTYPE the existing concrete shapes become instances of:
//   - C57 `ParcelConfidence` (apps/editor/.../parcel/ParcelProvider.ts) — its `match` tier is a
//     `DomainConfidence.tier`; its raw numbers stay domain-local diagnostics.
//   - C58 `EnvelopeConfidence` (packages/schemas/src/site/zoning/ProvenanceFlags.ts) — its 6-tier
//     enum is a `DomainConfidence.tier`; `not-determined` maps to a `null` value + `unknownReason`.
// It is NOT a conflicting third confidence SCALE: each domain keeps its own tier vocabulary in the
// `tier` string; the generic only adds the shared axes (unknown-reason, authority, validation).
//
// LAYERING — L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM. Per P5 an L0 schema takes no
// OpenTelemetry span (a span is I/O and would break purity); the one helper here is a pure,
// deterministic comparator, consistent with the package's existing pure L0 helpers.
//
// STATUS: DRAFT for orchestrator/founder review (ADR-0280, PROPOSED). NOT yet wired into consumers
// and deliberately NOT re-exported from the site barrel — the orchestrator ratifies C62 and
// sequences consumer migration (C57 / C58 / C55 / ADR-0277) separately.
//
// Strategic context — docs/04-reference/PARCEL-METADATA-MODEL-REVIEW.md,
// docs/02-decisions/adrs/ADR-0280-data-confidence-provenance-unknown-reason-model.md.

import { z } from 'zod';

/**
 * WHY a value is not known — the typed refusal vocabulary (§CONTEXT-DATA-HONESTY).
 *
 * A missing value is NEVER a bare `null` guessed to mean "zero"; it is `null` + one of these
 * reasons, so a consumer (human or agent) can tell an unpublishable fact from an un-queried one.
 * Closed set — a new reason is a deliberate contract change, not an ad-hoc string:
 *   - `authority-does-not-publish` — the authoritative source exists but does not publish this fact.
 *   - `not-queried`                — we have not asked (yet); the source may hold it.
 *   - `outside-coverage`           — the location is outside this source/adapter's coverage area.
 *   - `adapter-limitation`         — the source publishes it but our adapter does not yet parse it.
 *   - `license-restriction`        — the data exists but licence terms forbid us using/storing it.
 *   - `geometry-incomplete`        — a geometry-derived value cannot be computed (ring invalid, etc.).
 *   - `pending-implementation`     — the field is specced but the compute path is not built yet.
 */
export const UnknownReasonSchema = z.enum([
    'authority-does-not-publish',
    'not-queried',
    'outside-coverage',
    'adapter-limitation',
    'license-restriction',
    'geometry-incomplete',
    'pending-implementation',
]);
export type UnknownReason = z.infer<typeof UnknownReasonSchema>;

/**
 * The rank of the SOURCE that produced a value — the deterministic reconciliation key when sources
 * disagree (review Gap-Matrix P1 "Authority ranking"). **Ordered most-authoritative first**, so a
 * lower array index outranks a higher one (see `authorityOutranks`):
 *   - `national-cadastre` — the national land registry (strongest; e.g. ES Catastro).
 *   - `regional-gis`      — a regional / municipal GIS authority.
 *   - `inspire`           — an INSPIRE-harmonised service.
 *   - `osm`               — OpenStreetMap / crowd-sourced.
 *   - `generated`         — PRYZM-derived / computed (shoelace area, block dissolve, …).
 *   - `user`              — a value the user drew / typed (authoritative for THEIR intent only).
 */
export const AuthorityRankSchema = z.enum([
    'national-cadastre',
    'regional-gis',
    'inspire',
    'osm',
    'generated',
    'user',
]);
export type AuthorityRank = z.infer<typeof AuthorityRankSchema>;

/** The authority tokens in strength order (index 0 = strongest). */
export const AUTHORITY_RANK_ORDER: readonly AuthorityRank[] = AuthorityRankSchema.options;

/**
 * Does source `a` outrank source `b`? Pure, deterministic — the conflict-resolution primitive
 * ("which source wins") the review asks for. Equal ranks return `false` (no strict winner).
 */
export function authorityOutranks(a: AuthorityRank, b: AuthorityRank): boolean {
    return AUTHORITY_RANK_ORDER.indexOf(a) < AUTHORITY_RANK_ORDER.indexOf(b);
}

/**
 * WHO/what has checked a value — a distinct axis from confidence (a machine can be highly confident
 * yet un-reviewed; a human can sign off a low-confidence estimate). Ordered weakest-first; upgrades
 * only on a RECORDED event, never silently (mirrors the C58 L-449 human-verification gate):
 *   - `not-checked`         — default; nobody/nothing has validated it.
 *   - `auto-validated`      — passed automatic sanity checks (ranges, schema, self-consistency).
 *   - `cross-validated`     — agrees with an independent second source.
 *   - `human-reviewed`      — a human read and accepted it.
 *   - `authority-confirmed` — confirmed by the governing authority (certificate-grade).
 */
export const ValidationStateSchema = z.enum([
    'not-checked',
    'auto-validated',
    'cross-validated',
    'human-reviewed',
    'authority-confirmed',
]);
export type ValidationState = z.infer<typeof ValidationStateSchema>;

/**
 * Structured provenance of a sourced value — the clean supertype of the ad-hoc `source` string
 * tags (C57 `ParcelFeature.source`) and `ProvenanceRecord` (C19). Optional on the envelope: a
 * generated / user value may carry no external provenance.
 */
export const SourceProvenanceSchema = z.object({
    /** Stable source / provider id or provenance tag (e.g. `'catastro'`, `'osm'`). */
    source: z.string().min(1),
    /** Dataset / source version, when the source publishes one; `null` when it does not. */
    sourceVersion: z.string().min(1).nullable().default(null),
    /** UTC ISO-8601 retrieval / process timestamp; `null` when not recorded. */
    retrievedAt: z.string().datetime().nullable().default(null),
    /** SPDX id or free-form licence string; `null` when unknown. */
    license: z.string().min(1).nullable().default(null),
    /** Where this source sits in the authority ranking (the reconciliation key). */
    authorityRank: AuthorityRankSchema.optional(),
});
export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;

/**
 * A per-DOMAIN confidence summary — the shape every subsystem's bespoke confidence object becomes
 * an instance of (C57 `ParcelConfidence`, C58 `EnvelopeConfidence`). It carries the shared honesty
 * axes while letting each domain keep its own tier vocabulary in `tier`:
 *   - `tier`            — the domain-specific confidence label (parcel: `high|medium|low`;
 *                         envelope: `authoritative|structured|block-constructed|…`). Optional: a
 *                         domain may express confidence only as a normalized `score`.
 *   - `score`          — a normalized 0..1 confidence, or `null` when genuinely unknown. **Never
 *                         default an unknown to 0** — that is the fabrication the honesty rule forbids.
 *   - `authorityRank`  — the strongest source that contributed this value.
 *   - `validationState`— who/what has checked it (default `not-checked`).
 *   - `unknownReason`  — when the domain value is unknown, the typed reason (never fabricate).
 */
export const DomainConfidenceSchema = z.object({
    tier: z.string().min(1).optional(),
    score: z.number().min(0).max(1).nullable().default(null),
    authorityRank: AuthorityRankSchema.optional(),
    validationState: ValidationStateSchema.default('not-checked'),
    unknownReason: UnknownReasonSchema.optional(),
});
export type DomainConfidence = z.infer<typeof DomainConfidenceSchema>;

/**
 * The generic, domain-inherited metadata wrapper (review Gap-Matrix P0). Every layer wraps its
 * fields in one of these instead of re-inventing confidence/provenance/unknown-reason:
 *   - `value`          — the datum, or `null` when unknown (pair `null` with `unknownReason`).
 *   - `unknownReason`  — WHY `value` is null; omitted when `value` is present.
 *   - `provenance`     — where the value came from (structured).
 *   - `confidence`     — a normalized 0..1 confidence for THIS value (a richer per-domain rollup
 *                        lives in `DomainConfidence`).
 *   - `authorityRank`  — the source's rank (reconciliation key).
 *   - `validationState`— who/what has checked it.
 *
 * Zod generics are factory FUNCTIONS, so this is a factory over the value schema; the companion
 * `MetadataEnvelope<T>` type mirrors its output for hand-authored consumers.
 */
export function metadataEnvelope<T extends z.ZodTypeAny>(valueSchema: T) {
    return z.object({
        value: valueSchema.nullable(),
        unknownReason: UnknownReasonSchema.optional(),
        provenance: SourceProvenanceSchema.optional(),
        confidence: z.number().min(0).max(1).optional(),
        authorityRank: AuthorityRankSchema.optional(),
        validationState: ValidationStateSchema.optional(),
    });
}

/**
 * The output shape of {@link metadataEnvelope} for a value of type `T`. Hand-authored so consumers
 * can annotate an envelope without threading the Zod factory's inferred type.
 */
export interface MetadataEnvelope<T> {
    /** The datum, or `null` when unknown (then set `unknownReason`). */
    value: T | null;
    /** WHY `value` is `null`; omitted when the value is present. */
    unknownReason?: UnknownReason;
    /** Where the value came from. */
    provenance?: SourceProvenance;
    /** Normalized 0..1 confidence for this value. */
    confidence?: number;
    /** The source's authority rank (reconciliation key). */
    authorityRank?: AuthorityRank;
    /** Who/what has validated this value. */
    validationState?: ValidationState;
}

/**
 * A ready-made "unknown" envelope — the canonical way to say *we do not know, and here is the typed
 * reason*, without fabricating a value. Keeps the honesty rule a one-liner at every call site.
 */
export function unknownEnvelope<T>(reason: UnknownReason): MetadataEnvelope<T> {
    return { value: null, unknownReason: reason };
}
