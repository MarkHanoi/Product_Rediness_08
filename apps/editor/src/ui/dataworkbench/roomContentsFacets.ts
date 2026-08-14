// ─── roomContentsFacets — the SLAB/COLUMN/HOSTED half of HierarchyTreePanel's
//     room contents, made honest (GR-10 · C78 §1.4/§5 · C71 §4.4 · C79 §5.2.0) ─
//
// THE DEFECT THIS CLOSES. HierarchyTreePanel paid the WALL facet on 2026-08-13
// (`boundingWallIdsOrUnknown`, the visible refusal row) but left the SAME family
// live one line below it, six times:
//   · `room.boundingSlabIds ?? []` / `room.boundingColumnIds ?? []` (×4) — a
//     room whose slab/column relationship was NEVER RECORDED counted zero slabs
//     and rendered no Slabs group, exactly like a room that was examined and
//     bounds none. The C78 §0.g standing example, at the panel whose wall arm
//     already says why that is a forgery.
//   · `doorStore.getByWallId(wid) ?? []` / `windowStore.getByWallId(wid) ?? []`
//     (×2) — DEAD DEFAULTS on methods whose contract already always answers
//     with an array (geometry-door/DoorStore.ts:157, geometry-window/
//     WindowStore.ts:132 — index-backed; an absent bucket IS the determined
//     "this wall hosts none", the gate's honest-accumulator case). The `?? []`
//     could fire only on a contract-violating store — and then it would forge
//     "no doors" out of a broken substrate. Per the d8cbcde8 precedent, the
//     dead default is REMOVED and the contract enforced loudly: failure must
//     not impersonate emptiness.
//
// NO VOCABULARY MINTED: absent fields classify via `relationshipArrayOrUnknown`
// from the shared apps/editor seam (ui/relationshipDetermination.ts), whose
// reason union is the closed C78 §8.1 set imported type-only from
// @pryzm/command-bus. This module is PURE: no window, no DOM, no store globals —
// stores arrive as parameters, which is what makes the distinction assertable
// (the roomWallScope.ts extraction argument, a0a6ed09).

import { relationshipArrayOrUnknown } from '../relationshipDetermination';

// ── Element row data (moved from HierarchyTreePanel so the builder is pure) ──

export interface RoomElement {
    id: string;
    elementType: 'wall' | 'door' | 'window' | 'slab' | 'column' | 'furniture';
    label: string;
    code?: string;
    meta?: string; // e.g. "4.2 m", "12.1 m²"
}

export interface RoomElementGroup {
    groupLabel: string; // e.g. "Walls (4)"
    icon: string;
    elements: RoomElement[];
}

// ── The two non-wall bounding facets ─────────────────────────────────────────

export type RoomFacetField = 'boundingSlabIds' | 'boundingColumnIds';

export const FACET_LABEL: Record<RoomFacetField, string> = {
    boundingSlabIds: 'Bounding slabs',
    boundingColumnIds: 'Bounding columns',
};

/** A facet whose relationship could not be read — rendered as a ⚠ row, never
 *  as an absent group (C78 §5: discovery must be able to refuse). Structurally
 *  the `undetermined` arm of the shared seam, narrowed to what this module can
 *  legitimately produce. */
export interface RoomFacetRefusal {
    readonly field: RoomFacetField;
    readonly scope: string;
    readonly reason: 'RELATIONSHIP_NOT_RECORDED';
    readonly detail: string;
}

/** The facet's ids, or `null` when the field was never recorded. `?? []`
 *  becomes this; the `null` arm forces the caller to write down what it does
 *  when the answer is unknown. */
export function facetIdsOrUnknown(
    room: { readonly [k in RoomFacetField]?: unknown } | null | undefined,
    field: RoomFacetField,
): readonly string[] | null {
    return relationshipArrayOrUnknown<string>(room?.[field]);
}

export function facetRefusal(roomId: string | undefined, field: RoomFacetField): RoomFacetRefusal {
    return {
        field,
        scope: `${FACET_LABEL[field].toLowerCase()} of room ${roomId ?? '(unidentified)'}`,
        reason: 'RELATIONSHIP_NOT_RECORDED',
        detail:
            `room.${field} is absent — the field names a relationship no producer wrote. ` +
            'Zero members was NOT determined (C78 §1.4 / C79 §5.2.0).',
    };
}

