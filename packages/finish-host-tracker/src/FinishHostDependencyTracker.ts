/**
 * FinishHostDependencyTracker — generic wall→finish dependency tracker
 * (§FINISH-FOLLOWS-WALL · GR-12 · C79 §5.4 / C70 F-INV-1).
 *
 * Replicates the just-proven slab pattern (`SlabDependencyTracker`, fixed by
 * §FIX-SLAB-TRACKER-EVENT-SHAPE, commit 798f2cfd) for the two finish families —
 * ONE base class serving both, because C79 §3.4 made their edge shapes
 * byte-identical precisely so one consumer could (and §7.4 forbids letting the
 * two families drift). `FloorHostDependencyTracker` / `CeilingHostDependencyTracker`
 * bind the family specifics.
 *
 * Responsibilities (the slab tracker's three, verbatim):
 *  1. Maintain a live dependency graph wallId → Set<elementId> from the sketch's
 *     outer-loop host-reference edges, fed by BOTH the store events and
 *     `bootstrap()` — the event path is load-bearing (the slab defect was exactly
 *     that only bootstrap ever ran).
 *  2. On wall UPDATE: re-derive each dependent's boundary via
 *     `reprojectFinishBoundary` and write it back through the COMMAND layer
 *     (P6; move-propagation.json slab-A2: "the write-back must go through a
 *     command, not a store write from inside the tracker"). Note this goes ONE
 *     STEP FURTHER than the slab, by necessity: FloorPanelBuilder /
 *     CeilingPanelBuilder build from `boundary.polygon` only — the sketch is not
 *     a geometry input — so a `triggerRebuild` alone would redraw the OLD ring.
 *     The record is the mesh here; following means writing the record. (This
 *     also means the finish does NOT inherit the slab's still-open mesh-vs-model
 *     divergence — the stored polygon and the drawn geometry stay one value.)
 *  3. On wall REMOVE: degrade host references pointing at the deleted wall to
 *     freeLine edges at their last known geometry, through an UNDOABLE command
 *     (C79 §4.2) — Ctrl+Z on the wall deletion also restores the references.
 *  4. §L-943 — do NOTHING while a revert is replaying. See `isRevertReplay()`
 *     for the measurement; the short version is that responsibilities 2 and 3
 *     are FORWARD mutations, and running them on the reverse pass made a wall
 *     move non-reversible (it invented 63 m² of floor on a Ctrl+Z).
 *
 * ── §FINISH-TRACKER-EVENT-SHAPE — the payload trap, handled from birth ───────
 * The stores emit `bim-floor-*` / `bim-ceiling-*` with the F.events.17/18
 * canonical payload `{ id }` (event-bus/src/catalog.ts:36-48). The slab trackers
 * and initBuilders both shipped guards on `e.detail.<record>` — a field the
 * stores HAVE NEVER SENT — and every listener silently no-oped
 * (§DOM-EVENT-LISTENER-AUDIT-2026-05-18, §FIX-SLAB-TRACKER-EVENT-SHAPE: a known
 * bug class repaired in one place and left in two). This tracker accepts BOTH
 * shapes deliberately: `{ id }` is what ships today; a full-record payload is
 * tolerated so a future or out-of-tree emitter cannot silently re-break this.
 * The lookup is the same `store.getById` the wall-rebuild path already uses, so
 * no new reachability assumption is introduced. Pinned by an executed test that
 * was WATCHED RED against the broken-guard shape before it was trusted.
 *
 * ── Command wiring ───────────────────────────────────────────────────────────
 * The command CLASSES live in `@pryzm/command-registry` (`UpdateFloorBoundaryCommand`
 * / `UpdateCeilingBoundaryCommand`); this package receives a FACTORY at
 * construction instead of importing them, for the same reason the slab tracker
 * takes a `CommandManagerRef` — wiring order — plus one more: it keeps this
 * package's dependency surface to the two packages it actually reads. When no
 * command manager (or no factory) is available the tracker falls back to a
 * DIRECT store write and warns — the slab tracker's declared failure mode,
 * kept audible, never a licence for new silent direct-write paths (C79 §4.2).
 */

