// Apartment Layout — shared active-level resolver.
//
// The active level id must come from the project context singleton (what
// AICreatePanel + the editor tools read) — NOT bimManager.getActiveLevel(), which
// returns undefined in the white-UI runtime. Both the generate trigger and the
// execute handler use this so they can never diverge again.

interface BimManagerLike {
    getLevelById?: (id: string) => { elevation?: number; height?: number } | undefined;
    getActiveLevel?: () => { id?: string; elevation?: number; height?: number } | undefined;
}
interface WindowLike {
    projectContext?: { activeLevelId?: string | null };
    bimManager?: BimManagerLike;
    commandContext?: { projectContext?: { activeLevelId?: string | null } };
}

/** The active level id, resolved robustly (project context first). */
export function resolveActiveLevelId(): string | undefined {
    const w = window as unknown as WindowLike;
    return (
        w.projectContext?.activeLevelId ||
        w.bimManager?.getActiveLevel?.()?.id ||
        w.commandContext?.projectContext?.activeLevelId ||
        undefined
    ) ?? undefined;
}

export interface ActiveLevelInfo {
    readonly id: string;
    readonly elevation?: number;   // world Y (m); defaults applied by callers
    readonly height?: number;      // floor-to-floor (m)
}

/** The active level id + its elevation/height when the bim manager can supply
 *  them (callers default to 0 / 2.7 m if absent). Returns undefined with no level. */
export function resolveActiveLevel(): ActiveLevelInfo | undefined {
    const id = resolveActiveLevelId();
    if (!id) return undefined;
    const bim = (window as unknown as WindowLike).bimManager;
    const lvl = bim?.getLevelById?.(id) ?? bim?.getActiveLevel?.();
    return {
        id,
        ...(typeof lvl?.elevation === 'number' ? { elevation: lvl.elevation } : {}),
        ...(typeof lvl?.height === 'number' ? { height: lvl.height } : {}),
    };
}

/** Resolve a SPECIFIC level id → its elevation/height (bim manager first).
 *  Used by the all-floors furnish driver (§FIX-FURNISH-ALL-FLOORS-COVERAGE,
 *  L-101) to target each level EXPLICITLY, so furnishing a level no longer
 *  depends on first mutating the global `projectContext.activeLevelId` (a
 *  fragile side-channel that let non-active floors be skipped). Returns
 *  `{ id }` with defaults when the bim manager can't supply the level. */
export function resolveLevelById(id: string): ActiveLevelInfo | undefined {
    if (!id) return undefined;
    const bim = (window as unknown as WindowLike).bimManager;
    const lvl = bim?.getLevelById?.(id);
    return {
        id,
        ...(typeof lvl?.elevation === 'number' ? { elevation: lvl.elevation } : {}),
        ...(typeof lvl?.height === 'number' ? { height: lvl.height } : {}),
    };
}
