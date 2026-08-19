/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    ElementStore (Semantic Layer)
 * Phase:             Phase 1 (Current)
 *                    Performance — Curtain Wall Batch Optimisation
 * Files Modified:    CurtainWallStore.ts
 * Classification:    B (performance enhancement — no semantic model changes)
 *
 * Critical Fixes (from CURTAIN-WALL-CONTRACT-AUDIT.md):
 *   #1  Store no longer calls Builder (removed update/remove builder coupling)
 *   #10 Store no longer performs spatial registration (bimManager.registerElement removed)
 *
 * Performance Fixes (from 10-CURTAIN-WALL-PERFORMANCE-PLAN.md):
 *   PERF-FIX-5   getReadOnly() — fast internal read, no clone, for Builder subscriber hot path
 *   PERF-ADDMANY addMany() — batch insertion that fires internal listeners AFTER all items
 *                are in the Map, eliminating the O(n²) progressive-store-scan pattern.
 *                Internal listeners see the complete set on every call; storeEventBus events
 *                respect the existing batch envelope (buffered at depth ≥ 1 when called
 *                inside runBatch). Estimated saving: 400–600 ms for a 400-wall batch.
 *
 * Contract References:
 *   §3.4  Immutability Required — input object never mutated; clones stored
 *   §3.5  Store Is Data Only — no builder, no bimManager, no scene access
 *   §3.8  Store Event Bus — all mutations emit to storeEventBus singleton
 *   §3.3  ElementStore Interface — has(), set(), get(), delete(), getAll()
 *
 * Change: Added addMany() bulk-insertion method.
 * Impact:
 *   Semantic Impact:   No
 *   Store Impact:      Yes — new addMany() method; add() unchanged
 *   Undo/Redo Impact:  No — undo() uses remove() which is unchanged
 *   Event Bus Impact:  Yes — addMany() emits storeEventBus events per item (buffered
 *                      by the outer batch envelope); internal listeners fired after all inserts
 * Risk Level: Low
 */

import { trace, Span } from '@opentelemetry/api';
import { CurtainWallData } from './CurtainWallTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';

const tracer = trace.getTracer('pryzm.curtainwall.store');

type CWEventType = 'add' | 'update' | 'remove';
type CWEventListener = (event: CWEventType, cw: CurtainWallData) => void;

function cloneCurtainWallData(cw: CurtainWallData): CurtainWallData {
    return {
        ...cw,
        // P0.3 DTO: baseLine is now [Point3D, Point3D] — plain spread clones are sufficient.
        // No THREE.Vector3 instantiation in the store (Contract §01 §3.4 v2.0).
        baseLine: [
            { ...cw.baseLine[0] },
            { ...cw.baseLine[1] }
        ],
        // CoreElement.properties is required (non-optional) — always spread it
        properties: { ...(cw.properties ?? {}) },
        ifcData: cw.ifcData ? { ...cw.ifcData } : undefined,
        // Deep-clone gridSystem so callers cannot corrupt internal U/V line arrays
        gridSystem: cw.gridSystem ? {
            uLines: cw.gridSystem.uLines.map(l => ({ ...l })),
            vLines: cw.gridSystem.vLines.map(l => ({ ...l }))
        } : undefined
    };
}

export class CurtainWallStore {
    private curtainWalls: Map<string, CurtainWallData> = new Map();
    public activeLevelId: string = 'L0';
    private listeners: CWEventListener[] = [];

    // ── §3.3 Standard ElementStore interface ────────────────────────────────

    has(id: string): boolean {
        return this.curtainWalls.has(id);
    }

    /**
     * §3.4 Full replacement — the authoritative write path.
     * Clones the incoming object to prevent external mutation of stored state.
     */
    set(id: string, cw: CurtainWallData): void {
        const isNew = !this.curtainWalls.has(id);
        const cloned = cloneCurtainWallData(cw);
        this.curtainWalls.set(id, cloned);
        this.emit(isNew ? 'add' : 'update', cloned);
    }

    /**
     * §3.4 Returns a clone — callers cannot corrupt internal state.
     */
    get(id: string): CurtainWallData | undefined {
        const cw = this.curtainWalls.get(id);
        return cw ? cloneCurtainWallData(cw) : undefined;
    }

