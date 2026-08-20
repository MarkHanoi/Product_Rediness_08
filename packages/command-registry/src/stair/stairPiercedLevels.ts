// ─── §STAIR-VOID-EVERY-DECK — THE DERIVED LEVEL SET (L-1431 / L-1433) ────────
//
// Extracted to its own module 2026-08-20 (L-1433) because BOTH void owners must
// derive the same set from the same code:
//
//   • `StairHorizontalHostPiercing` — the floor-finish and ceiling families;
//   • `StairSlabOpeningReconciler`  — the slab family, whose void is a
//                                     first-class `opening` element.
//
// Those two modules already reference each other (the piercer imports
// `StairFootprintSource` as a TYPE), so putting the shared derivation in either
// one would make the other import it as a VALUE and create a real runtime cycle.
// A third module owned by neither is the honest shape — and it is the reason the
// two families can never drift into piercing different decks.

import type { CommandContext } from '../types';

/** Elevation comparisons are C73 §1 tolerant — a deck 0.1 mm above the base is the base. */
const ELEV_EPS = 1e-4;

/**
 * ⭐ THE LEVEL AXIS, DERIVED. Every level whose deck the stair rises THROUGH or
 * lands ON: `baseElevation < elevation <= topElevation`.
 *
 * The base level's own deck is EXCLUDED — the stair stands on it; piercing it
 * would cut the floor out from under the bottom riser. The top level's deck is
 * INCLUDED, which is the case the old top-level-only filter already handled and
 * the only one it handled.
 *
 * Returns `[topLevelId]` — today's behaviour, unchanged — when the level table
 * cannot be read or either endpoint is missing from it. That is a fallback to the
 * previously-shipped behaviour, not a guess dressed as a measurement, and it is
 * reported on the span as `level_basis: 'fallback-top-only'`.
 */
export function stairPiercedLevelIds(
    ctx: CommandContext,
    stair: { readonly topLevelId: string; readonly baseLevelId?: string },
): { levelIds: string[]; basis: 'derived-span' | 'fallback-top-only' } {
    const fallback = { levelIds: [stair.topLevelId], basis: 'fallback-top-only' as const };
    const wallStore = (ctx.stores as any)?.wallStore;
    if (typeof wallStore?.getLevels !== 'function') return fallback;
    if (!stair.baseLevelId) return fallback;

    const levels = wallStore.getLevels() as Array<{ id: string; elevation: number }>;
    if (!Array.isArray(levels) || levels.length === 0) return fallback;

    const base = levels.find(l => l.id === stair.baseLevelId);
    const top = levels.find(l => l.id === stair.topLevelId);
    if (!base || !top || typeof base.elevation !== 'number' || typeof top.elevation !== 'number') {
        return fallback;
    }
    // A stair authored downward is the same set of decks, read the other way.
    const lo = Math.min(base.elevation, top.elevation);
    const hi = Math.max(base.elevation, top.elevation);

    const ids = levels
        .filter(l => typeof l.elevation === 'number'
            && l.elevation > lo + ELEV_EPS
            && l.elevation <= hi + ELEV_EPS)
        .sort((a, b) => a.elevation - b.elevation)
        .map(l => l.id);

    // The top deck is the one deck that must always be in the set. If the level
    // table disagrees with the stair's own endpoints, trust the stair.
    if (!ids.includes(stair.topLevelId)) ids.push(stair.topLevelId);
    return { levelIds: ids, basis: 'derived-span' };
}
