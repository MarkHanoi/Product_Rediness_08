// §A.21.D25 — room-tag idempotency guard tests.
//
// These prove the property that cuts the plan-view re-projection loop: when a
// room-tag already matches its live room, the populator must NOT write (no
// store event → no re-dirty → no infinite re-projection). It must only refresh
// on genuine drift (e.g. the multi-storey HOUSE post-gen chain renaming rooms).

import { describe, it, expect } from 'vitest';
import { roomTagNeedsRefresh, desiredRoomLabel } from '../roomTagIdempotency';

describe('desiredRoomLabel', () => {
    it('prefers name, then number, then "Room"', () => {
        expect(desiredRoomLabel({ name: 'Bedroom 1', roomNumber: '101' })).toBe('Bedroom 1');
        expect(desiredRoomLabel({ name: '', roomNumber: '101' })).toBe('101');
        expect(desiredRoomLabel({ name: null, roomNumber: null })).toBe('Room');
    });
});

describe('roomTagNeedsRefresh (idempotency)', () => {
    it('returns FALSE when the tag already matches the live room (the loop-cut)', () => {
        const room = { name: 'Kitchen', roomNumber: 'K', computed: { area: 12.34 } };
        const params = { cachedLabel: 'Kitchen', roomName: 'Kitchen', area: 12.34 };
        expect(roomTagNeedsRefresh(params, room)).toBe(false);
    });

    it('is stable across repeated calls — never re-triggers once settled', () => {
        const room = { name: 'Living', computed: { area: 20 } };
        const params = { cachedLabel: 'Living', roomName: 'Living', area: 20 };
        // Repeated populate() passes must keep returning false (no churn).
        for (let i = 0; i < 10; i++) {
            expect(roomTagNeedsRefresh(params, room)).toBe(false);
        }
    });

    it('returns TRUE on label drift (room renamed after the tag was placed)', () => {
        // House post-gen chain: tag placed as "Room", then room renamed to "Master".
        const room = { name: 'Master', computed: { area: 18 } };
        const stale = { cachedLabel: 'Room', roomName: 'Room', area: 18 };
        expect(roomTagNeedsRefresh(stale, room)).toBe(true);
    });

    it('returns TRUE on area drift (boundary changed / redetect)', () => {
        const room = { name: 'Bath', computed: { area: 6.5 } };
        const stale = { cachedLabel: 'Bath', roomName: 'Bath', area: 5.0 };
        expect(roomTagNeedsRefresh(stale, room)).toBe(true);
    });

    it('does NOT treat a missing computed.area as drift', () => {
        const room = { name: 'Hall' };
        const params = { cachedLabel: 'Hall', roomName: 'Hall', area: 9 };
        expect(roomTagNeedsRefresh(params, room)).toBe(false);
    });

    it('treats null vs empty-string room name consistently (no false drift)', () => {
        const room = { name: null, roomNumber: '7', computed: { area: 3 } };
        const params = { cachedLabel: '7', roomName: null, area: 3 };
        expect(roomTagNeedsRefresh(params, room)).toBe(false);
    });
});
