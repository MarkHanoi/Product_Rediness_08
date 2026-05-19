---
title: Distribution
description: How to sign, publish, and ship updates for a PRYZM plugin via the marketplace.
---

# Distribution

Once you've validated your plugin works locally with `pryzm dev`, the
next step is signing it and submitting to the PRYZM marketplace.

> **Status (S63):** the marketplace API is in active development for
> S64. Until then you can sign locally and side-load via
> **Settings → Developer → Local plugins**. This page documents the
> publish flow as it will work at S64 GA.

## 1. Generate a publisher key pair

```ts
import { generateKeyPair } from '@pryzm/plugin-sdk/signing';

const kp = await generateKeyPair();
console.log('Private key:', kp.privateKeyB64);  // store in OS keychain
console.log('Public key:',  kp.publicKeyB64);   // upload to marketplace publisher record
```

The key pair is **Ed25519** (32-byte raw keys, base64-encoded). Store
the private key in your operating system's keychain; the public key is
uploaded once to the marketplace at publisher-registration time and
identifies all your future plugin signatures.

## 2. Build the tarball

```sh
npm pack
# → my-plugin-0.1.0.tgz
```

## 3. Compute the file hash

```ts
import { readFileSync } from 'node:fs';
import { sha256OfBytes } from '@pryzm/plugin-sdk/signing';

const tarballBytes = readFileSync('my-plugin-0.1.0.tgz');
const fileSha256 = await sha256OfBytes(tarballBytes);
```

## 4. Sign the manifest + hash

```ts
import { makePluginSignature } from '@pryzm/plugin-sdk/signing';

const signature = await makePluginSignature({
  manifest: JSON.parse(readFileSync('plugin.manifest.json', 'utf-8')),
  fileSha256,
  publisherKey: kp,
});
```

`signature` is the wire shape:

```ts
{
  payload: { manifest, fileSha256, signedAt },
  signatureB64: '...',                    // 64 bytes Ed25519 signature
  publisherPublicKeyB64: '...'            // 32 bytes Ed25519 public key
}
```

The signature is computed over a canonical-JSON encoding of `payload`
(RFC 8785 simplified — sorted keys, no whitespace). Tampering with any
manifest field, the file hash, or the timestamp invalidates the
signature.

## 5. Submit to the marketplace

The marketplace API exposes `POST /plugins/{id}/versions` (preview):

```sh
curl -X POST https://marketplace.pryzm.com/plugins/my-plugin/versions \
  -H "Authorization: Bearer ${PUBLISHER_TOKEN}" \
  -F "tarball=@my-plugin-0.1.0.tgz" \
  -F "signature=$(cat signature.json)"
```

The marketplace re-runs `verifyPluginSignature(...)` and rejects the
upload if any of the four checks fail:

1. Manifest equality (canonical-JSON byte equality).
2. File-hash equality.
3. Cryptographic signature verification.
4. Revocation list lookup (publisher revoked? plugin@version revoked?).

## 6. Editor verification

When a user installs the plugin, the editor downloads the tarball,
re-runs the same `verifyPluginSignature`, and rejects the install if
any check fails. **Verification happens again on every activation** —
a published-then-revoked plugin will fail to mount on its next session.

## Revocation

The marketplace publishes a CRL (certificate revocation list) at
`/api/v1/marketplace/revocations.json`:

```json
{
  "issuedAt": "2026-04-28T12:00:00Z",
  "revokedPublisherKeysB64": ["..."],
  "revokedPluginIdAtVersion": ["evil-plugin@1.2.3"]
}
```

The editor refreshes the CRL on startup and every 12 hours. When a
revocation lands:

- Existing installs of revoked plugins fail to mount on next activation.
- New installs of revoked publishers are blocked at upload time.
- Revoked plugins are hidden from marketplace search.

## Updating an existing plugin

Bump the manifest's `version` field (strict semver), re-pack, re-sign,
and submit. The host honours `onUpdate(prev, next)` between activations:

```ts
export default definePlugin({
  async onUpdate(prev, next) {
    // Migrate persisted plugin state.
    // If this throws, the host rolls back to the previous version.
  },
  async onActivate(ctx) { /* ... */ },
});
```

The host atomically deactivates the old version, calls `onUpdate`, then
activates the new version. If `onUpdate` throws OR exceeds the 5-second
budget (`HOOK_TIMEOUT_MS`), the upgrade is rolled back and the user
keeps the previous version.

## Pricing models

The marketplace supports three pricing models declared in the manifest:

| `pricingModel` | Notes |
|---|---|
| `"free"` | No charge. Default. |
| `"one-time"` | One charge per workspace. `pricingAmount` + `pricingCurrency` required. |
| `"subscription"` | Recurring monthly. Same fields. |

Revenue split, payout cadence, and tax handling are documented in the
publisher dashboard (S64+).

## See also

- [`packages/plugin-sdk/src/signing.ts`](https://github.com/pryzm-com/pryzm/blob/main/packages/plugin-sdk/src/signing.ts) — implementation.
- [Sandbox Model](/plugin-sdk/sandbox) — what isolation the host enforces.
- The marketplace API — separate docs landing at S64.
