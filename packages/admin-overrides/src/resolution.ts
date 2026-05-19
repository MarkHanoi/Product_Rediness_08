/**
 * @pryzm/admin-overrides — resolution helpers.
 *
 * The resolution helpers are the SHIM the api-gateway / billing pipeline
 * call at request time to compute the EFFECTIVE plan / roles / features
 * for a given subject.  They return a plain object — never throw — so
 * the caller's hot path stays predictable.
 *
 * Contract per ADR-028 Part E §3:
 *   - An expired override is IGNORED (not deleted automatically — that
 *     stays an explicit admin action so the audit trail is preserved).
 *   - A present override's `plan` REPLACES the baseline.
 *   - A present override's `roles` are UNION'd with baseline roles.
 *   - A present override's `features` are MERGED OVER the baseline
 *     (override's `false` disables a baseline-true flag).
 */

import type { OverrideStore } from './store.js';
import type { Plan, Role, SubjectKind } from './types.js';

export interface ResolveInput {
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly baselinePlan: Plan;
  readonly baselineRoles?: readonly Role[];
  readonly baselineFeatures?: Readonly<Record<string, boolean>>;
  /** `Date.now`-style clock; defaults to the real `Date.now`. */
  readonly now?: number;
}

export interface ResolvedSubject {
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly effectivePlan: Plan;
  readonly effectiveRoles: readonly Role[];
  readonly effectiveFeatures: Readonly<Record<string, boolean>>;
  /** True iff a non-expired override contributed to the result. */
  readonly overrideApplied: boolean;
  /** ms-epoch the override was set, or undefined. */
  readonly overrideSetAt?: number;
  /** ms-epoch the override expires, or undefined for permanent. */
  readonly overrideExpiresAt?: number;
  /** Audit reason from the override, or undefined. */
  readonly overrideReason?: string;
}

export function resolveEffective(
  store: OverrideStore,
  input: ResolveInput,
): ResolvedSubject {
  const now = input.now ?? Date.now();
  const baselineRoles = input.baselineRoles ?? [];
  const baselineFeatures = input.baselineFeatures ?? {};

  const override = store.get(input.subjectKind, input.subjectId);
  const expired =
    override !== undefined &&
    override.expiresAt !== undefined &&
    now >= override.expiresAt;

  if (override === undefined || expired) {
    return Object.freeze({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      effectivePlan: input.baselinePlan,
      effectiveRoles: Object.freeze([...baselineRoles]),
      effectiveFeatures: Object.freeze({ ...baselineFeatures }),
      overrideApplied: false,
    });
  }

  const effectivePlan = override.plan ?? input.baselinePlan;

  const rolesSet = new Set<Role>(baselineRoles);
  if (override.roles) for (const r of override.roles) rolesSet.add(r);
  const effectiveRoles = Object.freeze(Array.from(rolesSet));

  const effectiveFeatures = Object.freeze({
    ...baselineFeatures,
    ...(override.features ?? {}),
  });

  return Object.freeze({
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    effectivePlan,
    effectiveRoles,
    effectiveFeatures,
    overrideApplied: true,
    overrideSetAt: override.setAt,
    overrideExpiresAt: override.expiresAt,
    overrideReason: override.reason,
  });
}
