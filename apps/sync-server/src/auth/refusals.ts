// apps/sync-server/src/auth/refusals.ts — L-391 R-B: the named refusal vocabulary
// for a WebSocket upgrade that is NOT allowed to proceed.
//
// ─── WHY A TYPED UNION AND NOT A BOOLEAN ────────────────────────────────────
//
// C58 §1.13 / the refusal-identity idiom: a refusal that cannot say WHY is
// indistinguishable from a bug, and — worse for this particular surface — an
// unauthenticated upgrade that is *dropped* is indistinguishable from an
// unauthenticated upgrade that was *accepted and then went quiet*.  Both look
// like "the socket didn't work" from the client, and neither looks like
// anything at all from the server.
//
// So every refusal on the upgrade path is one of the members below, it is
// written into the HTTP response line, it is echoed in the
// `X-Pryzm-Sync-Refusal` header (machine-readable, and readable by a test
// that must prove the REFUSAL happened rather than a timeout), and it is
// carried in a JSON body for a human reading a curl.
//
// P8: the caller wraps the decision in a span; this module is pure.

/**
 * Every reason a sync WebSocket upgrade may be refused.
 *
 * Closed union on purpose: adding a refusal path forces a member here, and
 * `WS_AUTH_REFUSAL_STATUS` below forces a status code decision with it.
 */
export type WsAuthRefusalReason =
  // ── Configuration faults (the SERVER is wrong, not the client) ────────────
  /** No `SESSION_SECRET` and no explicit opt-out — the server cannot verify
   *  anything, so it refuses everything.  Fail-closed: see WsAuthGate. */
  | 'server-misconfigured-no-session-secret'
  // ── Token presentation ────────────────────────────────────────────────────
  /** No `?token=` query parameter and no `Authorization: Bearer` header. */
  | 'missing-token'
  /** Not three base64url segments, or a segment that is not valid JSON. */
  | 'malformed-token'
  // ── Token contents ────────────────────────────────────────────────────────
  /** `alg` is anything other than `HS256` — including `none`.  This is the
   *  algorithm-confusion refusal and it is checked BEFORE the signature. */
  | 'unsupported-algorithm'
  /** HMAC mismatch: forged, tampered, or signed with a different secret. */
  | 'bad-signature'
  /** `exp` absent, non-numeric, or in the past (beyond the skew allowance). */
  | 'expired-token'
  /** `nbf` present and in the future (beyond the skew allowance). */
  | 'token-not-yet-valid'
  /** No usable `sub` claim — there is no actor to authorise. */
  | 'missing-subject'
  // ── Routing / authorisation ───────────────────────────────────────────────
  /** The upgrade named no room (empty path) — nothing to authorise against. */
  | 'missing-room'
  /** Verified actor, but `Authz.can()` said no for this project. */
  | 'not-a-project-member'
  /** An unexpected throw anywhere in the decision.  Present so that an
   *  exception can never fall through into an ACCEPT, and so that "the authz
   *  backend threw" is not reported as "your signature was bad". */
  | 'internal-error';

/** HTTP status for each refusal.  401 = "you did not prove who you are";
 *  403 = "you did, and the answer is still no"; 500 = the server is broken. */
export const WS_AUTH_REFUSAL_STATUS: Readonly<Record<WsAuthRefusalReason, number>> = {
  'server-misconfigured-no-session-secret': 500,
  'missing-token': 401,
  'malformed-token': 401,
  'unsupported-algorithm': 401,
  'bad-signature': 401,
  'expired-token': 401,
  'token-not-yet-valid': 401,
  'missing-subject': 401,
  'missing-room': 400,
  'not-a-project-member': 403,
  'internal-error': 500,
};

const STATUS_TEXT: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  500: 'Internal Server Error',
};

/** The response header carrying the machine-readable reason.  A test asserts
 *  on THIS, so "refused" and "the connection went nowhere" are different
 *  observations. */
export const REFUSAL_HEADER = 'X-Pryzm-Sync-Refusal';

/**
 * Minimal socket surface needed to write a pre-upgrade refusal.  Typed
 * structurally so this module needs neither `node:net` nor `ws`.
 */
export interface RefusableSocket {
  write(data: string): unknown;
  destroy(): unknown;
}

/**
 * Refuse an upgrade BEFORE `wss.handleUpgrade`, with the reason on the wire.
 *
 * Deliberately not `socket.destroy()` alone: a bare destroy is the "silently
 * dropped" behaviour this whole module exists to make impossible.  The client
 * gets a real HTTP status, a named reason header, and a JSON body.
 */
export function refuseUpgrade(socket: RefusableSocket, reason: WsAuthRefusalReason): void {
  const status = WS_AUTH_REFUSAL_STATUS[reason];
  const text = STATUS_TEXT[status] ?? 'Error';
  const body = JSON.stringify({ error: 'sync-upgrade-refused', reason });
  socket.write(
    `HTTP/1.1 ${status} ${text}\r\n` +
      `${REFUSAL_HEADER}: ${reason}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n' +
      '\r\n' +
      body,
  );
  socket.destroy();
}
