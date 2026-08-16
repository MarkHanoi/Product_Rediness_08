/**
 * §ROOF-FOLLOWS-WALL — a roof FOLLOWS the walls it was traced from.
 * (GR-12 · C79 §5.1/§5.2 · C78 §8.1 · check-move-propagation A7.)
 *
 * ─── THE DEFECT THIS CLOSES, AS MEASURED ─────────────────────────────────────
 * `roofFollowsMovedWall.test.ts`, committed RED at 86d1d4e0:
 *
 *   × MEASURED TODAY — a bounding wall moves 2 m and the roof record does not change
 *     AssertionError: expected 36 to be close to 48, received difference is 12
 *
 * with the control in the same suite proving the traced REGION does grow
 * 36.000 → 48.000 m² over the identical move. The region moved; the record did
 * not, because `packages/geometry-roof` had no `wallStore.subscribe` site and
 * roof appeared in no arm of any wall-move path — no subscriber, no tracker, no
 * command. Of the sixteen wall subscribers in the tree (door ×2, window ×2,
 * slab ×2, wall ×3, room-topology, finish-host, four snap providers), none was
 * roof's.
 *
 * ─── SHAPE: MIRRORED FROM THE PROVEN PRECEDENT, NOT INVENTED ─────────────────
 * `SlabDependencyTracker` and `FinishHostDependencyTracker` are the two live
 * follow paths, and this class takes one thing from each — for a stated reason
 * in both cases, because they disagree and the disagreement is load-bearing:
 *
 *   · FROM THE SLAB — the dependency GRAPH (`wallId → Set<elementId>`),
 *     `bootstrap()`, and the public `recomputeForWall(wallId)` entry point that
 *     RETURNS verdicts so a caller can tell a roof that followed from one that
 *     had nothing to follow. The slab tracker's own header records what happened
 *     when that entry point did not exist.
 *   · FROM THE FINISHES — the WRITE-BACK GOES THROUGH A COMMAND FACTORY, not a
 *     direct store write. The two families differ because their BUILDERS differ:
 *     the slab's mesh re-derives from `data.sketch`, so its polygon is mirror
 *     state and a direct cascade write is safe; `FloorPanelBuilder` builds from
 *     `boundary.polygon`, so the record IS the geometry input and the write must
 *     be a first-class, replayable operation. A roof is the FLOOR case —
 *     `RoofFragmentBuilder` builds from `footprint.polygon`, there is no sketch
 *     to fall back on — so it takes the floor's rule.
 *
 * ─── THE LANE BOUNDARY, STATED RATHER THAN DISCOVERED ────────────────────────
 * ⚠ THIS CLASS IS NOT CONSTRUCTED ANYWHERE YET, and cannot be from inside
 * `packages/geometry-roof`. There is NO registry mapping element kind → cascade
 * handler anywhere in the repo (grepped: `registerCascade`, `cascadeRegistry`,
 * `CASCADE_HANDLERS`, `propagationRegistry` — docs only, no symbol in
 * `packages/`, `apps/` or `plugins/`); every family is hand-wired in
 * `apps/editor/src/engine/initTools.ts` (`SlabDependencyTracker` :848,
 * `FloorHostDependencyTracker` :866, `CeilingHostDependencyTracker` :880).
 * Reaching production therefore needs THREE things this package cannot write:
 *
 *   1. `UpdateRoofBoundaryCommand` in `packages/command-registry`, modelled on
 *      `UpdateFloorBoundaryCommand` — `affectedStores: ['roof']`,
 *      `nonUndoable = (mode === 'reproject')`, payload = this file's
 *      `RoofBoundaryWritePayload`. Non-undoable for `reproject` for the reason
 *      `SlabDependencyTracker` §03 gives: a derived write on the undo stack lets
 *      one Ctrl+Z restore the PRE-move footprint against POST-move walls,
 *      recreating the drawn≠recorded divergence the write-back exists to remove.
 *   2. `new RoofDependencyTracker(roofStore, wallStore, (p) => new UpdateRoofBoundaryCommand(p))`
 *      plus `.bootstrap()` in `initTools.ts`, beside the other three.
 *   3. `boundingWallIds` POPULATED AT CREATION. It is not, on either path, and
 *      that is deliberate rather than forgotten — see `populateRoofRegionReference`
 *      below for the exact reason and the exact two call sites.
 *
 * Until (3) lands this tracker is `C70 §4.2` — machinery present, capability
 * unreachable — and this comment is the statement of that, not a claim against
 * it. What (3) blocks is REACHABILITY, not correctness: the re-derivation below
 * is fully driven by `roofFollowsMovedWall.test.ts` against real traced regions.
 *
 * ─── PURITY ──────────────────────────────────────────────────────────────────
 * `recomputeRoofForWall` is a PURE function over (roofs, walls, wallId) — no
 * store, no DOM, no THREE. The class is the stateful wrapper. That split is why
 * the behaviour is testable today despite (1)–(3) being out of this lane.
 */

