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
}

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
    execute(command: FinishBoundaryCommandLike): unknown;
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
        if (hostEdges === null) return;
        for (const edge of hostEdges) {
            if (!this.graph.has(edge.hostId)) this.graph.set(edge.hostId, new Set());
            this.graph.get(edge.hostId)!.add(rec.id);
        }
    }

    private unregisterRecord(elementId: string): void {
        this.graph.forEach((ids) => ids.delete(elementId));
    }

    /** Build the initial dependency graph from all existing records — the wiring-
     *  time call (`initTools.ts:828` shape). The EVENT path above keeps it live
     *  afterwards; bootstrap alone was the measured slab defect. */
    bootstrap(): void {
        this.store.getAll().forEach((rec) => this.registerRecord(rec));
    }

    // ── Wall moved → re-project ──────────────────────────────────────────────

    private onWallUpdated(wall: WallSnapshotLike, prevState?: WallSnapshotLike): void {
        const dependents = this.graph.get(wall.id);
        if (!dependents || dependents.size === 0) return;

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
        for (const elementId of [...dependents]) {
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
            cm.execute(cmd);
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
    }

    private constructorName(): string {
        return (this.constructor as { name?: string }).name ?? 'FinishHostDependencyTracker';
    }
}
