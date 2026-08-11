// Bench: `plugin-sandbox-overhead` — NFT 17.
//
// ############################################################################
// ##  NFT 17 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 17 target: < 5 % CPU vs native call
// Environment the contract's quantity actually lives in: browser
//
// WHY IT CANNOT BE MEASURED HERE:
//   The overhead is an iframe postMessage round-trip; Node has no iframe. 
//   C10 also states the budget as a RATIO (% vs a native call), which requ
//   ires both legs measured - this bench measures neither.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   buildPluginCSP() / manifest parse / JSON.stringify latency asserted < 
//   5 ms. NOTE THE UNIT DIFFERS from the contract (ms, not % of a native b
//   aseline).
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 17, measurability: 'not-yet-measurable'), and `nftLimit(17)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
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

describe('[NOT-YET-MEASURABLE NFT 17] plugin-sandbox-overhead', () => {
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
          'NFT-17 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures buildPluginCSP() ' +
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
