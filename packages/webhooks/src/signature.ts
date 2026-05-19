/**
 * @pryzm/webhooks — HMAC-SHA256 signing scheme.
 *
 * Wire format follows Stripe's `Stripe-Signature` header convention so
 * receivers built for that ecosystem can verify our deliveries with
 * minimal adapter work.  The header value contains a timestamp and
 * one or more v1 signatures; multi-signature support is the rotation
 * primitive — when a secret is rotated we sign with both the old and
 * new secrets for a 24-hour overlap window (rotation handler is the
 * deployer's responsibility; this module exposes only the primitives).
 *
 * Header format (single signature):
 *   `t=<unix-ts-seconds>,v1=<hex-hmac-sha256>`
 *
 * Signed payload:
 *   `<unix-ts-seconds>.<raw-body>`
 *
 * Verification rejects signatures older than `toleranceSeconds`
 * (default 300 = 5 min) to defend against replay.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PRYZM_SIGNATURE_HEADER = 'pryzm-signature' as const;
export const PRYZM_SIGNATURE_VERSION = 'v1' as const;
export const DEFAULT_TOLERANCE_SECONDS = 300;

export interface SignOptions {
  /** Raw body string (the JSON we POST). */
  readonly body: string;
  /** Subscription secret (HMAC key). */
  readonly secret: string;
  /** Unix epoch SECONDS for the signature. */
  readonly tsSeconds: number;
}

export interface VerifyOptions {
  /** Raw body string as received. */
  readonly body: string;
  /** Header value as received. */
  readonly header: string | null | undefined;
  /** Secret to verify against. */
  readonly secret: string;
  /** Maximum age of the signature in seconds. */
  readonly toleranceSeconds?: number;
  /** Current time for the verification (defaults to Date.now()/1000). */
  readonly nowSeconds?: number;
}

export interface VerifyResult {
  readonly valid: boolean;
  readonly reason?: 'malformed_header' | 'expired' | 'signature_mismatch';
}

/** Produce a `Pryzm-Signature` header value for `body`. */
export function signWebhook(opts: SignOptions): string {
  const ts = Math.floor(opts.tsSeconds);
  const signed = `${ts}.${opts.body}`;
  const sig = createHmac('sha256', opts.secret).update(signed, 'utf8').digest('hex');
  return `t=${ts},${PRYZM_SIGNATURE_VERSION}=${sig}`;
}

/** Verify a Pryzm-Signature header against `body` + `secret`. */
export function verifyWebhook(opts: VerifyOptions): VerifyResult {
  if (!opts.header || typeof opts.header !== 'string') {
    return { valid: false, reason: 'malformed_header' };
  }
  const parts = opts.header.split(',').map((p) => p.trim());
  let ts: number | undefined;
  const sigs: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) return { valid: false, reason: 'malformed_header' };
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 't') {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n)) return { valid: false, reason: 'malformed_header' };
      ts = n;
    } else if (key === PRYZM_SIGNATURE_VERSION) {
      sigs.push(value);
    }
  }
  if (ts === undefined || sigs.length === 0) {
    return { valid: false, reason: 'malformed_header' };
  }
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) {
    return { valid: false, reason: 'expired' };
  }
  const expected = createHmac('sha256', opts.secret)
    .update(`${ts}.${opts.body}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  for (const candidate of sigs) {
    let candBuf: Buffer;
    try {
      candBuf = Buffer.from(candidate, 'hex');
    } catch {
      continue;
    }
    if (candBuf.length !== expectedBuf.length) continue;
    if (timingSafeEqual(candBuf, expectedBuf)) {
      return { valid: true };
    }
  }
  return { valid: false, reason: 'signature_mismatch' };
}
