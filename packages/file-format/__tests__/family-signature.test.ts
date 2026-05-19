// family-signature.test.ts — Ed25519 signing for `.pryzm-family` (S59).
//
// Mirrors the project-pack signature contract from `signature.test.ts`
// but for the family-pack:
//   1. signingKey on pack → signatureVerified on unpack with verifyingKey.
//   2. Tampered manifest → `signature-mismatch`.
//   3. verifyingKey but no signature → `signature-required`.
//   4. Round-trip without signing → `hasSignature === false`.

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import { packFamily } from '../src/family-pack.js';
import { unpackFamily } from '../src/family-unpack.js';
import { FAMILY_PATHS } from '../src/family-types.js';
import type { FamilyDocument, FamilyManifest } from '../src/family-schema.js';

const FAMILY_ID = 'fam_01J9ZQF9ZQF9ZQF9ZQF9ZQF9Z9';
const TYPE_ID = 'typ_01J9ZQF9ZQF9ZQF9ZQF9ZQF9Z8';

function makeManifest(): FamilyManifest {
  return {
    formatVersion: '1.0',
    id: FAMILY_ID,
    name: 'Sig Door',
    semver: '1.0.0',
    author: { id: 'author_sig', displayName: 'Sig Author' },
    description: '',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: '2026-04-28T00:00:00.000Z',
    lastModifiedAt: '2026-04-28T00:00:00.000Z',
  };
}

function makeDoc(): FamilyDocument {
  return {
    formatVersion: '1.0',
    referencePlanes: [],
    parameters: [],
    profiles: [],
    solids: [],
    materialSlots: [],
    types: [{
      id: TYPE_ID,
      name: 'Default',
      values: {},
      checksum: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    }],
    defaults: {},
  };
}

async function generatePair(): Promise<CryptoKeyPair | null> {
  try {
    return (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  } catch {
    return null;
  }
}

describe('family-format · signature (S59)', () => {
  it('signs on packFamily and verifies on unpackFamily', async () => {
    const pair = await generatePair();
    if (!pair) return;
    const packed = await packFamily({
      manifest: makeManifest(),
      document: makeDoc(),
      signingKey: pair.privateKey,
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;
    expect(packed.telemetry.hasSignature).toBe(true);

    const unpacked = await unpackFamily({ bytes: packed.bytes, verifyingKey: pair.publicKey });
    expect(unpacked.ok).toBe(true);
    if (!unpacked.ok) return;
    expect(unpacked.signatureVerified).toBe(true);
    expect(unpacked.telemetry.hasSignature).toBe(true);
  });

  it('rejects a tampered manifest as signature-mismatch', async () => {
    const pair = await generatePair();
    if (!pair) return;
    const packed = await packFamily({
      manifest: makeManifest(),
      document: makeDoc(),
      signingKey: pair.privateKey,
    });
    if (!packed.ok) return;

    const zip = await JSZip.loadAsync(packed.bytes);
    const original = await zip.file(FAMILY_PATHS.manifest)!.async('string');
    const tampered = original.replace('Sig Door', 'Hacked Door');
    zip.file(FAMILY_PATHS.manifest, tampered, { compression: 'STORE' });
    const tamperedBytes = await zip.generateAsync({ type: 'uint8array' });

    const r = await unpackFamily({ bytes: tamperedBytes, verifyingKey: pair.publicKey });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('signature-mismatch');
  });

  it('verifyingKey provided but signature missing → signature-required', async () => {
    const pair = await generatePair();
    if (!pair) return;
    const packed = await packFamily({ manifest: makeManifest(), document: makeDoc() });
    if (!packed.ok) return;
    const r = await unpackFamily({ bytes: packed.bytes, verifyingKey: pair.publicKey });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('signature-required');
  });

  it('unsigned round-trip reports hasSignature=false / signatureVerified=false', async () => {
    const packed = await packFamily({ manifest: makeManifest(), document: makeDoc() });
    if (!packed.ok) return;
    expect(packed.telemetry.hasSignature).toBe(false);
    const r = await unpackFamily({ bytes: packed.bytes });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.telemetry.hasSignature).toBe(false);
    expect(r.signatureVerified).toBe(false);
  });

  it('signing preserves byte-determinism across repeat packs', async () => {
    const pair = await generatePair();
    if (!pair) return;
    const a = await packFamily({
      manifest: makeManifest(),
      document: makeDoc(),
      signingKey: pair.privateKey,
    });
    const b = await packFamily({
      manifest: makeManifest(),
      document: makeDoc(),
      signingKey: pair.privateKey,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Note: Ed25519 signatures are deterministic per RFC 8032, so two signs
    // of the same bytes with the same key produce the same signature.  This
    // is what guarantees pack(...sig) byte-determinism across calls and
    // machines.
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });
});
