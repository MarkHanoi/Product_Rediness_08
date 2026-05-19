import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import { doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { generateMark } from '@pryzm/core-app-model';

export class CreateWallOpeningCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.ADD_OPENING;
    timestamp: number = Date.now();
    targetIds: string[] = [];

    // ✅ FIX C7: IDs pre-generated in constructor (Contract §2.6).
    // Previously generated inside execute() with `|| crypto.randomUUID()`, which meant
    // each redo call produced a different elementId, causing the graph to accumulate
    // phantom opening references that could never be cleaned up on undo.
    private readonly openingId: string;
    private readonly openingElementId: string;

    constructor(private data: { wallId: string, openingData: any }) {
        this.targetIds = [data.wallId];
        this.openingId = data.openingData.id || crypto.randomUUID();
        this.openingElementId = data.openingData.elementId || crypto.randomUUID();
        // Normalise so downstream code always sees stable IDs
        this.data.openingData.id = this.openingId;
        this.data.openingData.elementId = this.openingElementId;
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const wall = context.stores.wallStore.getById(this.data.wallId);
        if (!wall) return { ok: false, reason: 'Wall not found' };

        // §OCCUPANCY — Contract §03-4.8, §06-8.5:
        // Validate that the proposed opening does not overlap any existing
        // opening on this wall, and does not extend beyond the wall's length.
        // wallOccupancyStore is a pure-query side system: it reads wall.openings[]
        // directly — no separate state, no lifecycle management required.
        const offsetM = this.data.openingData.offset ?? 0;
        const widthM  = this.data.openingData.width  ?? 0;
        const occupancyResult = wallOccupancyStore.canPlace(wall, offsetM, widthM);
        if (!occupancyResult.valid) {
            console.warn(
                `[CreateWallOpeningCommand] canExecute rejected: ${occupancyResult.reason}`,
                { wallId: this.data.wallId, offsetM, widthM }
            );
            return { ok: false, reason: occupancyResult.reason ?? 'Opening conflicts with existing opening' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const wall = wallStore.getById(this.data.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        // §7 Guard: elementId is required for spatial registration — constructor always pre-assigns it
        if (!this.openingElementId) {
            console.error('[CreateWallOpeningCommand] elementId is missing — spatial registration will be skipped. This is a contract violation.');
            return { success: false, affectedElementIds: [] };
        }

        // Guard: if opening is already present (e.g., double-execute), return early.
        // Do NOT call addOpening() again — it would create a duplicate entry.
        const existingOpening = wall.openings?.find((o: any) => o.id === this.openingId);
        if (existingOpening) {
            return { success: true, affectedElementIds: [existingOpening.elementId ?? this.openingElementId] };
        }

        // ✅ FIX C7: Use pre-generated stable IDs (never re-randomise here).
        const opening = {
            ...this.data.openingData,
            id: this.openingId,
            elementId: this.openingElementId
        };

        const updatedWall = wallStore.addOpening(this.data.wallId, opening);
        if (!updatedWall) return { success: false, affectedElementIds: [] };

        // 1️⃣ Spatial registration in BimManager (hierarchy).
        const bimManager = context.bimManager;
        if (bimManager && opening.elementId) {
            bimManager.registerElement(opening.elementId, updatedWall.levelId);
        }

        // 2️⃣ §3.5 FIX: Type registration moved here from WallStore.addOpening().
        //    Store must not register spatial/type elements (Contract §3.5).
        const openingType = opening.type === 'door' ? 'door' : 'window';
        elementRegistry.registerSemantic(this.openingElementId, openingType as any);

        // 3️⃣ B5: Write rich parametric record to DoorStore / WindowStore.
        // These are the first-class stores introduced in Phase B. The flat Opening
        // in wallStore.openings[] remains the geometry contract (R4 preserved).
        // Guard against double-insertion on redo.
        if (opening.type === 'door' && !doorStore.has(this.openingElementId)) {
            try {
                // Resolve DoorSystemType and stamp full finish layer objects (not just hex colors).
                // frameColor / leafColor are also set for backward-compat with the 3-D renderer.
                const doorSysType = opening.systemTypeId
                    ? doorSystemTypeStore.getById(opening.systemTypeId)
                    : undefined;

                // Contract §03-1.7: Auto-generate a canonical mark (DO-FF-NNN) at creation time.
                // Use the caller-supplied mark if one was already set; otherwise use MarkGenerator.
                const doorMark: string = opening.mark && String(opening.mark).trim()
                    ? String(opening.mark)
                    : generateMark('door', wall.levelId, {
                        getLevels:            () => context.bimManager.getLevels(),
                        countElementsOnLevel: () => doorStore.getAll().length,
                    });

                doorStore.add({
                    id:           this.openingElementId,
                    openingId:    this.openingId,
                    wallId:       this.data.wallId,
                    offset:       opening.offset ?? 0,
                    width:        opening.width ?? 1.0,
                    height:       opening.height ?? 2.1,
                    sillHeight:   opening.sillHeight ?? 0,
                    doorType:     (opening.doorType as any) ?? 'single',
                    systemTypeId: opening.systemTypeId,
                    mark:         doorMark,
                    ...(doorSysType ? {
                        // Full structured finish layers — primary BIM finish data
                        frameFinish:    { ...doorSysType.frameFinish },
                        leafFinish:     { ...doorSysType.leafFinish },
                        // Derived render colors (backward-compat)
                        frameColor:     doorSysType.frameFinish.materialColor,
                        leafColor:      doorSysType.leafFinish.materialColor,
                        // Auto-populate finishMaterial from leaf finish name for room schedules
                        finishMaterial: doorSysType.leafFinish.name,
                    } : {}),
                });
            } catch (err) {
                console.warn('[CreateWallOpeningCommand] DoorStore.add failed (non-fatal):', err);
            }
        } else if (opening.type === 'window' && !windowStore.has(this.openingElementId)) {
            try {
                // Resolve WindowSystemType and stamp full finish layer objects (not just hex colors).
                // frameColor is also set for backward-compat with the 3-D renderer.
                const winSysType = opening.systemTypeId
                    ? windowSystemTypeStore.getById(opening.systemTypeId)
                    : undefined;

                // Contract §03-1.7: Auto-generate a canonical mark (WN-FF-NNN) at creation time.
                // Use the caller-supplied mark if one was already set; otherwise use MarkGenerator.
                const windowMark: string = opening.mark && String(opening.mark).trim()
                    ? String(opening.mark)
                    : generateMark('window', wall.levelId, {
                        getLevels:            () => context.bimManager.getLevels(),
                        countElementsOnLevel: () => windowStore.getAll().length,
                    });

                windowStore.add({
                    id:           this.openingElementId,
                    openingId:    this.openingId,
                    wallId:       this.data.wallId,
                    offset:       opening.offset ?? 0,
                    width:        opening.width ?? 1.2,
                    height:       opening.height ?? 1.2,
                    sillHeight:   opening.sillHeight ?? 1.0,
                    windowType:   (opening.windowType as any) ?? 'single',
                    systemTypeId: opening.systemTypeId,
                    mark:         windowMark,
                    ...(winSysType ? {
                        // Full structured finish layers — primary BIM finish data
                        frameFinish:    { ...winSysType.frameFinish },
                        sillFinish:     { ...winSysType.sillFinish },
                        // Derived render color (backward-compat)
                        frameColor:     winSysType.frameFinish.materialColor,
                        glassOpacity:   winSysType.glazingOpacity,
                        // Auto-populate finishMaterial from frame finish name for room schedules
                        finishMaterial: winSysType.frameFinish.name,
                        ...(winSysType.defaultColumnRatios?.length ? { columnRatios: [...winSysType.defaultColumnRatios] } : {}),
                        ...(winSysType.defaultRowRatios?.length    ? { rowRatios:    [...winSysType.defaultRowRatios]    } : {}),
                    } : {}),
                });
            } catch (err) {
                console.warn('[CreateWallOpeningCommand] WindowStore.add failed (non-fatal):', err);
            }
        }

        // 4️⃣ Phase D — D-1: SemanticGraph — wall hosts opening / opening hostedBy wall.
        // Written atomically with the store writes above (contract §PRYZM_MASTER_ROADMAP_2026 §D-1).
        try {
            semanticGraphManager.addRelationship({
                type:      'hosts',
                sourceId:  this.data.wallId,
                targetId:  this.openingElementId,
                createdBy: 'system',
            });
            semanticGraphManager.addRelationship({
                type:      'hostedBy',
                sourceId:  this.openingElementId,
                targetId:  this.data.wallId,
                createdBy: 'system',
            });
        } catch (err) {
            console.warn('[CreateWallOpeningCommand] SemanticGraph write failed (non-fatal):', err);
        }

        // Rebuild is triggered automatically via wallStore.addOpening() → emit('update')
        // → subscriber in main.ts → wallFragmentBuilder.updateWall().

        return { success: true, affectedElementIds: [opening.elementId] };
    }

    undo(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const currentWall = wallStore.getById(this.data.wallId);

        // Use the stable openingId (pre-generated in constructor) to locate the opening.
        // This is simpler and more reliable than a snapshot-diff approach.
        const addedOpening = currentWall?.openings?.find((o: any) => o.id === this.openingId);

        if (!addedOpening) {
            // Opening already absent (double-undo guard) — nothing to undo.
            return { success: true, affectedElementIds: [this.data.wallId] };
        }

        // Unregister from spatial systems BEFORE store removal.
        if (addedOpening.elementId) {
            if (context.bimManager) context.bimManager.unregisterElement(addedOpening.elementId);
            // §3.5: Mirrors execute() registration — command layer owns the registry.
            elementRegistry.unregister(addedOpening.elementId);
        }

        // §FIX: Use removeOpening() instead of updateWall(prevSnapshot).
        // WallStore.update() has a guard (line ~214) that silently strips the 'openings'
        // field from any update to prevent direct manipulation. Calling
        // wallStore.updateWall(prevSnapshot) therefore never removed the opening — the
        // window stayed visible after undo. removeOpening() is the correct API: it removes
        // from openings[], childrenIds[], and the windows/doors map, then emits 'update'
        // which triggers the subscriber in main.ts → wallFragmentBuilder rebuild.
        wallStore.removeOpening(this.data.wallId, this.openingId);

        // B5: Mirror removal in the rich stores (idempotent — remove() is a no-op if absent).
        doorStore.remove(addedOpening.elementId ?? this.openingElementId);
        windowStore.remove(addedOpening.elementId ?? this.openingElementId);

        // Phase D — D-1: Remove SemanticGraph relationships (hosts + hostedBy).
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.openingElementId);
        } catch (err) {
            console.warn('[CreateWallOpeningCommand] SemanticGraph cleanup failed (non-fatal):', err);
        }

        return { success: true, affectedElementIds: [this.data.wallId] };
    }

    serialize(): SerializedCommand {
        return { 
            type: this.type, 
            targetIds: this.targetIds, 
            timestamp: this.timestamp, 
            payload: { 
                wallId: this.data.wallId, 
                openingData: this.data.openingData 
            }, 
            version: 1 
        };
    }
}