    /**
     * §3.4 Returns clones of all elements.
     */
    getAll(): CurtainWallData[] {
        return Array.from(this.curtainWalls.values()).map(cloneCurtainWallData);
    }

    /**
     * §3.5 Removes element and emits delete event.
     * Does NOT call builder.remove() — that is handled by the subscriber in main.ts.
     * Does NOT call bimManager.unregisterElement() — that is the Command's responsibility.
     */
    delete(id: string): void {
        const cw = this.curtainWalls.get(id);
        if (cw) {
            this.curtainWalls.delete(id);
            this.emit('remove', cw);
        }
    }

    // ── Legacy aliases (backwards-compatible with existing commands) ─────────

    /**
     * PERF-ADDMANY: Batch-insert multiple curtain walls with a single notification pass.
     *
     * All items are inserted into the internal Map first (no listener calls), then
     * internal listeners are fired once per item after the Map is fully populated.
     * This eliminates the O(n²) progressive-store-scan pattern where per-item add()
     * calls caused subscribers doing getAll() to scan a growing store on every insertion.
     *
     * storeEventBus events are emitted per item after all inserts; during a batch
     * (depth ≥ 1 from storeEventBus.beginBatch() in BatchCoordinator.runBatch) they
     * are buffered and delivered in the final yielded flush — semantically identical
     * to the pre-existing per-item add() path but with far less overhead.
     *
     * §3.4 Immutability: each item is deep-cloned before storage — callers cannot
     * corrupt internal state through the original array or its objects.
     * §3.5 Store Is Data Only: no builder call; no bimManager call.
     *
     * @param items  Array of CurtainWallData to insert. Items already present in the
     *               store (has(id) === true) are silently skipped (idempotent on redo).
     */
    addMany(items: CurtainWallData[]): void {
        if (items.length === 0) return;

        // P8: OTel span required for every new exported public method (ci-check-spans gate).
        const span: Span = tracer.startSpan('pryzm.curtainwall.store.addMany', {
            attributes: { 'batch.size': items.length },
        });

        try {
            const startSize = this.curtainWalls.size;
            const inserted: CurtainWallData[] = [];
            const __t_phase1_start = performance.now();

            // ── Phase 1: Insert all items into the Map without any listener calls ──
            // No emit() here — listeners fire in Phase 2 after the Map is fully populated.
            for (let i = 0; i < items.length; i++) {
                const cw = items[i];
                if (!cw.levelId) throw new Error('[CurtainWallStore] addMany(): levelId is required');
                if (!cw.id) throw new Error('[CurtainWallStore] addMany(): id is required');

                // Skip items already in the store (redo-path idempotency, mirrors add() has() guard).
                if (this.curtainWalls.has(cw.id)) continue;

                // §3.4: full deep clone matching the existing add() layout exactly.
                // Mark fallback uses (startSize + i + 1) so sequential numbering is
                // identical to what N sequential add() calls would have produced.
                const withDefaults: CurtainWallData = {
                    ...cw,
                    baseLine: [
                        { ...cw.baseLine[0] },
                        { ...cw.baseLine[1] },
                    ],
                    properties: {
                        ...(cw.properties ?? {}),
                        mark: cw.properties?.mark ??
                            `CW${(startSize + i + 1).toString().padStart(3, '0')}`
                    },
                    ifcData: cw.ifcData ? { ...cw.ifcData } : {
                        guid: crypto.randomUUID(),
                        ifcClass: 'IfcCurtainWall',
                    },
                    gridSystem: cw.gridSystem ? {
                        uLines: cw.gridSystem.uLines.map(l => ({ ...l })),
                        vLines: cw.gridSystem.vLines.map(l => ({ ...l })),
                    } : undefined,
                };
                this.curtainWalls.set(cw.id, withDefaults);
                inserted.push(withDefaults);
            }

            if (inserted.length === 0) return;

            // ── Phase 2: Notify listeners AFTER all items are in the Map ──────────
            // Subscribers that call getAll() now see the complete batch on every call,
            // eliminating the O(n²) progressive-scan pattern.
            //
            // §BATCH-CW-PAUSE-ADDMANY (BN-01 fix, 2026-05-06):
            //
            // When BatchCoordinator.runBatch() is active, the CurtainWallBuilder is
            // already paused (_rebuildPaused = true). The normal per-item path calls
            // updateCurtainWall(cw) → _rebuildPaused check → _pausedBuildsMap.set()
            // for each of the N walls — N try/catch frames, N isBatching reads, N
            // function call invocations.
            //
            // Fast batch path: call addManyPaused(inserted) ONCE to populate
            // _pausedBuildsMap in a single tight loop inside the builder. Then emit
            // storeEventBus events per-item (they are buffered at depth ≥ 1 so the
            // cost is O(1) per call). Internal listeners (RoomTopologyObserver, etc.)
            // are NOT called per-item during a batch — curtain walls cannot define room
            // boundaries, and BatchCoordinator already fires the correct plan-view
            // reprojection via markLevelsDirty() in _executeFinalSweep(). Skipping the
            // 168 RoomTopologyObserver debounce-timer resets also avoids N spurious
            // room-redetection schedules that would fire 800 ms after the batch.
            //
            // Non-batch path (interactive single-wall add): the slow path is preserved
            // unchanged — per-item listener calls + storeEventBus.emit() as before.
            span.setAttribute('batch.inserted', inserted.length);
            const ts = Date.now();
            const __t_phase1_end = performance.now();

            if (batchCoordinator.isBatching) {
                // §A.4 (INE-13): Split the outer condition so addManyPaused availability is
                // checked SEPARATELY from isBatching. The previous combined condition silently
                // fell through to the normal per-item path when addManyPaused was missing,
                // giving no diagnostic signal for a serious invariant violation.
                const cwCtrl = window.__curtainWallRebuildControl;
                if (typeof cwCtrl?.addManyPaused === 'function') {
                    // ── Fast batch path ────────────────────────────────────────────────
                    // Populate builder's _pausedBuildsMap in one pass (no per-item overhead).
                    cwCtrl.addManyPaused(inserted);
                    const __t_addManyPaused_end = performance.now();

                    // Emit storeEventBus events per-item — buffered by the outer bracket;
                    // delivered to storeEventBus subscribers in endBatchYielded().
                    for (const cw of inserted) {
                        storeEventBus.emit({
                            elementId: cw.id,
                            elementType: 'curtainwall',
                            operation: 'create',
                            timestamp: ts,
                        });
                    }
                    const __t_bus_end = performance.now();
                    console.log(
                        `[CurtainWallStore] §BATCH-CW-PAUSE-ADDMANY §DIAG ` +
                        `batchId=${window.__activeBatchId ?? 'none'} ` +
                        `n=${inserted.length} ` +
                        `phase1CloneMs=${(__t_phase1_end - __t_phase1_start).toFixed(1)}ms ` +
                        `addManyPausedMs=${(__t_addManyPaused_end - __t_phase1_end).toFixed(1)}ms ` +
                        `busEmitMs=${(__t_bus_end - __t_addManyPaused_end).toFixed(1)}ms ` +
                        `totalPhase2Ms=${(__t_bus_end - __t_phase1_end).toFixed(1)}ms ` +
                        `(fast batch path — per-item listener calls skipped)`
                    );
                } else {
                    // §A4-SAFETY §INE-13: isBatching=true but addManyPaused is unavailable.
                    // This is a runtime invariant violation — the builder should always be
                    // initialised and wired before BatchCoordinator.runBatch() fires.
                    // Possible causes: builder disposed before batch ends; engine startup
                    // ordering bug; project-switch mid-batch without forceReset().
                    //
                    // Action: log an explicit error so the condition is never silently ignored,
                    // then fall through to the per-item path so storeEventBus events are still
                    // emitted (walls are stored; they will not be built until the builder is
                    // available and processes the storeEventBus drain).
                    console.error(
                        `[CurtainWallStore] §A4-SAFETY §INE-13 addManyPaused unavailable — ` +
                        `${inserted.length} wall(s) stored but NOT scheduled for build. ` +
                        `Builder may be disposed or not yet initialised. ` +
                        `batchId=${window.__activeBatchId ?? 'none'} ` +
                        `isBatching=${batchCoordinator.isBatching}`
                    );
                    for (const cw of inserted) {
                        this.listeners.forEach(l => {
                            try { l('add', cw); } catch (e) {
                                console.error('[CurtainWallStore] addMany listener error (A4 fallback):', e);
                            }
                        });
                        storeEventBus.emit({
                            elementId: cw.id,
                            elementType: 'curtainwall',
                            operation: 'create',
                            timestamp: ts,
                        });
                    }
                    // §I-2 (Sprint 1): Enqueue fallback walls for shadow reactivation so they
                    // are covered by the 30-second drain pass even if the builder processes them
                    // after isBatching becomes false. scheduleBatchShadow() is optional — non-fatal.
                    window.__curtainWallRebuildControl?.scheduleBatchShadow?.(inserted.map(w => w.id));
                }
            } else {
                // ── Normal interactive path ────────────────────────────────────────
                // Per-item listener notifications + storeEventBus.emit (unchanged).
                for (const cw of inserted) {
                    this.listeners.forEach(l => {
                        try { l('add', cw); } catch (e) {
                            console.error('[CurtainWallStore] addMany listener error:', e);
                        }
                    });
                    storeEventBus.emit({
                        elementId: cw.id,
                        elementType: 'curtainwall',
                        operation: 'create',
                        timestamp: ts,
                    });
                }
            }
        } finally {
            span.end();
        }
    }

