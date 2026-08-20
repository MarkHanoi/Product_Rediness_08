// §SWALLOW-SIDE-INDEX — why the `catch { /* … */ }` blocks below are empty.
//
// Every one of them wraps a write to a SIDE INDEX (elementRegistry,
// bimManager, semanticGraphManager, roomSpatialIndex) that is derived from the
// element stores, never authoritative over them. The store mutation — the
// command's actual contract — has already committed and is NOT inside the try.
// A side index that rejects an unregister for an id it never held, or a
// register for an id it already holds, is reporting a no-op, not a failure:
// re-deriving the index from the stores would produce the same result either
// way. Re-throwing here would abort a command whose real work succeeded and
// leave the undo stack describing a mutation that was rolled back only halfway.
//
// This is NOT a §CONTEXT-DATA-HONESTY breach: nothing downstream reads a
// success/failure value from these calls, so there is no refusal being
// disguised as a result. If a side index ever becomes load-bearing for a
// query, these blocks must become reported failures.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData, StairShape, STAIR_CONSTRAINTS, DEFAULT_STAIR_PROPERTIES, Vec3 } from '@pryzm/geometry-stair';
// §STAIR-ONE-LIMIT-AUTHORITY (L-1430) — the tread/riser accept-set is ONE
// predicate shared with the sketch tool (`StairSolver2D._validate`), so the UI
// can no longer offer a stair this command will refuse (C84 EI-3).
import { resolveStairGeometryLimits, checkStairGeometry } from '@pryzm/geometry-stair';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { LevelTraversalPolicy } from '@pryzm/geometry-stair';
// §FIX-STAIR-SLAB-OPENING-SYMMETRY — the footprint maths, the host-slab choice
// and the `opening-stair-<id>` convention all moved to the ONE invariant owner.
import { carveStairOpening } from './StairSlabOpeningReconciler';
// §STAIR-PIERCES-EVERY-HORIZONTAL-HOST (L-1431) — the founder's "the stair cuts
// the slab but NOT the floor finish". The set of hosts a stair pierces is DERIVED
// from the families registered there and the levels the stair rises through, not
// enumerated here.
import {
    pierceStairHorizontalHosts,
    unpierceStairHorizontalHosts,
    type StairHostPierce,
} from './StairHorizontalHostPiercing';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/** §GEN-LOG-GATING (L-375b, 2026-07-17) — true while a building generation (or a project load)
 *  is in flight (`globalThis.__pryzmBuildingGenActive` / `__pryzmProjectLoadActive`, set by
 *  buildingGenerationLifecycle / ProjectLoader). CreateStairCommand's diagnostic logs below dump
 *  the full store-key list + the levels array on EVERY stair; a resi/office/house generation
 *  creates one stair per storey, so during generation those lines are pure main-thread-blocking
 *  console noise. Gate them off during generation/load; live user edits still log for debugging.
 *  Read via `globalThis` (no import) — the same seam BimKernel / WallOccupancyStore use for L-369. */
