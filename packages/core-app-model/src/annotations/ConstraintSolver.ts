/**
 * ConstraintSolver — §C4
 *
 * Pure evaluation engine for geometric constraints.
 *
 * `check(record, resolverStores)` resolves both StableReferences to 3D points,
 * computes the distance, and evaluates the operator against the target value.
 * A reference the LIVE resolver cannot resolve produces a typed refusal naming
 * the missing element — never a verdict; see §CONSTRAINT-STALE-CACHE-IS-NOT-
 * SIGHT on `check()`.
 *
 * `checkAll(constraintStore, resolverStores)` iterates every record, updates
 * lastResult / violationDeltaMetres in-place via ConstraintStore.updateResult(),
 * then calls ConstraintStore.notifyListeners(). A refusal is recorded as
 * `'unknown'` — a third value, distinct from both `'satisfied'` and
 * `'violated'`.
 *
 * CONTRACT COMPLIANCE:
 *   §01 §4  — No DOM, no Three.js scene mutations. This module no longer
 *             constructs a THREE.Vector3 at all: the only reason it did was the
 *             stale-cache fallback that is now gone.
 *   §01 §5  — No direct store writes; only ConstraintStore.updateResult() called
 *   §03     — WallStore is accessed read-only through resolverStores (existing pattern)
 */

import { resolveReferenceToPoint, ResolverStores, type StableReference } from './AnnotationReference';
import type { ConstraintRecord, ConstraintStore } from './ConstraintStore';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reference the live resolver could not resolve — the typed half of the
 * refusal (C74 §6.2). "Unknown" alone is honest but unactionable; this names
 * WHICH element went missing so a panel can say what it is waiting for.
 */
export interface UnresolvedReference {
    /** 0 = the first reference of the pair, 1 = the second. */
    readonly index: 0 | 1;
    readonly elementType: string;
    readonly elementId: string;
    readonly subElement: string;
    /**
     * Whether a cached coordinate for this reference survives. It is REPORTED
     * and DELIBERATELY NOT USED — see `check()`. Carried so a reader can see
     * that declining it was a decision, not an oversight.
     */
    readonly hadCachedPosition: boolean;
}

