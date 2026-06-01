// A.2 (Phase A · Sprint 1) — L0 TypologyManifest schema.
//
// The canonical metadata block for a Typology Pack — a `.pryzm-typology`
// ZIP container that ships a per-typology generative-AI pipeline. Each
// pack carries a `manifest.json` validated by `TypologyManifestSchema`.
//
// L0-pure: Zod-only. No I/O, no THREE, no DOM, no `@pryzm/*` imports.
// Brand types are compile-time only (zero runtime cost).
//
// Strategic context — see:
//   - docs/03-execution/plans/typology-expansion-roadmap.md §4 (Pack architecture)
//   - docs/03-execution/plans/master-execution-tracker.md A.2 (this sub-phase)
//   - docs/03-execution/plans/roadmap-phase-1-alpha.md §3 (Bucket B1)
//
// Phase A ships 3 typology packs (apartment + house + small-office) using
// this manifest schema. Phase B adds 7 more; Phase C adds 15 more; Phase D
// opens to marketplace community authors.

import { z } from 'zod';

/**
 * Branded canonical typology id. Slug-style (`apartment`, `house`,
 * `small-office`, `gym`, `pharmacy`, `car-park`, …). The schema enforces
 * lowercase-kebab-case. The brand is compile-time only.
 */
export type TypologyId = string & { readonly __brand: 'TypologyId' };

/**
 * Strict semver pattern (MAJOR.MINOR.PATCH). Pre-release / build-metadata
 * suffixes are NOT permitted — the marketplace publisher rejects them.
 */
export const TYPOLOGY_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * The 10 canonical typology categories, mirroring the RIBA + AIA
 * practice-classification taxonomy used in the TypologyPicker UI.
 *
 * Per docs/03-execution/plans/typology-expansion-roadmap.md §3:
 *   Residential · Workplace · Retail+hospitality · Healthcare · Education
 *   · Sports+leisure · Civic+cultural · Industrial+logistics · Transport
 *   · Specialist
 */
export const TypologyCategoryEnum = z.enum([
    'residential',
    'workplace',
    'retail-hospitality',
    'healthcare',
    'education',
    'sports-leisure',
    'civic-cultural',
    'industrial-logistics',
    'transport',
    'specialist',
]);
export type TypologyCategory = z.infer<typeof TypologyCategoryEnum>;

/**
 * The 7 plan tiers a customer can be on (see C39 §1.3) — used to gate
 * which typology packs are available at which tier. The marketplace also
 * uses this to filter searchable artefacts per the user's current plan.
 */
export const PlanTierEnum = z.enum([
    'free-trial',
    'solo',
    'studio',
    'mid-firm',
    'enterprise',
    'developer',  // marketplace developer side (per C40)
    'admin',      // PRYZM internal staff
]);
export type PlanTier = z.infer<typeof PlanTierEnum>;

/**
 * The 7 cognition layers (L1–L7) per
 * docs/01-strategy/site-and-cognition-strategy.md §3.1. A typology pack
 * declares which layers its pipeline enforces — this lets the runtime
 * gate the pack's validation pass and surface the right inspection
 * panels.
 */
export const CognitionLayerEnum = z.enum([
    'L1-environmental',   // sun · wind · climate · terrain · regulatory
    'L2-spatial-hierarchy', // Site → Building → Level → Apt → Room → Element
    'L3-semantic-topology', // adjacencies · circulation graph · privacy gradient
    'L4-compositional-geometry', // walls · slabs · doors · windows
    'L5-perceptual-simulation', // daylight · acoustic · sightlines
    'L6-behavioural-simulation', // pedestrian flow · occupancy patterns
    'L7-typology-priors', // typology-specific programmatic priors
]);
export type CognitionLayer = z.infer<typeof CognitionLayerEnum>;

/**
 * The drawing-standard regimes per C34 — used to default the project's
 * sheet conventions when this typology is selected in a given jurisdiction.
 */
export const DrawingStandardEnum = z.enum([
    'AIA',
    'RIBA',
    'DIN',
    'NF',         // NF P 02-* (France)
    'JIS',        // JIS A * (Japan)
    'UNE',        // Spain
    'ABNT',       // Brazil
    'GB',         // China
    'ISO-19650',  // international BIM coordination
]);
export type DrawingStandard = z.infer<typeof DrawingStandardEnum>;

/**
 * Ed25519 signature per C07 §3.2. Marketplace publishes are signed by the
 * publisher's verified Ed25519 keypair; the runtime verifies on load.
 * Format: `<base64-signature>:<base64-publicKey>`.
 */
export const Ed25519SignatureSchema = z
    .string()
    .min(64)
    .regex(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/, {
        message:
            'Ed25519 signature must be `<base64-signature>:<base64-publicKey>`',
    });
export type Ed25519Signature = z.infer<typeof Ed25519SignatureSchema>;

/**
 * Marketplace listing metadata. Present only for marketplace-published
 * packs; PRYZM-first-party packs omit this block. Fields here drive the
 * marketplace browse + filter + detail UI.
 */
