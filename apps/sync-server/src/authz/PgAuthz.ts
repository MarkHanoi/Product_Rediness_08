// apps/sync-server/src/authz/PgAuthz.ts — L-391 §4.1: the production authz
// implementation named in `MemoryAuthz.ts:5` and deferred since "Phase 3C".
//
// ─── WHAT WAS THERE BEFORE ──────────────────────────────────────────────────
//
// Nothing. `MemoryAuthz.addMember()` has ZERO production callers — every call
// site in the repo is a test. `project-members.sql` shipped as DDL that nothing
// hydrates from. `policies.ts` defaults to `memory-allow-by-default`. Composed,
// those three facts mean: **any signed-in user who can name a room joins it.**
// `WsAuthGate` closed authentication and faithfully asked `Authz.can()`, which
// faithfully answered `true` for everyone. The gate was real; the policy behind
// it was a stub.
//
// ─── §PGAUTHZ-SOURCE-OF-TRUTH — THE TABLE ALREADY EXISTS, AND NOT THE ONE HERE
//
// The important discovery of this change: there are **TWO** `project_members`
// DDLs in this repo and they are NOT the same table.
//
//   A. `server/dbMigrate.js:120` — the LIVE one. Created on BFF startup against
//      the real `DATABASE_URL`. Columns: id, project_id, user_id, role,
//      invited_by, invited_at, accepted_at; UNIQUE(project_id, user_id); FKs to
//      `projects` and `pryzm_users`.
//   B. `apps/sync-server/src/authz/project-members.sql` — a Phase-2 sketch.
//      PK(project_id, user_id), `created_at`, and `role DEFAULT 'editor'`.
//
// The sync server points at the SAME `DATABASE_URL` as the BFF (that is what
// `SYNC_EVENT_LOG=pg` already means). Because both DDLs are `CREATE TABLE IF NOT
// EXISTS` and the BFF migrates first, **A always wins and B is a silent no-op.**
// Writing this class against B would have produced a class that typechecks,
// unit-tests green against a stub pool, and refuses every real user in
// production — because B's `role DEFAULT 'editor'` is not a role the live
// permission matrix recognises.
//
// So this queries **A**, and `project-members.sql` has been re-headed to say so.
//
// ─── §PGAUTHZ-OWNER-IS-NOT-A-MEMBER-ROW ─────────────────────────────────────
//
// The second trap, and the one that would have been a production outage:
// `projects.owner_id` is the ownership record and **the owner does NOT get a
// `project_members` row.** A membership-only query locks every user out of the
// project they created. `server/projectAccess.js:183` already solved this with a
// single-round-trip LEFT JOIN; this class uses the SAME query shape deliberately,
// so the sync server and the BFF cannot disagree about who may enter a room.
//
// ─── FAIL-CLOSED, IN THE `WsAuthGate` IDIOM ─────────────────────────────────
//
// `WsAuthGate` selects `deny-all` when it cannot verify credentials, on the
// principle that a server which cannot check must not accept. The same rule
// governs every exit from this class:
//
//   no pool configured   → DENY `no-database-configured`
//   pool failed to load  → DENY `database-unavailable`
//   query threw          → DENY `database-error`
//   project row missing  → DENY `no-such-project`
//   no membership row    → DENY `not-a-member`
//   role not in matrix   → DENY `unknown-role`
//   role lacks action    → DENY `role-not-permitted`
//
// There is NO path through `can()` that returns `true` without a row read from
// Postgres naming this actor. An authorization layer that opens under failure is
// worse than none, because it is trusted: `not-a-member` and `database-error`
// are DIFFERENT VALUES here and both are `false`.
//
// This distinction survives to the wire: `WsAuthGate` maps a `false` from this
// class to `not-a-project-member` → **403**, which stays separate from the
// **401** family (`missing-token`, `bad-signature`, …). Authentication failure
// and authorization failure remain two different bug reports.
//
// P8: every decision runs inside a span carrying outcome + reason.

import { trace } from '@opentelemetry/api';
import type { Authz, AuthzAction, AuthzContext } from './Authz.js';
import { ANONYMOUS_USER_ID } from './Authz.js';
import type { AuthzDecision } from './MemoryAuthz.js';

const tracer = trace.getTracer('pryzm.sync-server.authz.pg');

/** Structural subset of `pg.Pool` — mirrors `PgSoftLockStore`'s seam so tests
 *  need a stub, not a database. */
export interface PgPoolLike {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end?(): Promise<void>;
}