import {
    degradeFinishHostEdgeXZ,
    resolveFinishHostEdgeXZ,
    type FinishGeometryServices,
    type FinishHostReferenceEdgeLike,
    type FinishSketchEdgeLike,
    type XZ,
} from './FinishSegmentAdapter';
import {
    reprojectFinishBoundary,
    type ReprojectFinishBoundaryResult,
    type WallSnapshotLike,
} from './reprojectFinishBoundary';

// ── Structural surfaces (kept minimal so probe doubles need no casts) ────────

export interface FinishRecordLike {
    id: string;
    boundary: { polygon: XZ[] };
    sketch?: {
        outerLoop: { edges: FinishSketchEdgeLike[] };
    };
    /** §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090) — used ONLY to scope the
     *  late-attribution candidate scan to the moved wall's storey. */
    levelId?: string;
}

/**
 * §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090) — attribute a finish's ALREADY-STORED
 * ring against the PRE-MOVE snapshot of the ONE wall that just moved.
 *
 * ── WHY THIS EXISTS, measured ────────────────────────────────────────────────
 * The graph this tracker maintains is built from `sketch.outerLoop` host-reference
 * edges. Only ONE of the three floor-creation paths in the tree mints them
 * (`CreateFloorCommand._buildBoundarySketch`). The bus verb handler
 * (`plugins/floor/src/handlers/CreateFloor.ts:137`) and the §P3.2-FL bus→legacy
 * mirror in `apps/editor/src/engine/initTools.ts` both write
 * `boundingWallIds: []` and NO `sketch` at all. A finish created either way is
 * STRUCTURALLY INCAPABLE of following a wall, and — before this hook — the
 * tracker's `onWallUpdated` returned on an empty dependent set with no log.
 * Not a refusal: SILENCE. That is the defect class C78 §1.4 names
 * (failure-as-emptiness) and the one the founder reported on 2026-08-21.
 *
 * ── WHY IT IS NOT THE §2.2 PROXIMITY SEARCH C79 FORBIDS ──────────────────────
 * C79 §2.2 forbids re-deriving attribution "by proximity, nearest-neighbour
 * search, coordinate matching, or any other after-the-fact geometric query",
 * because an OPEN candidate set is where a wrong `hostId` comes from (§2.3).
 * The candidate set here is a SINGLETON — the wall that moved — so the question
 * is not the forbidden *"which wall bounds this edge?"* but the answerable
 * *"did THIS wall bound this edge?"*. `ambiguous` is unreachable by
 * construction; there is no second candidate to be confused with. Two finishes
 * on OPPOSITE faces of the same wall both matching is the correct answer, not a
 * collision: both are bounded by it.
 *
 * ── THE STANDING LIMIT, stated rather than hidden ────────────────────────────
 * This is a REPAIR for records whose relationship was never recorded. It is NOT
 * a substitute for recording it at creation, and it MUST NOT be consulted for a
 * record that already carries host references — the tracker only ever offers it
 * records in `unattributed`. Returning `null` is the honest answer and is
 * REPORTED as `RELATIONSHIP_NOT_RECORDED`, never absorbed.
 *
 * @returns the outer-loop edge list, index-aligned with `rec.boundary.polygon`,
 *          in which the edges this wall produced are `hostReference` and every
 *          other edge is `freeLine`; or `null` when no edge attributes to it (or
 *          the storey cannot be scoped, or the host is curved).
 */
export type FinishLateAttribution<T extends FinishRecordLike> = (
    rec: T,
    prevWall: WallSnapshotLike,
) => FinishSketchEdgeLike[] | null;

export interface FinishStoreLike<T extends FinishRecordLike> {
    getById(id: string): T | undefined;
    getAll(): T[];
    update(id: string, updates: Partial<T>, preserveMetadata?: boolean): T | undefined;
}

type WallEventType = 'add' | 'update' | 'remove';

/** The two surfaces of WallStore this tracker uses — including the §STEP7
 *  `prevState` third argument (C72 §3.1), which the re-projection REQUIRES to
 *  measure the authored inset against the pre-move centreline. */
export interface WallStoreRef {
    subscribe(
        cb: (event: WallEventType, wall: WallSnapshotLike, prevState?: WallSnapshotLike) => void
    ): () => void;
}

export interface FinishCommandValidationLike { ok: boolean; reason?: string }

export interface FinishBoundaryCommandLike {
    canExecute(context: unknown): FinishCommandValidationLike;
}

