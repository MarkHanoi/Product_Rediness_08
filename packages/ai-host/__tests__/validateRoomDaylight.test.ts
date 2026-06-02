// G8 — `validateRoomDaylight` tests.
//
// Closes the "windowless bedroom" failure from the single-apartment
// fix-pass spec. HARD rejects required-frontage rooms with no aperture;
// SOFT penalises rooms with aperture below the 10 % floor-area
// habitability threshold.

import { describe, expect, it } from 'vitest';
import {
    validateRoomDaylight,
    type RoomDaylightInput,
    type DaylightWindowInput,
} from '../src/workflows/apartmentLayout/dimensions/validateRoomDaylight.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

function room(
    type: RoomType,
    rect: { x0: number; z0: number; x1: number; z1: number },
    id = `r_${type}`,
): RoomDaylightInput {
    return { roomId: id, type, rect };
}

/** Horizontal window on the room's top edge (z1). */
function topWindow(
    rect: { x0: number; z0: number; x1: number; z1: number },
    widthM: number,
    heightM = 1.5,
): DaylightWindowInput {
    const cx = (rect.x0 + rect.x1) / 2;
    return {
        a: { x: cx - widthM / 2, z: rect.z1 },
        b: { x: cx + widthM / 2, z: rect.z1 },
        widthM,
        heightM,
    };
}

describe('validateRoomDaylight — habitability-required rooms', () => {
    it('HARD-rejects a windowless master bedroom', () => {
        const r = room('master', { x0: 0, z0: 0, x1: 4, z1: 4 });
        const v = validateRoomDaylight([r], []);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.length).toBe(1);
        expect(v.hardFindings[0]?.metric).toBe('noWindow');
        expect(v.hardFindings[0]?.roomId).toBe('r_master');
    });

    it('HARD-rejects a windowless secondary bedroom', () => {
        const r = room('bedroom', { x0: 0, z0: 0, x1: 3, z1: 4 });
        const v = validateRoomDaylight([r], []);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings[0]?.metric).toBe('noWindow');
    });

    it('HARD-rejects a windowless living room', () => {
        const r = room('living', { x0: 0, z0: 0, x1: 5, z1: 4 });
        const v = validateRoomDaylight([r], []);
        expect(v.admissible).toBe(false);
    });

    it('HARD-rejects a windowless kitchen', () => {
        const r = room('kitchen', { x0: 0, z0: 0, x1: 3, z1: 2.5 });
        const v = validateRoomDaylight([r], []);
        expect(v.admissible).toBe(false);
    });

    it('accepts a master with a large enough window', () => {
        const rect = { x0: 0, z0: 0, x1: 4, z1: 4 }; // 16 m²
        // Need aperture ≥ 1.6 m². Window 1.5m wide × 1.5m high = 2.25 m².
        const win = topWindow(rect, 1.5, 1.5);
        const v = validateRoomDaylight([room('master', rect)], [win]);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
        expect(v.softFindings.length).toBe(0);
    });

    it('SOFT-flags a habitable room with aperture < 10 % floor area', () => {
        const rect = { x0: 0, z0: 0, x1: 5, z1: 4 }; // 20 m² floor → needs ≥ 2 m² aperture
        // 0.5 m × 1.0 m = 0.5 m² aperture — way below.
        const win = topWindow(rect, 0.5, 1.0);
        const v = validateRoomDaylight([room('living', rect)], [win]);
        expect(v.admissible).toBe(true); // soft only
        const soft = v.softFindings.find((f) => f.metric === 'apertureBelowMinimum');
        expect(soft).toBeDefined();
        expect(soft?.delta).toBeGreaterThan(0);
        expect(soft?.delta).toBeLessThanOrEqual(1);
    });

    it('does NOT flag when aperture meets the 10 % threshold exactly', () => {
        const rect = { x0: 0, z0: 0, x1: 5, z1: 4 }; // 20 m² → needs ≥ 2 m²
        const win = topWindow(rect, 2.0, 1.0); // 2 m × 1 m = 2 m² (exactly 10 %)
        const v = validateRoomDaylight([room('living', rect)], [win]);
        expect(v.softFindings.find((f) => f.metric === 'apertureBelowMinimum'))
            .toBeUndefined();
    });
});

describe('validateRoomDaylight — preferred-frontage rooms', () => {
    it('SOFT-flags a windowless study', () => {
        const r = room('study', { x0: 0, z0: 0, x1: 3, z1: 3 });
        const v = validateRoomDaylight([r], []);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
        const finding = v.softFindings.find((f) => f.metric === 'noWindowPreferred');
        expect(finding).toBeDefined();
        expect(finding?.delta).toBeGreaterThan(0);
    });

    it('SOFT-flags a windowless dining', () => {
        const r = room('dining', { x0: 0, z0: 0, x1: 3, z1: 3 });
        const v = validateRoomDaylight([r], []);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.find((f) => f.metric === 'noWindowPreferred'))
            .toBeDefined();
    });

    it('accepts a study WITH a window (no soft finding for the aperture-min)', () => {
        const rect = { x0: 0, z0: 0, x1: 3, z1: 3 };
        const win = topWindow(rect, 1.0, 1.2);
        const v = validateRoomDaylight([room('study', rect)], [win]);
        expect(v.softFindings.length).toBe(0);
    });
});

