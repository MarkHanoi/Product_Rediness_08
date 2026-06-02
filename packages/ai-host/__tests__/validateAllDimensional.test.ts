// L1-α-2 — aggregate dimensional validator tests.

import { describe, expect, it } from 'vitest';
import {
    validateAllDimensional,
} from '../src/workflows/apartmentLayout/dimensions/validateAllDimensional.js';
import type { RoomShape } from '../src/workflows/apartmentLayout/dimensions/validateRoomShape.js';
import type { DaylightWindowInput } from '../src/workflows/apartmentLayout/dimensions/validateRoomDaylight.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

function room(
    type: RoomType,
    rect: { x0: number; z0: number; x1: number; z1: number },
    id?: string,
): RoomShape {
    return { id: id ?? `r_${type}`, type, rect };
}

/** Build a "sound" 2-bed reference apartment that passes every gate. */
function soundApartment(): { rooms: RoomShape[]; windows: DaylightWindowInput[] } {
    const master = { x0: 0, z0: 0, x1: 4, z1: 4 };       // 16 m²
    const bedroom = { x0: 4, z0: 0, x1: 7.5, z1: 4 };    // 14 m²
    const living = { x0: 0, z0: 4, x1: 5, z1: 8 };       // 20 m²
    const kitchen = { x0: 5, z0: 4, x1: 7.5, z1: 7 };    // 7.5 m²
    const bathroom = { x0: 5, z0: 7, x1: 7.5, z1: 9 };   // 5 m²
    const corridor = { x0: 0, z0: 8, x1: 5, z1: 9.2 };   // 1.2 m wide

    const rooms: RoomShape[] = [
        room('master', master, 'm'),
        room('bedroom', bedroom, 'b'),
        room('living', living, 'l'),
        room('kitchen', kitchen, 'k'),
        room('bathroom', bathroom, 'ba'),
        room('corridor', corridor, 'c'),
    ];

    const windows: DaylightWindowInput[] = [
        // Master window on its north edge — 1.8 m × 1.5 m = 2.7 m² (≥ 1.6 m² for 16 m²)
        { a: { x: 1, z: master.z0 }, b: { x: 2.8, z: master.z0 }, widthM: 1.8, heightM: 1.5 },
        // Bedroom window on its north edge — 1.6 m × 1.5 m = 2.4 m² (≥ 1.4 for 14 m²)
        { a: { x: 4.5, z: bedroom.z0 }, b: { x: 6.1, z: bedroom.z0 }, widthM: 1.6, heightM: 1.5 },
        // Living window on its south edge — 2.5 m × 1.5 m = 3.75 m² (≥ 2 for 20 m²)
        { a: { x: 1, z: living.z1 }, b: { x: 3.5, z: living.z1 }, widthM: 2.5, heightM: 1.5 },
        // Kitchen window on its east edge — 1.5 m × 1.0 m = 1.5 m² (≥ 0.75 for 7.5 m²)
        { a: { x: kitchen.x1, z: 4.5 }, b: { x: kitchen.x1, z: 6 }, widthM: 1.5, heightM: 1.0 },
    ];
    return { rooms, windows };
}

describe('validateAllDimensional — sound apartment', () => {
    it('passes admissibility with the sound fixture', () => {
        const { rooms, windows } = soundApartment();
        const report = validateAllDimensional({ rooms, windows });
        expect(report.admissible).toBe(true);
        expect(report.hardFindings.length).toBe(0);
    });

    it('per-validator breakdown is present for every sub-validator', () => {
        const { rooms, windows } = soundApartment();
        const report = validateAllDimensional({ rooms, windows });
        expect(report.perValidator.roomShape).toBeDefined();
        expect(report.perValidator.roomHierarchy).toBeDefined();
        expect(report.perValidator.roomDaylight).toBeDefined();
        expect(report.perValidator.corridorWidth).toBeDefined();
    });
});