export interface FinishCommandManagerLike {
    getContext(): unknown;
    /** `metadata` carries `source: 'STRUCTURAL_CASCADE'` so CommandManager composes
     *  this write into the gesture that spawned it (§L-874-ONE-UNDO) rather than
     *  pushing a second history entry — one wall move stays ONE Ctrl+Z. */
    execute(command: FinishBoundaryCommandLike, metadata?: { source: 'STRUCTURAL_CASCADE' }): unknown;
    /** §L-874 / §L-943 — true while undo()/redo() is replaying. Optional so a
     *  probe double or an older host that lacks it degrades to the pre-fix
     *  behaviour AUDIBLY rather than silently: see `onWallUpdated`. */
    isReverting?(): boolean;
}

/** Same late-binding shape as the slab tracker's CommandManagerRef: constructed
 *  before the command manager exists, resolved live at event-fire time. */
export interface FinishCommandManagerRef {
    current: FinishCommandManagerLike | undefined;
}

export interface FinishBoundaryWritePayload {
    elementId: string;
    mode: 'reproject' | 'degrade';
    /** Present on 'reproject' only (C79 §4.1 — degradation never moves geometry). */
    polygon?: XZ[];
    outerLoopEdges: FinishSketchEdgeLike[];
    cause: { wallId: string; kind: 'wall-moved' | 'wall-removed' };
}

export type FinishBoundaryCommandFactory = (payload: FinishBoundaryWritePayload) => FinishBoundaryCommandLike;

export interface FinishTrackerEventNames {
    added: string;
    updated: string;
    removed: string;
    /** detail fields that may carry the full record (legacy/out-of-tree shape). */
    detailRecordKeys: readonly string[];
    /** detail fields that may carry the id besides the canonical `id`. */
    detailIdKeys: readonly string[];
}

// ── The tracker ──────────────────────────────────────────────────────────────

export class FinishHostDependencyTracker<T extends FinishRecordLike> {
    /** wallId → elementIds whose sketch outer loop references it */
    private graph = new Map<string, Set<string>>();
    /**
     * §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090) — elementIds that are KNOWN to the
     * tracker and attributed to NO wall, i.e. `hostEdgesOf()` returned `null` (no
     * sketch) or `[]` (a recorded loop with no host edge). Maintained by exactly
     * the same `registerRecord`/`unregisterRecord` lifecycle as `graph`, so it can
     * never drift from it.
     *
     * WHY IT IS A SECOND INDEX AND NOT A SCAN. Before this, a finish that
     * attributed to nothing left NO trace anywhere in this class — `registerRecord`
     * returned, and `onWallUpdated` returned on an empty dependent set. The
     * population that the follow could not serve was invisible to the follow.
     * Holding it costs one Set and makes the shortfall COUNTABLE, which is the
     * precondition for reporting it (C78 §1.4).
     */
    private unattributed = new Set<string>();
    private unsubscribeWall?: () => void;
    private windowListeners: Array<[string, (e: Event) => void]> = [];

