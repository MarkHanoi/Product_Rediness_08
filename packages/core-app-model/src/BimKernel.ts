/**
 * BimKernel — BIM data model and spatial authority.
 *
 * §02 §1.1  BimManager is the single spatial authority for levels and grids.
 * §01 §3.5  Store is data only — no builders, no geometry here.
 *
 * Phase 2 change: rendering fully delegated to LevelVisualizer and
 * BimGridRenderer. BimManager retains all DATA responsibilities and its
 * complete public API (all existing call sites unchanged).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { EditorMode } from './context/ProjectContext';
import { spatialAuthority } from './SpatialAuthority';
import { LevelVisualizer } from './LevelVisualizer';
import { BimGridRenderer } from './BimGridRenderer';
import { storeEventBus, StoreChangeEvent } from './StoreEventBus'; // TODO(TASK-08)
import { elementRegistry } from './ElementRegistry';

export interface Level {
    id: string;
    name: string;
    elevation: number;
    height: number;        // floor-to-floor height (authoritative — stored here, not only in commands)
    isVisible: boolean;    // per-level visibility
    order: number;         // display/sort order (elevation-ascending by convention)
    color?: string;        // optional per-level color override
    childrenIds: string[];
}

export interface Grid {
    id: string;
    name: string;
    /**
     * For 'orthogonal' grids, the world axis the line lives on:
     *   axis='X' → line at x=position, running along Z (vertical line in plan)
     *   axis='Y' → line at z=position, running along X (horizontal line in plan)
     * For 'linear' grids this remains the *dominant* axis (used for naming
     * and ranking) but the actual line is defined by startX/Z → endX/Z.
     */
    axis: 'X' | 'Y';
    position: number;
    extentMin: number;     // line start extent along perpendicular axis (default -100)
    extentMax: number;     // line end extent along perpendicular axis (default 100)
    isVisible: boolean;    // per-grid visibility
    color?: string;        // optional per-grid color override
    /**
     * When true the grid is PINNED — its geometry (position / startX / startZ
     * / endX / endZ / axis / mode) is locked against mutation. Visual,
     * naming and visibility updates remain allowed. See contract §40.
     */
    isPinned?: boolean;
    /**
     * Drawing mode this grid was authored with.
     *   'orthogonal' — line is axis-aligned (default; Revit-like).
     *   'linear'     — free-direction line in the XZ plane defined by
     *                  startX/Z → endX/Z (any angle).
     * If undefined, treat as 'orthogonal' for backward compatibility.
     */
    mode?: 'orthogonal' | 'linear';
    /** Linear-mode endpoints in world XZ. Only meaningful when mode='linear'. */
    startX?: number;
    startZ?: number;
    endX?: number;
    endZ?: number;
}

export class SpatialResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SpatialResolutionError';
    }
}

// ------------------------------------------------------------------
// Typed change-event system so subscribers don't rely on raw window
// CustomEvents for basic level/grid mutations.
// ------------------------------------------------------------------
type BimEventType = 'levelAdded' | 'levelUpdated' | 'levelRemoved' | 'gridAdded' | 'gridUpdated' | 'gridRemoved';
type BimEventCallback = (type: BimEventType, payload: any) => void;

export class BimManager {
    // ── Data (authoritative) ─────────────────────────────────────────────
    private levels: Map<string, Level> = new Map();
    private grids:  Map<string, Grid>  = new Map();

    // ── Injected stores (set after construction via setters) ──────────────
    private _roofStore: any = null;
    /** Injected GridStore reference — replaces `(window as any).gridStore` reads.
     *  Wired from `engineLauncher.ts` after `initBuilders()` completes.
     *  Falls back to the window global when null so boot order is safe. */
    private _gridStore: {
        get(id: string): Grid | undefined;
        add(g: any): void;
        update(id: string, updates: any): void;
        has?(id: string): boolean;
        remove(id: string): void;
    } | null = null;

    setRoofStore(store: { getAll(): any[] }): void {
        this._roofStore = store;
    }

