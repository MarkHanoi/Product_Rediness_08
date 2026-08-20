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
import { carveStairOpening, type StairOpeningCarve } from './StairSlabOpeningReconciler';
// §STAIR-PIERCES-EVERY-HORIZONTAL-HOST (L-1431) — the founder's "the stair cuts
// the slab but NOT the floor finish". The set of hosts a stair pierces is DERIVED
// from the families registered there and the levels the stair rises through, not
// enumerated here.
import {
    pierceStairHorizontalHosts,
    unpierceStairHorizontalHosts,
    type StairHostPierce,
} from './StairHorizontalHostPiercing';
// §STAIR-REDO-ONE-UNIT (L-1530) — the auto-proposed railings are created by THIS
// command, in THIS command's execute(), because this command's undo() has always
// removed them (`stairRailingStore.removeByStairId`). See `createRailings()`.
import { CreateStairRailingCommand } from './CreateStairRailingCommand';
// §STABLE-CREATED-ID (C03 §2.6) — see the `stableCreatedId` call in execute().
import { stableCreatedId } from '../StableCreatedId';
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
    /**
     * §STAIR-VOID-EVERY-DECK (L-1433) — the auto-openings punched in the slabs
     * this stair passes through, for undo. It was ONE (the top deck's) until
     * L-1433; a level-skipping stair carves one per deck.
     */
    private createdOpeningCarves: StairOpeningCarve[] = [];
    /** §L-1431 — voids cut in the floor-finish / ceiling families, for undo. */
    private hostPierces: StairHostPierce[] = [];
    /**
     * §STAIR-REDO-ONE-UNIT (L-1530) — the two auto-proposed railing commands,
     * MEMOISED on this instance so a redo replays the SAME instances (and, via
     * their own `stableCreatedId`, the SAME railing ids) instead of minting a
     * second pair. Built lazily on first execute; never rebuilt.
     */
    private _railingCommands: CreateStairRailingCommand[] | null = null;

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

        // ⭐ §STAIR-ONE-LIMIT-AUTHORITY (L-1430, +L-1434) — riser + tread + width +
        // risers-per-flight are checked by the
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
                width: this.input.width,
                accessibilityType: this.input.accessibilityType,
            },
            limits,
        )) {
            blockingIssues.push(refusal.message);
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
        // ⭐ §STAIR-REDO-STABLE-ID (L-1531 — C03 §2.6). This read
        // `this.input.id ?? crypto.randomUUID()`, and `CommandManager.redo()`
        // re-runs THIS SAME INSTANCE's execute() — so every redo of a stair drawn
        // by hand (neither plan tool supplies an `id`: StairPlanToolHandler.ts:246,
        // StairPathPlanToolHandler) minted a DIFFERENT element id. The stair "came
        // back", but as a different element: the auto-opening and the floor/ceiling
        // pierces are keyed off the stair id (`opening-stair-<id>`,
        // `pierce-stair-<id>-…`), so they came back under new keys too, and the
        // railings — whose `input.stairId` still names the ORIGINAL stair — could
        // no longer resolve their host. Worse, `_ifcGuid` IS stable across redo, so
        // the redone stair carried the ORIGINAL stair's IfcGloballyUniqueId under a
        // new element id: two elements, one GUID, if the first was ever persisted.
        // `stableCreatedId` memoises the first mint on this command instance, which
        // is the mechanism the same audit already applied to this stair's RAILING
        // (`CreateStairRailingCommand.ts:101`) and to lighting / furniture /
        // plumbing / slab — the stair itself was the family it missed.
        const stairId = stableCreatedId(this, 'stair', this.input.id);
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
        // §L-1532 — `push` unconditionally, so `targetIds` GREW by one on every
        // redo. It is the C03 §4.6 U-9 identity set that `dropEntriesForTargets`
        // (the U-8 shadow-drop) and `_isSameGestureTwin`'s SUBSET predicate read;
        // a stale id in it makes the twin test answer for an element that no
        // longer exists. One execute, one id, however many times it replays.
        if (!this.targetIds.includes(stairId)) (this.targetIds as string[]).push(stairId);

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

        this.createRailings(ctx, stair);

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
        this.createdOpeningCarves = carveStairOpening(ctx, {
            id:            this.createdStairId!,
            shape:         this.input.shape,
            width:         this.input.width,
            treadDepth:    this.input.treadDepth,
            startPosition: this.input.startPosition,
            flights:       this.input.flights,
            landings:      this.input.landings,
            topLevelId:    this.input.topLevelId,
            // §L-1433 — without this the deck set collapses to the top level and
            // the reconciler reports `level_basis: 'fallback-top-only'`.
            baseLevelId:   this.input.baseLevelId || ctx.projectContext?.activeLevelId,
        });
        if (this.createdOpeningCarves.length === 0) return;
        if (!__pryzmGenOrLoadActive()) console.log(
            `[CreateStairCommand] Auto-opening: ${this.createdOpeningCarves.length} slab void(s) — ` +
            this.createdOpeningCarves.map(c => `${c.openingId} on slab ${c.hostSlabId}`).join(', ')
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

    /**
     * ⭐ §STAIR-REDO-ONE-UNIT (L-1530) — THE STAIR'S AUTO-RAILINGS ARE THIS
     * COMMAND'S OWN WORK, AND THEY ALWAYS WERE ON THE UNDO SIDE.
     *
     * WHAT THIS USED TO BE, AND WHY IT WAS THE FOUNDER'S "STAIR REDO DOESN'T WORK".
     * ------------------------------------------------------------------------
     * This method was `proposeRailings()`: it emitted `bim-stair-railing-proposal`
     * and walked away. The ONLY listener (`initTools.ts:2476`) forwards each
     * proposal to `bus.executeCommand('stair.createRailing')`, whose handler
     * (`plugins/stair/src/handlers/CreateStairRailing.ts:73`) calls
     * `window.commandManager.execute(new CreateStairRailingCommand(...))` with NO
     * metadata — i.e. `source: 'HUMAN_DIRECT'`.
     *
     * That whole chain is SYNCHRONOUS. `DOMEventBus.emit` is `dispatchEvent`, and
     * `CommandBus.executeCommand` has no `await` before `handler.execute`
     * (`CommandBus.ts:454`). So the two railing commands were executed from INSIDE
     * this command's own `execute()` — and because their source was `HUMAN_DIRECT`
     * rather than `STRUCTURAL_CASCADE`, `CommandManagerImpl.ts:425` refused to
     * attach them as `structuralChildren` and instead ran the `else` branch:
     * `history.push(entry); this.redoStack = [];`.
     *
     * MEASURED, through the real `CommandManager` (`stairRedoOneUndoUnit.test.ts`):
     *
     *   draw stair   history=[RAILING, RAILING, STAIR]   redo=[]
     *   Ctrl+Z x1    history=[RAILING, RAILING]          redo=[STAIR]
     *   Ctrl+Z x2    history=[RAILING]                   redo=[STAIR, RAILING]
     *   Ctrl+Z x3    history=[]                          redo=[STAIR, RAILING, RAILING]
     *   Ctrl+Y x1    -> CreateStairRailing REFUSES ("Stair not found") -> false
     *   Ctrl+Y x2    -> refuses again                                  -> false
     *   Ctrl+Y x3    -> the stair finally comes back
     *
     * Three separate defects fell out of that one shape:
     *
     *   1. ONE GESTURE, THREE UNDO ENTRIES — the invariant C16 §8.6 / §L-874-ONE-UNDO
     *      states ("one gesture = one undo unit").
     *   2. INVERTED ORDER — the railings are pushed BEFORE the stair (they run
     *      inside its execute), so they sit UNDER it in `history` and OVER it in
     *      `redoStack`. Redo therefore replays a railing before the stair it hangs
     *      on, which cannot succeed.
     *   3. SILENTLY EATEN KEYPRESSES — `CommandManagerImpl.redo()` pops the entry
     *      BEFORE executing it and only pushes it back `if (result.success)`. A
     *      refused redo is therefore DESTROYED, not retried. And when the stair
     *      redo did finally run, the railings it re-created inside it hit the
     *      `redoStack = []` branch again and wiped whatever was left.
     *
     * Net user experience: draw a stair, Ctrl+Z (it vanishes — undo "works"),
     * Ctrl+Shift+Z … nothing … Ctrl+Shift+Z … nothing. Exactly the report.
     *
     * THE FIX: OWN THEM. `undo()` below has ALWAYS removed these railings itself
     * (`stairRailingStore.removeByStairId(this.createdStairId)`), i.e. the undo side
     * already treated them as this command's children while the create side
     * outsourced them to a fire-and-forget event. That asymmetry WAS the defect.
     * They are now created here, directly, against the same `ctx` — no bus hop, no
     * `commandManager` entry, no history entry of their own. One gesture, one entry,
     * one Ctrl+Z, one Ctrl+Shift+Z.
     *
     * ⛔ NOT `commandManager.execute(cmd, {source:'STRUCTURAL_CASCADE'})`, which is
     * the sibling pattern (`WallMoveReweldService.ts:538`). That composes correctly
     * on the FIRST execute, but `CommandManagerImpl.redo()` calls
     * `entry.command.execute(this.context)` DIRECTLY — no `_execFrames` frame is
     * open — so on redo the nested dispatch would find `enclosing === null`, fall
     * back to the `else` branch and clear the redo stack all over again. The
     * structural-children mechanism is only safe for a cascade that this command
     * does NOT itself re-fire on replay.
     *
     * CONSEQUENCE, STATED: `bim-stair-railing-proposal` now has no emitter, so
     * `initTools.ts:2476` is dead code and the `stair.createRailing` bus verb is no
     * longer on the AUTO path. The verb stays registered and dispatchable for an
     * explicit "add a railing to this stair" (user or RAC) — only the automatic
     * pair moved.
     *
     * Never throws: a project with no `stairRailingStore` gets a logged refusal
     * from the railing command and a stair with no railings, which is what it had.
     */
    private createRailings(ctx: CommandContext, stair: StairData): void {
        if (!this._railingCommands) {
            const common = {
                topRailHeight: stair.properties.handrailHeight,
                balusterSpacing: 0.15,
                balusterShape: 'rectangular' as const,
                balusterWidth: 0.04,
                postAtStart: true,
                postAtEnd: true,
                material: stair.properties.material ?? 'steel',
            };
            this._railingCommands = (['left', 'right'] as const).map(side =>
                new CreateStairRailingCommand({ stairId: stair.id, side, ...common } as any),
            );
        }
        for (const cmd of this._railingCommands) {
            try {
                const res = cmd.execute(ctx);
                if (!res.success) {
                    console.warn('[CreateStairCommand] auto-railing refused:', res.info?.[0]);
                }
            } catch (err) {
                console.warn('[CreateStairCommand] auto-railing failed (non-fatal):', err);
            }
        }
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
        if (this.createdOpeningCarves.length > 0) {
            const stores = ctx.stores as any;
            const openingStore = stores.openingStore;
            const slabStore = stores.slabStore;
            for (const carve of this.createdOpeningCarves) {
                try {
                    if (openingStore) openingStore.remove(carve.openingId);
                    try { ctx.bimManager.unregisterElement(carve.openingId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                    try { elementRegistry.unregister(carve.openingId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                } catch (err) {
                    console.warn('[CreateStairCommand.undo] Auto-opening cleanup failed (non-fatal):', err);
                }
            }
            // Rebuild each host slab ONCE, never once per void.
            for (const hostId of new Set(this.createdOpeningCarves.map(c => c.hostSlabId))) {
                try { if (slabStore) slabStore.triggerRebuild(hostId); } catch { /* §SWALLOW-SIDE-INDEX */ }
            }
            this.createdOpeningCarves = [];
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

        // §STAIR-REDO-ONE-UNIT (L-1530) — undo the auto-railings THIS command
        // created, through their own `undo()`, so their `createdRailingId`
        // bookkeeping and side-index unregisters stay symmetric with their
        // `execute()`. The `removeByStairId` sweep below then still catches
        // railings added to this stair by any OTHER route (an explicit
        // `stair.createRailing`), which is what it always did.
        for (const cmd of this._railingCommands ?? []) {
            try { cmd.undo(ctx); } catch (err) {
                console.warn('[CreateStairCommand.undo] auto-railing undo failed (non-fatal):', err);
            }
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
