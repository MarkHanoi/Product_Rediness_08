import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData, StairShape, STAIR_CONSTRAINTS, DEFAULT_STAIR_PROPERTIES, Vec3 } from '@pryzm/geometry-stair';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { computeStairFootprintRect, worldXZToSlabLocal } from '@pryzm/geometry-stair';
import { LevelTraversalPolicy } from '@pryzm/geometry-stair';
import type { OpeningData } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface CreateStairInput {
    baseLevelId: string;
    topLevelId: string;
    shape: StairShape;
    riserHeight: number;
    treadDepth: number;
    width: number;
    startPosition: Vec3;
    flights: { direction: Vec3; riserCount: number; startOverride?: Vec3; treadDepth?: number }[];
    landings?: { depth: number; center?: Vec3 }[];
    fireRating?: string;
    accessibilityType?: 'standard' | 'accessible';
    typeId?: string;
    properties?: Record<string, any>;
    /** L-shape: which way the second run turns (default 'left') */
    turnDirection?: 'left' | 'right';
    /** U-shape: which side the second run is placed on (default 'left') */
    secondRunSide?: 'left' | 'right';
    /** L / U shapes: number of risers in flight 1 before the landing */
    stepsBeforeLanding?: number;
    /**
     * When true (default), the command computes the stair's plan-view bounding
     * rectangle and automatically punches an opening on the slab whose
     * `levelId === topLevelId`, so the stair has clear vertical headroom.
     * Set to false to skip the auto-opening (e.g. for stairs that emerge
     * outdoors or where the opening already exists).
     *
     * §STAIR-AUDIT-2026 F10 fix (FIXED 2026-04-25): the canonical default is
     * `true` and is enforced via `input.autoCreateOpening !== false` everywhere
     * the flag is consulted, so `undefined` and missing both behave the same
     * as the documented default.
     */
    autoCreateOpening?: boolean;
}

