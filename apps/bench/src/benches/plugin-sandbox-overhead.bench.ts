// Bench: `plugin-sandbox-overhead` — NFT-17 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 17 — NFT 17: "Plugin sandbox overhead
//   | < 5 ms per message | apps/bench/src/benches/plugin-sandbox-overhead.bench.ts".
//
// What this file CAN measure (headless Node):
//   * `buildPluginCSP(manifest)` latency — the CSP policy generation that
//     runs once per iframe sandbox instantiation. This is the setup cost
//     for each plugin's sandbox frame.
//   * `buildIframeHeadHTML(manifest)` latency — the sandbox iframe head
//     HTML generation (CSP meta tag + nonce injection).
//   * `PluginManifestSchema.parse(raw)` latency — the manifest validation
//     cost that runs on every plugin activation.
//   * The per-message serialization overhead (measured via JSON.stringify
//     of a canonical SandboxMessage structure matching the bridge protocol).
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * Real iframe postMessage round-trip time (requires browser + DOM).
//   * iframe navigation and DOM isolation setup time.
//   * Plugin JS evaluation time inside the sandbox.
//
// NFT-17 production target: < 5 ms per message (plugin message overhead).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPluginCSP,
  buildIframeHeadHTML,
} from '@pryzm/plugin-sdk';
import { PluginManifestSchema } from '@pryzm/plugin-sdk';
import type { PluginManifest } from '@pryzm/plugin-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 500;
const SAMPLES = 5_000;

const RAW_MANIFEST = {
  pryzmPlugin: '1.0',
  id: 'bench-test-plugin',
  version: '1.0.0',
  displayName: 'Bench Test Plugin',
  description: 'Plugin sandbox overhead benchmark',
  author: 'PRYZM Bench',
  main: 'dist/index.js',
  permissions: [],
  allowedOrigins: [],
  contributions: [],
  minPRYZMVersion: '2.0.0',
};

describe('plugin-sandbox-overhead', () => {
  it('buildPluginCSP + buildIframeHeadHTML is the NFT-17 headless proxy', () => {
    const manifest = PluginManifestSchema.parse(RAW_MANIFEST) as PluginManifest;

    // Simulate per-message overhead: CSP policy + iframe head HTML generation.
    const runOnce = (): void => {
      buildPluginCSP(manifest);
      buildIframeHeadHTML(manifest);
      // Simulate serialization of a canonical sandbox message.
      JSON.stringify({
        kind: 'pryzm.command.executeResult',
        correlationId: 'bench-corr-001',
        payload: { ok: true, result: null },
      });
    };

    // Warmup
    for (let i = 0; i < WARMUP; i++) runOnce();

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      runOnce();
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'plugin-sandbox-overhead.json'),
      JSON.stringify({
        name: 'plugin-sandbox-overhead',
        p50,
        p95,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 5,
        notes:
          'NFT-17 headless proxy per 01-VISION.md §5. Measures buildPluginCSP() ' +
          '+ buildIframeHeadHTML() + message JSON serialize overhead. Full ' +
          'iframe postMessage round-trip is measured in apps/editor-bench/ ' +
          '(Wave 13 browser harness).',
      }, null, 2),
    );

    // Sandbox JS overhead must be a tiny fraction of the 5 ms NFT-17 budget.
    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(5);
  });
});
