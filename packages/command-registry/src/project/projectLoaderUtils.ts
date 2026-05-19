/**
 * projectLoaderUtils.ts
 *
 * Utilities originally in src/engine/subsystems/core/persistence/ProjectLoader.ts,
 * extracted here for use by ImportProjectCommand (PROJECT-LOAD-PERFORMANCE-13 §2).
 *
 * Migrated to @pryzm/command-registry (Sprint H, 2026-05-10).
 */

import { ProjectSnapshot } from '@pryzm/core-app-model';
import { CreateRoofCommand } from '../roofs/CreateRoofCommand';
import { RoofType, RoofFootprint } from '@pryzm/geometry-roof';

/**
 * Build a CreateWallOpeningCommand opening payload by merging the wall-opening
 * descriptor with the rich window/door record (if present in the snapshot).
 */
export function findOpeningElementData(snapshot: ProjectSnapshot, opening: any): any {
    if (opening.type === 'window') {
        const win = snapshot.windows.find((w: any) => w.openingId === opening.id || w.id === opening.elementId);
        return win ? {
            frameThickness: win.frameThickness,
            frameWidth: win.frameWidth,
            frameColor: win.frameColor,
            windowType: win.windowType,
            fireRating: win.fireRating
        } : {};
    }
    if (opening.type === 'door') {
        const door = snapshot.doors.find((d: any) => d.openingId === opening.id || d.id === opening.elementId);
        return door ? {
            frameThickness: door.frameThickness,
            frameWidth: door.frameWidth,
            frameColor: door.frameColor,
            leafColor: door.leafColor,
            doorType: door.doorType,
            fireRating: door.fireRating,
            accessibilityType: door.accessibilityType
        } : {};
    }
    return {};
}

/**
 * Convert a serialised roof snapshot record into a CreateRoofCommand.
 */
export function migrateRoofSnapshotToCommand(roof: any): CreateRoofCommand | null {
    try {
        let footprint: RoofFootprint;

        if (roof.footprint && Array.isArray(roof.footprint.polygon) && roof.footprint.polygon.length >= 3) {
            footprint = {
                polygon: roof.footprint.polygon,
                centroid: roof.footprint.centroid ?? [0, 0],
            };
        } else if (Array.isArray(roof.polygon) && roof.polygon.length >= 3) {
            const pts: [number, number][] = roof.polygon.map((p: any) =>
                Array.isArray(p) ? [p[0], p[1]] : [p.x ?? 0, p.y ?? 0]
            );
            let cx = 0, cz = 0;
            if (roof.position) {
                cx = roof.position.x ?? 0;
                cz = roof.position.z ?? 0;
            } else {
                for (const [x, z] of pts) { cx += x; cz += z; }
                cx /= pts.length; cz /= pts.length;
            }
            footprint = { polygon: pts, centroid: [cx, cz] };
        } else {
            const w = roof.width ?? 1;
            const d = roof.depth ?? 1;
            const cx = roof.position?.x ?? 0;
            const cz = roof.position?.z ?? 0;
            footprint = {
                polygon: [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]],
                centroid: [cx, cz],
            };
        }

        const modeToType: Record<string, RoofType> = {
            'single_slope': 'shed',
            'hip_roof': 'hip',
            'by_region': 'by_region',
            'flat': 'flat',
        };
        const roofType: RoofType = roof.roofType
            ?? modeToType[roof.mode ?? '']
            ?? 'flat';

        return new CreateRoofCommand(roof.id ?? crypto.randomUUID(), {
            levelId: roof.levelId,
            footprint,
            roofType,
            slope: roof.slope,
            overhang: roof.overhang ?? 0.3,
            baseOffset: roof.baseOffset ?? 3.0,
            thickness: roof.thickness ?? 0.2,
            fascia: roof.fascia,
            materialColor: roof.materialColor,
            materialId: roof.materialId,
        });
    } catch (e) {
        console.error('[projectLoaderUtils] migrateRoofSnapshotToCommand failed:', e);
        return null;
    }
}
