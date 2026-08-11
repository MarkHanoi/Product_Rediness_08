// apps/sync-server/src/auth/verifySessionToken.ts — L-391 R-B.
//
// Verifies the SAME session token `server/authStore.js` mints:
//
//     jwt.sign({ sub: userId, email }, SESSION_SECRET, { expiresIn: '30d' })
//
// i.e. HS256 over `base64url(header).base64url(payload)`, shared-secret.  The
// sync server therefore needs no new identity system and no token exchange:
// deploying it means giving it the SAME `SESSION_SECRET` the BFF already has,
// and every already-signed-in browser presents a token it already holds.
//
// ─── WHY NOT `jsonwebtoken` ─────────────────────────────────────────────────
//
// `jsonwebtoken` is a dependency of the ROOT package, not of `@pryzm/sync-server`.
// Importing it from here would resolve at runtime (Node walks up to the root
// `node_modules`) while being a phantom dependency: it would break the moment
// this app is built or deployed as its own container — which is exactly the
// deployment R-C proposes.  Adding it to this manifest instead would require a
// `pnpm-lock.yaml` regeneration in a tree five agents are sharing.
//
// HS256 verification is an HMAC and a constant-time compare.  What makes
// hand-rolled JWT verification dangerous is never the HMAC — it is the three
// classic omissions, and each is a named refusal here, checked in this order:
//
//   1. ALGORITHM CONFUSION — `alg` is pinned to `HS256` and compared BEFORE the
//      signature.  `{"alg":"none"}` is `unsupported-algorithm`, never a pass.
//   2. NON-CONSTANT-TIME COMPARE — `crypto.timingSafeEqual`, on buffers whose
//      lengths are checked first (timingSafeEqual THROWS on a length mismatch).
//   3. UNCHECKED EXPIRY — `exp` is REQUIRED, not merely honoured-if-present.  A
//      token without `exp` is `expired-token`, because a never-expiring session
//      token on a collaboration socket is a worse outcome than a false refusal.
//
// Pure module: no env reads, no I/O, no logging.  The gate around it
// (`WsAuthGate.ts`) owns configuration and the authz decision.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WsAuthRefusalReason } from './refusals.js';

/** Clock-skew allowance for `exp` / `nbf`, in seconds. Matches the default
 *  `jsonwebtoken` tolerance philosophy: small, and stated rather than zero. */
export const CLOCK_SKEW_SECONDS = 60;

/** The claims this server consumes.  `sub` is the PRYZM user id. */
export interface SessionClaims {
  readonly sub: string;
  readonly email?: string;
  readonly exp: number;
  readonly iat?: number;
}

export type VerifyResult =
  | { readonly ok: true; readonly claims: SessionClaims }
  | { readonly ok: false; readonly reason: WsAuthRefusalReason };

function decodeSegment(segment: string): unknown {
  // Buffer's base64 decoder accepts base64url alphabet, but not the missing
  // padding on every platform — normalise both explicitly.
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Verify a PRYZM session JWT.
 *
 * @param token   the raw compact-serialisation token
 * @param secret  the shared `SESSION_SECRET`
 * @param nowMs   injectable clock — tests drive expiry deterministically
 *                rather than by sleeping
 */
export function verifySessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): VerifyResult {
  if (!token) return { ok: false, reason: 'missing-token' };
  if (!secret) return { ok: false, reason: 'server-misconfigured-no-session-secret' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed-token' };
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return { ok: false, reason: 'malformed-token' };
  }

  let header: unknown;
  let payload: unknown;
  try {
    header = decodeSegment(headerB64);
    payload = decodeSegment(payloadB64);
  } catch {
    return { ok: false, reason: 'malformed-token' };
  }
  if (!isRecord(header) || !isRecord(payload)) {
    return { ok: false, reason: 'malformed-token' };
  }

  // ── 1. Algorithm pinning, BEFORE any signature work. ─────────────────────
  // `alg: "none"`, `alg: "RS256"` (the classic confusion: verify an RSA-signed
  // token with the public key used as an HMAC secret), and a missing `alg` all
  // land here.  There is exactly one accepted value.
  if (header['alg'] !== 'HS256') {
    return { ok: false, reason: 'unsupported-algorithm' };
  }
  if (header['typ'] !== undefined && header['typ'] !== 'JWT') {
    return { ok: false, reason: 'malformed-token' };
  }

  // ── 2. Signature, constant-time. ─────────────────────────────────────────
  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  let presented: Buffer;
  try {
    const b64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    presented = Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64');
  } catch {
    return { ok: false, reason: 'malformed-token' };
  }
  // timingSafeEqual throws on unequal lengths — the length check is not an
  // early-exit optimisation, it is required to call it at all.  Signature
  // LENGTH is not a secret (it is always 32 bytes for HS256).
  if (presented.length !== expected.length) {
    return { ok: false, reason: 'bad-signature' };
  }
  if (!timingSafeEqual(presented, expected)) {
    return { ok: false, reason: 'bad-signature' };
  }

  // ── 3. Temporal validity. `exp` is REQUIRED. ─────────────────────────────
  const nowSec = Math.floor(nowMs / 1000);
  const exp = payload['exp'];
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return { ok: false, reason: 'expired-token' };
  }
  if (nowSec > exp + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'expired-token' };
  }
  const nbf = payload['nbf'];
  if (typeof nbf === 'number' && Number.isFinite(nbf) && nowSec + CLOCK_SKEW_SECONDS < nbf) {
    return { ok: false, reason: 'token-not-yet-valid' };
  }

  // ── 4. Subject. ──────────────────────────────────────────────────────────
  const sub = payload['sub'];
  if (typeof sub !== 'string' || sub.trim() === '') {
    return { ok: false, reason: 'missing-subject' };
  }

  const email = payload['email'];
  const iat = payload['iat'];
  return {
    ok: true,
    claims: {
      sub,
      ...(typeof email === 'string' ? { email } : {}),
      exp,
      ...(typeof iat === 'number' ? { iat } : {}),
    },
  };
}