/** Named refusal reasons.  Exhaustive by construction: `evaluate()` returns one
 *  of these or `owner` / `member`, and never a bare boolean. */
export type PgAuthzReason =
  | 'owner'
  | 'member'
  | 'anonymous-denied'
  | 'no-database-configured'
  | 'database-unavailable'
  | 'database-error'
  | 'no-such-project'
  | 'not-a-member'
  | 'unknown-role'
  | 'role-not-permitted';

// ─── §PGAUTHZ-ROLE-MATRIX-MIRROR ────────────────────────────────────────────
//
// This is a MIRROR of `server/permissions.js`, not an import, and the reason is
// structural rather than stylistic: `apps/sync-server/Dockerfile` copies
// `packages/`, `tools/`, `plugins/`, `apps/` and nothing else. **`server/` is not
// in the sync-server image.** An import would resolve in the repo, pass
// typecheck, pass tests, and throw MODULE_NOT_FOUND on the first request in
// production — the exact class of defect this file exists to remove.
//
// A mirror can drift, so the drift is TESTED rather than hoped for:
// `__tests__/PgAuthz.test.ts` reads `server/permissions.js` off disk and asserts
// `ROLES` and the `edit_model` set match these constants. If someone adds a
// sixth ISO 19650 role to the BFF, that test fails here.
const ISO_19650_ROLES = Object.freeze([
  'appointing_party',
  'lead_appointed',
  'team_manager',
  'team_member',
  'viewer',
] as const);

// ─── §PGAUTHZ-ACTION-GRANULARITY — PROVEN for edit, UNPROVEN below that ──────
//
// The brief said: do not invent a column. None is invented. `role` is a real,
// populated, NOT NULL column on the live table, and `server/permissions.js` is a
// real, live role→action matrix — so per-action granularity is honestly
// expressible AT ROLE GRANULARITY, and is implemented:
//
//   projectRead  — every valid ISO 19650 role reads.  This matches
//                  `projectAccess.js:90`: "all five ISO roles have read rights,
//                  so any valid membership admits".
//   projectEdit  — the `edit_model` set: team_member, team_manager,
//                  lead_appointed.  A `viewer` is now REFUSED an edit socket;
//                  under MemoryAuthz they were indistinguishable from an editor.
//   lockAcquire  — same set as `projectEdit`, deliberately. A soft lock is a
//                  precursor to an edit; granting it to a role that cannot edit
//                  is both meaningless and a denial-of-service surface (a viewer
//                  could lock every element in the model and never release it).
//
// ⚠ WHAT IS **UNPROVEN**, stated so nobody mistakes this for a finished
//   authorization model:
//
//   1. ELEMENT-LEVEL RIGHTS ARE UNPROVEN. `AuthzContext.elementId` exists and is
//      ignored here. `project_members` is keyed (project_id, user_id) and has no
//      element, discipline, or level dimension — there is no honest way to
//      answer "may this user edit THIS wall?" from it. Doing so needs a NEW
//      TABLE, not a new column: something like
//      `project_member_scopes(project_id, user_id, scope_kind, scope_id)`, plus
//      a decision about whether an absent scope row means all-elements or
//      no-elements. Until that exists, element granularity is not attempted.
//
//   2. STATE-SCOPED READ IS UNPROVEN. The matrix distinguishes `read_wip` /
//      `read_shared` / `read_published`, and a `viewer` may read Shared and
//      Published but NOT WIP. A CRDT room is live WIP by definition, so a strict
//      reading says a viewer should not receive a room socket at all. This class
//      admits them (read-only rooms do not exist yet — there is no server-side
//      write filter on a Y.Doc connection, so "viewer joins a room" and "viewer
//      can edit the room" are today the same thing at the transport). That makes
//      `projectRead` for a viewer a KNOWN OVERSHOOT, contained only by the fact
//      that `projectEdit` and `lockAcquire` refuse them at every other door.
//      Closing it needs a read-only Yjs connection mode — transport work, not a
//      schema change.
//
//   3. `accepted_at` IS DEAD SCHEMA — an invited-but-unaccepted user has a row
//      and is admitted. This is not an oversight and not a new one: it is the
//      BFF's existing, deliberate behaviour (`projectAccess.js:76-83`), tracked
//      as **L-806**. Gating on `accepted_at IS NOT NULL` here while the BFF does
//      not would make the sync server STRICTER than the app that invited the
//      user — they would be admitted to the project and refused the collaboration
//      socket, which is a worse bug than the one it fixes. When L-806 lands a
//      write path for the column, both gates flip together.
const EDIT_ROLES: readonly string[] = Object.freeze([
  'team_member',
  'team_manager',
  'lead_appointed',
]);

