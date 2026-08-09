/**
 * wallSystemTypeCodec — §TYPE-SNAPSHOT-CODEC (C12-ELEMENT-TYPES)
 * ==============================================================
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * `ProjectSerializer` wrote a custom wall type with `structuredClone(t)` — the WHOLE
 * record, every field. `ProjectLoader` restored it by hand-listing four of them:
 *
 *     wallSystemTypeStore.add({ id, name, description, layers })
 *
 * Any field NOT in that hand-written list is written to the snapshot and silently
 * dropped on the way back in. `function` (the ISO 13567 / IfcWallTypeEnum envelope
 * function, §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION / L-285) is exactly such a field: a
 * user type declared `'exterior'` saved as exterior and reloaded as UNDECLARED, so
 * the drawing's pen weight silently reverted on every reopen. The save side was
 * never wrong; the two sides simply were not the same function.
 *
 * This is the §RBL-NO-PERSIST-DEGENERATE remedy applied to types: ONE codec, used by
 * BOTH sides, so save and load cannot drift field-by-field. A field added to
 * `WallSystemType` is either carried here or deliberately excluded here — it can no
 * longer be carried by one side and dropped by the other without this file changing.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *  - C05 §2.3 — snapshot round-trip. Additive: no `SNAPSHOT_SCHEMA_VERSION` bump is
 *    required, because `wallSystemTypes` already exists at v5 and pre-existing
 *    snapshots simply carry no `function` (undefined = "this type does not say",
 *    which is the field's real meaning — NOT a missing value needing a migration).
 *  - C13 — restore is additive into a project-scoped store; the store's own
 *    `clearCustomTypes()` (registered with `projectScopeRegistry`) owns teardown.
 *  - §CONTEXT-DATA-HONESTY — `decodeWallSystemType` returns `null` for a malformed
 *    record rather than repairing it into a plausible default. A type that cannot be
 *    read is reported, never guessed.
 */

import type { WallSystemType } from '@pryzm/geometry-wall';

/** The wire shape of a custom wall type inside a project snapshot. */
export interface WallSystemTypeSnapshot {
    id: string;
    name: string;
    description?: string;
    layers: unknown[];
    /**
     * §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — carried explicitly. `undefined` is a
     * REAL answer ("this type does not declare an envelope function"), so it is never
     * defaulted on either side of the codec.
     */
    function?: WallSystemType['function'];
}

/**
 * The argument shape `WallSystemTypeStore.add()` accepts. `totalThickness`,
 * `createdAt` and `modifiedAt` are DERIVED by the store and deliberately not carried:
 * re-importing a stale `totalThickness` alongside edited layers is how a type starts
 * reporting a thickness its own layer stack does not have.
 */
export type WallSystemTypeAddParams =
    Omit<WallSystemType, 'id' | 'createdAt' | 'modifiedAt' | 'totalThickness'> & { id?: string };

/**
 * SAVE side. Projects a live store record onto the snapshot wire shape.
 *
 * Deliberately excluded: `totalThickness` / `createdAt` / `modifiedAt` (all derived or
 * re-minted by the store on `add`). Everything a user can AUTHOR is carried.
 */
export function encodeWallSystemType(type: WallSystemType): WallSystemTypeSnapshot {
    return {
        id:          type.id,
        name:        type.name,
        // structuredClone: layers are frozen in the store; the snapshot must own mutable copies.
        layers:      structuredClone(type.layers) as unknown[],
        ...(type.description !== undefined ? { description: type.description } : {}),
        ...(type.function    !== undefined ? { function:    type.function    } : {}),
    };
}

/**
 * LOAD side. Validates and projects a snapshot record onto `store.add()` params.
 *
 * Returns `null` — and does NOT repair — when the record cannot be trusted as a wall
 * type. The caller reports the skip; it must not substitute a default (a wall
 * silently re-typed to a built-in is the §CONTEXT-DATA-HONESTY failure this codebase
 * keeps paying for: the model changes and nothing says so).
 */
export function decodeWallSystemType(raw: unknown): WallSystemTypeAddParams | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<WallSystemTypeSnapshot>;

    if (typeof r.id !== 'string' || r.id.length === 0)     return null;
    if (typeof r.name !== 'string' || r.name.length === 0) return null;
    if (!Array.isArray(r.layers))                          return null;

    return {
        id:     r.id,
        name:   r.name,
        layers: structuredClone(r.layers) as WallSystemType['layers'],
        ...(r.description !== undefined ? { description: r.description } : {}),
        // The field the hand-written restore dropped. Carried verbatim, undefined included.
        ...(r.function    !== undefined ? { function:    r.function    } : {}),
    };
}