    constructor(
        private readonly kind: 'floor' | 'ceiling',
        private readonly events: FinishTrackerEventNames,
        private readonly store: FinishStoreLike<T>,
        wallStore: WallStoreRef,
        /** The ONE resolver + ONE intersector, injected (see FinishSegmentAdapter). */
        private readonly geometry: FinishGeometryServices,
        private readonly commandManagerRef: FinishCommandManagerRef,
        private readonly makeBoundaryCommand?: FinishBoundaryCommandFactory,
        /** §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090). Injected at the composition
         *  root, exactly like `makeBoundaryCommand`, so this package keeps its
         *  two-dependency surface and the ONE shared attribution builder stays the
         *  ONE (C79 §7.4 — no per-path divergence). ABSENT ⇒ the pass does not
         *  run and the shortfall is still REPORTED; it is never silent either way. */
        private readonly attributeLate?: FinishLateAttribution<T>,
    ) {
        // §FINISH-TRACKER-EVENT-SHAPE — see the class doc. `{ id }` is the shape
        // the store sends TODAY; the record shape is tolerated so another emitter
        // cannot silently re-break this (the slab fix's exact reasoning).
        const recordFromDetail = (detail: unknown): T | undefined => {
            const d = detail as Record<string, unknown> | null | undefined;
            for (const key of this.events.detailRecordKeys) {
                const rec = d?.[key];
                if (rec && typeof rec === 'object') return rec as T;
            }
            let id: unknown = d?.id;
            if (typeof id !== 'string') {
                id = this.events.detailIdKeys.map((k) => d?.[k]).find((v) => typeof v === 'string');
            }
            return typeof id === 'string' ? this.store.getById(id) : undefined;
        };

        const onAddedOrUpdated = (e: Event): void => {
            const rec = recordFromDetail((e as CustomEvent).detail);
            if (rec) this.registerRecord(rec);
        };
        const onRemoved = (e: Event): void => {
            // Removal cannot look the record up — it is already gone from the
            // store by the time the event fires — so take the id directly.
            const d = (e as CustomEvent).detail as Record<string, unknown> | null | undefined;
            const id = [d?.id, ...this.events.detailIdKeys.map((k) => d?.[k])].find((v) => typeof v === 'string');
            if (typeof id === 'string') this.unregisterRecord(id);
        };

        this.windowListeners = [
            [this.events.added, onAddedOrUpdated],
            [this.events.updated, onAddedOrUpdated],
            [this.events.removed, onRemoved],
        ];
        for (const [name, listener] of this.windowListeners) {
            window.addEventListener(name, listener);
        }

        this.unsubscribeWall = wallStore.subscribe((event, wall, prevState) => {
            if (event === 'update') {
                this.onWallUpdated(wall, prevState);
            } else if (event === 'remove') {
                this.onWallRemoved(wall);
            }
        });
    }

    // ── Registration ─────────────────────────────────────────────────────────

    /** Typed reader of the family's host-reference edges (C71 §1.3 — this is a
     *  per-family typed read, not an untyped enumeration). Outer loop only:
     *  no production path mints inner-loop host references for finishes.
     *
     *  §NO-EMPTY-MEANS-UNKNOWN (C78 §1.4): `null` means the record carries NO
     *  sketch at all — the relationship was never recorded
     *  (`RELATIONSHIP_NOT_RECORDED`) — which is a different fact from a recorded
     *  loop whose edges simply attribute to no wall (`[]`). Collapsing the two
     *  is the failure-as-emptiness defect this estate keeps re-measuring. */
    private hostEdgesOf(rec: T): FinishHostReferenceEdgeLike[] | null {
        if (!rec.sketch) return null;
        return rec.sketch.outerLoop.edges.filter(
            (e): e is FinishHostReferenceEdgeLike => e.type === 'hostReference'
        );
    }

    private registerRecord(rec: T): void {
        // Re-registration replaces the element's previous dependencies — a sketch
        // whose host set shrank must not keep its stale wall edges (the C71 §3.4
        // staleness rule: idempotent add prevents duplicates, never staleness).
        this.unregisterRecord(rec.id);
        const hostEdges = this.hostEdgesOf(rec);
        // No sketch → nothing recorded to index. Distinct from a recorded sketch
        // with zero host edges, which also indexes nothing but was CHECKED.
        // §FINISH-FOLLOW-LATE-ATTRIBUTION — BOTH are now COUNTED rather than
        // dropped: an element attributed to no wall is the population the follow
        // cannot serve, and it must be visible to the follow to be reported.
        if (hostEdges === null || hostEdges.length === 0) {
            this.unattributed.add(rec.id);
            return;
        }
        for (const edge of hostEdges) {
            if (!this.graph.has(edge.hostId)) this.graph.set(edge.hostId, new Set());
            this.graph.get(edge.hostId)!.add(rec.id);
        }
    }

    private unregisterRecord(elementId: string): void {
        this.graph.forEach((ids) => ids.delete(elementId));
        this.unattributed.delete(elementId);
    }

    /** Build the initial dependency graph from all existing records — the wiring-
     *  time call (`initTools.ts:828` shape). The EVENT path above keeps it live
     *  afterwards; bootstrap alone was the measured slab defect. */
    bootstrap(): void {
        this.store.getAll().forEach((rec) => this.registerRecord(rec));
    }

    // ── §L-943 — the revert latch ────────────────────────────────────────────

