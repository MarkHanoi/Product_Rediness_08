// Ed25519 signature tests.
//
// Asserts:
//   1. Sign on pack, verify on unpack — happy path.
//   2. Tampered manifest fails verification (`signature-mismatch`).
//   3. verifyingKey provided but signature absent → `signature-required`.
//   4. Round-trip without signature has `hasSignature === false`.
//
// Ed25519 in Web Crypto requires Node 20+ (we declare engines at the
// repo root) — the test will skip gracefully on older runtimes.

import { describe, it, expect } from 'vitest';

import { pack } from '../src/pack';
import { unpack } from '../src/unpack';
import { attachLatestPerLevel, makeChunks, makeManifest } from './fixtures';

async function generateEd25519Pair(): Promise<CryptoKeyPair | null> {
  try {
    return (await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
  } catch {
    return null;
  }
}

describe('file-format · signature', () => {
  it('signs on pack and verifies on unpack', async () => {
    const pair = await generateEd25519Pair();
    if (!pair) return; // older runtime — skip silently

    const chunkBytes = await makeChunks(2);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'proj_signed',
      levels: 1,
      chunksPerLevel: 2,
      chunkBytes,
    });
    const manifest = attachLatestPerLevel(base, chunkEntries);

    const packed = await pack({
      manifest,
      events: [],
      chunks: chunkBytes,
      signingKey: pair.privateKey,
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;
    expect(packed.telemetry.hasSignature).toBe(true);

    const unpacked = await unpack({
      bytes: packed.bytes,
      verifyingKey: pair.publicKey,
    });
    expect(unpacked.ok).toBe(true);
    if (!unpacked.ok) return;
    expect(unpacked.hasSignature).toBe(true);
    expect(unpacked.signatureVerified).toBe(true);
  });

  it('tampered manifest fails signature verification', async () => {
    const pair = await generateEd25519Pair();
    if (!pair) return;

    const chunkBytes = await makeChunks(1);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'proj_tamper',
      levels: 1,
      chunksPerLevel: 1,
      chunkBytes,
    });
    const manifest = attachLatestPerLevel(base, chunkEntries);

    const packed = await pack({
      manifest,
      events: [],
      chunks: chunkBytes,
      signingKey: pair.privateKey,
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    // Surgically rewrite the manifest.json inside the ZIP without
    // re-signing.  We do this by loading + mutating + re-emitting via
    // JSZip so the central directory stays correct.
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(packed.bytes);
    const original = await zip.file('manifest.json')!.async('string');
    const tampered = original.replace('proj_tamper', 'proj_HACKED');
    zip.file('manifest.json', tampered, { compression: 'STORE' });
    const tamperedBytes = await zip.generateAsync({ type: 'uint8array' });

    const result = await unpack({
      bytes: tamperedBytes,
      verifyingKey: pair.publicKey,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('signature-mismatch');
    }
  });

  it('verifyingKey provided but signature missing → signature-required', async () => {
    const pair = await generateEd25519Pair();
    if (!pair) return;

    const chunkBytes = await makeChunks(1);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'proj_unsigned',
      levels: 1,
      chunksPerLevel: 1,
      chunkBytes,
    });
    const manifest = attachLatestPerLevel(base, chunkEntries);

    // Pack WITHOUT a signing key.
    const packed = await pack({ manifest, events: [], chunks: chunkBytes });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    const result = await unpack({
      bytes: packed.bytes,
      verifyingKey: pair.publicKey,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('signature-required');
    }
  });

  it('unsigned round-trip reports hasSignature=false', async () => {
    const chunkBytes = await makeChunks(1);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'proj_unsigned2',
      levels: 1,
      chunksPerLevel: 1,
      chunkBytes,
    });
    const manifest = attachLatestPerLevel(base, chunkEntries);

    const packed = await pack({ manifest, events: [], chunks: chunkBytes });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;
    const unpacked = await unpack({ bytes: packed.bytes });
    expect(unpacked.ok).toBe(true);
    if (!unpacked.ok) return;
    expect(unpacked.hasSignature).toBe(false);
    expect(unpacked.signatureVerified).toBe(false);
  });
});
