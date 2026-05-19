// @pryzm/plugin-sdk — locked descriptor schema (S62 D1).
//
// Spec source:
//   • phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md §2.1
//     (manifest schema, 7 permissions, 5 contribution kinds)
//   • phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S62 D1
//     ("descriptor schema lock; semver 1.0.0 commitment")
//
// Schema lock: ADR-0038.  This file is the executable lock — every
// breaking change must come with a deliberate edit to
// __tests__/descriptor.test.ts and a sprint-scoped ADR amendment per
// phase-doc-2 line 182 ("breaking changes in v1 are a 1-year deprecation
// cycle minimum").
//
// Type naming: the primary export is `PluginManifest` (matches the on-disk
// `plugin.manifest.json` artefact and the `pryzm dev` CLI's manifestPath
// constant); `PluginDescriptor` is a permanent type alias for compatibility
// with phase-doc-2 prose.  See ADR-0038 §Decision C.

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
//  Permissions — locked at v1.  Adding a new permission is a v1.x additive
//  change (allowed); removing or tightening an existing one requires v2.0.
// ────────────────────────────────────────────────────────────────────────────

export const PluginPermissionSchema = z.enum([
  'read:project',     // read element data from stores
  'write:project',    // execute commands via commandBus
  'read:user',        // read current user info
  'network:fetch',    // make outbound fetch() calls (allowedOrigins enforced)
  'register:tool',    // register a viewport tool
  'register:panel',   // register a panel contribution (PropertyPanel et al.)
  'register:command', // register a command in the command palette
]);

export type PluginPermission = z.infer<typeof PluginPermissionSchema>;

// ────────────────────────────────────────────────────────────────────────────
//  Contributions — locked at v1.  Five kinds via discriminated union; new
//  kinds are an additive v1.x change.
// ────────────────────────────────────────────────────────────────────────────

export const PluginContributionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tool'),
    id: z.string(),
    label: z.string(),
    icon: z.string(),                  // SVG data URI or icon-registry name
    toolbar: z.enum(['left', 'right', 'top', 'floating']),
  }),
  z.object({
    kind: z.literal('panel'),
    id: z.string(),
    location: z.enum(['properties', 'sidebar-left', 'sidebar-right', 'bottom']),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('command'),
    id: z.string(),
    label: z.string(),
    keybinding: z.string().optional(), // e.g. 'Ctrl+Shift+P'
    category: z.string().optional(),
  }),
  z.object({
    kind: z.literal('element-type'),
    id: z.string(),
    label: z.string(),
    ifcEntityType: z.string(),
    familyFile: z.string(),            // path within plugin package to .pryzm-family
  }),
  z.object({
    kind: z.literal('view-template'),
    id: z.string(),
    label: z.string(),
    templateFile: z.string(),          // path to JSON matching ViewTemplateSchema
  }),
]);

export type PluginContribution = z.infer<typeof PluginContributionSchema>;

// ────────────────────────────────────────────────────────────────────────────
//  Manifest envelope — locked at v1.  `pryzmPlugin: '1.0'` is the version
//  pin; future major schema versions ship as `'2.0'`, `'3.0'`, etc.
// ────────────────────────────────────────────────────────────────────────────

const ID_REGEX = /^[a-z][a-z0-9-]{2,63}$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export const PluginManifestSchema = z
  .object({
    pryzmPlugin: z.literal('1.0'),
    id: z.string().regex(ID_REGEX, 'Plugin ID must be lowercase-kebab-case (3–64 chars, leading letter)'),
    version: z.string().regex(SEMVER_REGEX, 'version must be MAJOR.MINOR.PATCH'),
    displayName: z.string().min(2).max(80),
    description: z.string().max(500),
    author: z.string(),
    homepage: z.string().url().optional(),
    main: z.string(),                                  // entry point relative to plugin root
    icon: z.string().optional(),
    license: z.string().default('MIT'),
    permissions: z.array(PluginPermissionSchema),
    allowedOrigins: z.array(z.string()).default([]),   // required iff 'network:fetch' is granted
    contributions: z.array(PluginContributionSchema).default([]),
    minPRYZMVersion: z.string().regex(SEMVER_REGEX, 'minPRYZMVersion must be MAJOR.MINOR.PATCH'),
    pricingModel: z.enum(['free', 'one-time', 'subscription']).optional(),
    pricingCurrency: z.string().optional(),            // e.g. 'USD'
    pricingAmount: z.number().optional(),
  })
  // ADR-0038 Decision E — `network:fetch` requires non-empty allowedOrigins
  // at the schema level so a marketplace upload cannot ship the permission
  // with an empty allowlist (which would silently fall through to "fetch
  // denied" at runtime — a worse failure mode than a manifest reject).
  .superRefine((m, ctx) => {
    if (m.permissions.includes('network:fetch') && m.allowedOrigins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedOrigins'],
        message: "allowedOrigins must be non-empty when 'network:fetch' permission is granted",
      });
    }
  });

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** Permanent type alias — see ADR-0038 §Decision C.  Prefer `PluginManifest`
 *  in new code; `PluginDescriptor` is exported so phase-doc-2-aligned code
 *  can keep its naming. */
export type PluginDescriptor = PluginManifest;

// ────────────────────────────────────────────────────────────────────────────
//  validateManifest — the public entry point.  Returns a discriminated
//  union so callers cannot accidentally use a half-validated manifest.
//  Errors are sorted by dot-path so `pryzm dev` can render them stably.
// ────────────────────────────────────────────────────────────────────────────

export type ValidateManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; errors: readonly string[] };

export function validateManifest(raw: unknown): ValidateManifestResult {
  const result = PluginManifestSchema.safeParse(raw);
  if (result.success) return { ok: true, manifest: result.data };
  const errors = result.error.issues
    .map(i => `${i.path.join('.')}: ${i.message}`)
    .sort();
  return { ok: false, errors };
}
