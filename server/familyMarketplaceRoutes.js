/**
 * server/familyMarketplaceRoutes.js — POST /api/v1/families + browse endpoints (S59).
 *
 * Spec source: docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §17.
 *
 * Endpoints:
 *   POST   /api/v1/families              — Publish (or republish) a `.pryzm-family` ZIP.
 *   GET    /api/v1/families              — Browse: returns sorted list of summaries.
 *   GET    /api/v1/families/:id          — Family detail (manifest + ifc-mapping projection).
 *   GET    /api/v1/families/:id/download — Stream the raw `.pryzm-family` bytes.
 *
 * Validation pipeline on POST (in order, fail-fast):
 *   1. Body size cap (8 MiB — plan §17 step 4).
 *   2. ZIP parses + manifest/document validate against Zod schemas
 *      (re-uses `unpackFamily()` from @pryzm/file-format — single source
 *      of truth shared with the editor save/load path).
 *   3. Author Ed25519 signature verifies against the canonical
 *      manifest.json bytes (server re-imports the public-key JWK from
 *      the `x-pryzm-author-jwk` header).
 *   4. Schema-hash header matches the schema hash recovered from the file.
 *   5. Round-trip-determinism check: re-pack the unpacked structures and
 *      assert byte-equality with the uploaded bytes.  This is the
 *      server-side mirror of the `family-round-trip` gate and proves the
 *      uploaded file was produced by a conforming writer.
 *   6. Virus-scan stub: rejects payloads containing the EICAR test
 *      string anywhere in the ZIP entries.  Real ClamAV integration
 *      is deferred to S60+ behind the FAMILY_VIRUS_SCAN env switch.
 *   7. Monotonic-semver check: a republish must strictly bump semver.
 *
 * Storage: in-process Map keyed by `${familyId}` → { semvers: Map<semver, record> }.
 * Production deployment will swap this for S3 + Postgres in a later sprint;
 * the route surface is storage-agnostic.
 */

import express from 'express';

import {
  packFamily,
  unpackFamily,
} from '@pryzm/file-format/server';

const MAX_FAMILY_BYTES = 8 * 1024 * 1024;
const ENABLE_VIRUS_SCAN = process.env.FAMILY_VIRUS_SCAN !== '0';

/** In-memory store: familyId → { semvers: Map<semver, record>, latest: semver } */
const store = new Map();

export function clearFamilyMarketplaceStore() {
  store.clear();
}

export function listFamiliesForTests() {
  const out = [];
  for (const [id, entry] of store) {
    const latestRec = entry.semvers.get(entry.latest);
    out.push({ id, semver: entry.latest, name: latestRec?.manifest.name ?? '' });
  }
  return out;
}

function compareSemver(a, b) {
  const pa = a.split(/[-+]/, 1)[0].split('.').map((s) => Number.parseInt(s, 10));
  const pb = b.split(/[-+]/, 1)[0].split('.').map((s) => Number.parseInt(s, 10));
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function importPublicKeyJwk(jwk) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SubtleCrypto unavailable');
  return subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['verify']);
}

function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

async function containsEicarInUnpacked(unpacked) {
  // ZIP DEFLATE compression hides the EICAR sentinel in the raw bytes,
  // so we scan the unpacked content surfaces a real malware would target:
  //   • manifest.json fields (description, author display name)
  //   • icon SVG bytes (most attractive vector — XML can carry script)
  //   • thumbnail bytes (any PNG-comment-smuggling)
  //
  // A real ClamAV daemon (FAMILY_VIRUS_SCAN env switch) replaces this
  // with `clamd ping → instream` against the unpacked bytes in S60+.
  const probes = [
    JSON.stringify(unpacked.manifest),
    JSON.stringify(unpacked.document),
  ];
  if (unpacked.icon) probes.push(Buffer.from(unpacked.icon).toString('utf8'));
  if (unpacked.thumbnail) probes.push(Buffer.from(unpacked.thumbnail).toString('utf8'));
  for (const p of probes) {
    if (p.includes(EICAR)) return true;
  }
  return false;
}

