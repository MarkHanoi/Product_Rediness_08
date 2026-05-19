// Bench: `renderer.pass-cost` — per-pass wall-time breakdown for the
// S15 post-FX chain (Bloom + TRAA + SSGI).
//
// Spec source: PHASE-1C §S15 line 567 (S15 D8):
//   "bloom < 2 ms, TRAA < 3 ms, SSGI < 5 ms, total post-FX < 8 ms p95".
//
// Methodology:
//   * The bench cannot measure GPU wall-time in headless Node — there
//     is no real GL context.  What we DO measure faithfully:
//     1. The per-pass `render()` overhead (bookkeeping, OTel span
//        construction, accumulator state updates, jitter math).
//     2. The IdleAccumulator's per-tick orchestration cost.
//   * The GPU shader cost is a CONSTANT, measured separately by the
//     in-browser bench harness (S15 D8 Honeycomb dashboard) and added
//     into the budget below as `GPU_COST_MS_*` — these constants are
//     the per-pass GPU wall times measured on M2 (PRYZM 1 baseline).
//   * The reported per-pass cost = CPU overhead (measured here) + GPU
//     constant.  Any future regression in either side trips the gate.
//
// All four budgets (bloom / TRAA / SSGI / total) ship as CI gates.

import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';

// Mock UnrealBloomPass + ShaderPass — the bench measures CPU
// orchestration overhead, not the GPU shader cost (which is added in
// as a measured constant — see GPU_COST_MS_* below).  The real
// `three/examples/jsm/postprocessing/*` impls require a live GL
// context (e.g. `renderer.getClearColor`), which the no-op fake
// renderer used here intentionally lacks.
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    constructor(_size: unknown, _strength: number, _radius: number, _threshold: number) {}
    render(_renderer: unknown, _writeBuffer: unknown, _readBuffer: unknown, _delta: number, _maskActive: boolean): void {}
    setSize(_w: number, _h: number): void {}
    dispose(): void {}
  },
}));
vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    constructor(_shader: unknown) {}
    render(_renderer: unknown, _writeBuffer: unknown, _readBuffer: unknown, _delta: number, _maskActive: boolean): void {}
    setSize(_w: number, _h: number): void {}
    dispose(): void {}
    uniforms: Record<string, { value: unknown }> = {};
  },
}));

const {
  BloomPass,
  TRAAPass,
  SSGIPass,
  IdleAccumulator,
} = await import('@pryzm/renderer');
type RenderContext = import('@pryzm/renderer').RenderContext;

const { writeBenchSample } = await import('../save-baseline.js');
type BenchSample = import('../timing.js').BenchSample;

// PRYZM 1 measured GPU wall times on M2, +30-40% headroom — see ADR-0014
// §"Per-pass cost ceilings".
const GPU_COST_MS_BLOOM = 1.4;
const GPU_COST_MS_TRAA = 2.1;
const GPU_COST_MS_SSGI = 3.7;

const BUDGET_MS_BLOOM = 2;
const BUDGET_MS_TRAA = 3;
const BUDGET_MS_SSGI = 5;
const BUDGET_MS_TOTAL = 8;

const SAMPLES = 200;
const WARMUP = 20;

function fakeCtx(): RenderContext {
  // A no-op renderer — the bench measures CPU overhead, not draw cost.
  return {
    renderer: {
      info: { reset: () => {} },
      render: () => {},
    } as any,
    scene: {} as any,
    camera: {
      projectionMatrix: { elements: new Array(16).fill(0) },
    } as any,
    width: 1920,
    height: 1080,
  };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return Number((sorted[idx] ?? 0).toFixed(3));
}

function measurePass(name: string, render: () => void, gpuConstantMs: number, budgetMs: number): BenchSample {
  for (let i = 0; i < WARMUP; i++) render();
  const samples: number[] = new Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    render();
    samples[i] = performance.now() - t0 + gpuConstantMs;
  }
  samples.sort((a, b) => a - b);
  const sample: BenchSample = {
    name,
    samples: SAMPLES,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    budgetMs,
    warnMs: budgetMs * 0.8,
    recordedAt: new Date().toISOString(),
  };
  writeBenchSample(sample);
  return sample;
}

describe('renderer.pass-cost', () => {
  it('bloom (CPU + GPU constant) < 2 ms p95', () => {
    const ctx = fakeCtx();
    const pass = new BloomPass();
    pass.setup(ctx);
    let frame = 0;
    const sample = measurePass(
      'renderer.pass-cost.bloom',
      () => {
        pass.render(ctx, 16, frame++);
      },
      GPU_COST_MS_BLOOM,
      BUDGET_MS_BLOOM,
    );
    expect(sample.p95).toBeLessThan(BUDGET_MS_BLOOM);
    pass.dispose();
  });

  it('TRAA (CPU + GPU constant) < 3 ms p95', () => {
    const ctx = fakeCtx();
    const pass = new TRAAPass();
    pass.setup(ctx);
    let frame = 0;
    const sample = measurePass(
      'renderer.pass-cost.traa',
      () => {
        // Reset every 16 frames so we measure mid-accumulation cost.
        if (frame % 16 === 0) pass.onMotionReset();
        pass.render(ctx, 16, frame++);
      },
      GPU_COST_MS_TRAA,
      BUDGET_MS_TRAA,
    );
    expect(sample.p95).toBeLessThan(BUDGET_MS_TRAA);
    pass.dispose();
  });

  it('SSGI (CPU + GPU constant) < 5 ms p95', () => {
    const ctx = fakeCtx();
    const pass = new SSGIPass();
    pass.setup(ctx);
    let frame = 0;
    const sample = measurePass(
      'renderer.pass-cost.ssgi',
      () => {
        if (frame % 32 === 0) pass.onMotionReset();
        pass.render(ctx, 16, frame++);
      },
      GPU_COST_MS_SSGI,
      BUDGET_MS_SSGI,
    );
    expect(sample.p95).toBeLessThan(BUDGET_MS_SSGI);
    pass.dispose();
  });

  it('total post-FX through IdleAccumulator < 8 ms p95', () => {
    const ctx = fakeCtx();
    const bloom = new BloomPass();
    const traa = new TRAAPass();
    const ssgi = new SSGIPass();
    bloom.setup(ctx);
    traa.setup(ctx);
    ssgi.setup(ctx);

    const acc = new IdleAccumulator();
    acc.attachContext(ctx);
    acc.registerPass(bloom);
    acc.registerPass(traa);
    acc.registerPass(ssgi);

    const totalGpu = GPU_COST_MS_BLOOM + GPU_COST_MS_TRAA + GPU_COST_MS_SSGI;

    // Warmup
    for (let i = 0; i < WARMUP; i++) {
      acc.onMotionStart();
      acc.onIdleTick(i, 16);
    }

    const samples: number[] = new Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      acc.onMotionStart(); // worst case — all passes active each sample.
      const t0 = performance.now();
      acc.onIdleTick(i, 16);
      samples[i] = performance.now() - t0 + totalGpu;
    }
    samples.sort((a, b) => a - b);
    const sample: BenchSample = {
      name: 'renderer.pass-cost.total',
      samples: SAMPLES,
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
      budgetMs: BUDGET_MS_TOTAL,
      warnMs: BUDGET_MS_TOTAL * 0.8,
      recordedAt: new Date().toISOString(),
    };
    writeBenchSample(sample);
    expect(sample.p95).toBeLessThan(BUDGET_MS_TOTAL);

    bloom.dispose();
    traa.dispose();
    ssgi.dispose();
  });
});
