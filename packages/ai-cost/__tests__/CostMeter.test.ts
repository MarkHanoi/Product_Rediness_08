// CostMeter — pure cost calculation, budget checks, and OTel record path
// (S44 partial / SPEC-28).

import { describe, expect, it } from 'vitest';
import {
  CostMeter,
  computeCostUSD,
  MODEL_PRICING,
  PLAN_BUDGETS,
  type AIRecordInput,
} from '../src/index.js';

describe('computeCostUSD — pure pricing (SPEC-28 §1)', () => {
  it('matches the SPEC-28 §1 pricing table for Sonnet', () => {
    const c = computeCostUSD('sonnet', 1000, 1000);
    expect(c.inputUSD).toBeCloseTo(3.00, 6);
    expect(c.outputUSD).toBeCloseTo(15.00, 6);
    expect(c.totalUSD).toBeCloseTo(18.00, 6);
  });

  it('matches the SPEC-28 §1 pricing table for Haiku', () => {
    const c = computeCostUSD('haiku', 1000, 1000);
    expect(c.inputUSD).toBeCloseTo(0.25, 6);
    expect(c.outputUSD).toBeCloseTo(1.25, 6);
    expect(c.totalUSD).toBeCloseTo(1.50, 6);
  });

  it('matches the SPEC-28 §1 pricing table for Opus', () => {
    const c = computeCostUSD('opus', 1000, 1000);
    expect(c.totalUSD).toBeCloseTo(90.00, 6);
  });

  it('matches the SPEC-28 §1 pricing table for GPT-4o', () => {
    const c = computeCostUSD('gpt-4o', 1000, 1000);
    expect(c.totalUSD).toBeCloseTo(12.50, 6);
  });

  it('scales linearly with token count', () => {
    const c1 = computeCostUSD('haiku', 500, 500);
    const c2 = computeCostUSD('haiku', 1000, 1000);
    expect(c2.totalUSD).toBeCloseTo(c1.totalUSD * 2, 6);
  });

  it('throws on negative token counts', () => {
    expect(() => computeCostUSD('haiku', -1, 0)).toThrow();
    expect(() => computeCostUSD('haiku', 0, -1)).toThrow();
  });

  it('exports the public pricing table for dashboards', () => {
    expect(MODEL_PRICING.sonnet.perKInput).toBe(3.00);
    expect(MODEL_PRICING.haiku.perKOutput).toBe(1.25);
  });
});

describe('PLAN_BUDGETS — SPEC-28 §2 budget table', () => {
  it('Free tier: 50¢ monthly / 10¢ daily / 5¢ per-call / Haiku-only', () => {
    expect(PLAN_BUDGETS.free).toEqual({
      monthlyProjectUSD: 0.50,
      dailyUserUSD: 0.10,
      perCallUSD: 0.05,
      allowedModels: ['haiku'],
    });
  });

  it('Personal tier: $5 monthly / $1 daily / 25¢ per-call / Haiku+Sonnet', () => {
    expect(PLAN_BUDGETS.personal.monthlyProjectUSD).toBe(5.00);
    expect(PLAN_BUDGETS.personal.allowedModels).toEqual(['haiku', 'sonnet']);
  });

  it('Team tier: $25 monthly / $3 daily / $1 per-call', () => {
    expect(PLAN_BUDGETS.team.monthlyProjectUSD).toBe(25.00);
  });
});

// ─── Budget enforcement ────────────────────────────────────────────────────

const baseInput = (over: Partial<AIRecordInput> = {}): AIRecordInput => ({
  model: 'haiku',
  inputTokens: 100,
  outputTokens: 100,
  surface: 'ai.test',
  plan: 'free',
  projectId: 'PRJ-1',
  userId: 'u-1',
  atMs: Date.UTC(2026, 3, 28, 12, 0, 0),
  ...over,
});

