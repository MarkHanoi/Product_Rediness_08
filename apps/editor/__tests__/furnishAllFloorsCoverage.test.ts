// §FIX-FURNISH-ALL-FLOORS-COVERAGE (L-101) — the multi-floor / multi-apartment
// furnish fan-out must enumerate EVERY level and EVERY apartment/room on each,
// be robust to a per-unit failure (one room/level throwing must NOT abort the
// rest), and emit a per-unit coverage report (furnished / skipped + reason).
//
// These tests pin the pure driver (furnishAllFloorsDriver) that
// triggerFurnishAllFloors delegates to — so the enumeration + robustness +
// coverage roll-up are verified without the heavy runtime/store wiring.

import { describe, expect, it } from 'vitest';
import {
    driveFurnishAllFloors,
    summariseFurnishCoverage,
    type FurnishLevelCoverage,
} from '../src/ui/furnish-layout/furnishAllFloorsDriver.js';

/** A fake per-level furnish result — N apartments × rooms per apartment. */
function coverageFor(
    levelId: string, apartments: number, roomsPerApt: number,
): FurnishLevelCoverage {
    const rooms = apartments * roomsPerApt;
    return {
        levelId,
        placedCount: rooms * 4,      // ~4 items/room
        roomCount: rooms,
        roomsFurnished: rooms,
        roomsSkipped: 0,
        skipped: [],
        timedOut: false,
    };
}

describe('driveFurnishAllFloors — every floor × every apartment', () => {
    it('furnishes EVERY level and every apartment/room on each', async () => {
        const levels = ['L0', 'L1', 'L2'];
        const APTS = 2, ROOMS = 3;              // 2 apartments × 3 rooms per floor
        const visited: string[] = [];
        const coverage = await driveFurnishAllFloors(levels, async (levelId) => {
            visited.push(levelId);
            return coverageFor(levelId, APTS, ROOMS);
        });

        // Every level was visited exactly once, in order.
        expect(visited).toEqual(levels);
        expect(coverage.map(c => c.levelId)).toEqual(levels);

        const summary = summariseFurnishCoverage(coverage);
        expect(summary.floors).toBe(3);
        // 3 floors × 2 apartments × 3 rooms = 18 rooms, all furnished.
        expect(summary.totalFurnished).toBe(18);
        expect(summary.totalSkipped).toBe(0);
        expect(summary.timedOutFloors).toBe(0);
        expect(summary.totalPlaced).toBe(18 * 4);
    });

    it('one level throwing does NOT abort the remaining floors', async () => {
        const levels = ['L0', 'L1', 'L2'];
        const coverage = await driveFurnishAllFloors(levels, async (levelId) => {
            if (levelId === 'L1') throw new Error('boom on L1');
            return coverageFor(levelId, 1, 2);
        });

        // All three levels are still present in the coverage report.
        expect(coverage.map(c => c.levelId)).toEqual(levels);
        // L0 + L2 furnished; L1 recorded as a skip with an explicit reason.
        expect(coverage[0]!.roomsFurnished).toBe(2);
        expect(coverage[2]!.roomsFurnished).toBe(2);
        const l1 = coverage.find(c => c.levelId === 'L1')!;
        expect(l1.roomsFurnished).toBe(0);
        expect(l1.skipped[0]!.reason).toContain('boom on L1');
    });

    it('surfaces per-unit skip reasons and timeouts in the summary', async () => {
        const coverage: FurnishLevelCoverage[] = [
            {
                levelId: 'L0', placedCount: 8, roomCount: 3, roomsFurnished: 2, roomsSkipped: 1,
                skipped: [{ roomId: 'r3', name: 'Corridor', reason: 'no archetype for occupancy=corridor' }],
                timedOut: false,
            },
            {
                levelId: 'L1', placedCount: 0, roomCount: 0, roomsFurnished: 0, roomsSkipped: 0,
                skipped: [{ roomId: '', reason: 'no rooms on level' }], timedOut: true,
            },
        ];
        const summary = summariseFurnishCoverage(coverage);
        expect(summary.totalFurnished).toBe(2);
        expect(summary.totalSkipped).toBe(1);
        expect(summary.timedOutFloors).toBe(1);
        // The report lines name the skipped unit + reason and flag the timeout.
        expect(summary.lines[0]).toContain('Corridor(no archetype for occupancy=corridor)');
        expect(summary.lines[1]).toContain('[TIMED-OUT]');
    });

    it('handles an empty level list without throwing', async () => {
        const coverage = await driveFurnishAllFloors([], async () => coverageFor('x', 1, 1));
        expect(coverage).toEqual([]);
        expect(summariseFurnishCoverage(coverage).floors).toBe(0);
    });
});
