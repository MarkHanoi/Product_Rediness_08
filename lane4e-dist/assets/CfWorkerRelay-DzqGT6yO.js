import { cG as NOOP_METER } from './index-CtIMEkHY.js';
import { r as registerGlobal, D as DiagAPI, g as getGlobal, u as unregisterGlobal } from './trace-api-BIfvUk_c.js';

/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * An implementation of the {@link MeterProvider} which returns an impotent Meter
 * for all calls to `getMeter`
 */
class NoopMeterProvider {
    getMeter(_name, _version, _options) {
        return NOOP_METER;
    }
}
const NOOP_METER_PROVIDER = new NoopMeterProvider();

/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
const API_NAME = 'metrics';
/**
 * Singleton object which represents the entry point to the OpenTelemetry Metrics API
 */
class MetricsAPI {
    /** Empty private constructor prevents end users from constructing a new instance of the API */
    constructor() { }
    /** Get the singleton instance of the Metrics API */
    static getInstance() {
        if (!this._instance) {
            this._instance = new MetricsAPI();
        }
        return this._instance;
    }
    /**
     * Set the current global meter provider.
     * Returns true if the meter provider was successfully registered, else false.
     */
    setGlobalMeterProvider(provider) {
        return registerGlobal(API_NAME, provider, DiagAPI.instance());
    }
    /**
     * Returns the global meter provider.
     */
    getMeterProvider() {
        return getGlobal(API_NAME) || NOOP_METER_PROVIDER;
    }
    /**
     * Returns a meter from the global meter provider.
     */
    getMeter(name, version, options) {
        return this.getMeterProvider().getMeter(name, version, options);
    }
    /** Remove the global meter provider */
    disable() {
        unregisterGlobal(API_NAME, DiagAPI.instance());
    }
}

/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Split module-level variable definition into separate files to allow
// tree-shaking on each api instance.
/**
 * Entrypoint for metrics API
 *
 * @since 1.3.0
 */
const metrics = MetricsAPI.getInstance();

