/**
 * StoreRegistry — §3.2 BIM ENGINE CORE CONTRACT
 *
 * Central singleton that maps element-type strings to their live store instances.
 *
 * CONTRACT REQUIREMENTS (01-BIM-ENGINE-CORE-CONTRACT §3.2):
 *   register(type, store)        — register a store under an element type key
 *   getStoreForType(type)        — O(1) lookup by type string
 *   getStoreForElement(id)       — O(n) scan: finds the store that owns an element ID
 *   getAllStores()               — iterable over all registered store instances
 *
 * INTERFACE NOTE (§3.3 GAP):
 *   The full §3.3 ElementStore interface requires get/set/delete/has/getType/getAll.
 *   Existing stores expose a superset-but-different API (add/remove/update/getAll).
 *   Rather than modifying all 21 stores, `BimStore` is a minimal duck-type interface
 *   that all existing stores satisfy without code changes. Full §3.3 compliance is a
 *   separate Phase-B task.
 *
 * DOES NOT REPLACE:
 *   - CommandContext.stores.* — commands continue to receive stores via context injection.
 *   - ElementRegistry — still maps element IDs to type strings.
 *   StoreRegistry adds dynamic lookup on top of those direct-reference patterns.
 *
 * Usage:
 *   import { storeRegistry } from './StoreRegistry';
 *   const store = storeRegistry.getStoreForType('wall');
 *   const store = storeRegistry.getStoreForElement(elementId);
 */

/**
 * Minimal duck-type interface satisfied by all PRYZM ElementStores without
 * requiring any store to be modified.
 *
 * For `getStoreForElement()` to work, a store must expose at least one of:
 *   has(id)     — boolean presence check (preferred)
 *   getById(id) — returns the element or undefined
 *   get(id)     — returns the element or undefined
 */
export interface BimStore {
    getAll(): unknown[];
    has?: (id: string) => boolean;
    get?: (id: string) => unknown;
    getById?: (id: string) => unknown;
}

export class StoreRegistry {
    private static instance: StoreRegistry;
    private stores = new Map<string, BimStore>();

    private constructor() {}

    static getInstance(): StoreRegistry {
        if (!StoreRegistry.instance) {
            StoreRegistry.instance = new StoreRegistry();
        }
        return StoreRegistry.instance;
    }

    /**
     * Register a store under an element type key.
     * If the same type is registered twice with a different instance, the new
     * instance replaces the old one and a warning is emitted.
     */
    register(type: string, store: BimStore): void {
        if (this.stores.has(type)) {
            const existing = this.stores.get(type)!;
            if (existing !== store) {
                console.warn(`[StoreRegistry] Type '${type}' re-registered with a new instance — replacing.`);
            }
        }
        this.stores.set(type, store);
    }

    /**
     * Return the store registered for a given element type.
     * Returns undefined if the type has not been registered.
     * Complexity: O(1).
     */
    getStoreForType(type: string): BimStore | undefined {
        return this.stores.get(type);
    }

    /**
     * Find the store that owns an element with the given ID.
     * Iterates all registered stores and returns the first one that claims the ID.
     * Returns undefined if no store owns the element.
     * Complexity: O(n) over registered stores — use only when type is unknown.
     */
    getStoreForElement(id: string): BimStore | undefined {
        for (const store of this.stores.values()) {
            if (this.probeHas(store, id)) return store;
        }
        return undefined;
    }

    /**
     * All registered store instances.
     */
    getAllStores(): Iterable<BimStore> {
        return this.stores.values();
    }

    /**
     * All registered element type keys.
     */
    getRegisteredTypes(): string[] {
        return Array.from(this.stores.keys());
    }

    /**
     * Returns true if a store is registered for the given type.
     */
    isRegistered(type: string): boolean {
        return this.stores.has(type);
    }

    /**
     * Number of registered stores.
     */
    count(): number {
        return this.stores.size;
    }

    /**
     * Unregister a store by type. Used during engine teardown.
     */
    unregister(type: string): void {
        this.stores.delete(type);
    }

    /**
     * Clear all registrations. Used for full engine teardown or test isolation.
     */
    clear(): void {
        this.stores.clear();
    }

    /**
     * Duck-typed ownership probe.
     * Priority: has() → getById() → get().
     * Returns false if the store exposes none of these methods.
     */
    private probeHas(store: BimStore, id: string): boolean {
        if (typeof store.has === 'function') return store.has(id);
        if (typeof store.getById === 'function') return store.getById(id) !== undefined;
        if (typeof store.get === 'function') return store.get(id) !== undefined;
        return false;
    }
}

export const storeRegistry = StoreRegistry.getInstance();