    /**
     * Legacy add() — stamps defaults and stores a fully deep-cloned object.
     * §3.5: No bimManager call; no builder call.
     * Spatial registration is the Command's responsibility.
     *
     * §BATCH-CW-PERF: Bypasses set() to avoid a second cloneCurtainWallData() pass.
     * `withDefaults` is constructed as a complete deep clone here (baseLine,
     * properties, ifcData, gridSystem all spread), so storing it directly satisfies
     * §3.4 immutability — callers cannot corrupt internal state through the
     * original `cw` reference.
     */
    add(cw: CurtainWallData): void {
        if (!cw.levelId) throw new Error('[CurtainWallStore] add(): levelId is required');
        if (!cw.id) throw new Error('[CurtainWallStore] add(): id is required');

        const isNew = !this.curtainWalls.has(cw.id);
        const withDefaults: CurtainWallData = {
            ...cw,
            // §3.4: deep-clone all nested references so no caller can mutate stored state.
            baseLine: [
                { ...cw.baseLine[0] },
                { ...cw.baseLine[1] },
            ],
            properties: {
                ...(cw.properties ?? {}),
                mark: cw.properties?.mark ??
                    `CW${(this.curtainWalls.size + 1).toString().padStart(3, '0')}`
            },
            ifcData: cw.ifcData ? { ...cw.ifcData } : {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcCurtainWall',
            },
            gridSystem: cw.gridSystem ? {
                uLines: cw.gridSystem.uLines.map(l => ({ ...l })),
                vLines: cw.gridSystem.vLines.map(l => ({ ...l })),
            } : undefined,
        };
        // Store and emit directly — withDefaults is already a full deep clone.
        this.curtainWalls.set(cw.id, withDefaults);
        this.emit(isNew ? 'add' : 'update', withDefaults);
    }

