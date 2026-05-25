// Apartment Layout — pure wall-store → ShellWallRecord mapper (SPEC §16, A5.3-wire-b).
//
// ZERO runtime imports by design (the only import is type-only → erased): this
// keeps the mapper unit-testable in plain Node without dragging the
// @pryzm/core-app-model barrel (which touches `window` at module load — the
// scc-no-barrel-access gotcha). The impure binding (ensureApartmentLayoutRegistered)
// imports this + the real stores/services.

import type { ShellWallRecord } from '@pryzm/ai-host';

/** Minimal shape we need from the wall store's getAll(). WallData satisfies it
 *  structurally (it carries x/y/z + openings); we read only x/z + opening type. */
export interface WallStoreLike {
    getAll?(): ReadonlyArray<{
        id: string;
        levelId: string;
        baseLine: ReadonlyArray<{ x: number; z: number }>;
        openings?: ReadonlyArray<{ type: 'window' | 'door'; elementId?: string }>;
    }>;
}

/** Build the `getWall` accessor the shellReader consumes from a wall store. */
export function buildGetWall(
    wallStore: WallStoreLike | undefined,
): (id: string) => ShellWallRecord | undefined {
    return (id: string): ShellWallRecord | undefined => {
        const all = wallStore?.getAll?.();
        if (!all) return undefined;
        const w = all.find(x => x.id === id);
        if (!w || !w.baseLine || w.baseLine.length < 2) return undefined;
        return {
            id: w.id,
            levelId: w.levelId,
            baseLine: [
                { x: w.baseLine[0]!.x, z: w.baseLine[0]!.z },
                { x: w.baseLine[1]!.x, z: w.baseLine[1]!.z },
            ],
            openings: (w.openings ?? []).map(o => ({ type: o.type, elementId: o.elementId })),
        };
    };
}
