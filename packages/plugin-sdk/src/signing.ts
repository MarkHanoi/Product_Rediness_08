// @pryzm/plugin-sdk — Ed25519 plugin signing + revocation list (S62 D8).
//
// Every plugin published to the marketplace ships with an Ed25519
// signature over a canonical-JSON serialisation of `{ manifest, fileSha256 }`.
// The marketplace verifies the signature with the publisher's public key
// at upload time; the editor re-verifies at install time and on every
// activation.
//
// This module provides:
//
//   • generateKeyPair() — produce a fresh Ed25519 key pair.  CLI tooling
//     (`pryzm publish`) calls this once per publisher and stores the
//     private key in the OS keychain; the public key is uploaded to the
//     marketplace `publishers` table at registration time.
//   • signPayload() / verifyPayload() — pure crypto operations over
//     `Uint8Array` payloads.  No HTTP, no IO.
//   • makePluginSignature() — convenience wrapper that builds the
//     canonical payload from `(manifest, fileSha256)` and signs it.
//   • verifyPluginSignature() — the inverse; used by the editor at
//     install time and the marketplace at upload time.
//   • RevocationList — in-memory revocation registry; the marketplace
//     fetches revocations from a CRL endpoint and the editor caches
//     them locally.  ADR-0038 Decision D requires this infra for the
//     1.0.0 publish gate.
//
// Implementation: `node:crypto` Ed25519 in node; Web Crypto API
// SubtleCrypto in the browser.  We do runtime detection rather than
// branch at build time so this single file ships in both environments
// (the SDK is consumed by the marketplace API and by the editor).

import { canonicalJSONStringify } from './canonical-json';
import type { PluginManifest } from './descriptor';

/**
 * The signed-payload shape — exactly the fields hashed before signing.
 * Stable; any addition is a v2.0 change per ADR-0038 schema-lock policy
 * (signature verification breaks for any payload-shape drift).
 */
export interface SignaturePayload {
  /** The manifest the signature attests to.  Verified byte-equal at install. */
  readonly manifest: PluginManifest;
  /** SHA-256 hex-lowercase of the plugin's tarball (excluding the .sig sidecar). */
  readonly fileSha256: string;
  /** RFC 3339 instant when the publisher signed.  Never-trusted; for audit only. */
  readonly signedAt: string;
}

export interface PluginSignature {
  /** The exact bytes that were signed (re-derivable from canonical-JSON of payload). */
  readonly payload: SignaturePayload;
  /** Base64 (RFC 4648 §4) of the Ed25519 64-byte signature. */
  readonly signatureB64: string;
  /** Base64 of the publisher's 32-byte Ed25519 public key. */
  readonly publisherPublicKeyB64: string;
}

export interface KeyPair {
  /** Base64 of the 32-byte private key (Ed25519 SK). */
  readonly privateKeyB64: string;
  /** Base64 of the 32-byte public key (Ed25519 PK). */
  readonly publicKeyB64: string;
}

// ────────────────────────────────────────────────────────────────────────────
//  Runtime adapter — node vs browser
// ────────────────────────────────────────────────────────────────────────────

interface CryptoAdapter {
  generateKeyPair(): Promise<KeyPair>;
  sign(privateKeyB64: string, message: Uint8Array): Promise<string>;
  verify(publicKeyB64: string, message: Uint8Array, signatureB64: string): Promise<boolean>;
  sha256Hex(bytes: Uint8Array): Promise<string>;
}

let _adapter: CryptoAdapter | null = null;

async function getAdapter(): Promise<CryptoAdapter> {
  if (_adapter !== null) return _adapter;
  // Node has `node:crypto` since v12; we require Node ≥ 20 per package.json.
  // In the browser, `node:crypto` is unresolvable so the dynamic import
  // throws — we fall through to the WebCrypto adapter.
  if (typeof process !== 'undefined' && process.versions?.node) {
    _adapter = await makeNodeAdapter();
  } else {
    _adapter = makeWebCryptoAdapter();
  }
  return _adapter;
}

