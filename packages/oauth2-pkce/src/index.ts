/**
 * `@pryzm/oauth2-pkce` — PKCE (RFC 7636) helpers for the PRYZM Public API.
 *
 * Source authority:
 *   - RFC 7636 (Proof Key for Code Exchange by OAuth Public Clients)
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S63 D2-D3
 *   - ADR-0039 §A (S63 D1 reconciliation; this package is the D2-D3 follow-on)
 *
 * Why PKCE-only: the PRYZM Public API enforces OAuth2 PKCE for every
 * client. Per OAuth 2.1 (draft) PKCE is mandatory for public AND
 * confidential clients alike. The trade-off — confidential clients lose
 * nothing, since access-token TTL is short and refresh tokens rotate.
 *
 * This package is pure ESM Node-stdlib + WebCrypto; no external
 * dependencies. Runs in Node 20+ (where `crypto.webcrypto.getRandomValues`
 * + `subtle.digest` are stable) and any modern browser.
 */

// ──────────────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────────────

/**
 * The two PKCE challenge methods defined by RFC 7636 §4.2.
 * - `'S256'`: SHA-256 of the verifier, base64url-encoded.  REQUIRED to be
 *   supported by both clients and servers.  PRYZM rejects `'plain'`.
 * - `'plain'`: the verifier verbatim.  Listed for type completeness; this
 *   package never produces it (per RFC 7636 §7.2 + OAuth 2.1).
 */
export type PkceChallengeMethod = 'S256' | 'plain';

/** A generated PKCE pair ready to be carried through an authorization flow. */
export interface PkcePair {
  /** 43-128 char base64url string — the secret kept by the client. */
  readonly verifier: string;
  /** SHA-256 of `verifier`, base64url-encoded — sent on /authorize. */
  readonly challenge: string;
  /** Always `'S256'`; PRYZM does not support `'plain'`. */
  readonly method: 'S256';
}

/**
 * The successful response shape from the OAuth2 token endpoint
 * (RFC 6749 §5.1 + RFC 6750 bearer).  PRYZM always returns a refresh
 * token alongside the access token.
 */
export interface OAuthTokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope?: string;
}

/** The error response shape from the OAuth2 token endpoint (RFC 6749 §5.2). */
export interface OAuthTokenError {
  readonly error: string;
  readonly error_description?: string;
  readonly error_uri?: string;
}

/** Result discriminator for `exchangeCodeForToken` and `refreshAccessToken`. */
export type OAuthTokenResult =
  | { readonly ok: true;  readonly response: OAuthTokenResponse }
  | { readonly ok: false; readonly status: number; readonly error: OAuthTokenError };

// ──────────────────────────────────────────────────────────────────────
//  WebCrypto + base64url plumbing
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve a WebCrypto `Crypto` instance.  In Node 20+ this is
 * `crypto.webcrypto`; in browsers it is `globalThis.crypto`.  We
 * resolve at call-time (not module-load) so that this package can be
 * imported in environments where WebCrypto is polyfilled later.
 */
async function resolveCrypto(): Promise<Crypto> {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.subtle && typeof g.crypto.getRandomValues === 'function') return g.crypto;
  // Node fallback — `crypto.webcrypto` matches the browser Crypto interface.
  const nodeCrypto = await import('node:crypto');
  return (nodeCrypto.webcrypto as unknown as Crypto);
}

/**
 * Base64url-encode a byte sequence per RFC 4648 §5 (no padding, `-` for `+`,
 * `_` for `/`).  PKCE specifically requires the no-padding variant.
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  // Hot path: build a binary string and call btoa.  Works in Node 20 (global)
  // and all browsers.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = (typeof btoa === 'function')
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate `byteLength` cryptographically random bytes via WebCrypto.
 * Used for the PKCE code-verifier seed.
 */
export async function randomBytes(byteLength: number): Promise<Uint8Array> {
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > 1024) {
    throw new RangeError(`randomBytes: byteLength must be 1..1024, got ${byteLength}`);
  }
  const cr = await resolveCrypto();
  const out = new Uint8Array(byteLength);
  cr.getRandomValues(out);
  return out;
}

/** SHA-256 a byte sequence and return the digest. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const cr = await resolveCrypto();
  const buf = await cr.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return new Uint8Array(buf);
}

// ──────────────────────────────────────────────────────────────────────
//  PKCE generation + verification
// ──────────────────────────────────────────────────────────────────────

/**
 * RFC 7636 §4.1 — code-verifier alphabet.  43-128 chars from
 * `[A-Z] [a-z] [0-9] - . _ ~`.  Base64url of 32 random bytes yields 43
 * chars (the minimum) using exactly this alphabet, so we use that.
 */
