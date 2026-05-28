// D-CE — pure engine unit tests.

import { describe, expect, it } from 'vitest';
import { ceilingForRoom } from '../src/workflows/ceilingLayout/ceilingForRoom.js';
import { archetypeForCeiling } from '../src/workflows/ceilingLayout/archetypes.js';
import { buildCeilingCommands } from '../src/workflows/ceilingLayout/buildCeilingCommands.js';
import type { CeilingRoomInput, PlacedCeiling } from '../src/workflows/ceilingLayout/types.js';

const baseInput = (over: Partial<CeilingRoomInput> = {}): CeilingRoomInput => ({
    roomId: 'r1', levelId: 'L0', occupancy: 'living-room',
    polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }],
    levelElevation: 0,
    ...over,
});

describe('archetypeForCeiling', () => {
    it('returns an archetype for every supported occupancy', () => {
        const supported = [
            'bedroom', 'living-room', 'kitchen', 'dining-room', 'bathroom',
            'entrance-lobby', 'corridor', 'private-office', 'utility-room',
        ];
        for (const o of supported) {
            expect(archetypeForCeiling(o), `archetype for ${o}`).toBeDefined();
        }
    });

    it('returns undefined for unsupported occupancies', () => {
        expect(archetypeForCeiling('unknown')).toBeUndefined();
        expect(archetypeForCeiling('')).toBeUndefined();
    });

    it('bathroom + utility get the cool-white tint; others get warm-white', () => {
        expect(archetypeForCeiling('bathroom')!.materialColor).toBe('#eef2f3');
        expect(archetypeForCeiling('utility-room')!.materialColor).toBe('#eef2f3');
        expect(archetypeForCeiling('living-room')!.materialColor).toBe('#f5f5f0');
        expect(archetypeForCeiling('bedroom')!.materialColor).toBe('#f5f5f0');
    });
});

describe('ceilingForRoom', () => {
    it('emits ONE placed ceiling at level.elevation + ceilingHeight', () => {
        const placed = ceilingForRoom(baseInput());
        expect(placed).not.toBeNull();
        expect(placed!.boundary).toHaveLength(4);
        // All boundary points at the same Y (= ceilingHeight 2.7 above elevation 0).
        for (const v of placed!.boundary) expect(v.y).toBeCloseTo(2.7, 6);
        // XZ matches the room polygon.
        expect(placed!.boundary[0]!.x).toBe(0);
        expect(placed!.boundary[0]!.z).toBe(0);
        expect(placed!.boundary[2]!.x).toBe(5);
        expect(placed!.boundary[2]!.z).toBe(4);
        // Carries the archetype defaults.
        expect(placed!.ceilingHeightM).toBe(2.7);
        expect(placed!.thicknessM).toBe(0.05);
        expect(placed!.materialColor).toBe('#f5f5f0');
        expect(placed!.roomId).toBe('r1');
        expect(placed!.levelId).toBe('L0');
    });

    it('honours explicit ceilingHeightM + thicknessM overrides', () => {
        const placed = ceilingForRoom(baseInput({ ceilingHeightM: 3.0, thicknessM: 0.08 }));
        expect(placed!.ceilingHeightM).toBe(3.0);
        expect(placed!.thicknessM).toBe(0.08);
        for (const v of placed!.boundary) expect(v.y).toBeCloseTo(3.0, 6);
    });

    it('respects level.elevation when computing the ceiling Y', () => {
        const placed = ceilingForRoom(baseInput({ levelElevation: 5.0 }));
        for (const v of placed!.boundary) expect(v.y).toBeCloseTo(7.7, 6);
    });

    it('returns null for unsupported occupancies', () => {
        expect(ceilingForRoom(baseInput({ occupancy: 'unknown' }))).toBeNull();
    });

    it('returns null for boundaries with fewer than 3 points', () => {
        expect(ceilingForRoom(baseInput({ polygon: [{ x: 0, z: 0 }] }))).toBeNull();
        expect(ceilingForRoom(baseInput({ polygon: [] }))).toBeNull();
    });
});

describe('buildCeilingCommands', () => {
    const sample: PlacedCeiling = {
        roomId: 'r1', levelId: 'L0',
        boundary: [
            { x: 0, y: 2.7, z: 0 }, { x: 5, y: 2.7, z: 0 },
            { x: 5, y: 2.7, z: 4 }, { x: 0, y: 2.7, z: 4 },
        ],
        ceilingHeightM: 2.7, thicknessM: 0.05, materialColor: '#f5f5f0',
    };

    it('emits ONE ceiling.batch.create wrapping every ceiling (single undo unit)', () => {
        let n = 0;
        const set = buildCeilingCommands([sample, { ...sample, roomId: 'r2' }], 'L0', () => `ceiling_${n++}`);
        expect(set.commands).toHaveLength(1);
        expect(set.commands[0]!.command).toBe('ceiling.batch.create');
        const payload = set.commands[0]!.payload as { ceilings: unknown[]; levelId: string };
        expect(payload.levelId).toBe('L0');
        expect(payload.ceilings).toHaveLength(2);
        const c0 = payload.ceilings[0] as {
            id: string; levelId: string; boundary: { x: number; y: number; z: number }[];
            ceilingHeight: number; thickness: number; materialColor: string;
        };
        expect(c0.id).toBe('ceiling_0');
        expect(c0.levelId).toBe('L0');
        expect(c0.boundary).toHaveLength(4);
        expect(c0.boundary[0]).toEqual({ x: 0, y: 2.7, z: 0 });
        expect(c0.ceilingHeight).toBe(2.7);
        expect(c0.thickness).toBe(0.05);
        expect(c0.materialColor).toBe('#f5f5f0');
        expect(set.totalElementCount).toBe(2);
        expect(set.ids).toEqual(['ceiling_0', 'ceiling_1']);
    });

    it('returns 0 commands when there is nothing to place (handler rejects empty arrays)', () => {
        const set = buildCeilingCommands([], 'L0', () => 'never');
        expect(set.commands).toHaveLength(0);
        expect(set.totalElementCount).toBe(0);
    });

    it('skips entries with degenerate boundary / invalid dims + warns', () => {
        const bad: PlacedCeiling[] = [
            { ...sample, roomId: 'short', boundary: sample.boundary.slice(0, 2) },
            { ...sample, roomId: 'tall',  ceilingHeightM: -1 },
            { ...sample, roomId: 'fat',   thicknessM: 5 },  // thickness >= ceilingHeight
        ];
        const set = buildCeilingCommands(bad, 'L0', () => 'never');
        expect(set.commands).toHaveLength(0);
        expect(set.warnings.length).toBeGreaterThanOrEqual(3);
    });
});