    /**
     * True while `CommandManager.undo()` / `redo()` is replaying a recorded
     * mutation. During a revert this tracker's only correct behaviour is SILENCE
     * — the same conclusion `SlabWallConnectivityService` and
     * `WallMoveReweldService` reached at §L-874, arrived at here from a different
     * symptom.
     *
     * THE SYMPTOM (L-943, MEASURED across one gesture and its Ctrl+Z):
     *
     *   MOVE: §C79-5.2 conflicted: floor "162a95a2" NOT re-projected —
     *         re-derived ring self-intersects (75.171 m² → 12.080 m²)
     *   UNDO: §C79-5.2 resized:    floor "162a95a2" follows wall — 75.171 → 138.262 m²
     *
     * The floor REFUSED forward, so nothing was written and there was nothing to
     * reverse — and the reverse pass wrote 63 m² of floor that had never existed.
     * Undo RESTORES; it does not RECONSTRUCT (C71), and a reconstruction can
     * differ from a value that was never replaced. It differed in BOTH arms:
     *
     *   · REFUSED forward → the reverse pass consulted no refusal arm at all and
     *     re-derived unconditionally; and
     *   · FOLLOWED forward → `reprojectFinishBoundary` measures the edge's inset
     *     against the wall's PRE-mutation centreline, which on the reverse pass is
     *     the MOVED wall. The inset is measured across the whole move distance and
     *     re-applied to the restored line, so the ring balloons (22.040 → 51.040 m²
     *     in the executed pin, `floorFollowUndoRestore.test.ts`).
     *
     * THE FIX IS NOT "REFUSE ON THE REVERSE PASS TOO". Both arms would then be
     * silent about a floor whose boundary no longer matches its walls. The write
     * this tracker dispatches is now an UNDOABLE command composed into the
     * spawning gesture (§L-874-ONE-UNDO), so the history restores the finish's
     * PRE-move boundary verbatim from its own inverse patches. This latch exists
     * to keep the tracker from writing a second, re-derived value on top of it.
     *
     * WHEN THE HOST CANNOT ANSWER (`isReverting` absent — a probe double, or a
     * command manager not yet wired) this returns FALSE, i.e. the pre-fix
     * behaviour. That is deliberate and NOT a silent default: without a command
     * manager the tracker's writes never reach the history at all, so there is no
     * inverse patch for a revert to replay and re-derivation is the only conduct
     * available. The fallback is stated here so nobody reads the `?.` as an
     * oversight.
     */
    private isRevertReplay(): boolean {
        return this.commandManagerRef.current?.isReverting?.() === true;
    }

    // ── Wall moved → re-project ──────────────────────────────────────────────

    private onWallUpdated(wall: WallSnapshotLike, prevState?: WallSnapshotLike): void {
        // §L-943 — a REVERT is not a wall move, and re-deriving during one is how
        // this tracker invented floor area. See `isRevertReplay()`.
        if (this.isRevertReplay()) return;

        const dependents = this.graph.get(wall.id);

        // §FINISH-TRACKER-REENTRANT-SET — iterate a SNAPSHOT, never the live Set.
        // The write below re-enters this tracker: store.update() emits
        // `bim-<kind>-updated`, our own listener calls registerRecord(), and
        // registerRecord() DELETES the element from every dependency Set and
        // re-ADDs it. Set.prototype.forEach visits an element that is removed and
        // re-inserted during iteration AGAIN (ECMA-262 24.2.3.6) — so a single
        // wall move re-projected the same finish forever and exhausted the V8
        // heap at ~2 GB. The event path being LIVE is the whole point of this
        // tracker (it is the slab defect it exists to not repeat), so the fix is
        // here, at the iteration, not by muting the listener.
        for (const elementId of [...(dependents ?? [])]) {
            const rec = this.store.getById(elementId);
            if (!rec?.sketch) {
                console.warn(
                    `[${this.constructorName()}] §C79-5.2 undetermined (RELATIONSHIP_NOT_RECORDED): ` +
                    `${this.kind} "${elementId}" is in the dependency graph but carries no sketch — not re-projected.`
                );
                // `continue`, not `return`: under the previous forEach a bare
                // return skipped ONE dependent; in a for-of it would abandon
                // every remaining dependent of this wall.
                continue;
            }

            const result = reprojectFinishBoundary({
                edges: rec.sketch.outerLoop.edges,
                movedWallId: wall.id,
                prevWall: prevState,
                resolveHostSegmentXZ: (edge) => resolveFinishHostEdgeXZ(this.geometry.resolver, edge),
                intersector: this.geometry.intersector,
            });

            this.reportAndWrite(rec, wall.id, result);
        }

        // §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090) — THE FOUNDER'S DEFECT.
        // The pass below runs whether or not the recorded loop above found
        // anything, because the two populations are disjoint by construction
        // (`registerRecord` puts an element in `graph` OR in `unattributed`,
        // never both). A finish created by the bus verb or the §P3.2-FL mirror
        // carries no sketch and lands in the second one.
        this.lateAttributionPass(wall, prevState);
    }