async function makeNodeAdapter(): Promise<CryptoAdapter> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — dynamic import guarded by process.versions.node check above;
  // never reached in the browser.  @vite-ignore suppresses the Vite build
  // "externalized for browser compatibility" warning for this intentional
  // Node-only code path.
  const nodeCrypto = await import(/* @vite-ignore */ 'node:crypto');
  return {
    async generateKeyPair() {
      const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('ed25519');
      // PKCS#8 + SPKI export, then strip headers to get the raw 32-byte keys.
      const rawPrivate = privateKey.export({ format: 'der', type: 'pkcs8' });
      const rawPublic = publicKey.export({ format: 'der', type: 'spki' });
      // Ed25519 PKCS#8: last 32 bytes of the DER are the raw private key.
      // Ed25519 SPKI:  last 32 bytes of the DER are the raw public key.
      const sk = rawPrivate.subarray(rawPrivate.length - 32);
      const pk = rawPublic.subarray(rawPublic.length - 32);
      return {
        privateKeyB64: bytesToB64(sk),
        publicKeyB64: bytesToB64(pk),
      };
    },
    async sign(privateKeyB64, message) {
      const sk = b64ToBytes(privateKeyB64);
      // Reconstruct the PKCS#8 envelope around the 32-byte SK.
      const pkcs8 = Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.from(sk),
      ]);
      const keyObj = nodeCrypto.createPrivateKey({
        key: pkcs8,
        format: 'der',
        type: 'pkcs8',
      });
      const sig = nodeCrypto.sign(null, Buffer.from(message), keyObj);
      return bytesToB64(sig);
    },
    async verify(publicKeyB64, message, signatureB64) {
      const pk = b64ToBytes(publicKeyB64);
      const spki = Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(pk),
      ]);
      const keyObj = nodeCrypto.createPublicKey({
        key: spki,
        format: 'der',
        type: 'spki',
      });
      try {
        return nodeCrypto.verify(
          null,
          Buffer.from(message),
          keyObj,
          Buffer.from(b64ToBytes(signatureB64)),
        );
      } catch {
        return false;
      }
    },
    async sha256Hex(bytes) {
      return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
    },
  };
}

