import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  signPayload,
  verifyPayload,
  sha256OfBytes,
  makePluginSignature,
  verifyPluginSignature,
  RevocationList,
} from '../src/signing';
import { canonicalJSONStringify } from '../src/canonical-json';
import type { PluginManifest } from '../src/descriptor';

const M: PluginManifest = {
  pryzmPlugin: '1.0',
  id: 'sig-test',
  version: '1.2.3',
  displayName: 'Signing Test',
  description: 'fixture',
  author: 'tests',
  main: 'index.js',
  license: 'MIT',
  permissions: [],
  allowedOrigins: [],
  contributions: [],
  minPRYZMVersion: '2.0.0',
};

describe('canonicalJSONStringify — RFC 8785 simplified', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalJSONStringify({ b: 2, a: 1, c: 3 })).toBe('{"a":1,"b":2,"c":3}');
  });

  it('serialises arrays in order without sorting', () => {
    expect(canonicalJSONStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('omits undefined fields (consistent with JSON.stringify)', () => {
    expect(canonicalJSONStringify({ a: 1, b: undefined, c: 2 })).toBe('{"a":1,"c":2}');
  });

  it('produces identical output for objects that differ only in key order', () => {
    const a = canonicalJSONStringify({ x: { p: 1, q: 2 }, y: 3 });
    const b = canonicalJSONStringify({ y: 3, x: { q: 2, p: 1 } });
    expect(a).toBe(b);
  });

  it('throws on cycles', () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(() => canonicalJSONStringify(a)).toThrow(/cycle/);
  });

  it('throws on bigint', () => {
    expect(() => canonicalJSONStringify(BigInt(1))).toThrow(/bigint/);
  });

  it('throws on non-finite numbers', () => {
    expect(() => canonicalJSONStringify(NaN)).toThrow(/finite/);
    expect(() => canonicalJSONStringify(Infinity)).toThrow(/finite/);
  });
});