    // ── §FINISH-FOLLOW-LATE-ATTRIBUTION — the repair, and the report ─────────

    /**
     * Offer every finish that is attributed to NO wall to the injected
     * late-attributor, scoped to the moved wall's storey, and re-project the ones
     * it claims.
     *
     * ⭐ THE RULE THIS ENFORCES, and the whole reason it exists: **an empty
     * dependent set is a MEASUREMENT, not a verdict.** `onWallUpdated` used to
     * `return` on `dependents.size === 0` with no output at all, so
     *   (a) "this wall bounds no finish" and
     *   (b) "every finish this wall bounds was created by a path that records no
     *        relationship"
     * were THE SAME VALUE — silence. That is the failure-as-emptiness defect
     * (C78 §1.4 · §CONTEXT-DATA-HONESTY), and it is what the founder saw on
     * 2026-08-21: a wall moved 19.444 m of Ground-floor baseline, the openings
     * re-seated, the room re-detected, the room tag refreshed — and the floor
     * finish neither followed NOR refused. Nothing at all was printed about it.
     *
     * Every exit from this method now prints, or writes. There is no silent one.
     */
    private lateAttributionPass(wall: WallSnapshotLike, prevState?: WallSnapshotLike): void {
        if (this.unattributed.size === 0) return; // nothing unattributed: not a shortfall.

        // Scope to the moved wall's storey. Attributing a first-floor finish to a
        // ground-floor wall is the wrong-host failure C79 §2.3 forbids, and
        // `FinishHostDependencyTracker` keys on `hostId` alone and consults no
        // level (the hazard `CreateFloorPayload.hostReferences` documents).
        // UNKNOWN on either side is NOT "same level" — it is unscopable, and an
        // unscopable candidate is dropped rather than guessed at.
        const candidates: T[] = [];
        let unscopable = 0;
        for (const elementId of [...this.unattributed]) {
            const rec = this.store.getById(elementId);
            if (!rec) continue;
            if (!wall.levelId || !rec.levelId) { unscopable++; continue; }
            if (wall.levelId !== rec.levelId) continue;
            candidates.push(rec);
        }

        if (candidates.length === 0) {
            if (unscopable > 0) {
                console.warn(
                    `[${this.constructorName()}] §C79-5.2 undetermined (RELATIONSHIP_NOT_RECORDED): ` +
                    `${unscopable} ${this.kind}(s) attribute to no wall and carry no storey to scope against ` +
                    `(wall "${wall.id}" levelId=${wall.levelId ?? 'UNKNOWN'}) — not offered for late attribution.`
                );
            }
            return;
        }

        if (!this.attributeLate) {
            console.warn(
                `[${this.constructorName()}] §C79-5.2 undetermined (RELATIONSHIP_NOT_RECORDED): ` +
                `wall "${wall.id}" moved and ${candidates.length} ${this.kind}(s) on level ` +
                `"${wall.levelId}" attribute to NO wall — no late-attributor is wired, so whether ` +
                `they are bounded by it is UNMEASURED, not "no".`
            );
            return;
        }

        // C72 §3.5 — prevState is never reconstructed from the store. The store
        // holds the MOVED wall; attributing the old ring against the new
        // centreline would diff a value against itself and report "no match".
        if (!prevState) {
            console.warn(
                `[${this.constructorName()}] §C79-5.2 undetermined (STALE_DERIVED_STATE): ` +
                `wall "${wall.id}" moved without a pre-mutation snapshot (C72 §3.1 no-prevState) — ` +
                `${candidates.length} unattributed ${this.kind}(s) could not be tested against it.`
            );
            return;
        }

        let attributed = 0;
        for (const rec of candidates) {
            const edges = this.attributeLate(rec, prevState);
            if (!edges) continue;
            attributed++;
            // AUDIBLE ON PURPOSE. A late attribution is a REPAIR of a record whose
            // relationship should have been minted at creation (C79 §7.1). It is
            // correct behaviour and a standing data defect at the same time, and
            // the line is what makes the second one countable.
            console.warn(
                `[${this.constructorName()}] §FINISH-FOLLOW-LATE-ATTRIBUTION: ${this.kind} "${rec.id}" ` +
                `carried NO recorded host reference and IS bounded by moved wall "${wall.id}" — ` +
                `attributing now against the pre-move centreline alone (singleton candidate set, ` +
                `C79 §2.2-compliant) and re-projecting. Its creation path recorded no relationship.`
            );
            const result = reprojectFinishBoundary({
                edges,
                movedWallId: wall.id,
                prevWall: prevState,
                resolveHostSegmentXZ: (edge) => resolveFinishHostEdgeXZ(this.geometry.resolver, edge),
                intersector: this.geometry.intersector,
            });
            this.reportAndWrite(rec, wall.id, result);
        }

        if (attributed === 0) {
            // "Checked, and none of them touch this wall" — a DIFFERENT fact from
            // the silence this method replaces, and the whole point of printing it.
            console.log(
                `[${this.constructorName()}] §FINISH-FOLLOW-LATE-ATTRIBUTION: wall "${wall.id}" moved; ` +
                `checked ${candidates.length} unattributed ${this.kind}(s) on level "${wall.levelId}" — ` +
                `none is bounded by it.`
            );
        }
    }