function makeWebCryptoAdapter(): CryptoAdapter {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('No crypto.subtle available — Ed25519 signing unsupported in this environment.');
  }
  return {
    async generateKeyPair() {
      const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      const sk = await subtle.exportKey('raw', (kp as CryptoKeyPair).privateKey).catch(async () => {
        // Some browsers reject raw export of Ed25519 SK; fall back to PKCS#8.
        const pkcs8 = await subtle.exportKey('pkcs8', (kp as CryptoKeyPair).privateKey);
        return new Uint8Array(pkcs8).subarray(-32);
      });
      const pk = await subtle.exportKey('raw', (kp as CryptoKeyPair).publicKey);
      return {
        privateKeyB64: bytesToB64(new Uint8Array(sk)),
        publicKeyB64: bytesToB64(new Uint8Array(pk)),
      };
    },
    async sign(privateKeyB64, message) {
      const skBytes = b64ToBytes(privateKeyB64);
      const key = await subtle.importKey(
        'raw',
        new Uint8Array(skBytes),
        { name: 'Ed25519' },
        false,
        ['sign'],
      );
      const sig = await subtle.sign({ name: 'Ed25519' }, key, new Uint8Array(message));
      return bytesToB64(new Uint8Array(sig));
    },
    async verify(publicKeyB64, message, signatureB64) {
      const pkBytes = b64ToBytes(publicKeyB64);
      const key = await subtle.importKey(
        'raw',
        new Uint8Array(pkBytes),
        { name: 'Ed25519' },
        false,
        ['verify'],
      );
      try {
        return await subtle.verify(
          { name: 'Ed25519' },
          key,
          new Uint8Array(b64ToBytes(signatureB64)),
          new Uint8Array(message),
        );
      } catch {
        return false;
      }
    },
    async sha256Hex(bytes) {
      const hash = await subtle.digest('SHA-256', new Uint8Array(bytes));
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Public API
// ────────────────────────────────────────────────────────────────────────────

export async function generateKeyPair(): Promise<KeyPair> {
  return (await getAdapter()).generateKeyPair();
}

export async function signPayload(
  privateKeyB64: string,
  payload: Uint8Array,
): Promise<string> {
  return (await getAdapter()).sign(privateKeyB64, payload);
}

export async function verifyPayload(
  publicKeyB64: string,
  payload: Uint8Array,
  signatureB64: string,
): Promise<boolean> {
  return (await getAdapter()).verify(publicKeyB64, payload, signatureB64);
}

export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  return (await getAdapter()).sha256Hex(bytes);
}

/**
 * Build + sign a complete plugin signature.  Caller computes the
 * tarball SHA externally (via `sha256OfBytes`) and passes it in.
 */
export async function makePluginSignature(opts: {
  manifest: PluginManifest;
  fileSha256: string;
  publisherKey: KeyPair;
  signedAt?: string;
}): Promise<PluginSignature> {
  const payload: SignaturePayload = {
    manifest: opts.manifest,
    fileSha256: opts.fileSha256,
    signedAt: opts.signedAt ?? new Date().toISOString(),
  };
  const canonicalBytes = new TextEncoder().encode(canonicalJSONStringify(payload));
  const signatureB64 = await signPayload(opts.publisherKey.privateKeyB64, canonicalBytes);
  return {
    payload,
    signatureB64,
    publisherPublicKeyB64: opts.publisherKey.publicKeyB64,
  };
}

export type VerifyPluginSignatureResult =
  | { ok: true; payload: SignaturePayload }
  | {
      ok: false;
      reason:
        | 'signature-invalid'
        | 'manifest-mismatch'
        | 'tarball-mismatch'
        | 'publisher-revoked'
        | 'plugin-revoked';
    };

/**
 * Verify a plugin signature against the manifest + tarball it travels
 * with, checking the revocation list as a final gate.
 */
export async function verifyPluginSignature(
  signature: PluginSignature,
  expected: { manifest: PluginManifest; fileSha256: string },
  revocations?: RevocationList,
): Promise<VerifyPluginSignatureResult> {
  // 1. Manifest equality (canonical-JSON byte equality).
  const sigManifestCanon = canonicalJSONStringify(signature.payload.manifest);
  const expManifestCanon = canonicalJSONStringify(expected.manifest);
  if (sigManifestCanon !== expManifestCanon) {
    return { ok: false, reason: 'manifest-mismatch' };
  }
  // 2. File-hash equality.
  if (signature.payload.fileSha256 !== expected.fileSha256) {
    return { ok: false, reason: 'tarball-mismatch' };
  }
  // 3. Cryptographic verification.
  const canonicalBytes = new TextEncoder().encode(canonicalJSONStringify(signature.payload));
  const ok = await verifyPayload(
    signature.publisherPublicKeyB64,
    canonicalBytes,
    signature.signatureB64,
  );
  if (!ok) {
    return { ok: false, reason: 'signature-invalid' };
  }
  // 4. Revocation gate.
  if (revocations) {
    if (revocations.isPublisherRevoked(signature.publisherPublicKeyB64)) {
      return { ok: false, reason: 'publisher-revoked' };
    }
    const pluginKey = `${signature.payload.manifest.id}@${signature.payload.manifest.version}`;
    if (revocations.isPluginRevoked(pluginKey)) {
      return { ok: false, reason: 'plugin-revoked' };
    }
  }
  return { ok: true, payload: signature.payload };
}

// ────────────────────────────────────────────────────────────────────────────
//  Revocation list — ADR-0038 §Decision D requires this for the 1.0 gate.
// ────────────────────────────────────────────────────────────────────────────

/**
 * In-memory revocation registry.  The marketplace publishes a JSON CRL
 * at `/api/v1/marketplace/revocations.json`; the editor refreshes it on
 * startup + every 12 h.  This class is the parsed, lookup-optimised
 * shape consumers see.
 */
export class RevocationList {
  private readonly publisherSet: Set<string>;
  private readonly pluginSet: Set<string>;
  /** ISO timestamp the source CRL was issued at. */
  public readonly issuedAt: string;

  constructor(opts: {
    revokedPublisherKeysB64?: readonly string[];
    revokedPluginIdAtVersion?: readonly string[];
    issuedAt?: string;
  } = {}) {
    this.publisherSet = new Set(opts.revokedPublisherKeysB64 ?? []);
    this.pluginSet = new Set(opts.revokedPluginIdAtVersion ?? []);
    this.issuedAt = opts.issuedAt ?? new Date().toISOString();
  }

  isPublisherRevoked(publicKeyB64: string): boolean {
    return this.publisherSet.has(publicKeyB64);
  }

  /** key shape: `'<plugin-id>@<version>'` (e.g. `'wall-counter@1.2.3'`). */
  isPluginRevoked(idAtVersion: string): boolean {
    return this.pluginSet.has(idAtVersion);
  }

  size(): { publishers: number; plugins: number } {
    return { publishers: this.publisherSet.size, plugins: this.pluginSet.size };
  }

  /** Static parse helper for the published CRL JSON shape. */
  static fromCrlJSON(json: unknown): RevocationList {
    if (typeof json !== 'object' || json === null) {
      throw new Error('CRL JSON must be an object');
    }
    const j = json as Record<string, unknown>;
    return new RevocationList({
      revokedPublisherKeysB64: Array.isArray(j['revokedPublisherKeysB64']) ? (j['revokedPublisherKeysB64'] as string[]) : [],
      revokedPluginIdAtVersion: Array.isArray(j['revokedPluginIdAtVersion']) ? (j['revokedPluginIdAtVersion'] as string[]) : [],
      ...(typeof j['issuedAt'] === 'string' ? { issuedAt: j['issuedAt'] as string } : {}),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