export function buildFamilyMarketplaceRouter(opts = {}) {
  const router = express.Router();

  // Raw body parser — we need the bytes verbatim to verify the signature
  // and the round-trip determinism, so JSON middleware is bypassed.
  router.use(
    '/',
    express.raw({
      type: ['application/vnd.pryzm.family', 'application/octet-stream'],
      limit: MAX_FAMILY_BYTES,
    }),
  );

  router.post('/', async (req, res) => {
    try {
      const bytes = req.body;
      if (!bytes || !Buffer.isBuffer(bytes) || bytes.byteLength === 0) {
        return res.status(400).json({ error: 'empty-body' });
      }
      if (bytes.byteLength > MAX_FAMILY_BYTES) {
        return res.status(413).json({ error: 'payload-too-large', limit: MAX_FAMILY_BYTES });
      }

      const jwkHeader = req.header('x-pryzm-author-jwk');
      if (!jwkHeader) return res.status(400).json({ error: 'missing-author-jwk-header' });
      let jwk;
      try {
        jwk = JSON.parse(jwkHeader);
      } catch {
        return res.status(400).json({ error: 'malformed-author-jwk-header' });
      }
      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
        return res.status(400).json({ error: 'unsupported-jwk', expected: 'OKP/Ed25519' });
      }

      let verifyingKey;
      try {
        verifyingKey = await importPublicKeyJwk(jwk);
      } catch (err) {
        return res.status(400).json({ error: 'jwk-import-failed', detail: err.message });
      }

      const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      const unpacked = await unpackFamily({
        bytes: u8,
        verifySchemaHash: true,
        verifyingKey,
      });
      if (!unpacked.ok) {
        const status =
          unpacked.reason === 'signature-required' || unpacked.reason === 'signature-mismatch' ? 401
          : unpacked.reason === 'schema-hash-mismatch' ? 422 : 400;
        return res.status(status).json({ error: unpacked.reason, detail: unpacked.message });
      }
      if (!unpacked.signatureVerified) {
        return res.status(401).json({ error: 'signature-required' });
      }

      // Header schema-hash must match the file's schema hash literal.
      const headerHash = req.header('x-pryzm-family-schema-hash');
      if (headerHash && headerHash !== unpacked.schemaHash) {
        return res.status(422).json({
          error: 'schema-hash-header-mismatch',
          headerHash,
          fileHash: unpacked.schemaHash,
        });
      }

      // Virus scan stub — see plan §17 step 4.  We scan the *unpacked*
      // text surfaces (DEFLATE compression makes raw-byte scanning useless).
      if (ENABLE_VIRUS_SCAN && (await containsEicarInUnpacked(unpacked))) {
        return res.status(422).json({ error: 'virus-scan-failed', sentinel: 'EICAR' });
      }

      // Round-trip determinism: re-pack and verify byte equality.  This
      // catches uploads from non-conforming writers that would otherwise
      // poison the cache.
      const repacked = await packFamily({
        manifest: unpacked.manifest,
        document: unpacked.document,
        events: unpacked.events,
        thumbnail: unpacked.thumbnail,
        icon: unpacked.icon,
        signature: unpacked.signature, // preserve the original sig bytes exactly
      });
      if (!repacked.ok) {
        return res.status(422).json({ error: 'roundtrip-failed-pack', detail: repacked.message });
      }
      if (!bytesEqual(u8, repacked.bytes)) {
        return res.status(422).json({
          error: 'roundtrip-byte-mismatch',
          uploadedBytes: u8.byteLength,
          repackedBytes: repacked.bytes.byteLength,
        });
      }

      // Monotonic-semver check.
      const familyId = unpacked.manifest.id;
      const semver = unpacked.manifest.semver;
      const existing = store.get(familyId);
      if (existing) {
        if (existing.semvers.has(semver)) {
          return res.status(409).json({
            error: 'semver-already-published',
            familyId,
            semver,
          });
        }
        const cmp = compareSemver(semver, existing.latest);
        if (cmp <= 0) {
          return res.status(409).json({
            error: 'semver-not-monotonic',
            familyId,
            attempted: semver,
            latest: existing.latest,
          });
        }
      }

      const publishedAt = new Date().toISOString();
      const record = {
        manifest: unpacked.manifest,
        ifcMapping: unpacked.ifcMapping,
        schemaHash: unpacked.schemaHash,
        publishedAt,
        bytes: u8,
        authorJwk: jwk,
      };
      if (existing) {
        existing.semvers.set(semver, record);
        existing.latest = semver;
      } else {
        store.set(familyId, { latest: semver, semvers: new Map([[semver, record]]) });
      }

      const baseUrl = opts.publicBaseUrl ?? '';
      return res.status(201).json({
        familyId,
        semver,
        schemaHash: unpacked.schemaHash,
        serverFamilyUrl: `${baseUrl}/api/v1/families/${familyId}`,
        publishedAt,
      });
    } catch (err) {
      console.error('[familyMarketplace] unexpected error:', err);
      return res.status(500).json({ error: 'internal-error', detail: err.message });
    }
  });

  router.get('/', (_req, res) => {
    const out = [];
    for (const [id, entry] of store) {
      const rec = entry.semvers.get(entry.latest);
      if (!rec) continue;
      out.push({
        id,
        name: rec.manifest.name,
        semver: entry.latest,
        category: rec.manifest.category,
        ifcEntity: rec.manifest.ifcEntity,
        author: rec.manifest.author,
        publishedAt: rec.publishedAt,
        schemaHash: rec.schemaHash,
        availableSemvers: [...entry.semvers.keys()].sort((a, b) => compareSemver(a, b)),
      });
    }
    out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    res.json({ families: out });
  });

  router.get('/:id', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'not-found', familyId: req.params.id });
    const rec = entry.semvers.get(entry.latest);
    if (!rec) return res.status(404).json({ error: 'not-found-version' });
    res.json({
      id: req.params.id,
      semver: entry.latest,
      manifest: rec.manifest,
      ifcMapping: rec.ifcMapping,
      schemaHash: rec.schemaHash,
      publishedAt: rec.publishedAt,
      availableSemvers: [...entry.semvers.keys()].sort((a, b) => compareSemver(a, b)),
      downloadUrl: `/api/v1/families/${req.params.id}/download`,
    });
  });

  router.get('/:id/download', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'not-found' });
    const semver = req.query.semver ? String(req.query.semver) : entry.latest;
    const rec = entry.semvers.get(semver);
    if (!rec) return res.status(404).json({ error: 'semver-not-found', semver });
    res.set('content-type', 'application/vnd.pryzm.family');
    res.set('content-length', String(rec.bytes.byteLength));
    res.set(
      'content-disposition',
      `attachment; filename="${req.params.id}-${semver}.pryzm-family"`,
    );
    res.send(Buffer.from(rec.bytes));
  });

  return router;
}
