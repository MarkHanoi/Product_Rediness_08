// P0.3 slice A (Family Platform) — L0 FamilyRegistry state + pure helpers.
//
// The registry SUBSTRATE: a pure-data state shape (record-of-arrays indexes)
// plus a small toolkit of pure functions that produce new state.  The L3
// FamilyRegistryStore (later slice) will wrap this in a Zustand store; the
// L7 plugin marketplace API will dispatch via commands that call these
// helpers.  Keeping the substrate pure-data means it round-trips through
// the persistence layer + the Yjs CRDT without any custom serialiser.
//
// L0-pure: Zod-only.  NO closures over mutable state; every helper takes
// state in + returns a new state out.  `Object.freeze(state)` input is
// supported (and tested).
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §6
//     (FamilyRegistry data flow — `byId` primary index + secondary
//     indexes by category / occupancy / mountClass / tag)
//   - §10 (P0.3 — substrate ships before the runtime wiring)

import { z } from 'zod';
import {
    RegisteredFamilySchema,
    FamilyCategorySchema,
    FamilyOccupancySchema,
    FamilyMountClassSchema,
    type RegisteredFamily,
    type FamilyCategory,
    type FamilyOccupancy,
    type FamilyMountClass,
} from './registered-family.js';

// ── State shape ────────────────────────────────────────────────────────────

/**
 * The registry state.  Every secondary index maps its key to an array of
 * `FamilyId` strings (NOT the full payload) — keeping the secondaries small
 * means a category-add is a constant-size mutation regardless of how heavy
 * the registered-family payload is.  Resolution is via `byId[familyId]`.
 *
 * Invariants (the helpers preserve them; ad-hoc construction does NOT):
 *   1. Every id appearing in a secondary index has a corresponding `byId`
 *      entry.
 *   2. A family's id appears in EXACTLY the secondaries its payload
 *      declares (one category, one mountClass, N tags, N archetype hints).
 *   3. No duplicate ids within a single secondary array (de-duped on
 *      `registerFamily`).
 *
 * The schema deliberately does NOT enforce invariants 1-3 — they're
 * helper-maintained contracts.  Validating the shape is enough for
 * deserialisation.
 */
// NOTE on `partialRecord`: Zod v4's `z.record(enum, value)` builds a
// COMPLETE map — every enum key must be present at parse time, which is
// not what we want for sparse secondary indexes.  `partialRecord` permits
// any subset of enum keys (matching view-template.ts §216).  For the
// non-enum keys (category / occupancy / tag) we keep `z.record` because
// the key schema is a plain string (where Zod v4 already permits subsets).
export const FamilyRegistryStateSchema = z.object({
    byId:          z.record(z.string(), RegisteredFamilySchema),
    byCategory:    z.record(FamilyCategorySchema, z.array(z.string())),
    byOccupancy:   z.record(FamilyOccupancySchema, z.array(z.string())),
    byMountClass:  z.partialRecord(FamilyMountClassSchema, z.array(z.string())),
    byTag:         z.record(z.string(), z.array(z.string())),
});
export type FamilyRegistryState = z.infer<typeof FamilyRegistryStateSchema>;

// ── Constructors ───────────────────────────────────────────────────────────

/**
 * Returns the empty registry state.  Always returns a FRESH object — callers
 * may mutate the returned value (though they shouldn't; use the helpers).
 */
