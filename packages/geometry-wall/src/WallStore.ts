import { WallData, Opening, Level, ILevelProvider, WindowData, DoorData } from './WallTypes';
import { Point3D } from '@pryzm/core-app-model';
import { ProjectContext } from '@pryzm/core-app-model';
import { BimManager } from '@pryzm/core-app-model';
import { storeEventBus } from '@pryzm/core-app-model';
import { WallDataAddSchema, WallDataUpdateSchema, OpeningSchema, formatZodError } from './WallDataSchema';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();
import {
    LevelResolveError, OpeningInvariantError,
    WallSchemaError, BaselineReversalError,
} from './errors';

type WallEventType = 'add' | 'update' | 'remove';
// §STEP7: prevState carries the wall snapshot BEFORE the mutation.
// Supplied on 'remove' (the wall being deleted) and 'update' (the pre-update snapshot).
// Absent on 'add' — there is no prior state.  DependencyResolver uses prevState
// to find which adjacent walls need rebuilding after an undo without a full level re-scan.
type WallEventListener = (event: WallEventType, wall: WallData, prevState?: WallData) => void;

function cloneOpening(o: Opening): Opening {
    // Opening has no nested objects in current contract
    return { ...o };
}

function cloneWallData(wall: WallData): WallData {
    const cloned = {
        ...wall,
        // Phase B DTO migration: baseLine is [Point3D, Point3D] — plain spread
        // is sufficient; no THREE.Vector3 reconstruction needed.
        baseLine: [
            { x: wall.baseLine[0].x, y: wall.baseLine[0].y, z: wall.baseLine[0].z },
            { x: wall.baseLine[1].x, y: wall.baseLine[1].y, z: wall.baseLine[1].z },
        ] as [Point3D, Point3D],
        openings: Object.freeze(wall.openings?.map(cloneOpening) ?? []),
        childrenIds: Object.freeze(wall.childrenIds ? [...wall.childrenIds] : []),
        properties: wall.properties ? { ...wall.properties } : undefined,
        ifcData: wall.ifcData ? { ...wall.ifcData } : undefined,
        // Contract §03-1.1: clone metadata only when present; pre-existing walls may lack it
        metadata: wall.metadata ? {
            ...wall.metadata,
            tags: wall.metadata.tags ? [...wall.metadata.tags] : undefined
        } : undefined,
        // Contract §03-1.2: clone curve descriptor when present
        curve: wall.curve ? {
            control: { ...wall.curve.control },
            segments: wall.curve.segments
        } : undefined,
        // Contract §03-1.3: clone layer snapshot when present
        layers: wall.layers ? Object.freeze(wall.layers.map(l => Object.freeze({ ...l }))) as any : undefined,
        // §WALL-JOIN-SAVE-FIX: clone pre-join baseline when present
        _sourceBaseLine: wall._sourceBaseLine ? [
            { x: wall._sourceBaseLine[0].x, y: wall._sourceBaseLine[0].y, z: wall._sourceBaseLine[0].z },
            { x: wall._sourceBaseLine[1].x, y: wall._sourceBaseLine[1].y, z: wall._sourceBaseLine[1].z },
        ] as [Point3D, Point3D] : undefined
    };

    return Object.freeze(cloned) as WallData;
}

function cloneWindowData(w: WindowData): WindowData {
    const cloned: WindowData = {
        ...w,
        properties: { ...w.properties },
        anchor: w.anchor ? { ...w.anchor } : undefined
    };

    return Object.freeze(cloned) as WindowData;
}

function cloneDoorData(d: DoorData): DoorData {
    const cloned: DoorData = {
        ...d,
        properties: { ...d.properties },
        anchor: d.anchor ? { ...d.anchor } : undefined
    };

    return Object.freeze(cloned) as DoorData;
}

export class WallStore implements ILevelProvider {
    private walls: Map<string, WallData> = new Map();
    private projectContext: ProjectContext;
    private bimKernel: BimManager;
    private listeners: WallEventListener[] = [];

    private windows: Map<string, WindowData> = new Map();
    private doors: Map<string, DoorData> = new Map();

    /**
     * Gap 9 — O(1) secondary index: levelId → Set<wallId>.
     * Maintained in sync with `this.walls` on every add/remove/changeLevel/clear.
     * Reduces getByLevel() from O(n) linear scan to O(1) Set lookup.
     */
    private _levelIndex: Map<string, Set<string>> = new Map();

    /**
     * §WALL-DEEP-2026 O1 (RESOLVED 2026-04-24) — re-entrancy depth counter.
     *
     * Incremented on entry to every public mutator (add/update/remove + the
     * opening / window / door update helpers) and decremented in a finally
     * block. Read by SnapManager.gatherCandidates() so that snap queries
     * issued inside a mid-mutation cascade (e.g. a SlabWallConnectivityService
     * secondary update fired from inside a wall-store emit) return safely
     * instead of indexing a half-mutated wall.
     *
     * This is an interim measure pending the WallMutationBus phase model
     * (review §A1) which makes the read-vs-write contract explicit.
     */
    private _mutationDepth = 0;
    public getMutationDepth(): number { return this._mutationDepth; }

    constructor(projectContext: ProjectContext, bimKernel: BimManager) {
        this.projectContext = projectContext;
        this.bimKernel = bimKernel;
    }

    get activeLevelId(): string {
        return this.projectContext.activeLevelId;
    }

    set activeLevelId(id: string) {
        this.projectContext.activeLevelId = id;
    }

    getActiveLevel(): Level {
        const levels = this.getLevels();

        const active = levels.find(l => l.id === this.activeLevelId);
        if (active) return active;

        if (levels.length > 0) return levels[0];

        throw new Error("No levels available in BimKernel");
    }

    getLevelById(id: string): Level | undefined {
        const level = this.bimKernel.getLevelById(id);
        if (!level) return undefined;

        // ✅ FIX: Compute real inter-level height instead of hardcoding 3.0.
        // Find the next level above by elevation and use the difference.
        // Falls back to 3.0 only when this is the topmost level with no successor.
        const allLevels = this.bimKernel.getLevels();
        const sorted = [...allLevels].sort((a, b) => a.elevation - b.elevation);
        const idx = sorted.findIndex(l => l.id === id);
        const nextLevel = idx >= 0 && idx + 1 < sorted.length ? sorted[idx + 1] : null;
        const height = nextLevel ? nextLevel.elevation - level.elevation : 3.0;

        return {
            ...level,
            height,
            childrenIds: level.childrenIds || []
        };
    }

