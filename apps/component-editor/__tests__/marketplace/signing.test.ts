// signing.test.ts — S59 author keypair primitives.

import { describe, expect, it } from 'vitest';

import {
  exportPrivateKeyJwk,
  exportPublicKeyJwk,
  fingerprintPublicKey,
  generateAuthorKeyPair,
  importPrivateKeyJwk,
  importPublicKeyJwk,
} from '../../src/marketplace/signing.js';

describe('signing — Ed25519 author keypair', () => {
  it('generates an Ed25519 keypair with sign + verify usages', async () => {
    const pair = await generateAuthorKeyPair();
    expect(pair.privateKey.algorithm.name).toBe('Ed25519');
    expect(pair.publicKey.algorithm.name).toBe('Ed25519');
    expect(pair.privateKey.usages).toContain('sign');
    expect(pair.publicKey.usages).toContain('verify');
  });

  it('round-trips public key through JWK export/import', async () => {
    const pair = await generateAuthorKeyPair();
    const jwk = await exportPublicKeyJwk(pair.publicKey);
    expect(jwk.kty).toBe('OKP');
    expect(jwk.crv).toBe('Ed25519');
    expect(typeof jwk.x).toBe('string');
    const re = await importPublicKeyJwk(jwk);
    expect(re.algorithm.name).toBe('Ed25519');
  });

  it('round-trips private key through JWK export/import', async () => {
    const pair = await generateAuthorKeyPair();
    const jwk = await exportPrivateKeyJwk(pair.privateKey);
    expect(typeof jwk.d).toBe('string');
    const re = await importPrivateKeyJwk(jwk);
    expect(re.algorithm.name).toBe('Ed25519');
    expect(re.extractable).toBe(false);
  });

  it('produces a stable fingerprint of the same public key', async () => {
    const pair = await generateAuthorKeyPair();
    const a = await fingerprintPublicKey(pair.publicKey);
    const b = await fingerprintPublicKey(pair.publicKey);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces different fingerprints for different keypairs', async () => {
    const a = await fingerprintPublicKey((await generateAuthorKeyPair()).publicKey);
    const b = await fingerprintPublicKey((await generateAuthorKeyPair()).publicKey);
    expect(a).not.toBe(b);
  });
});
