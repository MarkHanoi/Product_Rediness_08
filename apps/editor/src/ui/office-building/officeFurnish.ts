// §OFFICE-FURNISH-MODULAR (Phase 2 of SPEC-OFFICE-GENERATION-ENGINE §5/§6/§7/§8/§9 steps 7–8) —
// Command 2 = Furnish Office (interior fit-out ONLY), rebuilt as the MODULAR engine.
//
// SPEC §5 redesigns the fit-out as reusable MODULES snapped to the circulation grid (not random
// desks). This command READS the architecture Command 1 stashed (officeBuildContext) and drives the
// PURE L2 engine (`planFloorFurnish` in @pryzm/ai-host): occupancy-driven (§8) module composition
// placed clear of the circulation rings + fire-egress spokes (§7), with a final egress/clearance
// validation (§9 step 8, logged as §DIAG-OFFICE-FURNISH-VALIDATION). Each PlacedItem is emitted as a
// CreateFurnitureCommand on the built floor — the ONLY mutation path (P6). Architecture is NEVER
// regenerated (SPEC §1); only furniture + lights + finishes are ADDED, in deferred, suppressed
// batches (skipRedetectRooms/skipPbrUpgrade) so it never triggers the room-redetect storm.
//
// P6 (commands only): every mutation flows through the command bus / commandManager. P2: no THREE.
//
// ASSET DEPENDENCY (flag, do not fix here): furniture renders as PLACEHOLDER geometry until the GLB
// catalog is re-hosted (tracker OBJECT-STORAGE-GLB — the 185 MB /items/*.glb catalog is
// .dockerignored out of the prod image). The module COMPOSITION + placement + quantities are correct;
// the reference Steelcase/Herman-Miller look additionally needs the curated GLBs hosted. See ADR-0096.

import { batchCoordinator } from '@pryzm/core-app-model';
import { deferWork } from '@pryzm/frame-scheduler';
import { createId } from '@pryzm/schemas';
import {
    CreateFurnitureCommand,
    CreateFloorCommand,
    CreateLightingCommand,
} from '@pryzm/command-registry';
import { planFloorFurnish, type FurnishFloorInput, type PlacedItem } from '@pryzm/ai-host';
import type { FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import { cafeClusters, ceilingLightGrid } from './officeInteriorFitout.js';
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
    /** Modules composed across the detailed floors (SPEC §5). */
    readonly moduleCount: number;
    /** True if the §9-8 validation found no clearance/egress violation on any floor. */
    readonly clearanceOk: boolean;
}

/** Map the engine's radial + architecture context to the pure planner's FurnishFloorInput. */
function toFloorInput(cfg: OfficeFurnishContext, floorIndex: number, isGroundFloor: boolean): FurnishFloorInput {
    return {
        floorIndex,
        usableAreaM2: cfg.usableAreaM2,
        discR: cfg.discRadiusM,
        coreR: cfg.coreRadiusM,
        openPlanInnerR: cfg.openPlanInnerR,
        openPlanOuterR: cfg.openPlanOuterR,
        primaryCorridor: cfg.primaryCorridor,
        secondaryCorridor: cfg.secondaryCorridor,
        escapeAngles: cfg.escapeAngles,
        rooms: cfg.rooms,
        deskBudget: cfg.deskCount,
        isGroundFloor,
        entranceAngle: cfg.entranceAngle,
    };
}

/**
 * §OFFICE-FURNISH-MODULAR — Command 2: furnish the EXISTING office architecture with the modular
 * engine. Plans the representative office floor + the ground floor from occupancy (§8), places the §5
 * modules clear of circulation (§7), validates egress (§9-8), and emits every item + reception/cafe +
 * ceiling downlights + floor finishes in deferred, suppressed batches. Returns the PLANNED counts
 * (the actual creates run in the deferred batches). Never regenerates architecture.
 */