    getActiveLevelId(): string {
        return this.activeLevelId;
    }

    // §WALL-AUDIT-2026-M3: addLevel() removed. Levels are owned exclusively by
    // BimKernel; UI / AI flows must mutate level state through BimKernel commands.

    getLevels(): Level[] {
        const raw = this.bimKernel.getLevels();
        const sorted = [...raw].sort((a, b) => a.elevation - b.elevation);
        return sorted.map((l, idx) => {
            const next = idx + 1 < sorted.length ? sorted[idx + 1] : null;
            // ✅ FIX: Use real inter-level height instead of hardcoded 3.0.
            const height = next ? next.elevation - l.elevation : 3.0;
            return {
                id: l.id,
                name: l.name,
                elevation: l.elevation,
                height,
                childrenIds: l.childrenIds || []
            };
        });
    }

    add(rawWall: WallData): void {
        // Phase B DTO migration: baseLine is [Point3D, Point3D] — plain {x,y,z} objects.
        // No THREE.Vector3 reconstruction needed; Zod validates plain Point3D shape.
        const wall: WallData = rawWall;

        // §STEP5: Zod boundary validation — applied BEFORE all other checks.
        // Catches type and range errors from AI mutation paths at the store gate
        // so corrupt inputs never reach cloneWallData() or scene geometry.
        {
            const result = WallDataAddSchema.safeParse(wall);
            if (!result.success) {
                throw new Error(
                    `[WallStore.add] Schema validation failed: ${formatZodError(result.error)}`
                );
            }
        }

        // Legacy guard: redundant with Zod but retained for explicit error messages
        // that callers may depend on (backwards-compatible error text).
        if (
            !wall.baseLine ||
            wall.baseLine.length !== 2
        ) {
            throw new WallSchemaError("Invalid wall baseline: must contain two Point3D objects");
        }

        if (wall.height <= 0) {
            throw new WallSchemaError("Wall height must be positive");
        }

        if (wall.thickness <= 0) {
            throw new WallSchemaError("Wall thickness must be positive");
        }

        if (!wall.levelId) {
            throw new WallSchemaError("Wall must have a levelId");
        }

        if (!wall.id) {
            throw new WallSchemaError("Wall must have an id");
        }

        const levelId = wall.levelId;
        const activeLevel = this.getLevelById(levelId);
        if (!activeLevel) {
            throw new LevelResolveError(`Level ${levelId} not found`);
        }

        // Prepare wall data before freezing with safe baseline copy
        const now = Date.now();
        const preparedWall: WallData = {
            ...wall,
            // Phase B DTO migration: baseLine is [Point3D, Point3D] — plain spread.
            baseLine: [
                { x: wall.baseLine[0].x, y: wall.baseLine[0].y, z: wall.baseLine[0].z },
                { x: wall.baseLine[1].x, y: wall.baseLine[1].y, z: wall.baseLine[1].z },
            ] as [Point3D, Point3D],
            levelId: levelId,
            parentId: levelId,
            openings: wall.openings ?? [],
            childrenIds: wall.childrenIds ?? [],
            properties: {
                ...(wall.properties ?? {}),
                // Contract §03-1.7: mark MUST be provided by the Command layer.
                // This fallback (WA-XX-NNN format) is a last-resort guard for
                // legacy data, undo/redo paths, and AI-generated walls that bypass
                // CreateWallCommand. New walls created via CreateWallCommand always
                // arrive here with a pre-computed mark — this branch is never hit.
                mark: wall.properties?.mark ??
                    `WA-XX-${(this.walls.size + 1).toString().padStart(3, '0')}`
            },
            // §WALL-AUDIT-2026-M9: CreateWallCommand now stamps a stable
            // ifcData block (guid generated ONCE in the command constructor
            // and reused across redo). This `??` branch is therefore only a
            // safety net for legacy snapshots and AI-generated walls that
            // bypass CreateWallCommand. New walls created via the command
            // path always arrive here with `wall.ifcData` already populated,
            // so the fallback below is never taken in normal operation.
            ifcData: wall.ifcData ?? {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcWall'
            },
            // Contract §03-1.1: stamp metadata block on creation.
            // EXCEPTION — undo/restore path (DeleteElementCommand.undo): the snapshot
            // already carries the original metadata with its createdAt and version.
            // Overwriting it would corrupt the audit trail and reset version to 1 on
            // every undo/redo cycle (§2.3 Redo Symmetry Violation).
            // Rule: if the incoming wall already has a fully-stamped metadata block
            // (createdAt is present), PRESERVE it and only refresh modifiedAt.
            // New walls (no pre-existing metadata) continue to receive a fresh stamp.
            metadata: wall.metadata?.createdAt != null
                ? {
                    createdAt:   wall.metadata.createdAt,
                    createdBy:   wall.metadata.createdBy ?? 'system',
                    modifiedAt:  now,
                    version:     wall.metadata.version ?? 1,
                    tags:        wall.metadata.tags,
                    description: wall.metadata.description
                }
                : {
                    createdAt:  now,
                    modifiedAt: now,
                    createdBy:  'system',
                    version:    1,
                    tags:       wall.metadata?.tags,
                    description: wall.metadata?.description
                }
        };

        // Clone and freeze
        const newWall = cloneWallData(preparedWall);

        // Prevent ID collision
        if (this.walls.has(newWall.id)) {
            throw new Error(`Wall with id ${newWall.id} already exists`);
        }

        // §WALL-AUDIT-2026-M8 — Derived-index invariant.
        // wall.openings (semantic source) and wall.childrenIds (derived structural index)
        // must agree on the set of hosted opening element IDs. Any divergence indicates a
        // command-layer bug that wrote one without updating the other.
        this._assertOpeningsChildrenInvariant(newWall, 'add');

        this.walls.set(newWall.id, newWall);
        this._addToLevelIndex(newWall.levelId, newWall.id);

        // §2.3 / Restore-path fix: When a wall is restored via DeleteElementCommand.undo(),
        // it may already carry openings with elementIds (windows/doors) in its data.
        // WallStore.add() stores the openings array correctly, but the sub-maps (this.windows,
        // this.doors) are NOT populated by the normal add path — they are only populated when
        // addOpening() is called at creation time.
        //
        // Without this repopulation, after an undo of wall deletion:
        //   - wallStore.getWindow(id) → undefined   (sub-map empty)
        //   - WallFragmentBuilder renderMap has no frame data → window/door frames vanish
        //
        // Rule: repopulate ONLY for openings whose elementId is not already tracked
        // (guards against duplicate entries on redo paths).
        this._repopulateHostedElementsFromOpenings(newWall);

        // §3.5: elementRegistry.registerSemantic removed — Store must not register
        // spatial elements. Registration is the responsibility of the calling Command.
        this.emit('add', newWall);
    }