    /** C79 §5.2 — the verdict is REPORTED, one of five states, never absorbed. */
    private reportAndWrite(rec: T, wallId: string, result: ReprojectFinishBoundaryResult): void {
        switch (result.state) {
            case 'preserved':
                return; // nothing happened, and we checked.
            case 'resized': {
                console.log(
                    `[${this.constructorName()}] §C79-5.2 resized: ${this.kind} "${rec.id}" follows wall "${wallId}" — ` +
                    `${result.numbers!.oldAreaM2.toFixed(3)} m² → ${result.numbers!.newAreaM2.toFixed(3)} m².`
                );
                this.writeBoundary(rec, {
                    elementId: rec.id,
                    mode: 'reproject',
                    polygon: result.polygon!,
                    outerLoopEdges: result.edges!,
                    cause: { wallId, kind: 'wall-moved' },
                });
                return;
            }
            case 'conflicted':
                // §5.2.2 — refusal names BOTH numbers; never a silent clamp, never
                // a substituted value. The record keeps its pre-move boundary.
                console.warn(
                    `[${this.constructorName()}] §C79-5.2 conflicted: ${this.kind} "${rec.id}" NOT re-projected — ` +
                    `${result.subReason} (old ${result.numbers?.oldAreaM2.toFixed(3)} m², ` +
                    `re-derived ${result.numbers?.newAreaM2.toFixed(3)} m²).`
                );
                return;
            case 'undetermined':
            default:
                // §5.2.1 — never collapsed into 'preserved': this line is the
                // difference between "nothing moved" and "we did not re-derive".
                console.warn(
                    `[${this.constructorName()}] §C79-5.2 undetermined (${result.reason}): ${this.kind} "${rec.id}" ` +
                    `NOT re-projected — ${result.subReason}.`
                );
                return;
        }
    }

    // ── Wall removed → degrade (undoable, C79 §4.2) ──────────────────────────

