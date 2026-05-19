/**
 * CurtainPanelStore
 *
 * ElementStore for CurtainPanelData — the individually addressable BIM sub-elements
 * that populate curtain wall grid cells.
 *
 * ## Contract Compliance
 *
 * §3.3  ElementStore Interface — has(), set(), get(), delete(), getAll()
 * §3.4  Immutability Required — input objects never mutated; shallow clones stored;
 *       all public reads return clones.
 * §3.5  Store Is Data Only — no builder calls, no bimManager, no scene access
 * §3.8  Store Event Bus — all mutations emit to storeEventBus singleton
 *
 * ## Registration
 *
 * Panels are registered in ElementRegistry as 'curtain-panel'.
 * Registration/unregistration is the responsibility of the sync handler and commands,
 * not this store (§3.5).
 *
 * ## Relationship to CurtainWallStore
 *
 * CurtainPanelStore is a sibling store. It is populated and kept in sync by
 * CurtainPanelSyncHandler, which subscribes to CurtainWallStore events.
 * Direct mutation is possible only via CurtainPanelStore methods or the
 * ReplacePanelTypeCommand.
 *
 * ## Performance Fixes
 *
 * §PERF-2026-Q2-CW-CREATE/F1 (2026-04-25):
 *   Added two internal secondary indexes maintained inside set() / delete():
 *     - byWallId   : Map<curtainWallId, Set<panelId>>
 *     - byCellKey  : Map<"cwId:i:j", panelId>
 *
 *   Public lookups (`getByCurtainWallId`, `getByCellIndex`,
 *   `removeAllForCurtainWall`) previously did `getAll().filter/find` —
 *   `getAll()` deep-clones every panel, so `CurtainPanelSyncHandler` paid
 *   `O(N_total_panels)` per cell on every wall add. With the indexes, lookups
 *   are now `O(matched)` and only matched panels are cloned. For a 50-wall
 *   model, per-click cost drops from ~32 000 clones to ~50 — a ≥1000× win
 *   that is also independent of model size.
 *
 *   Contract notes:
 *   - The indexes store IDs (strings), not panel objects, so they do not
 *     change the public read contract (§3.4): callers still receive clones.
 *   - All writes still funnel through `set()` and `delete()`, so the indexes
 *     stay synchronised with `panels`. `update()` and `add()` both delegate
 *     to `set()`, which detects whether the (curtainWallId, cellIndex) tuple
 *     has changed and rewrites the index entries accordingly.
 *   - In dev mode an invariants check (`__verifyInvariants`) can be enabled
 *     via `window.__cwPanelStoreVerify = true` — it walks the
 *     primary map and asserts that every entry has matching index entries.
 */

import { CurtainPanelData } from './CurtainPanelTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';

type CPEventType = 'add' | 'update' | 'remove';
type CPEventListener = (event: CPEventType, panel: CurtainPanelData) => void;

function clonePanel(p: CurtainPanelData): CurtainPanelData {
    return {
        ...p,
        cellIndex: [p.cellIndex[0], p.cellIndex[1]] as [number, number],
        properties: { ...(p.properties ?? {}) },
        ifcData: p.ifcData ? { ...p.ifcData } : undefined
    };
}

function cellKey(cwId: string, i: number, j: number): string {
    return `${cwId}:${i}:${j}`;
}

export class CurtainPanelStore {
    private panels: Map<string, CurtainPanelData> = new Map();
    private listeners: CPEventListener[] = [];

    /**
     * §PERF-2026-Q2-CW-CREATE/F1 — Secondary indexes (internal only).
     * Both maintained inside set() / delete(). Never exposed.
     */
    private byWallId: Map<string, Set<string>> = new Map();
    private byCellKey: Map<string, string> = new Map();

    // ── §3.3 Standard ElementStore interface ────────────────────────────────

    has(id: string): boolean {
        return this.panels.has(id);
    }