    /**
     * §2.3 Restore-path helper: Reconstructs the windows/doors sub-maps from a
     * wall's openings array. Called exclusively from add() to handle the
     * DeleteElementCommand.undo() restore path.
     *
     * This is a pure internal bookkeeping operation — it does NOT emit store events
     * (the outer add() emits 'add' once after this returns), does NOT register
     * spatially (the calling Command handles elementRegistry), and does NOT mutate
     * the wall's frozen openings array.
     */
    private _repopulateHostedElementsFromOpenings(wall: WallData): void {
        const openings = wall.openings ?? [];
        if (openings.length === 0) return;

        for (const opening of openings) {
            if (!opening.elementId) continue;

            const commonData = {
                id: opening.elementId,
                wallId: wall.id,
                openingId: opening.id,
                width: opening.width,
                height: opening.height,
                sillHeight: opening.sillHeight,
                offset: opening.offset,
                frameThickness: 0.15,
                frameWidth: 0.05,
                levelId: wall.levelId,
                parentId: wall.id,
                properties: {
                    mark: (opening as any).properties?.mark ??
                        (opening.type === 'window'
                            ? `WN${(this.windows.size + 1).toString().padStart(3, '0')}`
                            : `DO${(this.doors.size + 1).toString().padStart(3, '0')}`)
                }
            };

            if (opening.type === 'window' && !this.windows.has(opening.elementId)) {
                this.windows.set(opening.elementId, cloneWindowData({
                    ...commonData,
                    type: 'window',
                    windowType: opening.windowType
                }));
            } else if (opening.type === 'door' && !this.doors.has(opening.elementId)) {
                this.doors.set(opening.elementId, cloneDoorData({
                    ...commonData,
                    type: 'door',
                    doorType: opening.doorType
                }));
            }
        }
    }

    /**
     * §WALL-AUDIT-2026 (RESOLVED 2026-04-24) — canonical wall mutation API.
     *
     * `update(wallId, updates, preserveMetadata?)` is the **single source of truth**
     * for all wall mutations. It accepts a partial patch (`Partial<WallData>`) so
     * that:
     *  - drag handlers can patch only `baseLine` without restating the full wall;
     *  - cascade services (SlabWallConnectivity, JoinResolver) can patch geometry
     *    fields without touching layers / properties / openings;
     *  - inspector edits can change a single field at a time.
     *
     * `updateWall(wall: WallData)` (defined below) is a **thin wrapper** that
     * accepts a full WallData snapshot, projects it onto the editable-fields
     * subset, and forwards the result to this method. It is provided as a
     * convenience for snapshot-restore commands and full-wall replacement
     * paths — it is NOT a parallel mutation pathway. All event emission,
     * Zod validation, metadata stamping, _renderVersion bumping, and frozen
     * cloning happen here.
     *
     * Both APIs converge on the same `this.walls.set()` + `this.emit()` call,
     * so subscribers see exactly one canonical mutation event regardless of
     * which entry point the caller used.
     */
    update(wallId: string, updates: Partial<WallData>, preserveMetadata = false): WallData | undefined {
        const wall = this.walls.get(wallId);
        if (!wall) return undefined;

        // §WALL-DEEP-2026 O1 — re-entrancy depth tracking. Incremented for the
        // entire body of update() (including the listener fan-out inside emit())
        // so SnapManager / future bus consumers can detect mid-cascade reads.
        this._mutationDepth++;
        try {
        return this._updateImpl(wallId, wall, updates, preserveMetadata);
        } finally {
            this._mutationDepth--;
        }
    }

