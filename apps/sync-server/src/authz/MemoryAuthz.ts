// apps/sync-server/authz/MemoryAuthz.ts — in-memory authz (W-03 / ADR-0040).
//
// v0 default impl.  Stores a `Map<projectId, Set<userId>>` so tests can
// pre-seed memberships and assert negative cases.  Production wiring
// (Phase 2D + S43 D9 cutover) will swap this for `PgAuthz` reading
// the `project_members` table — same interface, drop-in replacement.

import type { Authz, AuthzAction, AuthzContext } from './Authz.js';
import { ANONYMOUS_USER_ID } from './Authz.js';

export interface MemoryAuthzOptions {
  /** Allow every action when no membership table exists for the project.
   *  `true` (default) preserves the v0 "open beta" behaviour while still
   *  surfacing an audit trail; `false` denies-by-default for tests. */
  readonly allowByDefault?: boolean;
  /** Reject the magic anonymous user (i.e. no `userId` query param) on
   *  every action regardless of memberships.  Default `false`. */
  readonly denyAnonymous?: boolean;
  /** Optional sink invoked for every decision so the caller can wire the
   *  audit log + OTel attributes without coupling them into the policy. */
  readonly onDecision?: (decision: AuthzDecision) => void;
}

export interface AuthzDecision {
  readonly action: AuthzAction;
  readonly actorId: string;
  readonly projectId: string;
  readonly allowed: boolean;
  readonly reason: string;
}

export class MemoryAuthz implements Authz {
  private readonly members = new Map<string, Set<string>>();
  private readonly opts: Required<Omit<MemoryAuthzOptions, 'onDecision'>> & Pick<MemoryAuthzOptions, 'onDecision'>;

  constructor(opts: MemoryAuthzOptions = {}) {
    this.opts = {
      allowByDefault: opts.allowByDefault ?? true,
      denyAnonymous: opts.denyAnonymous ?? false,
      onDecision: opts.onDecision,
    };
  }

  /** Add a user to a project's member list.  Used by tests + the future
   *  bootstrap path that hydrates from `project_members`. */
  addMember(projectId: string, userId: string): void {
    let set = this.members.get(projectId);
    if (!set) { set = new Set(); this.members.set(projectId, set); }
    set.add(userId);
  }

  /** Remove a user from a project's member list (sweeper / admin path). */
  removeMember(projectId: string, userId: string): void {
    this.members.get(projectId)?.delete(userId);
  }

  /** Reset all memberships — test convenience. */
  clear(): void { this.members.clear(); }

  /** Snapshot for diagnostics / health endpoint. */
  stats(): { projects: number; totalMembers: number } {
    let total = 0;
    for (const set of this.members.values()) total += set.size;
    return { projects: this.members.size, totalMembers: total };
  }

  async can(action: AuthzAction, ctx: AuthzContext): Promise<boolean> {
    const decision = this.evaluate(action, ctx);
    this.opts.onDecision?.(decision);
    return decision.allowed;
  }

  private evaluate(action: AuthzAction, ctx: AuthzContext): AuthzDecision {
    const base = { action, actorId: ctx.actor.id, projectId: ctx.projectId };

    if (this.opts.denyAnonymous && ctx.actor.id === ANONYMOUS_USER_ID) {
      return { ...base, allowed: false, reason: 'anonymous-denied' };
    }

    const set = this.members.get(ctx.projectId);
    if (!set || set.size === 0) {
      return {
        ...base,
        allowed: this.opts.allowByDefault,
        reason: this.opts.allowByDefault ? 'no-membership-table-allow-by-default' : 'no-membership-table-deny',
      };
    }

    const isMember = set.has(ctx.actor.id);
    return {
      ...base,
      allowed: isMember,
      reason: isMember ? 'member' : 'not-a-member',
    };
  }
}