describe('Ed25519 sign / verify primitives', () => {
  it('generates a key pair with 32-byte raw keys (base64)', async () => {
    const kp = await generateKeyPair();
    // 32-byte raw key in base64 = 44 chars (with single = padding) or 43 (no pad);
    // node atob accepts both — be tolerant.
    const decode = (b64: string) => Buffer.from(b64, 'base64').length;
    expect(decode(kp.privateKeyB64)).toBe(32);
    expect(decode(kp.publicKeyB64)).toBe(32);
  });

  it('round-trip: sign then verify with matching public key', async () => {
    const kp = await generateKeyPair();
    const msg = new TextEncoder().encode('hello pryzm plugin');
    const sig = await signPayload(kp.privateKeyB64, msg);
    expect(await verifyPayload(kp.publicKeyB64, msg, sig)).toBe(true);
  });

  it('verify fails with a tampered message', async () => {
    const kp = await generateKeyPair();
    const msg = new TextEncoder().encode('hello');
    const sig = await signPayload(kp.privateKeyB64, msg);
    const tampered = new TextEncoder().encode('hellp');
    expect(await verifyPayload(kp.publicKeyB64, tampered, sig)).toBe(false);
  });

  it('verify fails with a different public key', async () => {
    const kp1 = await generateKeyPair();
    const kp2 = await generateKeyPair();
    const msg = new TextEncoder().encode('hello');
    const sig = await signPayload(kp1.privateKeyB64, msg);
    expect(await verifyPayload(kp2.publicKeyB64, msg, sig)).toBe(false);
  });

  it('sha256OfBytes produces the standard hex digest', async () => {
    const empty = await sha256OfBytes(new Uint8Array());
    expect(empty).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('makePluginSignature / verifyPluginSignature', () => {
  it('round-trip: sign manifest+hash, verify ok:true', async () => {
    const kp = await generateKeyPair();
    const fileSha256 = await sha256OfBytes(new TextEncoder().encode('fake-tarball-bytes'));
    const sig = await makePluginSignature({ manifest: M, fileSha256, publisherKey: kp });
    const result = await verifyPluginSignature(sig, { manifest: M, fileSha256 });
    expect(result.ok).toBe(true);
  });

  it('reject with manifest-mismatch when manifest field differs', async () => {
    const kp = await generateKeyPair();
    const fileSha256 = await sha256OfBytes(new TextEncoder().encode('x'));
    const sig = await makePluginSignature({ manifest: M, fileSha256, publisherKey: kp });
    const tamperedManifest: PluginManifest = { ...M, displayName: 'Different' };
    const result = await verifyPluginSignature(sig, { manifest: tamperedManifest, fileSha256 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('manifest-mismatch');
  });

  it('reject with tarball-mismatch when fileSha256 differs', async () => {
    const kp = await generateKeyPair();
    const sig = await makePluginSignature({ manifest: M, fileSha256: 'a'.repeat(64), publisherKey: kp });
    const result = await verifyPluginSignature(sig, { manifest: M, fileSha256: 'b'.repeat(64) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('tarball-mismatch');
  });

  it('reject with signature-invalid when signature bytes are corrupted', async () => {
    const kp = await generateKeyPair();
    const fileSha256 = await sha256OfBytes(new TextEncoder().encode('x'));
    const sig = await makePluginSignature({ manifest: M, fileSha256, publisherKey: kp });
    const corrupted = {
      ...sig,
      signatureB64: Buffer.from(new Uint8Array(64)).toString('base64'),
    };
    const result = await verifyPluginSignature(corrupted, { manifest: M, fileSha256 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signature-invalid');
  });
});

describe('RevocationList', () => {
  it('empty list — nothing revoked', () => {
    const r = new RevocationList();
    expect(r.isPublisherRevoked('xyz')).toBe(false);
    expect(r.isPluginRevoked('foo@1.0.0')).toBe(false);
    expect(r.size()).toEqual({ publishers: 0, plugins: 0 });
  });

  it('isPublisherRevoked / isPluginRevoked return true for matching entries', () => {
    const r = new RevocationList({
      revokedPublisherKeysB64: ['pubA'],
      revokedPluginIdAtVersion: ['evil@1.0.0'],
    });
    expect(r.isPublisherRevoked('pubA')).toBe(true);
    expect(r.isPublisherRevoked('pubB')).toBe(false);
    expect(r.isPluginRevoked('evil@1.0.0')).toBe(true);
    expect(r.isPluginRevoked('evil@1.0.1')).toBe(false);
  });

  it('verifyPluginSignature integrates the revocation list (publisher-revoked)', async () => {
    const kp = await generateKeyPair();
    const fileSha256 = await sha256OfBytes(new TextEncoder().encode('x'));
    const sig = await makePluginSignature({ manifest: M, fileSha256, publisherKey: kp });
    const revs = new RevocationList({ revokedPublisherKeysB64: [kp.publicKeyB64] });
    const result = await verifyPluginSignature(sig, { manifest: M, fileSha256 }, revs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('publisher-revoked');
  });

  it('verifyPluginSignature integrates the revocation list (plugin-revoked)', async () => {
    const kp = await generateKeyPair();
    const fileSha256 = await sha256OfBytes(new TextEncoder().encode('x'));
    const sig = await makePluginSignature({ manifest: M, fileSha256, publisherKey: kp });
    const revs = new RevocationList({
      revokedPluginIdAtVersion: [`${M.id}@${M.version}`],
    });
    const result = await verifyPluginSignature(sig, { manifest: M, fileSha256 }, revs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('plugin-revoked');
  });

  it('fromCrlJSON parses the canonical CRL shape', () => {
    const r = RevocationList.fromCrlJSON({
      revokedPublisherKeysB64: ['pubA'],
      revokedPluginIdAtVersion: ['p@1.0.0', 'p@2.0.0'],
      issuedAt: '2026-04-28T12:00:00Z',
    });
    expect(r.size()).toEqual({ publishers: 1, plugins: 2 });
    expect(r.issuedAt).toBe('2026-04-28T12:00:00Z');
  });
});
