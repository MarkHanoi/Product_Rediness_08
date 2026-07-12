/**
 * StairVerticalSpanResolver — §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243).
 *
 * THE SINGLE CHOKEPOINT that answers "what vertical span does this stair climb?"
 * for EVERY stair creation path (plan tool, stair-path tool, 3D sketch tool,
 * batch generators, AI). C11: one element ⇒ one creation pipeline.
 *
 * ── Why this module exists (the L-243 root cause) ─────────────────────────────
 *
 * Before this, each stair tool resolved its own base/top level inline, and each
 * did it differently — and WRONGLY:
 *
 *   • `StairPathPlanToolHandler._resolveAdjacentLevel()` had a LYING FALLBACK.
 *     When the base level was already the topmost level it returned
 *     `top = base`, producing a ZERO vertical span. That fed
 *     `StairSolver2D` a `totalHeight` of 0 → `riserHeight = 0` → `isValid=false`
 *     → `StairPathToolController._finish()` bailed out after a bare
 *     `console.warn`. No stair. No toast. NOTHING. That silent death IS the
 *     founder's "stair in plan view can not yet be created".
 *     When the base level was not found at all it fabricated a top level id of
 *     `${baseLevelId}:top` — an id that exists in NO store, so even if the
 *     solver had accepted it, `CreateStairCommand.canExecute` would have
 *     rejected the stair with "Top level does not exist".
 *
 *   • `StairPlanToolHandler._resolveTopLevel()` returned `null` and HARD-ABORTED
 *     the in-progress stair with an error toast.
 *
 *   • `BimService._ensureTwoLevelsForStair()` asked the WRONG QUESTION —
 *     `levels.length >= 2`. A stair does not need "two levels to exist"; it needs
 *     "a level ABOVE THE ONE I AM DRAWN ON". A two-level project whose TOP level's
 *     plan view is open passes that guard and then dies silently in the tool.
 *
 * ── The model (ADR-0098) ──────────────────────────────────────────────────────
 *
 * A stair is authored by HEIGHT. The height is the thing the geometry needs; the
 * upper level is a REFERENCE, not an input the user must satisfy up front.
 *
 *   • When a level exists above the base level → height = that level's elevation
 *     minus the base elevation. Nothing changes; this is today's behaviour.
 *   • When NO level exists above → the stair IMPLIES one, at the project's default
 *     storey height. The caller realises the implication by dispatching
 *     `AddLevelCommand` (a COMMAND — P6 — not a toast, not a dead end).
 *
 * Either way the invariant that actually matters is preserved EXACTLY:
 *
 *      riserHeight × riserCount === height === topElevation − baseElevation
 *
 * which is what `CreateStairCommand.canExecute` validates against
 * `STAIR_CONSTRAINTS.HEIGHT_TOLERANCE`. This module NEVER returns a zero or
 * negative span, and NEVER fabricates a level id that does not exist.
 *
 * Pure: no DOM, no THREE, no I/O, no store access. Levels are passed in.
 */

/** Minimal level shape this resolver needs. Structurally satisfied by BimManager levels. */
export interface StairLevelInput {
    readonly id: string;
    readonly name?: string;
    readonly elevation?: number;
    /** Legacy alias some stores use for elevation. */
    readonly height?: number;
}

/** The resolved vertical span of a stair — the ONLY shape the tools may consume. */
export type StairVerticalSpan =
    /** A level exists above the base level. Nothing to create; draw the stair. */
    | {
          readonly status: 'ok';
          readonly baseLevelId: string;
          readonly baseElevation: number;
          readonly topLevelId: string;
          readonly topElevation: number;
          /** topElevation − baseElevation. Always > 0. */
          readonly height: number;
      }
    /**
     * No level exists above the base level. The stair IMPLIES one at
     * `suggestedElevation` (= baseElevation + height). The caller must create it
     * via `AddLevelCommand` and then re-resolve (which will return 'ok').
     */
    | {
          readonly status: 'needs-level-above';
          readonly baseLevelId: string;
          readonly baseElevation: number;
          /** The default storey height the implied level will sit at. Always > 0. */
          readonly height: number;
          readonly suggestedElevation: number;
          readonly suggestedName: string;
      }
    /** The base level itself could not be resolved. A stair cannot be authored. */
    | {
          readonly status: 'unresolvable';
          readonly reason: string;
      };

