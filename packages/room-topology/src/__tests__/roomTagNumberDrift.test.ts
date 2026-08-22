/**
 * §TAG-DRIFT-INCLUDES-NUMBER (L-4515..L-4516)
 *
 * Found while running down the founder's *"why in Level 1 are the graphics not
 * correct?"* (2026-08-21), whose primary cause is §MINTED-NAME-FOLLOWS-NUMBER
 * (L-4510, `RoomNumbering.ts`). This is the SECOND half: the reason a stale label
 * survived once it existed.
 *
 * `RoomTagAutoPopulator` WRITES `roomNumber` onto every room-tag — at create
 * (`RoomTagAutoPopulator.ts`, the `makeAnnotationElement` parameters) and again on
 * every refresh — but `roomTagNeedsRefresh` compared only `cachedLabel`,
 * `roomName` and `area`. `desiredRoomLabel` is `name || roomNumber || 'Room'`, so
 * a NAMED room's number never reaches the label at all: renumber it and the drift
 * test answers "already correct" forever, while the tag hands a stale number to
 * every schedule that reads one.
 *
 * That is the founder's `0 refreshed ... out of 12 live rooms` sitting next to a
 * visibly wrong plan — a correct-looking no-op that was hiding the defect.
 *
 * ⚠ SCOPE, stated so it is not overclaimed: fixing the drift test does NOT fix a
 * duplicate room NAME. Nothing in this file de-duplicates rooms — `TagReconciler`
 * dedupes TAGS keyed by room GUID, and two rooms sharing a name are two GUIDs.
 * The name defect is closed at its source in `RoomNumbering.ts`.
 *
 * Maps C84 §9 (element integrity), §A.21.D25 (the idempotent no-op that stops the
 * re-projection feedback loop) — which every test here also fences.
 */

import { describe, it, expect } from 'vitest';
import { roomTagNeedsRefresh, desiredRoomLabel } from '../roomTagIdempotency';

describe('§TAG-DRIFT-INCLUDES-NUMBER — a renumbered room is a drifted tag', () => {
    it('THE TEETH: a NAMED room whose number changed now reports drift', () => {
        // The label is identical in both — that is exactly why this went unseen.
        const room   = { name: 'Kitchen', roomNumber: '01-007', computed: { area: 12.5 } };
        const stale  = { cachedLabel: 'Kitchen', roomName: 'Kitchen', roomNumber: '01-002', area: 12.5 };
        expect(desiredRoomLabel(room)).toBe(stale.cachedLabel);   // label agrees…
        expect(roomTagNeedsRefresh(stale, room)).toBe(true);      // …and it STILL drifts
    });

    it('an UNNAMED room already drifted through the label, and still does', () => {
        // Regression fence on the path that happened to work: with no name the number
        // IS the label, so label drift already caught it. It must keep catching it.
        const room  = { roomNumber: '01-007', computed: { area: 9 } };
        const stale = { cachedLabel: '01-002', roomName: null, roomNumber: '01-002', area: 9 };
        expect(roomTagNeedsRefresh(stale, room)).toBe(true);
    });

    it('§A.21.D25 FENCE: a settled tag is still a NO-OP, run repeatedly', () => {
        // If this ever returns true, populate() emits a store event, which re-dirties
        // the view, which re-projects, which re-runs populate — forever.
        const room   = { name: 'Kitchen', roomNumber: '01-002', computed: { area: 12.5 } };
        const params = { cachedLabel: 'Kitchen', roomName: 'Kitchen', roomNumber: '01-002', area: 12.5 };
        for (let i = 0; i < 10; i++) expect(roomTagNeedsRefresh(params, room)).toBe(false);
    });

    it('a tag written BEFORE this field existed does not churn', () => {
        // Conservative by design: `params.roomNumber === undefined` means "this tag
        // stores no number", not "this tag stores a wrong number". Treating absence as
        // drift would refresh every legacy tag in the project on first view activation
        // — a mass write dressed as a correctness fix.
        const room   = { name: 'Kitchen', roomNumber: '01-007', computed: { area: 12.5 } };
        const legacy = { cachedLabel: 'Kitchen', roomName: 'Kitchen', area: 12.5 };
        expect(roomTagNeedsRefresh(legacy, room)).toBe(false);
    });

    it('null and undefined room numbers do not manufacture false drift', () => {
        const room   = { name: 'Hall', roomNumber: undefined, computed: { area: 4 } };
        const params = { cachedLabel: 'Hall', roomName: 'Hall', roomNumber: null, area: 4 };
        expect(roomTagNeedsRefresh(params, room)).toBe(false);
    });

    it('the three drift sources remain INDEPENDENT — each alone is sufficient', () => {
        const room = { name: 'Kitchen', roomNumber: '01-002', computed: { area: 12.5 } };
        const settled = { cachedLabel: 'Kitchen', roomName: 'Kitchen', roomNumber: '01-002', area: 12.5 };
        expect(roomTagNeedsRefresh(settled, room)).toBe(false);
        expect(roomTagNeedsRefresh({ ...settled, cachedLabel: 'Kitchenette' }, room)).toBe(true);
        expect(roomTagNeedsRefresh({ ...settled, area: 12.4 }, room)).toBe(true);
        expect(roomTagNeedsRefresh({ ...settled, roomNumber: '01-003' }, room)).toBe(true);
    });
});
