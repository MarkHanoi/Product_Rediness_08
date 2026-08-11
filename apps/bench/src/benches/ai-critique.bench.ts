// Bench: `ai-critique` — NFT 14.
//
// ############################################################################
// ##  NFT 14 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 14 target: < 8 s e2e
// Environment the contract's quantity actually lives in: network
//
// WHY IT CANNOT BE MEASURED HERE:
//   C10 says 'e2e', which is dominated by LLM API latency. CI has no API k
//   ey, and a merge gate must not depend on a third-party SLA.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   computeCostUSD() arithmetic - sub-microsecond pure JS, asserted < 3000
//    ms. That assertion can never fail and therefore carries zero informat
//   ion.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 14, measurability: 'not-yet-measurable'), and `nftLimit(14)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeCostUSD, CostMeter } from '@pryzm/ai-cost';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 500;
const SAMPLES = 5_000;

describe('[NOT-YET-MEASURABLE NFT 14] ai-critique', () => {
  it('computeCostUSD + CostMeter budget check is the NFT-14 headless proxy', () => {
    const meter = new CostMeter();

    // Representative AI critique call: 2k input tokens, 500 output tokens, sonnet.
    const INPUT_TOKENS = 2_000;
    const OUTPUT_TOKENS = 500;

    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      computeCostUSD('sonnet', INPUT_TOKENS, OUTPUT_TOKENS);
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      computeCostUSD('sonnet', INPUT_TOKENS, OUTPUT_TOKENS);
      // Simulate the pre-call budget check path.
      meter.checkBudget({
        model: 'sonnet',
        inputTokens: INPUT_TOKENS,
        outputTokens: OUTPUT_TOKENS,
        surface: 'ai.element-creator',
        plan: 'team',
        projectId: 'bench-proj',
        userId: 'bench-user',
      });
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'ai-critique.json'),
      JSON.stringify({
        name: 'ai-critique',
        p50,
        p95,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 3000,
        notes:
          'NFT-14 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures computeCostUSD() ' +
          '+ CostMeter.checkBudget() latency (pure JS cost gate overhead). ' +
          'LLM API network latency and streaming start are measured in the ' +
          'AI-host integration test and apps/editor-bench/ (Wave 13).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    // Cost gate must be negligible relative to the 3 s NFT-14 target.
    expect(p95).toBeLessThan(3000);
  });
});