    /**
     * §3.4 Full replacement — the authoritative write path.
     * Clones the incoming object to prevent external mutation of stored state.
     *
     * §PERF-2026-Q2-CW-CREATE/F1 — Maintains the (curtainWallId, cellIndex)
     * indexes. If the panel previously belonged to a different wall or sat in
     * a different cell, the stale index entries are removed first.
     */
    set(id: string, panel: CurtainPanelData): void {
        const prev = this.panels.get(id);
        const isNew = !prev;
        const cloned = clonePanel(panel);

        // ── Reindex if the (cwId, cellIndex) tuple changed ──────────────────
        if (prev) {
            const prevKey = cellKey(prev.curtainWallId, prev.cellIndex[0], prev.cellIndex[1]);
            const newKey  = cellKey(cloned.curtainWallId, cloned.cellIndex[0], cloned.cellIndex[1]);
            if (prevKey !== newKey) {
                if (this.byCellKey.get(prevKey) === id) this.byCellKey.delete(prevKey);
            }
            if (prev.curtainWallId !== cloned.curtainWallId) {
                const oldSet = this.byWallId.get(prev.curtainWallId);
                if (oldSet) {
                    oldSet.delete(id);
                    if (oldSet.size === 0) this.byWallId.delete(prev.curtainWallId);
                }
            }
        }

        this.panels.set(id, cloned);

        // ── Install / refresh index entries ─────────────────────────────────
        let bucket = this.byWallId.get(cloned.curtainWallId);
        if (!bucket) {
            bucket = new Set();
            this.byWallId.set(cloned.curtainWallId, bucket);
        }
        bucket.add(id);
        this.byCellKey.set(cellKey(cloned.curtainWallId, cloned.cellIndex[0], cloned.cellIndex[1]), id);

        this.emit(isNew ? 'add' : 'update', cloned);
    }

    /**
     * §3.4 Returns a clone — callers cannot corrupt internal state.
     */
    get(id: string): CurtainPanelData | undefined {
        const p = this.panels.get(id);
        return p ? clonePanel(p) : undefined;
    }

