import type * as THREE from '@pryzm/renderer-three/three';
import { trace, type Tracer } from '@opentelemetry/api';

// §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — tracer for the root-swap notification (P8).
const ROOT_SWAP_TRACER_NAME = '@pryzm/core-app-model';
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer(ROOT_SWAP_TRACER_NAME, '0.1.0');
    return _cachedTracer;
}

/**
 * §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — observer of "this element's scene root object
 * was REPLACED by a different one".
 *
 * @param id        The element id whose root changed.
 * @param root      The NEW root Object3D (may not be scene-attached yet — builders
 *                  commonly `registerRoot()` before `scene.add()`; observers that
 *                  need the live scene graph must defer).
 * @param previous  The root that was just displaced (already detached/disposed).
 */
export type RootSwapListener = (
    id: string,
    root: THREE.Object3D,
    previous: THREE.Object3D,
) => void;

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
// Residential-building (multi-family) §4: `verticalCirculation` (lift) is a peer
// element category to `stair` — added to the routing union (additive, no behaviour
// change). See docs/03-execution/plans/RESIDENTIAL-BUILDING-IMPLEMENTATION-TRACKER.md P1.B.4.
export type StoreType = 'wall' | 'slab' | 'ceiling' | 'floor' | 'column' | 'beam' | 'stair' | 'verticalCirculation' | 'stair-landing' | 'stair-railing' | 'curtainwall' | 'curtain-panel' | 'window' | 'door' | 'level' | 'grid' | 'roof' | 'room' | 'furniture' | 'handrail' | 'plumbing' | 'opening' | 'annotation' | 'slabSystemType' | 'ceilingSystemType' | 'floorSystemType';

export class ElementRegistry {
    private static instance: ElementRegistry;
    private idToStoreMap: Map<string, StoreType> = new Map();
    private idToRootMap: Map<string, THREE.Object3D> = new Map();

    /**
     * §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — the most recent root OBJECT IDENTITY seen
     * for an id, retained across the transient `unregisterRoot()` + `registerRoot()`
     * pair that a rebuild performs.
     *
     * Builders come in two shapes: some overwrite the entry in place
     * (`WallFragmentBuilder.buildWall` → `registerRoot`), others tear down first
     * (`StairMeshBuilder.updateStair` → `removeStair()` → `unregisterRoot` →
     * `registerRoot`). Comparing against `idToRootMap` alone would see `undefined`
     * for the second shape and miss every stair/column/beam/door/roof rebuild —
     * i.e. exactly the paths this signal exists to cover. This map is cleared only
     * by a REAL removal (`unregister`) or `clear()`, never by `unregisterRoot`.
     */
    private idToLastRootMap: Map<string, THREE.Object3D> = new Map();

    /**
     * §A.1.1 — Listeners fired by unregister() and unregisterIfPresent().
     * Used by ViewDependencyTracker (A.2) to prune its _elementLevelMap when
     * an element is removed, preventing phantom dirty-view entries after undo.
     *
     * Each listener is added via onUnregister() and removed via the returned disposer.
     * Errors in listeners are caught — tracker failures must not block unregister().
     */
    private _unregisterListeners: Array<(id: string) => void> = [];