describe('validateAllDimensional — fault propagation', () => {
    it('windowless master propagates from G8 to combined report', () => {
        const { rooms } = soundApartment();
        // No windows array → daylight gate runs as if zero windows.
        const report = validateAllDimensional({ rooms, windows: [] });
        expect(report.admissible).toBe(false);
        expect(report.hardFindings.some((f) => f.metric === 'noWindow')).toBe(true);
    });

    it('windowless room HARD finding shows up in roomDaylight sub-report', () => {
        const { rooms } = soundApartment();
        const report = validateAllDimensional({ rooms, windows: [] });
        expect(report.perValidator.roomDaylight.admissible).toBe(false);
        // Other sub-validators are still clean.
        expect(report.perValidator.roomHierarchy.admissible).toBe(true);
        expect(report.perValidator.corridorWidth.admissible).toBe(true);
    });

    it('cramped corridor (0.70 m wide) HARD-rejects via corridorWidth', () => {
        const { rooms: sound, windows } = soundApartment();
        const broken = sound.map((r) =>
            r.id === 'c'
                ? {
                      ...r,
                      rect: { x0: 0, z0: 8, x1: 5, z1: 8.7 }, // 0.7 m wide
                  }
                : r,
        );
        const report = validateAllDimensional({ rooms: broken, windows });
        expect(report.admissible).toBe(false);
        expect(
            report.hardFindings.some((f) => f.metric === 'corridorTooNarrow'),
        ).toBe(true);
    });

    it('master smaller than bedroom triggers H1 SOFT (still admissible)', () => {
        const { rooms: sound, windows: soundWindows } = soundApartment();
        // 3.5 × 3.5 = 12.25 m² — clears master G1 floor (12 m²) but still
        // smaller than the bedroom (14 m²) → H1 SOFT only.
        const broken = sound.map((r) =>
            r.id === 'm'
                ? {
                      ...r,
                      rect: { x0: 0, z0: 0, x1: 3.5, z1: 3.5 },
                  }
                : r,
        );
        // The master shrunk → also need a fresh window matching the new edge.
        const windows = soundWindows.map((w, idx) =>
            idx === 0
                ? { ...w, a: { ...w.a, z: 0 }, b: { ...w.b, z: 0 } }
                : w,
        );
        const report = validateAllDimensional({ rooms: broken, windows });
        // Hierarchy is soft-only — admissible stays true.
        expect(report.admissible).toBe(true);
        expect(
            report.softFindings.some(
                (f) => f.metric === 'masterSmallerThanBedroom',
            ),
        ).toBe(true);
    });
});

describe('validateAllDimensional — skipDaylight (pre-window phase)', () => {
    it('skips the daylight gate when skipDaylight=true', () => {
        const { rooms } = soundApartment();
        // No windows passed + skipDaylight=true → daylight gate produces
        // a vacuous-pass result.
        const report = validateAllDimensional({
            rooms,
            skipDaylight: true,
        });
        expect(report.perValidator.roomDaylight.admissible).toBe(true);
        expect(report.perValidator.roomDaylight.hardFindings.length).toBe(0);
        expect(report.perValidator.roomDaylight.softFindings.length).toBe(0);
    });
});

describe('validateAllDimensional — combined findings shape', () => {
    it('hard + soft finding totals equal the sum across sub-validators', () => {
        const { rooms } = soundApartment();
        // Force multiple violations: no windows + master < bedroom.
        const broken = rooms.map((r) =>
            r.id === 'm'
                ? {
                      ...r,
                      rect: { x0: 0, z0: 0, x1: 3, z1: 3 },
                  }
                : r,
        );
        const report = validateAllDimensional({ rooms: broken, windows: [] });
        const subHard =
            report.perValidator.roomShape.hardFindings.length +
            report.perValidator.roomHierarchy.hardFindings.length +
            report.perValidator.roomDaylight.hardFindings.length +
            report.perValidator.corridorWidth.hardFindings.length;
        const subSoft =
            report.perValidator.roomShape.softFindings.length +
            report.perValidator.roomHierarchy.softFindings.length +
            report.perValidator.roomDaylight.softFindings.length +
            report.perValidator.corridorWidth.softFindings.length;
        expect(report.hardFindings.length).toBe(subHard);
        expect(report.softFindings.length).toBe(subSoft);
    });
});