import { traceRoofRegionAtPoint, type RegionWallLike } from './RoofRegionTrace.js';
import type { RoofData } from './RoofTypes.js';
import {
    classifyRoofRecompute,
    toWorldRing,
    type RoofRecomputeVerdict,
    type RoofRegionResolution,
    type RoofXZ,
} from './roofRecomputeVerdict.js';

// ── The pure re-derivation ───────────────────────────────────────────────────

/** Just enough of a roof record to re-derive it. `RoofData` satisfies this. */
export interface RoofRecordLike {
    id: string;
    footprint: { polygon: ReadonlyArray<RoofXZ>; centroid: RoofXZ };
    boundingWallIds?: readonly string[];
}

/**
 * A roof whose wall attribution HAS been recorded — `boundingWallIds` is
 * present and is an array. `[]` is a member of this type and is a real answer
 * ("traced, attributed to no wall"); `undefined` is NOT, because it is the
 * absence of the record rather than a value of it.
 *
 * Carrying that in the TYPE is what lets the re-derivation below stop writing
 * `boundingWallIds ?? []` at every use — see `recomputeRoofForWall`.
 */
type AttributedRoof = RoofRecordLike & { boundingWallIds: readonly string[] };

/**
 * Re-derive every roof bounded by `wallId` and REPORT one of C79 §5.2's five
 * states per roof.
 *
 * WHAT COUNTS AS A DEPENDENT, and why absence is not emptiness. Only a roof
 * whose `boundingWallIds` CONTAINS `wallId` is re-derived. Per the semantics
 * f5a2c726 and 6cd4e8e5 established and paid for in `.optional()`:
 *
 *   · `undefined` — never attributed (drawn by rectangle or polyline, or
 *     predates the field). Not a dependent of any wall. NO VERDICT is returned,
 *     because "this roof was never derived from walls" is a different fact from
 *     every one of the five states, and reporting `undetermined` for it would
 *     manufacture a refusal about a relationship that was never claimed.
 *   · `[]` — region-traced and attributed to no wall. Also not a dependent, and
 *     also no verdict, but for the opposite reason: it WAS derived, and the
 *     derivation found no wall to depend on.
 *
 * This is the distinction `check-no-empty-means-unknown` exists to protect, and
 * it is why the return is `[]` for a non-dependent rather than a verdict object
 * carrying a state nobody asked about.
 *
 * @param roofs  every roof that might depend on the wall (the caller's scope).
 * @param walls  the wall set AFTER the move — the re-trace reads live geometry.
 * @param wallId the wall that moved.
 */