const MODEL_PRICING = {
  sonnet: { perKInput: 3, perKOutput: 15 },
  haiku: { perKInput: 0.25, perKOutput: 1.25 },
  opus: { perKInput: 15, perKOutput: 75 },
  "gpt-4o": { perKInput: 2.5, perKOutput: 10 }
};
const PLAN_BUDGETS = {
  free: { monthlyProjectUSD: 0.5, dailyUserUSD: 0.1, perCallUSD: 0.05, allowedModels: ["haiku"] },
  personal: { monthlyProjectUSD: 5, dailyUserUSD: 1, perCallUSD: 0.25, allowedModels: ["haiku", "sonnet"] },
  team: { monthlyProjectUSD: 25, dailyUserUSD: 3, perCallUSD: 1, allowedModels: ["haiku", "sonnet"] }
};
function computeCostUSD(model, inputTokens, outputTokens) {
  if (inputTokens < 0 || outputTokens < 0) {
    throw new Error(`@pryzm/ai-cost: token counts must be ≥ 0 (got input=${inputTokens}, output=${outputTokens})`);
  }
  const pricing = MODEL_PRICING[model];
  if (!pricing) throw new Error(`@pryzm/ai-cost: unknown model '${model}'`);
  const inputUSD = inputTokens / 1e3 * pricing.perKInput;
  const outputUSD = outputTokens / 1e3 * pricing.perKOutput;
  return { inputUSD, outputUSD, totalUSD: inputUSD + outputUSD };
}
const PER_CALL_CEILING_USD_DEFAULT = 0.18;
const SELF_HOST_PER_CALL_CAP_USD_DEFAULT = 25;
class CostMeter {
  meter;
  costSum;
  costHistogram;
  /** S52 — refund counter (see constructor for rationale). */
  refundSum;
  now;
  /** Per-project accumulators for budget tracking. */
  projects = /* @__PURE__ */ new Map();
  /** S49 — per-call hard ceiling. Defaults to 0.18 USD per SPEC-28 §3.
   *  Resolved at construction: when `selfHostMode` is true and
   *  `perCallCeilingUsd` was not explicitly set, this becomes
   *  `selfHostPerCallCapUsd` (default $25). */
  perCallCeilingUsd;
  /** S70 D8 — true when this meter enforces the self-host BYO-key
   *  safety cap instead of the SaaS per-call ceiling. */
  selfHostMode;
  /** S70 D8 — the per-call safety cap (USD) used when `selfHostMode`
   *  is true.  Default $25 per SPEC-28 §2 row 5. */
  selfHostPerCallCapUsd;
  perProjectMonthlyBudget;
  preCallRejection;
  onLimitExceeded;
  usageSink;
  _seq = 0;
  constructor(opts = {}) {
    const provider = opts.meterProvider ?? metrics;
    this.meter = provider.getMeter("@pryzm/ai-cost", "0.1.0");
    this.costSum = this.meter.createCounter("pryzm.ai.cost.usd", {
      description: "Cumulative AI cost in USD (SPEC-28 §5.3).",
      unit: "USD"
    });
    this.costHistogram = this.meter.createHistogram("pryzm.ai.cost.usd.per_call", {
      description: "Per-call AI cost in USD — surfaces p50/p95/p99 (SPEC-28 §5.3).",
      unit: "USD"
    });
    this.refundSum = this.meter.createCounter("pryzm.ai.cost.refund.usd", {
      description: "Cumulative AI cost REFUNDED in USD — emitted when a workflow exceeds its post-call budget (SPEC-28 §3).",
      unit: "USD"
    });
    this.now = opts.now ?? Date.now;
    this.selfHostMode = opts.selfHostMode === true;
    this.selfHostPerCallCapUsd = opts.selfHostPerCallCapUsd ?? SELF_HOST_PER_CALL_CAP_USD_DEFAULT;
    if (opts.perCallCeilingUsd !== void 0) {
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
  checkBudget(input) {
    const budget = PLAN_BUDGETS[input.plan];
    if (!budget.allowedModels.includes(input.model)) {
      return { allowed: false, reason: "model-not-allowed", costUSD: 0, limit: 0 };
    }
    const { totalUSD } = computeCostUSD(input.model, input.inputTokens, input.outputTokens);
    if (totalUSD > budget.perCallUSD) {
      return { allowed: false, reason: "per-call-cap", costUSD: totalUSD, limit: budget.perCallUSD };
    }
    const acc = this.getOrInitProject(input.projectId);
    const dayKey = this.dayKey(input.atMs ?? this.now());
    const userMap = acc.dailyByUser.get(dayKey);
    const userToday = userMap?.get(input.userId) ?? 0;
    if (userToday + totalUSD > budget.dailyUserUSD) {
      return { allowed: false, reason: "daily-cap", costUSD: totalUSD, limit: budget.dailyUserUSD };
    }
    if (acc.monthlyUSD + totalUSD > budget.monthlyProjectUSD) {
      return { allowed: false, reason: "monthly-cap", costUSD: totalUSD, limit: budget.monthlyProjectUSD };
    }
    return { allowed: true, costUSD: totalUSD };
  }
  /** Record an AI call's actual cost into the OTel meter AND the per-project
   *  accumulator.  Returns the cost breakdown.  Call AFTER the AI call
   *  completes so the recorded cost reflects actual token usage. */
  record(input) {
    const breakdown = computeCostUSD(input.model, input.inputTokens, input.outputTokens);
    const attributes = {
      "pryzm.ai.surface": input.surface,
      "pryzm.ai.plan": input.plan,
      "pryzm.ai.model": input.model,
      "pryzm.project.id": input.projectId
    };
    this.costSum.add(breakdown.totalUSD, attributes);
    this.costHistogram.record(breakdown.totalUSD, attributes);
    const acc = this.getOrInitProject(input.projectId);
    acc.monthlyUSD += breakdown.totalUSD;
    const dayKey = this.dayKey(input.atMs ?? this.now());
    let userMap = acc.dailyByUser.get(dayKey);
    if (!userMap) {
      userMap = /* @__PURE__ */ new Map();
      acc.dailyByUser.set(dayKey, userMap);
    }
    userMap.set(input.userId, (userMap.get(input.userId) ?? 0) + breakdown.totalUSD);
    return breakdown;
  }
  /** Read the running monthly total for a project (debug / dashboards). */
  getMonthlyUSD(projectId) {
    return this.projects.get(projectId)?.monthlyUSD ?? 0;
  }
  /** Read the running daily total for a (project, user, day) tuple. */
  getDailyUSD(projectId, userId, atMs) {
    const acc = this.projects.get(projectId);
    if (!acc) return 0;
    const dayKey = this.dayKey(atMs ?? this.now());
    return acc.dailyByUser.get(dayKey)?.get(userId) ?? 0;
  }
  /** Reset all accumulators — used by tests + the monthly cron. */
  reset() {
    this.projects.clear();
  }
  // ─── S49 — High-level helpers per PHASE-3A §S49 spec lines 142-168 ────
  /** Pre-call budget gate keyed on project + estimated USD cost.
   *  Spec: PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md §S49 line 157.
   *
   *  Returns `{ ok: false, reason }` when:
   *   - estimatedCostUsd > perCallCeilingUsd (default 0.18), or
   *   - monthlyTotal + estimatedCostUsd > perProjectMonthlyBudget(projectId).
   *
   *  When `preCallRejection` is false, always allows (telemetry-only mode). */
  async preCheckBudget(projectId, estimatedCostUsd) {
    if (!this.preCallRejection) return { ok: true };
    if (estimatedCostUsd < 0) {
      return { ok: false, reason: "estimatedCostUsd must be ≥ 0" };
    }
    if (estimatedCostUsd > this.perCallCeilingUsd) {
      const reason = this.selfHostMode ? `Self-host BYO-key safety cap exceeded ($${this.perCallCeilingUsd.toFixed(2)} max — set PRYZM_SELFHOST_PER_CALL_CAP_USD to raise)` : `Per-call ceiling exceeded ($${this.perCallCeilingUsd.toFixed(2)} max)`;
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
  async recordCall(workflow, projectId, costUsd, latencyMs, extras = {}) {
    if (costUsd < 0) {
      throw new Error(`@pryzm/ai-cost: costUsd must be ≥ 0 (got ${costUsd})`);
    }
    if (latencyMs < 0) {
      throw new Error(`@pryzm/ai-cost: latencyMs must be ≥ 0 (got ${latencyMs})`);
    }
    const plan = extras.plan ?? "personal";
    const surface = extras.surface ?? `ai.workflow.${workflow}`;
    const model = extras.model ?? "unknown";
    const actorId = extras.actorId ?? "system";
    const actorKind = extras.actorKind ?? "user";
    const status = extras.status ?? "ok";
    const atMs = this.now();
    const attributes = {
      "pryzm.ai.workflow": workflow,
      "pryzm.ai.surface": surface,
      "pryzm.ai.plan": plan,
      "pryzm.ai.model": model,
      "pryzm.project.id": projectId,
      "pryzm.ai.latency_ms": latencyMs
    };
    this.costSum.add(costUsd, attributes);
    this.costHistogram.record(costUsd, attributes);
    const acc = this.getOrInitProject(projectId);
    acc.monthlyUSD += costUsd;
    const dayKey = this.dayKey(atMs);
    let userMap = acc.dailyByUser.get(dayKey);
    if (!userMap) {
      userMap = /* @__PURE__ */ new Map();
      acc.dailyByUser.set(dayKey, userMap);
    }
    userMap.set(actorId, (userMap.get(actorId) ?? 0) + costUsd);
    if (this.usageSink) {
      const row = {
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
        atMs
      };
      try {
        await Promise.resolve(this.usageSink(row));
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[ai-cost/CostMeter] usageSink threw (non-fatal):", err);
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
  async refund(projectId, costUsd) {
    if (typeof costUsd !== "number" || Number.isNaN(costUsd)) {
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
        "pryzm.project.id": projectId,
        "pryzm.ai.refund": true
      });
    }
    return refunded;
  }
  async fireOnLimit(projectId, reason, costUsd) {
    if (!this.onLimitExceeded) return;
    try {
      await Promise.resolve(this.onLimitExceeded({ projectId, reason, costUsd }));
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[ai-cost/CostMeter] onLimitExceeded threw (non-fatal):", err);
      }
    }
  }
  nextRowId(atMs) {
    return `aiu-${atMs.toString(36)}-${(++this._seq).toString(36)}`;
  }
  // ─── Internals ─────────────────────────────────────────────────────────
  getOrInitProject(projectId) {
    let acc = this.projects.get(projectId);
    const now = this.now();
    const monthStart = this.monthStartMs(now);
    if (acc && acc.monthStartMs !== monthStart) {
      acc = void 0;
    }
    if (!acc) {
      acc = { monthlyUSD: 0, dailyByUser: /* @__PURE__ */ new Map(), monthStartMs: monthStart };
      this.projects.set(projectId, acc);
    }
    return acc;
  }
  dayKey(atMs) {
    const d = new Date(atMs);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  monthStartMs(atMs) {
    const d = new Date(atMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
  }
}

const DEFAULT_RELAY_ENDPOINT = "/api/anthropic/v1/messages";
function createResilientRelay(primary, fallback, onFallback) {
  return {
    async complete(req) {
      try {
        return await primary.complete(req);
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[ai-host/ResilientRelay] primary relay failed — using fallback (demo) relay:", err);
        }
        try {
          onFallback?.(err);
        } catch {
        }
        return fallback.complete(req);
      }
    }
  };
}
function modelClassOf(model) {
  if (/opus/i.test(model)) return "opus";
  if (/sonnet/i.test(model)) return "sonnet";
  if (/gpt-4o/i.test(model)) return "gpt-4o";
  return "haiku";
}
function createCfWorkerRelay(url = DEFAULT_RELAY_ENDPOINT, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("[ai-host/CfWorkerRelay] no fetch implementation available");
  }
  return {
    async complete(req) {
      const body = {
        model: req.model,
        max_tokens: req.maxTokens ?? 1024,
        ...req.system ? { system: req.system } : {},
        messages: [{ role: "user", content: req.user }],
        ...req.stopSequences ? { stop_sequences: req.stopSequences } : {}
      };
      const resp = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        throw new Error(`[ai-host/CfWorkerRelay] relay ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json();
      const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      const input = data.usage?.input_tokens ?? 0;
      const output = data.usage?.output_tokens ?? 0;
      const model = data.model ?? req.model;
      const costUsd = computeCostUSD(modelClassOf(model), input, output).totalUSD;
      return {
        text,
        costUsd,
        model,
        tokens: { input, output },
        ...data.stop_reason ? { stopReason: data.stop_reason } : {}
      };
    }
  };
}

const CfWorkerRelay = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    DEFAULT_RELAY_ENDPOINT,
    createCfWorkerRelay,
    createResilientRelay,
    modelClassOf
}, Symbol.toStringTag, { value: 'Module' }));

export { CostMeter as C, DEFAULT_RELAY_ENDPOINT as D, createResilientRelay as a, CfWorkerRelay as b, createCfWorkerRelay as c, modelClassOf as m };