function __pryzmGenOrLoadActive(): boolean {
    const g = globalThis as unknown as { __pryzmProjectLoadActive?: boolean; __pryzmBuildingGenActive?: boolean };
    return g.__pryzmProjectLoadActive === true || g.__pryzmBuildingGenActive === true;
}

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
     * §PERSIST-L1 (DAILY-USE 2026-05-20) — When supplied, the new stair adopts
     * this id rather than generating a fresh UUID. ProjectLoader uses this to
     * round-trip the snapshot id, preserving every reference to the stair
     * (railings, openings, room boundaries, selection state). Mirrors the
     * already-established pattern in CreateWallCommand(id, …) +
     * CreateCurtainWallCommand({ id, … }) + CreateSlabCommand({ id, … }).
     */
    id?: string;
    /**
     * §PERSIST-L1 (W1-2) — the stair's ORIGINAL IFC GUID. `ifcData.guid` is the
     * IFC round-trip join key: it is what an exported IFC file, a BCF issue or a
     * Revit round-trip uses to find this stair again. It is AUTHORED — minted
     * once as a `crypto.randomUUID()` and not recomputable from `id` — so a
     * restore that does not carry it forward silently breaks that
     * correspondence, even though the stair id itself now round-trips (W1-1).
     *
     * Absent (a genuinely new stair), the command mints one at construction, so
     * the value is also stable across undo+redo. Previously the guid was minted
     * inside `StairStore.add()`, i.e. after undo had discarded the record.
     */
    ifcGuid?: string;
    /**
     * §PERSIST-L1 — Restore-time metadata override. ProjectLoader sets
     * `source: 'import'` so the audit trail distinguishes a snapshot reload
     * from a fresh creation. Defaults to `source: 'user'` for new stairs.
     */
    metadata?: Partial<StairData['metadata']>;
    /**
     * §PERSIST-L1 — Architect-tunable code-compliance fields that the
     * snapshot persists but the loader was previously dropping. Threaded as
     * optional with no default semantics change for the StairTool's fresh
     * creates.
     */
    buildingCodeVariant?: string;
    /**
     * §PERSIST-L1 — Type snapshot captured at the moment of stair authoring,
     * so a project that opens after the system type was modified or deleted
     * still renders with the architect's original parameter set. Same idea
     * as `wall.systemTypeSnapshot`. Optional; absence preserves current
     * "resolve from typeId" behaviour.
     */
    typeSnapshot?: StairData['typeSnapshot'];
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
    // §STAIR-PIERCES-EVERY-HORIZONTAL-HOST (L-1431) — 'floor' and 'ceiling' join
    // the declaration because this command now CUTS voids in those families too.
    // A cascade that mutates a store it does not declare is invisible to the
    // scoped snapshot (C03 §4.6 U-2) — which is precisely how the founder's log
    // could read `scope=[stair,opening,slab]` while the floor finish went
    // untouched: the scope was HONEST, and the mutation simply was not happening.
    readonly affectedStores = ["stair", "opening", "slab", "floor", "ceiling"] as const;
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
    /** §L-1431 — voids cut in the floor-finish / ceiling families, for undo. */
    private hostPierces: StairHostPierce[] = [];

    /** §PERSIST-L1 (W1-2) — stable IFC GUID; see `CreateStairInput.ifcGuid`. */
    private readonly _ifcGuid: string;

    constructor(input: CreateStairInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        // §PERSIST-L1 (W1-2) — adopt the supplied GUID, mint only in its absence,
        // and echo it back onto `input` so `serialize()` (which spreads `input`)
        // forwards the SAME guid to every collaboration peer and to replay.
        this._ifcGuid = input.ifcGuid ?? crypto.randomUUID();
        this.input = { ...input, ifcGuid: this._ifcGuid };
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

        const levels = wallStore.getLevels();
        if (!__pryzmGenOrLoadActive()) {
            console.log('[CreateStairCommand.canExecute] ctx.stores:', Object.keys(ctx.stores));
            console.log('[CreateStairCommand.canExecute] levels:', levels);
        }

        if (baseLevelId === this.input.topLevelId) {
            blockingIssues.push('Base level and top level cannot be the same');
        }

        const baseLevel = levels.find(l => l.id === baseLevelId);
        const topLevel = levels.find(l => l.id === this.input.topLevelId);

        if (!baseLevel) blockingIssues.push(`Base level "${baseLevelId}" does not exist`);
        if (!topLevel) blockingIssues.push(`Top level "${this.input.topLevelId}" does not exist`);

        // ⭐ §STAIR-ONE-LIMIT-AUTHORITY (L-1430) — riser + tread are checked by the
        // SHARED predicate, on BOTH tread quantities the input carries: the scalar
        // `treadDepth` and every `flights[i].treadDepth` (the per-run value
        // `StairMeshBuilder` actually builds with, previously validated by NOBODY
        // on this side). `StairSolver2D` runs the identical call, so the tool's
        // accept-set and this command's accept-set are the same set by
        // construction — pinned by
        // `packages/geometry-stair/src/__tests__/StairAcceptSetParity.spec.ts`.
        const typeRules = this.input.typeId && ctx.stores.stairTypeStore
            ? ctx.stores.stairTypeStore.resolveRules(this.input.typeId)
            : null;
        const limits = resolveStairGeometryLimits(STAIR_CONSTRAINTS, typeRules);
        for (const refusal of checkStairGeometry(
            {
                riserHeight: this.input.riserHeight,
                treadDepth: this.input.treadDepth,
                flights: this.input.flights,
            },
            limits,
        )) {
            blockingIssues.push(refusal.message);
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

        // §PERSIST-L1 (DAILY-USE 2026-05-20) — Honour caller-supplied id so
        // restored stairs keep their original UUID. Without this, every save/
        // load cycle invalidated railing→stair links, opening→stair links,
        // room→stair selection memory, and IFC mark continuity. Same shape as
        // CreateWallCommand(wall.id, …). Falls back to a fresh UUID when no
        // id is supplied (fresh creates from the StairTool).
        const stairId = this.input.id ?? crypto.randomUUID();
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
            // §PERSIST-L1 — Optional snapshot-captured type so the stair survives
            // type deletion / modification after the project was saved.
            typeSnapshot: this.input.typeSnapshot,
            // §PERSIST-L1 — `properties` round-trips the architect's choices:
            // mark, treadMaterial, riserMaterial, nosingType, stringerType,
            // handrailHeight, railingType, tags, description. The merge order
            // is DEFAULTS → type defaults → caller-supplied properties — so
            // the snapshot wins over both, which is the correct semantic for
            // a project reload.
            properties: { ...DEFAULT_STAIR_PROPERTIES, ...initialProperties },
            parameters: {},
            // §PERSIST-L1 — code-compliance + accessibility round-trip.
            buildingCodeVariant: this.input.buildingCodeVariant,
            // §PERSIST-L1 — Caller-supplied metadata wins (ProjectLoader sets
            // `source: 'import'` so the audit trail distinguishes restored
            // stairs from user-created ones). Defaults preserved on fresh
            // creates that don't pass an override.
            metadata: {
                createdAt: now,
                modifiedAt: now,
                version: 0,
                source: 'user' as const,
                ...(this.input.metadata ?? {}),
            },
            // §PERSIST-L1 (W1-2) — stamp the GUID resolved at construction time so a
            // restored stair keeps the guid it was saved with, and redo re-stamps the
            // same one. The `StairStore.add()` fallback now only fires for legacy /
            // AI-bypass stairs that arrive without an ifcData block.
            ifcData: {
                guid: this._ifcGuid,
                ifcClass: 'IfcStair',
            },
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
            // §FIX-CONNECTEDBY-EDGE-KEYING — `authoredBy: stairId` puts this stair
            // into the EDGE'S IDENTITY. Without it, `addRelationship` keys on
            // (baseLevel, topLevel, 'connectedByStair') alone and a SECOND stair
            // between the same two levels is a silent no-op that returns the first
            // stair's edge id — after which deleting either stair removes the only
            // edge present and strands the survivor. Two stairs are two facts.
            // `stairId` stays in metadata too: it is what DeleteStairCommand's
            // edge-wise purge matches on, and dropping it would break that purge.
            semanticGraphManager.addRelationship({
                type: 'connectedByStair',
                sourceId: baseLevelId,
                targetId: this.input.topLevelId,
                authoredBy: stairId,
                createdBy: 'CreateStairCommand',
                metadata: { stairId, shape: this.input.shape }
            });
            // Inverse direction — level graph is bidirectional for egress routing
            semanticGraphManager.addRelationship({
                type: 'connectedByStair',
                sourceId: this.input.topLevelId,
                targetId: baseLevelId,
                authoredBy: stairId,
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
            // §L-1431 — the same gesture, the remaining horizontal families. Under
            // the SAME opt-out: a user who says "no automatic opening" means no
            // automatic opening, in every host, not only in the slab.
            try {
                this.pierceHorizontalHosts(ctx);
            } catch (err) {
                console.warn('[CreateStairCommand] Horizontal-host piercing failed (non-fatal):', err);
            }
        }

        // NOTE: autoCreateLandings() is intentionally NOT called here.
        // StairMeshBuilder.buildStairGeometry() already bakes landing geometry
        // into the merged stair mesh for L- and U-shape stairs. The old
        // StairLandingBuilder path created a separate, wrongly-positioned
        // overlay mesh that caused a visible double-landing artefact.

        _bus.emit('ai-model-update', {}); // F.events.17

        this.proposeRailings(stair);

        if (!__pryzmGenOrLoadActive()) console.log(`[CreateStairCommand] Created stair ${stairId} (${this.input.shape}) from ${baseLevelId} to ${this.input.topLevelId}`);

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
        // §FIX-STAIR-SLAB-OPENING-SYMMETRY — the carve itself now lives in
        // `StairSlabOpeningReconciler`, because the SAME invariant must also be
        // satisfied in the opposite direction (a slab created ABOVE an existing
        // stair). Keeping the maths here and copying it into the slab path would
        // give one invariant two implementations that can drift; this command now
        // reconciles ONE stair through the shared owner, and `CreateSlabCommand`
        // reconciles every stair on the new slab's level through the same code.
        const carve = carveStairOpening(ctx, {
            id:            this.createdStairId!,
            shape:         this.input.shape,
            width:         this.input.width,
            treadDepth:    this.input.treadDepth,
            startPosition: this.input.startPosition,
            flights:       this.input.flights,
            landings:      this.input.landings,
            topLevelId:    this.input.topLevelId,
        });
        if (!carve) return;
        this.createdOpeningId = carve.openingId;
        this.createdOpeningHostSlabId = carve.hostSlabId;
        if (!__pryzmGenOrLoadActive()) console.log(
            `[CreateStairCommand] Auto-opening ${carve.openingId} created on slab ${carve.hostSlabId} ` +
            `(top level "${this.input.topLevelId}")`
        );
    }

    /**
     * §STAIR-PIERCES-EVERY-HORIZONTAL-HOST (L-1431) — the OTHER horizontal
     * families. `createAutoOpening` above handles the slab, whose void is a
     * first-class `opening` element with its own lifecycle; this handles every
     * family registered in `HORIZONTAL_HOST_PIERCERS` (floor finish, ceiling) on
     * every level the stair rises through.
     *
     * ⛔ This method knows NO family names and NO level ids. Both sets are derived
     * inside the piercing module — that is the whole point, and a `if (family ===`
     * appearing here would be the defect coming back.
     */
    private pierceHorizontalHosts(ctx: CommandContext): void {
        this.hostPierces = pierceStairHorizontalHosts(ctx, {
            id:            this.createdStairId!,
            shape:         this.input.shape,
            width:         this.input.width,
            treadDepth:    this.input.treadDepth,
            startPosition: this.input.startPosition,
            flights:       this.input.flights,
            landings:      this.input.landings,
            topLevelId:    this.input.topLevelId,
            // Resolved exactly as execute() resolves it: an empty payload field
            // means "the active level", and handing the raw '' downstream would
            // silently collapse the derived level span back to top-only.
            baseLevelId:   this.input.baseLevelId || ctx.projectContext?.activeLevelId,
        });
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
                try { ctx.bimManager.unregisterElement(this.createdOpeningId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.unregister(this.createdOpeningId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                if (slabStore) slabStore.triggerRebuild(this.createdOpeningHostSlabId);
            } catch (err) {
                console.warn('[CreateStairCommand.undo] Auto-opening cleanup failed (non-fatal):', err);
            }
            this.createdOpeningId = undefined;
            this.createdOpeningHostSlabId = undefined;
        }

        // §L-1431 — close the floor-finish / ceiling voids in the SAME undo unit.
        if (this.hostPierces.length > 0) {
            try {
                unpierceStairHorizontalHosts(ctx, this.hostPierces);
            } catch (err) {
                console.warn('[CreateStairCommand.undo] Horizontal-host un-piercing failed (non-fatal):', err);
            }
            this.hostPierces = [];
        }

        if (ctx.stores.stairLandingStore && this.createdLandingIds.length > 0) {
            this.createdLandingIds.forEach(lid => ctx.stores.stairLandingStore!.remove(lid));
            this.createdLandingIds = [];
        }

        if (ctx.stores.stairRailingStore) {
            const railings = ctx.stores.stairRailingStore.getByStairId(this.createdStairId);
            ctx.stores.stairRailingStore.removeByStairId(this.createdStairId);
            railings.forEach(r => {
                try { ctx.bimManager.unregisterElement(r.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.unregister(r.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
