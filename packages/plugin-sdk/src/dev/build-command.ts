// @pryzm/plugin-sdk — `pryzm build` command (Phase F S62 D4).
//
// Validates plugin.manifest.json against the locked schema, optionally runs
// a custom build command, then verifies the resulting bundle exists and
// computes its SHA-256 (needed for the publish signature payload).
//
// Exit codes:
//   0 — build successful, manifest valid
//   1 — manifest validation failed
//   2 — manifest file missing / unreadable
//   3 — build command failed
//   4 — argv parse error
//   5 — bundle file missing after build
//
// Usage:
//   pryzm build
//   pryzm build --manifest plugin.manifest.json --build-cmd "tsup" --bundle dist/index.js

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateManifest } from '../descriptor.js';

interface BuildArgs {
  manifestPath: string;
  buildCmd: string | null;
  bundlePath: string | null;
}

function parseArgs(argv: readonly string[]): BuildArgs {
  const args: BuildArgs = {
    manifestPath: 'plugin.manifest.json',
    buildCmd: null,
    bundlePath: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest' && argv[i + 1]) {
      args.manifestPath = String(argv[i + 1]);
      i += 1;
    } else if (a === '--build-cmd' && argv[i + 1]) {
      args.buildCmd = String(argv[i + 1]);
      i += 1;
    } else if (a === '--bundle' && argv[i + 1]) {
      args.bundlePath = String(argv[i + 1]);
      i += 1;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`pryzm build: unknown argument '${a}'`);
      process.exit(4);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(
    [
      'Usage: pryzm build [options]',
      '',
      'Options:',
      '  --manifest <path>   Path to plugin.manifest.json (default: ./plugin.manifest.json)',
      '  --build-cmd <cmd>   Shell command to compile the plugin (e.g. "tsup")',
      '  --bundle <path>     Path to the compiled JS bundle for SHA-256 computation',
      '  -h, --help          Show this help',
      '',
      'Examples:',
      '  pryzm build',
      '  pryzm build --build-cmd "tsup src/index.ts --format esm --out-dir dist" --bundle dist/index.js',
    ].join('\n'),
  );
}

function readAndValidateManifest(manifestPath: string) {
  const abs = resolve(manifestPath);
  if (!existsSync(abs)) {
    console.error(`pryzm build: manifest not found at '${abs}'`);
    process.exit(2);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, 'utf-8'));
  } catch (err) {
    console.error(`pryzm build: cannot parse '${abs}': ${(err as Error).message}`);
    process.exit(2);
  }

  const result = validateManifest(raw);
  if (!result.ok) {
    console.error('pryzm build: manifest validation FAILED:');
    for (const e of result.errors) console.error(`  ✗  ${e}`);
    process.exit(1);
  }

  console.log(`  ✔  manifest valid: ${result.manifest.id} v${result.manifest.version}`);
  console.log(`     ${result.manifest.permissions.length} permissions, ${result.manifest.contributions.length} contributions`);
  return result.manifest;
}

async function runBuildCmd(buildCmd: string): Promise<void> {
  const t0 = performance.now();
  console.log(`\n  Running build: ${buildCmd}`);
  await new Promise<void>((res, rej) => {
    const child = spawn(buildCmd, { shell: true, stdio: 'inherit' });
    child.on('exit', (code) => {
      const ms = (performance.now() - t0).toFixed(0);
      if (code === 0) {
        console.log(`  ✔  build completed in ${ms} ms`);
        res();
      } else {
        console.error(`  ✗  build command exited with code ${code} after ${ms} ms`);
        process.exit(3);
      }
    });
    child.on('error', rej);
  });
}

function computeSha256(bundlePath: string): string {
  const abs = resolve(bundlePath);
  if (!existsSync(abs)) {
    console.error(`pryzm build: bundle not found at '${abs}' (did the build command run?)`);
    process.exit(5);
  }
  const bytes = readFileSync(abs);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const size = statSync(abs).size;
  console.log(`  ✔  bundle: ${abs}`);
  console.log(`     size:      ${(size / 1024).toFixed(1)} KB`);
  console.log(`     sha256:    ${hash}`);
  return hash;
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const t0 = performance.now();

  console.log('\npryzm build\n');

  // 1. Validate manifest.
  console.log('Step 1/3 — Validating manifest…');
  const manifest = readAndValidateManifest(args.manifestPath);

  // 2. Run build command (optional).
  if (args.buildCmd) {
    console.log('\nStep 2/3 — Building…');
    await runBuildCmd(args.buildCmd);
  } else {
    console.log('\nStep 2/3 — Skipped (no --build-cmd provided)');
  }

  // 3. Compute bundle SHA-256 (optional, but shown for publish prep).
  if (args.bundlePath) {
    console.log('\nStep 3/3 — Bundle integrity…');
    const sha256 = computeSha256(args.bundlePath);
    const totalMs = (performance.now() - t0).toFixed(0);
    console.log(`\n✓ ${manifest.id} v${manifest.version} — build ready in ${totalMs} ms`);
    console.log(`\nTo publish, run:`);
    console.log(`  pryzm publish --bundle ${args.bundlePath} --key <path/to/publisher.jwk>`);
    void sha256;
  } else {
    const totalMs = (performance.now() - t0).toFixed(0);
    console.log(`\n✓ ${manifest.id} v${manifest.version} — manifest valid (${totalMs} ms)`);
    console.log('\nTip: add --bundle <path> to also verify the compiled output.');
  }
}
