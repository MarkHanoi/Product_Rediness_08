// signing.ts — Ed25519 author keypair management for the family
// marketplace publish flow (S59).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §17.1 step 5.
//
// The plan literally says "HMAC-signs"; the codebase has standardised
// on Ed25519 for project packs (see `packages/file-format/src/pack.ts`
// step 7) and we inherit that primitive for the family pack so a single
// verification stack covers both formats.  The schema-hash literal is
// already stamped into `manifest.json` by `packFamily()`, so signing
// the manifest bytes binds the document graph through hash chaining.
//
// Hard rules (apps/component-editor/QUALITY_GATES):
//   • ≤300 LoC.
//   • No `THREE.*` imports.
//   • No React.
//   • No `window.*` access (this module runs inside the editor's
//     pure-DOM AppShell, which is the only place allowed to touch
//     browser globals — keypairs are passed in by the AppShell).

const ED25519: EcKeyImportParams = { name: 'Ed25519' } as EcKeyImportParams;

/** Generate a fresh extractable Ed25519 keypair for a marketplace author.
 *
 *  The private key is `extractable: true` so the editor can persist it
 *  to IndexedDB; the public key is exported into `marketplace.author.publicKeyJwk`
 *  on the manifest by the publish flow.  Per WebCrypto Ed25519 (RFC 8032)
 *  the private scalar is 32 B; the resulting JWK encodes it as `d`.
 */
export async function generateAuthorKeyPair(): Promise<CryptoKeyPair> {
  const subtle = getSubtle();
  const pair = await subtle.generateKey(ED25519, true, ['sign', 'verify']);
  return pair as CryptoKeyPair;
}

/** Export the public half of an author keypair as a JWK suitable for
 *  embedding in `marketplace.author.publicKeyJwk` and for verification
 *  by both `unpackFamily({ verifyingKey })` and the server route. */
export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
  const subtle = getSubtle();
  const jwk = await subtle.exportKey('jwk', publicKey);
  return jwk;
}

/** Export the private key as a JWK for IndexedDB storage on the
 *  author's machine.  NEVER transmit this off-machine. */
export async function exportPrivateKeyJwk(privateKey: CryptoKey): Promise<JsonWebKey> {
  const subtle = getSubtle();
  const jwk = await subtle.exportKey('jwk', privateKey);
  return jwk;
}

/** Re-import a public key JWK for verification (used by the server
 *  route and by tests). */
export async function importPublicKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey('jwk', jwk, ED25519, true, ['verify']);
}

/** Re-import a private key JWK from IndexedDB after the author re-opens
 *  the editor.  The key is non-extractable on re-import to prevent
 *  accidental leakage from later code. */
export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey('jwk', jwk, ED25519, false, ['sign']);
}

/** Compute a stable fingerprint of a public key for human display.
 *  Uses SHA-256 of the JWK's `x` field (the public scalar) and returns
 *  the first 16 hex chars — collision-resistant enough for UI use. */
export async function fingerprintPublicKey(publicKey: CryptoKey): Promise<string> {
  const subtle = getSubtle();
  const jwk = await subtle.exportKey('jwk', publicKey);
  if (typeof jwk.x !== 'string') {
    throw new Error('[signing] exported JWK has no `x` field — not an Ed25519 public key');
  }
  const bytes = new TextEncoder().encode(jwk.x);
  const buf = await subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < 8; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      '[signing] globalThis.crypto.subtle unavailable — Node 20+ or a modern browser required for Ed25519.',
    );
  }
  return subtle;
}