export function recomputeRoofForWall(
    roofs: ReadonlyArray<RoofRecordLike>,
    walls: ReadonlyArray<RegionWallLike> | null | undefined,
    wallId: string,
): RoofRecomputeVerdict[] {
    // §ROOF-ATTRIBUTION-IS-NARROWED, not re-defaulted (C78 §20 · U-INV-4).
    // The predicate makes the TYPE carry what the filter already proved, so the
    // three `boundingWallIds ?? []` that used to follow are deleted rather than
    // re-asserted. They were unreachable — every member of `dependents` has an
    // array by construction — but an unreachable `?? []` is still the wrong
    // thing to write on a discovery path: a reader cannot tell it from a live
    // default, and neither can `check-no-empty-means-unknown`.
    const dependents = roofs.filter(
        (r): r is AttributedRoof =>
            Array.isArray(r.boundingWallIds) && r.boundingWallIds.includes(wallId),
    );
    if (dependents.length === 0) return [];

    // "I could not look" is a different fact from "I looked and it is gone"
    // (C78 §8.1 `ENGINE_NOT_AVAILABLE`), so it gets its own value rather than
    // falling through into the no-region branch.
    if (!walls) {
        return dependents.map((roof) => classifyRoofRecompute({
            roofId: roof.id,
            previousRing: toWorldRing(roof.footprint),
            recordedHostIds: roof.boundingWallIds,
            resolution: {
                ring: null, hostWallIds: [], resolvedHostIds: [], missingHostIds: [],
                undetermined: {
                    reason: 'ENGINE_NOT_AVAILABLE',
                    subReason: 'the wall set this re-derivation reads is not reachable in this runtime',
                },
            },
        }));
    }

    const present = new Set(walls.map((w) => w.id));

    return dependents.map((roof) => {
        const recordedHostIds = [...roof.boundingWallIds];
        const previousRing = toWorldRing(roof.footprint);

        // THE ANCHOR. `footprint.centroid` is the world point the boundary is
        // stored relative to — for a by-region roof it is the centroid of the
        // ring the user's click produced, which lies inside that region for any
        // convex loop and for the concave loops the tracer emits in practice.
        // Re-asking the region question there is the whole re-derivation: same
        // production tracer, same walls, one move later.
        const [ax, az] = roof.footprint.centroid;
        const traced = traceRoofRegionAtPoint(walls, ax, az);

        const resolution: RoofRegionResolution = {
            ring: traced ? (traced.polygon as RoofXZ[]) : null,
            hostWallIds: traced ? traced.attribution.hostWallIds : [],
            resolvedHostIds: recordedHostIds.filter((id) => present.has(id)),
            missingHostIds: recordedHostIds.filter((id) => !present.has(id)),
        };

        return classifyRoofRecompute({
            roofId: roof.id, previousRing, recordedHostIds, resolution,
        });
    });
}

// ── The write-back contract (owned by command-registry, described here) ──────

/**
 * What `UpdateRoofBoundaryCommand` must accept. Mirrors
 * `UpdateFloorBoundaryPayload` field for field, minus the per-edge sketch a roof
 * does not have.
 */
export interface RoofBoundaryWritePayload {
    roofId: string;
    mode: 'reproject' | 'degrade';
    /** The re-derived footprint, in the roof's stored centroid-local form. */
    footprint?: { polygon: [number, number][]; centroid: [number, number] };
    /** The re-derived attribution, so the reference does not go stale beside the geometry. */
    boundingWallIds?: string[];
    cause: { wallId: string; kind: 'wall-moved' | 'wall-removed' };
}

export interface RoofBoundaryCommandLike { /* opaque to this package */ }
export type RoofBoundaryCommandFactory =
    (payload: RoofBoundaryWritePayload) => RoofBoundaryCommandLike;

export interface RoofCommandExecutor { execute(command: RoofBoundaryCommandLike): unknown }

type WallEventType = 'add' | 'update' | 'remove';
export interface RoofWallStoreRef {
    getAll(): RegionWallLike[];
    subscribe(cb: (event: WallEventType, wall: { id: string }) => void): () => void;
}

export interface RoofStoreLike {
    getAll(): RoofData[];
    getById(id: string): RoofData | undefined;
}

// ── The stateful tracker ─────────────────────────────────────────────────────

/**
 * Maintains a live dependency graph `wallId → Set<roofId>` and re-derives every
 * dependent roof when its wall moves.
 *
 * The graph is an INDEX, never an authority: `recomputeRoofForWall` re-reads
 * `boundingWallIds` off the record, so a stale graph entry can cost a wasted
 * lookup but can never produce a verdict about a relationship the record does
 * not carry.
 */
