import { describe, it, expect } from 'vitest';
import {
  signWebhook,
  verifyWebhook,
  PRYZM_SIGNATURE_VERSION,
} from '../src/index.js';

describe('signWebhook()', () => {
  it('returns deterministic header for fixed body+secret+ts', () => {
    const a = signWebhook({ body: '{"k":1}', secret: 'shh', tsSeconds: 1700000000 });
    const b = signWebhook({ body: '{"k":1}', secret: 'shh', tsSeconds: 1700000000 });
    expect(a).toBe(b);
    expect(a.startsWith('t=1700000000,')).toBe(true);
    expect(a).toContain(`,${PRYZM_SIGNATURE_VERSION}=`);
  });

  it('produces a different sig for a different body', () => {
    const a = signWebhook({ body: '{"k":1}', secret: 'shh', tsSeconds: 1700000000 });
    const b = signWebhook({ body: '{"k":2}', secret: 'shh', tsSeconds: 1700000000 });
    expect(a).not.toBe(b);
  });

  it('produces a different sig for a different secret', () => {
    const a = signWebhook({ body: '{"k":1}', secret: 'A', tsSeconds: 1700000000 });
    const b = signWebhook({ body: '{"k":1}', secret: 'B', tsSeconds: 1700000000 });
    expect(a).not.toBe(b);
  });
});

describe('verifyWebhook()', () => {
  it('valid against the same body+secret+ts', () => {
    const body = '{"x":42}';
    const header = signWebhook({ body, secret: 'shh', tsSeconds: 1700000000 });
    const r = verifyWebhook({ body, header, secret: 'shh', nowSeconds: 1700000050 });
    expect(r.valid).toBe(true);
  });

  it('rejects null/empty header as malformed', () => {
    expect(verifyWebhook({ body: '', header: null, secret: 's' }).reason).toBe('malformed_header');
    expect(verifyWebhook({ body: '', header: '', secret: 's' }).reason).toBe('malformed_header');
  });

  it('rejects header without ts as malformed', () => {
    const r = verifyWebhook({ body: 'x', header: 'v1=abc', secret: 's', nowSeconds: 0 });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('malformed_header');
  });

  it('rejects header without v1 sig as malformed', () => {
    const r = verifyWebhook({ body: 'x', header: 't=1700000000', secret: 's', nowSeconds: 1700000000 });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('malformed_header');
  });

  it('rejects expired signature beyond tolerance window', () => {
    const body = 'p';
    const header = signWebhook({ body, secret: 's', tsSeconds: 1700000000 });
    const r = verifyWebhook({
      body,
      header,
      secret: 's',
      nowSeconds: 1700000000 + 600, // 10 min later, default 5-min tolerance
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('expired');
  });

  it('rejects mismatched secret', () => {
    const body = 'p';
    const header = signWebhook({ body, secret: 'A', tsSeconds: 1700000000 });
    const r = verifyWebhook({ body, header, secret: 'B', nowSeconds: 1700000050 });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature_mismatch');
  });

  it('accepts when one of multiple v1 signatures matches (rotation overlap)', () => {
    const body = 'p';
    const sigA = signWebhook({ body, secret: 'OLD', tsSeconds: 1700000000 });
    // Combine sigs from two secrets into one header (rotation overlap).
    const sigBhex = sigA.split(',v1=')[1]; // OLD signature
    const sigB = signWebhook({ body, secret: 'NEW', tsSeconds: 1700000000 });
    const sigBhexNew = sigB.split(',v1=')[1];
    const combined = `t=1700000000,v1=${sigBhex},v1=${sigBhexNew}`;
    const r = verifyWebhook({ body, header: combined, secret: 'NEW', nowSeconds: 1700000050 });
    expect(r.valid).toBe(true);
  });

  it('respects custom toleranceSeconds', () => {
    const body = 'p';
    const header = signWebhook({ body, secret: 's', tsSeconds: 1700000000 });
    const r = verifyWebhook({
      body,
      header,
      secret: 's',
      nowSeconds: 1700000000 + 60,
      toleranceSeconds: 30,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('expired');
  });
});
