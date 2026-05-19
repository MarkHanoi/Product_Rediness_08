// apps/sync-server/authz/Authz.ts — authz boundary (Phase 2 close W-03 / ADR-0040).
//
// Spec source:
//   • PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md §S43 D7 — `authz.can`
//     gate on every gateway route.
//   • PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md §W-03.
//   • docs/architecture/adr/0040-authz-middleware-sync-server.md.
//
// PURPOSE
// ─────────────────────────────────────────────────────────────────────────────
// Closes the v0 trust-the-client gap on the multi-user surface.  Every
// HTTP / WS handler that mutates project state — `event.append`,
// `events.load`, `project.subscribe`, soft-lock acquire / release / extend —
// asks `authz.can(action, ctx)` and rejects (403 / `error.unauthorised`)
// when the answer is `false`.
//
// The interface is intentionally tiny so Phase 3C (full JWT) can swap the
// implementation without changing handler signatures.

export type AuthzAction =
  | 'projectRead'      // GET /api/locks, events.load, project.subscribe push
  | 'projectEdit'      // event.append, project mutations
  | 'lockAcquire'      // POST /api/locks/:id, /extend, DELETE /api/locks/:id
  ;

export interface AuthzActor {
  /** Stable user identifier.  v0 reads from WS query / HTTP header.
   *  Phase 3C: derived from JWT `sub` claim. */
  readonly id: string;
  /** Optional roles — populated by Phase 3C JWT extraction. */
  readonly roles?: readonly string[];
}

export interface AuthzContext {
  readonly actor: AuthzActor;
  readonly projectId: string;
  /** Optional element id for fine-grained future policies (e.g. element-
   *  level read locks).  Unused in v0. */
  readonly elementId?: string;
}

export interface Authz {
  /** Returns true if `actor` may perform `action` on the resource described
   *  by `ctx`.  Implementations MUST be side-effect-free and fast — handlers
   *  call this in the hot path. */
  can(action: AuthzAction, ctx: AuthzContext): Promise<boolean>;
}

/** Anonymous-actor literal — exported so handlers can detect "no userId
 *  was supplied" without string-comparing magic strings inline. */
export const ANONYMOUS_USER_ID = 'anonymous';
