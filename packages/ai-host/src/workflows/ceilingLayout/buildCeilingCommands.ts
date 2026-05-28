// D-CE — geometry/command emission.
//
// Projects PlacedCeiling[] into ONE `ceiling.batch.create` command — single
// undo unit, matches the architect's flow of `wall.batch.create` +
// `door.batch.create`. Pure + deterministic.
//
// PAYLOAD SHAPE — `ceiling.batch.create` handler (plugins/ceiling/src/
// handlers/CreateCeilingBatch.ts):
//   {
//     ceilings: CreateCeilingPayload[],   // per-entry shape (see CreateCeiling)
//     levelId?: string,                   // default levelId for entries
//   }
//
// CreateCeilingPayload entry:
//   { id, levelId, boundary: Vec3[], ceilingHeight, thickness,
//     materialId, materialColor }

import type { PlacedCeiling } from './types.js';

export type CeilingIdMinter = (prefix: 'ceiling') => string;

export interface CeilingCommand {
    readonly command: 'ceiling.batch.create';
    readonly payload: unknown;
}

export interface CeilingCommandSet {
    readonly levelId: string;
    /** A SINGLE batch command (or none, when `placed` is empty). */
    readonly commands: readonly CeilingCommand[];
    /** Ceiling ids index-aligned with `placed`. */
    readonly ids: readonly string[];
    readonly totalElementCount: number;
    readonly warnings: readonly string[];
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export function buildCeilingCommands(
    placed: readonly PlacedCeiling[],
    levelId: string,
    mintId: CeilingIdMinter,
): CeilingCommandSet {
    const warnings: string[] = [];
    const ids: string[] = [];
    const entries: unknown[] = [];

    for (const p of placed) {
        if (p.boundary.length < 3) {
            warnings.push(`room "${p.roomId}" skipped — boundary < 3 points`);
            continue;
        }
        if (!Number.isFinite(p.ceilingHeightM) || p.ceilingHeightM <= 0) {
            warnings.push(`room "${p.roomId}" skipped — invalid ceilingHeight`);
            continue;
        }
        if (!Number.isFinite(p.thicknessM) || p.thicknessM <= 0 || p.thicknessM >= p.ceilingHeightM) {
            warnings.push(`room "${p.roomId}" skipped — invalid thickness vs ceilingHeight`);
            continue;
        }
        const id = mintId('ceiling');
        ids.push(id);
        entries.push({
            id,
            levelId: p.levelId || levelId,
            boundary: p.boundary.map(v => ({ x: round6(v.x), y: round6(v.y), z: round6(v.z) })),
            ceilingHeight: round6(p.ceilingHeightM),
            thickness: round6(p.thicknessM),
            materialColor: p.materialColor,
            ...(p.materialId ? { materialId: p.materialId } : {}),
        });
    }

    const commands: CeilingCommand[] = entries.length > 0
        ? [{ command: 'ceiling.batch.create', payload: { ceilings: entries, levelId } }]
        : [];

    return { levelId, commands, ids, totalElementCount: entries.length, warnings };
}