// ── Hosted elements via bounding walls ───────────────────────────────────────

/** Minimal store shape for door/window hosted lookups. */
export interface HostedByWallStore<T> {
    getByWallId(wallId: string): readonly T[];
}

/**
 * The hosted elements on `wallId`, with the store's contract ENFORCED rather
 * than defaulted away. `getByWallId` is index-backed and always answers with an
 * array — an absent bucket is the DETERMINED "this wall hosts none"
 * (DoorStore.ts §FIX-HOSTWALL-DOOR-INDEX). A non-array answer is therefore a
 * broken substrate, and this THROWS a named error instead of counting zero:
 * the `?? []` it replaces would have rendered a corrupt store as a wall with
 * no doors, which is the exact collapse the GR-10 ledger exists to end.
 */
export function hostedOnWall<T>(
    store: HostedByWallStore<T>,
    wallId: string,
    what: 'doors' | 'windows',
): readonly T[] {
    const answer = store.getByWallId(wallId);
    if (!Array.isArray(answer)) {
        throw new TypeError(
            `${what}.getByWallId(${wallId}) answered ${String(answer)} instead of an array — ` +
                'the hosted-element index is broken. Refusing to render that as ' +
                `"no ${what}" (C78 §1.4: failure must not impersonate emptiness).`,
        );
    }
    return answer;
}

// ── The count, with its exactness carried instead of forged ──────────────────

export interface RoomElementCount {
    /** The elements counted over the DETERMINED facets only. */
    readonly total: number;
    /** `false` when a bounding facet was never recorded — the true total is
     *  then "at least `total`", and a badge must say so, never print a bare
     *  number (the ScreenReaderListView precedent). */
    readonly exact: boolean;
    readonly undeterminedFields: readonly RoomFacetField[];
}

/**
 * Count the room's elements over walls + slabs + columns + hosted doors and
 * windows. `wallIds` is the ALREADY-DETERMINED bounding-wall set — the caller
 * (HierarchyTreePanel._renderRoom) refuses before ever counting when walls are
 * undetermined, so this function does not re-litigate that facet.
 */
export function countRoomElements(
    room: { readonly id?: string; readonly [k: string]: unknown },
    wallIds: readonly string[],
    doorStore: HostedByWallStore<unknown> | null | undefined,
    windowStore: HostedByWallStore<unknown> | null | undefined,
): RoomElementCount {
    const undeterminedFields: RoomFacetField[] = [];

    const slabIds = facetIdsOrUnknown(room, 'boundingSlabIds');
    if (slabIds === null) undeterminedFields.push('boundingSlabIds');
    const colIds = facetIdsOrUnknown(room, 'boundingColumnIds');
    if (colIds === null) undeterminedFields.push('boundingColumnIds');

    let hosted = 0;
    if (doorStore) for (const wid of wallIds) hosted += hostedOnWall(doorStore, wid, 'doors').length;
    if (windowStore) for (const wid of wallIds) hosted += hostedOnWall(windowStore, wid, 'windows').length;

    return {
        total: wallIds.length + (slabIds?.length ?? 0) + (colIds?.length ?? 0) + hosted,
        exact: undeterminedFields.length === 0,
        undeterminedFields,
    };
}

// ── The element groups, with refusals BESIDE the groups, never absorbed ──────

/** Minimal by-id store shape for wall/slab/column group building. */
export interface ByIdStore<T> {
    getById(id: string): T | undefined;
}

export interface RoomElementGroupsResult {
    readonly groups: RoomElementGroup[];
    /** Facets that could not be read. An empty array here is itself a
     *  DETERMINED answer: every facet was present (possibly empty). */
    readonly undetermined: readonly RoomFacetRefusal[];
}

export interface RoomElementGroupStores {
    readonly wallStore?: ByIdStore<any> | null;
    readonly slabStore?: ByIdStore<any> | null;
    readonly columnStore?: ByIdStore<any> | null;
    readonly doorStore?: HostedByWallStore<any> | null;
    readonly windowStore?: HostedByWallStore<any> | null;
    /** Wall length in metres, injected so this module stays geometry-free. */
    readonly wallLength?: (wall: any) => number;
}

/**
 * Build the per-room element groups. Pure over its inputs; the panel passes
 * the window stores and caches the RESULT (refusals included, so a cached room
 * re-renders its ⚠ rows too).
 */
