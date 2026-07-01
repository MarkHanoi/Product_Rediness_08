// §OFFICE-ARCH-FURNISH-SPLIT (Phase 1) — Command 2 = Furnish Office (interior fit-out ONLY).
//
// SPEC §1: a SEPARATE command that ANALYSES the existing architecture and populates it with
// furniture — office desks · chairs · reception · collaboration · meeting-room furniture · cafe
// seating. Architecture is NEVER regenerated here; only furniture is ADDED. This is the code that
// was formerly emitted DURING Build (the §OFFICE-INTERIOR-FITOUT furniture pass) — Phase 1 moves
// it verbatim into this command so furnishing still works. A clean modular Phase-2 rewrite (the
// SPEC §5/§6 module library + occupancy-driven placement) comes later.
//
// P6 (commands only): every mutation flows through the command bus / commandManager. P2: no THREE.
// It READs the built floors and stamps furniture on them, in deferred, suppressed batches so it
// never triggers the room-redetect storm.

import { batchCoordinator } from '@pryzm/core-app-model';
import { deferWork } from '@pryzm/frame-scheduler';
import { createId } from '@pryzm/schemas';
import {
    CreateFurnitureCommand,
    CreateFloorCommand,
    CreateLightingCommand,
} from '@pryzm/command-registry';
import type { FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import {
    deskGrid,
    meetingRooms,
    cafeClusters,
    lobbyPlan,
    ceilingLightGrid,
    type PlacedFurniture,
} from './officeInteriorFitout.js';
import type { OfficeFurnishContext } from './officeBuildContext.js';

const MAX_CEILING_LIGHTS = 48;

interface CommandManagerLike {
    execute?: (cmd: unknown, ctx?: { source?: string }) => { success?: boolean } | undefined;
}
function getCommandManager(): CommandManagerLike | undefined {
    return (window as unknown as { commandManager?: CommandManagerLike }).commandManager;
}

/** Counts scheduled by a furnish pass (reported synchronously for the toast/log). */
export interface OfficeFurnishResult {
    readonly furnitureCount: number;
    readonly lightCount: number;
}

/**
 * §OFFICE-ARCH-FURNISH-SPLIT — Command 2: furnish the EXISTING office architecture. Given the
 * geometric context Command 1 stashed (level ids + plate radii), place desks/chairs on the open
 * plan, meeting clusters on the perimeter ring, and a ground-floor cafe + reception lobby, plus
 * ceiling downlights + floor finishes — all in deferred, suppressed batches. Returns the PLANNED
 * counts (the actual creates run in the deferred batches). Never regenerates architecture.
 */
export function furnishOfficeInterior(cfg: OfficeFurnishContext): OfficeFurnishResult {
    const cm = getCommandManager();
    if (!cm?.execute) return { furnitureCount: 0, lightCount: 0 };

    // Plan the furniture (PURE) — desks/chairs on the open-plan ring, meeting clusters on the
    // perimeter ring, cafe + reception on the ground.
    const desks = deskGrid(cfg.openPlanInnerR, cfg.openPlanOuterR, cfg.deskCount);
    const meetings = meetingRooms(cfg.perimMidR, 3, Math.PI / 6);
    const cafes = cafeClusters(Math.max(cfg.coreRadiusM + 2, cfg.openPlanInnerR + 1), 4, Math.PI / 8);
    const lobby = lobbyPlan(cfg.discRadiusM, cfg.entranceAngle);
    const lightPts = ceilingLightGrid(cfg.discRadiusM, cfg.coreRadiusM, 3.5, MAX_CEILING_LIGHTS);

    const plannedFurniture =
        desks.length * 2 +
        meetings.reduce((s, m) => s + 1 + m.chairs.length, 0) +
        cafes.reduce((s, c) => s + 1 + c.chairs.length, 0) +
        1 + lobby.seats.length;
    const plannedLights = lightPts.length;

    const place = (levelId: string, type: FurnitureType, f: PlacedFurniture, height: number, material: FurnitureMaterial): void => {
        try {
            cm.execute?.(new CreateFurnitureCommand({
                id: createId('furniture'),
                furnitureType: type,
                position: { x: f.x, y: 0, z: f.z },      // y forced to level.elevation in execute()
                rotation: { x: 0, y: f.rotY, z: 0 },
                levelId,
                baseOffset: 0,
                width: f.width,
                length: f.length,
                height,
                material,
            }), { source: 'OFFICE_FURNISH_FURNITURE' });
        } catch (e) { console.warn('[office-furnish] furniture skipped:', e); }
    };

    // ── Furniture batch on the representative office floor (desks/chairs + meeting rooms). ──
    deferWork(() => {
        try {
            batchCoordinator.runBatch(() => {
                for (const dc of desks) {
                    place(cfg.repLevelId, 'desk', dc.desk, 0.74, 'wood');
                    place(cfg.repLevelId, 'desk_chair', dc.chair, 1.0, 'fabric');
                }
                for (const m of meetings) {
                    place(cfg.repLevelId, 'table', m.table, 0.74, 'wood');
                    for (const c of m.chairs) place(cfg.repLevelId, 'chair', c, 0.9, 'fabric');
                }
            }, { levelIds: [cfg.repLevelId], totalElementCount: desks.length * 2 + meetings.length * 7, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log(`[office-furnish] ${desks.length} desk+chair, ${meetings.length} meeting room(s) on the representative floor`);
        } catch (e) { console.warn('[office-furnish] furniture batch failed (non-fatal):', e); }
    }, 200);

    // ── Ground cafe + reception lobby batch. ──
    deferWork(() => {
        try {
            batchCoordinator.runBatch(() => {
                for (const cc of cafes) {
                    place(cfg.groundLevelId, 'coffee_table', cc.table, 0.5, 'wood');
                    for (const c of cc.chairs) place(cfg.groundLevelId, 'chair', c, 0.9, 'fabric');
                }
                place(cfg.groundLevelId, 'table', lobby.reception, 1.1, 'wood');     // reception desk
                for (const s of lobby.seats) place(cfg.groundLevelId, 'sofa_2seat', s, 0.8, 'fabric');
            }, { levelIds: [cfg.groundLevelId], totalElementCount: cafes.length * 5 + 3, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log(`[office-furnish] ${cafes.length} cafe cluster(s) + reception lobby on the ground floor`);
        } catch (e) { console.warn('[office-furnish] cafe/lobby batch failed (non-fatal):', e); }
    }, 300);

    // ── Ceiling downlights on the representative floor (schema-valid `downlight` kind). ──
    deferWork(() => {
        try {
            batchCoordinator.runBatch(() => {
                for (const p of lightPts) {
                    cm.execute?.(new CreateLightingCommand({
                        id: createId('lighting'),
                        fixtureType: 'downlight',
                        position: { x: p.x, y: 0, z: p.z },
                        levelId: cfg.repLevelId,
                        tags: ['office', 'ceiling'],
                    }), { source: 'OFFICE_FURNISH_LIGHTING' });
                }
            }, { levelIds: [cfg.repLevelId], totalElementCount: lightPts.length, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log(`[office-furnish] ${lightPts.length} ceiling downlight(s) on the representative floor`);
        } catch (e) { console.warn('[office-furnish] lighting batch failed (non-fatal):', e); }
    }, 400);

    // ── Floor finish (carpet on office floor, stone on the ground lobby) — thin applied
    // finishes over the disc, seated on the settled slab. Room-independent. ──
    deferWork(() => {
        const lay = (levelId: string, color: string, name: string): void => {
            try {
                cm.execute?.(new CreateFloorCommand({
                    floorId: createId('floor'), ifcGuid: createId('floor'),
                    polygon: cfg.discRadiusM > 0
                        ? Array.from({ length: 32 }, (_v, i) => {
                            const a = (2 * Math.PI * i) / 32;
                            return { x: Math.cos(a) * (cfg.discRadiusM - 0.1), z: Math.sin(a) * (cfg.discRadiusM - 0.1) };
                        })
                        : [],
                    levelId,
                    finishSpec: { finishColor: color, finishPattern: 'none', materialName: name, exposedScreed: false },
                }), { source: 'OFFICE_FURNISH_FLOOR_FINISH' });
            } catch (e) { console.warn('[office-furnish] floor finish skipped:', name, e); }
        };
        try {
            batchCoordinator.runBatch(() => {
                lay(cfg.repLevelId, '#c9c2b6', 'Office Carpet Tile');
                lay(cfg.groundLevelId, '#d8d4cc', 'Lobby Stone Tile');
            }, { levelIds: [...new Set([cfg.repLevelId, cfg.groundLevelId])], totalElementCount: 2, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log('[office-furnish] floor finishes laid on the representative + ground floor');
        } catch (e) { console.warn('[office-furnish] floor-finish batch failed (non-fatal):', e); }
    }, 500);

    return { furnitureCount: plannedFurniture, lightCount: plannedLights };
}