    private _updateImpl(wallId: string, wall: WallData, updates: Partial<WallData>, preserveMetadata: boolean): WallData | undefined {
        // Create a safe copy of updates - NEVER mutate arguments
        const safeUpdates = { ...updates } as Partial<WallData> & { _allowBaseLineReversal?: boolean };

        // Phase B DTO migration: baseLine is [Point3D, Point3D] — plain {x,y,z} objects.
        // Guard: reject structurally invalid baseLine (must have two elements).
        if (safeUpdates.baseLine) {
            if (!safeUpdates.baseLine[0] || !safeUpdates.baseLine[1]) {
                throw new WallSchemaError("Invalid baseline update: must contain two Point3D objects");
            }
        }

        // §WALL-DEEP-2026 B2 (RESOLVED 2026-04-24) — baseline-reversal guard.
        //
        //   Opening.offset is documented as "absolute distance from baseLine[0]
        //   to opening center". If a future command reverses baseLine (swaps
        //   [0] and [1]) on a wall that hosts openings, every offset is now
        //   measured from the wrong endpoint and the openings drift silently.
        //
        //   Reject the update unless the caller explicitly opts in via
        //   `_allowBaseLineReversal: true` (which signals they have ALSO
        //   migrated each opening offset to (wallLength - offset)).
        //
        //   Reversal is detected via planar (XZ) direction dot product:
        //   a sign flip => the direction has rotated >90°, which is the
        //   regime in which opening offsets become semantically wrong.
        if (safeUpdates.baseLine && (wall.openings?.length ?? 0) > 0
            && !safeUpdates._allowBaseLineReversal) {
            const oldDx = wall.baseLine[1].x - wall.baseLine[0].x;
            const oldDz = wall.baseLine[1].z - wall.baseLine[0].z;
            const newDx = safeUpdates.baseLine[1].x - safeUpdates.baseLine[0].x;
            const newDz = safeUpdates.baseLine[1].z - safeUpdates.baseLine[0].z;
            const dot = oldDx * newDx + oldDz * newDz;
            if (dot < 0) {
                throw new BaselineReversalError(
                    `[WallStore.update] §WALL-DEEP-2026 B2 — refusing to reverse baseLine ` +
                    `direction on wall ${wallId} which hosts ${wall.openings!.length} ` +
                    `opening(s). The caller must either (a) migrate each opening's offset ` +
                    `to (wallLength - offset) and pass _allowBaseLineReversal:true, or ` +
                    `(b) keep the baseLine direction stable and emit endpoint-only changes.`
                );
            }
        }
        // The opt-in flag is consumed here; do not persist it onto the wall.
        if ('_allowBaseLineReversal' in safeUpdates) {
            delete (safeUpdates as any)._allowBaseLineReversal;
        }

        // §WALL-JOIN-SAVE-FIX: When a caller explicitly sets baseLine without also
        // supplying _sourceBaseLine (i.e. any non-resolver update such as a drag or
        // CreateWallCommand), clear the pre-join baseline so the next flush can
        // stamp a fresh _sourceBaseLine from the new user-intended position.
        // The join resolver always includes _sourceBaseLine in its store.update()
        // call, so it is never affected by this branch.
        if ('baseLine' in safeUpdates && !('_sourceBaseLine' in safeUpdates)) {
            (safeUpdates as any)._sourceBaseLine = undefined;
        }

        // §STEP5: Zod partial-update validation — applied before mutation.
        // Only fields present in safeUpdates are validated (schema is fully partial via .optional()).
        {
            const result = WallDataUpdateSchema.safeParse(safeUpdates);
            if (!result.success) {
                throw new WallSchemaError(
                    `[WallStore.update] Schema validation failed for wall ${wallId}: ` +
                    formatZodError(result.error),
                    result.error,
                );
            }
        }

        // Guard against levelId mutation - spatial anchor cannot change
        if (safeUpdates.levelId && safeUpdates.levelId !== wall.levelId) {
            throw new Error("Wall levelId cannot be modified after creation");
        }

        // Guard against direct opening manipulation - must use opening API
        if (safeUpdates.openings !== undefined) {
            console.warn("Direct opening update detected. Use addOpening/updateOpening/removeOpening instead.");
            delete safeUpdates.openings;
        }

        // Create merged state (not frozen yet)
        // Contract §03-1.1: always increment version and stamp modifiedAt on every semantic update.
        // For legacy walls that pre-date this contract, backfill createdAt/createdBy on first update.
        // ✅ FIX: When preserveMetadata=true (undo restore path), the original snapshot's metadata
        // is preserved as-is to avoid corrupting the audit trail with a new modifiedAt and version.
        const now = Date.now();
        const nextState = {
            ...wall,
            ...safeUpdates,
            metadata: preserveMetadata && safeUpdates.metadata
                ? {
                    // Restore original audit metadata without advancing modifiedAt / version.
                    createdAt:   safeUpdates.metadata.createdAt  ?? wall.metadata?.createdAt  ?? now,
                    createdBy:   safeUpdates.metadata.createdBy  ?? wall.metadata?.createdBy  ?? 'system',
                    modifiedAt:  safeUpdates.metadata.modifiedAt ?? wall.metadata?.modifiedAt ?? now,
                    version:     safeUpdates.metadata.version    ?? wall.metadata?.version    ?? 0,
                    tags:        safeUpdates.metadata.tags        ?? wall.metadata?.tags,
                    description: safeUpdates.metadata.description ?? wall.metadata?.description
                }
                : {
                    createdAt:   wall.metadata?.createdAt  ?? now,
                    createdBy:   wall.metadata?.createdBy  ?? 'system',
                    modifiedAt:  now,
                    version:    (wall.metadata?.version    ?? 0) + 1,
                    tags:        safeUpdates.metadata?.tags        ?? wall.metadata?.tags,
                    description: safeUpdates.metadata?.description ?? wall.metadata?.description
                }
        };

        // Clean up child elements that are being removed
        if (safeUpdates.childrenIds !== undefined) {
            const nextChildrenIds = safeUpdates.childrenIds;
            (wall.childrenIds ?? []).forEach(childId => {
                if (!nextChildrenIds.includes(childId)) {
                    this.windows.delete(childId);
                    this.doors.delete(childId);
                    // §3.5: elementRegistry.unregister removed — Store must not manage
                    // spatial registration. The calling Command is responsible for
                    // unregistering removed children from elementRegistry before calling
                    // wallStore.updateWall() with a smaller childrenIds set.
                }
            });
        }

        // Clone and freeze
        const frozenNextState = cloneWallData(nextState);

        // §WALL-AUDIT-2026-M8 — Derived-index invariant on every update path.
        this._assertOpeningsChildrenInvariant(frozenNextState, 'update');

        this.walls.set(wallId, frozenNextState);
        // §STEP7: pass the PRE-update snapshot as prevState so the DependencyResolver
        // can diff old baseline against new baseline and queue only affected adjacents.
        this.emit('update', frozenNextState, wall);

        return frozenNextState;
    }

