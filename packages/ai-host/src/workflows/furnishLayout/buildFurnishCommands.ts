// D-FLE F8 — geometry/command emission (SPEC-FURNITURE-LAYOUT-ENGINE §7).
//
// Projects PlacedFurniture[] into the flat ordered set of `furniture.create`
// commands the EXISTING editor render path consumes (CommandEventBridge →
// initTools §FT-FURNITURE → furnitureStore → builder → 3D mesh + plan symbol).
// Pure + deterministic; mirrors apartmentLayout/executePlan.buildLayoutCommands.
//
// CRITICAL: the payload is the LEGACY FurnitureData shape and `rotation` MUST be a
// SCALAR yaw (radians) — the furniture.create validator + the §FT-FURNITURE bridge
// require it. `metadata.hostedSpaceId` binds the item to its room (IFC space).

import type { PlacedFurniture } from './types.js';

export type IdMinter = (prefix: 'furniture') => string;

export interface FurnishCommand { readonly command: 'furniture.create'; readonly payload: unknown }

export interface FurnishCommandSet {
    readonly levelId: string;
    readonly commands: readonly FurnishCommand[];
    /** Furniture ids, index-aligned with `commands`. */
    readonly ids: readonly string[];
    readonly totalElementCount: number;
    readonly warnings: readonly string[];
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Build the dispatchable `furniture.create` set for placed furniture on a level.
 * Pure: ids are pre-minted via the injected `mintId` (createId('furniture') in
 * production; a deterministic stub in tests). The editor executor dispatches these
 * inside one runBatch (skipRedetectRooms:true — furniture doesn't change rooms).
 */
export function buildFurnishCommands(
    placed: readonly PlacedFurniture[],
    levelId: string,
    levelElevation: number,
    mintId: IdMinter,
): FurnishCommandSet {
    const commands: FurnishCommand[] = [];
    const ids: string[] = [];
    const warnings: string[] = [];

    for (const p of placed) {
        if (!(p.footprint.w > 0) || !(p.footprint.l > 0)) {
            warnings.push(`${p.kind} skipped — degenerate footprint`);
            continue;
        }
        const id = mintId('furniture');
        ids.push(id);
        commands.push({
            command: 'furniture.create',
            payload: {
                id,
                furnitureType: p.kind,
                position: { x: round6(p.position.x), y: round6(p.position.y), z: round6(p.position.z) },
                rotation: round6(p.rotationY),                 // SCALAR yaw (radians)
                levelId,
                baseOffset: round6(p.position.y - levelElevation),
                width: round6(p.footprint.w),
                length: round6(p.footprint.l),
                height: round6(p.footprint.h),
                metadata: { hostedSpaceId: p.hostedSpaceId },
            },
        });
    }

    return { levelId, commands, ids, totalElementCount: commands.length, warnings };
}
