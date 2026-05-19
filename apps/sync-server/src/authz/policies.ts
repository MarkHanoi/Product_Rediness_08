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
//
// Phase 3C will add a `pg-jwt` mode that decodes the JWT, matches `sub`
// against `project_members`, and respects role hints.

import { MemoryAuthz, type AuthzDecision } from './MemoryAuthz.js';
import type { Authz } from './Authz.js';

export type AuthzMode =
  | 'memory-allow-by-default'
  | 'memory-deny-anonymous'
  | 'memory-deny';

export interface CreateAuthzOptions {
  readonly env?: Record<string, string | undefined>;
  /** Test injection — override the env-driven selection. */
  readonly authz?: Authz;
  /** Audit sink for every decision — wired by the audit-log middleware
   *  in production; tests may pass a spy. */
  readonly onDecision?: (decision: AuthzDecision) => void;
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
