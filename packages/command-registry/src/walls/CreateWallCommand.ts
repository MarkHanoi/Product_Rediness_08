/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 1 (Current)
 * Files Modified:    CreateWallCommand.ts
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     No
 *   Constraint Impact:   No
 *   Graph Impact:        Yes — §GR-09: writes `sitsOn` (wall → level) on execute
 *                        and purges the wall's edges on undo. Was "No" while this
 *                        command held zero graph calls at all.
 *   Propagation Impact:  No
 *   Topology Impact:     No
 *   World Model Impact:  No
 *   Event Bus Impact:    No
 *   Store Registry Impact: No (WallSystemTypeStore is a Side System)
 *   Undo/Redo Impact:    Yes — structuredClone makes layer snapshot fully deep-isolated
 *   Spatial Impact:      No
 *   Idempotency Impact:  No
 *
 * Risk Level:   Low
 * Rationale:
 *   Fix 1: Replace shallow spread layer clone with structuredClone (§01 §2.2).
 *   Fix 2: Receive wallSystemTypeStore via ctx.stores injection instead of
 *          window global (§01 §1.1 — Side Systems must be injected).
 *   Fix 3 (v8): Removed _resolveAndRebuild() — the subscriber in main.ts already
 *          handles WallJoinResolver.resolveLevel() after every store mutation.
 *          The old method was both a §2.7 violation (direct builder call) and
 *          caused triple rebuilds on every wall creation.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { WallData, WallCurve, WallLayer, WallBaseline, WallJoinIntent } from '@pryzm/geometry-wall';
// §C83-S1 — the wall-side occupancy predicate. Already a dependency of this
// package (`CreateWallOpeningCommand` imports `wallOccupancyStore` from it), so
// this adds no edge and no layer violation.
import { evaluateWallPlacement, wallCrossesOpeningRefusalText } from '@pryzm/geometry-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { generateMark } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';

/**
 * §UNDO-AUDIT-2026 §01-§2.3 — Per-neighbour pre-create snapshot used to
 * restore baselines that were re-trimmed by WallJoinResolver after this
 * command's execute(). Captured BEFORE wallStore.add() so it reflects the
 * exact state the user would expect on undo.
 */
interface NeighbourBaselineSnapshot {
    id: string;
    baseLine: WallBaseline;
    _sourceBaseLine: WallBaseline | undefined;
}

export class CreateWallCommand implements Command {
    readonly affectedStores = ["wall", "level"] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_WALL;
    timestamp = Date.now();
    targetIds: string[];

    /**
     * §UNDO-AUDIT-2026 §01-§2.3
     * Snapshot of every wall's pre-create baseline geometry. Populated in
     * execute(); consumed in undo() to restore neighbour walls whose
     * baselines were re-trimmed by the asynchronous WallJoinResolver pass
     * triggered by adding the new wall.
     */
    private _neighbourSnapshot: NeighbourBaselineSnapshot[] | null = null;

    /**
     * §WALL-AUDIT-2026-M9 — Stable IFC GUID for the wall, generated ONCE in
     * the constructor and reused across redo. Previously WallStore.add()
     * minted a fresh `crypto.randomUUID()` whenever the wall arrived without
     * `ifcData.guid`, so undo+redo of a CreateWallCommand produced a different
     * GUID each cycle. That broke round-tripping with IFC exports and any
     * external system that keyed off the wall by its IFC GUID.
     *
     * Generating it here makes the GUID property of THIS command — execute()
     * stamps it on the wall, undo() removes the wall, redo() runs execute()
     * again and stamps the SAME guid. The store fallback at WallStore.add()
     * remains as a last-resort safety net for legacy / AI-generated walls
     * that do not carry an `ifcData` block.
     */
    private readonly _ifcGuid: string;

