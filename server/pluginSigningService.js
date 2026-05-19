/**
 * server/pluginSigningService.js
 *
 * Server-side Ed25519 plugin signature verification (Task 6.3 — C07 §3).
 *
 * Mirrors the logic in packages/plugin-sdk/src/signing.ts using Node.js
 * `crypto` module only — no browser polyfill, no TypeScript dependency at
 * runtime.  This module is imported by the marketplace routes in server.js.
 *
 * Ed25519 SPKI DER header (12 bytes):
 *   30 2a — SEQUENCE (42 bytes total)
 *     30 05 — SEQUENCE (5 bytes)
 *       06 03 2b 65 70 — OID 1.3.101.112 (id-EdDSA / Ed25519)
 *     03 21 00 — BIT STRING (33 bytes: 0 unused bits + 32-byte key)
 *   <32 bytes raw public key>
 *
 * Contract: C07 §3 — "An unsigned or signature-mismatch plugin MUST be
 * rejected at install time with a clear user error."
 */

import { createPublicKey, verify as nodeCryptoVerify } from 'node:crypto';

/** Ed25519 SubjectPublicKeyInfo (SPKI) DER header — wraps a raw 32-byte key. */
const ED25519_SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Canonical JSON stringify — must be byte-identical to the client-side
 * implementation in packages/plugin-sdk/src/canonical-json.ts.
 * Keys sorted lexicographically; values recursively stringified.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJSONStringify(value) {
    if (value === null) return 'null';
    if (typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map(canonicalJSONStringify).join(',') + ']';
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJSONStringify(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
}

/**
 * Verify an Ed25519 plugin signature using Node.js crypto.
 *
 * @param {object} signature  — PluginSignature { payload, signatureB64, publisherPublicKeyB64 }
 * @param {object} expected   — { manifest: PluginManifest, fileSha256: string }
 * @returns {Promise<{ ok: true, payload: object } | { ok: false, reason: string }>}
 */
export async function verifyPluginSignatureNode(signature, expected) {
    try {
        if (!signature || typeof signature !== 'object') {
            return { ok: false, reason: 'signature-invalid' };
        }
        const { payload, signatureB64, publisherPublicKeyB64 } = signature;
        if (!payload || !signatureB64 || !publisherPublicKeyB64) {
            return { ok: false, reason: 'signature-invalid' };
        }

        // 1. Manifest equality (canonical-JSON byte equality)
        const sigManifestCanon = canonicalJSONStringify(payload.manifest);
        const expManifestCanon = canonicalJSONStringify(expected.manifest);
        if (sigManifestCanon !== expManifestCanon) {
            return { ok: false, reason: 'manifest-mismatch' };
        }

        // 2. File-hash equality
        if (payload.fileSha256 !== expected.fileSha256) {
            return { ok: false, reason: 'tarball-mismatch' };
        }

        // 3. Ed25519 cryptographic verification
        const canonicalBytes = Buffer.from(canonicalJSONStringify(payload), 'utf8');
        const sigBytes = Buffer.from(signatureB64, 'base64');
        const pubKeyRaw = Buffer.from(publisherPublicKeyB64, 'base64');

        if (pubKeyRaw.length !== 32) {
            return { ok: false, reason: 'signature-invalid' };
        }

        // Wrap raw 32-byte key in SPKI DER envelope for Node.js crypto
        const derKey = Buffer.concat([ED25519_SPKI_HEADER, pubKeyRaw]);
        const cryptoKey = createPublicKey({ key: derKey, format: 'der', type: 'spki' });

        const isValid = nodeCryptoVerify(null, canonicalBytes, cryptoKey, sigBytes);
        if (!isValid) {
            return { ok: false, reason: 'signature-invalid' };
        }

        return { ok: true, payload };
    } catch (err) {
        console.error('[pluginSigningService] Verification error:', err.message);
        return { ok: false, reason: 'signature-invalid' };
    }
}

/**
 * Check whether a public key is registered for a given publisher.
 * Returns the key row if found and not revoked, null otherwise.
 *
 * @param {object} pool     — pg Pool
 * @param {string} publisherId
 * @param {string} publicKeyB64
 * @returns {Promise<object|null>}
 */
export async function lookupPublisherKey(pool, publisherId, publicKeyB64) {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM plugin_publisher_keys
             WHERE publisher_id = $1
               AND public_key_b64 = $2
               AND revoked_at IS NULL`,
            [publisherId, publicKeyB64],
        );
        return rows[0] ?? null;
    } catch {
        return null;
    }
}

/**
 * Fetch the current revocation list from the DB.
 *
 * @param {object} pool — pg Pool
 * @returns {Promise<{ revokedPublisherKeysB64: string[], revokedPluginIdAtVersion: string[], issuedAt: string }>}
 */
export async function fetchRevocationList(pool) {
    try {
        const { rows } = await pool.query(
            `SELECT revocation_type, target FROM plugin_revocations ORDER BY revoked_at DESC`,
        );
        const revokedPublisherKeysB64 = rows
            .filter(r => r.revocation_type === 'publisher')
            .map(r => r.target);
        const revokedPluginIdAtVersion = rows
            .filter(r => r.revocation_type === 'plugin')
            .map(r => r.target);
        return {
            revokedPublisherKeysB64,
            revokedPluginIdAtVersion,
            issuedAt: new Date().toISOString(),
        };
    } catch {
        return { revokedPublisherKeysB64: [], revokedPluginIdAtVersion: [], issuedAt: new Date().toISOString() };
    }
}
