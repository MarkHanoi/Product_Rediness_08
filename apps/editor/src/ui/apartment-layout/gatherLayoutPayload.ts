// Apartment Layout — gather the generate payload from the live stores (A5-modal).
//
// L5 glue: reads the active level's walls (storeRegistry) + their exterior flag
// (FacadeOrientationService) + openings, then defers to the pure, Node-tested
// buildLayoutRequestPayload. Not unit-tested here (it reads the core-app-model
// barrel → window-at-load); verified by the editor typecheck. The pure mapping
// it calls is fully tested.

import { storeRegistry } from '@pryzm/core-app-model';
import { facadeOrientationService } from '@pryzm/spatial-index';
import type { ApartmentGenerateLayoutPayload } from '@pryzm/ai-host';
import {
    buildLayoutRequestPayload,
    DEFAULT_PROGRAM,
    DEFAULT_CONSTRAINTS,
    type PayloadWall,
} from './layoutRequestPayload.js';

interface WallRecord {
    id: string;
    levelId: string;
    baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
    openings?: ReadonlyArray<{
        type: 'window' | 'door';
        elementId?: string;
        offset?: number;    // metres along the wall from baseLine[0]
        width?: number;     // metres
    }>;
}

/**
 * Build the generate payload for `levelId` from the live stores. Returns null
 * when there are no walls on the level. Exterior walls (per SL-3 facades) become
 * the shell; a default program/constraints are used (a config form is a later
 * UX step).
 */
export function gatherLayoutPayload(levelId: string): ApartmentGenerateLayoutPayload | null {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as
        | { getAll?(): WallRecord[] }
        | undefined;
    const all = wallStore?.getAll?.() ?? [];
    const onLevel = all.filter(w => w.levelId === levelId);
    if (onLevel.length === 0) return null;

    const facades = facadeOrientationService.getFacades(levelId);
    const walls: PayloadWall[] = onLevel.map(w => {
        const bl = w.baseLine;
        const baseLine = bl && bl.length >= 2
            ? ([{ x: bl[0]!.x, z: bl[0]!.z }, { x: bl[1]!.x, z: bl[1]!.z }] as const)
            : undefined;
        return {
            id: w.id,
            isExterior: facades.get(w.id)?.isExterior ?? false,
            ...(baseLine ? { baseLine } : {}),
            openings: (w.openings ?? []).map(o => ({
                type: o.type,
                elementId: o.elementId,
                ...(typeof o.offset === 'number' ? { offset: o.offset } : {}),
                ...(typeof o.width  === 'number' ? { width:  o.width  } : {}),
            })),
        };
    });

    return buildLayoutRequestPayload({
        levelId,
        walls,
        program: DEFAULT_PROGRAM,
        constraints: DEFAULT_CONSTRAINTS,
    });
}
