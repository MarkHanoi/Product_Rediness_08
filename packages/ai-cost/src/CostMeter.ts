// @pryzm/ai-cost — CostMeter (S44 partial / SPEC-28).
//
// Records every AI call's USD cost into the OTel meter `pryzm.ai.cost.usd`
// per SPEC-28 §5.3 ("Honeycomb metric — sum, p95, by surface and plan").
// Also tracks running per-project / per-day / per-call totals against the
// budget table in SPEC-28 §2 — `checkBudget(...)` returns whether a call
// would exceed the cap so the gateway can reject it pre-call (the per-call
// hard cap from SPEC-28 §2 / S43 D9 budget enforcement).
//
// What ships in S44:
//   • Pure cost calculation (token counts → USD) per SPEC-28 §1 pricing table.
//   • OTel meter creation + record path emitting `pryzm.ai.cost.usd`.
//   • Budget tracking + check API per SPEC-28 §2.
//   • Tagged by `surface` (e.g. 'ai.element-creator') and `plan`.
//
// What does NOT ship in S44 (deferred per the audit):
//   • Production Honeycomb exporter wiring — bound to S43 D9 cutover, where
//     the production telemetry pipeline (collector + exporter) is provisioned.
//     Until then the meter is a no-op recorder against the global default
//     MeterProvider; tests assert the record happens by injecting a custom
//     provider.
//   • Per-actor budgets (SPEC-07 §5 left these for "personal" / "team" tiers).
//   • Embeddings/vision pricing surfaces — added when those AI surfaces ship
//     in S52+.

import {
  metrics,
  type Counter,
  type Histogram,
  type Meter,
  type MeterProvider,
} from '@opentelemetry/api';

// ─── Pricing table (SPEC-28 §1) ────────────────────────────────────────────

export type ModelClass = 'sonnet' | 'haiku' | 'opus' | 'gpt-4o';

interface ModelPricing {
  /** USD per 1 000 input tokens. */
  readonly perKInput: number;
  /** USD per 1 000 output tokens. */
  readonly perKOutput: number;
}

export const MODEL_PRICING: Readonly<Record<ModelClass, ModelPricing>> = {
  sonnet: { perKInput: 3.00, perKOutput: 15.00 },
  haiku:  { perKInput: 0.25, perKOutput: 1.25 },
  opus:   { perKInput: 15.00, perKOutput: 75.00 },
  'gpt-4o': { perKInput: 2.50, perKOutput: 10.00 },
};

// ─── Plan budgets (SPEC-28 §2) ─────────────────────────────────────────────

export type Plan = 'free' | 'personal' | 'team';

interface PlanBudget {
  /** Monthly project budget USD. */
  readonly monthlyProjectUSD: number;
  /** Daily user budget USD. */
  readonly dailyUserUSD: number;
  /** Per-call hard cap USD. */
  readonly perCallUSD: number;
  /** Models that the plan can use. */
  readonly allowedModels: readonly ModelClass[];
}

export const PLAN_BUDGETS: Readonly<Record<Plan, PlanBudget>> = {
  free:     { monthlyProjectUSD: 0.50, dailyUserUSD: 0.10, perCallUSD: 0.05, allowedModels: ['haiku'] },
  personal: { monthlyProjectUSD: 5.00, dailyUserUSD: 1.00, perCallUSD: 0.25, allowedModels: ['haiku', 'sonnet'] },
  team:     { monthlyProjectUSD: 25.00, dailyUserUSD: 3.00, perCallUSD: 1.00, allowedModels: ['haiku', 'sonnet'] },
};

// ─── Pure cost calculation ─────────────────────────────────────────────────

export interface CostBreakdown {
  readonly inputUSD: number;
  readonly outputUSD: number;
  readonly totalUSD: number;
}

/** Compute USD cost from token counts.  Pure function — exposed so the
 *  pre-call budget check can quote a price without instantiating a meter. */