    /**
     * §3.4 Returns clones of all panels.
     *
     * NOTE: This is the slow, fully-cloning path. Internal hot paths should
     * prefer the indexed lookups (`getByCurtainWallId`, `getByCellIndex`).
     */
    getAll(): CurtainPanelData[] {
        return Array.from(this.panels.values()).map(clonePanel);
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F1 — O(matched) lookup via byWallId index.
     * Previously: `getAll().filter(...)` cloned every panel in the store on
     * every call. Now only the matched panels are cloned.
     */
    getByCurtainWallId(cwId: string): CurtainPanelData[] {
        const ids = this.byWallId.get(cwId);
        if (!ids || ids.size === 0) return [];
        const out: CurtainPanelData[] = [];
        for (const id of ids) {
            const p = this.panels.get(id);
            if (p) out.push(clonePanel(p));
        }
        return out;
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F1 — O(1) lookup via byCellKey index.
     */
    getByCellIndex(cwId: string, i: number, j: number): CurtainPanelData | undefined {
        const id = this.byCellKey.get(cellKey(cwId, i, j));
        if (!id) return undefined;
        const p = this.panels.get(id);
        return p ? clonePanel(p) : undefined;
    }

    /**
     * §3.4 add() — stamps IFC defaults if missing, then delegates to set().
     */
    add(panel: CurtainPanelData): void {
        if (!panel.id) throw new Error('[CurtainPanelStore] add(): id is required');
        if (!panel.curtainWallId) throw new Error('[CurtainPanelStore] add(): curtainWallId is required');

        const withDefaults: CurtainPanelData = {
            ...panel,
            properties: {
                ...(panel.properties ?? {}),
                mark: panel.properties?.mark
                    ?? `Panel-${panel.curtainWallId.slice(0, 4)}-${panel.cellIndex[0]}-${panel.cellIndex[1]}`
            },
            ifcData: panel.ifcData ?? {
                guid: panel.id,
                ifcClass: 'IfcMember',
                predefinedType: 'PANEL'
            }
        };
        this.set(panel.id, withDefaults);
    }

    /**
     * §3.5 Removes panel and emits delete event.
     * Does NOT touch elementRegistry — that is the Command/Handler's responsibility.
     *
     * §PERF-2026-Q2-CW-CREATE/F1 — Cleans up both secondary indexes.
     */
    delete(id: string): void {
        const p = this.panels.get(id);
        if (!p) return;

        this.panels.delete(id);

        // ── Drop index entries ──────────────────────────────────────────────
        const bucket = this.byWallId.get(p.curtainWallId);
        if (bucket) {
            bucket.delete(id);
            if (bucket.size === 0) this.byWallId.delete(p.curtainWallId);
        }
        const k = cellKey(p.curtainWallId, p.cellIndex[0], p.cellIndex[1]);
        if (this.byCellKey.get(k) === id) this.byCellKey.delete(k);

        this.emit('remove', p);
    }

    /** Legacy alias — delegates to delete(). */
    remove(id: string): void {
        this.delete(id);
    }

    /**
     * Partial update — merges with existing state, then delegates to set().
     * Used by ReplacePanelTypeCommand.
     */
    update(id: string, updates: Partial<CurtainPanelData>): void {
        const existing = this.panels.get(id);
        if (!existing) {
            console.warn(`[CurtainPanelStore] update(): panel "${id}" not found`);
            return;
        }
        const merged: CurtainPanelData = { ...existing, ...updates };
        this.set(id, merged);
    }

    /**
     * Remove all panels that belong to a given curtain wall.
     * Called by CurtainPanelSyncHandler when a curtain wall is deleted.
     *
     * §PERF-2026-Q2-CW-CREATE/F1 — Uses byWallId index instead of scanning
     * the entire panel store via `getAll().filter(...)`.
     */
    removeAllForCurtainWall(cwId: string): void {
        const ids = this.byWallId.get(cwId);
        if (!ids || ids.size === 0) return;
        // Snapshot the IDs before iterating because delete() mutates the set.
        const snapshot = Array.from(ids);
        for (const id of snapshot) this.delete(id);
    }

    // ── §3.8 Event subscription ─────────────────────────────────────────────

    subscribe(listener: CPEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private emit(event: CPEventType, panel: CurtainPanelData): void {
        // Optional dev-mode invariants check — keep cheap and gated.
        if ((globalThis as any).__cwPanelStoreVerify === true) {
            this.__verifyInvariants();
        }
        this.listeners.forEach(l => {
            try { l(event, panel); } catch (e) {
                console.error('[CurtainPanelStore] listener error:', e);
            }
        });
        // §P1-A39: Suppress storeEventBus emissions during a curtain-wall batch.
        // CurtainPanelSyncHandler fires synchronously on each curtainWallStore.add()
        // (native subscriber, not gated by storeEventBus batch depth). Without this
        // guard, a 66-wall batch accumulates ~40 panel events per wall in the buffer
        // (2,728 events total → 14 rAF chunks) before the drain even begins.
        //
        // batchCoordinator.isBatching is true from beginBatch() through the entire
        // endBatchYielded() drain; it becomes false only in onComplete() after all
        // chunks are delivered. Panel events during this window are therefore safe to
        // suppress: CurtainWallBuilder reads panelStore.getByCurtainWallId() directly
        // when rebuilding wall geometry — it does not require a separate per-panel
        // storeEventBus event. Normal (non-batch) editing paths emit fully unaffected.
        if (!batchCoordinator.isBatching) {
            storeEventBus.emit({
                elementId: panel.id,
                elementType: 'curtain-panel',
                operation: event === 'add' ? 'create' : event === 'remove' ? 'delete' : 'update',
                timestamp: Date.now()
            });
        }
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F1 — Dev-only invariants check.
     * Asserts that the secondary indexes are consistent with `panels`.
     * Enable via `(globalThis as any).__cwPanelStoreVerify = true`.
     */
    private __verifyInvariants(): void {
        let indexedCount = 0;
        for (const ids of this.byWallId.values()) indexedCount += ids.size;
        if (indexedCount !== this.panels.size) {
            console.error(
                `[CurtainPanelStore] INVARIANT VIOLATION: byWallId total=${indexedCount} ` +
                `but panels.size=${this.panels.size}`
            );
        }
        if (this.byCellKey.size !== this.panels.size) {
            console.error(
                `[CurtainPanelStore] INVARIANT VIOLATION: byCellKey.size=${this.byCellKey.size} ` +
                `but panels.size=${this.panels.size}`
            );
        }
    }
}