export class CreateStairCommand implements Command {
    /**
     * §STAIR-AUDIT-2026 F33 fix (FIXED 2026-04-25): the lock-graph now reflects
     * the actual write-set.  `level` was never mutated by this command (the
     * level table is read-only consulted via `wallStore.getLevels()`), and the
     * auto-opening pass writes to `opening` and the host `slab`.
     */
    readonly affectedStores = ["stair", "opening", "slab"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_STAIR;
    readonly timestamp: number;
    readonly targetIds: string[];

    private input: CreateStairInput;
    private createdStairId?: string;
    private createdLandingIds: string[] = [];
    /** Auto-opening punched on the slab above (for undo). */
    private createdOpeningId?: string;
    private createdOpeningHostSlabId?: string;

    constructor(input: CreateStairInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.input = input;
        this.targetIds = [];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        // §F11 fix (FIXED 2026-04-25): `ProjectContext.activeLevelId` is a
        // public getter, no `as any` cast required.
        const activeLevelId = ctx.projectContext?.activeLevelId;
        const baseLevelId = this.input.baseLevelId || activeLevelId;

        const blockingIssues: string[] = [];
        const warnings: string[] = [];
        const { wallStore, stairStore } = ctx.stores;

        console.log('[CreateStairCommand.canExecute] ctx.stores:', Object.keys(ctx.stores));
        const levels = wallStore.getLevels();
        console.log('[CreateStairCommand.canExecute] levels:', levels);

        if (baseLevelId === this.input.topLevelId) {
            blockingIssues.push('Base level and top level cannot be the same');
        }

        const baseLevel = levels.find(l => l.id === baseLevelId);
        const topLevel = levels.find(l => l.id === this.input.topLevelId);

        if (!baseLevel) blockingIssues.push(`Base level "${baseLevelId}" does not exist`);
        if (!topLevel) blockingIssues.push(`Top level "${this.input.topLevelId}" does not exist`);

        let maxRiser = STAIR_CONSTRAINTS.MAX_RISER_HEIGHT;
        let minTread = STAIR_CONSTRAINTS.MIN_TREAD_DEPTH;

        if (this.input.typeId && ctx.stores.stairTypeStore) {
            const typeRules = ctx.stores.stairTypeStore.resolveRules(this.input.typeId);
            if (typeRules) {
                maxRiser = typeRules.maxRiserHeight;
                minTread = typeRules.minTreadDepth;
            }
        }

        if (this.input.riserHeight < STAIR_CONSTRAINTS.MIN_RISER_HEIGHT) {
            blockingIssues.push(`Riser height ${(this.input.riserHeight * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_RISER_HEIGHT * 1000).toFixed(0)}mm`);
        }
        if (this.input.riserHeight > maxRiser) {
            blockingIssues.push(`Riser height ${(this.input.riserHeight * 1000).toFixed(0)}mm exceeds maximum ${(maxRiser * 1000).toFixed(0)}mm`);
        }
        if (this.input.treadDepth < minTread) {
            blockingIssues.push(`Tread depth ${(this.input.treadDepth * 1000).toFixed(0)}mm is below minimum ${(minTread * 1000).toFixed(0)}mm`);
        }
        if (this.input.width < STAIR_CONSTRAINTS.MIN_WIDTH) {
            blockingIssues.push(`Stair width ${(this.input.width * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_WIDTH * 1000).toFixed(0)}mm`);
        }
        if (this.input.accessibilityType === 'accessible' && this.input.width < STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH) {
            blockingIssues.push(`Accessible stair width ${(this.input.width * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH * 1000).toFixed(0)}mm`);
        }

        const totalRiserCount = this.input.flights.reduce((sum, f) => sum + f.riserCount, 0);
        if (totalRiserCount < STAIR_CONSTRAINTS.MIN_RISER_COUNT) {
            blockingIssues.push(`Total riser count ${totalRiserCount} is below minimum ${STAIR_CONSTRAINTS.MIN_RISER_COUNT}`);
        }

        this.input.flights.forEach((flight, idx) => {
            if (flight.direction.x === 0 && flight.direction.y === 0 && flight.direction.z === 0) {
                blockingIssues.push(`Flight ${idx + 1} direction cannot be zero vector`);
            }
        });

        if (baseLevel && topLevel) {
            const levelHeight = topLevel.elevation - baseLevel.elevation;
            const calculatedHeight = this.input.riserHeight * totalRiserCount;
            const difference = Math.abs(calculatedHeight - levelHeight);

            if (difference > STAIR_CONSTRAINTS.HEIGHT_TOLERANCE) {
                blockingIssues.push(
                    `Total stair height ${(calculatedHeight * 1000).toFixed(0)}mm does not match level height ${(levelHeight * 1000).toFixed(0)}mm (tolerance: ${(STAIR_CONSTRAINTS.HEIGHT_TOLERANCE * 1000).toFixed(0)}mm)`
                );
            }

            const existingStair = stairStore.getStairConnectingLevels(this.input.baseLevelId, this.input.topLevelId);
            if (existingStair) {
                warnings.push(`A stair already connects ${baseLevel.name} to ${topLevel.name} (Duplicate allowed for testing)`);
            }

            // §F6 fix (FIXED 2026-04-25): adjacent-level rule moved into
            // LevelTraversalPolicy.  Skipping intermediate levels is now a
            // soft warning by default (mezzanine-skip / service-stair-bypass
            // are valid Revit/ArchiCAD patterns).  A stair type may impose
            // its own `maxLevelSkip` cap to keep monolithic-concrete stairs
            // adjacent-only.
            const traversal = LevelTraversalPolicy.canTraverse(
                this.input.baseLevelId,
                this.input.topLevelId,
                levels,
                ctx.stores.stairTypeStore,
                this.input.typeId,
            );
            if (!traversal.ok && traversal.reason) {
                blockingIssues.push(traversal.reason);
            }
            if (traversal.warning) warnings.push(traversal.warning);
        }

        if (!this.input.fireRating) warnings.push('Stair has no fire rating specified');
        if (this.input.width < STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH && this.input.accessibilityType !== 'accessible') {
            warnings.push('Stair width is below accessibility minimum (1200mm)');
        }

        if (blockingIssues.length > 0) {
            return { ok: false, reason: blockingIssues[0], blockingIssues, warnings };
        }

        return { ok: true, warnings };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore } = ctx.stores;

        const stairId = crypto.randomUUID();
        // §F11 fix (FIXED 2026-04-25): typed access via the public getter.
        const baseLevelId = this.input.baseLevelId || ctx.projectContext?.activeLevelId;

        if (!baseLevelId) {
            return { success: false, affectedElementIds: [], info: ['Execution failed: Missing baseLevelId'] };
        }

        try {
            ctx.bimManager.registerElement(stairId, baseLevelId);
        } catch (e: any) {
            return { success: false, affectedElementIds: [], info: [e.message] };
        }

        // §03-SEMANTIC-MODEL — Register stair in elementRegistry so AI queries,
        // selection manager, and generic deletion can resolve this element by type.
        elementRegistry.registerSemantic(stairId, 'stair');

        let initialProperties: Partial<typeof DEFAULT_STAIR_PROPERTIES> = {};

        if (this.input.typeId && ctx.stores.stairTypeStore) {
            const typeDefaults = ctx.stores.stairTypeStore.resolveDefaults(this.input.typeId);
            if (typeDefaults) {
                initialProperties = { ...(typeDefaults as Partial<import('@pryzm/geometry-stair').StairProperties>) };
            }
        }

        if (this.input.properties) {
            initialProperties = { ...initialProperties, ...this.input.properties };
        }

        const totalRiserCount = this.input.flights.reduce((sum, f) => sum + f.riserCount, 0);
        const now = new Date().toISOString();

        // Phase 1: StairData uses Vec3 (plain {x,y,z} objects) — no THREE.Vector3
        const stair: StairData = {
            id: stairId,
            type: 'stair',
            levelId: baseLevelId,
            baseLevelId,
            topLevelId: this.input.topLevelId,
            baseOffset: 0,
            topOffset: 0,
            shape: this.input.shape,
            riserHeight: this.input.riserHeight,
            treadDepth: this.input.treadDepth,
            width: this.input.width,
            riserCount: totalRiserCount,
            // Phase 1: Store as plain Vec3 — no new THREE.Vector3(...)
            startPosition: {
                x: this.input.startPosition.x,
                y: this.input.startPosition.y,
                z: this.input.startPosition.z
            },
            flights: this.input.flights.map(f => ({
                direction: { x: f.direction.x, y: f.direction.y, z: f.direction.z },
                riserCount: f.riserCount,
                startOverride: f.startOverride
                    ? { x: f.startOverride.x, y: f.startOverride.y, z: f.startOverride.z }
                    : undefined,
                // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — carry the per-flight tread depth
                // computed by the 2D solver (segment_length / step_count) into the
                // canonical StairData so StairMeshBuilder builds each flight to fit
                // its drawn polyline segment exactly.
                treadDepth: f.treadDepth,
            })),
            landings: this.input.landings || [],
            turnDirection: this.input.turnDirection,
            secondRunSide: this.input.secondRunSide,
            stepsBeforeLanding: this.input.stepsBeforeLanding,
            fireRating: this.input.fireRating,
            accessibilityType: this.input.accessibilityType || 'standard',
            typeId: this.input.typeId,
            properties: { ...DEFAULT_STAIR_PROPERTIES, ...initialProperties },
            parameters: {},
            metadata: {
                createdAt: now,
                modifiedAt: now,
                version: 0,
                source: 'user'
            }
        };

        stairStore.add(stair);
        this.createdStairId = stairId;
        (this.targetIds as string[]).push(stairId);

        // Gap 7 — SemanticGraph: stair sitsOn its base level and connectedByStair
        // to express the vertical link between two levels.
        // This enables DependencyResolver to route egress queries through the stair
        // and powers IFC IfcRelConnectsElements for stair-to-level associations.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: stairId,
                targetId: baseLevelId,
                createdBy: 'CreateStairCommand',
                metadata: { addedBy: 'CreateStairCommand' }
            });
            semanticGraphManager.addRelationship({
                type: 'connectedByStair',
                sourceId: baseLevelId,
                targetId: this.input.topLevelId,
                createdBy: 'CreateStairCommand',
                metadata: { stairId, shape: this.input.shape }
            });
            // Inverse direction — level graph is bidirectional for egress routing
            semanticGraphManager.addRelationship({
                type: 'connectedByStair',
                sourceId: this.input.topLevelId,
                targetId: baseLevelId,
                createdBy: 'CreateStairCommand',
                metadata: { stairId, shape: this.input.shape, inverse: true }
            });
        } catch (err) {
            console.warn('[CreateStairCommand] SemanticGraph write failed (non-fatal):', err);
        }

        // ── Auto-opening on the slab above ──────────────────────────────────
        // Compute the stair's plan-view bounding rectangle and punch a matching
        // opening on the slab whose levelId === topLevelId, so the stair has
        // clear vertical headroom. Opt-out via input.autoCreateOpening = false.
        if (this.input.autoCreateOpening !== false) {
            try {
                this.createAutoOpening(ctx);
            } catch (err) {
                console.warn('[CreateStairCommand] Auto-opening failed (non-fatal):', err);
            }
        }

        // NOTE: autoCreateLandings() is intentionally NOT called here.
        // StairMeshBuilder.buildStairGeometry() already bakes landing geometry
        // into the merged stair mesh for L- and U-shape stairs. The old
        // StairLandingBuilder path created a separate, wrongly-positioned
        // overlay mesh that caused a visible double-landing artefact.

        _bus.emit('ai-model-update', {}); // F.events.17

        this.proposeRailings(stair);

        console.log(`[CreateStairCommand] Created stair ${stairId} (${this.input.shape}) from ${baseLevelId} to ${this.input.topLevelId}`);

        return {
            success: true,
            affectedElementIds: [stairId],
            info: [
                `Created ${this.input.shape}-shape stair with ${totalRiserCount} risers`,
                `Width: ${(this.input.width * 1000).toFixed(0)}mm`,
                `Riser height: ${(this.input.riserHeight * 1000).toFixed(0)}mm`,
                `Tread depth: ${(this.input.treadDepth * 1000).toFixed(0)}mm`
            ]
        };
    }

    /**
     * Compute the stair's plan-view bounding rectangle and create an opening
     * on the slab whose levelId === topLevelId. The opening profile is stored
     * in slab-local 2D coords (x = world.x − slab.x, y = world.z − slab.z),
     * matching the convention used by OpeningTool / SlabFragmentBuilder.
     */
    private createAutoOpening(ctx: CommandContext): void {
        const stores = ctx.stores as any;
        const slabStore = stores.slabStore;
        const openingStore = stores.openingStore;
        if (!slabStore || !openingStore) {
            console.log('[CreateStairCommand] Auto-opening skipped: slabStore/openingStore not available');
            return;
        }

        // Pick the slab on the top level. If multiple slabs exist on that
        // level we punch the one closest (in plan) to the stair top — the
        // intuitive choice when stairs land in a building with several slabs.
        const candidates = slabStore.getAll().filter(
            (s: any) => s.levelId === this.input.topLevelId
        );
        if (candidates.length === 0) {
            console.log(
                `[CreateStairCommand] Auto-opening skipped: no slab on top level "${this.input.topLevelId}"`
            );
            return;
        }

        const rect = computeStairFootprintRect({
            shape: this.input.shape,
            width: this.input.width,
            treadDepth: this.input.treadDepth,
            startPosition: this.input.startPosition,
            flights: this.input.flights,
            landings: this.input.landings,
        });
        if (!rect) {
            console.warn('[CreateStairCommand] Auto-opening skipped: degenerate stair footprint');
            return;
        }

        // Centroid of the stair rect — used to pick the nearest slab.
        const cx = (rect[0].x + rect[1].x + rect[2].x + rect[3].x) / 4;
        const cz = (rect[0].z + rect[1].z + rect[2].z + rect[3].z) / 4;
        let host = candidates[0];
        if (candidates.length > 1) {
            let bestD2 = Infinity;
            for (const s of candidates) {
                const dx = s.position.x - cx;
                const dz = s.position.z - cz;
                const d2 = dx * dx + dz * dz;
                if (d2 < bestD2) { bestD2 = d2; host = s; }
            }
        }

        const profile = rect.map(p => worldXZToSlabLocal(p, host.position));
        const openingId = `opening-stair-${this.createdStairId}`;

        const opening: OpeningData = {
            id: openingId,
            type: 'opening',
            hostId: host.id,
            levelId: this.input.topLevelId,
            parentId: host.id,
            profile,
            baseOffset: 0,
            properties: {},
        };

        try {
            ctx.bimManager.registerElement(openingId, this.input.topLevelId);
        } catch (e: any) {
            console.warn('[CreateStairCommand] bimManager.registerElement(opening) failed:', e?.message);
        }
        elementRegistry.registerSemantic(openingId, 'opening');
        openingStore.add(opening);
        // Mirror CreateOpeningCommand: trigger slab geometry re-projection.
        slabStore.triggerRebuild(host.id);

        this.createdOpeningId = openingId;
        this.createdOpeningHostSlabId = host.id;

        console.log(
            `[CreateStairCommand] Auto-opening ${openingId} created on slab ${host.id} ` +
            `(top level "${this.input.topLevelId}")`
        );
    }

    private proposeRailings(stair: StairData): void {
        _bus.emit('bim-stair-railing-proposal', { stairId: stair.id, proposedRailings: [ // F.events.17
            {
                side: 'left',
                topRailHeight: stair.properties.handrailHeight,
                balusterSpacing: 0.15,
                balusterShape: 'rectangular',
                balusterWidth: 0.04,
                postAtStart: true,
                postAtEnd: true,
                material: stair.properties.material ?? 'steel'
            },
            {
                side: 'right',
                topRailHeight: stair.properties.handrailHeight,
                balusterSpacing: 0.15,
                balusterShape: 'rectangular',
                balusterWidth: 0.04,
                postAtStart: true,
                postAtEnd: true,
                material: stair.properties.material ?? 'steel'
            }
        ] });
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.createdStairId) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: stair was never created'] };
        }

        ctx.bimManager.unregisterElement(this.createdStairId);
        elementRegistry.unregister(this.createdStairId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdStairId);
        } catch (err) {
            console.warn('[CreateStairCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }

        const { stairStore } = ctx.stores;

        // Remove the auto-opening (if any) before removing the stair, so the
        // slab rebuild fires once with the stair gone and the opening gone.
        if (this.createdOpeningId && this.createdOpeningHostSlabId) {
            const stores = ctx.stores as any;
            const openingStore = stores.openingStore;
            const slabStore = stores.slabStore;
            try {
                if (openingStore) openingStore.remove(this.createdOpeningId);
                try { ctx.bimManager.unregisterElement(this.createdOpeningId); } catch (_) {}
                try { elementRegistry.unregister(this.createdOpeningId); } catch (_) {}
                if (slabStore) slabStore.triggerRebuild(this.createdOpeningHostSlabId);
            } catch (err) {
                console.warn('[CreateStairCommand.undo] Auto-opening cleanup failed (non-fatal):', err);
            }
            this.createdOpeningId = undefined;
            this.createdOpeningHostSlabId = undefined;
        }

        if (ctx.stores.stairLandingStore && this.createdLandingIds.length > 0) {
            this.createdLandingIds.forEach(lid => ctx.stores.stairLandingStore!.remove(lid));
            this.createdLandingIds = [];
        }

        if (ctx.stores.stairRailingStore) {
            const railings = ctx.stores.stairRailingStore.getByStairId(this.createdStairId);
            ctx.stores.stairRailingStore.removeByStairId(this.createdStairId);
            railings.forEach(r => {
                try { ctx.bimManager.unregisterElement(r.id); } catch (_) {}
                try { elementRegistry.unregister(r.id); } catch (_) {}
            });
        }

        stairStore.remove(this.createdStairId);

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[CreateStairCommand] Undone stair ${this.createdStairId}`);

        return { success: true, affectedElementIds: [this.createdStairId], info: ['Stair creation undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { ...this.input, createdStairId: this.createdStairId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