const VERIFIER_ENTROPY_BYTES = 32;
const VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_REGEX = /^[A-Za-z0-9\-_]{43}$/; // SHA-256 → 32 bytes → 43 base64url chars

/**
 * Generate a PKCE code-verifier + S256 challenge pair.
 *
 * The verifier is 32 bytes of crypto-random entropy base64url-encoded
 * (43 chars), well above the RFC's 43-char minimum.  Store it in
 * `sessionStorage` (or your CLI's keychain-equivalent) and present it
 * back to the token endpoint at code-exchange time.
 */
export async function generatePkcePair(): Promise<PkcePair> {
  const seed = await randomBytes(VERIFIER_ENTROPY_BYTES);
  const verifier = base64UrlEncode(seed);
  const challenge = await deriveChallenge(verifier);
  return Object.freeze({ verifier, challenge, method: 'S256' as const });
}

/** Re-derive an S256 challenge from a verifier.  Used at verification time. */
export async function deriveChallenge(verifier: string): Promise<string> {
  if (!VERIFIER_REGEX.test(verifier)) {
    throw new TypeError(
      `deriveChallenge: verifier must match RFC 7636 §4.1 alphabet ([A-Za-z0-9\\-._~]{43,128}); got length ${verifier.length}`,
    );
  }
  const bytes = new TextEncoder().encode(verifier);
  const digest = await sha256(bytes);
  return base64UrlEncode(digest);
}

/**
 * Constant-time comparison of two strings.  Used for challenge
 * verification so that timing differences don't leak which prefix
 * matched.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify that `verifier` produces `challenge` under the S256 method.
 * Returns `false` on any mismatch — including a malformed verifier
 * (rather than throwing, which would let a caller use exception
 * presence as a side channel).
 */
export async function verifyChallenge(verifier: string, challenge: string): Promise<boolean> {
  if (!VERIFIER_REGEX.test(verifier)) return false;
  if (!CHALLENGE_REGEX.test(challenge)) return false;
  let derived: string;
  try { derived = await deriveChallenge(verifier); } catch { return false; }
  return constantTimeEquals(derived, challenge);
}

// ──────────────────────────────────────────────────────────────────────
//  Token-endpoint exchange (client-side helpers)
// ──────────────────────────────────────────────────────────────────────

export interface ExchangeCodeOptions {
  readonly tokenEndpoint: string;            // e.g. https://auth.pryzm.com/oauth/token
  readonly code: string;                      // received on the redirect
  readonly verifier: string;                  // saved before /authorize
  readonly redirectUri: string;
  readonly clientId: string;
  /** Optional fetch override (test injection). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * RFC 6749 §4.1.3 + RFC 7636 §4.5 — exchange an authorization code for
 * tokens, presenting the PKCE verifier.  Returns a discriminated result
 * so callers can distinguish wire success/failure cleanly without
 * try/catch.
 */
export async function exchangeCodeForToken(opts: ExchangeCodeOptions): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    code_verifier: opts.verifier,
  });
  return await postTokenEndpoint(opts.tokenEndpoint, body, opts.fetchImpl);
}

export interface RefreshTokenOptions {
  readonly tokenEndpoint: string;
  readonly refreshToken: string;
  readonly clientId: string;
  readonly fetchImpl?: typeof fetch;
}

/** RFC 6749 §6 — refresh-token rotation.  PRYZM rotates on every refresh. */
export async function refreshAccessToken(opts: RefreshTokenOptions): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
  });
  return await postTokenEndpoint(opts.tokenEndpoint, body, opts.fetchImpl);
}

async function postTokenEndpoint(
  tokenEndpoint: string,
  body: URLSearchParams,
  fetchImpl?: typeof fetch,
): Promise<OAuthTokenResult> {
  const f = fetchImpl ?? globalThis.fetch;
  if (typeof f !== 'function') {
    throw new Error('postTokenEndpoint: no fetch available — pass fetchImpl on Node < 18');
  }
  const resp = await f(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' },
    body: body.toString(),
  });
  let json: unknown;
  try { json = await resp.json(); } catch {
    return { ok: false, status: resp.status, error: { error: 'invalid_response', error_description: 'token endpoint returned non-JSON body' } };
  }
  if (resp.ok && typeof json === 'object' && json !== null && 'access_token' in (json as object)) {
    return { ok: true, response: json as OAuthTokenResponse };
  }
  if (typeof json === 'object' && json !== null && 'error' in (json as object)) {
    return { ok: false, status: resp.status, error: json as OAuthTokenError };
  }
  return { ok: false, status: resp.status, error: { error: 'invalid_response' } };
}