export class RoofDependencyTracker {
    private graph = new Map<string, Set<string>>();
    /**
     * Roofs whose `boundingWallIds` is ABSENT — the relationship was never
     * recorded, so this tracker cannot say whether they depend on any wall.
     *
     * §ROOF-UNATTRIBUTED-IS-NOT-INDEPENDENT (C78 §20 · U-INV-4). Kept apart
     * from `graph` because an empty graph has TWO causes that were previously
     * one value: no roof depends on the moved wall, or no roof has an
     * attribution to depend BY. Today that distinction is not academic — this
     * file's own header records that step (3), populating `boundingWallIds` at
     * creation, is unwired on BOTH creation paths, so in a real project every
     * roof lands here and the graph is empty for every wall. Returning `[]`
     * then reports "no roof was affected by this move", which is a claim about
     * the model; the truth is that nothing was ever readable.
     */
    private unattributed = new Set<string>();
    private unsubscribeWall?: () => void;

    constructor(
        private roofStore: RoofStoreLike,
        private wallStore: RoofWallStoreRef,
        private commandFactory: RoofBoundaryCommandFactory,
        private executor: { current: RoofCommandExecutor | undefined },
    ) {
        // §FIX-SLAB-TRACKER-EVENT-SHAPE, learned rather than repeated: the slab
        // and connectivity trackers both guarded their store listeners on a
        // payload shape (`e.detail.slab`) the store HAS NEVER SENT, so their
        // registration was unreachable from the event path and only `bootstrap()`
        // ever filled the graph. `RoofStore` is not a DOM emitter at all — it
        // has its own `on('add'|'update'|'remove')` — so this tracker subscribes
        // to the store's OWN API and cannot acquire that defect.
        this.roofStore = roofStore;
        this.unsubscribeWall = wallStore.subscribe((event, wall) => {
            if (event === 'update') this.onWallUpdated(wall.id);
        });
    }

    /** Fill the dependency graph from the roofs already in the store. */
    bootstrap(): void {
        this.graph.clear();
        this.unattributed.clear();
        for (const roof of this.roofStore.getAll()) this.registerRoof(roof);
    }

    /**
     * Register one roof's attribution. The three states are BRANCHED, not
     * defaulted — `boundingWallIds ?? []` used to make the first two the same
     * value here, which is the exact shape `check-no-empty-means-unknown` ARM C
     * measures:
     *
     *   · `undefined` — NEVER ATTRIBUTED. No edges, and the roof is remembered
     *     as unattributed so a later "no dependents" answer can say so.
     *   · `[]`        — ATTRIBUTED TO NO WALL. No edges either, but this is a
     *     real, determined answer: the region was traced and bounded by nothing
     *     with an id. It must NOT be remembered as unattributed.
     *   · non-empty   — edges.
     */
    registerRoof(roof: RoofData): void {
        const recorded = roof.boundingWallIds;
        if (recorded === undefined) {
            this.unattributed.add(roof.id);
            return;
        }
        this.unattributed.delete(roof.id);
        for (const wallId of recorded) {
            let set = this.graph.get(wallId);
            if (!set) { set = new Set(); this.graph.set(wallId, set); }
            set.add(roof.id);
        }
    }

    unregisterRoof(roofId: string): void {
        for (const set of this.graph.values()) set.delete(roofId);
        this.unattributed.delete(roofId);
    }

    /**
     * Roof ids whose wall attribution was never recorded. Exposed so a caller
     * can render or log the refusal rather than infer it from a length.
     */
    unattributedRoofIds(): readonly string[] {
        return [...this.unattributed];
    }

