/**
 * ConstraintSolver — §C4
 *
 * Pure evaluation engine for geometric constraints.
 *
 * `check(record, resolverStores)` resolves both StableReferences to 3D points,
 * computes the distance, and evaluates the operator against the target value.
 *
 * `checkAll(constraintStore, resolverStores)` iterates every record, updates
 * lastResult / violationDeltaMetres in-place via ConstraintStore.updateResult(),
 * then calls ConstraintStore.notifyListeners().
 *
 * CONTRACT COMPLIANCE:
 *   §01 §4  — No DOM, no Three.js scene mutations; THREE.Vector3 used only locally
 *   §01 §5  — No direct store writes; only ConstraintStore.updateResult() called
 *   §03     — WallStore is accessed read-only through resolverStores (existing pattern)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { resolveReferenceToPoint, ResolverStores } from './AnnotationReference';
import type { ConstraintRecord, ConstraintStore } from './ConstraintStore';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConstraintResult {
    /** Whether the constraint is currently satisfied */
    satisfied: boolean;
    /** Actual measured distance in metres */
    actualMetres: number;
    /** actual − target (negative = under-satisfied, positive = over-satisfied) */
    deltaMetres: number;
    /** Error reason when references cannot be resolved */
    error?: string;
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
     * Falls back to `cachedPosition` if the live resolver returns null
     * (e.g. the element was deleted between placement and evaluation).
     */
    check(record: ConstraintRecord, resolverStores: ResolverStores): ConstraintResult {
        const [refA, refB] = record.references;

        const rawA = resolveReferenceToPoint(refA, resolverStores);
        const rawB = resolveReferenceToPoint(refB, resolverStores);

        const pA = rawA ?? (refA.cachedPosition
            ? new THREE.Vector3(refA.cachedPosition.x, refA.cachedPosition.y, refA.cachedPosition.z)
            : null);

        const pB = rawB ?? (refB.cachedPosition
            ? new THREE.Vector3(refB.cachedPosition.x, refB.cachedPosition.y, refB.cachedPosition.z)
            : null);

        if (!pA || !pB) {
            return { satisfied: false, actualMetres: 0, deltaMetres: 0, error: 'Reference unresolvable' };
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

/** Module-level singleton */
export const constraintSolver = new ConstraintSolver();