export function computeCostUSD(
  model: ModelClass,
  inputTokens: number,
  outputTokens: number,
): CostBreakdown {
  if (inputTokens < 0 || outputTokens < 0) {
    throw new Error(`@pryzm/ai-cost: token counts must be ≥ 0 (got input=${inputTokens}, output=${outputTokens})`);
  }
  const pricing = MODEL_PRICING[model];
  if (!pricing) throw new Error(`@pryzm/ai-cost: unknown model '${model}'`);
  const inputUSD = (inputTokens / 1000) * pricing.perKInput;
  const outputUSD = (outputTokens / 1000) * pricing.perKOutput;
  return { inputUSD, outputUSD, totalUSD: inputUSD + outputUSD };
}

// ─── Surface + record types ────────────────────────────────────────────────

/** Surface identifier — names the editor surface that issued the AI call.
 *  Convention: dotted-lowercase namespace, e.g. 'ai.element-creator',
 *  'ai.summarize-changes', 'ai.cde-classify'. */
export type AISurface = string;

export interface AIRecordInput {
  readonly model: ModelClass;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly surface: AISurface;
  readonly plan: Plan;
  /** The project this call belongs to. */
  readonly projectId: string;
  /** The user who issued the call. */
  readonly userId: string;
  /** Optional explicit timestamp (defaults to clock injection). */
  readonly atMs?: number;
}

// ─── Budget check ──────────────────────────────────────────────────────────

export type BudgetCheck =
  | { readonly allowed: true; readonly costUSD: number }
  | { readonly allowed: false; readonly reason: 'per-call-cap' | 'daily-cap' | 'monthly-cap' | 'model-not-allowed'; readonly costUSD: number; readonly limit: number };

// ─── CostMeter ─────────────────────────────────────────────────────────────

/** Per-call hard ceiling per SPEC-28 §3 + PHASE-3A §S49 line 158. */
export const PER_CALL_CEILING_USD_DEFAULT = 0.18;

/** S70 D8 — Self-host BYO-key per-call safety cap (USD).
 *  SPEC-28 §2 row 5 + §11 + ADR-0052 §B.6.  When `selfHostMode` is
 *  true on the CostMeter, per-call rejections fire at this ceiling
 *  rather than the SaaS $0.18 ceiling.  Operators override via the
 *  `PRYZM_SELFHOST_PER_CALL_CAP_USD` environment variable read in
 *  `packages/ai-host/src/AiHost.impl.ts`. */
export const SELF_HOST_PER_CALL_CAP_USD_DEFAULT = 25;

/** Resolves the per-project monthly USD budget. Allows the cost meter
 *  to be wired against either a local plan-tier table (in-memory dev)
 *  or a Supabase row (production billing UI). */
export type BudgetResolver = (projectId: string) => Promise<number> | number;

/** Optional admin notifier — fires when a project breaches its
 *  budget per SPEC-28 §9. */
export type NotifyAdmin = (event: {
  readonly projectId: string;
  readonly reason: string;
  readonly costUsd: number;
}) => void | Promise<void>;

/** Sink for `ai_usage` row inserts. Server wires this to a Postgres
 *  insert; tests collect into an array. */
export type AiUsageRow = {
  readonly id: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly actorKind: 'user' | 'ai' | 'plugin';
  readonly workflow: string;
  readonly surface: string;
  readonly model: string;
  readonly plan: Plan;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly status: 'ok' | 'budget_stop' | 'cap' | 'error';
  readonly atMs: number;
};
export type AiUsageInsertSink = (row: AiUsageRow) => void | Promise<void>;

/** Result of `preCheckBudget` — the gateway uses `ok` to decide
 *  whether to proceed. */
