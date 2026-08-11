// apps/sync-server/src/auth/signSessionToken.ts — HS256 minting, for TEST AND
// HARNESS USE.
//
// ⚠ THE SYNC SERVER DOES NOT MINT SESSIONS IN PRODUCTION.  Session tokens are
// issued by the BFF (`server/authStore.js`, `jwt.sign({ sub, email },
// SESSION_SECRET, { expiresIn: '30d' })`) at sign-in.  This function exists so
// that:
//
//   • the WS-auth suite can produce a VALID token — a negative-only test proves
//     nothing about whether a real client can ever connect; and
//   • `tools/ga-gate/check-collab-graph-integrity.ts` can drive two real
//     y-websocket clients through the AUTHENTICATED path rather than around it.
//
// It deliberately produces the exact same wire format the BFF produces, so the
// suite is testing the real token shape and not a convenient fiction.

import { createHmac } from 'node:crypto';

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface SignSessionTokenOptions {
  readonly sub: string;
  readonly email?: string;
  readonly secret: string;
  /** Seconds until expiry.  Negative values mint an ALREADY-EXPIRED token —
   *  which is how the expiry refusal is tested without sleeping. */
  readonly expiresInSeconds?: number;
  /** `nbf` offset in seconds from now.  Positive → not yet valid. */
  readonly notBeforeSeconds?: number;
  /** Override the header — used ONLY to mint the algorithm-confusion attack
   *  tokens (`alg: 'none'`, `alg: 'RS256'`) the gate must refuse. */
  readonly header?: Record<string, unknown>;
  /** Sign with a DIFFERENT secret than the one the server holds — the forged
   *  token case. */
  readonly signWith?: string;
  readonly nowMs?: number;
}

export function signSessionToken(opts: SignSessionTokenOptions): string {
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const header = opts.header ?? { alg: 'HS256', typ: 'JWT' };
  const payload: Record<string, unknown> = {
    sub: opts.sub,
    ...(opts.email ? { email: opts.email } : {}),
    iat: nowSec,
    exp: nowSec + (opts.expiresInSeconds ?? 3600),
    ...(opts.notBeforeSeconds !== undefined ? { nbf: nowSec + opts.notBeforeSeconds } : {}),
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', opts.signWith ?? opts.secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

/** Mint a token with NO `exp` claim at all — the "never expires" case the
 *  verifier must treat as expired rather than as valid-forever. */
export function signTokenWithoutExp(opts: {
  sub: string;
  secret: string;
}): string {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ sub: opts.sub, iat: Math.floor(Date.now() / 1000) }));
  const sig = createHmac('sha256', opts.secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}