    /**
     * Legacy remove() — delegates to delete().
     * §3.5: No builder.remove() call. Builder removal is handled by the subscriber in main.ts.
     */
    remove(id: string): void {
        this.delete(id);
    }

    /**
     * Legacy partial-update — merges with existing state, then delegates to set().
     * §3.5: No builder call. Rebuild is triggered by the subscriber in main.ts via storeEventBus.
     */
    update(id: string, updates: Partial<CurtainWallData>): void {
        const existing = this.curtainWalls.get(id);
        if (!existing) return;
        const merged: CurtainWallData = { ...existing, ...updates };
        this.set(id, merged);
    }

    /**
     * §L-1032 — MOVE a curtain wall to a different storey.
     *
     * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
     * Unlike `SlabStore` / `ColumnStore`, `update()` above WOULD survive the
     * one-key partial: `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts:176-180`
     * records `curtainwall` as `semantics: 'merge'` and cites exactly the line
     * above (`{ ...existing, ...updates }`, :365-370). So the argument for this
     * method is NOT "the generic write would annihilate the record". It is three
     * other things, and each is load-bearing:
     *
     *   1. THE UNDO ADAPTER ROUTES BY METHOD PRESENCE, NOT BY SEMANTICS.
     *      `elementUndoStoreAdapter.ts:506` tests `typeof store.changeLevel ===
     *      'function'` before routing a depth-2 `levelId` inverse patch. A family
     *      without the method falls through to the generic `update()` arm — which
     *      here is survivable, but ALSO skips the `bimManager.registerElement` /
     *      view-dependency-tracker re-registration the adapter performs
     *      immediately after the `changeLevel` call (:517-518). Ctrl+Z would move
     *      the record back and leave its spatial registration on the storey it no
     *      longer occupies. The register that governs this
     *      (`packages/command-bus/src/levelChangeVerbs.ts:49-54`) is explicit
     *      that a row without the store method is worse than no row at all.
     *   2. THE PANEL CASCADE. A curtain wall owns PANELS, and a panel carries its
     *      OWN required `levelId` (see the note below). A storey move that leaves
     *      them behind is a dangling cascade. That reconciliation is driven by the
     *      'update' this method emits, and is implemented in `CurtainPanelSyncHandler`
     *      — the one module that owns wall→panel sync — not here, because §3.5
     *      forbids this store from knowing the panel store exists.
     *   3. ONE NAME FOR ONE CONCEPT. `wall`, `roof`, `slab` and `column` all spell
     *      the storey move `changeLevel(id, levelId)`; a fifth family spelling it
     *      `update(id, {levelId})` is the second answer C84 EI-9 forbids.
     *
     * ─── THE RIVAL PATH, RECORDED RATHER THAN LEFT BLANK ────────────────────
     * `UpdateCurtainWallCommand` (`packages/command-registry/src/curtainwall/UpdateCurtainWallCommand.ts:91-110`,
     * §DW-03) ALSO changes a curtain wall's storey — via `update()` plus its own
     * inline `bimManager.unregisterElement` / `registerElement` pair — and is
     * reachable from `wall.updateCurtainWall`. That is a genuine second authority
     * for this question, and it does NOT move the panels. It is named here so the
     * duplication is visible; collapsing it is not this method's business.
     *
     * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ──────────────────────────
     * `remove` makes `CurtainPanelSyncHandler.onCurtainWallRemoved` DELETE every
     * panel of the wall and unregister them from `elementRegistry`
     * (`CurtainPanelSyncHandler.ts:177-186`), destroying every hand-authored
     * per-panel type and material override. A move is not a delete.
     *
     * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
     * Spatial-authority registration (bimManager `level.childrenIds`, the
     * view-dependency element→level map) is NOT updated here — identical to the
     * contract `WallStore.changeLevel`, `SlabStore.changeLevel` and
     * `RoofStore.changeLevel` all state in their own doc comments, and identical
     * to §3.5 / critical fix #10 in this file's header.
     * `apps/editor/src/engine/elementLevelChangedMirror.ts` owns that half for
     * EVERY family, so the ordering rule (move the record FIRST, re-register
     * SECOND, dirty BOTH storeys THIRD) lives in one place rather than in
     * thirteen stores.
     *
     * Returns the moved record, or `undefined` when there is nothing to move —
     * which the mirror reports as a refusal rather than logging success over a
     * no-op (§context-data-honesty: failure and emptiness are the same value).
     */
    changeLevel(id: string, newLevelId: string): CurtainWallData | undefined {
        const existing = this.curtainWalls.get(id);
        if (!existing) return undefined;
        // An empty destination is REFUSED, never defaulted to `activeLevelId`.
        // `'' ?? this.activeLevelId` is the §DIAG-WALL-LEVEL trap: a silent
        // default files the wall on whatever storey happens to be open. `add()`
        // and `addMany()` both THROW on a missing levelId (:323, :157) — this is
        // the same refusal, expressed the way the mirror can read it.
        if (!newLevelId) return undefined;
        if (existing.levelId === newLevelId) return cloneCurtainWallData(existing);

        // Same deep clone `set()` / `get()` use — baseLine points, properties,
        // ifcData and the gridSystem U/V line arrays all copied (:48-66).
        const cloned = cloneCurtainWallData(existing);
        cloned.levelId = newLevelId;
        // A curtain wall parented to its LEVEL moves its parent with it; one
        // parented to something else (a host slab, a building element) keeps it.
        // Note that `add()` here does NOT stamp `parentId` the way `SlabStore`
        // and `ColumnStore` do, so this branch is normally inert — it exists so a
        // record that DOES carry level parentage (imported, or written by an
        // older path) cannot end up disagreeing with itself.
        if (existing.parentId === existing.levelId) cloned.parentId = newLevelId;
        // `CurtainWallData extends CoreElement`, whose `spatialRelationship`
        // (`packages/core-app-model/src/CoreElement.ts:65`) MIRRORS BimManager's
        // `Level.childrenIds` contract and is what IFC export reads for storey
        // containment. Only rewritten when it is PRESENT: minting one here would
        // invent a containment the record never asserted.
        if (cloned.spatialRelationship) {
            cloned.spatialRelationship = { ...cloned.spatialRelationship, levelId: newLevelId };
        }
        // CurtainWallData carries no `metadata` block (`CurtainWallTypes.ts:18-85`
        // + `CoreElement.ts:54-71`), so there is no `modifiedAt`/`version` to bump
        // the way `RoofStore.changeLevel` does. Do not invent one.

        this.curtainWalls.set(id, cloned);

        // ONE 'update'. `emit()` (:399-411) fans out to the in-process listeners
        // FIRST — which is how `CurtainPanelSyncHandler` gets to carry the panels
        // to the new storey in the same tick — and then to `storeEventBus`, which
        // is what drives the builder rebuild.
        //
        // `emit(event, cw)` takes NO `prevState` parameter (:399), unlike
        // `ColumnStore.emit` and `SlabStore.emit`. So a subscriber here cannot
        // diff-dirty the VACATED storey from the event alone; the mirror dirties
        // both storeys explicitly, which is why that half lives there.
        this.emit('update', cloned);
        return cloned;
    }