    /** Wire the GridStore after `initBuilders()` so package-tier code never
     *  reads `(window as any).gridStore` in production. OI-044 fix. */
    setGridStore(store: {
        get(id: string): Grid | undefined;
        add(g: any): void;
        update(id: string, updates: any): void;
        has?(id: string): boolean;
        remove(id: string): void;
    }): void {
        this._gridStore = store;
    }

    // ── Rendering (delegated) ────────────────────────────────────────────
    private levelVisualizer: LevelVisualizer;
    private bimGridRenderer: BimGridRenderer;

    private _editorModeProvider: () => EditorMode;
    private subscribers: BimEventCallback[] = [];

    /** Unsubscribe handle for the StoreEventBus Grid listener (§01 §2.7). */ // TODO(TASK-08)
    private _gridBusUnsub: (() => void) | null = null;

    constructor(scene: THREE.Scene, editorModeProvider?: () => EditorMode) {
        this._editorModeProvider = editorModeProvider || (() => EditorMode.Project);

        // Renderers must be created before addLevel() so they are ready
        // when the default level is drawn.
        this.levelVisualizer = new LevelVisualizer(scene);
        this.bimGridRenderer = new BimGridRenderer(scene);

        spatialAuthority.setBimManager(this);

        // §01 §2.7 Builder Isolation: BimGridRenderer is now driven by
        // StoreEventBus. Grid commands mutate GridStore only — this listener
        // forwards Grid events to the renderer + ElementRegistry + internal
        // data map + legacy subscribers.
        this._gridBusUnsub = storeEventBus.subscribe((event) => {
            if (event.elementType === 'Grid') {
                this._handleGridStoreEvent(event);
            }
        });

        // Default level — every project starts with Ground at elevation 0.
        this.addLevel({ id: 'L0', name: 'Ground', elevation: 0, childrenIds: [] });
    }

    /**
     * §01 §2.7: StoreEventBus → Renderer pipeline for grids. // TODO(TASK-08)
     * Reads the canonical grid record from GridStore and applies it to the
     * renderer, internal data map, ElementRegistry, and legacy subscribers.
     */
    private _handleGridStoreEvent(event: StoreChangeEvent): void {
        const id = event.elementId;
        const gridStore = (this._gridStore ?? (window as any).gridStore) as
            | { get(id: string): Grid | undefined }
            | undefined;

        if (event.operation === 'delete') {
            this.grids.delete(id);
            try { this.bimGridRenderer.removeGrid(id); } catch (e) {
                console.warn('[BimManager] Grid renderer remove failed', e);
            }
            try { elementRegistry.unregister(id); } catch { /* ignore */ }
            this.emit('gridRemoved', { gridId: id });
            return;
        }

        const grid = gridStore?.get(id);
        if (!grid) return;

        // Keep BimManager's internal Map in sync so getGrids() stays correct.
        this.grids.set(grid.id, grid);

        try {
            if (event.operation === 'create') {
                this.bimGridRenderer.buildGrid(grid);
                // §02 §2 ElementRegistry: register grid for selectById,
                // Topology Layer (Phase 2), and World Model (Phase 3) lookups.
                if (!elementRegistry.getStoreType(grid.id)) {
                    try { elementRegistry.registerSemantic(grid.id, 'grid'); } catch { /* ignore re-register */ }
                }
                const root = this.bimGridRenderer.getLine(grid.id);
                if (root) elementRegistry.registerRoot(grid.id, root);
                this.emit('gridAdded', grid);
            } else {
                this.bimGridRenderer.updateGrid(grid);
                const root = this.bimGridRenderer.getLine(grid.id);
                if (root) elementRegistry.registerRoot(grid.id, root);
                this.emit('gridUpdated', grid);
            }
        } catch (e) {
            console.warn('[BimManager] Grid renderer apply failed for', grid.id, e);
        }
    }

    // ------------------------------------------------------------------
    // Subscriber API
    // ------------------------------------------------------------------

    subscribe(cb: BimEventCallback): () => void {
        this.subscribers.push(cb);
        return () => { this.subscribers = this.subscribers.filter(fn => fn !== cb); };
    }

    private emit(type: BimEventType, payload: any): void {
        this.subscribers.forEach(cb => {
            try { cb(type, payload); } catch (e) {
                console.warn('[BimManager] Subscriber error', e);
            }
        });
    }