describe('CostMeter.checkBudget — pre-call enforcement (SPEC-28 §2)', () => {
  it('allows a small Haiku call on the Free tier', () => {
    const m = new CostMeter();
    // 1 input + 1 output Haiku = $0.0015 — fits free per-call cap ($0.05).
    const r = m.checkBudget(baseInput({ inputTokens: 1, outputTokens: 1 }));
    expect(r.allowed).toBe(true);
  });

  it('rejects a Sonnet call on the Free tier (model-not-allowed)', () => {
    const m = new CostMeter();
    const r = m.checkBudget(baseInput({ model: 'sonnet' }));
    expect(r).toMatchObject({ allowed: false, reason: 'model-not-allowed' });
  });

  it('rejects a single call that exceeds the per-call cap', () => {
    const m = new CostMeter();
    // Free tier per-call cap = 5¢; 200k Haiku output tokens ≈ $0.25 → exceeds.
    const r = m.checkBudget(baseInput({ inputTokens: 0, outputTokens: 200_000 }));
    expect(r).toMatchObject({ allowed: false, reason: 'per-call-cap', limit: 0.05 });
  });

  it('rejects a call that pushes the user past the daily cap', () => {
    const m = new CostMeter();
    // Personal tier daily cap = $1.00, per-call cap = $0.25.
    // Use small Sonnet calls that fit per-call cap: 10 input + 10 output Sonnet =
    //   (10/1000)*$3 + (10/1000)*$15 = $0.03 + $0.15 = $0.18 — fits under per-call $0.25.
    const small = baseInput({
      plan: 'personal', model: 'sonnet',
      inputTokens: 10, outputTokens: 10,
    });
    expect(m.checkBudget(small).allowed).toBe(true);
    // Record 5 calls — total $0.90 — still under $1 daily.
    for (let i = 0; i < 5; i++) m.record(small);
    expect(m.getDailyUSD('PRJ-1', 'u-1', small.atMs)).toBeCloseTo(0.90, 2);
    // 6th call would push to $1.08 — breaks daily cap.
    const r = m.checkBudget(small);
    expect(r).toMatchObject({ allowed: false, reason: 'daily-cap', limit: 1.00 });
  });

  it('rejects a call that pushes the project past the monthly cap', () => {
    const m = new CostMeter();
    // Free tier monthly = $0.50, daily = $0.10/user, per-call = $0.05.
    // Tiny Haiku call: 1 input + 1 output = (1/1000)*$0.25 + (1/1000)*$1.25 = $0.0015.
    // Fits per-call ($0.05) and daily ($0.10/user).
    const tiny = baseInput({ plan: 'free', model: 'haiku', inputTokens: 1, outputTokens: 1 });
    expect(m.checkBudget(tiny).allowed).toBe(true);
    // Record across many users + many days so daily cap doesn't trip.
    // To approach $0.50 monthly without breaking $0.10 daily, spread across days.
    // 30 days × 5 users × 1 call = 150 calls × $0.0015 = $0.225 (well under).
    // Use a wider spread: 30 days × 12 users × 1 call/day = 360 × $0.0015 = $0.54 — busts monthly.
    let blocked = 0;
    for (let day = 0; day < 30; day++) {
      for (let userIdx = 0; userIdx < 12; userIdx++) {
        const at = Date.UTC(2026, 3, day + 1, 12, 0, 0);
        const input = { ...tiny, userId: `u-${userIdx}`, atMs: at };
        const check = m.checkBudget(input);
        if (check.allowed) m.record(input);
        else if (check.reason === 'monthly-cap') blocked++;
      }
    }
    // Monthly cap should have triggered some rejections in the latter days.
    expect(blocked).toBeGreaterThan(0);
    expect(m.getMonthlyUSD('PRJ-1')).toBeLessThanOrEqual(0.50);
  });
});

