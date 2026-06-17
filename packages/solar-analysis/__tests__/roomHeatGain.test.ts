// §10.10 — per-room solar heat gain ("real heat"). Pure rollup over sun-hours × glazing × SHGC.

import { describe, expect, it } from 'vitest';
import { accumulateRoomHeatGain, DEFAULT_SHGC, type RoomGlazing } from '../src/roomHeatGain.js';
import type { SunHoursResult, SurfaceSunHours } from '../src/types.js';

const surf = (surfaceId: string, sunHours: number): SurfaceSunHours =>
    ({ surfaceId, sunHours, minPointSunHours: sunHours, maxPointSunHours: sunHours, samplePointCount: 1 });

const sunHoursResult = (surfaces: SurfaceSunHours[]): SunHoursResult => ({
    surfaces, stepHours: 0.25, sampleCount: 40,
    avgSunHours: 0, maxSunHours: 0, minSunHours: 0,
});

describe('§10.10 — accumulateRoomHeatGain', () => {
    it('relative-index tier (no irradiance) — gain = Σ sunHours·area·SHGC', () => {
        const sh = sunHoursResult([surf('w1', 6), surf('w2', 4)]);
        const rooms: RoomGlazing[] = [
            { roomId: 'living', glazing: [{ surfaceId: 'w1', glazedAreaM2: 4, shgc: 0.6 }, { surfaceId: 'w2', glazedAreaM2: 2, shgc: 0.6 }] },
        ];
        const r = accumulateRoomHeatGain(sh, rooms);
        expect(r.mode).toBe('relative-index');
        // living: 6·4·0.6 + 4·2·0.6 = 14.4 + 4.8 = 19.2
        expect(r.rooms[0]!.gainIndex).toBeCloseTo(19.2, 6);
        expect(r.rooms[0]!.absoluteKwh).toBeUndefined();
        expect(r.rooms[0]!.glazingCount).toBe(2);
        expect(r.rooms[0]!.defaultedShgcCount).toBe(0);
    });

    it('absolute-kwh tier — when an irradiance map is injected, reports kWh', () => {
        const sh = sunHoursResult([surf('w1', 6)]);
        const rooms: RoomGlazing[] = [{ roomId: 'living', glazing: [{ surfaceId: 'w1', glazedAreaM2: 4, shgc: 0.5 }] }];
        const irr = new Map<string, number>([['w1', 3.0]]);   // 3 kWh/m² over the window
        const r = accumulateRoomHeatGain(sh, rooms, { irradianceKwhPerM2BySurface: irr });
        expect(r.mode).toBe('absolute-kwh');
        // absolute: 3.0 · 4 · 0.5 = 6.0 kWh
        expect(r.rooms[0]!.absoluteKwh).toBeCloseTo(6.0, 6);
        // gainIndex still computed alongside (6·4·0.5 = 12)
        expect(r.rooms[0]!.gainIndex).toBeCloseTo(12, 6);
    });

    it('a missing SHGC defaults to DEFAULT_SHGC and is COUNTED (visible defaulting §10.10.2)', () => {
        const sh = sunHoursResult([surf('w1', 5)]);
        const rooms: RoomGlazing[] = [{ roomId: 'bed', glazing: [{ surfaceId: 'w1', glazedAreaM2: 2 }] }];
        const r = accumulateRoomHeatGain(sh, rooms);
        expect(r.rooms[0]!.gainIndex).toBeCloseTo(5 * 2 * DEFAULT_SHGC, 6);
        expect(r.rooms[0]!.defaultedShgcCount).toBe(1);
    });

    it('a glazing surface absent from the sun-hours result contributes 0', () => {
        const sh = sunHoursResult([surf('w1', 8)]);
        const rooms: RoomGlazing[] = [{ roomId: 'bed', glazing: [{ surfaceId: 'GHOST', glazedAreaM2: 3, shgc: 0.6 }] }];
        expect(accumulateRoomHeatGain(sh, rooms).rooms[0]!.gainIndex).toBe(0);
    });

    it('an interior room (no glazing) yields 0 gain but is still listed', () => {
        const sh = sunHoursResult([surf('w1', 6)]);
        const rooms: RoomGlazing[] = [{ roomId: 'corridor', glazing: [] }];
        const r = accumulateRoomHeatGain(sh, rooms);
        expect(r.rooms).toHaveLength(1);
        expect(r.rooms[0]!.gainIndex).toBe(0);
        expect(r.rooms[0]!.glazingCount).toBe(0);
    });

    it('AVG / MAX / MIN are over the per-room primary figure; ids reported', () => {
        const sh = sunHoursResult([surf('a', 6), surf('b', 2)]);
        const rooms: RoomGlazing[] = [
            { roomId: 'sunny', glazing: [{ surfaceId: 'a', glazedAreaM2: 4, shgc: 0.5 }] },   // 6·4·0.5=12
            { roomId: 'shady', glazing: [{ surfaceId: 'b', glazedAreaM2: 2, shgc: 0.5 }] },   // 2·2·0.5=2
        ];
        const r = accumulateRoomHeatGain(sh, rooms);
        expect(r.maxGain).toBeCloseTo(12, 6);
        expect(r.maxRoomId).toBe('sunny');
        expect(r.minGain).toBeCloseTo(2, 6);
        expect(r.minRoomId).toBe('shady');
        expect(r.avgGain).toBeCloseTo(7, 6);
    });

    it('deterministic — identical inputs give byte-identical output', () => {
        const sh = sunHoursResult([surf('w1', 6), surf('w2', 3)]);
        const rooms: RoomGlazing[] = [{ roomId: 'living', glazing: [{ surfaceId: 'w1', glazedAreaM2: 4 }, { surfaceId: 'w2', glazedAreaM2: 2 }] }];
        expect(accumulateRoomHeatGain(sh, rooms)).toEqual(accumulateRoomHeatGain(sh, rooms));
    });

    it('no rooms ⇒ zeroed summary, no throw', () => {
        const r = accumulateRoomHeatGain(sunHoursResult([]), []);
        expect(r.rooms).toHaveLength(0);
        expect(r.avgGain).toBe(0);
        expect(r.maxRoomId).toBeUndefined();
    });
});
