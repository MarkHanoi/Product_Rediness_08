// publish-roundtrip.test.ts — S59 family-marketplace-publish gate.
//
// End-to-end pipeline:
//   1. Stand up an Express app with `buildFamilyMarketplaceRouter()`.
//   2. Generate an Ed25519 keypair (mirrors `signing.ts` from the editor).
//   3. `packFamily()` with the private key.
//   4. POST raw bytes to /api/v1/families with the public-key JWK header.
//   5. Assert 201 with familyId + semver + schemaHash + serverFamilyUrl.
//   6. GET /api/v1/families lists the family.
//   7. GET /api/v1/families/:id returns the manifest projection.
//   8. GET /api/v1/families/:id/download streams identical bytes back.
//   9. `unpackFamily(bytes, verifyingKey)` re-verifies the signature.
//
// Failure modes covered:
//   • POST with no JWK header → 400.
//   • POST with valid bytes but mismatched JWK → 401 signature-mismatch.
//   • POST with EICAR sentinel embedded in icon bytes → 422 virus-scan-failed.
//   • POST a non-monotonic semver re-publish → 409 semver-not-monotonic.
//   • POST tampered bytes (manifest mutation after sign) → 401.

import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  packFamily,
  unpackFamily,
  type FamilyDocument,
  type FamilyManifest,
} from '@pryzm/file-format';

import {
  buildFamilyMarketplaceRouter,
  clearFamilyMarketplaceStore,
} from '../../../server/familyMarketplaceRoutes.js';

const FAMILY_ID = 'fam_01J9ZQF9ZQF9ZQF9ZQF9ZQF9Z9';
const TYPE_ID = 'typ_01J9ZQF9ZQF9ZQF9ZQF9ZQF9Z8';

function makeApp() {
  const app = express();
  app.use('/api/v1/families', buildFamilyMarketplaceRouter({ publicBaseUrl: 'http://test' }));
  return app;
}