    /**
     * The public entry point, RETURNING verdicts — the shape the slab path did
     * not have until §C79-5.2-SLAB-STATES, and whose absence
     * check-move-propagation A4 measured as "the whole move path returns no
     * state". Identical in effect to the wall subscription, because the
     * subscription calls this same method.
     */
    recomputeForWall(wallId: string): RoofRecomputeVerdict[] {
        const dependentIds = this.graph.get(wallId);
        const roofs = dependentIds
            ? [...dependentIds].map((id) => this.roofStore.getById(id)).filter((r): r is RoofData => !!r)
            : [];
        if (roofs.length === 0) {
            // §ROOF-UNATTRIBUTED-IS-NOT-INDEPENDENT. "No roof depends on this
            // wall" is a DETERMINATION, and it may only be returned when every
            // roof was actually readable. If any roof carries no attribution at
            // all, that roof's fate under this move is UNDETERMINED and is
            // reported as such — C78 §8.1 `RELATIONSHIP_NOT_RECORDED`, the
            // member C79 §5.2 names for "the edge is a concept nobody writes".
            if (this.unattributed.size === 0) return [];
            return [...this.unattributed].map((roofId) => ({
                roofId,
                state: 'undetermined' as const,
                reason: 'RELATIONSHIP_NOT_RECORDED' as const,
                subReason:
                    `roof ${roofId} carries no boundingWallIds, so whether wall ${wallId} bounds ` +
                    `it was never recorded and cannot be read. This roof is NOT reported as ` +
                    `unaffected by the move — nothing about it was determined.`,
            }));
        }

        const verdicts = recomputeRoofForWall(roofs, this.wallStore.getAll(), wallId);

        for (const verdict of verdicts) {
            // WRITE RULE, the same decision the slab path makes, stated in the
            // verdict's own terms: persist iff a real re-derivation exists and
            // the boundary actually changed. `preserved` writes nothing (there
            // is nothing to write); `undetermined` writes nothing (there is no
            // ring, and an empty one would be an answer where there is none).
            //
            // `conflicted` IS persisted, deliberately, and it is not a §5.2.2
            // breach: §5.2.2 forbids resolving a conflict by SUBSTITUTING a
            // value that is not the derived one, and the derived footprint is
            // exactly what is written — record ≡ mesh. Refusing the write would
            // put the record back out of step with the picture, which is the
            // defect the write-back exists to close.
            if (!verdict.footprint) continue;
            const command = this.commandFactory({
                roofId: verdict.roofId,
                mode: 'reproject',
                footprint: verdict.footprint,
                boundingWallIds: verdict.boundingWallIds,
                cause: { wallId, kind: 'wall-moved' },
            });
            this.executor.current?.execute(command);
        }
        return verdicts;
    }

    private onWallUpdated(wallId: string): RoofRecomputeVerdict[] {
        return this.recomputeForWall(wallId);
    }

    dispose(): void {
        this.unsubscribeWall?.();
        this.graph.clear();
    }
}

// ── Creation-time population: the ONE remaining out-of-lane step ─────────────

/**
 * The value `boundingWallIds` must be given at creation, derived from the trace
 * that produced the footprint.
 *
 * ⚠ THIS IS NOT CALLED BY EITHER CREATION PATH, AND THAT IS A LANE BOUNDARY,
 * NOT AN OVERSIGHT. Both by-region paths already import from
 * `RoofRegionTrace.ts`, so the helper is one line away from each — but neither
 * line can be written from inside `packages/geometry-roof`:
 *
 *   · 3D  — `RoofTool._handleRegionClick` stashes `traced.polygon` into
 *           `this._pendingPolygon` and drops `traced.attribution`. Threading the
 *           attribution through to the record means changing
 *           `_createRoofFromPolygon`'s call into `CreateRoofCommand`, which
 *           lives in `packages/command-registry`. OUT OF LANE.
 *   · plan — `apps/editor/src/engine/views/plantools/RoofPlanToolHandler.ts:205`
 *           traces and then dispatches `roof.create` through the L0 bus schema.
 *           OUT OF LANE.
 *
 * 6cd4e8e5 refused to wire only the 3D path on C79 §7.4 grounds — per-path
 * divergence is rated WORSE than uniform absence, because it makes whether a
 * roof can follow depend on which button the user pressed. That judgement stands
 * and is not quietly reversed here: the helper exists so BOTH paths can be
 * wired in ONE commit by the lane that owns `CreateRoofCommand`, and neither is
 * wired until then.
 */
export function roofRegionReferenceFromTrace(
    attribution: { hostWallIds: readonly string[] },
): string[] {
    // `[]` is a CORRECT value here and must not be normalised to `undefined`:
    // it means "traced, and attributed to no wall", which is exactly what a
    // region bounded entirely by curved or id-less walls produces. `undefined`
    // is reserved for "never traced" and is the caller's business, not this
    // function's — it is only ever called ON a trace.
    return [...attribution.hostWallIds];
}
