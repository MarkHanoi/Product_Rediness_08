// @vitest-environment happy-dom
//
// §LOAD-REDETECT-FREEZE (2026-06-25) — project-open FREEZE fix.
//
// Loading a PERSISTED project used to re-run the full
// RoomDetectionEngine.detectRoomsForLevel() graph-walk on EVERY level in the
// ProjectLoader finally-block sweep — even though the rooms were already
// hydrated from the snapshot (BatchCreateRoomsCommand). For a 783-element /
// 7-level residential building that re-detect dominated load as a ~6 s
// `redetect_sweep` phase (`§LOAD-PHASE name=redetect_sweep total=6025.9ms`)
// plus hundreds of `[BimManager] Unregistered element …` churn lines and a
// WallRebuildCoordinator re-queue storm.
//
// The fix: the post-load sweep skips redetection for any level whose rooms were
// restored from the snapshot, and only redetects levels with NO persisted
// rooms. This suite locks in the pure decision (`levelsWithPersistedRooms`)
// that the sweep uses, and proves the partition it produces:
//   1. Levels with saved rooms are reported (→ redetect SKIPPED).
//   2. Levels WITHOUT saved rooms are absent (→ redetect still RUNS — room
//      detection for un-persisted / new geometry is preserved).
//   3. Legacy snapshots (no rooms array) skip nothing — every level redetects,
//      exactly as before this fix.

import { describe, it, expect } from 'vitest';
import { levelsWithPersistedRooms } from '../src/engine/persistence/ProjectLoader';

describe('§LOAD-REDETECT-FREEZE — skip redetect for levels with persisted rooms', () => {
    it('reports every level that has at least one persisted room', () => {
        const rooms = [
            { id: 'r1', levelId: 'L0' },
            { id: 'r2', levelId: 'L0' },
            { id: 'r3', levelId: 'L1' },
            { id: 'r4', levelId: 'L3' },
        ];
        const skip = levelsWithPersistedRooms(rooms);
        expect(skip.has('L0')).toBe(true);
        expect(skip.has('L1')).toBe(true);
        expect(skip.has('L3')).toBe(true);
        expect(skip.size).toBe(3);
    });

    it('does NOT report a level that has no persisted room — that level still redetects', () => {
        // Building has levels L0..L2; only L0 + L1 saved rooms. L2 (e.g. an empty
        // roof level, or one whose rooms were never persisted) must NOT be skipped.
        const rooms = [
            { id: 'r1', levelId: 'L0' },
            { id: 'r2', levelId: 'L1' },
        ];
        const skip = levelsWithPersistedRooms(rooms);
        const allLevels = ['L0', 'L1', 'L2'];
        const redetected = allLevels.filter(l => !skip.has(l));
        expect(skip.has('L2')).toBe(false);
        expect(redetected).toEqual(['L2']);
    });

    it('legacy snapshot (no rooms array) skips nothing — every level redetects as before', () => {
        expect(levelsWithPersistedRooms(undefined).size).toBe(0);
        expect(levelsWithPersistedRooms(null).size).toBe(0);
        expect(levelsWithPersistedRooms([]).size).toBe(0);
    });

    it('ignores malformed / empty levelIds so a bad record never suppresses a real redetect', () => {
        const rooms = [
            { id: 'r1', levelId: 'L0' },
            { id: 'r2', levelId: '' },          // empty — must be ignored
            { id: 'r3' },                        // missing — must be ignored
            { id: 'r4', levelId: null },         // null — must be ignored
        ] as Array<{ id: string; levelId?: string | null }>;
        const skip = levelsWithPersistedRooms(rooms);
        expect(skip.has('L0')).toBe(true);
        expect(skip.size).toBe(1);
    });

    it('7-level building with rooms on all levels skips the whole redetect sweep', () => {
        // Mirrors the founder repro: 7 levels, rooms persisted on each.
        const levels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
        const rooms = levels.flatMap((levelId, i) => [
            { id: `r${i}a`, levelId },
            { id: `r${i}b`, levelId },
        ]);
        const skip = levelsWithPersistedRooms(rooms);
        const redetected = levels.filter(l => !skip.has(l));
        expect(skip.size).toBe(7);
        expect(redetected).toEqual([]); // zero expensive detectRoomsForLevel calls
    });
});