export function buildRoomElementGroups(
    room: { readonly id?: string; readonly [k: string]: unknown },
    wallIds: readonly string[],
    stores: RoomElementGroupStores,
): RoomElementGroupsResult {
    const { wallStore, slabStore, columnStore, doorStore, windowStore, wallLength } = stores;
    const groups: RoomElementGroup[] = [];
    const undetermined: RoomFacetRefusal[] = [];

    // ── Walls (determination owned by the caller — see countRoomElements) ──
    if (wallStore && wallIds.length > 0) {
        const walls: RoomElement[] = wallIds
            .map((id) => wallStore.getById(id))
            .filter(Boolean)
            .map((w: any) => ({
                id: w.id,
                elementType: 'wall' as const,
                label: w.name ?? w.metadata?.name ?? 'Wall',
                code: w.ifcData?.globalId?.slice(0, 8),
                meta: w.baseLine && wallLength ? `${wallLength(w).toFixed(1)} m` : undefined,
            }));
        if (walls.length > 0) {
            groups.push({ groupLabel: `Walls (${walls.length})`, icon: '🧱', elements: walls });
        }
    }

    // ── Doors / Windows (via bounding walls; contract enforced, not defaulted) ──
    if (doorStore && wallIds.length > 0) {
        const doors: RoomElement[] = wallIds
            .flatMap((wid) => [...hostedOnWall(doorStore, wid, 'doors')])
            .map((d: any) => ({
                id: d.id,
                elementType: 'door' as const,
                label: d.doorType ?? 'Door',
                code: d.systemTypeId?.slice(0, 8),
                meta: d.width != null ? `${d.width.toFixed(2)} m` : undefined,
            }));
        if (doors.length > 0) {
            groups.push({ groupLabel: `Doors (${doors.length})`, icon: '🚪', elements: doors });
        }
    }
    if (windowStore && wallIds.length > 0) {
        const windows: RoomElement[] = wallIds
            .flatMap((wid) => [...hostedOnWall(windowStore, wid, 'windows')])
            .map((win: any) => ({
                id: win.id,
                elementType: 'window' as const,
                label: win.windowType ?? 'Window',
                code: win.systemTypeId?.slice(0, 8),
                meta: win.width != null ? `${win.width.toFixed(2)} m` : undefined,
            }));
        if (windows.length > 0) {
            groups.push({ groupLabel: `Windows (${windows.length})`, icon: '🪟', elements: windows });
        }
    }

    // ── Slabs — absent field is a REFUSAL, never a silently missing group ──
    const slabIds = facetIdsOrUnknown(room, 'boundingSlabIds');
    if (slabIds === null) {
        undetermined.push(facetRefusal(room.id as string | undefined, 'boundingSlabIds'));
    } else if (slabStore && slabIds.length > 0) {
        const slabs: RoomElement[] = slabIds
            .map((id) => slabStore.getById(id))
            .filter(Boolean)
            .map((s: any) => ({
                id: s.id,
                elementType: 'slab' as const,
                label: s.name ?? s.slabType ?? 'Slab',
                code: s.ifcData?.globalId?.slice(0, 8),
                meta: s.area != null ? `${s.area.toFixed(1)} m²` : undefined,
            }));
        if (slabs.length > 0) {
            groups.push({ groupLabel: `Slabs (${slabs.length})`, icon: '⬜', elements: slabs });
        }
    }

    // ── Columns — same discipline ──
    const colIds = facetIdsOrUnknown(room, 'boundingColumnIds');
    if (colIds === null) {
        undetermined.push(facetRefusal(room.id as string | undefined, 'boundingColumnIds'));
    } else if (columnStore && colIds.length > 0) {
        const columns: RoomElement[] = colIds
            .map((id) => columnStore.getById(id))
            .filter(Boolean)
            .map((c: any) => ({
                id: c.id,
                elementType: 'column' as const,
                label: c.name ?? c.profileType ?? 'Column',
                code: c.ifcData?.globalId?.slice(0, 8),
                meta: c.height != null ? `h: ${c.height.toFixed(2)} m` : undefined,
            }));
        if (columns.length > 0) {
            groups.push({ groupLabel: `Columns (${columns.length})`, icon: '▐', elements: columns });
        }
    }

    return { groups, undetermined };
}
