// C28 DAT-α-3 (Data Panel & Automation) — Rule evaluator.
//
// Resolves `QualityRule.predicateId` via the `PredicateRegistry`, runs the
// predicate against a target element, and folds the result into a
// `QualityViolation` (L0, in `@pryzm/schemas/data`).  This is the engine
// half of the C28 §4 contract — see:
//   - C28 §1.3   (rule shape; predicateId resolution)
//   - C28 §4     (the data engine package owns this)
//   - C28 §7.1   (Tier-1 — on-edit; this evaluator is the runner)
//   - C28 §1.4 / P8 (spans wrap every rule run — opted-in via dynamic
//                    import so this package stays light on cold start;
//                    if `@opentelemetry/api` isn't on the path, runs go
//                    untraced rather than crash)
//
// L3 purity: imports `@pryzm/schemas` + the local registry only.

import type {
    QualityRule,
    QualityViolation,
    QualityRuleScope,
    QualityRuleSeverity,
} from '@pryzm/schemas';
import type {
    PredicateContext,
    PredicateRegistry,
    PredicateResult,
} from './predicates/PredicateRegistry.js';

// ─── Optional tracer (defensive dynamic load) ──────────────────────────────
//
// We resolve the OTel API lazily — try/catch the require + cache the
// resolved tracer (or null) so the hot path is a single null-check.  The
// package itself does NOT declare `@opentelemetry/api` as a runtime
// dependency; it picks it up if a higher layer (runtime-composer etc.)
// has installed it transitively.

interface MinimalSpan {
    setAttribute(key: string, value: string | number | boolean): void;
    recordException(err: unknown): void;
    setStatus(s: { code: number; message?: string }): void;
    end(): void;
}
interface MinimalTracer {
    startSpan(name: string): MinimalSpan;
}

let cachedTracer: MinimalTracer | null | undefined;

/**
 * Test seam: callers may inject a tracer (or null to force the no-op
 * path) without depending on `@opentelemetry/api`.  In production this
 * stays unset; the runtime composer at L4 may wire OTel itself.
 */
export function __setTracerForTesting(t: MinimalTracer | null): void {
    cachedTracer = t;
}

function getTracer(): MinimalTracer | null {
    if (cachedTracer !== undefined) return cachedTracer;
    // CJS-host probe.  We deliberately do NOT use dynamic `import()`
    // here — under vitest a top-level dynamic import without a
    // host-installed callback raises ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING
    // as an unhandled rejection.  Higher layers (runtime-composer) that
    // want OTel wired must call `__setTracerForTesting` (production
    // variant: a future named helper) to inject a tracer; this package
    // does NOT depend on `@opentelemetry/api` directly.
    try {
        const req: ((s: string) => unknown) | undefined = (globalThis as {
            require?: (s: string) => unknown;
        }).require;
        if (typeof req === 'function') {
            const mod = req('@opentelemetry/api') as {
                trace?: { getTracer(n: string): MinimalTracer };
            };
            if (mod && mod.trace) {
                cachedTracer = mod.trace.getTracer('pryzm.data-engine');
                return cachedTracer;
            }
        }
    } catch {
        // ignore — fall through to the no-op path.
    }
    cachedTracer = null;
    return cachedTracer;
}

function traced<T>(name: string, attrs: Record<string, string | number | boolean>, fn: () => T): T {
    const tracer = getTracer();
    if (!tracer) return fn();
    const span = tracer.startSpan(name);
    try {
        for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v);
        const out = fn();
        span.setStatus({ code: 1 });
        return out;
    } catch (err) {
        span.recordException(err);
        span.setStatus({ code: 2, message: String(err) });
        throw err;
    } finally {
        span.end();
    }
}

// ─── Evaluator ─────────────────────────────────────────────────────────────

/** An element under test — id + the property bag the predicates inspect. */
export interface EvaluationTarget {
    readonly id: string;
    readonly data: Readonly<Record<string, unknown>>;
}

export interface RunRulesOnManyOptions {
    /**
     * Optional progress callback; fires once per element processed.  The
     * `done` count is the number of elements walked AFTER the current
     * one (i.e. matches `total` on the final call).
     */
    readonly onProgress?: (done: number, total: number) => void;
}