    private onWallRemoved(wall: WallSnapshotLike): void {
        // §L-943 — same rule as onWallUpdated. Undoing a wall CREATE removes the
        // wall; degrading the references then would be a fresh forward mutation
        // dispatched from inside a revert. The history's own child entry restores
        // whatever the forward pass wrote. NOTE the graph entry is still dropped
        // below — the dependency index is bookkeeping, not a model write, and a
        // wall that is gone must not stay indexed.
        if (this.isRevertReplay()) { this.graph.delete(wall.id); return; }

        const dependents = this.graph.get(wall.id);
        if (dependents && dependents.size > 0) {
            // §FINISH-TRACKER-REENTRANT-SET — snapshot, for the same reason as
            // onWallUpdated: the degrade write re-enters registerRecord, which
            // delete-then-re-adds into this very Set.
            for (const elementId of [...dependents]) {
                const rec = this.store.getById(elementId);
                if (!rec?.sketch) continue;

                let changed = false;
                const degraded: FinishSketchEdgeLike[] = rec.sketch.outerLoop.edges.map((edge) => {
                    if (edge.type !== 'hostReference' || edge.hostId !== wall.id) return edge;
                    const freeLine = degradeFinishHostEdgeXZ(this.geometry.resolver, edge);
                    // No live wall AND no fallback → keep the original edge — the
                    // slab tracker's own precedent (never degrade to nothing, §4.3).
                    if (!freeLine) return edge;
                    changed = true;
                    return freeLine;
                });

                if (!changed) continue;

                this.writeBoundary(rec, {
                    elementId: rec.id,
                    mode: 'degrade',
                    outerLoopEdges: degraded,
                    cause: { wallId: wall.id, kind: 'wall-removed' },
                });
            }
        }
        this.graph.delete(wall.id);
    }

    // ── The write path — command-first, with the declared audible fallback ───

    private writeBoundary(rec: T, payload: FinishBoundaryWritePayload): void {
        const cm = this.commandManagerRef.current;
        if (cm && this.makeBoundaryCommand) {
            const cmd = this.makeBoundaryCommand(payload);
            const validation = cmd.canExecute(cm.getContext());
            if (!validation.ok) {
                console.warn(
                    `[${this.constructorName()}] boundary ${payload.mode} command refused for ` +
                    `${this.kind} "${payload.elementId}": ${validation.reason}`
                );
                return;
            }
            // §L-943 / §L-874-ONE-UNDO — this write is now UNDOABLE (both modes),
            // so it must be told what it is: a STRUCTURAL CASCADE of the gesture
            // currently executing, not a user gesture of its own. CommandManager
            // attaches it to that gesture's `structuralChildren` instead of the
            // history, which is what keeps one wall move at ONE Ctrl+Z while still
            // giving the reverse pass a recorded value to restore. A cascade with
            // no enclosing gesture (a store write outside any command) keeps its
            // own entry — CommandManagerImpl's documented, unchanged behaviour.
            cm.execute(cmd, { source: 'STRUCTURAL_CASCADE' });
            return;
        }

        // Declared failure mode (C79 §4.2's shape: declared and audible) — same
        // wording contract as SlabDependencyTracker's fallback. A degradation
        // written this way is NOT undoable; this should never happen in normal
        // operation because the trackers are wired after commandManager exists.
        console.warn(
            `[${this.constructorName()}] commandManager${this.makeBoundaryCommand ? '' : ' / command factory'} not available. ` +
            `Falling back to direct store update for boundary ${payload.mode} on ${this.kind} "${payload.elementId}". ` +
            `This write will NOT be undoable. This should never happen in normal operation.`
        );
        const updates: Partial<T> = {
            sketch: {
                ...(rec.sketch ?? {}),
                outerLoop: { edges: payload.outerLoopEdges },
            },
            ...(payload.polygon ? { boundary: { ...rec.boundary, polygon: payload.polygon } } : {}),
        } as unknown as Partial<T>;
        this.store.update(rec.id, updates);
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    dispose(): void {
        this.unsubscribeWall?.();
        for (const [name, listener] of this.windowListeners) {
            window.removeEventListener(name, listener);
        }
        this.windowListeners = [];
        this.graph.clear();
        this.unattributed.clear();
    }

    /**
     * §FINISH-FOLLOW-LATE-ATTRIBUTION — the SHORTFALL, readable. How many known
     * finishes attribute to no wall at all, i.e. how much of this family the
     * recorded-relationship follow cannot serve. Exposed so a gate or a diagnostic
     * can assert on it instead of inferring it from console output (C78 §1.4 — a
     * number that is not readable is a number nobody can ratchet).
     */
    unattributedCount(): number {
        return this.unattributed.size;
    }

    private constructorName(): string {
        return (this.constructor as { name?: string }).name ?? 'FinishHostDependencyTracker';
    }
}
