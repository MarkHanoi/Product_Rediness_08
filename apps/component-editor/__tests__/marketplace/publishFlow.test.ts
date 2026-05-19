// publishFlow.test.ts — S59 publish-flow orchestrator.
//
// @vitest-environment node
//
// Forced to node env: JSZip + jsdom interact poorly with Uint8Array
// realms ("Can't read the data of 'document.json'" — see jszip#778);
// the production publish flow runs in the editor's *real* browser
// runtime where this is not a problem, but our unit tests mock that
// out so we sidestep jsdom altogether here.

import { describe, expect, it } from 'vitest';

import {
  unpackFamily,
  type FamilyDocument,
  type FamilyManifest,
} from '@pryzm/file-format';

import { compareSemver, publishFamily, validateForPublish } from '../../src/marketplace/publishFlow.js';
import { generateAuthorKeyPair, importPublicKeyJwk } from '../../src/marketplace/signing.js';

const FAMILY_ID = 'fam_01J9ZQF9ZQF9ZQF9ZQF9ZQF9Z9';
const TYPE_ID = 'typ_01J9ZQF9ZQF9ZQF9ZQF9ZQF9Z8';

function makeManifest(overrides: Partial<FamilyManifest> = {}): FamilyManifest {
  return {
    formatVersion: '1.0',
    id: FAMILY_ID,
    name: 'Test Door',
    semver: '1.0.0',
    author: { id: 'author_1', displayName: 'Test Author' },
    description: '',
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

function makeDocument(overrides: Partial<FamilyDocument> = {}): FamilyDocument {
  return {
    formatVersion: '1.0',
    referencePlanes: [],
    parameters: [],
    profiles: [],
    solids: [],
    materialSlots: [],
    types: [
      {
        id: TYPE_ID,
        name: 'Default',
        values: {},
        checksum: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      },
    ],
    defaults: {},
    ...overrides,
  };
}

function makeThumbnail(): Uint8Array {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
}

describe('publishFlow — validateForPublish', () => {
  it('passes a clean manifest + document + thumbnail', () => {
    const r = validateForPublish({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: makeThumbnail(),
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a document with no types', () => {
    const r = validateForPublish({
      manifest: makeManifest(),
      document: makeDocument({ types: [] as never }),
      thumbnail: makeThumbnail(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Zod catches `types: []` as document-invalid before our explicit
      // no-types check; either reason is acceptable for the same condition.
      expect(['no-types', 'document-invalid']).toContain(r.reason);
    }
  });

  it('rejects when no thumbnail is supplied', () => {
    const r = validateForPublish({
      manifest: makeManifest(),
      document: makeDocument(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('thumbnail-required');
  });

  it('rejects a non-monotonic semver bump', () => {
    const r = validateForPublish({
      manifest: makeManifest({ semver: '1.0.0' }),
      document: makeDocument(),
      thumbnail: makeThumbnail(),
      previousSemver: '1.0.0',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('semver-not-monotonic');
  });

  it('accepts a monotonic semver bump', () => {
    const r = validateForPublish({
      manifest: makeManifest({ semver: '1.0.1' }),
      document: makeDocument(),
      thumbnail: makeThumbnail(),
      previousSemver: '1.0.0',
    });
    expect(r.ok).toBe(true);
  });
});

describe('publishFlow — compareSemver', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.0.0', '1.0.1', -1],
    ['2.0.0', '1.99.99', 1],
    ['1.0.0-beta', '1.0.0-alpha', 0],
  ])('compareSemver(%s, %s) === %i', (a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected);
  });
});

describe('publishFlow — publishFamily end-to-end', () => {
  it('packs, signs, posts to /api/v1/families, and returns server response', async () => {
    const pair = await generateAuthorKeyPair();

    let capturedUrl = '';
    let capturedBody: Uint8Array | null = null;
    let capturedHeaders: Record<string, string> = {};

    const stubFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = new Uint8Array(init?.body as ArrayBuffer);

      // Round-trip the bytes server-side to prove they verify.
      const verifyKey = await importPublicKeyJwk(JSON.parse(capturedHeaders['x-pryzm-author-jwk']));
      const verified = await unpackFamily({ bytes: capturedBody, verifyingKey: verifyKey });
      if (!verified.ok || !verified.signatureVerified) {
        return new Response('signature did not verify', { status: 400 });
      }
      return new Response(
        JSON.stringify({
          familyId: verified.manifest.id,
          semver: verified.manifest.semver,
          schemaHash: verified.schemaHash,
          serverFamilyUrl: `https://example.test/api/v1/families/${verified.manifest.id}`,
          publishedAt: '2026-04-28T01:02:03.000Z',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };

    const result = await publishFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: makeThumbnail(),
      signingKey: pair.privateKey,
      verifyingKey: pair.publicKey,
      marketplaceUrl: 'https://example.test',
      fetchImpl: stubFetch as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.familyId).toBe(FAMILY_ID);
    expect(result.semver).toBe('1.0.0');
    expect(capturedUrl).toBe('https://example.test/api/v1/families');
    expect(capturedHeaders['content-type']).toBe('application/vnd.pryzm.family');
    expect(capturedHeaders['x-pryzm-author-jwk']).toContain('"crv":"Ed25519"');
    expect(capturedBody!.byteLength).toBeGreaterThan(0);
  });

  it('surfaces server-rejected on non-2xx response', async () => {
    const pair = await generateAuthorKeyPair();
    const stubFetch = async (): Promise<Response> => new Response('virus-scan-failed', { status: 422 });

    const result = await publishFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: makeThumbnail(),
      signingKey: pair.privateKey,
      verifyingKey: pair.publicKey,
      marketplaceUrl: 'https://example.test',
      fetchImpl: stubFetch as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('server-rejected');
      expect(result.httpStatus).toBe(422);
    }
  });

  it('surfaces network-error when fetch throws', async () => {
    const pair = await generateAuthorKeyPair();
    const stubFetch = async (): Promise<Response> => {
      throw new Error('connection refused');
    };
    const result = await publishFamily({
      manifest: makeManifest(),
      document: makeDocument(),
      thumbnail: makeThumbnail(),
      signingKey: pair.privateKey,
      verifyingKey: pair.publicKey,
      marketplaceUrl: 'https://example.test',
      fetchImpl: stubFetch as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network-error');
  });
});
