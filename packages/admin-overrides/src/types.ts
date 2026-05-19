/**
 * @pryzm/admin-overrides — types & schemas.
 *
 * Source authority:
 *   - ADR-028 Part E (plan/role overrides for enterprise admins)
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S65 work-item 8
 *   - ADR-0045 §A (S65 closure + admin override surface contract)
 *
 * The override surface lets enterprise admins grant a workspace or user
 * an effective plan / role / feature flag that differs from their
 * baseline.  Common operator scenarios:
 *
 *   • A workspace's plan is `personal` but their account manager grants
 *     `enterprise` for a 60-day trial.
 *   • A user's role is `editor` but on a particular project they need
 *     `admin` for one sprint.
 *   • A feature flag (e.g. `webgpu-tessellation`) is enabled for a
 *     specific workspace before global rollout.
 *
 * Each override has a stable `subjectKind:subjectId` key, an optional
 * expiry, an audit trail (`setBy` + `setAt`), and a reason string for
 * the workspace audit log.  Resolution at request time prefers the
 * non-expired override over the baseline (see `resolution.ts`).
 *
 * PURE: no transport, no DB; this package is the data contract +
 * in-memory store + resolution helpers.  The api-gateway wires it.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────
//  Plan / role enums — mirror @pryzm/ai-cost Plan and the broader RBAC
//  catalogue so a single source of truth on the wire.
// ──────────────────────────────────────────────────────────────────────

/** Plan tiers — superset of `ai-cost.Plan` so admins can move sideways. */
export const PLANS = ['personal', 'team', 'business', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

/** Roles within a workspace.  Ordered low → high privilege. */
export const ROLES = ['viewer', 'commenter', 'editor', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** Subject the override targets. */
export const SUBJECT_KINDS = ['workspace', 'user'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

// ──────────────────────────────────────────────────────────────────────
//  Schemas
// ──────────────────────────────────────────────────────────────────────

export const OverrideRecordSchema = z.object({
  /** Who is being overridden. */
  subjectKind: z.enum(SUBJECT_KINDS),
  /** Their stable id (workspaceId or userId). */
  subjectId: z.string().min(1),
  /** Effective plan; if absent, baseline plan is used. */
  plan: z.enum(PLANS).optional(),
  /** Effective roles to grant ON TOP OF baseline.  Subtractive overrides
   *  are not modelled at S65; restrict via baseline RBAC. */
  roles: z.array(z.enum(ROLES)).optional(),
  /** Feature-flag map: name → bool.  Falsy values disable a flag the
   *  baseline would have enabled. */
  features: z.record(z.string(), z.boolean()).optional(),
  /** ms since epoch — override is ignored if `now() >= expiresAt`. */
  expiresAt: z.number().int().nonnegative().optional(),
  /** Required audit fields. */
  setBy: z.string().min(1),
  setAt: z.number().int().nonnegative(),
  /** Reason string — surfaced in the admin UI + audit log. */
  reason: z.string().min(1).max(500),
});
export type OverrideRecord = z.infer<typeof OverrideRecordSchema>;

/** Composite key for the store. */
export function overrideKey(kind: SubjectKind, id: string): string {
  return `${kind}:${id}`;
}