const READ_ROLES: readonly string[] = ISO_19650_ROLES;

/** Role→action, at the granularity the schema actually supports. */
function rolePermits(role: string, action: AuthzAction): boolean {
  switch (action) {
    case 'projectRead':
      return READ_ROLES.includes(role);
    case 'projectEdit':
    case 'lockAcquire':
      return EDIT_ROLES.includes(role);
    default: {
      // A new AuthzAction that nobody mapped must DENY, not fall through to
      // allow.  `server/permissions.js:86` takes the same position on an
      // unknown action key.
      const _exhaustive: never = action;
      void _exhaustive;
      return false;
    }
  }
}

/** Exported for the mirror-drift test — not for policy decisions. */
export const PG_AUTHZ_ROLE_MATRIX = Object.freeze({
  roles: ISO_19650_ROLES,
  editRoles: EDIT_ROLES,
  readRoles: READ_ROLES,
});

export interface PgAuthzOptions {
  /** A ready pool, or a thunk resolving one (the env path imports `pg`
   *  dynamically, which is async, while `createAuthz` is sync).  Resolving to
   *  `undefined` is a DENIAL, not a fallback. */
  readonly pool: PgPoolLike | (() => Promise<PgPoolLike | undefined>);
  /** Audit sink — same shape MemoryAuthz uses, so the audit pipeline does not
   *  branch on which implementation is installed. */
  readonly onDecision?: (decision: AuthzDecision) => void;
  /** Test seam: silence the connection-failure warning. */
  readonly onWarn?: (message: string) => void;
}

// ─── §PGAUTHZ-DOES-NOT-MIGRATE ──────────────────────────────────────────────
//
// This class NEVER issues DDL. `PgEventLog` creates its own tables; this one
// must not, for two reasons. (1) `project_members` is the BFF's table, with FKs
// to `projects` and `pryzm_users` — the sync server creating it would race the
// BFF's migration and could win, producing a table with no FKs that the BFF then
// skips via IF NOT EXISTS. (2) If the table is missing, the correct answer is a
// LOUD REFUSAL (`database-error`), not a silently-created empty table that
// refuses every user for a reason nobody can see. A missing membership table is
// a deployment fault and must look like one.
export class PgAuthz implements Authz {
  private readonly poolSource: PgPoolLike | (() => Promise<PgPoolLike | undefined>);
  private readonly onDecision: PgAuthzOptions['onDecision'];
  private readonly warn: (m: string) => void;
  /** Memoised so a thunk runs ONCE — `can()` is on the socket-upgrade hot path
   *  and must not re-import `pg` per request. */
  private resolved: Promise<PgPoolLike | undefined> | undefined;

  constructor(opts: PgAuthzOptions) {
    this.poolSource = opts.pool;
    this.onDecision = opts.onDecision;
    this.warn = opts.onWarn ?? ((m: string) => console.warn(m));
    // Kick resolution off eagerly so a broken DATABASE_URL surfaces at startup
    // rather than on the first user's upgrade — while `can()` still awaits the
    // SAME promise, so there is no window where an unresolved pool means allow.
    void this.pool().catch(() => undefined);
  }

  private pool(): Promise<PgPoolLike | undefined> {
    if (!this.resolved) {
      this.resolved =
        typeof this.poolSource === 'function'
          ? Promise.resolve(this.poolSource()).catch((err: unknown) => {
              this.warn(
                `[sync-server] PgAuthz could not obtain a Postgres pool (${
                  err instanceof Error ? err.message : String(err)
                }) — every authorization decision will REFUSE.`,
              );
              return undefined;
            })
          : Promise.resolve(this.poolSource);
    }
    return this.resolved;
  }

  async can(action: AuthzAction, ctx: AuthzContext): Promise<boolean> {
    const span = tracer.startSpan('pryzm.sync.authz.can', {
      attributes: {
        'pryzm.authz.impl': 'pg',
        'pryzm.authz.action': action,
        'pryzm.authz.project': ctx.projectId,
      },
    });
    const decision = await this.evaluate(action, ctx);
    span.setAttribute('pryzm.authz.outcome', decision.allowed ? 'allowed' : 'refused');
    span.setAttribute('pryzm.authz.reason', decision.reason);
    span.setAttribute('pryzm.authz.user', decision.actorId);
    span.end();
    this.onDecision?.(decision);
    return decision.allowed;
  }