describe('validateRoomDaylight — service + circulation rooms', () => {
    it('accepts a windowless bathroom', () => {
        const r = room('bathroom', { x0: 0, z0: 0, x1: 2, z1: 2 });
        const v = validateRoomDaylight([r], []);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
        expect(v.hardFindings.length).toBe(0);
    });

    it('accepts a windowless wc', () => {
        const v = validateRoomDaylight([room('wc', { x0: 0, z0: 0, x1: 1.5, z1: 1.5 })], []);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
    });

    it('accepts a windowless corridor', () => {
        const v = validateRoomDaylight([room('corridor', { x0: 0, z0: 0, x1: 1, z1: 4 })], []);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
    });

    it('accepts a windowless hall', () => {
        const v = validateRoomDaylight([room('hall', { x0: 0, z0: 0, x1: 2, z1: 2 })], []);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
    });

    it('accepts a windowless utility', () => {
        const v = validateRoomDaylight([room('utility', { x0: 0, z0: 0, x1: 1.5, z1: 2 })], []);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
    });
});

describe('validateRoomDaylight — window-on-room geometry', () => {
    it('counts apertures only when the window sits on the room edge', () => {
        const rect = { x0: 0, z0: 0, x1: 4, z1: 4 };
        // Window 5 m away — NOT on the room's edge.
        const farWindow: DaylightWindowInput = {
            a: { x: 10, z: 10 },
            b: { x: 11.5, z: 10 },
            widthM: 1.5,
            heightM: 1.5,
        };
        const v = validateRoomDaylight([room('master', rect)], [farWindow]);
        // Window doesn't reach the master → still windowless → HARD reject.
        expect(v.admissible).toBe(false);
    });

    it('aggregates aperture across multiple windows on the same room', () => {
        const rect = { x0: 0, z0: 0, x1: 5, z1: 4 }; // 20 m² floor → needs ≥ 2 m²
        const w1 = topWindow(rect, 0.6, 1.0); // 0.6 m²
        // Second window on the right edge.
        const w2: DaylightWindowInput = {
            a: { x: rect.x1, z: rect.z0 + 0.5 },
            b: { x: rect.x1, z: rect.z0 + 2.5 },
            widthM: 2.0,
            heightM: 0.8,
        }; // 1.6 m²
        const v = validateRoomDaylight([room('living', rect)], [w1, w2]);
        // 0.6 + 1.6 = 2.2 m² ≥ 2 m² → no aperture finding.
        expect(v.softFindings.find((f) => f.metric === 'apertureBelowMinimum'))
            .toBeUndefined();
    });

    it('a partial-overlap window on the edge counts only the overlap', () => {
        const rect = { x0: 0, z0: 0, x1: 4, z1: 4 };
        // Window 0..6 m wide, room 0..4 — overlap is 4 m on the top edge.
        const win: DaylightWindowInput = {
            a: { x: 0, z: rect.z1 },
            b: { x: 6, z: rect.z1 },
            widthM: 6,
            heightM: 1.0,
        };
        // Overlap = 4 m, aperture = 4 m², floor = 16 m² → 25 %, well above 10 %.
        const v = validateRoomDaylight([room('master', rect)], [win]);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
    });
});

describe('validateRoomDaylight — result shape', () => {
    it('returns admissible: true when only soft findings', () => {
        const rect = { x0: 0, z0: 0, x1: 3, z1: 3 };
        const v = validateRoomDaylight([room('study', rect)], []);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });

    it('returns admissible: false when ANY hard finding', () => {
        const v = validateRoomDaylight(
            [
                room('master', { x0: 0, z0: 0, x1: 3, z1: 3 }),
                room('study', { x0: 5, z0: 0, x1: 8, z1: 3 }),
            ],
            [],
        );
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.length).toBe(1); // master
        expect(v.softFindings.length).toBe(1); // study
    });

    it('every finding has metric + reason + roomId + delta', () => {
        const v = validateRoomDaylight(
            [room('master', { x0: 0, z0: 0, x1: 3, z1: 3 })],
            [],
        );
        for (const f of [...v.hardFindings, ...v.softFindings]) {
            expect(f.metric.length).toBeGreaterThan(0);
            expect(f.reason.length).toBeGreaterThan(0);
            expect(f.roomId.length).toBeGreaterThan(0);
            expect(f.delta).toBeGreaterThanOrEqual(0);
        }
    });
});