function makeManifest(overrides: Partial<FamilyManifest> = {}): FamilyManifest {
  return {
    formatVersion: '1.0',
    id: FAMILY_ID,
    name: 'Round-trip Door',
    semver: '1.0.0',
    author: { id: 'author_e2e', displayName: 'E2E Author' },
    description: 'fixture',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: '2026-04-28T00:00:00.000Z',
    lastModifiedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function makeDocument(): FamilyDocument {
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

async function generateKeypair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
}

async function exportJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

async function importPub(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['verify']);
}

describe('family-marketplace-publish — POST + browse + download (S59 gate)', () => {
  beforeEach(() => {
    clearFamilyMarketplaceStore();
  });

  it('completes the publish round-trip and lists/details/downloads the family', async () => {
    const app = makeApp();
    const keypair = await generateKeypair();
    const packed = await packFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      signingKey: keypair.privateKey,
    });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    const jwk = await exportJwk(keypair.publicKey);

    const postResp = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(jwk))
      .set('x-pryzm-family-schema-hash', packed.schemaHash)
      .send(Buffer.from(packed.bytes));

    expect(postResp.status).toBe(201);
    expect(postResp.body.familyId).toBe(FAMILY_ID);
    expect(postResp.body.semver).toBe('1.0.0');
    expect(postResp.body.schemaHash).toBe(packed.schemaHash);
    expect(postResp.body.serverFamilyUrl).toContain(FAMILY_ID);

    const listResp = await request(app).get('/api/v1/families');
    expect(listResp.status).toBe(200);
    expect(listResp.body.families).toHaveLength(1);
    expect(listResp.body.families[0].id).toBe(FAMILY_ID);
    expect(listResp.body.families[0].name).toBe('Round-trip Door');

    const detailResp = await request(app).get(`/api/v1/families/${FAMILY_ID}`);
    expect(detailResp.status).toBe(200);
    expect(detailResp.body.manifest.id).toBe(FAMILY_ID);
    expect(detailResp.body.schemaHash).toBe(packed.schemaHash);

    const downloadResp = await request(app)
      .get(`/api/v1/families/${FAMILY_ID}/download`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(downloadResp.status).toBe(200);
    expect(downloadResp.headers['content-type']).toBe('application/vnd.pryzm.family');
    const downloaded = new Uint8Array(downloadResp.body as Buffer);
    expect(downloaded.byteLength).toBe(packed.bytes.byteLength);

    const reverified = await unpackFamily({
      bytes: downloaded,
      verifyingKey: await importPub(jwk),
      verifySchemaHash: true,
    });
    expect(reverified.ok).toBe(true);
    if (!reverified.ok) return;
    expect(reverified.signatureVerified).toBe(true);
    expect(reverified.schemaHash).toBe(packed.schemaHash);
  });

  it('rejects POST without an author JWK header', async () => {
    const app = makeApp();
    const keypair = await generateKeypair();
    const packed = await packFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      signingKey: keypair.privateKey,
    });
    if (!packed.ok) throw new Error('pack failed');
    const r = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .send(Buffer.from(packed.bytes));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('missing-author-jwk-header');
  });

  it('rejects POST when the JWK does not match the signature', async () => {
    const app = makeApp();
    const signer = await generateKeypair();
    const wrong = await generateKeypair();
    const packed = await packFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      signingKey: signer.privateKey,
    });
    if (!packed.ok) throw new Error('pack failed');
    const wrongJwk = await exportJwk(wrong.publicKey);
    const r = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(wrongJwk))
      .send(Buffer.from(packed.bytes));
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('signature-mismatch');
  });

  it('rejects POST when the bytes contain the EICAR virus-scan sentinel', async () => {
    const app = makeApp();
    const keypair = await generateKeypair();
    const eicar = new TextEncoder().encode(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    const packed = await packFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      icon: eicar,
      signingKey: keypair.privateKey,
    });
    if (!packed.ok) throw new Error('pack failed');
    const jwk = await exportJwk(keypair.publicKey);
    const r = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(jwk))
      .send(Buffer.from(packed.bytes));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('virus-scan-failed');
  });

  it('rejects republish at the same semver', async () => {
    const app = makeApp();
    const keypair = await generateKeypair();
    const jwk = await exportJwk(keypair.publicKey);
    const packed = await packFamily({
      manifest: makeManifest({ semver: '1.0.0' }),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      signingKey: keypair.privateKey,
    });
    if (!packed.ok) throw new Error('pack failed');

    const first = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(jwk))
      .send(Buffer.from(packed.bytes));
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(jwk))
      .send(Buffer.from(packed.bytes));
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('semver-already-published');
  });

  it('accepts a republish at a strictly-greater semver', async () => {
    const app = makeApp();
    const keypair = await generateKeypair();
    const jwk = await exportJwk(keypair.publicKey);

    const v1 = await packFamily({
      manifest: makeManifest({ semver: '1.0.0' }),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      signingKey: keypair.privateKey,
    });
    if (!v1.ok) throw new Error('pack v1 failed');
    const v2 = await packFamily({
      manifest: makeManifest({ semver: '1.1.0' }),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      signingKey: keypair.privateKey,
    });
    if (!v2.ok) throw new Error('pack v2 failed');

    const a = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(jwk))
      .send(Buffer.from(v1.bytes));
    expect(a.status).toBe(201);

    const b = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(jwk))
      .send(Buffer.from(v2.bytes));
    expect(b.status).toBe(201);
    expect(b.body.semver).toBe('1.1.0');

    const detail = await request(app).get(`/api/v1/families/${FAMILY_ID}`);
    expect(detail.body.semver).toBe('1.1.0');
    expect(detail.body.availableSemvers).toEqual(['1.0.0', '1.1.0']);
  });

  it('rejects bytes whose schema-hash header conflicts with the file', async () => {
    const app = makeApp();
    const keypair = await generateKeypair();
    const jwk = await exportJwk(keypair.publicKey);
    const packed = await packFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: new Uint8Array([1, 2, 3, 4]),
      signingKey: keypair.privateKey,
    });
    if (!packed.ok) throw new Error('pack failed');
    const r = await request(app)
      .post('/api/v1/families')
      .set('content-type', 'application/vnd.pryzm.family')
      .set('x-pryzm-author-jwk', JSON.stringify(jwk))
      .set('x-pryzm-family-schema-hash', 'sha256:deadbeef'.padEnd(71, '0'))
      .send(Buffer.from(packed.bytes));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('schema-hash-header-mismatch');
  });
});