export type PreCheckResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface CostMeterOptions {
  /** Optional MeterProvider override (defaults to the global one).  Tests
   *  pass an in-memory provider to assert recording happens. */
  readonly meterProvider?: MeterProvider;
  /** Optional clock injection. */
  readonly now?: () => number;
  /** Per-call hard ceiling (USD). Defaults to 0.18 (SPEC-28 §3).
   *  Ignored when `selfHostMode` is true (the self-host BYO-key cap
   *  takes over per SPEC-28 §11 + ADR-0052 §B.6). */
  readonly perCallCeilingUsd?: number;
  /** S70 D8 — Self-host BYO-key mode flag per SPEC-28 §2 row 5.
   *  When true, `perCallCeilingUsd` is overridden by
   *  `selfHostPerCallCapUsd` (default $25).  Set from
   *  `process.env.PRYZM_SELFHOST` in the AiHost factory. */
  readonly selfHostMode?: boolean;
  /** S70 D8 — Self-host BYO-key per-call safety cap (USD).  Defaults
   *  to $25 per SPEC-28 §2 row 5 + ADR-0052 §B.6.  Operators
   *  override via `PRYZM_SELFHOST_PER_CALL_CAP_USD`. */
  readonly selfHostPerCallCapUsd?: number;
  /** Resolver yielding the project's monthly USD budget. If omitted
   *  the meter falls back to PLAN_BUDGETS[plan].monthlyProjectUSD
   *  resolved from `record(...)` plan attribute. */
  readonly perProjectMonthlyBudget?: BudgetResolver;
  /** When true (default), `preCheckBudget` rejects calls that would
   *  exceed the per-call ceiling or the monthly budget. When false,
   *  `preCheckBudget` always returns `{ ok: true }` — used for
   *  read-only dashboards. */
  readonly preCallRejection?: boolean;
  /** Notifier called when a budget rejection happens. */
  readonly onLimitExceeded?: NotifyAdmin;
  /** Sink that receives `ai_usage` rows on every successful call. */
  readonly usageSink?: AiUsageInsertSink;
}

interface ProjectAccumulator {
  /** Sum of cost across the current monthly window (UTC month). */
  monthlyUSD: number;
  /** Per-day map: 'YYYY-MM-DD' (UTC) → USD by user. */
  dailyByUser: Map<string, Map<string, number>>;
  /** Window start (epoch ms) for the current monthly accumulator. */
  monthStartMs: number;
}

export class CostMeter {
  private readonly meter: Meter;
  private readonly costSum: Counter;
  private readonly costHistogram: Histogram;
  /** S52 — refund counter (see constructor for rationale). */
  private readonly refundSum: Counter;
  private readonly now: () => number;
  /** Per-project accumulators for budget tracking. */
  private readonly projects = new Map<string, ProjectAccumulator>();
  /** S49 — per-call hard ceiling. Defaults to 0.18 USD per SPEC-28 §3.
   *  Resolved at construction: when `selfHostMode` is true and
   *  `perCallCeilingUsd` was not explicitly set, this becomes
   *  `selfHostPerCallCapUsd` (default $25). */
  readonly perCallCeilingUsd: number;
  /** S70 D8 — true when this meter enforces the self-host BYO-key
   *  safety cap instead of the SaaS per-call ceiling. */
  readonly selfHostMode: boolean;
  /** S70 D8 — the per-call safety cap (USD) used when `selfHostMode`
   *  is true.  Default $25 per SPEC-28 §2 row 5. */
  readonly selfHostPerCallCapUsd: number;
  private readonly perProjectMonthlyBudget?: BudgetResolver;
  private readonly preCallRejection: boolean;
  private readonly onLimitExceeded?: NotifyAdmin;
  private readonly usageSink?: AiUsageInsertSink;
  private _seq = 0;

