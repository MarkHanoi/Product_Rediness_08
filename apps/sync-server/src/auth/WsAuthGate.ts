// apps/sync-server/src/auth/WsAuthGate.ts — L-391 R-B: auth on the WebSocket
// upgrade.  This is the code-side blocker named in the L-391 ratification table
// and in BIM30-CONTINUITY-DELIVERABLE §A A-3.
//
// ─── WHAT WAS THERE BEFORE ──────────────────────────────────────────────────
//
// `src/index.ts` upgraded EVERY socket.  On `/sync` it read `userId` straight
// out of the query string and believed it; on `/${room}` it called
// `setupYjsConnection` with no identity at all.  Two distinct holes:
//
//   • ANONYMOUS ACCESS — anyone who knew (or guessed) a room name got a live
//     bidirectional CRDT feed of that project's model.
//   • IMPERSONATION — `?userId=someone-else` was the entire authentication
//     story on the legacy path, and `Authz.can()` downstream faithfully
//     evaluated the membership of whoever the caller *claimed* to be.
//
// ─── THE MODEL ──────────────────────────────────────────────────────────────
//
// Identity comes from the SAME HS256 session JWT `server/authStore.js` already
// mints (see `verifySessionToken.ts`).  The gate:
//
//   1. extracts the token — `?token=` (what `websocketProviderFactory.ts`
//      already sends, because a browser cannot set headers on a WebSocket) or
//      `Authorization: Bearer` (node clients, curl, the gate harness);
//   2. verifies it — pinned algorithm, constant-time signature, required `exp`;
//   3. derives the actor from the token's `sub`, NEVER from the query string;
//   4. asks the existing `Authz` boundary (ADR-0040) whether that actor may
//      touch this project — so membership policy stays in ONE place and the
//      future `pg-jwt` mode swaps underneath without touching this file.
//
// Anything that fails returns a NAMED refusal (`refusals.ts`), which the caller
// writes onto the socket as a real HTTP status.  There is no path through this
// module that returns "no" without a reason, and no path that returns "yes"
// without a verified subject — except `trust-query`, which must be asked for by
// name (below).
//
// ─── FAIL-CLOSED SELECTION ──────────────────────────────────────────────────
//
//   jwt-hs256    SESSION_SECRET is set → verify.  THE DEPLOY PATH.
//   deny-all     SESSION_SECRET is absent → refuse everything with
//                `server-misconfigured-no-session-secret`.  A server that
//                cannot check credentials must not accept connections; the
//                v0 behaviour (accept everything) is the failure this closes.
//   trust-query  the pre-R-B behaviour, reachable ONLY via an explicit
//                `PRYZM_SYNC_WS_AUTH=trust-query`.  It is never a default, it
//                never appears by omission, and it logs a warning naming
//                itself on every startup.  It exists so a local two-browser
//                experiment does not require minting tokens by hand.
//
// P8: `authenticate()` runs inside a span carrying the outcome and reason.

import { trace } from '@opentelemetry/api';
import type { Authz, AuthzAction } from '../authz/index.js';
import type { WsAuthRefusalReason } from './refusals.js';
import { verifySessionToken, type SessionClaims } from './verifySessionToken.js';

const tracer = trace.getTracer('pryzm.sync-server.ws-auth');

export type WsAuthMode = 'jwt-hs256' | 'deny-all' | 'trust-query';

/** Anonymous identity used by `trust-query` when no userId is supplied. */
const TRUST_QUERY_ANONYMOUS = 'anonymous';

export interface WsAuthPrincipal {
  /** Authoritative user id.  In `jwt-hs256` this is the token's `sub` and
   *  CANNOT be influenced by the query string. */
  readonly userId: string;
  readonly email?: string;
  /** How this principal was established — carried into logs/spans so an
   *  audit can tell a verified session from a trusted query param. */
  readonly via: WsAuthMode;
}

export type WsAuthResult =
  | { readonly ok: true; readonly principal: WsAuthPrincipal }
  | { readonly ok: false; readonly reason: WsAuthRefusalReason };

export interface WsAuthRequestLike {
  readonly url?: string | undefined;
  readonly headers: Record<string, string | string[] | undefined>;
}

export interface WsAuthGate {
  readonly mode: WsAuthMode;
  readonly reason: string;
  /**
   * Decide an upgrade.
   *
   * @param req      the raw upgrade request (url + headers)
   * @param action   which authz action this socket implies — the y-room path
   *                 is bidirectional and therefore `projectEdit`
   * @param projectId the project the socket will touch, or `undefined` for the
   *                 legacy `/sync` path where the project is chosen later, per
   *                 message, by handlers that already call `authz.can`
   */
  authenticate(
    req: WsAuthRequestLike,
    action: AuthzAction,
    projectId: string | undefined,
  ): Promise<WsAuthResult>;
}

export interface CreateWsAuthGateOptions {
  readonly env?: Record<string, string | undefined>;
  readonly authz: Authz;
  /** Test seam: overrides `env.SESSION_SECRET`. */
  readonly secret?: string;
  /** Test seam: injectable clock so expiry is asserted, not slept through. */
  readonly now?: () => number;
  /** Test seam: silence the startup warning. */
  readonly onWarn?: (message: string) => void;
}

