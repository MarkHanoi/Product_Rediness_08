// publishFlow.ts — Marketplace publish orchestrator (S59).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §17.
//
// The publish flow is a pure pipeline:
//   1. Validate the in-editor document with the FamilyDocumentSchema /
//      FamilyManifestSchema we already use for save (defence-in-depth —
//      the editor save path uses the same schemas, so a successful save
//      is a near-guarantee a publish will succeed too).
//   2. Apply marketplace-specific rules: must have ≥1 type, must have
//      a non-empty thumbnail, semver must be > the last published
//      semver for this familyId (caller supplies that via input).
//   3. `packFamily()` with the author's Ed25519 signing key.  The pack
//      writer canonicalises + computes the schema hash + signs the
//      manifest atomically.
//   4. POST the bytes to `${marketplaceUrl}/api/v1/families` with the
//      author's public key JWK in a header so the server can verify
//      without round-tripping a key registry.
//   5. Return the server's response (or a structured error).
//
// Hard rules (apps/component-editor/QUALITY_GATES):
//   • ≤300 LoC.
//   • No `THREE.*`, no React, no `window.*`.

import {
  FamilyDocumentSchema,
  FamilyManifestSchema,
  packFamily,
  type FamilyDocument,
  type FamilyEvent,
  type FamilyManifest,
  type FamilyPackResult,
} from '@pryzm/file-format';

import { exportPublicKeyJwk } from './signing.js';

export interface PublishInput {
  readonly manifest: FamilyManifest;
  readonly document: FamilyDocument;
  readonly events?: readonly FamilyEvent[];
  readonly thumbnail?: Uint8Array;
  readonly icon?: Uint8Array;
  /** Ed25519 private key produced by `signing.ts:generateAuthorKeyPair`. */
  readonly signingKey: CryptoKey;
  /** Ed25519 public key — embedded in the request header for the
   *  server to verify the bytes without consulting a registry. */
  readonly verifyingKey: CryptoKey;
  /** Last published semver for this family.id, if any.  Used to
   *  enforce monotonic versioning per plan §17 step 2. */
  readonly previousSemver?: string;
  /** Marketplace base URL (e.g. `https://marketplace.pryzm.app`).
   *  The flow appends `/api/v1/families`. */
  readonly marketplaceUrl: string;
  /** Injectable fetch — defaults to `globalThis.fetch`.  Tests pass
   *  a stub. */
  readonly fetchImpl?: typeof fetch;
}

export type PublishErrorReason =
  | 'document-invalid'
  | 'manifest-invalid'
  | 'no-types'
  | 'thumbnail-required'
  | 'semver-not-monotonic'
  | 'pack-failed'
  | 'network-error'
  | 'server-rejected';

export type PublishResult =
  | {
      readonly ok: true;
      readonly familyId: string;
      readonly semver: string;
      readonly schemaHash: string;
      readonly serverFamilyUrl: string;
      readonly byteLength: number;
      readonly publishedAt: string;
    }
  | {
      readonly ok: false;
      readonly reason: PublishErrorReason;
      readonly message: string;
      /** Echo of the server response status when `reason='server-rejected'`. */
      readonly httpStatus?: number;
    };

/** Pure-function validation pass — runs before we burn a network round-trip.
 *  Mirrored on the server side by `server/familyMarketplaceRoutes.js`. */
export function validateForPublish(input: {
  readonly manifest: FamilyManifest;
  readonly document: FamilyDocument;
  readonly thumbnail?: Uint8Array;
  readonly previousSemver?: string;
}): { ok: true } | { ok: false; reason: PublishErrorReason; message: string } {
  const m = FamilyManifestSchema.safeParse(input.manifest);
  if (!m.success) {
    return { ok: false, reason: 'manifest-invalid', message: m.error.message };
  }
  const d = FamilyDocumentSchema.safeParse(input.document);
  if (!d.success) {
    return { ok: false, reason: 'document-invalid', message: d.error.message };
  }
  if (d.data.types.length === 0) {
    return { ok: false, reason: 'no-types', message: 'family must define ≥1 type to publish' };
  }
  if (!input.thumbnail || input.thumbnail.byteLength === 0) {
    return { ok: false, reason: 'thumbnail-required', message: 'marketplace requires a thumbnail' };
  }
  if (input.previousSemver) {
    const cmp = compareSemver(m.data.semver, input.previousSemver);
    if (cmp <= 0) {
      return {
        ok: false,
        reason: 'semver-not-monotonic',
        message: `new semver ${m.data.semver} must be > previous ${input.previousSemver}`,
      };
    }
  }
  return { ok: true };
}

/** End-to-end orchestrator. */
export async function publishFamily(input: PublishInput): Promise<PublishResult> {
  const v = validateForPublish({
    manifest: input.manifest,
    document: input.document,
    thumbnail: input.thumbnail,
    previousSemver: input.previousSemver,
  });
  if (!v.ok) return v;

  const packed: FamilyPackResult = await packFamily({
    manifest: input.manifest,
    document: input.document,
    events: input.events,
    thumbnail: input.thumbnail,
    icon: input.icon,
    signingKey: input.signingKey,
  });
  if (!packed.ok) {
    return {
      ok: false,
      reason: 'pack-failed',
      message: `${packed.reason}: ${packed.message}`,
    };
  }

  const publicKeyJwk = await exportPublicKeyJwk(input.verifyingKey);
  const fetchImpl = input.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'network-error', message: 'no fetch implementation available' };
  }

  const url = joinUrl(input.marketplaceUrl, '/api/v1/families');
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.pryzm.family',
        'x-pryzm-author-jwk': JSON.stringify(publicKeyJwk),
        'x-pryzm-family-schema-hash': packed.schemaHash,
      },
      body: packed.bytes as unknown as BodyInit,
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'network-error',
      message: `[publishFlow] fetch threw: ${(err as Error).message}`,
    };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return {
      ok: false,
      reason: 'server-rejected',
      message: text || resp.statusText,
      httpStatus: resp.status,
    };
  }

  const json = (await resp.json().catch(() => ({}))) as Partial<{
    familyId: string;
    semver: string;
    schemaHash: string;
    serverFamilyUrl: string;
    publishedAt: string;
  }>;
  return {
    ok: true,
    familyId: json.familyId ?? input.manifest.id,
    semver: json.semver ?? input.manifest.semver,
    schemaHash: json.schemaHash ?? packed.schemaHash,
    serverFamilyUrl: json.serverFamilyUrl ?? joinUrl(url, `/${input.manifest.id}`),
    byteLength: packed.byteLength,
    publishedAt: json.publishedAt ?? new Date().toISOString(),
  };
}

/** Returns `1` if `a` > `b`, `-1` if `a` < `b`, `0` if equal.  Major /
 *  minor / patch only — pre-release suffixes treated as equal. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
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

function joinUrl(base: string, path: string): string {
  if (base.endsWith('/') && path.startsWith('/')) return base + path.slice(1);
  if (!base.endsWith('/') && !path.startsWith('/')) return `${base}/${path}`;
  return base + path;
}