    // ------------------------------------------------------------------
    // Spatial containment
    // ------------------------------------------------------------------

    /**
     * Atomically registers an element into a level's spatial container.
     * Enforces §02 §1.1 Spatial Authority and §02 §3.0 Active Level Authority.
     */
    registerElement(elementId: string, levelId: string): void {
        if (this._editorModeProvider() === EditorMode.Component) {
            throw new SpatialResolutionError(`Spatial Authority Violation: Cannot register elements in Component Editor mode.`);
        }
        if (!levelId) {
            throw new SpatialResolutionError(`Spatial Authority Violation: levelId is mandatory for element registration.`);
        }

        const level = this.levels.get(levelId);
        if (!level) {
            throw new SpatialResolutionError(`Target Level "${levelId}" not found in BimKernel.`);
        }

        // Exclusive Containment — remove element from any other level.
        this.levels.forEach(l => {
            if (l.id !== levelId) {
                l.childrenIds = l.childrenIds.filter(id => id !== elementId);
            }
        });

        if (!level.childrenIds.includes(elementId)) {
            level.childrenIds.push(elementId);
        }

        console.log(`[BimManager] Registered element ${elementId} to level ${levelId}`);
    }

    /**
     * §REG-MANY-P0: Batch-register N elements into a single level in one O(L + N) pass.
     *
     * Replaces N sequential `registerElement()` calls (each O(L × existing_children))
     * with a single traversal — critical for the `CREATE_CURTAIN_WALLS_ON_ALL_SLABS`
     * batch path where 231 per-wall registrations previously cost ~462 ms via rAF drain.
     *
     * Algorithm:
     *   1. Build a Set<string> of incoming IDs for O(1) membership tests.
     *   2. ONE `levels.forEach()` pass: filter all incoming IDs out of non-target levels.
     *      O(L × existing_children) vs O(N × L × existing_children) for N sequential calls.
     *   3. Set-based dedup append to target level: O(N) vs O(N × target_size) for .includes().
     *   4. ONE console.log for the whole batch vs N individual log calls.
     *
     * Exclusive-containment guarantee (§02 §1.1) is preserved — same semantic as calling
     * `registerElement()` N times, but in a single atomic pass.
     *
     * @throws SpatialResolutionError  — same conditions as registerElement().
     */
    registerMany(elementIds: readonly string[], levelId: string): void {
        if (this._editorModeProvider() === EditorMode.Component) {
            throw new SpatialResolutionError(`Spatial Authority Violation: Cannot register elements in Component Editor mode.`);
        }
        if (!levelId) {
            throw new SpatialResolutionError(`Spatial Authority Violation: levelId is mandatory for element registration.`);
        }
        if (elementIds.length === 0) return;

        const level = this.levels.get(levelId);
        if (!level) {
            throw new SpatialResolutionError(`Target Level "${levelId}" not found in BimKernel.`);
        }

        const idSet = new Set(elementIds);

        // Single pass over non-target levels: remove all incoming IDs at once.
        // O(L × existing_children) total vs O(N × L × existing_children) for N sequential calls.
        this.levels.forEach(l => {
            if (l.id !== levelId && l.childrenIds.length > 0) {
                l.childrenIds = l.childrenIds.filter(id => !idSet.has(id));
            }
        });

        // Append all incoming IDs not already present in the target level.
        // Set-based dedup: O(N) vs O(N × target_size) for sequential .includes() calls.
        const existing = new Set(level.childrenIds);
        for (const id of elementIds) {
            if (!existing.has(id)) {
                level.childrenIds.push(id);
                existing.add(id);
            }
        }

        console.log(`[BimManager] §REG-MANY-P0: registered ${elementIds.length} element(s) to level "${levelId}".`);
    }

    /** Atomically removes an element from its spatial container. */
    unregisterElement(elementId: string): void {
        this.levels.forEach(level => {
            level.childrenIds = level.childrenIds.filter(id => id !== elementId);
        });
        console.log(`[BimManager] Unregistered element ${elementId}`);
    }

    // ------------------------------------------------------------------
    // Level CRUD — data + delegated visual
    // ------------------------------------------------------------------