export interface CreateWsAuthGateResult {
  readonly gate: WsAuthGate;
  readonly mode: WsAuthMode;
  readonly reason: string;
}

/**
 * `${projectId}` or `${projectId}:${levelId}` (ADR-049 §4.4) → projectId.
 * Exported because the gate harness and the upgrade handler must agree on it.
 */
export function projectIdFromRoom(room: string): string {
  const colon = room.indexOf(':');
  return colon === -1 ? room : room.slice(0, colon);
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/** Token from `?token=` or `Authorization: Bearer …`.  Query first, because
 *  that is the only channel a browser WebSocket has. */
export function extractToken(req: WsAuthRequestLike): string | undefined {
  try {
    const url = new URL(req.url ?? '/', 'http://sync.local');
    const q = url.searchParams.get('token');
    if (q) return q;
  } catch {
    /* fall through to the header — a malformed URL is not a token failure */
  }
  const auth = headerValue(req.headers, 'authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return undefined;
}

export function createWsAuthGate(opts: CreateWsAuthGateOptions): CreateWsAuthGateResult {
  const env = opts.env ?? process.env;
  const now = opts.now ?? (() => Date.now());
  const warn = opts.onWarn ?? ((m: string) => console.warn(m));
  const secret = opts.secret ?? env['SESSION_SECRET'] ?? '';
  const requested = env['PRYZM_SYNC_WS_AUTH'];

  let mode: WsAuthMode;
  let reason: string;

  if (requested === 'trust-query') {
    mode = 'trust-query';
    reason = 'PRYZM_SYNC_WS_AUTH=trust-query — EXPLICIT opt-out of upgrade auth';
    warn(
      '[sync-server] ⚠ PRYZM_SYNC_WS_AUTH=trust-query — WebSocket upgrades are ' +
        'NOT authenticated. Every room is world-readable and world-writable to ' +
        'anyone who can reach this port. Local development only.',
    );
  } else if (secret) {
    mode = 'jwt-hs256';
    reason = requested
      ? `PRYZM_SYNC_WS_AUTH=${requested} with SESSION_SECRET present`
      : 'SESSION_SECRET present — HS256 session tokens verified on upgrade';
  } else {
    mode = 'deny-all';
    reason =
      'SESSION_SECRET is not set and PRYZM_SYNC_WS_AUTH did not opt out — ' +
      'refusing every upgrade (fail-closed)';
    warn(
      '[sync-server] ⚠ SESSION_SECRET is not set. Every WebSocket upgrade will be ' +
        'refused with `server-misconfigured-no-session-secret`. Set SESSION_SECRET ' +
        '(the SAME value the BFF uses) or, for local work only, ' +
        'PRYZM_SYNC_WS_AUTH=trust-query.',
    );
  }

  const gate: WsAuthGate = {
    mode,
    reason,
    async authenticate(req, action, projectId): Promise<WsAuthResult> {
      const span = tracer.startSpan('pryzm.sync.ws.authenticate', {
        attributes: {
          'pryzm.ws.auth.mode': mode,
          'pryzm.ws.auth.action': action,
          ...(projectId ? { 'pryzm.ws.auth.project': projectId } : {}),
        },
      });
      const refuse = (r: WsAuthRefusalReason): WsAuthResult => {
        span.setAttribute('pryzm.ws.auth.outcome', 'refused');
        span.setAttribute('pryzm.ws.auth.reason', r);
        span.end();
        return { ok: false, reason: r };
      };
      try {
        if (mode === 'deny-all') return refuse('server-misconfigured-no-session-secret');

        let principal: WsAuthPrincipal;
        if (mode === 'trust-query') {
          let claimed = TRUST_QUERY_ANONYMOUS;
          try {
            claimed =
              new URL(req.url ?? '/', 'http://sync.local').searchParams.get('userId') ??
              TRUST_QUERY_ANONYMOUS;
          } catch { /* keep anonymous */ }
          principal = { userId: claimed, via: 'trust-query' };
        } else {
          const token = extractToken(req);
          if (!token) return refuse('missing-token');
          const verdict = verifySessionToken(token, secret, now());
          if (!verdict.ok) return refuse(verdict.reason);
          const claims: SessionClaims = verdict.claims;
          principal = {
            userId: claims.sub,
            ...(claims.email ? { email: claims.email } : {}),
            via: 'jwt-hs256',
          };
        }

        // Authorisation is a SEPARATE question from authentication, and it is
        // asked of the existing boundary rather than re-decided here.
        if (projectId !== undefined) {
          if (projectId === '') return refuse('missing-room');
          const allowed = await opts.authz.can(action, {
            actor: { id: principal.userId },
            projectId,
          });
          if (!allowed) return refuse('not-a-project-member');
        }

        span.setAttribute('pryzm.ws.auth.outcome', 'allowed');
        span.setAttribute('pryzm.ws.auth.user', principal.userId);
        span.end();
        return { ok: true, principal };
      } catch (err) {
        // An exception must not become an ACCEPT.  Anything unexpected is a
        // refusal with the most conservative reason available.
        span.recordException(err as Error);
        return refuse('internal-error');
      }
    },
  };

  return { gate, mode, reason };
}
