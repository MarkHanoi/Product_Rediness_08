// apps/sync-server/authz/policies.ts — env-driven Authz factory (W-03 / ADR-0040).
//
// `createAuthz({ env })` is the production entry point.  It reads
// `PRYZM_AUTHZ_MODE` (default `memory-allow-by-default`):
//
//   • `memory-allow-by-default` — MemoryAuthz with `allowByDefault: true`.
//                                 Beta default; logs every decision to the
//                                 audit pipeline.  Compatible with
//                                 PHASE-2D's "all invited beta users have
//                                 access" bootstrap, while making the
//                                 future flip to deny-default a one-line
//                                 env change.
//   • `memory-deny-anonymous` — MemoryAuthz with `denyAnonymous: true`.
//                               Useful for staging where the editor must
//                               always pass `userId`.
//   • `memory-deny`           — MemoryAuthz with `allowByDefault: false`.
//                               Strictest; every project must have an
//                               explicit `project_members` row.
//   • `pg`                    — PgAuthz against the LIVE `project_members`
//                               table (L-391 §4.1).  THE PRODUCTION MODE.
//                               See §PGAUTHZ-MODE-DEFAULT below.
//
// ─── §PGAUTHZ-MODE-DEFAULT — AN OPEN DECISION, NOT A CHANGE MADE HERE ───────
//
// The default below is STILL `memory-allow-by-default`. It has not been changed,
// deliberately: flipping the mode that arrives by omission is a behavioural
// change to every deployed and local instance at once, and it belongs to the
// founder, not to the commit that makes the alternative exist.
//
// **The recommendation, stated so it can be accepted or refused:**
//
//   The production default should become `pg`, and `pg` with no reachable
//   database should REFUSE — exactly as `createWsAuthGate` selects `deny-all`
//   when `SESSION_SECRET` is absent.
//
// The argument is about which way an OMISSION should fail. Today, forgetting to
// set `PRYZM_AUTHZ_MODE` yields `memory-allow-by-default`, and because
// `MemoryAuthz.addMember()` has no production caller, that is not "a permissive
// policy" — it is **no policy**: every signed-in user may enter every room they
// can name. A forgotten environment variable should never be the difference
// between an authorization system and none. Under the recommendation, the same
// omission yields a server that refuses everyone: visible in thirty seconds,
// fixed by setting `DATABASE_URL`, and it cannot leak a model in the meantime.
//
// Two consequences that make this a real decision rather than an obvious one,
// both of which argue for the founder making it rather than this file:
//
//   • It is a BREAKING change for any environment without `DATABASE_URL`
//     — local dev, and the CI harness. The mitigation is that both already have
//     an explicit, named escape (`PRYZM_AUTHZ_MODE=memory-allow-by-default`, or
//     `PRYZM_SYNC_WS_AUTH=trust-query`), so the permissive path stays reachable
//     BY NAME and never by omission. That is the same shape R-B chose for
//     `trust-query`, and it is the shape this proposal copies.
//   • `pg` is STRICTER than `memory-allow-by-default` in a way that will be
//     noticed: a `viewer` is refused `projectEdit`, and a user with no
//     membership row is refused a project they could previously join. That is
//     the point — but it means the staging cohort must actually have
//     `project_members` rows, which today they may not (nothing in the BFF's UI
//     is guaranteed to have written one for every collaborator).
//
// **Suggested sequence, each step reversible by one env var:**
//   1. leave the default; set `PRYZM_AUTHZ_MODE=pg` on staging explicitly;
//   2. confirm via `/health` → `authz.probe.ok === true` that the membership
//      table is readable, and that the known cohort can still join;
//   3. only then flip the default here to `pg`, in its own commit, with this
//      comment block updated to record the decision.
//
// Until step 3 happens this file is honest about which mode is in force, and
// `/health` reports the selection so it never has to be inferred from behaviour.

import { MemoryAuthz, type AuthzDecision } from './MemoryAuthz.js';
import { PgAuthz, type PgPoolLike } from './PgAuthz.js';
import type { Authz } from './Authz.js';

export type AuthzMode =
  | 'memory-allow-by-default'
  | 'memory-deny-anonymous'
  | 'memory-deny'
  | 'pg';