  constructor(opts: CostMeterOptions = {}) {
    const provider = opts.meterProvider ?? metrics;
    this.meter = provider.getMeter('@pryzm/ai-cost', '0.1.0');
    this.costSum = this.meter.createCounter('pryzm.ai.cost.usd', {
      description: 'Cumulative AI cost in USD (SPEC-28 §5.3).',
      unit: 'USD',
    });
    this.costHistogram = this.meter.createHistogram('pryzm.ai.cost.usd.per_call', {
      description: 'Per-call AI cost in USD — surfaces p50/p95/p99 (SPEC-28 §5.3).',
      unit: 'USD',
    });
    // S52 — refund counter (SPEC-28 §3 + PHASE-3A §S52 line 445).
    // Refunds are a SEPARATE monotonic stream so the dashboard can
    // surface gross spend (`pryzm.ai.cost.usd`) AND net spend
    // (`pryzm.ai.cost.usd` − `pryzm.ai.cost.refund.usd`) without
    // breaking OTel's monotonic-counter contract.
    this.refundSum = this.meter.createCounter('pryzm.ai.cost.refund.usd', {
      description: 'Cumulative AI cost REFUNDED in USD — emitted when a workflow exceeds its post-call budget (SPEC-28 §3).',
      unit: 'USD',
    });
    this.now = opts.now ?? Date.now;
    // S70 D8 — Self-host BYO-key safety cap per SPEC-28 §11 + ADR-0052 §B.6.
    // When `selfHostMode` is true, the per-call ceiling resolves to the
    // BYO-key safety cap (default $25) rather than the SaaS $0.18 ceiling.
    // Both `perCallCeilingUsd` and `selfHostPerCallCapUsd` may still be
    // overridden explicitly; precedence is: explicit perCallCeilingUsd >
    // selfHost-resolved cap > SaaS default.
    this.selfHostMode = opts.selfHostMode === true;
    this.selfHostPerCallCapUsd = opts.selfHostPerCallCapUsd ?? SELF_HOST_PER_CALL_CAP_USD_DEFAULT;
    if (opts.perCallCeilingUsd !== undefined) {
      this.perCallCeilingUsd = opts.perCallCeilingUsd;
    } else if (this.selfHostMode) {
      this.perCallCeilingUsd = this.selfHostPerCallCapUsd;
    } else {
      this.perCallCeilingUsd = PER_CALL_CEILING_USD_DEFAULT;
    }
    if (opts.perProjectMonthlyBudget) this.perProjectMonthlyBudget = opts.perProjectMonthlyBudget;
    this.preCallRejection = opts.preCallRejection ?? true;
    if (opts.onLimitExceeded) this.onLimitExceeded = opts.onLimitExceeded;
    if (opts.usageSink) this.usageSink = opts.usageSink;
  }

  /** Pre-call budget check.  Caller passes the *quoted* cost (from
   *  computeCostUSD with token-count estimates).  Returns whether the call
   *  is allowed under SPEC-28 §2 budgets. */
  checkBudget(input: AIRecordInput): BudgetCheck {
    const budget = PLAN_BUDGETS[input.plan];
    if (!budget.allowedModels.includes(input.model)) {
      return { allowed: false, reason: 'model-not-allowed', costUSD: 0, limit: 0 };
    }
    const { totalUSD } = computeCostUSD(input.model, input.inputTokens, input.outputTokens);
    if (totalUSD > budget.perCallUSD) {
      return { allowed: false, reason: 'per-call-cap', costUSD: totalUSD, limit: budget.perCallUSD };
    }
    const acc = this.getOrInitProject(input.projectId);
    const dayKey = this.dayKey(input.atMs ?? this.now());
    const userMap = acc.dailyByUser.get(dayKey);
    const userToday = userMap?.get(input.userId) ?? 0;
    if (userToday + totalUSD > budget.dailyUserUSD) {
      return { allowed: false, reason: 'daily-cap', costUSD: totalUSD, limit: budget.dailyUserUSD };
    }
    if (acc.monthlyUSD + totalUSD > budget.monthlyProjectUSD) {
      return { allowed: false, reason: 'monthly-cap', costUSD: totalUSD, limit: budget.monthlyProjectUSD };
    }
    return { allowed: true, costUSD: totalUSD };
  }

  /** Record an AI call's actual cost into the OTel meter AND the per-project
   *  accumulator.  Returns the cost breakdown.  Call AFTER the AI call
   *  completes so the recorded cost reflects actual token usage. */
  record(input: AIRecordInput): CostBreakdown {
    const breakdown = computeCostUSD(input.model, input.inputTokens, input.outputTokens);
    const attributes = {
      'pryzm.ai.surface': input.surface,
      'pryzm.ai.plan': input.plan,
      'pryzm.ai.model': input.model,
      'pryzm.project.id': input.projectId,
    };
    this.costSum.add(breakdown.totalUSD, attributes);
    this.costHistogram.record(breakdown.totalUSD, attributes);
    // Update accumulator.
    const acc = this.getOrInitProject(input.projectId);
    acc.monthlyUSD += breakdown.totalUSD;
    const dayKey = this.dayKey(input.atMs ?? this.now());
    let userMap = acc.dailyByUser.get(dayKey);
    if (!userMap) { userMap = new Map(); acc.dailyByUser.set(dayKey, userMap); }
    userMap.set(input.userId, (userMap.get(input.userId) ?? 0) + breakdown.totalUSD);
    return breakdown;
  }

  /** Read the running monthly total for a project (debug / dashboards). */
  getMonthlyUSD(projectId: string): number {
    return this.projects.get(projectId)?.monthlyUSD ?? 0;
  }