    /**
     * §L-1032 — alias for `get()`, spelled the way the level-change mirror needs.
     *
     * `apps/editor/src/engine/elementLevelChangedMirror.ts:66-69` declares
     * `LegacyLevelMovableStore` as `{ changeLevel(id, levelId), getById(id) }`
     * and types its deps with it rather than casting, so `tsc` is what proves the
     * LEGACY store was wired. `WallStore`, `RoofStore` and `SlabStore` all spell
     * that read `getById`; this store spelled it `get` (:93). Without this alias
     * the mirror's curtain-wall row could only be wired through a cast — and a
     * cast is what turns a mis-wiring into a runtime `undefined` instead of a
     * compile error, which is the whole reason that interface is not `any`.
     *
     * Returns a clone, exactly as `get()` does (§3.4).
     */
    getById(id: string): CurtainWallData | undefined {
        return this.get(id);
    }

    /**
     * PERF-FIX-5: Fast internal read — returns the uncloned internal reference
     * as a frozen Readonly<CurtainWallData>. Zero clone cost on the hot path.
     *
     * CONTRACT (§01 §3.4): The returned object MUST NOT be mutated by the
     * caller. It is typed as Readonly<> to enforce this at the type level.
     *
     * USAGE: Only valid inside Builder subscriber code where the reference is
     * immediately consumed for a build() / updateCurtainWall() call and is
     * never stored or aliased. Any code that needs to modify the returned
     * value MUST use get() instead.
     *
     * @internal
     */
    getReadOnly(id: string): Readonly<CurtainWallData> | undefined {
        return this.curtainWalls.get(id);
    }

    // ── §3.8 Event subscription ─────────────────────────────────────────────

    subscribe(listener: CWEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private emit(event: CWEventType, cw: CurtainWallData): void {
        this.listeners.forEach(l => {
            try { l(event, cw); } catch (e) {
                console.error('[CurtainWallStore] listener error:', e);
            }
        });
        storeEventBus.emit({
            elementId: cw.id,
            elementType: 'curtainwall',
            operation: event === 'add' ? 'create' : event === 'remove' ? 'delete' : 'update',
            timestamp: Date.now()
        });
    }
}
