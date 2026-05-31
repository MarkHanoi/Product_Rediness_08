// P0.3 slice A (Family Platform) — L0 identity sub-schema for the FamilyRegistry.
//
// The canonical "who/what" record stamped on every RegisteredFamily. Every
// family-platform consumer (loader, runtime, instance, UI, AI dispatch) keys
// off `FamilyIdentity.id` — the dotted-namespace canonical id minted by the
// authoring tool (e.g. `family/com.pryzm.core/desk`).
//
// L0-pure: Zod-only. No I/O, no THREE, no DOM, no `@pryzm/*` imports — this is
// the substrate the L3 FamilyRegistryStore + the L7 plugin/AI surfaces all
// read.  Brand types are compile-time only (zero runtime cost).
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §3
//     (FamilyRequest data shape — `identity` block)
//   - §6 (FamilyRegistry — `byId` index keyed by `FamilyId`)

import { z } from 'zod';

/**
 * Branded canonical id of a registered family.  Conventionally
 * `family/<namespace>/<name>` (e.g. `family/com.pryzm.core/desk`) but the
 * schema does NOT enforce the slash structure — the loader / authoring tool
 * is the source of truth for the format.  The brand is compile-time only;
 * the runtime value is still a plain string.
 */
export type FamilyId = string & { readonly __brand: 'FamilyId' };

/**
 * Semver pattern enforced by `FamilyIdentitySchema.version`.  Strict
 * `MAJOR.MINOR.PATCH` — pre-release / build-metadata suffixes are NOT
 * permitted at this layer (the loader rejects them too).
 */
export const FAMILY_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Identity block for a registered family.  Every field is required + non-empty.
 *
 *   - `id`        canonical id; treated as a `FamilyId` brand by consumers
 *   - `name`      human-readable family name ("Desk", "Office Chair")
 *   - `version`   strict semver — see `FAMILY_VERSION_PATTERN`
 *   - `author`    publishing entity (org or individual)
 *   - `license`   SPDX id (e.g. `MIT`, `Apache-2.0`, `CC-BY-4.0`)
 */
export const FamilyIdentitySchema = z.object({
    id:      z.string().min(1),
    name:    z.string().min(1),
    version: z.string().regex(FAMILY_VERSION_PATTERN, {
        message: 'FamilyIdentity.version must match MAJOR.MINOR.PATCH semver',
    }),
    author:  z.string().min(1),
    license: z.string().min(1),
});
export type FamilyIdentity = z.infer<typeof FamilyIdentitySchema>;