describe('CostMeter.record — accumulator + meter emission', () => {
  it('accumulates monthly + daily totals correctly', () => {
    const m = new CostMeter();
    const input = baseInput({ inputTokens: 1000, outputTokens: 1000 });  // $1.50 Haiku
    m.record(input);
    expect(m.getMonthlyUSD('PRJ-1')).toBeCloseTo(1.50, 6);
    expect(m.getDailyUSD('PRJ-1', 'u-1', input.atMs)).toBeCloseTo(1.50, 6);
    m.record(input);
    expect(m.getMonthlyUSD('PRJ-1')).toBeCloseTo(3.00, 6);
  });

  it('separates per-user daily totals', () => {
    const m = new CostMeter();
    const input = baseInput({ inputTokens: 1000, outputTokens: 1000 });
    m.record({ ...input, userId: 'u-1' });
    m.record({ ...input, userId: 'u-2' });
    expect(m.getDailyUSD('PRJ-1', 'u-1', input.atMs)).toBeCloseTo(1.50, 6);
    expect(m.getDailyUSD('PRJ-1', 'u-2', input.atMs)).toBeCloseTo(1.50, 6);
  });

  it('returns the cost breakdown from record()', () => {
    const m = new CostMeter();
    const c = m.record(baseInput({ inputTokens: 1000, outputTokens: 1000 }));
    expect(c.totalUSD).toBeCloseTo(1.50, 6);
  });

  it('reset() clears accumulators', () => {
    const m = new CostMeter();
    m.record(baseInput({ inputTokens: 1000, outputTokens: 1000 }));
    expect(m.getMonthlyUSD('PRJ-1')).toBeGreaterThan(0);
    m.reset();
    expect(m.getMonthlyUSD('PRJ-1')).toBe(0);
  });

  // ─── S49 — high-level surface (preCheckBudget + recordCall) ─────────

  it('S49: preCheckBudget allows calls under the $0.18 ceiling', async () => {
    const m = new CostMeter();
    const r = await m.preCheckBudget('PRJ-1', 0.05);
    expect(r.ok).toBe(true);
  });

  it('S49: preCheckBudget rejects estimate > $0.18 per-call ceiling', async () => {
    const m = new CostMeter();
    const r = await m.preCheckBudget('PRJ-1', 0.20);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Per-call ceiling/);
  });

  it('S49: preCheckBudget honours custom perCallCeilingUsd', async () => {
    const m = new CostMeter({ perCallCeilingUsd: 0.05 });
    const r = await m.preCheckBudget('PRJ-1', 0.10);
    expect(r.ok).toBe(false);
  });

  it('S49: preCheckBudget rejects when monthly budget would be exceeded', async () => {
    const m = new CostMeter({
      perProjectMonthlyBudget: () => 0.10,
    });
    await m.recordCall('wf', 'PRJ-2', 0.06, 100);
    const r = await m.preCheckBudget('PRJ-2', 0.05);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Monthly budget/);
  });

  it('S49: preCheckBudget passes when telemetry-only mode (preCallRejection=false)', async () => {
    const m = new CostMeter({ preCallRejection: false });
    const r = await m.preCheckBudget('PRJ-1', 999);
    expect(r.ok).toBe(true);
  });

  it('S49: onLimitExceeded fires when the ceiling is breached', async () => {
    const events: { reason: string; costUsd: number }[] = [];
    const m = new CostMeter({
      onLimitExceeded: (e) => { events.push({ reason: e.reason, costUsd: e.costUsd }); },
    });
    await m.preCheckBudget('PRJ-1', 0.20);
    expect(events).toHaveLength(1);
    expect(events[0]!.reason).toMatch(/Per-call ceiling/);
  });

  it('S49: recordCall persists one row to the usageSink', async () => {
    const sink: unknown[] = [];
    const m = new CostMeter({ usageSink: (row) => { sink.push(row); } });
    await m.recordCall('ai.floorplan.draft', 'PRJ-9', 0.04, 320, {
      actorId: 'U-1', plan: 'personal', model: 'haiku',
    });
    expect(sink).toHaveLength(1);
    const row = sink[0] as { workflow: string; projectId: string; costUsd: number; durationMs: number; status: string };
    expect(row.workflow).toBe('ai.floorplan.draft');
    expect(row.projectId).toBe('PRJ-9');
    expect(row.costUsd).toBeCloseTo(0.04, 6);
    expect(row.durationMs).toBe(320);
    expect(row.status).toBe('ok');
  });

  it('S49: recordCall accumulates against the per-project monthly total', async () => {
    const m = new CostMeter();
    await m.recordCall('wf', 'PRJ-X', 0.03, 100);
    await m.recordCall('wf', 'PRJ-X', 0.04, 100);
    expect(m.getMonthlyUSD('PRJ-X')).toBeCloseTo(0.07, 6);
  });

  it('S49: recordCall throws on negative cost or latency', async () => {
    const m = new CostMeter();
    await expect(m.recordCall('w', 'P', -1, 0)).rejects.toThrow();
    await expect(m.recordCall('w', 'P', 0, -1)).rejects.toThrow();
  });

  it('rolls over the monthly accumulator at month boundary', () => {
    // Build a meter whose clock starts in April; record an April call,
    // then advance the clock to May and record again — the second record
    // resets the accumulator (new month).
    let now = Date.UTC(2026, 3, 28);
    const m = new CostMeter({ now: () => now });
    const apr = baseInput({ inputTokens: 100, outputTokens: 100, atMs: Date.UTC(2026, 3, 28) });
    m.record(apr);
    // 100 input + 100 output Haiku = $0.025 + $0.125 = $0.15.
    expect(m.getMonthlyUSD('PRJ-1')).toBeCloseTo(0.15, 4);

    now = Date.UTC(2026, 4, 1);
    const may = baseInput({ inputTokens: 100, outputTokens: 100, atMs: now });
    m.record(may);
    // Month rolled over — only the May call's $0.15 should be counted.
    expect(m.getMonthlyUSD('PRJ-1')).toBeCloseTo(0.15, 4);
  });
});

