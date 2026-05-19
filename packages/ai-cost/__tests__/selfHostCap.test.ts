// S70 D8 — Self-host BYO-key safety cap tests per SPEC-28 §11 + ADR-0052 §B.6.
//
// 6 cases lock the cap behaviour at the CostMeter level:
//   (a) default $25 cap when selfHostMode + no override
//   (b) configurable cap via selfHostPerCallCapUsd
//   (c) cap rejection fires the onLimitExceeded notifier
//   (d) SaaS mode unchanged when selfHostMode flag is absent
//   (e) cap applies even when the monthly budget is unbounded
//   (f) cap does NOT apply when selfHostMode is false (even if
//       selfHostPerCallCapUsd is set — explicit-opt-in semantics)

import { describe, it, expect, vi } from 'vitest';
import { CostMeter, SELF_HOST_PER_CALL_CAP_USD_DEFAULT, PER_CALL_CEILING_USD_DEFAULT } from '../src/CostMeter.js';

describe('CostMeter — self-host BYO-key safety cap (SPEC-28 §11)', () => {
  it('(a) defaults to $25 per-call cap in selfHostMode', async () => {
    const meter = new CostMeter({ selfHostMode: true });
    expect(meter.perCallCeilingUsd).toBe(SELF_HOST_PER_CALL_CAP_USD_DEFAULT);
    expect(meter.perCallCeilingUsd).toBe(25);
    // $20 — below the cap — passes.
    await expect(meter.preCheckBudget('proj-1', 20)).resolves.toEqual({ ok: true });
    // $30 — above the cap — fails with the self-host reason discriminant.
    const r = await meter.preCheckBudget('proj-1', 30);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Self-host BYO-key safety cap exceeded/);
      expect(r.reason).toMatch(/\$25\.00 max/);
    }
  });

  it('(b) cap is configurable via selfHostPerCallCapUsd', async () => {
    const meter = new CostMeter({ selfHostMode: true, selfHostPerCallCapUsd: 5 });
    expect(meter.perCallCeilingUsd).toBe(5);
    expect(meter.selfHostPerCallCapUsd).toBe(5);
    await expect(meter.preCheckBudget('p', 4.99)).resolves.toEqual({ ok: true });
    const r = await meter.preCheckBudget('p', 5.01);
    expect(r.ok).toBe(false);
  });

  it('(c) cap rejection fires onLimitExceeded', async () => {
    const onLimit = vi.fn();
    const meter = new CostMeter({
      selfHostMode: true,
      selfHostPerCallCapUsd: 1,
      onLimitExceeded: onLimit,
    });
    const r = await meter.preCheckBudget('proj-z', 2);
    expect(r.ok).toBe(false);
    expect(onLimit).toHaveBeenCalledTimes(1);
    const arg = onLimit.mock.calls[0]?.[0] as { projectId: string; reason: string; costUsd: number };
    expect(arg.projectId).toBe('proj-z');
    expect(arg.reason).toMatch(/Self-host BYO-key safety cap/);
    expect(arg.costUsd).toBe(2);
  });

  it('(d) SaaS mode is unchanged when selfHostMode flag is absent', async () => {
    const meter = new CostMeter();
    expect(meter.selfHostMode).toBe(false);
    expect(meter.perCallCeilingUsd).toBe(PER_CALL_CEILING_USD_DEFAULT);
    expect(meter.perCallCeilingUsd).toBe(0.18);
    // $0.20 exceeds the SaaS ceiling (NOT the self-host reason).
    const r = await meter.preCheckBudget('p', 0.2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Per-call ceiling exceeded/);
      expect(r.reason).not.toMatch(/Self-host/);
    }
  });

  it('(e) cap applies even when the monthly budget is unbounded', async () => {
    const meter = new CostMeter({
      selfHostMode: true,
      perProjectMonthlyBudget: () => Number.POSITIVE_INFINITY,
    });
    // $26 still rejected by the per-call cap regardless of monthly budget.
    const r = await meter.preCheckBudget('p', 26);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Self-host BYO-key safety cap/);
  });

  it('(f) cap does NOT apply when selfHostMode is false (even if cap is set)', async () => {
    // Setting selfHostPerCallCapUsd alone — without selfHostMode — must
    // not change the SaaS behaviour.  Explicit opt-in only.
    const meter = new CostMeter({ selfHostPerCallCapUsd: 100 });
    expect(meter.selfHostMode).toBe(false);
    // SaaS ceiling still 0.18; $0.50 is rejected as SaaS, not self-host.
    expect(meter.perCallCeilingUsd).toBe(PER_CALL_CEILING_USD_DEFAULT);
    const r = await meter.preCheckBudget('p', 0.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).not.toMatch(/Self-host/);
  });

  it('(g) explicit perCallCeilingUsd overrides both cap and default', () => {
    // Belt-and-braces: the explicit option wins regardless of mode.
    const meter1 = new CostMeter({ selfHostMode: true, perCallCeilingUsd: 0.5 });
    expect(meter1.perCallCeilingUsd).toBe(0.5);
    const meter2 = new CostMeter({ perCallCeilingUsd: 0.42 });
    expect(meter2.perCallCeilingUsd).toBe(0.42);
  });
});
