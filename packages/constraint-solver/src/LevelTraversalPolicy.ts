/**
 * LevelTraversalPolicy — §STAIR-AUDIT-2026 Sprint R2 (FIXED 2026-04-25)
 *
 * Closes F6 (adjacent-level constraint hard-coded at command layer).
 *
 * The previous implementation hard-blocked any stair connecting non-adjacent
 * levels.  This policy converts the hard-block into a configurable rule:
 *
 *   - Default behaviour: skipping levels is ALLOWED with a warning so the UI
 *     can prompt for confirmation, instead of blocking.
 *   - Per-type override: a stair type can declare `maxLevelSkip` to clamp how
 *     many levels a stair of that type may bypass (mirrors Revit/ArchiCAD).
 *   - Same-level connection: still rejected (degenerate).
 */

import { Level } from '@pryzm/geometry-wall';
import type { StairTypeStore } from '@pryzm/core-app-model';

export interface LevelTraversalDecision {
    ok: boolean;
    /** Non-blocking note for the UI to surface (e.g. "skipping 1 level"). */
    warning?: string;
    /** Reason `ok=false` was returned (only set when ok is false). */
    reason?: string;
}

export class LevelTraversalPolicy {

    /**
     * Decide whether a stair may traverse from `baseLevelId` → `topLevelId`.
     *
     * @param baseLevelId    base level id
     * @param topLevelId     top  level id
     * @param levels         all levels (any order)
     * @param typeStore      optional — to consult per-type overrides
     * @param typeId         optional — stair type id
     */
    static canTraverse(
        baseLevelId: string,
        topLevelId: string,
        levels: Level[],
        typeStore?: StairTypeStore,
        typeId?: string,
    ): LevelTraversalDecision {
        if (baseLevelId === topLevelId) {
            return { ok: false, reason: 'Base and top level cannot be the same' };
        }

        const sorted    = [...levels].sort((a, b) => a.elevation - b.elevation);
        const baseIndex = sorted.findIndex(l => l.id === baseLevelId);
        const topIndex  = sorted.findIndex(l => l.id === topLevelId);
        if (baseIndex === -1 || topIndex === -1) {
            return { ok: false, reason: 'Stair references a level that does not exist' };
        }

        const skip = Math.abs(topIndex - baseIndex);

        // Per-type cap (mirrors Revit's "rated stair" patterns).
        let maxSkip = Number.POSITIVE_INFINITY;
        if (typeStore && typeId) {
            const rules = typeStore.resolveRules(typeId) as { maxLevelSkip?: number } | undefined;
            if (rules && typeof rules.maxLevelSkip === 'number' && rules.maxLevelSkip > 0) {
                maxSkip = rules.maxLevelSkip;
            }
        }

        if (skip > maxSkip) {
            return {
                ok: false,
                reason: `This stair type may not skip more than ${maxSkip} level(s) (requested ${skip - 1})`,
            };
        }

        if (skip > 1) {
            return {
                ok: true,
                warning: `Stair skips ${skip - 1} intermediate level(s); confirm this is intentional.`,
            };
        }

        return { ok: true };
    }
}