/**
 * Resolves rules to predicates + emits violations.  One instance per
 * engine; stateless across calls.
 */
export class RuleEvaluator {
    readonly #registry: PredicateRegistry;

    constructor(registry: PredicateRegistry) {
        this.#registry = registry;
    }

    /**
     * Run `rule` against a single element.  Returns:
     *   - `null` when the predicate passes.
     *   - A `QualityViolation` when it fails.
     *   - A defensive WARNING violation when the rule's `predicateId`
     *     resolves to nothing OR when the predicate throws — surfaces
     *     bugs to the user instead of crashing the engine.
     */
    runRule(
        rule: QualityRule,
        element: Readonly<Record<string, unknown>>,
        elementId: string,
        siblings?: ReadonlyArray<Readonly<Record<string, unknown>>>,
    ): QualityViolation | null {
        const fn = this.#registry.get(rule.predicateId);
        if (!fn) {
            return {
                ruleId: rule.id,
                elementId,
                severity: 'warning',
                message: `Predicate not registered: ${rule.predicateId}`,
            };
        }

        const ctx: PredicateContext = siblings === undefined
            ? { elementId, scope: rule.scope as QualityRuleScope }
            : { elementId, scope: rule.scope as QualityRuleScope, siblings };

        return traced(
            'pryzm.data-engine.run-rule',
            { ruleId: rule.id, predicateId: rule.predicateId, scope: rule.scope, elementId },
            () => {
                let result: PredicateResult;
                try {
                    result = fn(element, ctx);
                } catch (err) {
                    return {
                        ruleId: rule.id,
                        elementId,
                        severity: 'warning' as QualityRuleSeverity,
                        message: `Predicate threw: ${err instanceof Error ? err.message : String(err)}`,
                    };
                }
                if (result.pass) return null;
                const violation: QualityViolation = {
                    ruleId: rule.id,
                    elementId,
                    severity: rule.severity,
                    message: rule.message,
                    ...(result.fixSuggestion !== undefined
                        ? { fixSuggestion: result.fixSuggestion }
                        : rule.fixSuggestion !== undefined
                            ? { fixSuggestion: rule.fixSuggestion }
                            : {}),
                };
                return violation;
            },
        );
    }

    /** Run every rule in `rules` against a single element; collect hits. */
    runRules(
        rules: ReadonlyArray<QualityRule>,
        element: Readonly<Record<string, unknown>>,
        elementId: string,
        siblings?: ReadonlyArray<Readonly<Record<string, unknown>>>,
    ): ReadonlyArray<QualityViolation> {
        const out: QualityViolation[] = [];
        for (const rule of rules) {
            const v = this.runRule(rule, element, elementId, siblings);
            if (v) out.push(v);
        }
        return out;
    }

    /**
     * Batch evaluation across many elements — used by `runAllChecks` and
     * the Data tab's bulk-validation flow.  Returns the flat list of
     * violations in element-input order, then rule-input order.
     */
    runRulesOnMany(
        rules: ReadonlyArray<QualityRule>,
        elements: ReadonlyArray<EvaluationTarget>,
        opts?: RunRulesOnManyOptions,
    ): ReadonlyArray<QualityViolation> {
        const out: QualityViolation[] = [];
        const total = elements.length;
        // Siblings = the other elements in the batch (excluding self).
        // We materialise once and slice during the loop to avoid
        // rebuilding the array on every call.
        const allData = elements.map((e) => e.data);
        for (let i = 0; i < total; i++) {
            const e = elements[i];
            if (!e) continue;
            const siblings = allData.filter((_, j) => j !== i);
            for (const rule of rules) {
                const v = this.runRule(rule, e.data, e.id, siblings);
                if (v) out.push(v);
            }
            opts?.onProgress?.(i + 1, total);
        }
        return out;
    }
}

/** Factory mirroring the constructor. */
export function createRuleEvaluator(registry: PredicateRegistry): RuleEvaluator {
    return new RuleEvaluator(registry);
}
