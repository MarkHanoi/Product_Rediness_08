// §L-916-FRAME-RECORD-SYNC — one gesture, one position, BOTH records.
//
// THE DEFECT THIS CLOSES (founder-reported, deploy 9e780581)
// ----------------------------------------------------------------------------
//   "the wall moves and a window (or door) hosted on the connected wall that
//    needs to join the wall that moved — the opening remains in the correct
//    place — but the window / door frame element itself moves (error)"
//
// A hosted opening is described TWICE, and both descriptions carry an `offset`
// measured along the same host baseline:
//
//   RECORD A — `WallData.openings[]`, plus the `WallStore`-internal
//              `windows`/`doors` maps that `WallStore.updateOpening()` writes
//              through. This drives the VOID (the wall fragment / CSG
//              subtraction) and it is the record that PERSISTS (register MT-06).
//   RECORD B — `windowStore` (@pryzm/geometry-window) / `doorStore`
//              (@pryzm/geometry-door). This drives the FRAME MESH:
//              `WindowBuilder` / `DoorBuilder` subscribe to THESE stores and
//              position their geometry group from `record.offset`.
//
// `WallStore.updateOpening()` writes RECORD A only. It cannot write RECORD B:
// `geometry-window` and `geometry-door` both import `@pryzm/geometry-wall`, so
// the reverse edge would be circular. That is why every command that already
// got this right — `MoveWindowCommand`, `SetWindowOffsetCommand`,
// `MoveDoorCommand`, `SetDoorOffsetCommand` — writes the second store itself,
// with a comment saying "Sync the new WindowStore so WindowBuilder repositions
// its geometry group."
//
// The three STRUCTURAL commands did not: `CascadeWallBaselineCommand`
// (§HOSTED-OPENING-HOST-MOVE), `UpdateWallBaselineCommand` and
// `UpdateWallHeightCommand` (§FIX-WALL-SHRINK-REFIT) all re-seat openings
// through `updateOpening()` alone. `WindowDependencyTracker` then observes the
// host's geometry change and calls `windowStore.touch(id)`, so the frame IS
// rebuilt — from the STALE offset, against the NEW baseline. Hole right, frame
// gone. MEASURED at Δ = 2.000 m (cascade) and 0.700 m (shrink refit) in
// `__tests__/hostedOpeningFrameRecordDesync.test.ts` §D-2/§D-3.
//
// WHY A HELPER AND NOT THREE PATCHES
//   C11 §5.4 — the fix belongs at the ONE seam every structural re-seat passes
//   through. There are exactly six `updateOpening()` call sites in this package
//   (three execute, three undo) and they now all pass through here, so a fourth
//   structural command cannot reopen the defect by forgetting a line.
//
// WHAT THIS IS NOT
//   This is NOT the MT-06 migration. MT-06's recommended fix — declare
//   `WallData.openings[]` the single authority and DELETE the rival store —
//   would have made this defect unrepresentable rather than merely corrected,
//   because there would be no second number to disagree. That migration is its
//   own lane; until it lands, the two records exist and must be written
//   together. This helper is the "written together" half, stated as such.

import { trace, type Tracer } from '@opentelemetry/api';
import type { Opening } from '@pryzm/geometry-wall';
import { windowStore } from '@pryzm/geometry-window';
import { doorStore } from '@pryzm/geometry-door';

// P8 / C10 §2 — every exported function carries ≥ 1 OTel span. Same tracer-name
// idiom as `SeatingDatumResolver.ts` / `roomBoundarySketch.ts` in this package.
function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/** The minimal WallStore surface this seam needs. Duck-typed so the helper is
 *  usable from a command that holds `ctx.stores.wallStore` without importing a
 *  concrete store class. */
export interface OpeningWritableWallStore {
    updateOpening(wallId: string, opening: Opening): unknown;
    getById(wallId: string): { openings?: readonly Opening[] } | undefined;
}

/**
 * Push RECORD A's post-write geometry into RECORD B.
 *
 * The field set is EXACTLY the one `WallStore.updateOpening()` already pushes
 * into its own internal window/door record (width, height, sillHeight, offset)
 * — mirroring it keeps the two halves of the same seam from drifting apart, and
 * invents no field of its own.
 *
 * Silent when there is no frame record: an opening may legitimately have no
 * hosted element (`elementId` undefined — a plain void), and a `windowStore`
 * miss is normal in headless/import paths. `update()` throws on a missing id,
 * hence the `has()` guard, exactly as `MoveWindowCommand` guards it.
 */
function pushToFrameRecord(applied: Opening, whereTag: string): void {
    const elementId = applied.elementId;
    if (!elementId) return;

    const patch = {
        offset:     applied.offset,
        width:      applied.width,
        height:     applied.height,
        sillHeight: applied.sillHeight,
    };

    try {
        if (applied.type === 'window') {
            if (windowStore.has(elementId)) windowStore.update(elementId, patch);
        } else if (applied.type === 'door') {
            if (doorStore.has(elementId)) doorStore.update(elementId, patch);
        }
    } catch (err) {
        // Non-fatal, and LOUD. The wall-side write already succeeded; failing the
        // whole gesture here would leave the user with a refused move whose void
        // had already been re-seated. A warning that names the desync is the
        // honest outcome — and the test suite asserts the happy path, so this
        // branch means something changed, not that the defect is tolerated.
        console.warn(
            `[${whereTag}] §L-916-FRAME-RECORD-SYNC could not sync the frame record for ` +
            `${applied.type} ${elementId} (the void moved; the frame did NOT):`, err,
        );
    }
}

/**
 * Re-seat a hosted opening through BOTH of its records, atomically within the
 * calling command.
 *
 * Order matters and is deliberate:
 *   1. `updateOpening()` first — it runs the store's own `clampToWall`, so the
 *      value that actually LANDS may differ from the value requested.
 *   2. Read the landed opening BACK from the store. Syncing the requested value
 *      instead of the landed one would re-create the very desync this closes,
 *      one clamp later.
 *   3. Push the landed geometry into the frame store.
 *
 * @returns true if the wall-side write was performed.
 */
export function reseatOpeningWithFrame(
    wallStore: OpeningWritableWallStore,
    wallId: string,
    opening: Opening,
    whereTag: string,
): boolean {
    return _tracer().startActiveSpan('pryzm.wall.reseatOpeningWithFrame', (span) => {
        try {
            span.setAttribute('pryzm.wall.id', wallId);
            span.setAttribute('pryzm.opening.id', opening.id);
            span.setAttribute('pryzm.opening.type', opening.type);
            span.setAttribute('pryzm.reseat.where', whereTag);
            span.setAttribute('pryzm.opening.requestedOffset', opening.offset);

            wallStore.updateOpening(wallId, opening);

            const landed =
                (wallStore.getById(wallId)?.openings ?? []).find(o => o.id === opening.id) ?? opening;

            // The LANDED offset, and whether the store's `clampToWall` moved it.
            // A trace that reported the REQUESTED value would be blind to exactly
            // the divergence §L-916-FRAME-RECORD-SYNC exists to close — the clamp
            // is the mechanism by which the two records came to disagree.
            span.setAttribute('pryzm.opening.landedOffset', landed.offset);
            span.setAttribute('pryzm.opening.clamped', landed.offset !== opening.offset);
            // `elementId` absent ⇒ a plain void with no frame record. That is a
            // legitimate state, not a miss, so it is recorded rather than inferred
            // from a silent span.
            span.setAttribute('pryzm.opening.hasFrameRecord', Boolean(landed.elementId));

            pushToFrameRecord(landed, whereTag);
            return true;
        } finally {
            span.end();
        }
    });
}