  /** Read the running daily total for a (project, user, day) tuple. */
  getDailyUSD(projectId: string, userId: string, atMs?: number): number {
    const acc = this.projects.get(projectId);
    if (!acc) return 0;
    const dayKey = this.dayKey(atMs ?? this.now());
    return acc.dailyByUser.get(dayKey)?.get(userId) ?? 0;
  }

  /** Reset all accumulators — used by tests + the monthly cron. */
  reset(): void { this.projects.clear(); }

  // ─── S49 — High-level helpers per PHASE-3A §S49 spec lines 142-168 ────

  /** Pre-call budget gate keyed on project + estimated USD cost.
   *  Spec: PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md §S49 line 157.
   *
   *  Returns `{ ok: false, reason }` when:
   *   - estimatedCostUsd > perCallCeilingUsd (default 0.18), or
   *   - monthlyTotal + estimatedCostUsd > perProjectMonthlyBudget(projectId).
   *
   *  When `preCallRejection` is false, always allows (telemetry-only mode). */
  async preCheckBudget(projectId: string, estimatedCostUsd: number): Promise<PreCheckResult> {
    if (!this.preCallRejection) return { ok: true };
    if (estimatedCostUsd < 0) {
      return { ok: false, reason: 'estimatedCostUsd must be ≥ 0' };
    }
    if (estimatedCostUsd > this.perCallCeilingUsd) {
      const reason = this.selfHostMode
        ? `Self-host BYO-key safety cap exceeded ($${this.perCallCeilingUsd.toFixed(2)} max — set PRYZM_SELFHOST_PER_CALL_CAP_USD to raise)`
        : `Per-call ceiling exceeded ($${this.perCallCeilingUsd.toFixed(2)} max)`;
      await this.fireOnLimit(projectId, reason, estimatedCostUsd);
      return { ok: false, reason };
    }
    if (this.perProjectMonthlyBudget) {
      const monthlyTotal = this.getMonthlyUSD(projectId);
      const budget = await Promise.resolve(this.perProjectMonthlyBudget(projectId));
      if (Number.isFinite(budget) && monthlyTotal + estimatedCostUsd > budget) {
        const reason = `Monthly budget exceeded ($${budget.toFixed(2)})`;
        await this.fireOnLimit(projectId, reason, estimatedCostUsd);
        return { ok: false, reason };
      }
    }
    return { ok: true };
  }

  /** Record an AI call's actual cost — high-level S49 surface used by
   *  `AiPlane.submit`. Records to the OTel meter AND the usage sink
   *  (which inserts a row into the `ai_usage` table per SPEC-28 §5.1).
   *  Updates the per-project accumulator so subsequent
   *  `preCheckBudget` calls see the running total.
   *
   *  Returns the recorded cost. */
  async recordCall(
    workflow: string,
    projectId: string,
    costUsd: number,
    latencyMs: number,
    extras: {
      readonly actorId?: string;
      readonly actorKind?: 'user' | 'ai' | 'plugin';
      readonly plan?: Plan;
      readonly surface?: string;
      readonly model?: ModelClass | string;
      readonly status?: 'ok' | 'budget_stop' | 'cap' | 'error';
    } = {},
  ): Promise<number> {
    if (costUsd < 0) {
      throw new Error(`@pryzm/ai-cost: costUsd must be ≥ 0 (got ${costUsd})`);
    }
    if (latencyMs < 0) {
      throw new Error(`@pryzm/ai-cost: latencyMs must be ≥ 0 (got ${latencyMs})`);
    }
    const plan = (extras.plan ?? 'personal') as Plan;
    const surface = extras.surface ?? `ai.workflow.${workflow}`;
    const model = (extras.model ?? 'unknown') as string;
    const actorId = extras.actorId ?? 'system';
    const actorKind = extras.actorKind ?? 'user';
    const status = extras.status ?? 'ok';
    const atMs = this.now();

    const attributes = {
      'pryzm.ai.workflow': workflow,
      'pryzm.ai.surface': surface,
      'pryzm.ai.plan': plan,
      'pryzm.ai.model': model,
      'pryzm.project.id': projectId,
      'pryzm.ai.latency_ms': latencyMs,
    };
    this.costSum.add(costUsd, attributes);
    this.costHistogram.record(costUsd, attributes);

    // Per-project running total (so preCheckBudget sees actual spend).
    const acc = this.getOrInitProject(projectId);
    acc.monthlyUSD += costUsd;
    const dayKey = this.dayKey(atMs);
    let userMap = acc.dailyByUser.get(dayKey);
    if (!userMap) { userMap = new Map(); acc.dailyByUser.set(dayKey, userMap); }
    userMap.set(actorId, (userMap.get(actorId) ?? 0) + costUsd);

    // SPEC-28 §5.1 — write one ai_usage row.
    if (this.usageSink) {
      const row: AiUsageRow = {
        id: this.nextRowId(atMs),
        projectId,
        actorId,
        actorKind,
        workflow,
        surface,
        model,
        plan,
        costUsd,
        durationMs: Math.round(latencyMs),
        status,
        atMs,
      };
      try {
        await Promise.resolve(this.usageSink(row));
      } catch (err) {
        // Sink failure is loud but does not unwind the meter — the OTel
        // record already happened; the gateway retries the row insert
        // out-of-band per SPEC-28 §10.
        if (typeof console !== 'undefined') {
          console.warn('[ai-cost/CostMeter] usageSink threw (non-fatal):', err);
        }
      }
    }

    return costUsd;
  }

