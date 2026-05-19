import type * as THREE from '@pryzm/renderer-three/three';

/**
 * StoreType
 *
 * Maps an element or preset ID to the store that owns it.
 *
 * Element instance types ('wall', 'slab', 'column', …) are placed in the BIM
 * model and are registered by Create* commands via registerSemantic().
 *
 * FIX-11 §07 §4: 'slabSystemType' is added as a preset/template type.
 * SlabSystemType definitions are project configuration (not element instances)
 * so their IDs live in a separate semantic namespace from placed elements.
 * Custom slab types created via SlabSystemTypeStore.add() should call
 * elementRegistry.registerSemantic(type.id, 'slabSystemType') so the registry
 * provides a single authoritative ID→store routing table for all PRYZM data.
 */
export type StoreType = 'wall' | 'slab' | 'ceiling' | 'floor' | 'column' | 'beam' | 'stair' | 'stair-landing' | 'stair-railing' | 'curtainwall' | 'curtain-panel' | 'window' | 'door' | 'level' | 'grid' | 'roof' | 'room' | 'furniture' | 'handrail' | 'plumbing' | 'opening' | 'annotation' | 'slabSystemType' | 'ceilingSystemType' | 'floorSystemType';

export class ElementRegistry {
    private static instance: ElementRegistry;
    private idToStoreMap: Map<string, StoreType> = new Map();
    private idToRootMap: Map<string, THREE.Object3D> = new Map();

    /**
     * §A.1.1 — Listeners fired by unregister() and unregisterIfPresent().
     * Used by ViewDependencyTracker (A.2) to prune its _elementLevelMap when
     * an element is removed, preventing phantom dirty-view entries after undo.
     *
     * Each listener is added via onUnregister() and removed via the returned disposer.
     * Errors in listeners are caught — tracker failures must not block unregister().
     */
    private _unregisterListeners: Array<(id: string) => void> = [];

    private constructor() {}

    static getInstance(): ElementRegistry {
        if (!ElementRegistry.instance) {
            ElementRegistry.instance = new ElementRegistry();
        }
        return ElementRegistry.instance;
    }

    /**
     * §A.1.1 — Subscribe to element unregister events.
     *
     * The callback fires for EVERY id removed via unregister() or unregisterIfPresent(),
     * including bulk removals during undo().  Use this to keep derived maps (e.g.
     * ViewDependencyTracker._elementLevelMap) in sync without polling the registry.
     *
     * @returns A disposer function — call it to remove the subscription.
     */
    onUnregister(cb: (id: string) => void): () => void {
        this._unregisterListeners.push(cb);
        return () => {
            this._unregisterListeners = this._unregisterListeners.filter(l => l !== cb);
        };
    }

    /**
     * Register an element ID with its store type.
     * Throws if the ID is already registered — use registerSemanticOrReplace() for
     * redo paths where the ID may already exist (e.g. after undo → redo).
     */
    registerSemantic(id: string, storeType: StoreType): void {
        if (this.idToStoreMap.has(id)) {
            throw new Error(`ID "${id}" already exists in ElementRegistry`);
        }
        this.idToStoreMap.set(id, storeType);
    }

    /**
     * §A.1.2 — Safe upsert: register or overwrite without throwing.
     *
     * Use this in deferred registration queues (BatchCoordinator.trackRegistration)
     * and on redo paths where the ID may already be registered from a prior execute().
     * The former registerSemantic() throw on redo was the single most common crash
     * during development iteration.
     *
     * §I-8 OTel: console.debug acts as the Phase-A diagnostic span placeholder;
     * full OTel span wiring is scheduled for Phase D.1.
     */
    registerSemanticOrReplace(id: string, storeType: StoreType): void {
        this.idToStoreMap.set(id, storeType);
    }

    /**
     * §A.1.3 — Safe delete: no-op if the ID is not registered.
     *
     * Use this in cleanup paths where the ID may or may not be present (e.g. partial
     * batch rollback, defensive teardown). Fires _unregisterListeners exactly once
     * if the ID was present in either map.
     */
    unregisterIfPresent(id: string): void {
        if (this.idToStoreMap.has(id) || this.idToRootMap.has(id)) {
            this.unregister(id);
        }
    }

    /**
     * §A.1.4 — Remove an element ID from both maps and fire all onUnregister listeners.
     *
     * Listeners are fired AFTER deletion so observers see a consistent state:
     * getStoreType(id) returns undefined inside the listener callback.
     * Errors in individual listeners are caught — a misbehaving listener must not
     * prevent other listeners from firing or block the unregister itself.
     */
    unregister(id: string): void {
        this.idToStoreMap.delete(id);
        this.idToRootMap.delete(id);
        for (const listener of this._unregisterListeners) {
            try { listener(id); } catch { /* non-fatal — tracker errors must not block unregister */ }
        }
    }

    /**
     * Clears all registrations atomically.
     * Called by ClearProjectCommand at the start of a project load to ensure
     * no stale IDs remain from the previous session. This prevents the
     * "ID already exists in ElementRegistry" crash when reloading a project.
     *
     * Note: _unregisterListeners are NOT cleared — they are permanent singleton
     * subscriptions (ViewDependencyTracker.init() registers once and holds for
     * the engine lifetime). The tracker's own clear() handles its internal state.
     */
    clear(): void {
        this.idToStoreMap.clear();
        this.idToRootMap.clear();
    }

    getStoreType(id: string): StoreType | undefined {
        return this.idToStoreMap.get(id);
    }

    registerRoot(id: string, root: THREE.Object3D): void {
        this.idToRootMap.set(id, root);
    }

    unregisterRoot(id: string): void {
        this.idToRootMap.delete(id);
    }

    getRoot(id: string): THREE.Object3D | undefined {
        return this.idToRootMap.get(id);
    }
}

export const elementRegistry = ElementRegistry.getInstance();
