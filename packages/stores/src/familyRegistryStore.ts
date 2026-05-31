// FamilyRegistryStore — P0.3 slice B (Family Platform).
//
// L3 reactive store wrapping the L0 `FamilyRegistryState` substrate shipped in
// slice A (`@pryzm/schemas/family-registry`). Mirrors the lightweight
// `ApartmentParametersStore` listener pattern used elsewhere in this package:
// a coarse-grained `subscribe(() => void)` that fires after every mutation.
//
// What this slice does:
//   • Hold an internal immutable `FamilyRegistryState`.
//   • Mutate via the pure helpers (`registerFamily`, `unregisterFamily`) so
//     state transitions are auditable and never lose secondary-index integrity.
//   • Expose typed query convenience methods that delegate to the pure helpers.
//   • Fan out coarse change notifications to subscribed listeners.
//
// What this slice deliberately does NOT do:
//   • No bulk-write API. The audit's "tight scope" doctrine restricts mutation
//     to one family at a time; bulk seeding happens at the composition root
//     (composeRuntime) by calling `register()` for each entry.
//   • No CommandBus integration. P0.3-C will add the typed command surface.
//   • No persistence wiring. The L0 substrate already round-trips through Zod,
//     so the persistence layer can serialise it without help from this class.
//
// Layer rules:
//   • L3 — wraps an L0 schema. Imports ONLY from `@pryzm/schemas` (L0). No
//     THREE, no DOM, no other @pryzm packages.
//   • P5 does NOT apply (P5 governs L0 purity; this is L3).
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §6
//     (FamilyRegistry data flow)
//   - §10 (P0.3 — substrate ships before the runtime wiring)

import {
    emptyFamilyRegistryState,
    registerFamily as registerFamilyPure,
    unregisterFamily as unregisterFamilyPure,
    findById as findByIdPure,
    findByCategory as findByCategoryPure,
    findByOccupancy as findByOccupancyPure,
    findByMountClass as findByMountClassPure,
    findByTag as findByTagPure,
    type FamilyRegistryState,
    type RegisteredFamily,
    type FamilyCategory,
    type FamilyOccupancy,
    type FamilyMountClass,
    type FamilyId,
} from '@pryzm/schemas';

/**
 * L3 reactive wrapper around the pure L0 `FamilyRegistryState` substrate.
 * One instance per runtime session (constructed by `composeRuntime`).
 * Idempotent disposal.
 */
export class FamilyRegistryStore {
    private _state: FamilyRegistryState = emptyFamilyRegistryState();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    /** Read the current registry state. The returned object is the live
     *  internal reference — callers MUST treat it as read-only and route any
     *  mutation through `register()` / `unregister()`. */
    get(): FamilyRegistryState {
        return this._state;
    }

    /**
     * Register a family (or REPLACE an existing one with the same id).
     * Delegates to the pure `registerFamily` helper from `@pryzm/schemas`.
     * Fires all subscribed listeners after the state transition. No-op after
     * `dispose()` (loud-fail-soft: warns once and returns).
     */
    register(family: RegisteredFamily): void {
        if (this._disposed) {
            console.warn('[FamilyRegistryStore] register() after dispose — ignored');
            return;
        }
        this._state = registerFamilyPure(this._state, family);
        this._notify();
    }

    /**
     * Remove a family by id. Pure-helper-backed. No-op when the id is unknown
     * (and listeners are NOT fired in that case — keeps subscriber traffic
     * proportional to real state transitions). No-op after `dispose()`.
     */
    unregister(familyId: FamilyId): void {
        if (this._disposed) {
            console.warn('[FamilyRegistryStore] unregister() after dispose — ignored');
            return;
        }
        const before = this._state;
        this._state = unregisterFamilyPure(this._state, familyId);
        if (this._state !== before) this._notify();
    }

    // ── Convenience query surface ──────────────────────────────────────────
    // Thin delegates to the pure helpers; saves callers the boilerplate of
    // passing `store.get()` into every query.

    findById(id: FamilyId): RegisteredFamily | undefined {
        return findByIdPure(this._state, id);
    }

    findByCategory(c: FamilyCategory): RegisteredFamily[] {
        return findByCategoryPure(this._state, c);
    }

    findByOccupancy(o: FamilyOccupancy): RegisteredFamily[] {
        return findByOccupancyPure(this._state, o);
    }

    findByMountClass(m: FamilyMountClass): RegisteredFamily[] {
        return findByMountClassPure(this._state, m);
    }

    findByTag(t: string): RegisteredFamily[] {
        return findByTagPure(this._state, t);
    }

    // ── Subscription / lifecycle ───────────────────────────────────────────

    /** Subscribe to coarse mutation notifications. Returns an unsubscribe
     *  disposer (idempotent). Listeners that throw are caught + warned so a
     *  rogue subscriber cannot stall the fan-out (matches the pattern in
     *  ApartmentParametersStore / LayoutOptionsStore). */
    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    /** Idempotent. Clears every listener and freezes future mutations into
     *  no-ops (with a one-line warn). Constructed-once-per-runtime semantics
     *  match the apartmentParameterPropagator. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try { l(); }
            catch (e) { console.warn('[FamilyRegistryStore] listener threw:', e); }
        }
    }
}
