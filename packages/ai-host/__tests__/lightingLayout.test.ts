// D-LE — pure engine unit tests.

import { describe, expect, it } from 'vitest';
import { lightRoom } from '../src/workflows/lightingLayout/lightRoom.js';
import { archetypeForLighting } from '../src/workflows/lightingLayout/archetypes.js';
import { buildLightingCommands } from '../src/workflows/lightingLayout/buildLightingCommands.js';
import type { LightRoomInput } from '../src/workflows/lightingLayout/types.js';

const baseInput = (over: Partial<LightRoomInput> = {}): LightRoomInput => ({
    roomId: 'r1', levelId: 'L0', occupancy: 'living-room',
    polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }],
    centroid: { x: 2.5, z: 2 }, areaM2: 20, levelElevation: 0,
    ...over,
});

describe('archetypeForLighting', () => {
    it('returns an archetype for every supported occupancy', () => {
        const occupancies = [
            'bedroom', 'living-room', 'kitchen', 'dining-room', 'bathroom',
            'entrance-lobby', 'corridor', 'private-office', 'utility-room',
        ];
        for (const o of occupancies) {
            expect(archetypeForLighting(o), `archetype for ${o}`).toBeDefined();
        }
    });

    it('returns undefined for unsupported occupancies', () => {
        expect(archetypeForLighting('unknown')).toBeUndefined();
        expect(archetypeForLighting('')).toBeUndefined();
    });
});

describe('lightRoom', () => {
    it('places ONE ceiling fixture at the room centroid', () => {
        const placed = lightRoom(baseInput());
        expect(placed).toHaveLength(1);
        expect(placed[0]!.origin.x).toBe(2.5);
        expect(placed[0]!.origin.z).toBe(2);
        // Default ceiling = level elevation (0) + 2.7 m.
        expect(placed[0]!.origin.y).toBeCloseTo(2.7, 6);
        expect(placed[0]!.ceilingMounted).toBe(true);
        expect(placed[0]!.roomId).toBe('r1');
    });

    it('honours explicit ceilingY', () => {
        const placed = lightRoom(baseInput({ ceilingY: 3.5 }));
        expect(placed[0]!.origin.y).toBeCloseTo(3.5, 6);
    });

    it('uses an area-bucketed kind when room is large', () => {
        // Living-room >= 25 m² → ceramic-bell pendant. < 25 → standard pendant.
        const big   = lightRoom(baseInput({ areaM2: 30 }));
        const small = lightRoom(baseInput({ areaM2: 15 }));
        const tiny  = lightRoom(baseInput({ areaM2: 5 }));
        expect(big[0]!.kind).toBe('pendant_ceramic_bell');
        expect(small[0]!.kind).toBe('pendant');
        expect(tiny[0]!.kind).toBe('downlight');
    });

    it('returns [] for unsupported occupancies', () => {
        const placed = lightRoom(baseInput({ occupancy: 'unknown' }));
        expect(placed).toHaveLength(0);
    });
});

describe('buildLightingCommands', () => {
    it('emits one lighting.create per placed fixture with the bus-handler shape', () => {
        const placed = [
            { kind: 'pendant' as const, origin: { x: 1, y: 2.7, z: 2 }, roomId: 'r1', ceilingMounted: true },
            { kind: 'downlight' as const, origin: { x: 3, y: 2.7, z: 4 }, roomId: 'r2', ceilingMounted: true },
        ];
        let n = 0;
        const set = buildLightingCommands(placed, 'L0', () => `light_${n++}`);
        expect(set.totalElementCount).toBe(2);
        expect(set.commands).toHaveLength(2);
        const c0 = set.commands[0]!;
        expect(c0.command).toBe('lighting.create');
        const p0 = c0.payload as { id: string; kind: string; origin: { x: number; y: number; z: number }; levelId: string };
        expect(p0.id).toBe('light_0');
        expect(p0.kind).toBe('pendant');
        expect(p0.origin).toEqual({ x: 1, y: 2.7, z: 2 });
        expect(p0.levelId).toBe('L0');
    });

    it('drops fixtures with non-finite origin and emits a warning', () => {
        const placed = [
            { kind: 'pendant' as const, origin: { x: NaN, y: 2.7, z: 2 }, roomId: 'r1', ceilingMounted: true },
        ];
        const set = buildLightingCommands(placed, 'L0', () => 'light_0');
        expect(set.commands).toHaveLength(0);
        expect(set.warnings.length).toBeGreaterThan(0);
    });
});
