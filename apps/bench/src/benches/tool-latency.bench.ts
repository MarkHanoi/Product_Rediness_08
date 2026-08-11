// Bench: `tool-latency` — NFT 3.
//
// ############################################################################
// ##  NFT 3 IS **NOT-YET-MEASURABLE**.  THIS FILE DOES NOT VERIFY C10.      
// ############################################################################
//
// C10 §1 row 3 target: < 50 ms p95
// Environment the contract's quantity actually lives in: browser
//
// WHY IT CANNOT BE MEASURED HERE:
//   '-> visible' is a frame-presented event. Node cannot observe presentat
//   ion.
//
// WHAT THIS FILE ACTUALLY MEASURES TODAY:
//   CommandBus wall.create dispatch latency - a genuine SUB-budget of NFT 
//   3, but not NFT 3.
//
// The assertion below is an internal sub-budget tripwire ONLY. It is NOT the
// C10 budget and passing it is NOT evidence the contract is met. The
// authoritative status lives in `@pryzm/perf-budgets` (NFT_TARGETS row
// 3, measurability: 'not-yet-measurable'), and `nftLimit(3)` THROWS by design
// so this file cannot borrow C10's number for a quantity C10 does not name.
//
// W5-1, 2026-08-11. The previous header cited `C10 §1 (this reference was previously to the deleted 01-VISION.md §5)`, a document
// deleted from the repo, with numbers that disagreed with the contract.
import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CommandBus } from '@pryzm/command-bus';
import { WallStore, buildWallHandlerSet, type WallsState } from '@pryzm/plugin-wall';
import { createId } from '@pryzm/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 50;
const SAMPLES = 500;

const AUDIT = {
  actorId: 'bench-tool-latency',
  projectId: 'bench-nft-3',
  clientId: 'bench-client-nft3',
};

describe('[NOT-YET-MEASURABLE NFT 3] tool-latency', () => {
  it('wall.create CommandBus dispatch is the NFT-3 headless proxy', async () => {
    const store = new WallStore();
    const bus = new CommandBus({
      audit: AUDIT,
      storesProvider: () => ({
        wall: Object.fromEntries(store.getState()) as WallsState,
      }),
    });
    for (const h of buildWallHandlerSet()) bus.register(h);

    // Warmup — JIT + module cache.
    for (let i = 0; i < WARMUP; i++) {
      await bus.executeCommand('wall.create', {
        id: createId('wall'),
        levelId: 'lvl_bench_warmup',
      });
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      await bus.executeCommand('wall.create', {
        id: createId('wall'),
        levelId: 'lvl_bench',
      });
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);
    const p99 = p(0.99);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'tool-latency.json'),
      JSON.stringify({
        name: 'tool-latency',
        p50,
        p95,
        p99,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 50,
        notes:
          'NFT-3 headless proxy per C10 §1 (this reference was previously to the deleted 01-VISION.md §5). Measures CommandBus ' +
          'wall.create dispatch latency (command pipeline only, no renderer). ' +
          'Full tool-latency including renderer first-frame is measured in ' +
          'apps/editor-bench/ (Wave 13 browser harness).',
      }, null, 2),
    );

    // Shape assertions.
    expect(typeof bus.executeCommand).toBe('function');
    expect(p95).toBeGreaterThan(0);
    // Command pipeline must be well under the NFT-3 tool budget.
    expect(p95).toBeLessThan(50);
  });
});
