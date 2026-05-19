// @pryzm/plugin-sdk — `pryzm publish` command (Phase F S62 D9).
//
// Signs the plugin bundle with an Ed25519 key pair and submits it to the
// PRYZM Marketplace for review. Workflow:
//
//   1. Validate plugin.manifest.json (same as `pryzm build` step 1).
//   2. Load (or generate) an Ed25519 key pair from --key or PRYZM_PUBLISHER_KEY env var.
//   3. Compute SHA-256 of the compiled bundle.
//   4. Build the canonical SignaturePayload { manifest, fileSha256, signedAt }.
//   5. Sign the canonical JSON with the Ed25519 private key.
//   6. POST to POST /marketplace/api/plugins/submit with { manifest, signature }.
//   7. Print the review ID returned by the server.
//
// Exit codes:
//   0 — submission received, review ID printed
//   1 — manifest invalid
//   2 — manifest / bundle / key file missing or unreadable
//   3 — signing failed
//   4 — argv parse error
//   5 — submission HTTP error
//
// Usage:
//   pryzm publish --bundle dist/index.js --key ~/.pryzm/publisher.jwk
//   pryzm publish --bundle dist/index.js --key ~/.pryzm/publisher.jwk --token <bearer>
//   pryzm publish --bundle dist/index.js --marketplace https://app.pryzm.com
//   pryzm publish keygen --out ~/.pryzm/publisher.jwk

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { validateManifest } from '../descriptor.js';
import {
  generateKeyPair,
  makePluginSignature,
} from '../signing.js';

interface PublishArgs {
  subcommand: 'submit' | 'keygen';
  manifestPath: string;
  bundlePath: string | null;
  keyPath: string | null;
  marketplaceUrl: string;
  token: string | null;
  keygenOut: string | null;
}

const DEFAULT_MARKETPLACE = 'https://app.pryzm.com';

function parseArgs(argv: readonly string[]): PublishArgs {
  const args: PublishArgs = {
    subcommand: 'submit',
    manifestPath: 'plugin.manifest.json',
    bundlePath: null,
    keyPath: null,
    marketplaceUrl: process.env.PRYZM_MARKETPLACE_URL ?? DEFAULT_MARKETPLACE,
    token: process.env.PRYZM_PUBLISHER_TOKEN ?? null,
    keygenOut: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'keygen') {
      args.subcommand = 'keygen';
    } else if (a === '--out' && argv[i + 1]) {
      args.keygenOut = String(argv[i + 1]);
      i += 1;
    } else if (a === '--manifest' && argv[i + 1]) {
      args.manifestPath = String(argv[i + 1]);
      i += 1;
    } else if (a === '--bundle' && argv[i + 1]) {
      args.bundlePath = String(argv[i + 1]);
      i += 1;
    } else if ((a === '--key' || a === '--key-path') && argv[i + 1]) {
      args.keyPath = String(argv[i + 1]);
      i += 1;
    } else if (a === '--marketplace' && argv[i + 1]) {
      args.marketplaceUrl = String(argv[i + 1]);
      i += 1;
    } else if (a === '--token' && argv[i + 1]) {
      args.token = String(argv[i + 1]);
      i += 1;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`pryzm publish: unknown argument '${a}'`);
      process.exit(4);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(
    [
      'Usage:',
      '  pryzm publish [options]          Sign and submit a plugin for review',
      '  pryzm publish keygen --out <path>  Generate a new Ed25519 publisher key pair',
      '',
      'Options (submit):',
      '  --manifest <path>      Path to plugin.manifest.json (default: ./plugin.manifest.json)',
      '  --bundle <path>        Path to the compiled JS bundle (required)',
      '  --key <path>           Path to the Ed25519 JWK private key file',
      '                         (or set PRYZM_PUBLISHER_KEY env var)',
      '  --marketplace <url>    Marketplace base URL (default: https://app.pryzm.com)',
      '  --token <bearer>       PRYZM account Bearer token for authenticated submission',
      '                         (or set PRYZM_PUBLISHER_TOKEN env var)',
      '  -h, --help             Show this help',
      '',
      'Options (keygen):',
      '  --out <path>           Output path for the JWK key pair file',
      '',
      'Examples:',
      '  pryzm publish keygen --out ~/.pryzm/publisher.jwk',
      '  pryzm publish --bundle dist/index.js --key ~/.pryzm/publisher.jwk --token $TOKEN',
    ].join('\n'),
  );
}