// ─── S52 — refund() coverage (PHASE-3A §S52 line 445) ───────────────────────

describe('CostMeter.refund — post-call overshoot recovery (S52)', () => {
  it('decrements the per-project monthly accumulator by the refunded amount', async () => {
    const m = new CostMeter();
    await m.recordCall('generate-3-options', 'PRJ-R1', 0.18, 100);
    expect(m.getMonthlyUSD('PRJ-R1')).toBeCloseTo(0.18, 6);
    const refunded = await m.refund('PRJ-R1', 0.18);
    expect(refunded).toBeCloseTo(0.18, 6);
    expect(m.getMonthlyUSD('PRJ-R1')).toBeCloseTo(0, 6);
  });

  it('clamps a refund larger than the accumulator at the accumulator value (never negative)', async () => {
    const m = new CostMeter();
    await m.recordCall('w', 'PRJ-R2', 0.05, 100);
    const refunded = await m.refund('PRJ-R2', 1.00);
    // Only $0.05 was actually spent — that's all that can be refunded.
    expect(refunded).toBeCloseTo(0.05, 6);
    expect(m.getMonthlyUSD('PRJ-R2')).toBe(0);
  });

  it('is a no-op when costUsd === 0', async () => {
    const m = new CostMeter();
    await m.recordCall('w', 'PRJ-R3', 0.02, 50);
    const refunded = await m.refund('PRJ-R3', 0);
    expect(refunded).toBe(0);
    expect(m.getMonthlyUSD('PRJ-R3')).toBeCloseTo(0.02, 6);
  });

  it('throws when costUsd is negative', async () => {
    const m = new CostMeter();
    await expect(m.refund('PRJ-R4', -0.01)).rejects.toThrow(/must be ≥ 0/);
  });

  it('throws when costUsd is NaN', async () => {
    const m = new CostMeter();
    await expect(m.refund('PRJ-R5', Number.NaN)).rejects.toThrow(/finite number/);
  });

  it('preserves preCheckBudget arithmetic — after refund the project can spend again', async () => {
    const m = new CostMeter({ perProjectMonthlyBudget: () => 1.00 });
    await m.recordCall('w', 'PRJ-R6', 0.95, 100);
    const before = await m.preCheckBudget('PRJ-R6', 0.10);
    expect(before.ok).toBe(false);
    await m.refund('PRJ-R6', 0.95);
    const after = await m.preCheckBudget('PRJ-R6', 0.10);
    expect(after.ok).toBe(true);
  });
});
