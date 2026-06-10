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
import { styleFinishFor, normaliseStyle, type FurnishStyle } from './styleFinish.js';

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
    style?: FurnishStyle | string,
): FurnishCommandSet {
    const commands: FurnishCommand[] = [];
    const ids: string[] = [];
    const warnings: string[] = [];
    // A.21.D4 — the brief style chip (modern/classic/minimal/warm) drives the
    // per-piece colour + material finish. Previously a no-op; now stamped on each
    // furniture.create so the editor builders render the chosen style.
    const finishStyle = normaliseStyle(style);

    for (const p of placed) {
        if (!(p.footprint.w > 0) || !(p.footprint.l > 0)) {
            warnings.push(`${p.kind} skipped — degenerate footprint`);
            continue;
        }
        const id = mintId('furniture');
        ids.push(id);
        const finish = styleFinishFor(finishStyle, p.kind);

        // §KITCHEN-PARAMETRIC-RUN (2026-06-10) — a parametric kitchen run carries a
        // resolved KitchenCabinetConfigLike. Forward it (+ furnitureCategory
        // 'kitchen') so the editor's KitchenBuilder/KitchenCabinetEngine renders the
        // swappable-cabinet run; the user can keep editing it via the existing
        // Kitchen inspectors. Mirror KitchenCabinetTool's payload mapping:
        // width = run length, length = cabinet depth (NOT the placeholder footprint).
        const kc = p.kitchenConfig;
        const base = {
            id,
            furnitureType: p.kind,
            position: { x: round6(p.position.x), y: round6(p.position.y), z: round6(p.position.z) },
            rotation: round6(p.rotationY),                 // SCALAR yaw (radians)
            levelId,
            baseOffset: round6(p.position.y - levelElevation),
            color: finish.color,                           // A.21.D4 — style colour (hex)
            material: finish.material,                     // A.21.D4 — style finish
            metadata: { hostedSpaceId: p.hostedSpaceId, style: finishStyle },
        };
        const payload = kc
            ? {
                ...base,
                width: round6(kc.length),
                length: round6(kc.depth),
                height: round6(kc.height),
                furnitureCategory: 'kitchen',
                kitchenConfig: kc,
            }
            : {
                ...base,
                width: round6(p.footprint.w),
                length: round6(p.footprint.l),
                height: round6(p.footprint.h),
            };
        commands.push({ command: 'furniture.create', payload });
    }

    return { levelId, commands, ids, totalElementCount: commands.length, warnings };
}
