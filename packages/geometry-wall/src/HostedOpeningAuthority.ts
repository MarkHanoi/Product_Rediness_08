// §MT-06-ONE-AUTHORITY — RECORD A owns the geometry of a hosted opening.
//
// THE ROW THIS CLOSES
// ----------------------------------------------------------------------------
// A hosted opening (a window or a door in a wall) is described by TWO records,
// and until now BOTH of them carried the same four geometry numbers:
//
//   RECORD A — `WallData.openings[]`, plus the `WallStore`-internal
//              `windows` / `doors` maps that every wall-side mutator writes
//              through. Drives the VOID (the CSG subtraction in the wall mesh),
//              runs `wallOccupancyStore.clampToWall`, and is the record that
//              PERSISTS. 9 fields, of which 4 are geometry.
//   RECORD B — `windowStore` (@pryzm/geometry-window) / `doorStore`
//              (@pryzm/geometry-door). Drives the FRAME MESH, the snap
//              providers, the IFC exporters and the property panel. 31 / 30
//              fields, of which the SAME 4 are geometry.
//
// Two numbers for one position is a defect generator, and on 2026-08-15 it
// stopped being theoretical: the founder moved a wall, the void re-seated
// correctly and the frame walked 2.26 m away, leaving a clean hole with no
// frame in it (L-916). `§L-916-FRAME-RECORD-SYNC` (c100df8f) CORRECTED that by
// writing both records at the one wall-side seam. This module is the stronger
// half of the same story: it makes the disagreement UNREPRESENTABLE TO A
// READER, because RECORD B's geometry fields stop being a second number and
// become a DERIVED VIEW of RECORD A.
//
// WHY THIS DIRECTION, AND ONLY THIS DIRECTION
//   `geometry-window` and `geometry-door` both import `@pryzm/geometry-wall`
//   (13 prod import lines, measured). `geometry-wall` imports NEITHER of them
//   (measured: 0). That asymmetry is exactly why `WallStore.updateOpening()`
//   structurally CANNOT write RECORD B, and why the c100df8f sync helper had to
//   live one layer up in `command-registry`, which depends on all three.
//   But the FORWARD edge is legal and already load-bearing — the builders
//   import `hostedElementFrame` from here today. So the resolution can live on
//   the legal side: RECORD B READS DOWN into RECORD A. No cycle, no new edge,
//   no second write.
//
// WHAT IS *NOT* UNIFIED, DELIBERATELY
//   RECORD B is not a pure rival — it carries 27 fields RECORD A has never had
//   (frame profile, glazing grid, leaf segments, finishes, materials, system
//   type, fire rating, mark). `Opening` has no material and no finish; that
//   absence is the entire reason RECORD B exists. This module therefore claims
//   AUTHORITY OVER FOUR FIELDS ONLY — offset, width, height, sillHeight — and
//   leaves identity, type and appearance where they are. "One authority for the
//   geometry", not "delete the element store".

/** The four fields RECORD A is authoritative for. Nothing else. */
export interface HostedOpeningGeometry {
    /** Distance along the host centreline from `baseLine[0]` to the opening's
     *  LEFT EDGE. The span is `[offset, offset + width]` and the centre is
     *  `offset + width/2` — see `hostedElementFrame`, which is the function
     *  every producer and both plan-symbol builders position from. */
    offset: number;
    width: number;
    height: number;
    sillHeight: number;
}

/**
 * The minimal `WallStore` surface a derivation needs. Duck-typed so the element
 * packages depend on a four-number contract rather than on the concrete store
 * class, and so tests can hand in a stub without building a wall world.
 */
export interface HostedOpeningAuthoritySource {
    hostedOpeningGeometry(elementId: string): HostedOpeningGeometry | undefined;
}

/** True when every one of the four authoritative numbers already matches. */
export function hostedGeometryAgrees(
    record: HostedOpeningGeometry,
    authority: HostedOpeningGeometry,
): boolean {
    return record.offset     === authority.offset
        && record.width      === authority.width
        && record.height     === authority.height
        && record.sillHeight === authority.sillHeight;
}

/**
 * Return `record` as the AUTHORITY describes it.
 *
 * Three properties this function is written to have, in priority order:
 *
 *  1. **Authority wins.** When RECORD A holds an entry for `elementId`, its four
 *     numbers are the answer — whatever RECORD B has stored. This is the whole
 *     point: a stale frame offset can no longer be observed by anyone.
 *  2. **Absence is not zero.** When RECORD A has NO entry — a headless import, a
 *     record mid-creation, an element whose host wall was already deleted — the
 *     stored record is returned UNCHANGED. Deriving `0` from a missing row would
 *     turn "I do not know" into "it is at the origin", which is the
 *     context-data-honesty failure this repo has been bitten by before: a
 *     missing record must never be printed as a measurement.
 *  3. **Identity is free in the common case.** When the two already agree — the
 *     overwhelmingly normal state, since every command writes A first — the
 *     SAME frozen object is returned, so hot builder paths allocate nothing and
 *     reference-equality caches downstream keep working.
 */
export function withAuthoritativeGeometry<T extends HostedOpeningGeometry>(
    record: T,
    authority: HostedOpeningGeometry | undefined,
): T {
    // §2 — absence is not zero.
    if (!authority) return record;
    // §3 — the agreeing case allocates nothing.
    if (hostedGeometryAgrees(record, authority)) return record;
    // §1 — authority wins. Frozen to match the store's own invariant: every
    // record handed out by WindowStore/DoorStore is frozen, and a derived view
    // that was mutable would be a new way to fork the number we just unified.
    return Object.freeze({
        ...record,
        offset:     authority.offset,
        width:      authority.width,
        height:     authority.height,
        sillHeight: authority.sillHeight,
    }) as T;
}
