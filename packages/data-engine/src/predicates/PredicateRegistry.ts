// C28 DAT-α-3 (Data Panel & Automation) — Predicate registry.
//
// A `QualityRule` (L0, in `@pryzm/schemas/data`) carries a `predicateId:
// string`, NOT a closure — the schema stays serialisable + L0-pure.  At
// runtime the data engine resolves the id to a function via this
// registry.  See:
//   - C28 §1.3  (rule shape; predicateId is the data-side surface)
//   - C28 §4    (data engine package; this is the resolver)
//   - C28 §7.1  (Tier-1 rules — fast, on-edit; the seed list lives in
//                ./builtins.ts and is registered via
//                registerBuiltinPredicates() here)
//
// L3 purity: imports `@pryzm/schemas` only (no THREE, no DOM, no I/O).

/**
 * Context handed to a predicate when it runs.  The predicate sees the
 * element under test plus enough surrounding info to evaluate scope-aware
 * rules (e.g. a room rule may inspect sibling rooms in the same
 * apartment).
 */
export interface PredicateContext {
    readonly elementId: string;
    readonly scope: 'apartment' | 'room' | 'element' | 'project';
    readonly siblings?: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

/**
 * The pass/fail outcome of a single predicate invocation.  `fixSuggestion`
 * — when provided — OVERRIDES the suggestion baked into the rule (the
 * predicate has live numbers and can be specific; the rule's suggestion
 * is the static fallback).
 */
export interface PredicateResult {
    readonly pass: boolean;
    readonly fixSuggestion?: string;
}

/**
 * The function shape every registered predicate satisfies.  The element
 * is a `Readonly<Record<string, unknown>>` because the engine is generic
 * over element shape — predicates do the unknown-narrowing internally.
 */
export type PredicateFn = (
    element: Readonly<Record<string, unknown>>,
    ctx: PredicateContext,
) => PredicateResult;

/**
 * In-memory predicate registry.  Stateless across instances — pass one
 * instance through the engine; reuse one per `RuleEvaluator`.
 */
export class PredicateRegistry {
    readonly #predicates = new Map<string, PredicateFn>();

    /**
     * Register a predicate under `id`.  Throws on duplicate id — registry
     * is append-only by design; callers must explicitly `unregister`
     * first if they want to replace.
     */
    register(id: string, fn: PredicateFn): void {
        if (this.#predicates.has(id)) {
            throw new Error(`PredicateRegistry: duplicate predicateId '${id}'`);
        }
        this.#predicates.set(id, fn);
    }

    /** Remove `id`.  Returns true if it was present. */
    unregister(id: string): boolean {
        return this.#predicates.delete(id);
    }

    /** True iff `id` is registered. */
    has(id: string): boolean {
        return this.#predicates.has(id);
    }

    /** Resolve `id` to its predicate, or undefined if not registered. */
    get(id: string): PredicateFn | undefined {
        return this.#predicates.get(id);
    }

    /** All registered ids, sorted lexicographically (stable for tests). */
    list(): ReadonlyArray<string> {
        return [...this.#predicates.keys()].sort();
    }

    /** Drop every registration. */
    clear(): void {
        this.#predicates.clear();
    }
}

/** Factory — mirror of the constructor; useful for shorter call-sites. */
export function createPredicateRegistry(): PredicateRegistry {
    return new PredicateRegistry();
}