export interface CreateAuthzOptions {
  readonly env?: Record<string, string | undefined>;
  /** Test injection — override the env-driven selection. */
  readonly authz?: Authz;
  /** Audit sink for every decision — wired by the audit-log middleware
   *  in production; tests may pass a spy. */
  readonly onDecision?: (decision: AuthzDecision) => void;
  /** Test seam: a stub pool for `pg` mode, so the suite proves the policy
   *  without a live database (mirrors `createSoftLockStore`'s `pgPool`). */
  readonly pgPool?: PgPoolLike;
  /** Test seam: capture warnings instead of writing to the console. */
  readonly onWarn?: (message: string) => void;
}

export interface CreateAuthzResult {
  readonly authz: Authz;
  readonly selection: AuthzMode | 'injected';
  readonly reason: string;
}

export function createAuthz(opts: CreateAuthzOptions = {}): CreateAuthzResult {
  if (opts.authz) {
    return { authz: opts.authz, selection: 'injected', reason: 'opts.authz set (test injection)' };
  }
  const env = opts.env ?? process.env;
  const mode = (env.PRYZM_AUTHZ_MODE as AuthzMode | undefined) ?? 'memory-allow-by-default';

  switch (mode) {
    case 'pg': {
      // ── The pool, resolved fail-closed ─────────────────────────────────────
      //
      // `createAuthz` is SYNCHRONOUS and is called before `createWsAuthGate` in
      // `index.ts`, while importing `pg` is asynchronous. Rather than make the
      // factory async (which would ripple through every caller and every test),
      // `PgAuthz` accepts a THUNK: it starts resolution eagerly in its
      // constructor so a bad `DATABASE_URL` is warned about at startup, and
      // `can()` awaits the same memoised promise, so there is no window in which
      // "the pool has not resolved yet" means allow.
      //
      // Every failure below resolves to `undefined`, which `PgAuthz.evaluate()`
      // turns into `no-database-configured` — a REFUSAL. Note the contrast with
      // `createSoftLockStore`, which falls back to an in-memory store on the same
      // conditions: that is correct for locks (a lost lock is a merge conflict)
      // and would be catastrophic here (a lost membership check is an open door).
      const injected = opts.pgPool;
      const url = env.DATABASE_URL;
      const pool = injected
        ? injected
        : async (): Promise<PgPoolLike | undefined> => {
            if (!url) return undefined;
            const pgMod = (await import('pg')) as unknown as {
              default?: { Pool: new (cfg: { connectionString: string }) => PgPoolLike };
              Pool?: new (cfg: { connectionString: string }) => PgPoolLike;
            };
            const PoolCtor = pgMod.Pool ?? pgMod.default?.Pool;
            if (!PoolCtor) throw new Error('pg module exported neither `Pool` nor `default.Pool`');
            return new PoolCtor({ connectionString: url });
          };
      return {
        authz: new PgAuthz({
          pool,
          ...(opts.onDecision ? { onDecision: opts.onDecision } : {}),
          ...(opts.onWarn ? { onWarn: opts.onWarn } : {}),
        }),
        selection: 'pg',
        reason: injected
          ? 'PRYZM_AUTHZ_MODE=pg (pool injected by caller)'
          : url
            ? 'PRYZM_AUTHZ_MODE=pg — project_members via DATABASE_URL'
            : 'PRYZM_AUTHZ_MODE=pg but DATABASE_URL is unset — REFUSING every request (fail-closed)',
      };
    }
    case 'memory-deny':
      return {
        authz: new MemoryAuthz({ allowByDefault: false, onDecision: opts.onDecision }),
        selection: 'memory-deny',
        reason: 'PRYZM_AUTHZ_MODE=memory-deny',
      };
    case 'memory-deny-anonymous':
      return {
        authz: new MemoryAuthz({ allowByDefault: true, denyAnonymous: true, onDecision: opts.onDecision }),
        selection: 'memory-deny-anonymous',
        reason: 'PRYZM_AUTHZ_MODE=memory-deny-anonymous',
      };
    case 'memory-allow-by-default':
    default:
      return {
        authz: new MemoryAuthz({ allowByDefault: true, onDecision: opts.onDecision }),
        selection: 'memory-allow-by-default',
        reason: env.PRYZM_AUTHZ_MODE
          ? `PRYZM_AUTHZ_MODE=${env.PRYZM_AUTHZ_MODE}`
          : 'PRYZM_AUTHZ_MODE unset — beta default',
      };
  }
}