    addLevel(level: {
        id: string;
        name: string;
        elevation: number;
        height?: number;
        isVisible?: boolean;
        order?: number;
        color?: string;
        childrenIds?: string[];
    }): void {
        const safeLevel: Level = {
            height: 3.0,
            isVisible: true,
            order: level.elevation,
            ...level,
            childrenIds: level.childrenIds || []
        };
        this.levels.set(safeLevel.id, safeLevel);
        this.levelVisualizer.buildLevel(safeLevel);
        this.emit('levelAdded', safeLevel);
    }

    updateLevel(id: string, updates: Partial<Level>): void {
        const level = this.levels.get(id);
        if (!level) return;

        const oldElevation = level.elevation;
        const updated = { ...level, ...updates };
        this.levels.set(id, updated);

        // Delegate visual update to renderer.
        this.levelVisualizer.updateLevel(updated);

        // Spatial reconcile cascade when elevation changes (§02 §1.5).
        if (updates.elevation !== undefined && updates.elevation !== oldElevation) {
            window.dispatchEvent(new CustomEvent('spatial-authority-reconcile', { // TODO(TASK-10)
                detail: { levelId: id, delta: updates.elevation - oldElevation }
            }));
        }

        this.emit('levelUpdated', updated);
    }

    removeLevel(id: string): void {
        if (id === 'L0') {
            console.warn('[BimManager] Cannot delete the default Ground level.');
            return;
        }

        window.dispatchEvent(new CustomEvent('bim-level-removed', { detail: { levelId: id } })); // TODO(TASK-10)
        this.levels.delete(id);
        this.levelVisualizer.removeLevel(id);
        this.emit('levelRemoved', { levelId: id });
    }

    getLevels(): Level[] {
        return Array.from(this.levels.values());
    }

    getLevelById(id: string): Level | undefined {
        return this.levels.get(id);
    }

    /** Returns the level that spatially contains a given element, or undefined. */
    getLevelForElement(elementId: string): Level | undefined {
        for (const level of this.levels.values()) {
            if (level.childrenIds.includes(elementId)) return level;
        }
        return undefined;
    }

    // ------------------------------------------------------------------
    // Grid CRUD — data + delegated visual
    // ------------------------------------------------------------------

    /**
     * §01 §2.7 Builder Isolation: This is now a thin wrapper that mutates
     * GridStore. The renderer / internal Map / subscribers are updated
     * through the StoreEventBus listener installed in the constructor. // TODO(TASK-08)
     *
     * Kept for backward compatibility with legacy non-command callers
     * (BimService.addGrid, IFC import, …). Command paths should call
     * gridStore.add() directly.
     */
    addGrid(grid: {
        id: string;
        name: string;
        axis: 'X' | 'Y';
        position: number;
        extentMin?: number;
        extentMax?: number;
        isVisible?: boolean;
        color?: string;
    }): void {
        const gridStore = this._gridStore ?? (window as any).gridStore;
        if (gridStore?.add) {
            gridStore.add(grid);
            return;
        }
        // Fallback: gridStore not yet initialised — apply directly so the
        // engine bootstrap path still works.
        const safeGrid: Grid = { extentMin: -100, extentMax: 100, isVisible: true, ...grid };
        this.grids.set(safeGrid.id, safeGrid);
        this.bimGridRenderer.buildGrid(safeGrid);
        this.emit('gridAdded', safeGrid);
    }

    /**
     * Backward-compatible wrapper. Routes through GridStore so the renderer
     * and registries are updated by the StoreEventBus listener (§01 §2.7). // TODO(TASK-08)
     */
    updateGrid(id: string, updates: Partial<Omit<Grid, 'id'>>): void {
        const gridStore = this._gridStore ?? (window as any).gridStore;
        if (gridStore?.update) {
            if (!gridStore.has?.(id)) {
                console.warn(`[BimManager] updateGrid: grid "${id}" not found.`);
                return;
            }
            gridStore.update(id, updates);
            return;
        }
        const existing = this.grids.get(id);
        if (!existing) {
            console.warn(`[BimManager] updateGrid: grid "${id}" not found.`);
            return;
        }
        const updated: Grid = { ...existing, ...updates };
        this.grids.set(id, updated);
        this.bimGridRenderer.updateGrid(updated);
        this.emit('gridUpdated', updated);
    }

