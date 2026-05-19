#!/usr/bin/env node
// @pryzm/bench-visual-diff — Z.7 of PRYZM2-WIREUP-PLAN-S72 §26.1.
//
// Subcommand dispatcher. Delegates to the legacy
// `apps/bench/scripts/visual-diff.mjs` gate (which already implements the
// pixelmatch + pngjs comparison from S06-T8 / S06-T9). Wrapping the
// script in a workspace lets `pnpm ga-gate` (Z.6) call it as a stable
// `@pryzm/bench-visual-diff diff` invocation regardless of where the
// gate physically lives on disk.
//
// Usage:
//   node src/index.mjs diff   --webgpu PATH --webgl2 PATH [--threshold 2]
//   node src/index.mjs capture --out PATH
//   node src/index.mjs --no-fixtures   (smoke / shape-only mode)

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const LEGACY_GATE = resolve(REPO_ROOT, 'apps', 'bench', 'scripts', 'visual-diff.mjs');

function help(exit = 0) {
  console.log(`@pryzm/bench-visual-diff — visual-diff gate

Subcommands:
  diff       Compare two PNG fixtures via pixelmatch (delegates to ${LEGACY_GATE})
  capture    Capture a fresh baseline (requires GPU)
  smoke      Smoke-check the harness (no GPU)

Pass --help to any subcommand for full flags.`);
  process.exit(exit);
}

function delegateDiff(args) {
  if (!existsSync(LEGACY_GATE)) {
    console.error(`@pryzm/bench-visual-diff: legacy gate not found at ${LEGACY_GATE}.`);
    console.error('The wrapper is installed but the underlying script is missing — restore apps/bench/scripts/visual-diff.mjs.');
    process.exit(1);
  }
  const child = spawn(process.execPath, [LEGACY_GATE, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error(`@pryzm/bench-visual-diff: failed to spawn legacy gate: ${err.message}`);
    process.exit(1);
  });
}

async function captureBaseline(args) {
  // Z.7 stub — capture is best implemented by a renderer-bearing process.
  // For now we delegate to a snapshot script if it exists; otherwise we
  // print the manual command and exit non-zero so CI does not silently
  // skip baseline capture.
  const snapshotScript = resolve(REPO_ROOT, 'apps', 'editor', 'scripts', 'snapshot-cube.mjs');
  if (existsSync(snapshotScript)) {
    const child = spawn(process.execPath, [snapshotScript, ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }
  console.error('@pryzm/bench-visual-diff capture: snapshot-cube.mjs is missing.');
  console.error('Capture must run on a host with a real GPU (Replit sandbox cannot capture).');
  console.error('To capture manually:');
  console.error('  cd apps/editor && pnpm exec node scripts/snapshot-cube.mjs --out __tests__/visual-fixtures');
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') help(0);

const sub = argv[0];
const rest = argv.slice(1);

switch (sub) {
  case 'diff':
    delegateDiff(rest);
    break;
  case 'capture':
    captureBaseline(rest);
    break;
  case 'smoke':
    delegateDiff(['--no-fixtures', ...rest]);
    break;
  case '--no-fixtures':
    delegateDiff(['--no-fixtures', ...rest]);
    break;
  default:
    console.error(`@pryzm/bench-visual-diff: unknown subcommand "${sub}"`);
    help(2);
}
