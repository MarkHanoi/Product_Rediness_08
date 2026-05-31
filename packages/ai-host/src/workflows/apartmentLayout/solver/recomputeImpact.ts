// D-α-3 P1 (BIM 2/3 §6 — propagation engine, first slice).
//
// `recomputeImpact` answers: when a single parameter on the L0 building graph
// changes, which OTHER parameters become STALE (must be re-evaluated by the
// downstream solver step)?
//
// P1 scope — kept tight per the workstream plan:
//   • RoomParameters.areaM2 changes  → every OTHER room in the SAME apartment
//                                      with a flexible (non-pinned) areaM2 is
//                                      considered for rebalance.
//   • ApartmentParameters.<field>    → every room in that apartment is
//                                      affected (the program-level fields all
//                                      drive room derivation).
//   • Non-areaM2 room changes (type, name, daylightRequired, …) → empty: a
//                                      rename / retype does NOT cascade to
//                                      sibling room areas.
//   • Changes targeting a DIFFERENT apartment id, an unknown room id, or an
//                                      unparseable path → empty (soft warn).
//
// Pure data — no I/O, no THREE, no DOM, no random. Lives at L2 so the L3
// stores + L4 commands can call it deterministically. Returns a *region*
// (which ids + which fields); the actual numeric rebalance is a separate
// solver step that consumes this region.
//
// References:
//   - APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md §3
//     (the L0 node vocabulary the path strings reference)
//   - APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md §6
//     (D-α-3 row: "2 wk; local-region resolver")

// ── Local type mirrors (matches @pryzm/schemas/apartment) ───────────────────
//
// The schemas package is NOT a runtime dependency of @pryzm/ai-host (and the
// constraints of this slice forbid adding one). These local mirrors are
// STRUCTURALLY identical to the Zod-inferred types in
// `packages/schemas/src/apartment/ApartmentParameters.ts`; the consumer of
// `recomputeImpact` may pass values typed against the canonical schema thanks
// to TypeScript's structural compatibility.

interface ParameterEnvelopeShape {
    readonly value: number;
    readonly min: number;
    readonly max: number;
}

export interface ApartmentParameters {
    readonly id: string;
    readonly shellAreaM2: ParameterEnvelopeShape;
    readonly bedrooms: number;
    readonly bathrooms: number;
    readonly masterEnSuite: boolean;
    readonly openPlanKitchenDining: boolean;
    readonly livingRoom: boolean;
    readonly entranceHall: boolean;
    readonly typology: string;
}

export interface RoomParameters {
    readonly id: string;
    readonly apartmentId: string;
    readonly type: string;
    readonly name: string;
    readonly areaM2: ParameterEnvelopeShape;
    readonly widthM: ParameterEnvelopeShape;
    readonly depthM: ParameterEnvelopeShape;
    readonly daylightRequired: boolean;
    readonly privacyTier: number;
    readonly acousticIsolation?: boolean;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ParameterChange<T> {
    readonly apartmentId: string;
    /** Dotted path into the parameter graph.
     *  Apartment scope: `apartment.<field>` or `<field>` (treated as apartment).
     *  Room scope:      `rooms.<roomId>.<field>[.<subfield>]`. */
    readonly path: string;
    readonly priorValue: T;
    readonly newValue: T;
}

export interface ImpactRegion {
    readonly affectedRoomIds: readonly string[];
    readonly affectedFields: readonly string[];
}

const EMPTY: ImpactRegion = Object.freeze({
    affectedRoomIds: Object.freeze([] as string[]),
    affectedFields: Object.freeze([] as string[]),
});

/** Soft-warn helper — never throws (pure module). Wrapped so tests can spy. */
function softWarn(reason: string, path: string): void {
    // eslint-disable-next-line no-console
    console.warn(`[recomputeImpact] ${reason} (path=${JSON.stringify(path)})`);
}

/** Is this numeric edit a no-op (incl. NaN→NaN)? NaN-safe equality. */
function valuesEffectivelyEqual(a: unknown, b: unknown): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
        if (Number.isNaN(a) && Number.isNaN(b)) return true;
        return a === b;
    }
    return Object.is(a, b);
}

/**
 * Compute the impact region for a parameter change.
 *
 * Determinism: result depends ONLY on (change, state). No globals, no clocks,
 * no randomness. Same inputs ⇒ identical output (incl. array order).
 */
export function recomputeImpact(
    change: ParameterChange<unknown>,
    state: {
        readonly apartment: ApartmentParameters;
        readonly rooms: readonly RoomParameters[];
    },
): ImpactRegion {
    // Guard 0 — wrong apartment.
    if (change.apartmentId !== state.apartment.id) return EMPTY;

    // Guard 1 — non-string / empty path.
    if (typeof change.path !== 'string' || change.path.length === 0) {
        softWarn('empty or non-string path', String(change.path));
        return EMPTY;
    }

    // Guard 2 — no-op (incl. NaN → NaN). Re-solving achieves nothing.
    if (valuesEffectivelyEqual(change.priorValue, change.newValue)) return EMPTY;

    const segs = change.path.split('.').filter(s => s.length > 0);
    if (segs.length === 0) {
        softWarn('path has no segments after split', change.path);
        return EMPTY;
    }

    // ── Apartment-scope path ────────────────────────────────────────────────
    // Accepted forms: `apartment.<field>...` OR `<field>...` (no `rooms.`).
    if (segs[0] !== 'rooms') {
        const apartmentField = segs[0] === 'apartment' ? segs[1] : segs[0];
        if (!apartmentField) {
            softWarn('apartment path missing field segment', change.path);
            return EMPTY;
        }
        // Every room in this apartment may need to recompute its envelopes
        // (the apartment-level program drives all of them).
        const ids = state.rooms
            .filter(r => r.apartmentId === state.apartment.id)
            .map(r => r.id);
        return Object.freeze({
            affectedRoomIds: Object.freeze(ids),
            affectedFields: Object.freeze(['areaM2', 'widthM', 'depthM']),
        });
    }

    // ── Room-scope path: `rooms.<id>.<field>[.<subfield>]` ─────────────────
    const roomId = segs[1];
    const field  = segs[2];
    if (!roomId || !field) {
        softWarn('room path missing id or field', change.path);
        return EMPTY;
    }

    const sourceRoom = state.rooms.find(r => r.id === roomId);
    if (!sourceRoom) {
        softWarn(`unknown room id "${roomId}"`, change.path);
        return EMPTY;
    }
    if (sourceRoom.apartmentId !== state.apartment.id) {
        softWarn(`room "${roomId}" is in a different apartment`, change.path);
        return EMPTY;
    }

    // P1 cascade table — only areaM2 propagates to sibling rooms today.
    if (field !== 'areaM2') return EMPTY;

    // Every OTHER room in the same apartment whose areaM2 still has slack
    // (max > value, i.e. not pinned at the upper bound) participates.
    const siblings = state.rooms.filter(r =>
        r.apartmentId === state.apartment.id &&
        r.id !== sourceRoom.id &&
        Number.isFinite(r.areaM2.value) &&
        r.areaM2.max > r.areaM2.value,
    );
    const ids = siblings.map(r => r.id);
    return Object.freeze({
        affectedRoomIds: Object.freeze(ids),
        affectedFields: Object.freeze(['areaM2']),
    });
}