async function runKeygen(outPath: string): Promise<void> {
  const absOut = resolve(outPath);
  const dir = dirname(absOut);
  mkdirSync(dir, { recursive: true });

  console.log('\nGenerating Ed25519 key pair…');
  const kp = await generateKeyPair();

  const jwk = JSON.stringify(
    { privateKeyB64: kp.privateKeyB64, publicKeyB64: kp.publicKeyB64, algorithm: 'Ed25519' },
    null,
    2,
  );
  writeFileSync(absOut, jwk, { mode: 0o600, encoding: 'utf-8' });

  console.log(`✓ Key pair written to ${absOut}`);
  console.log(`  Public key (share with PRYZM Marketplace):`);
  console.log(`  ${kp.publicKeyB64}`);
  console.log(`\n  Keep the private key secret — do not commit it to version control.`);
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.subcommand === 'keygen') {
    if (!args.keygenOut) {
      console.error('pryzm publish keygen: --out <path> is required');
      process.exit(4);
    }
    await runKeygen(args.keygenOut);
    return;
  }

  // ── Submit flow ─────────────────────────────────────────────────────────

  console.log('\npryzm publish\n');

  // 1. Validate manifest.
  console.log('Step 1/4 — Validating manifest…');
  const absManifest = resolve(args.manifestPath);
  if (!existsSync(absManifest)) {
    console.error(`pryzm publish: manifest not found at '${absManifest}'`);
    process.exit(2);
  }
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(absManifest, 'utf-8'));
  } catch (err) {
    console.error(`pryzm publish: cannot parse manifest: ${(err as Error).message}`);
    process.exit(2);
  }
  const validated = validateManifest(rawManifest);
  if (!validated.ok) {
    console.error('pryzm publish: manifest validation FAILED:');
    for (const e of validated.errors) console.error(`  ✗  ${e}`);
    process.exit(1);
  }
  const manifest = validated.manifest;
  console.log(`  ✔  ${manifest.id} v${manifest.version}`);

  // 2. Load bundle + compute SHA-256.
  console.log('\nStep 2/4 — Computing bundle SHA-256…');
  if (!args.bundlePath) {
    console.error('pryzm publish: --bundle <path> is required');
    process.exit(4);
  }
  const absBundlePath = resolve(args.bundlePath);
  if (!existsSync(absBundlePath)) {
    console.error(`pryzm publish: bundle not found at '${absBundlePath}'. Run \`pryzm build\` first.`);
    process.exit(2);
  }
  const bundleBytes = readFileSync(absBundlePath);
  const fileSha256 = createHash('sha256').update(bundleBytes).digest('hex');
  console.log(`  ✔  sha256: ${fileSha256} (${(bundleBytes.length / 1024).toFixed(1)} KB)`);

  // 3. Load key pair + sign.
  console.log('\nStep 3/4 — Signing…');
  const keyPath = args.keyPath ?? process.env.PRYZM_PUBLISHER_KEY_PATH ?? null;
  if (!keyPath) {
    console.error(
      'pryzm publish: Ed25519 key required.\n' +
      '  Use --key <path> or set PRYZM_PUBLISHER_KEY_PATH env var.\n' +
      '  To generate a key pair: pryzm publish keygen --out ~/.pryzm/publisher.jwk',
    );
    process.exit(4);
  }
  const absKeyPath = resolve(keyPath);
  if (!existsSync(absKeyPath)) {
    console.error(`pryzm publish: key file not found at '${absKeyPath}'`);
    process.exit(2);
  }

  let publisherKey: { privateKeyB64: string; publicKeyB64: string };
  try {
    const jwk = JSON.parse(readFileSync(absKeyPath, 'utf-8')) as Record<string, unknown>;
    const priv = String(jwk.privateKeyB64 ?? '');
    const pub  = String(jwk.publicKeyB64  ?? '');
    if (!priv) throw new Error('privateKeyB64 field missing or empty');
    if (!pub)  throw new Error('publicKeyB64 field missing or empty');
    publisherKey = { privateKeyB64: priv, publicKeyB64: pub };
  } catch (err) {
    console.error(`pryzm publish: cannot read key file: ${(err as Error).message}`);
    process.exit(3);
  }

  let signature: Awaited<ReturnType<typeof makePluginSignature>>;
  try {
    signature = await makePluginSignature({ manifest, fileSha256, publisherKey });
  } catch (err) {
    console.error(`pryzm publish: signing failed: ${(err as Error).message}`);
    process.exit(3);
  }
  console.log(`  ✔  signed (Ed25519, signatureB64 length: ${signature.signatureB64.length})`);

  // 4. Submit to marketplace.
  console.log(`\nStep 4/4 — Submitting to ${args.marketplaceUrl}…`);
  const submitUrl = `${args.marketplaceUrl.replace(/\/$/, '')}/marketplace/api/plugins/submit`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (args.token) headers['Authorization'] = `Bearer ${args.token}`;

  let resp: Response;
  try {
    resp = await fetch(submitUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ manifest, signature: signature.signatureB64 }),
    });
  } catch (err) {
    console.error(`pryzm publish: network error: ${(err as Error).message}`);
    process.exit(5);
  }

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = (j as { error?: string }).error ?? msg; } catch { /* ignore */ }
    console.error(`pryzm publish: submission rejected: ${msg}`);
    process.exit(5);
  }

  const result = await resp.json() as {
    ok: boolean;
    reviewId: string;
    message: string;
    estimatedReviewTime: string;
  };

  console.log(`\n✓ Plugin submitted for review!`);
  console.log(`  Review ID:             ${result.reviewId}`);
  console.log(`  Message:               ${result.message}`);
  console.log(`  Estimated review time: ${result.estimatedReviewTime}`);
  console.log(`\n  Save your review ID — you'll need it to check submission status.`);
}