export function furnishOfficeInterior(cfg: OfficeFurnishContext): OfficeFurnishResult {
    const cm = getCommandManager();
    if (!cm?.execute) return { furnitureCount: 0, lightCount: 0, moduleCount: 0, clearanceOk: true };

    // ── Plan the modular fit-out (PURE) for the representative office floor + the ground floor. ──
    const repPlan = planFloorFurnish(toFloorInput(cfg, 1, false));
    const groundPlan = planFloorFurnish(toFloorInput(cfg, 0, true));
    // Ground cafe / canteen seating (kept from Phase 1 — the ground breakout ring). The reception
    // arrival experience is now a full modular `reception-block` inside groundPlan (SPEC Command 2 +
    // §11: counter + logo wall + waiting sofas + coffee table + planters), so the Phase-1 inline
    // lobbyPlan reception is dropped to avoid a duplicate desk/sofa pair.
    const cafes = cafeClusters(Math.max(cfg.coreRadiusM + 2, cfg.openPlanInnerR + 1), 4, Math.PI / 8);
    const lightPts = ceilingLightGrid(cfg.discRadiusM, cfg.coreRadiusM, 3.5, MAX_CEILING_LIGHTS);

    const clearanceOk = repPlan.validation.ok && groundPlan.validation.ok;
    console.log(`[office-furnish] ${repPlan.validation.diagnostic} (rep floor)`);
    console.log(`[office-furnish] ${groundPlan.validation.diagnostic} (ground floor)`);
    console.log(
        `[office-furnish] §DIAG-OFFICE-FURNISH §OFFICE-FURNISH-MODULAR occupancy≈${repPlan.mix.occupancy}: ` +
        `desks=${repPlan.desksPlaced} meeting=${repPlan.mix.meetingRooms} nook=${repPlan.mix.meetingNooks} ` +
        `booth=${repPlan.mix.phoneBooths} exec=${repPlan.mix.executiveOffices} ` +
        `collab=${repPlan.mix.collaborationBlocks} breakout=${repPlan.mix.breakoutBlocks} ` +
        `kitchen=${repPlan.mix.kitchenBlocks} decor=${repPlan.mix.decorClusters} ` +
        `→ ${repPlan.modules.length} modules on the rep floor; ground reception=${groundPlan.mix.receptionBlocks} ` +
        `→ ${groundPlan.modules.length} modules + ${cafes.length} cafe cluster(s).`,
    );

    const moduleCount = repPlan.modules.length + groundPlan.modules.length;
    const plannedFurniture =
        repPlan.items.length + groundPlan.items.length +
        cafes.reduce((s, c) => s + 1 + c.chairs.length, 0);
    const plannedLights = lightPts.length;

    // A PlacedItem → CreateFurnitureCommand emitter. The engine only names EXISTING FurnitureTypes;
    // cast at the boundary (the pure L2 engine keeps `furnitureType` a bare string to avoid the import).
    const placeItem = (levelId: string, it: PlacedItem): void => {
        try {
            cm.execute?.(new CreateFurnitureCommand({
                id: createId('furniture'),
                furnitureType: it.furnitureType as FurnitureType,
                position: { x: it.x, y: 0, z: it.z },      // y forced to level.elevation in execute()
                rotation: { x: 0, y: it.rotY, z: 0 },
                levelId,
                baseOffset: 0,
                width: it.width,
                length: it.length,
                height: it.height,
                material: it.material as FurnitureMaterial,
            }), { source: 'OFFICE_FURNISH_MODULE' });
        } catch (e) { console.warn('[office-furnish] module item skipped:', it.furnitureType, e); }
    };

    // ── Representative office floor: the modular workstation/collab/meeting/exec/booth/kitchen items. ──
    deferWork(() => {
        try {
            batchCoordinator.runBatch(() => {
                for (const it of repPlan.items) placeItem(cfg.repLevelId, it);
            }, { levelIds: [cfg.repLevelId], totalElementCount: repPlan.items.length, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log(`[office-furnish] ${repPlan.items.length} module item(s) placed on the representative floor`);
        } catch (e) { console.warn('[office-furnish] rep-floor module batch failed (non-fatal):', e); }
    }, 200);

    // ── Ground floor: the modular items (incl. the reception block) + cafe/canteen seating. ──
    deferWork(() => {
        try {
            batchCoordinator.runBatch(() => {
                for (const it of groundPlan.items) placeItem(cfg.groundLevelId, it);
                // Cafe / canteen seating (ground-specific breakout ring — round tables + chairs).
                for (const cc of cafes) {
                    placeItem(cfg.groundLevelId, { furnitureType: 'coffee_table', material: 'wood', height: 0.5, x: cc.table.x, z: cc.table.z, rotY: cc.table.rotY, width: cc.table.width, length: cc.table.length });
                    for (const c of cc.chairs) placeItem(cfg.groundLevelId, { furnitureType: 'chair', material: 'fabric', height: 0.9, x: c.x, z: c.z, rotY: c.rotY, width: c.width, length: c.length });
                }
            }, { levelIds: [cfg.groundLevelId], totalElementCount: groundPlan.items.length + cafes.length * 5, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log(`[office-furnish] ${groundPlan.items.length} module item(s) (incl. reception) + ${cafes.length} cafe cluster(s) on the ground floor`);
        } catch (e) { console.warn('[office-furnish] ground module batch failed (non-fatal):', e); }
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

    // ── Floor finish (warm timber office floor + stone lobby) — thin applied finishes over the disc,
    // seated on the settled slab. Room-independent (SPEC §11 warm timber/parquet office floor). ──
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
                lay(cfg.repLevelId, '#b98a5e', 'Warm Timber Office Floor');   // SPEC §11 warm timber/parquet
                lay(cfg.groundLevelId, '#d8d4cc', 'Lobby Stone Tile');
            }, { levelIds: [...new Set([cfg.repLevelId, cfg.groundLevelId])], totalElementCount: 2, skipRedetectRooms: true, skipPbrUpgrade: true });
            console.log('[office-furnish] floor finishes laid on the representative + ground floor');
        } catch (e) { console.warn('[office-furnish] floor-finish batch failed (non-fatal):', e); }
    }, 500);

    return { furnitureCount: plannedFurniture, lightCount: plannedLights, moduleCount, clearanceOk };
}