  /** The whole policy, in one place, with every exit named. */
  private async evaluate(action: AuthzAction, ctx: AuthzContext): Promise<AuthzDecision> {
    const base = { action, actorId: ctx.actor.id, projectId: ctx.projectId };
    const deny = (reason: PgAuthzReason): AuthzDecision => ({ ...base, allowed: false, reason });
    const allow = (reason: PgAuthzReason): AuthzDecision => ({ ...base, allowed: true, reason });

    // An unauthenticated actor never reaches Postgres.  `WsAuthGate` in
    // `jwt-hs256` already guarantees a verified `sub`, but `trust-query` does
    // not, and this class must be correct behind BOTH.
    if (!ctx.actor.id || ctx.actor.id === ANONYMOUS_USER_ID) return deny('anonymous-denied');
    if (!ctx.projectId) return deny('no-such-project');

    const pool = await this.pool();
    if (!pool) return deny('no-database-configured');

    let rows: Record<string, unknown>[];
    try {
      // §PGAUTHZ-OWNER-IS-NOT-A-MEMBER-ROW — byte-for-byte the shape of
      // `server/projectAccess.js:183`. Ownership and membership in ONE round
      // trip; the LEFT JOIN is served by `idx_project_members_user_project
      // (user_id, project_id)` (L-788), so this is two index lookups on the
      // hottest authorization path in the service.
      const result = await pool.query(
        `SELECT p.owner_id, m.role
           FROM projects p
           LEFT JOIN project_members m
             ON m.project_id = p.id AND m.user_id = $2
          WHERE p.id = $1
          LIMIT 1`,
        [ctx.projectId, ctx.actor.id],
      );
      rows = result.rows;
    } catch (err) {
      // THE LOAD-BEARING CATCH.  A pool timeout, a dropped connection, a missing
      // table — none of them are evidence of membership, so none of them may
      // become an allow.  Named separately from `not-a-member` so an operator
      // reading the audit log can tell "the database is down" from "this user is
      // an outsider"; collapsing them would hide an outage inside a wall of
      // legitimate-looking 403s.
      this.warn(
        `[sync-server] PgAuthz query failed for project=${ctx.projectId} — REFUSING: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return deny('database-error');
    }

    const row = rows[0];
    // No project row at all.  Under `memory-allow-by-default` a room named for a
    // project that does not exist was created on demand and joined; here it is a
    // refusal, which also closes room-name probing as an enumeration oracle —
    // "does not exist" and "not yours" are the same 403 on the wire.
    if (!row) return deny('no-such-project');

    if (typeof row['owner_id'] === 'string' && row['owner_id'] === ctx.actor.id) {
      return allow('owner');
    }

    const role = row['role'];
    if (typeof role !== 'string' || role === '') return deny('not-a-member');
    // An unrecognised role is REFUSED, not guessed at — mirroring
    // `projectAccess.js:_validRole`.  This is also what catches the divergent
    // `role DEFAULT 'editor'` in the old `project-members.sql`: if that sketch
    // schema is ever the live one, every user is refused loudly instead of
    // silently admitted.
    if (!ISO_19650_ROLES.includes(role as (typeof ISO_19650_ROLES)[number])) {
      return deny('unknown-role');
    }
    if (!rolePermits(role, action)) return deny('role-not-permitted');

    // Reason string is `member`, identical to MemoryAuthz, so the audit
    // pipeline and its assertions do not branch on implementation.
    return allow('member');
  }

  /** Diagnostics for `/health`.  Deliberately does NOT report membership counts:
   *  this class holds no state, and a count would need a table scan on a
   *  liveness endpoint. */
  stats(): { selection: 'pg' } {
    return { selection: 'pg' };
  }

  /** Reachability probe for the deploy smoke test — answers "is the membership
   *  table readable from here?" WITHOUT authorizing anyone.  Returns a named
   *  reason on failure so a misconfigured deploy is diagnosable before a user
   *  hits it, rather than after. */
  async probe(): Promise<{ ok: boolean; reason: string }> {
    const pool = await this.pool();
    if (!pool) return { ok: false, reason: 'no-database-configured' };
    try {
      await pool.query('SELECT 1 FROM project_members LIMIT 1');
      return { ok: true, reason: 'project_members readable' };
    } catch (err) {
      return { ok: false, reason: `database-error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async close(): Promise<void> {
    const pool = await this.pool().catch(() => undefined);
    if (pool?.end) await pool.end();
  }
}
