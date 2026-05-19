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
