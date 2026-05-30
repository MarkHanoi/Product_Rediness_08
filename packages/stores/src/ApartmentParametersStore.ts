// ApartmentParametersStore — D-α-1 (BIM 2/3 §6).
//
// Holds the editable apartment-scope L0 parameters per apartment id. Distinct
// from the existing element stores (wall/door/room/...) which carry the
// DERIVED geometry — this store owns the user INTENT post-execute, so the
// Data Management Panel can edit it and the apartment-solver (D-α-3) can
// re-derive geometry locally without re-running the whole D-TGL pipeline.
//
// Schema source: `@pryzm/schemas/apartment` → `ApartmentParameters` (D-α-0).
// All writes validate against that schema; invalid input rejects with no
// state mutation (loud-fail-soft — returns null + warns, never throws).
//
// Mutation model:
//   • The D-α-2 commands (`apartment.updateParameter`) will dispatch via
//     applyPatch + Immer patches per the Store<T> contract.
//   • Bootstrap (initial parameter set after apartment.layout-execute)
//     bypasses applyPatch — same pattern as LayoutOptionsStore.
//
// Lives at L1 alongside the other stores. No I/O, no THREE, no DOM.

import { Store } from './Store.js';
import { ApartmentParameters } from '@pryzm/schemas/apartment';
import type { ApartmentParameters as ApartmentParametersType } from '@pryzm/schemas/apartment';

export class ApartmentParametersStore extends Store<ApartmentParametersType> {
    private _listeners = new Set<() => void>();

    constructor() { super('apartmentParameters'); }

    /**
     * Bootstrap or replace an apartment's parameter record. Schema-validates
     * the input; on failure returns false and emits a console.warn (the
     * caller decides whether to surface a toast). Returns true on success.
     *
     * §BIM-2-BOOTSTRAP: called by the apartment-layout executor after a
     * successful build, seeding the L0 record from the chosen LayoutOption
     * + the gathered shell info.
     */
    setApartment(p: ApartmentParametersType): boolean {
        const parsed = ApartmentParameters.safeParse(p);
        if (!parsed.success) {
            console.warn('[ApartmentParametersStore] rejected — schema:', parsed.error.message);
            return false;
        }
        this.state.set(parsed.data.id, Object.freeze(parsed.data));
        this._notify();
        return true;
    }

    /** Read by id. Returns undefined when not set. */
    getApartment(id: string): ApartmentParametersType | undefined {
        return this.state.get(id);
    }

    /** Every apartment record in the store. */
    list(): readonly ApartmentParametersType[] {
        return [...this.state.values()];
    }

    /** Remove an apartment record (e.g. on project close). No-op when absent. */
    remove(id: string): void {
        if (this.state.delete(id)) this._notify();
    }

    /** Clear every record. */
    clear(): void {
        if (this.state.size === 0) return;
        this.state.clear();
        this._notify();
    }

    // ── Subscription (coarse-grained, mirrors LayoutOptionsStore) ──────────

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try { l(); } catch (e) { console.warn('[ApartmentParametersStore] listener threw:', e); }
        }
    }
}

/** Process-wide singleton. */
export const apartmentParametersStore = new ApartmentParametersStore();