export interface ConstraintResult {
    /**
     * Whether the constraint is currently satisfied.
     *
     * ⚠ ONLY MEANINGFUL WHEN `error` IS ABSENT. A boolean cannot carry three
     * values, and the third — "I could not look" — is the one that matters
     * (§CONTEXT-DATA-HONESTY / C70 L-INV-1). On a refusal this is `false`
     * because there is nothing else it could be, NOT because the constraint
     * was measured and found breached. Check `error`/`unresolved` first;
     * `checkAll()` does, and maps a refusal to `'unknown'`, never `'violated'`.
     */
    satisfied: boolean;
    /** Actual measured distance in metres. 0 on a refusal — nothing was measured. */
    actualMetres: number;
    /** actual − target (negative = under-satisfied, positive = over-satisfied) */
    deltaMetres: number;
    /** Error reason when references cannot be resolved */
    error?: string;
    /** Present exactly when `error` is a resolution failure — which references, by name. */
    unresolved?: readonly UnresolvedReference[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tolerance — values within this distance are treated as "equal"
// ─────────────────────────────────────────────────────────────────────────────

const EQUAL_TOLERANCE_M = 0.001; // 1 mm

// ─────────────────────────────────────────────────────────────────────────────
// ConstraintSolver
// ─────────────────────────────────────────────────────────────────────────────

export class ConstraintSolver {

    // ── Single-record evaluation ──────────────────────────────────────────────

    /**
     * Resolve both references and evaluate the constraint.
     *
     * ─── §CONSTRAINT-STALE-CACHE-IS-NOT-SIGHT (2026-08-17) ────────────────────
     * This method USED TO fall back to `refX.cachedPosition` when the live
     * resolver answered null, and its own docstring gave "the element was
     * deleted between placement and evaluation" as the reason. That is exactly
     * the case in which a verdict must not be produced: a DELETED wall read a
     * confident `'satisfied'`, computed against where it used to be, while the
     * identical record WITHOUT a cached coordinate correctly read `'unknown'`.
     * Whether the system admitted it could not see turned on nothing but an
     * incidental cache. "I could not look" is never "nothing is wrong"
     * (C74 §6.2, §CONTEXT-DATA-HONESTY, C70 L-INV-1).
     *
     * The fallback is gone. A stale coordinate is evidence of where something
     * used to be; it is not a measurement, and it is not consulted here.
     *
     * ⚠ NO CAPABILITY WAS LOST, and the distinction is the whole reason this is
     * a fix rather than a removal. `resolveReferenceToPoint` ALREADY returns
     * `cachedPosition` as a LIVE resolution for the two cases where it is the
     * authority rather than a memory: a free `'point'` reference, whose position
     * is only ever held there by construction (`makePointRef`), and an element
     * type the resolver has no live path for at all. What is removed is only the
     * SECOND guess taken after the resolver has already reported that it looked
     * and could not find the element.
     */
    check(record: ConstraintRecord, resolverStores: ResolverStores): ConstraintResult {
        const [refA, refB] = record.references;

        const pA = resolveReferenceToPoint(refA, resolverStores);
        const pB = resolveReferenceToPoint(refB, resolverStores);

        if (!pA || !pB) {
            const unresolved: UnresolvedReference[] = [];
            if (!pA) unresolved.push(describeUnresolved(0, refA));
            if (!pB) unresolved.push(describeUnresolved(1, refB));
            return {
                satisfied: false,
                actualMetres: 0,
                deltaMetres: 0,
                error: `Cannot evaluate — ${unresolved
                    .map((u) => `${u.elementType} "${u.elementId}" (${u.subElement}) is not in the model`)
                    .join('; ')}`,
                unresolved,
            };
        }

        const actualMetres = pA.distanceTo(pB);
        const deltaMetres  = actualMetres - record.valueMetres;
        const satisfied    = this._evaluate(actualMetres, record.operator, record.valueMetres);

        return { satisfied, actualMetres, deltaMetres };
    }

    // ── Batch evaluation ──────────────────────────────────────────────────────

    /**
     * Evaluate all records in the store and persist results.
     * Fires ConstraintStore.notifyListeners() after all updates.
     *
     * @returns Array of violated records (for toast / logging)
     */
    checkAll(store: ConstraintStore, resolverStores: ResolverStores): ConstraintRecord[] {
        const violated: ConstraintRecord[] = [];

        for (const record of store.all) {
            const result = this.check(record, resolverStores);

            if (result.error) {
                store.updateResult(record.id, 'unknown', 0);
                // Blindness is announced as loudly as a breach. A validation pass
                // that shouts about violations and stays silent about the rules it
                // could not evaluate teaches the reader that quiet means clean.
                console.warn(
                    `[ConstraintSolver] UNKNOWN: ${record.description}`,
                    `| ${result.error}`,
                    '| no verdict was computed — a cached coordinate is not a measurement'
                );
                continue;
            }

            const newResult = result.satisfied ? 'satisfied' : 'violated';
            store.updateResult(record.id, newResult, result.deltaMetres);

            if (!result.satisfied) {
                violated.push({ ...record, lastResult: 'violated', violationDeltaMetres: result.deltaMetres });
                console.warn(
                    `[ConstraintSolver] VIOLATED: ${record.description}`,
                    `| actual=${(result.actualMetres * 1000).toFixed(1)} mm`,
                    `| delta=${(result.deltaMetres * 1000).toFixed(1)} mm`
                );
            }
        }

        store.notifyListeners();
        return violated;
    }

    // ── Private — operator evaluation ─────────────────────────────────────────

    private _evaluate(
        actual: number,
        operator: ConstraintRecord['operator'],
        target: number
    ): boolean {
        switch (operator) {
            case '>=': return actual >= target - EQUAL_TOLERANCE_M;
            case '<=': return actual <= target + EQUAL_TOLERANCE_M;
            case '==': return Math.abs(actual - target) <= EQUAL_TOLERANCE_M;
            case '>':  return actual > target + EQUAL_TOLERANCE_M;
            case '<':  return actual < target - EQUAL_TOLERANCE_M;
            default:   return false;
        }
    }
}

/**
 * Name a reference the live resolver could not resolve.
 *
 * `hadCachedPosition` is recorded rather than dropped: the stale coordinate is
 * the thing this module used to answer with, and a reader who wants to know
 * whether it was available (and declined) should not have to guess.
 */
function describeUnresolved(index: 0 | 1, ref: StableReference): UnresolvedReference {
    return {
        index,
        elementType: ref.elementType,
        elementId: ref.elementId,
        subElement: ref.subElement,
        hadCachedPosition: ref.cachedPosition !== undefined,
    };
}

/** Module-level singleton */
export const constraintSolver = new ConstraintSolver();