export const MarketplaceListingSchema = z.object({
    publisherId:        z.string().min(1),
    publishedAt:        z.string().datetime(),
    listingPath:        z.string().min(1),    // `/marketplace/typology/<slug>`
    pricing: z.object({
        model:    z.enum(['free', 'one-time', 'subscription']),
        amountCents: z.number().int().nonnegative().optional(),
        currency:    z.string().length(3).optional(),  // ISO 4217
    }),
    averageRating:      z.number().min(0).max(5).optional(),
    reviewCount:        z.number().int().nonnegative().optional(),
});
export type MarketplaceListing = z.infer<typeof MarketplaceListingSchema>;

/**
 * The slug pattern for a TypologyId. Lowercase-kebab-case, 3-64 chars.
 * URL-safe; serves as the marketplace path slug AND the in-product
 * identifier (`typology.apartment.create`).
 */
export const TYPOLOGY_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

/**
 * The canonical TypologyManifest. Every typology pack's `manifest.json`
 * validates against this schema. The Z layer for the L0 ingestion side
 * of the typology-pipeline; the L3 TypologyRegistryStore consumes
 * validated manifests.
 *
 *   - `id`                   canonical TypologyId (slug pattern)
 *   - `displayName`          human label per locale (en-US by default;
 *                            per C46 i18n)
 *   - `category`             one of the 10 canonical categories
 *   - `version`              strict semver per TYPOLOGY_VERSION_PATTERN
 *   - `description`          1-300 char description for the picker card
 *   - `thumbnail`            relative path inside the ZIP (e.g. `thumb.webp`)
 *   - `author`               publishing entity (`'PRYZM'` for first-party)
 *   - `signature`            Ed25519 signature per C07 §3.2 (optional
 *                            for unsigned dev-mode packs)
 *   - `requiredPlanTier`     minimum plan tier gate per C39
 *   - `cognitionLayers`      which L1–L7 the pipeline enforces
 *   - `aiWorkflowEntry`      relative path to compiled AI workflow .js
 *                            (optional; deterministic-only packs omit)
 *   - `deterministicEngineEntry`  relative path to offline fallback .js
 *                            (optional; AI-only packs omit; SHOULD ship
 *                            both per C09 §4 — workflows must have a
 *                            deterministic fallback)
 *   - `programRulesEntry`    relative path to JSON rules database
 *                            (e.g. `program-rules.json`)
 *   - `roomTypes`            canonical room types this typology uses
 *                            (must match keys in programRules)
 *   - `defaultDrawingStandard`  default per C34; user overrides per
 *                            project per C46 §5
 *   - `marketplaceListing`   present for marketplace packs only
 *   - `phaseGate`            the PRYZM phase at which this pack ships
 *                            (alpha · beta · ga · community-marketplace)
 *
 * Per docs/03-execution/plans/typology-expansion-roadmap.md §4.1.
 */
export const TypologyManifestSchema = z.object({
    id: z.string().regex(TYPOLOGY_ID_PATTERN, {
        message:
            'TypologyId must be lowercase-kebab-case, 3-64 chars, starting + ending with alphanumerics',
    }),
    displayName: z.string().min(1).max(80),
    category: TypologyCategoryEnum,
    version: z.string().regex(TYPOLOGY_VERSION_PATTERN, {
        message: 'TypologyManifest.version must match MAJOR.MINOR.PATCH semver',
    }),
    description: z.string().min(1).max(300),
    thumbnail: z.string().min(1),
    author: z.string().min(1),
    signature: Ed25519SignatureSchema.optional(),
    requiredPlanTier: PlanTierEnum.default('solo'),
    cognitionLayers: z.array(CognitionLayerEnum).min(1, {
        message: 'A TypologyManifest must declare at least one cognition layer',
    }),
    aiWorkflowEntry: z.string().min(1).optional(),
    deterministicEngineEntry: z.string().min(1).optional(),
    programRulesEntry: z.string().min(1),
    roomTypes: z.array(z.string().min(1)).min(1, {
        message: 'A TypologyManifest must declare at least one roomType',
    }),
    defaultDrawingStandard: DrawingStandardEnum.optional(),
    marketplaceListing: MarketplaceListingSchema.optional(),
    phaseGate: z
        .enum(['alpha', 'beta', 'ga', 'community-marketplace'])
        .default('alpha'),
});
export type TypologyManifest = z.infer<typeof TypologyManifestSchema>;

/**
 * Helper: validates that the manifest declares **at least one** of
 * (aiWorkflowEntry, deterministicEngineEntry). A pack that ships neither
 * is invalid per typology-expansion §6 (the canonical pipeline shape
 * requires either a generative-AI workflow OR a deterministic engine).
 *
 * Note: this is enforced at runtime by the TypologyPipelineRouter, NOT
 * by the schema (Zod's `.refine` would require coupling that this layer
 * declines). The L3 store-side validation runs this check on registration.
 */
export function manifestHasEntry(manifest: TypologyManifest): boolean {
    return Boolean(
        manifest.aiWorkflowEntry || manifest.deterministicEngineEntry
    );
}

/**
 * Helper: assert a string is a valid TypologyId. Throws if not. Used by
 * loader code that receives an untyped string from user input or the
 * marketplace API.
 */
export function assertTypologyId(value: string): TypologyId {
    if (!TYPOLOGY_ID_PATTERN.test(value)) {
        throw new Error(
            `Invalid TypologyId '${value}' — must match ${TYPOLOGY_ID_PATTERN}`
        );
    }
    return value as TypologyId;
}