  /** S52 — refund the per-project monthly accumulator after a
   *  post-call cost overshoot (e.g. Generate3Options fan-out total
   *  exceeded the $0.18 ceiling).
   *
   *  Spec source:
   *   • PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md §S52 line 445
   *     (`await ctx.costMeter.refund(ctx.projectId, totalCost)`).
   *   • SPEC-28 §3 — per-call ceiling is hard; overshoot must not
   *     count against the project's monthly budget.
   *
   *  Behaviour:
   *   - Decrements the per-project monthly accumulator by
   *     `min(costUsd, monthlyUSD)` so the running total never goes
   *     negative.
   *   - Emits to the SEPARATE `pryzm.ai.cost.refund.usd` monotonic
   *     counter so dashboards can compute net spend = gross − refunds.
   *   - `costUsd === 0` is a no-op; `costUsd < 0` throws (loud).
   *
   *  Returns the actual refunded amount (clamped to monthlyUSD). */
  async refund(projectId: string, costUsd: number): Promise<number> {
    if (typeof costUsd !== 'number' || Number.isNaN(costUsd)) {
      throw new Error(`@pryzm/ai-cost: refund costUsd must be a finite number (got ${String(costUsd)})`);
    }
    if (costUsd < 0) {
      throw new Error(`@pryzm/ai-cost: refund costUsd must be ≥ 0 (got ${costUsd})`);
    }
    if (costUsd === 0) return 0;
    const acc = this.getOrInitProject(projectId);
    const refunded = Math.min(costUsd, acc.monthlyUSD);
    acc.monthlyUSD -= refunded;
    if (refunded > 0) {
      this.refundSum.add(refunded, {
        'pryzm.project.id': projectId,
        'pryzm.ai.refund': true,
      });
    }
    return refunded;
  }

  private async fireOnLimit(projectId: string, reason: string, costUsd: number): Promise<void> {
    if (!this.onLimitExceeded) return;
    try {
      await Promise.resolve(this.onLimitExceeded({ projectId, reason, costUsd }));
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[ai-cost/CostMeter] onLimitExceeded threw (non-fatal):', err);
      }
    }
  }

  private nextRowId(atMs: number): string {
    return `aiu-${atMs.toString(36)}-${(++this._seq).toString(36)}`;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private getOrInitProject(projectId: string): ProjectAccumulator {
    let acc = this.projects.get(projectId);
    const now = this.now();
    const monthStart = this.monthStartMs(now);
    if (acc && acc.monthStartMs !== monthStart) {
      // Month rollover — reset.
      acc = undefined;
    }
    if (!acc) {
      acc = { monthlyUSD: 0, dailyByUser: new Map(), monthStartMs: monthStart };
      this.projects.set(projectId, acc);
    }
    return acc;
  }

  private dayKey(atMs: number): string {
    const d = new Date(atMs);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  private monthStartMs(atMs: number): number {
    const d = new Date(atMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
  }
}