export function emptyFamilyRegistryState(): FamilyRegistryState {
    return {
        byId:         {},
        byCategory:   {},
        byOccupancy:  {},
        byMountClass: {},
        byTag:        {},
    };
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Internal: append `id` to `existing[key]` (creating the array on first use)
 * unless it's already present.  Returns a NEW indexes object.  Pure.
 */
function indexAppend(
    existing: Readonly<Record<string, readonly string[]>>,
    key:      string,
    id:       string,
): Record<string, string[]> {
    const next: Record<string, string[]> = {};
    for (const k of Object.keys(existing)) next[k] = [...existing[k]!];
    const bucket = next[key] ?? [];
    if (!bucket.includes(id)) bucket.push(id);
    next[key] = bucket;
    return next;
}

/**
 * Internal: drop `id` from EVERY bucket of `existing`, deleting any bucket
 * left empty.  Returns a NEW indexes object.  Pure.
 */
function indexRemoveAll(
    existing: Readonly<Record<string, readonly string[]>>,
    id:       string,
): Record<string, string[]> {
    const next: Record<string, string[]> = {};
    for (const k of Object.keys(existing)) {
        const filtered = existing[k]!.filter(x => x !== id);
        if (filtered.length > 0) next[k] = filtered;
    }
    return next;
}

/**
 * Register a family (or REPLACE an existing one with the same id) in the
 * registry.  Returns a new state — the input `state` is not mutated, even
 * if it's `Object.freeze`'d.
 *
 * Idempotent for repeat registrations of identical payloads.  When the same
 * id is registered with a different payload, the OLD index entries are
 * stripped first (so changing a family's category / mountClass / tags
 * doesn't leave dangling secondary-index entries).
 */
export function registerFamily(
    state:  FamilyRegistryState,
    family: RegisteredFamily,
): FamilyRegistryState {
    // If the id already exists, strip its old secondary-index entries first
    // so a category / mountClass / tag change doesn't leave dangling rows.
    const stripped = state.byId[family.identity.id] !== undefined
        ? unregisterFamily(state, family.identity.id)
        : state;

    const id = family.identity.id;

    let byCategory   = indexAppend(stripped.byCategory,   family.category,   id);
    let byMountClass = indexAppend(stripped.byMountClass, family.mountClass, id);

    let byOccupancy = stripped.byOccupancy as Record<string, string[]>;
    for (const hint of family.archetypeHints) {
        byOccupancy = indexAppend(byOccupancy, hint.occupancy, id);
    }

    let byTag = stripped.byTag as Record<string, string[]>;
    for (const tag of family.tags) {
        byTag = indexAppend(byTag, tag, id);
    }

    return {
        byId: { ...stripped.byId, [id]: family },
        byCategory,
        byOccupancy,
        byMountClass,
        byTag,
    };
}

/**
 * Remove a family by id.  Returns a new state — pure.  No-op (returns the
 * same shape) if the id is unknown.
 */
export function unregisterFamily(
    state:    FamilyRegistryState,
    familyId: string,
): FamilyRegistryState {
    if (state.byId[familyId] === undefined) {
        // No-op — return the input state (callers don't need a fresh
        // object when nothing changed; this matches the typical
        // immutable-update convention used elsewhere in the codebase).
        return state;
    }
    const nextById: Record<string, RegisteredFamily> = {};
    for (const k of Object.keys(state.byId)) {
        if (k !== familyId) nextById[k] = state.byId[k]!;
    }
    return {
        byId:         nextById,
        byCategory:   indexRemoveAll(state.byCategory,   familyId),
        byOccupancy:  indexRemoveAll(state.byOccupancy,  familyId),
        byMountClass: indexRemoveAll(state.byMountClass, familyId),
        byTag:        indexRemoveAll(state.byTag,        familyId),
    };
}

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Internal: resolve `ids[]` to `RegisteredFamily[]`, skipping unknown ids
 * defensively (an unknown id would indicate a violated invariant, but we
 * never throw at query time).
 */
function resolve(
    state: FamilyRegistryState,
    ids:   readonly string[],
): RegisteredFamily[] {
    const out: RegisteredFamily[] = [];
    for (const id of ids) {
        const f = state.byId[id];
        if (f !== undefined) out.push(f);
    }
    return out;
}

/** Find by canonical id.  `undefined` if unknown. */
export function findById(
    state: FamilyRegistryState,
    id:    string,
): RegisteredFamily | undefined {
    return state.byId[id];
}

/** All families registered under `category`.  Empty array if none. */
export function findByCategory(
    state:    FamilyRegistryState,
    category: FamilyCategory,
): RegisteredFamily[] {
    return resolve(state, state.byCategory[category] ?? []);
}

/** All families with at least one `ArchetypeHint` matching `occupancy`. */
export function findByOccupancy(
    state:     FamilyRegistryState,
    occupancy: FamilyOccupancy,
): RegisteredFamily[] {
    return resolve(state, state.byOccupancy[occupancy] ?? []);
}

/** All families with the given mount class. */
export function findByMountClass(
    state:      FamilyRegistryState,
    mountClass: FamilyMountClass,
): RegisteredFamily[] {
    return resolve(state, state.byMountClass[mountClass] ?? []);
}

/** All families tagged with `tag` (free-form search index). */
export function findByTag(
    state: FamilyRegistryState,
    tag:   string,
): RegisteredFamily[] {
    return resolve(state, state.byTag[tag] ?? []);
}