    constructor(
        private wallId: string,
        private wallData: {
            start: { x: number, z: number },
            end: { x: number, z: number },
            height: number,
            thickness: number,
            levelId: string,
            baseOffset?: number,
            materialId?: string,
            materialColor?: string,
            /** Contract §03-1.2: optional curve descriptor. Omit for straight walls. */
            curve?: WallCurve,
            /**
             * §WALL-RAKE — the wall's lean from the floor plane, in degrees. Omit (or 90)
             * for a vertical wall, which is every wall this repository has ever created.
             * Sign convention and refused combinations: `@pryzm/geometry-wall` → `WallRake.ts`.
             */
            rakeAngleDeg?: number,
            /** Contract §03-1.3: optional wall system type ID. Omit for plain walls. */
            systemTypeId?: string,
            /**
             * §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239, P4 backfill) — an ALREADY-RESOLVED
             * layer stack, supplied by the project loader when re-hydrating a persisted wall.
             *
             * WHY: this command re-derives `layers` from `systemTypeId` against
             * `ctx.stores.wallSystemTypeStore` (below) — but `ProjectLoader.load()` restores
             * WALLS (step 4) BEFORE it restores the project's CUSTOM wall system types. So a
             * wall of a user-defined type could never resolve at restore time and silently
             * came back PLAIN (no layers) at the default thickness — the persisted stack was
             * on disk (ProjectSerializer does write `wall.layers`) and was thrown away on the
             * way back in. Passing the persisted stack through makes the round-trip lossless
             * and removes the ordering dependency entirely.
             *
             * When supplied it WINS over catalogue re-derivation (it is the wall's own frozen
             * snapshot). When absent, the catalogue backfills it — which is what upgrades
             * legacy projects saved before layers were ever stamped. Both branches are
             * idempotent: re-running the load produces byte-identical layers.
             */
            layers?: WallLayer[],
            /**
             * §PERSIST-L1 (W1-2) — the wall's ORIGINAL IFC GUID, supplied by the
             * project loader when re-hydrating a persisted wall. `ifcData.guid` is
             * the IFC round-trip join key: it is what an exported IFC file and any
             * external system (BCF issue, COBie sheet, Revit round-trip) uses to
             * find this wall again. It is AUTHORED, not derived — minted once as a
             * `crypto.randomUUID()` and never recomputable — so a restore that does
             * not carry it forward silently breaks that correspondence.
             *
             * Absent (a genuinely new wall), the constructor mints one, exactly as
             * before — see §WALL-AUDIT-2026-M9 above.
             */
            ifcGuid?: string,
            /**
             * §WALL-JOIN-INTENT / §PERSIST-JOININTENT (L-927) — an ALREADY-DECIDED join
             * intent, supplied by the project loader when re-hydrating a persisted wall.
             *
             * WHY THIS MUST BE CARRIED AND CANNOT BE RE-DERIVED. The stamp below answers a
             * HISTORICAL question — *at the moment this wall was drawn, did a committed
             * junction already exist at that endpoint?* L-923 proved no predicate over
             * geometry, type, thickness or `createdAt` can recover that answer afterwards:
             * the founder's mitred-L-plus-newcomer and a legitimate collinear pass-through
             * are the SAME three segments, differing only in draw order. Once the fact is
             * lost it is gone.
             *
             * Re-deriving it at load is therefore not a safe fallback, it is a COIN FLIP —
             * and a biased one. `ProjectLoader` replays walls in FILE order against a
             * partially-populated store, so wall N is judged against only walls 1..N-1;
             * and the baselines it judges are the UNTRIMMED `_sourceBaseLine` the
             * serializer writes, not the trimmed geometry the live editor stamped against.
             * Neither input matches creation time.
             *
             * So: when supplied it WINS over the derivation below (it is the wall's own
             * frozen record of what the author did). When absent — a genuinely new wall,
             * or a project saved before this field existed — the derivation runs exactly as
             * before, which is what keeps legacy snapshots behaving identically.
             *
             * Same shape and same rationale as `layers` above: persisted-value-wins.
             */
            joinIntent?: WallJoinIntent,
        }
    ) {
        this.targetIds = [wallId];
        // §WALL-AUDIT-2026-M9 + §PERSIST-L1 — adopt the supplied GUID, mint only in
        // its absence. Echoed back onto `wallData` so `serialize()` (which spreads
        // it) forwards the SAME guid to every collaboration peer.
        this._ifcGuid = wallData.ifcGuid ?? crypto.randomUUID();
        this.wallData = { ...wallData, ifcGuid: this._ifcGuid };
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const level = ctx.bimManager.getLevelById(this.wallData.levelId);
        if (!level) return { ok: false, reason: 'Level not found' };
        if (this.wallData.height <= 0) return { ok: false, reason: 'Invalid height' };
        if (this.wallData.thickness <= 0) return { ok: false, reason: 'Invalid thickness' };

        if (ctx.stores.wallStore.getById(this.wallId)) {
            return { ok: false, reason: 'Wall already exists' };
        }

        // Contract §03-1.2: curved walls do not support openings at creation time.
        if (this.wallData.curve && this.wallData.curve.segments < 4) {
            return { ok: false, reason: 'Curved wall must have at least 4 segments' };
        }

        // ── §C83-S1 — ENFORCEMENT: a wall may not occupy a hosted opening ──────
        //
        // C74 §1.1 ENFORCEMENT ("a validation wired into a mutation path such that
        // failure REFUSES the mutation"), and the SECOND row of C74 §2's protected
        // table — added there in this same change, because a protected-table row is
        // a contract edit, not a doc follow-up.
        //
        // C83 §1.1 classifies it IMPOSSIBLE: a wall's solid and an opening's void
        // are two mutually exclusive claims about one volume. No context reverses
        // it, so it refuses rather than advises.
        //
        // ⚠ THIS IS THE BACKSTOP, NOT THE ONLY GATE. The two interactive gestures
        // check earlier and show the user a sentence (WallTool's instruction bar in
        // 3D; the ConfirmationCard + toast in plan). This arm exists so the OTHER
        // legacy creators — IFC import, DuplicateFloorPlan, CreateWallsFromSlab —
        // cannot author the defect silently. `blockingIssues[0]` carries the human
        // sentence because `CommandManagerImpl:217` prefers it over `reason`
        // (§FIX-VALIDATION-REASON-IS-HUMAN-READABLE, L-813) — `reason` stays the
        // machine-readable token.
        //
        // Suppressed during project restore and building generation (C83 §3.1).
        // Restore is the load-bearing half: projects saved by build a75e8e1e may
        // ALREADY contain this defect, and refusing on replay would turn a
        // cosmetic bug into a project that will not open.
        const _c83g = globalThis as unknown as {
            __pryzmProjectLoadActive?: boolean;
            __pryzmBuildingGenActive?: boolean;
        };
        const _c83Suppressed =
            _c83g.__pryzmProjectLoadActive === true || _c83g.__pryzmBuildingGenActive === true;
        // The payload carries `start`/`end` (this command builds `baseLine` itself
        // in `execute`, stamping `level.elevation` into `y`). The predicate reads
        // only x/z, so the elevation is passed for shape completeness, not for the
        // test — it is level-scoped by `levelId`, never by height.
        if (!_c83Suppressed && this.wallData.start && this.wallData.end) {
            const spatial = evaluateWallPlacement(
                {
                    id: this.wallId,
                    levelId: this.wallData.levelId,
                    thickness: this.wallData.thickness,
                    baseLine: [
                        { x: this.wallData.start.x, y: level.elevation, z: this.wallData.start.z },
                        { x: this.wallData.end.x,   y: level.elevation, z: this.wallData.end.z },
                    ],
                    ...(this.wallData.curve ? { curve: this.wallData.curve } : {}),
                },
                ctx.stores.wallStore.getAll(),
            );
            if (!spatial.valid) {
                // §REFUSAL-IDENTITY — the SHARED renderer, never
                // `spatial.reason ?? '<fallback>'`: a manufactured sentence fires
                // exactly when the producer refused AND said nothing, and then
                // reads identically to a real reason. `reason` stays the machine
                // token; `blockingIssues[0]` is the human sentence, which
                // CommandManagerImpl:217 prefers (L-813).
                const refusalText = wallCrossesOpeningRefusalText(
                    spatial.violations,
                    spatial.offers,
                );
                console.warn(`[CreateWallCommand] §C83-S1 REFUSED: ${refusalText}`);
                return {
                    ok: false,
                    reason: 'OCC_CROSSES_HOSTED_OPENING',
                    blockingIssues: [refusalText],
                };
            }
        }

        // Validate systemTypeId if provided
        if (this.wallData.systemTypeId) {
            const typeStore = (ctx.stores as any).wallSystemTypeStore;
            if (typeStore && !typeStore.getById(this.wallData.systemTypeId)) {
                return { ok: false, reason: `Unknown wall system type: ${this.wallData.systemTypeId}` };
            }
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const bimManager = ctx.bimManager;
        const level = bimManager.getLevelById(this.wallData.levelId);
        if (!level) throw new Error(`SpatialAuthorityError: Level ${this.wallData.levelId} not found`);

        // Contract §03-1.7 — Marks are generated in the Command layer (has access to
        // BimManager for floor index + WallStore for per-level count). The mark is
        // passed into the wall data so WallStore never needs to derive it.
        const mark = generateMark('wall', this.wallData.levelId, {
            getLevels: () => bimManager.getLevels(),
            countElementsOnLevel: (_type, lvlId) =>
                ctx.stores.wallStore.getByLevel(lvlId).length,
        });

        const elevation = level.elevation;
        const baseOffset = this.wallData.baseOffset ?? 0;
        const worldY = elevation + baseOffset;

        // ── Resolve wall system type layers ──────────────────────────────────
        // Contract §01 §2.2: use structuredClone so the stamped snapshot is
        // fully deep-isolated from the type store. Shallow spread is insufficient
        // if WallLayer ever gains nested objects.
        let resolvedLayers: WallLayer[] | undefined;
        let resolvedThickness = this.wallData.thickness;

        // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239, P4) — an explicitly-supplied stack
        // (the project loader's persisted snapshot) WINS over re-derivation. Only when the
        // caller has no stack do we backfill from the catalogue — which is what upgrades
        // legacy walls saved before layers were stamped, and what keeps the interactive
        // create paths behaving exactly as before. Both branches are idempotent.
        if (Array.isArray(this.wallData.layers) && this.wallData.layers.length > 0) {
            resolvedLayers = structuredClone(this.wallData.layers) as WallLayer[];
        } else if (this.wallData.systemTypeId) {
            const typeStore = (ctx.stores as any).wallSystemTypeStore;
            const sysType = typeStore?.getById(this.wallData.systemTypeId);
            if (sysType) {
                // §01 §2.2 — structuredClone for correct deep snapshot
                resolvedLayers = structuredClone(sysType.layers) as WallLayer[];
                resolvedThickness = sysType.totalThickness;
            } else {
                // MISSING-TYPE FALLBACK (P4): the wall's type no longer exists (deleted, or
                // a project authored against a catalogue this build does not ship). Do NOT
                // invent a stack and do NOT corrupt the wall — keep its persisted thickness,
                // leave it unlayered, and say so loudly. The wall still renders; it simply
                // renders plain, which is strictly better than a wrong stack.
                console.warn(
                    `[CreateWallCommand] §L-239 systemTypeId='${this.wallData.systemTypeId}' not found in ` +
                    `the wall system-type catalogue — wall ${this.wallId} restored UNLAYERED at its ` +
                    `persisted thickness (${resolvedThickness} m). The type was likely deleted or never restored.`,
                );
            }
        }

        const newWall: WallData = {
            id: this.wallId,
            type: 'wall',
            levelId: this.wallData.levelId,

            // Phase B DTO migration: baseLine is [Point3D, Point3D] — plain {x,y,z} objects.
            baseLine: [
                { x: this.wallData.start.x, y: worldY, z: this.wallData.start.z },
                { x: this.wallData.end.x,   y: worldY, z: this.wallData.end.z   },
            ],

            // Contract §03-1.2: stamp curve at worldY
            curve: this.wallData.curve
                ? {
                    control: {
                        x: this.wallData.curve.control.x,
                        y: worldY,
                        z: this.wallData.curve.control.z
                    },
                    segments: this.wallData.curve.segments
                }
                : undefined,

            // §WALL-RAKE — carried straight through. `undefined` ⇒ vertical, so the
            // stamped wall is byte-identical to a pre-rake wall unless the author
            // asked for a lean. WallStore.add()'s Zod refinement is the gate that
            // rejects an out-of-range angle or a refused combination.
            rakeAngleDeg: this.wallData.rakeAngleDeg,

            height: this.wallData.height,
            thickness: resolvedThickness,
            baseOffset: baseOffset,

            openings: [],
            childrenIds: [],

            materialId: this.wallData.materialId,
            materialColor: this.wallData.materialColor,

            // Contract §03-1.3: frozen layer snapshot stamped at execution time.
            // These are intrinsic geometric data, not a graph relationship.
            systemTypeId: this.wallData.systemTypeId,
            layers: resolvedLayers
                ? Object.freeze(resolvedLayers.map(l => Object.freeze({ ...l }))) as WallLayer[]
                : undefined,

            // Contract §03-1.7: mark is generated by Command (not Store).
            properties: { mark },

            // §WALL-AUDIT-2026-M9: stamp the stable IFC GUID generated in this
            // command's constructor so undo+redo always sees the SAME guid. The
            // WallStore.add() fallback only fires for legacy/AI-bypass walls
            // that arrive without an ifcData block.
            ifcData: {
                guid: this._ifcGuid,
                ifcClass: 'IfcWall',
            },

            // §WALL-JOIN-INTENT / §PERSIST-JOININTENT (L-927) — forward a PERSISTED gesture,
            // never a derived one. Present only when the project loader supplied it (the
            // wall's own frozen record of what the author did); `undefined` for every
            // interactive create, which is the signal for `WallStore.add()` to derive.
            //
            // This literal is a WHITELIST — the same shape that silently dropped
            // materialColor, layers and curve elsewhere in this pipeline — so the field has
            // to be named here or the loader's value dies one frame after it is read.
            joinIntent: this.wallData.joinIntent,

            // §VIEW-DIRTY-CHECK §2.2: stamp initial render version = 1 so the
            // builder's dirty check can distinguish this wall from an un-versioned
            // legacy wall and correctly skip rebuild after view switches.
            _renderVersion: 1,
        };

        // §UNDO-AUDIT-2026 §01-§2.3 — Capture every existing wall's baseline
        // and source-baseline BEFORE wallStore.add() triggers the resolver.
        // The asynchronous WallJoinResolver pass (EngineBootstrap subscriber)
        // re-trims neighbouring walls' baseLines to a new consensus point when
        // this new wall joins their cluster.  Without this snapshot, undo()
        // can only remove the new wall — neighbour trims survive, leaving
        // walls visually "stuck" at the post-join geometry.  Restoring this
        // snapshot in undo() reverts those side-effects deterministically.
        //
        // Scoped to the same level as the new wall — joins are level-local
        // (resolver is invoked per-level), so cross-level walls cannot be
        // affected by this command and don't need to be snapshotted.
        this._neighbourSnapshot = ctx.stores.wallStore.getAll()
            .filter(w => w.levelId === this.wallData.levelId)
            .map(w => ({
                id: w.id,
                baseLine: [
                    { x: w.baseLine[0].x, y: w.baseLine[0].y, z: w.baseLine[0].z },
                    { x: w.baseLine[1].x, y: w.baseLine[1].y, z: w.baseLine[1].z },
                ] as WallBaseline,
                _sourceBaseLine: w._sourceBaseLine
                    ? [
                        { x: w._sourceBaseLine[0].x, y: w._sourceBaseLine[0].y, z: w._sourceBaseLine[0].z },
                        { x: w._sourceBaseLine[1].x, y: w._sourceBaseLine[1].y, z: w._sourceBaseLine[1].z },
                    ] as WallBaseline
                    : undefined,
            }));

        // ─── §WALL-JOIN-INTENT (L-251) — RECORD THE GESTURE, ONCE, AT THE CHOKEPOINT ───
        //
        // A MITRED CORNER AND A T-JUNCTION ARE THE SAME GEOMETRY. Two collinear walls
        // meeting a third at a node reads either as "a through-wall plus a stem" (square
        // caps — correct for a T) or as "a committed mitred corner plus a butting newcomer"
        // (freeze the corner — the founder's invariant). The resolver cannot tell them apart,
        // because they are not geometrically different: they differ only in what the author
        // MEANT. L-122 tried to proxy that with `systemTypeId`, and it fails the moment the
        // user draws everything with the DEFAULT wall type — which is exactly what the
        // founder does, and exactly why his mitre kept dying (L-251: the corner's miter
        // normals went `707107,707107` → `null` the instant a same-type wall joined it).
        //
        // The disambiguating fact is not geometric, it is HISTORICAL, and it is knowable
        // exactly HERE and nowhere else: **at the moment this wall is created, did a
        // committed junction already exist at that endpoint?** Two or more existing wall
        // endpoints meeting at a node IS a committed corner. A wall arriving onto it is a
        // newcomer that must adapt — it is never a continuation of a run.
        //
        // Captured ONCE, at creation, and thereafter carried on the record — never
        // re-inferred from geometry on a later resolve pass, which is what made every
        // previous attempt a heuristic.
        //
        // ─── WHERE THE DERIVATION ACTUALLY LIVES NOW (L-927) ──────────────────────
        //
        // This block used to derive the stamp inline, under a comment claiming it was
        // *"the single element-creation chokepoint (C11) … one path, not five."*
        // L-927 MEASURED that claim and it was FALSE: **1 of 6** wall producers reached
        // this line. The plan-view tool and every `wall.batch.create` land instead in the
        // §P2.1 `wall.created` bridge (apps/editor/src/engine/initTools.ts), which rebuilds
        // the record from a field whitelist — so the stamp could never arrive there. The
        // founder kept seeing the corrupted joint because the path he actually draws on
        // was never the path that stamped.
        //
        // The derivation therefore moved DOWN to `WallStore.add()`, which is the only
        // mutator that can introduce a wall record (`update()` returns undefined on a
        // missing id, `updateWall()` throws). Every producer necessarily passes through
        // it, so the chokepoint is now true BY CONSTRUCTION rather than by enumeration —
        // and enumeration is precisely what failed here.
        //
        // Nothing is stamped in this command any more. `wallData.joinIntent`, when the
        // project loader supplies it, is forwarded on `newWall` above and WINS over
        // derivation at the store; when it is absent the store derives. Both branches
        // are one code path in one place: @pryzm/geometry-wall → WallJoinIntentStamp.ts.
        //
        // §MEASURED-JOININTENT-PRODUCER-CENSUS pins the producer count so this cannot
        // silently regress to a claim again.

        // 1️⃣ Store first — triggers Store Event Bus → subscriber in main.ts
        //    handles WallJoinResolver + geometry rebuild (§2.7 compliant).
        ctx.stores.wallStore.add(newWall);

        // 2️⃣ Spatial registration AFTER successful store mutation (§5 ordering).
        // §A40-W01: Skip per-wall registerElement() when inside a batch envelope;
        // the parent CreateWallsOnAllSlabsCommand calls bimManager.registerMany()
        // once per level group via batchCoordinator.trackRegistration() — O(L+N)
        // instead of O(L×N²/2) for N sequential registerElement() calls.
        // Non-batch paths (single CreateWallCommand) still register synchronously.
        if (!batchCoordinator.isBatching) {
            bimManager.registerElement(this.wallId, this.wallData.levelId);
        }

        // 3️⃣ §3.5 FIX: Type registration moved here from WallStore.add().
        //    Store must not register spatial/type elements (Contract §3.5).
        //    elementRegistry.registerSemantic throws if the ID already exists,
        //    which acts as a redo-safety guard (undo calls unregister, so redo is clean).
        elementRegistry.registerSemantic(this.wallId, 'wall');

        // 4️⃣ §GR-09 / C71 §5.5 — SemanticGraph: the wall SITS ON its level.
        //
        // THE ROW THIS CLOSES: GR-09 — *"CreateWallCommand writes no graph edges at
        // all"*. It was literally true: this file held ZERO `semanticGraphManager`
        // calls, so the loader's `_rebuildSemanticGraph` was the ONLY source of a
        // wall's graph presence and a wall created in-session had none until reload.
        // Every other structural create command already writes this edge —
        // CreateColumnCommand:186, CreateBeamCommand:221, CreateRoofCommand,
        // CreateSlabCommand, CreateFurnitureCommand:201 — walls were the hole.
        //
        // THE NAMED FIRST CONSUMER (C71 §2.5 — a writer needs one, never "the gate
        // wants a pair"): `DeleteLevelCommand.ts:174` reads `sitsOn` to find every
        // element that would be STRANDED by deleting a level. Without this write,
        // that guard silently did not cover walls — the most numerous element on
        // any level — and a level delete stranded them all. The edge is therefore
        // load-bearing, so this write is AUTHORITATIVE and failures bubble, exactly
        // as in CreateFurnitureCommand: a half-registered wall must be visible, not
        // swallowed. (CreateColumnCommand's non-fatal try/catch predates that rule.)
        //
        // DIRECTION is element → level, matching every sibling writer, the rebuild
        // (`rebuildSemanticGraph.ts:202`) and the reader's `getTargets(id,'sitsOn')`.
        //
        // NOT written here: `joinedTo`. That edge is emitted at flush time by
        // `WallRebuildCoordinator` (ADR-0321 §CONNECT-3) from the RETAINED junction
        // index, remove-and-re-emit per level — it is not knowable at create time
        // and duplicating it here would fight the owner. And NOT `partOf`: C71 §2.5
        // holds that row DECLINED pending an ADR on whether hierarchy nodes are
        // graph citizens at all.
        //
        // Removal is already owned: `DeleteElementCommand` calls
        // `removeAllRelationshipsForElement(id)` for the wall and its children, and
        // `undo()` below mirrors it for the create-then-undo path.
        semanticGraphManager.addRelationship({
            type: 'sitsOn',
            sourceId: this.wallId,
            targetId: this.wallData.levelId,
            createdBy: 'CreateWallCommand',
            metadata: { addedBy: 'CreateWallCommand' },
        });

        // ✅ §2.7 FIX (v8): Removed _resolveAndRebuild() — the subscriber in main.ts
        // already runs WallJoinResolver.resolveLevel() and calls builder.buildWall()
        // for every wall on the level on each store mutation. Calling it here too
        // caused triple rebuilds and was a direct §2.7 builder-call violation.

        return {
            success: true,
            affectedElementIds: [this.wallId]
        };
    }

    undo(ctx: CommandContext): CommandResult {
        const existing = ctx.stores.wallStore.getById(this.wallId);
        if (!existing) {
            return { success: true, affectedElementIds: [] };
        }

        // ✅ FIX: Unregister hosted child elements (openings/doors) before removing the
        // wall. Without this, their spatial registrations in bimManager and their semantic
        // entries in elementRegistry are leaked on every undo, accumulating indefinitely
        // across undo/redo cycles.  WallStore.remove() clears the in-store maps but
        // does not touch bimManager or elementRegistry (§3.5 contract — Store must not
        // call spatial-registration APIs).
        const childrenIds = existing.childrenIds ?? [];
        for (const childId of childrenIds) {
            ctx.bimManager.unregisterElement(childId);
            elementRegistry.unregister(childId);
            // §GR-09 — the child's graph edges leak on undo exactly as its spatial
            // registration used to. Non-fatal: an undo must complete.
            try { semanticGraphManager.removeAllRelationshipsForElement(childId); } catch { /* side index */ }
        }

        ctx.bimManager.unregisterElement(this.wallId);
        // §3.5 FIX: Unregister from elementRegistry before store removal.
        // Mirrors the registration done in execute(). Safe to call even if the
        // entry is absent (unregister is a no-op for unknown IDs).
        elementRegistry.unregister(this.wallId);
        // §GR-09 — mirror of the execute()-side `sitsOn` write. Undoing a create
        // must leave no edge behind, or the graph accumulates edges pointing at a
        // wall that no store holds — the write-only-state defect one row over.
        // Also purges the flush-time `joinedTo` edges WallRebuildCoordinator may
        // have emitted for this wall (ADR-0321 §CONNECT-3); the coordinator
        // remove-and-re-emits per level on the next pass, so this cannot desync it.
        // Non-fatal, per the §SWALLOW-SIDE-INDEX convention in DeleteElementCommand.
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.wallId);
        } catch (err) {
            console.warn('[CreateWallCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }
        ctx.stores.wallStore.remove(this.wallId);

        // §UNDO-AUDIT-2026 §01-§2.3 — Restore neighbour baselines that were
        // re-trimmed by WallJoinResolver during execute().  Each wallStore.update
        // here re-emits a store 'update' event, which the EngineBootstrap
        // subscriber batches into one resolver pass per animation frame.  By
        // putting the source baselines back to their pre-create values, that
        // resolver pass derives the same join state that existed before the
        // new wall was added — fully deterministic reversal per §2.3.
        if (this._neighbourSnapshot) {
            for (const snap of this._neighbourSnapshot) {
                if (snap.id === this.wallId) continue; // the now-removed wall
                const current = ctx.stores.wallStore.getById(snap.id);
                if (!current) continue;
                ctx.stores.wallStore.update(snap.id, {
                    baseLine: [
                        { x: snap.baseLine[0].x, y: snap.baseLine[0].y, z: snap.baseLine[0].z },
                        { x: snap.baseLine[1].x, y: snap.baseLine[1].y, z: snap.baseLine[1].z },
                    ],
                    // _sourceBaseLine MUST be passed in the same update() — the
                    // WallStore.update() hook (line ~365) clears _sourceBaseLine
                    // whenever baseLine is set without it.  Passing undefined
                    // here would erase the resolver's idempotency anchor.
                    ...(snap._sourceBaseLine ? { _sourceBaseLine: [
                        { x: snap._sourceBaseLine[0].x, y: snap._sourceBaseLine[0].y, z: snap._sourceBaseLine[0].z },
                        { x: snap._sourceBaseLine[1].x, y: snap._sourceBaseLine[1].y, z: snap._sourceBaseLine[1].z },
                    ] } : {}),
                } as any);
            }
        }

        // Rebuild for remaining walls triggered automatically via store 'remove' event
        // → subscriber in main.ts re-runs WallJoinResolver and rebuilds affected walls.

        return {
            success: true,
            affectedElementIds: [this.wallId]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: {
                wallId: this.wallId,
                ...this.wallData
            }
        };
    }
}