    /**
     * §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — listeners fired by {@link registerRoot}
     * when it REPLACES an element's existing root with a different Object3D.
     * See {@link onRootSwapped} for the invariant this exists to uphold.
     */
    private _rootSwapListeners: RootSwapListener[] = [];

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
        // §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — a REAL removal ends the element's
        // identity chain; a later re-create (undo→redo) is a fresh root, not a swap.
        this.idToLastRootMap.delete(id);
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
        this.idToLastRootMap.clear();
        this._lastClearedAt = Date.now();
    }

    /**
     * §C13-STALE-AFTER-CLEAR (L-713) — when the registry was last wiped wholesale,
     * or 0 if never. `clear()` is only ever called by the C13 project teardown, so
     * this is effectively "when did the last project end".
     */
    private _lastClearedAt = 0;

    /**
     * True when a wholesale clear happened at or after `timestamp`.
     *
     * Lets a subscriber tell an UNDO/REDO stale id (element removed, registry still
     * that project's) from a CROSS-PROJECT stale id (the registry was emptied under
     * it). Both look identical at the point of use — `getStoreType()` returns
     * undefined for each — and conflating them is what let 74 events from a dead
     * project be "handled" as a routine undo race.
     *
     * `>=` not `>`: `ClearProjectCommand` clears the registry FIRST and the store
     * events it triggers carry a `Date.now()` from the same millisecond.
     */
    clearedSince(timestamp: number): boolean {
        return this._lastClearedAt > 0 && this._lastClearedAt >= timestamp;
    }

    getStoreType(id: string): StoreType | undefined {
        return this.idToStoreMap.get(id);
    }

    /**
     * §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — subscribe to element ROOT SWAPS.
     *
     * INVARIANT: while an element is selected/observed by object REFERENCE, that
     * reference must follow the element's live scene root. A builder rebuild is
     * `scene.remove(old)` + `new Object3D` + `scene.add(new)`, so every reference
     * held across a rebuild is silently stale — it points at a detached, disposed
     * object. `registerRoot()` is the ONE call every builder makes on every such
     * swap (wall, slab, floor, ceiling, column, beam, stair, lift, curtain-wall,
     * door, window, roof, plumbing, furniture, lighting, …), which makes it the
     * authoritative "the object identity for this element changed" signal.
     *
     * Subscribing here — rather than to a per-type `bim-<type>-updated` event —
     * is what makes the guarantee TYPE-AGNOSTIC and, more importantly, INDEPENDENT
     * OF WHETHER AN EVENT WAS EMITTED AT ALL. Rebuild paths that swap the mesh
     * without a store write emit no `bim-*-updated` (e.g.
     * `GenerateStairGeometryCommand` calls `stairMeshBuilder.updateStair()`
     * directly after reconciling), and every reference-holder subscribed to the
     * event allowlist was left pointing at the disposed root. Same failure class as
     * L-233: an event ALLOWLIST cannot cover paths that emit no event.
     *
     * Fires ONLY on a genuine swap (an existing, DIFFERENT root is displaced) —
     * never on first registration and never on an idempotent re-register, so
     * creation batches stay silent.
     *
     * @returns A disposer — call it to remove the subscription.
     */
    onRootSwapped(cb: RootSwapListener): () => void {
        this._rootSwapListeners.push(cb);
        return () => {
            this._rootSwapListeners = this._rootSwapListeners.filter(l => l !== cb);
        };
    }

    registerRoot(id: string, root: THREE.Object3D): void {
        const previous = this.idToLastRootMap.get(id);
        this.idToRootMap.set(id, root);
        this.idToLastRootMap.set(id, root);
        if (previous === undefined || previous === root) return; // fresh / idempotent
        if (this._rootSwapListeners.length === 0) return;

        // P8 — one span per swap notification; per-element detail rides as
        // attributes so span cardinality stays bounded.
        const span = _tracer().startSpan('pryzm.element-registry.root-swap', {
            attributes: {
                'pryzm.element.id': id,
                'pryzm.element.store_type': this.idToStoreMap.get(id) ?? 'unknown',
                'pryzm.root_swap.listeners': this._rootSwapListeners.length,
            },
        });
        try {
            for (const listener of this._rootSwapListeners) {
                // A misbehaving observer must never break a builder's rebuild.
                try { listener(id, root, previous); } catch { /* non-fatal */ }
            }
        } finally {
            span.end();
        }
    }

    unregisterRoot(id: string): void {
        this.idToRootMap.delete(id);
    }

    getRoot(id: string): THREE.Object3D | undefined {
        return this.idToRootMap.get(id);
    }

    /**
     * §ISOLATE-ALL-ELEMENTS-WIRED (2026-06-26) — read-only enumeration of every
     * registered element root, paired with its authoritative {@link StoreType}.
     *
     * This is the SINGLE SOURCE OF TRUTH for "what scene roots are placed BIM
     * elements". Every Create-command / builder path registers its root here via
     * {@link registerRoot} (wall, slab, column, beam, stair, stair-railing,
     * handrail, lift/verticalCirculation, curtain-wall, door, window, roof,
     * plumbing, furniture, lighting, ceiling, floor, …). The floor-isolation
     * filter enumerates THIS map so every element type is covered BY
     * CONSTRUCTION — a newly added element type that registers a root is
     * isolated automatically, with no hardcoded type list to fall out of.
     *
     * Pure read: returns a fresh array snapshot; never mutates either map.
     * `storeType` is `undefined` for the rare root registered via registerRoot()
     * without a matching registerSemantic() (still enumerated, just untyped).
     */
    getAllRoots(): Array<{ id: string; root: THREE.Object3D; storeType: StoreType | undefined }> {
        const out: Array<{ id: string; root: THREE.Object3D; storeType: StoreType | undefined }> = [];
        for (const [id, root] of this.idToRootMap) {
            out.push({ id, root, storeType: this.idToStoreMap.get(id) });
        }
        return out;
    }
}

export const elementRegistry = ElementRegistry.getInstance();
