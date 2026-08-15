/**
 * §FIX-DIAG-UNRECORDED (GR-10, the []-means-unknown drain) — the PURE
 * determinations behind houseExecDiagnostics' verdicts.
 *
 * THE DEFECT (ledger row houseExecDiagnostics.ts, ARM C, 8 sites): the
 * execution-boundary diagnostic exists to LOCATE where generated-house quality
 * is lost — and `w.openings ?? []` / `r.boundingWallIds ?? []` made it assert
 * the very collapse it hunts: a wall whose openings were never recorded
 * printed `doors=0` (⚠ NO-DOOR), a room whose bounding walls were never
 * recorded printed `neighbours=[none]` (⚠ NOT-ON-CIRCULATION) — verdicts with
 * the grammatical shape of a measurement and the information content of a
 * missing record. C75 §1.4 / C78 §1.4: "I found nothing" and "I could not
 * look" are never the same value — least of all in the instrument built to
 * tell them apart.
 *
 * (The module's `roomByWall.get(wid)` maps are NOT in this family: they are
 * built densely two lines above their reads, so a missing bucket is the
 * DETERMINED "no room recorded this wall" — restructured at the sites to say
 * so without a `?? []`.)
 */

export interface OpeningRec {
    readonly type: 'window' | 'door';
    readonly elementId?: string;
    readonly offset?: number;
    readonly width?: number;
}

export interface OpeningsDetermination {
    /** FALSE ⇒ the openings field was never recorded — counts derived from
     *  `ops` are FLOORS, not facts. */
    readonly recorded: boolean;
    readonly ops: ReadonlyArray<OpeningRec>;
}

/** Replaces `w.openings ?? []`: an absent field is UNRECORDED, never "no
 *  openings". A present-empty array stays the determined zero it is. */
export function determineWallOpenings(
    w: { readonly openings?: ReadonlyArray<OpeningRec> },
): OpeningsDetermination {
    return Array.isArray(w.openings)
        ? { recorded: true, ops: w.openings }
        : { recorded: false, ops: [] };
}

export interface BoundingWallsDetermination {
    /** FALSE ⇒ no producer wrote the room's wall linkage — every per-room
     *  door/window/adjacency verdict downstream is UNDETERMINED, not zero. */
    readonly recorded: boolean;
    readonly wallIds: readonly string[];
}

/** Replaces `r.boundingWallIds ?? []` on the detected-room read. */
export function determineRoomBoundingWalls(
    r: { readonly boundingWallIds?: readonly string[] },
): BoundingWallsDetermination {
    return Array.isArray(r.boundingWallIds)
        ? { recorded: true, wallIds: r.boundingWallIds }
        : { recorded: false, wallIds: [] };
}

/** The basis marker appended to a per-room verdict line — names WHY the count
 *  is a floor, with the reason token (§REFUSAL-IDENTITY: token, not shrug). */
export function unrecordedBasisMarker(
    roomWallsRecorded: boolean,
    anyWallOpeningsUnrecorded: boolean,
): string {
    if (!roomWallsRecorded) {
        return ' [boundingWallIds UNRECORDED (RELATIONSHIP_NOT_RECORDED) — count is a FLOOR, not a fact]';
    }
    if (anyWallOpeningsUnrecorded) {
        return ' [openings UNRECORDED (RELATIONSHIP_NOT_RECORDED) on ≥1 bounding wall — count is a FLOOR]';
    }
    return '';
}
