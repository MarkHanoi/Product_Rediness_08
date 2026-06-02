// A.7.a (Phase A · Sprint 1) — Branded ids + primitive types for the C19
// Site substrate.
//
// L0-pure: Zod only. No I/O, no THREE, no DOM.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md §2 (Schemas)
//   - docs/03-execution/plans/master-execution-tracker.md A.7

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Branded ids. Brand is compile-time only (zero runtime cost).
// Per C19 §2.1: SiteId is deterministic — `site_<projectId>` for auto-promoted
// sites; UUIDv7 for user-authored sites.
//
// `ProjectId` is NOT re-defined here — it ships in `../types/Id.ts` as the
// canonical brand `Id<'project'>` for the whole monorepo. We define only
// the Zod validator below.
// ─────────────────────────────────────────────────────────────────────────────

export type SiteId = string & { readonly __brand: 'SiteId' };
export type ContextBuildingId = string & { readonly __brand: 'ContextBuildingId' };
export type ClimateRefId = string & { readonly __brand: 'ClimateRefId' };
export type BuildingId = string & { readonly __brand: 'BuildingId' };
export type JurisdictionId = string & { readonly __brand: 'JurisdictionId' };

// Permissive id pattern — slug-like, alphanumeric + dash + underscore.
// 3-64 chars. The actual identity discipline (uuid7 vs `site_<projectId>`)
// is enforced at the command-handler layer per C19 §2.1.
export const SITE_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

export const SiteIdSchema = z
    .string()
    .regex(SITE_ID_PATTERN, 'SiteId must match `[A-Za-z0-9_-]{3,64}`');
export const ContextBuildingIdSchema = z
    .string()
    .regex(SITE_ID_PATTERN, 'ContextBuildingId must match `[A-Za-z0-9_-]{3,64}`');
export const ClimateRefIdSchema = z
    .string()
    .regex(SITE_ID_PATTERN, 'ClimateRefId must match `[A-Za-z0-9_-]{3,64}`');
export const BuildingIdSchema = z
    .string()
    .regex(SITE_ID_PATTERN, 'BuildingId must match `[A-Za-z0-9_-]{3,64}`');
export const ProjectIdSchema = z
    .string()
    .regex(SITE_ID_PATTERN, 'ProjectId must match `[A-Za-z0-9_-]{3,64}`');

// ─────────────────────────────────────────────────────────────────────────────
// 2D point in scene-XZ metres (per C12 LTP-ENU convention).
// `Pt` is the canonical name used in C19 §2 type tables.
// ─────────────────────────────────────────────────────────────────────────────

export const PtSchema = z.object({
    x: z.number().finite(),
    z: z.number().finite(),
});
export type Pt = z.infer<typeof PtSchema>;

// 3D vector for `SiteLocation.basePoint` is the monorepo's canonical
// `Vec3` from `../base/primitives.ts`. We do NOT re-export it from this
// barrel — consumers import from the existing path. SiteLocation.ts
// imports it directly.