    /** Backward-compatible wrapper — see addGrid/updateGrid. */
    removeGrid(id: string): void {
        const gridStore = this._gridStore ?? (window as any).gridStore;
        if (gridStore?.remove) {
            gridStore.remove(id);
            return;
        }
        const grid = this.grids.get(id);
        if (!grid) return;
        this.grids.delete(id);
        this.bimGridRenderer.removeGrid(id);
        this.emit('gridRemoved', { gridId: id });
    }

    getGrids(): Grid[] {
        return Array.from(this.grids.values());
    }

    // ------------------------------------------------------------------
    // Active level — visual only (session state, not a mutation)
    // ------------------------------------------------------------------

    /**
     * Updates the 3D visual to highlight the active level and repositions
     * all grid lines to sit at that level's elevation.
     * Called by EngineBootstrap when ProjectContext.activeLevelChanged fires.
     */
    setActiveLevel(levelId: string): void {
        this.levelVisualizer.setActiveLevel(levelId);

        const level = this.levels.get(levelId);
        if (level) {
            this.bimGridRenderer.setElevation(level.elevation);
        }
    }

    // ------------------------------------------------------------------
    // Visibility & lifecycle
    // ------------------------------------------------------------------

    toggleVisibility(type: 'levels' | 'grids', visible: boolean): void {
        if (type === 'levels') {
            this.levelVisualizer.toggleVisibility(visible);
        } else {
            this.bimGridRenderer.toggleVisibility(visible);
        }
    }

    /**
     * Spatial Healing Routine (Phase 1.2)
     * Rebuilds Level.childrenIds based on element levelId references.
     */
    reconcileSpatialContainment(): void {
        console.log('[BimManager] Starting spatial reconciliation...');

        this.levels.forEach(level => { level.childrenIds = []; });

        const w = window as any;
        const stores = [
            w.wallStore,
            w.slabStore,
            w.columnStore,
            w.beamStore,
            w.stairStore,
            w.curtainWallStore,
            w.plumbingStore,
            w.furnitureStore,
            w.lightingStore,
            w.openingStore,
            this._roofStore,
            w.handrailStore,
        ];

        let processed = 0;
        let orphans   = 0;

        stores.forEach(store => {
            if (!store) return;

            (store.getAll ? store.getAll() : []).forEach((el: any) => {
                processed++;
                const level = this.levels.get(el.levelId);
                if (level) {
                    if (!level.childrenIds.includes(el.id)) level.childrenIds.push(el.id);
                    el.spatialStatus = 'Verified';
                } else {
                    el.spatialStatus = 'Orphaned';
                    orphans++;
                }
            });

            if (store.getAllDoors) {
                store.getAllDoors().forEach((d: any) => {
                    processed++;
                    const level = this.levels.get(d.levelId);
                    if (level) {
                        if (!level.childrenIds.includes(d.id)) level.childrenIds.push(d.id);
                        d.spatialStatus = 'Verified';
                    } else { d.spatialStatus = 'Orphaned'; orphans++; }
                });
            }

            if (store.getAllWindows) {
                store.getAllWindows().forEach((w: any) => {
                    processed++;
                    const level = this.levels.get(w.levelId);
                    if (level) {
                        if (!level.childrenIds.includes(w.id)) level.childrenIds.push(w.id);
                        w.spatialStatus = 'Verified';
                    } else { w.spatialStatus = 'Orphaned'; orphans++; }
                });
            }
        });

        console.log(`[BimManager] Reconciliation complete. Processed: ${processed}, Orphans: ${orphans}`);
        window.dispatchEvent(new CustomEvent('bim-model-healed')); // TODO(TASK-10)
    }

    /** Full GPU + subscription cleanup. */
    dispose(): void {
        this.levelVisualizer.dispose();
        this.bimGridRenderer.dispose();
        this.subscribers = [];
        if (this._gridBusUnsub) {
            try { this._gridBusUnsub(); } catch { /* ignore */ }
            this._gridBusUnsub = null;
        }
    }
}