/** Project default storey height (metres) used when a stair implies the level above. */
export const DEFAULT_STOREY_HEIGHT = 3.0;

/** Minimum span (metres) below which a stair is geometrically meaningless. */
const MIN_SPAN = 0.05;

function elevationOf(level: StairLevelInput): number {
    return Number(level.elevation ?? level.height ?? 0);
}

/**
 * Resolve the vertical span a stair drawn on `baseLevelId` must climb.
 *
 * @param levels        every level in the project (any order).
 * @param baseLevelId   the level the stair is drawn ON — for a plan tool this is
 *                      `viewDef.spatial.levelId`, NOT the "active" level and NOT
 *                      the topmost level.
 * @param defaultStoreyHeight  height of the level the stair implies when none exists above.
 */
export function resolveStairVerticalSpan(
    levels: readonly StairLevelInput[],
    baseLevelId: string,
    defaultStoreyHeight: number = DEFAULT_STOREY_HEIGHT,
): StairVerticalSpan {
    if (!baseLevelId) {
        return { status: 'unresolvable', reason: 'No base level id was supplied (view has no level).' };
    }
    if (!levels || levels.length === 0) {
        return { status: 'unresolvable', reason: 'The project has no levels.' };
    }

    const base = levels.find(l => l.id === baseLevelId);
    if (!base) {
        // NEVER fabricate. A base level that is not in the store is a real fault:
        // the stair would reference a level that does not exist and
        // CreateStairCommand.canExecute would reject it.
        return {
            status: 'unresolvable',
            reason: `Base level "${baseLevelId}" does not exist in this project.`,
        };
    }

    const baseElevation = elevationOf(base);
    const storey = defaultStoreyHeight > MIN_SPAN ? defaultStoreyHeight : DEFAULT_STOREY_HEIGHT;

    // The top level is the NEAREST level strictly above the base — not simply the
    // last entry of a sorted array (that fallback is what produced the zero span).
    const above = levels
        .filter(l => l.id !== base.id && elevationOf(l) - baseElevation > MIN_SPAN)
        .sort((a, b) => elevationOf(a) - elevationOf(b));

    const top = above[0];

    if (!top) {
        return {
            status: 'needs-level-above',
            baseLevelId,
            baseElevation,
            height: storey,
            suggestedElevation: baseElevation + storey,
            suggestedName: suggestLevelName(levels),
        };
    }

    const topElevation = elevationOf(top);
    return {
        status: 'ok',
        baseLevelId,
        baseElevation,
        topLevelId: top.id,
        topElevation,
        height: topElevation - baseElevation,
    };
}

/** "Level N" for the next storey, skipping names already taken. */
export function suggestLevelName(levels: readonly StairLevelInput[]): string {
    const taken = new Set(levels.map(l => String(l.name ?? '')));
    for (let n = levels.length; n < levels.length + 50; n++) {
        const candidate = `Level ${n}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `Level ${levels.length}`;
}

/**
 * Derive the riser distribution for a span. Kept HERE, beside the span, because
 * the invariant couples them: `riserHeight × riserCount === height`, exactly.
 *
 * `riserHeight` is DERIVED from the height (never the other way round) so the
 * product is exact and `CreateStairCommand.canExecute`'s HEIGHT_TOLERANCE check
 * can never fail on rounding — the failure mode the plan handler's original
 * comment describes (2.7 m / 0.175 = 15.43 → 15 × 0.175 = 2.625 m, 75 mm off).
 */
export function deriveRisers(
    height: number,
    nominalRiserHeight = 0.175,
): { riserCount: number; riserHeight: number } {
    const h = Math.max(MIN_SPAN, height);
    const riserCount = Math.max(2, Math.round(h / nominalRiserHeight));
    return { riserCount, riserHeight: h / riserCount };
}
