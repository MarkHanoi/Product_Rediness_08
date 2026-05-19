// Bench: `sheet-view-redraw` — NFT-6 verifier (headless proxy).
//
// Spec source: `01-VISION.md §5` row 6 — NFT 6: "Sheet-view re-render after edit
//   | < 200 ms p95 | apps/bench/src/benches/sheet-view-redraw.bench.ts".
//
// What this file CAN measure (headless Node):
//   * Sheet schema parse/validate/serialize round-trip latency — the schema
//     processing share of the sheet-view redraw budget. In production the
//     sheet-view DOM diff is driven by React after the schema patch lands;
//     this bench captures the schema pipeline overhead.
//
// What this file CANNOT measure (out of scope for headless proxy):
//   * React reconciliation time for the sheet-view canvas.
//   * PDF export pipeline triggered by sheet edits.
//   * DOM resize observer callbacks.
//
// NFT-6 production target: < 200 ms p95 (sheet edit → sheet-view repaint).

import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Sheet, createId } from '@pryzm/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');

const WARMUP = 50;
const SAMPLES = 500;

// Valid minimal sheet matching the Sheet schema (Sheet.parse({}) fills defaults).
const VIEWPORT_ID = createId('view');
const baseSheetInput = {
  id: createId('sheet'),
  number: 'A-001',
  title: 'Ground Floor Plan',
  size: 'A1' as const,
  orientation: 'landscape' as const,
  viewports: [
    {
      id: 'vp_bench_01',
      viewId: VIEWPORT_ID,
      origin: { x: 100, y: 150 },
      size: { x: 594, y: 420 },
      scale: 0.01,
    },
  ],
};

describe('sheet-view-redraw', () => {
  it('Sheet schema parse/validate/serialize round-trip is the NFT-6 headless proxy', () => {
    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      const s = Sheet.parse({ ...baseSheetInput, revision: `P${String(i % 99).padStart(2, '0')}` });
      void JSON.stringify(s);
    }

    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      // Simulate: element store applies patch → sheet view subscribeDirty fires
      // → sheet-view reads new sheet DTO → renders layout.
      const sheet = Sheet.parse({ ...baseSheetInput, revision: `P${String(i % 99).padStart(2, '0')}` });
      const serialized = JSON.stringify(sheet);
      Sheet.parse(JSON.parse(serialized));
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.floor(samples.length * q)] ?? 0;
    const p50 = p(0.50);
    const p95 = p(0.95);

    mkdirSync(RUN_OUTPUT, { recursive: true });
    writeFileSync(
      join(RUN_OUTPUT, 'sheet-view-redraw.json'),
      JSON.stringify({
        name: 'sheet-view-redraw',
        p50,
        p95,
        samples: samples.length,
        unit: 'ms',
        nftTarget: 200,
        notes:
          'NFT-6 headless proxy per 01-VISION.md §5. Measures Sheet schema ' +
          'parse/serialize round-trip (schema pipeline share of the sheet ' +
          'redraw budget). Full sheet-view DOM diff is in apps/editor-bench/ ' +
          '(Wave 13 browser harness).',
      }, null, 2),
    );

    expect(p95).toBeGreaterThan(0);
    expect(p95).toBeLessThan(200);
  });
});
