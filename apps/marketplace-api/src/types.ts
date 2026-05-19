/**
 * `@pryzm/marketplace-api` — domain types.
 *
 * Mirrors the SQL schema in `migrations/0001_marketplace_plugins.sql`,
 * which itself mirrors phase-doc-2 §S64 verbatim.  Any schema drift
 * here MUST be reflected in the SQL + the migration test suite.
 */

import { z } from 'zod';

/** Marketplace category — drawn from the inventory at S62 D1. */
export const MarketplaceCategoryEnum = z.enum([
  'ai',
  'element-family',
  'format',
  'auxiliary',
  'view',
  'annotation',
  'discipline',
  'demo',
]);
export type MarketplaceCategory = z.infer<typeof MarketplaceCategoryEnum>;

/** Surfaces a plugin contributes to. */
export const SurfaceEnum = z.enum([
  'tool', 'panel', 'command', 'element-type', 'view-template',
]);
export type Surface = z.infer<typeof SurfaceEnum>;

/** Plugin-id pattern: `<publisher>/<slug>` — both kebab-case. */
export const PluginIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-z][a-z0-9-]{1,63}\/[a-z][a-z0-9-]{1,63}$/, 'expected `<publisher>/<plugin-slug>`');

/** Strict semver — no pre-release tags (matches plugin-sdk descriptor). */
export const StrictSemverSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'expected MAJOR.MINOR.PATCH');

// ──────────────────────────────────────────────────────────────────────
//  marketplace_plugins (top-level row)
// ──────────────────────────────────────────────────────────────────────

export const MarketplacePluginSchema = z.object({
  pluginId: PluginIdSchema,
  displayName: z.string().min(2).max(80),
  publisherId: z.string().min(1),
  description: z.string().max(500),
  license: z.string().min(1),
  category: MarketplaceCategoryEnum,
  surfaces: z.array(SurfaceEnum).max(20),
  homepageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  isFirstParty: z.boolean(),
  auditPassed: z.boolean(),
  auditPassedAt: z.string().datetime().nullable(),
  installCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type MarketplacePlugin = z.infer<typeof MarketplacePluginSchema>;

// ──────────────────────────────────────────────────────────────────────
//  marketplace_plugin_versions
// ──────────────────────────────────────────────────────────────────────

export const MarketplacePluginVersionSchema = z.object({
  pluginId: PluginIdSchema,
  version: StrictSemverSchema,
  signature: z.string().min(1),         // base64 Ed25519 sig
  signedByKeyid: z.string().min(1),     // the publisher's public-key fingerprint
  bundleUrl: z.string().url(),
  bundleSha256: z.string().regex(/^[0-9a-f]{64}$/, 'expected lowercase hex sha256'),
  publishedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  revokeReason: z.string().nullable(),
});
export type MarketplacePluginVersion = z.infer<typeof MarketplacePluginVersionSchema>;

// ──────────────────────────────────────────────────────────────────────
//  publishers (referenced by marketplace_plugins.publisher_id)
// ──────────────────────────────────────────────────────────────────────

export const PublisherSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(2).max(120),
  /** Ed25519 raw public key, base64url-encoded (32 bytes → 43 chars). */
  publicKeyB64: z.string().regex(/^[A-Za-z0-9_-]+$/),
  isFirstParty: z.boolean(),
  /** Workspace identifier — for first-party rows this is the canonical 'pryzm' org. */
  workspaceId: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Publisher = z.infer<typeof PublisherSchema>;

// ──────────────────────────────────────────────────────────────────────
//  Revocation list (CRL — served at GET /revocations.json)
// ──────────────────────────────────────────────────────────────────────

export interface RevocationListResponse {
  readonly issuedAt: string;
  readonly revokedPublisherKeysB64: readonly string[];
  readonly revokedPluginIdAtVersion: readonly string[]; // 'publisher/slug@1.2.3'
}