    /**
     * §WALL-AUDIT-2026-M8 — Runtime invariant: childrenIds is the derived index of
     * openings[*].elementId (only those with a hosted element). The two collections
     * must always agree as sets — this guards against a command-layer bug that
     * mutates one without the other and silently desynchronises the model.
     *
     * Throws on mismatch; the calling Command surfaces the failure to the user
     * rather than persisting a corrupt wall state.
     */
    private _assertOpeningsChildrenInvariant(
        wall: WallData,
        callsite: 'add' | 'update'
    ): void {
        const openings = wall.openings ?? [];
        const expected = openings
            .map(o => o.elementId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .slice()
            .sort();
        const actual = (wall.childrenIds ?? []).slice().sort();
        if (expected.length !== actual.length ||
            expected.some((id, i) => id !== actual[i])) {
            throw new Error(
                `[WallStore.${callsite}] §WALL-AUDIT-2026-M8 invariant violated for wall ` +
                `${wall.id}: childrenIds=${JSON.stringify(actual)} does not match ` +
                `openings[*].elementId=${JSON.stringify(expected)}.`
            );
        }
    }

    /**
     * §WALL-AUDIT-2026 (RESOLVED 2026-04-24) — convenience wrapper around `update()`.
     *
     * Accepts a full `WallData` snapshot, projects it onto the editable-fields
     * subset (system / spatial-anchor fields like `id`, `levelId`, `parentId`,
     * `openings`, `childrenIds` are deliberately omitted because they have
     * dedicated mutation APIs), and forwards to `update(wall.id, updates)`.
     *
     * This method is NOT a parallel mutation pathway — it always converges on
     * `update()` so all event emission, Zod validation, metadata stamping,
     * `_renderVersion` bumping, and frozen cloning happen exactly once per
     * mutation, regardless of which entry point was used. Use this method when
     * the caller already holds a full snapshot (snapshot-restore commands,
     * full-wall replacement paths) and prefers not to derive a partial patch.
     */
    updateWall(wall: WallData): void {
        const existing = this.walls.get(wall.id);
        if (!existing) {
            throw new Error(`Wall ${wall.id} not found`);
        }

        // Only allow updating editable fields - protect system fields
        // Contract §03-1.2: include curve descriptor if present (curved walls)
        // Contract §03-1.3: include layers/systemTypeId so undo of layered-wall commands
        // correctly restores the full layer snapshot (previously these were silently dropped,
        // meaning the CURRENT store state's layers were kept rather than the snapshot's).
        const updates: Partial<WallData> = {
            baseLine: wall.baseLine,
            height: wall.height,
            thickness: wall.thickness,
            baseOffset: wall.baseOffset,
            materialId: wall.materialId,
            materialColor: wall.materialColor,
            properties: wall.properties,
            curve: wall.curve,
            layers: wall.layers,
            systemTypeId: wall.systemTypeId,
            // §VIEW-DIRTY-CHECK §2.2: auto-stamp the next render version so that
            // WallFragmentBuilder can skip redundant view-switch-triggered rebuilds.
            // Reads the current in-store version (not the caller's snapshot) to
            // guarantee a monotonically increasing sequence even across undo/redo.
            _renderVersion: (existing._renderVersion ?? 0) + 1,
        };

        this.update(wall.id, updates);
    }

    /**
     * ✅ FIX §03-1.1: Undo-safe snapshot restore.
     * Restores a wall to a previously captured snapshot (e.g. in undo()) WITHOUT
     * advancing modifiedAt or incrementing version. Regular updateWall() always
     * stamps a new modifiedAt and bumps version, corrupting the audit trail when
     * called from undo paths.
     *
     * Use this method in command.undo() whenever restoring a full pre-mutation
     * snapshot. Use updateWall() for genuine forward semantic mutations.
     */
    restoreSnapshot(snapshot: WallData): void {
        const existing = this.walls.get(snapshot.id);
        if (!existing) {
            throw new Error(`Wall ${snapshot.id} not found`);
        }

        const updates: Partial<WallData> = {
            baseLine:     snapshot.baseLine,
            height:       snapshot.height,
            thickness:    snapshot.thickness,
            baseOffset:   snapshot.baseOffset,
            materialId:   snapshot.materialId,
            materialColor: snapshot.materialColor,
            properties:   snapshot.properties,
            curve:        snapshot.curve,
            layers:       snapshot.layers,
            systemTypeId: snapshot.systemTypeId,
            metadata:     snapshot.metadata,
            // §VIEW-DIRTY-CHECK: restore the snapshot's _renderVersion so that
            // the builder sees a version mismatch vs. _lastBuiltVersion and correctly
            // rebuilds after undo.  The snapshot may not carry this field (walls
            // created before this contract) — undefined is the safe fallback.
            _renderVersion: (snapshot as any)._renderVersion,
            // §SNAPSHOT-COMPLETENESS §WALL-AUDIT-2026: restore _sourceBaseLine so
            // undo preserves the wall's join provenance (the user-drawn pre-trim
            // baseline). Without this, the update() hook below silently clears
            // _sourceBaseLine to undefined whenever baseLine is restored — causing
            // the next JoinResolver pass to re-seed from the post-trim baseline,
            // which can be a few cm short of any neighbour's endpoint and makes
            // the resolver fail to re-detect previously-mitered corners. Always
            // include the field so the hook's `'_sourceBaseLine' in safeUpdates`
            // check sees it (even when the value is undefined for legacy snapshots).
            _sourceBaseLine: (snapshot as any)._sourceBaseLine,
        } as any;

        // Pass preserveMetadata=true so update() retains the original audit fields.
        this.update(snapshot.id, updates, true);
    }

    /**
     * Moves a wall to a different level. Bypasses the levelId-immutability guard
     * in update() by emitting 'remove' (to clean up old-level joins) followed
     * by 'add' (to trigger rebuild and join resolution on the new level).
     *
     * Contract: the wall ID and all other semantic properties are preserved.
     * The spatial-authority registration is NOT updated here — callers that care
     * must reconcile via the normal SpatialAuthority callback.
     */
    changeLevel(wallId: string, newLevelId: string): WallData | undefined {
        const wall = this.walls.get(wallId);
        if (!wall) return undefined;
        if (wall.levelId === newLevelId) return cloneWallData(wall);

        // Notify listeners that this wall is leaving its current level
        this.emit('remove', wall);
        this._removeFromLevelIndex(wall.levelId, wallId);

        const now = Date.now();
        const nextState: WallData = {
            ...(wall as any),
            levelId: newLevelId,
            // §VIEW-DIRTY-CHECK §2.2: bump the render version so the builder
            // sees a mismatch vs. _lastBuiltVersion and rebuilds on the new level.
            _renderVersion: (wall._renderVersion ?? 0) + 1,
            metadata: {
                createdAt:   wall.metadata?.createdAt  ?? now,
                createdBy:   wall.metadata?.createdBy  ?? 'system',
                modifiedAt:  now,
                version:    (wall.metadata?.version    ?? 0) + 1,
                tags:        wall.metadata?.tags,
                description: wall.metadata?.description,
            },
        };

        const frozenNextState = cloneWallData(nextState);
        this.walls.set(wallId, frozenNextState);
        this._addToLevelIndex(newLevelId, wallId);

        // Notify listeners that this wall is now part of the new level
        this.emit('add', frozenNextState);

        return frozenNextState;
    }

    remove(wallId: string): WallData | undefined {
        const wall = this.walls.get(wallId);
        if (wall) {
            wall.childrenIds?.forEach(childId => {
                if (this.windows.has(childId)) {
                    this.removeWindow(childId);
                } else if (this.doors.has(childId)) {
                    this.removeDoor(childId);
                }
            });
            this.walls.delete(wallId);
            this._removeFromLevelIndex(wall.levelId, wallId);
            // §3.5: elementRegistry.unregister removed — Store must not manage
            // spatial registration. The calling Command is responsible for
            // calling elementRegistry.unregister(wallId) after wallStore.remove().
            // §STEP7: pass `wall` as both the current state AND prevState — the
            // DependencyResolver needs the deleted wall's baseLine to find which
            // neighbouring walls were adjacent and should be re-joined/rebuilt.
            this.emit('remove', wall, wall);
        }
        return wall;
    }

    getById(wallId: string): WallData | undefined {
        const wall = this.walls.get(wallId);
        return wall ? cloneWallData(wall) : undefined;
    }

    getAll(): WallData[] {
        return Array.from(this.walls.values()).map(cloneWallData);
    }

    /**
     * Gap 9 — O(1) level lookup via secondary index.
     * Previously O(n) linear scan; now O(k) where k = walls on that level.
     */
    getByLevel(levelId: string): WallData[] {
        const ids = this._levelIndex.get(levelId);
        if (!ids || ids.size === 0) return [];
        const result: WallData[] = [];
        for (const id of ids) {
            const wall = this.walls.get(id);
            if (wall) result.push(cloneWallData(wall));
        }
        return result;
    }

    // Opening management
    addOpening(wallId: string, opening: Opening): WallData | undefined {
        // A2: Zod runtime guard — rejects NaN/negative/missing values before
        // they can reach WallFragmentBuilder or be persisted to the project file.
        const parseResult = OpeningSchema.safeParse(opening);
        if (!parseResult.success) {
            throw new Error(
                `[WallStore.addOpening] Invalid opening data: ${formatZodError(parseResult.error)}`
            );
        }

        const wall = this.walls.get(wallId);
        if (!wall) return undefined;

        const openings = [...(wall.openings ?? [])];
        const childrenIds = [...(wall.childrenIds ?? [])];

        const openingClone = cloneOpening(opening);
        openings.push(openingClone);

        if (openingClone.elementId) {
            const commonData = {
                id: openingClone.elementId,
                wallId: wallId,
                openingId: openingClone.id,
                width: openingClone.width,
                height: openingClone.height,
                sillHeight: openingClone.sillHeight,
                offset: openingClone.offset,
                frameThickness: 0.15,
                frameWidth: 0.05,
                levelId: wall.levelId,
                properties: {
                    mark: (openingClone as any).properties?.mark ??
                        (openingClone.type === 'window'
                            ? `WN${(this.windows.size + 1).toString().padStart(3, '0')}`
                            : `DO${(this.doors.size + 1).toString().padStart(3, '0')}`)
                },
                parentId: wallId
            };

            if (openingClone.type === 'window') {
                const windowData: WindowData = {
                    ...commonData,
                    type: 'window',
                    windowType: openingClone.windowType
                };
                this.windows.set(windowData.id, cloneWindowData(windowData));
                // §3.5: elementRegistry.registerSemantic removed — the calling Command
                // (CreateWallOpeningCommand) is responsible for registering in elementRegistry.
            } else if (openingClone.type === 'door') {
                const doorData: DoorData = {
                    ...commonData,
                    type: 'door',
                    doorType: openingClone.doorType
                };
                this.doors.set(doorData.id, cloneDoorData(doorData));
                // §3.5: elementRegistry.registerSemantic removed — the calling Command
                // (CreateWallOpeningCommand) is responsible for registering in elementRegistry.
            }

            if (!childrenIds.includes(commonData.id)) {
                childrenIds.push(commonData.id);
            }
        }

        const updatedWall = cloneWallData({
            ...wall,
            openings,
            childrenIds,
            // §VIEW-DIRTY-CHECK §2.2: bump the render version so the builder sees
            // a mismatch vs. _lastBuiltVersion and rebuilds with the new opening.
            _renderVersion: (wall._renderVersion ?? 0) + 1,
        });

        this.walls.set(wallId, updatedWall);
        this.emit('update', updatedWall);

        return updatedWall;
    }

    updateOpening(wallId: string, opening: Opening): WallData | undefined {
        const wall = this.walls.get(wallId);
        if (!wall) return undefined;

        const openings = (wall.openings ?? []).map(o => 
            o.id === opening.id ? cloneOpening(opening) : cloneOpening(o)
        );

        const updatedWall = cloneWallData({
            ...wall,
            openings
        });

        this.walls.set(wallId, updatedWall);

        if (opening.elementId) {
            // Performance: updateWindow/updateDoor each emit their own 'update' event,
            // so we skip the early emit here to avoid a redundant double rebuild.
            if (opening.type === 'window') {
                this.updateWindow(opening.elementId, {
                    width: opening.width,
                    height: opening.height,
                    sillHeight: opening.sillHeight,
                    offset: opening.offset
                });
            } else if (opening.type === 'door') {
                this.updateDoor(opening.elementId, {
                    width: opening.width,
                    height: opening.height,
                    sillHeight: opening.sillHeight,
                    offset: opening.offset
                });
            }
        } else {
            // No hosted element — emit once directly.
            this.emit('update', updatedWall);
        }

        return updatedWall;
    }

    removeOpening(wallId: string, openingId: string): WallData | undefined {
        const wall = this.walls.get(wallId);
        if (!wall) return undefined;

        const opening = (wall.openings ?? []).find(o => o.id === openingId);

        const openings = (wall.openings ?? []).filter(o => o.id !== openingId);
        const childrenIds = (wall.childrenIds ?? []).filter(id => id !== opening?.elementId);

        if (opening?.elementId) {
            if (opening.type === 'window') {
                this.windows.delete(opening.elementId);
            } else if (opening.type === 'door') {
                this.doors.delete(opening.elementId);
            }
            // §3.5: elementRegistry.unregister removed — the calling Command is responsible
            // for calling elementRegistry.unregister(opening.elementId) when removing openings.
        }

        const updatedWall = cloneWallData({
            ...wall,
            openings,
            childrenIds
        });

        this.walls.set(wallId, updatedWall);
        this.emit('update', updatedWall);

        return updatedWall;
    }

    restoreOpening(wallId: string, opening: Opening): void {
        const wall = this.walls.get(wallId);
        if (!wall) {
            throw new OpeningInvariantError(`Wall ${wallId} not found when restoring opening`);
        }

        if ((wall.openings ?? []).some(o => o.id === opening.id)) {
            return;
        }

        const openings = [...(wall.openings ?? []), cloneOpening(opening)];
        const childrenIds = [...(wall.childrenIds ?? [])];

        if (opening.elementId && !childrenIds.includes(opening.elementId)) {
            childrenIds.push(opening.elementId);
        }

        const updatedWall = cloneWallData({
            ...wall,
            openings,
            childrenIds
        });

        this.walls.set(wallId, updatedWall);
        this.emit('update', updatedWall);

        if (opening.elementId) {
            const commonData = {
                id: opening.elementId,
                wallId,
                openingId: opening.id,
                width: opening.width,
                height: opening.height,
                sillHeight: opening.sillHeight,
                offset: opening.offset,
                levelId: wall.levelId,
                parentId: wallId,
                frameThickness: 0.15,
                frameWidth: 0.05,
                properties: {
                    mark: (opening as any).properties?.mark ??
                        (opening.type === 'window'
                            ? `WN${(this.windows.size + 1).toString().padStart(3, '0')}`
                            : `DO${(this.doors.size + 1).toString().padStart(3, '0')}`)
                }
            };

            if (opening.type === 'window') {
                this.windows.set(opening.elementId, cloneWindowData({
                    ...commonData,
                    type: 'window',
                    windowType: opening.windowType
                }));
                // §3.5: elementRegistry.registerSemantic removed — the calling Command
                // (DeleteElementCommand.undo) is responsible for registering in elementRegistry.
            }

            if (opening.type === 'door') {
                this.doors.set(opening.elementId, cloneDoorData({
                    ...commonData,
                    type: 'door',
                    doorType: opening.doorType
                }));
                // §3.5: elementRegistry.registerSemantic removed — the calling Command
                // (DeleteElementCommand.undo) is responsible for registering in elementRegistry.
            }
        }
    }

    // Window management
    getWindow(windowId: string): WindowData | undefined {
        const w = this.windows.get(windowId);
        return w ? cloneWindowData(w) : undefined;
    }

    getAllWindows(): WindowData[] {
        return Array.from(this.windows.values()).map(cloneWindowData);
    }

    updateWindow(windowId: string, updates: Partial<WindowData>): void {
        const existingWin = this.windows.get(windowId);
        if (!existingWin) return;

        const updated = cloneWindowData({ ...existingWin, ...updates });
        this.windows.set(windowId, updated);

        const wallId = updated.wallId || existingWin.wallId;
        const wall = this.walls.get(wallId);
        if (wall) {
            const openings = (wall.openings ?? []).map(o => {
                if (o.elementId === windowId || o.id === updated.openingId) {
                    return {
                        ...o,
                        width: updates.width ?? o.width,
                        height: updates.height ?? o.height,
                        sillHeight: updates.sillHeight ?? o.sillHeight,
                        offset: updates.offset ?? o.offset
                    };
                }
                return cloneOpening(o);
            });

            const frozen = cloneWallData({
                ...wall,
                openings,
                // §VIEW-DIRTY-CHECK §2.2: bump the render version so WallFragmentBuilder's
                // composite cache key changes and buildWall() actually re-runs. buildWall()
                // rebuilds the SEGMENTED wall (the immediate render + permanent fallback)
                // with the opening at its new offset. Without this bump _buildWallInternal()
                // short-circuits on the version guard, buildWall() never runs, and the
                // ORIGINAL opening hole persists at the old location on a move/resize.
                // NOTE: this does NOT enable the CSG single-volume upgrade — that path
                // self-fails (wasm) and keeps the freshly-rebuilt segments.
                _renderVersion: (wall._renderVersion ?? 0) + 1,
            });

            this.walls.set(wallId, frozen);
            this.emit('update', frozen);
        }
    }

    removeWindow(windowId: string): void {
        const existingWin = this.windows.get(windowId);
        if (!existingWin) return;
        this.removeOpening(existingWin.wallId, existingWin.openingId);
    }

    addWindow(window: WindowData): void {
        this.windows.set(window.id, cloneWindowData(window));
        // §3.5: elementRegistry.registerSemantic removed — the calling Command
        // (DeleteElementCommand.undo) is responsible for registering in elementRegistry.
    }

    // Door management
    getDoor(doorId: string): DoorData | undefined {
        const d = this.doors.get(doorId);
        return d ? cloneDoorData(d) : undefined;
    }

    getAllDoors(): DoorData[] {
        return Array.from(this.doors.values()).map(cloneDoorData);
    }

    updateDoor(doorId: string, updates: Partial<DoorData>): void {
        const door = this.doors.get(doorId);
        if (!door) return;

        const updated = cloneDoorData({ ...door, ...updates });
        this.doors.set(doorId, updated);

        const wallId = updated.wallId || door.wallId;
        const wall = this.walls.get(wallId);
        if (wall) {
            const openings = (wall.openings ?? []).map(o => {
                if (o.elementId === doorId || o.id === updated.openingId) {
                    return {
                        ...o,
                        width: updates.width ?? o.width,
                        height: updates.height ?? o.height,
                        sillHeight: updates.sillHeight ?? o.sillHeight,
                        offset: updates.offset ?? o.offset
                    };
                }
                return cloneOpening(o);
            });

            const frozen = cloneWallData({
                ...wall,
                openings,
                // §VIEW-DIRTY-CHECK §2.2: bump the render version so WallFragmentBuilder's
                // composite cache key changes and buildWall() actually re-runs. buildWall()
                // rebuilds the SEGMENTED wall (the immediate render + permanent fallback)
                // with the opening at its new offset. Without this bump _buildWallInternal()
                // short-circuits on the version guard, buildWall() never runs, and the
                // ORIGINAL opening hole persists at the old location on a move/resize.
                // NOTE: this does NOT enable the CSG single-volume upgrade — that path
                // self-fails (wasm) and keeps the freshly-rebuilt segments.
                _renderVersion: (wall._renderVersion ?? 0) + 1,
            });

            this.walls.set(wallId, frozen);
            this.emit('update', frozen);
        }
    }

    removeDoor(doorId: string): void {
        const door = this.doors.get(doorId);
        if (!door) return;
        this.removeOpening(door.wallId, door.openingId);
    }

    addDoor(door: DoorData): void {
        this.doors.set(door.id, cloneDoorData(door));
        // §3.5: elementRegistry.registerSemantic removed — the calling Command
        // (DeleteElementCommand.undo) is responsible for registering in elementRegistry.
    }

    // Level management
    removeLevel(levelId: string): void {
        const wallsToRemove = this.getByLevel(levelId);
        wallsToRemove.forEach(wall => {
            this.remove(wall.id);
        });
    }

    // Event subscription
    subscribe(listener: WallEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * §WALL-AUDIT-2026-M4 — Dual event channel rationale.
     *
     * Wall mutations fan out across THREE coordinated subscriber surfaces, in a
     * documented and intentional order:
     *
     *   1. `this.listeners` (in-process EventEmitter)
     *      The primary channel. EngineBootstrap subscribes here to schedule the
     *      rAF wall-rebuild flush. MUST fire FIRST so geometry is queued before
     *      any DOM-coupled consumer reads the scene.
     *
     *   2. `storeEventBus` (centralised cross-store bus)
     *      Carries (elementId, elementType, operation, timestamp) tuples to the
     *      DependencyResolver, Topology layer, and World Model — none of which
     *      need the full WallData payload.
     *
     *   3. `window.dispatchEvent('bim-wall-{added,updated,removed}')`
     *      The legacy DOM bridge. SelectionManager._selectableCache is invalidated
     *      from this channel only. Fires LAST so by the time the cache rebuilds on
     *      the user's next click event, the listeners (1) have already mutated the
     *      scene.
     *
     * Drift surface: a future consumer that subscribes only to (3) and not (1)
     * would react one frame late. The expected migration target is to fold (3)
     * into a SelectionManager subscription on (1) and delete the DOM channel.
     */
    private emit(event: WallEventType, wall: WallData, prevState?: WallData): void {
        // Wall is already frozen from store - no need to clone again
        // Listeners fire first so EngineBootstrap builds geometry before DOM event fires.
        // §STEP7: prevState forwarded to subscribers for diff-based dirty marking.
        //
        // §WALL-DEEP-2026 R3 (RESOLVED 2026-04-24) — safe-emit wrapper.
        //   Wrap each listener invocation in its own try/catch so a single
        //   throwing subscriber cannot break the chain. Without this, a bug in
        //   (e.g.) WindowSnapProvider's wall-update handler would prevent the
        //   main WallFragmentBuilder pipe from running and leave the scene
        //   un-rebuilt. The error is logged and re-broadcast as a DOM event
        //   so a future SceneErrorReporter can surface it to the user.
        for (const l of this.listeners) {
            try {
                l(event, wall, prevState);
            } catch (err) {
                console.error(`[WallStore] subscriber threw on '${event}' for wall ${wall.id}:`, err);
                try {
                    _bus.emit('bim-subscriber-error', { message: String(err), source: 'WallStore', event, wallId: wall.id, error: String(err) }); // F.events.18
                } catch { /* dispatchEvent must never throw past safe-emit */ }
            }
        }

        // §3.8: Also publish to centralized StoreEventBus (DependencyResolver, Topology, World Model).
        storeEventBus.emit({
            elementId: wall.id,
            elementType: 'wall',
            operation: event === 'add' ? 'create' : event === 'remove' ? 'delete' : 'update',
            timestamp: Date.now()
        });

        // §3.9 DOM Bridge: dispatch DOM events so SelectionManager._selectableCache is
        // invalidated after every wall mutation. Mirrors the pattern in SlabStore.
        // The SelectionManager listens for 'bim-wall-added' / 'bim-wall-updated' /
        // 'bim-wall-removed' on window and sets _selectableCache = null, ensuring the
        // cache is rebuilt on the next click to include newly created/removed walls.
        // Dispatched AFTER listeners so geometry is already in the scene when the cache
        // is rebuilt on the user's next click event.
        // F.events.18 — typed bus replaces variable CustomEvent
        if (event === 'add') _bus.emit('bim-wall-added', { id: wall.id });
        else if (event === 'remove') _bus.emit('bim-wall-removed', { id: wall.id });
        else _bus.emit('bim-wall-updated', { id: wall.id });
    }

    clear(): void {
        // §3.5: elementRegistry.unregister calls removed — Store must not manage
        // spatial registration. The caller (CommandManager.resetState) is responsible
        // for clearing elementRegistry entries before or after calling this method.
        // In practice, UUID-based IDs make post-clear collisions negligible.
        this.walls.clear();
        this.windows.clear();
        this.doors.clear();
        this._levelIndex.clear();
    }

    // ── Level Index Helpers (Gap 9) ───────────────────────────────────────────

    private _addToLevelIndex(levelId: string, wallId: string): void {
        let set = this._levelIndex.get(levelId);
        if (!set) {
            set = new Set();
            this._levelIndex.set(levelId, set);
        }
        set.add(wallId);
    }

    private _removeFromLevelIndex(levelId: string, wallId: string): void {
        const set = this._levelIndex.get(levelId);
        if (set) {
            set.delete(wallId);
            if (set.size === 0) this._levelIndex.delete(levelId);
        }
    }
}