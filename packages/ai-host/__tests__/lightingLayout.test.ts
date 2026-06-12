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

    // F1.5' (2026-05-30) — bathroom carries TWO items: ceiling downlight +
    // wall-mounted mirror_light.
    it('bathroom archetype carries both downlight (ceiling) and mirror_light (wall)', () => {
        const arch = archetypeForLighting('bathroom')!;
        const downlight    = arch.items.find(it => it.kind === 'downlight');
        const mirrorLight  = arch.items.find(it => it.kind === 'mirror_light');
        expect(downlight).toBeDefined();
        expect(mirrorLight).toBeDefined();
        expect(downlight!.mount ?? 'ceiling').toBe('ceiling');
        expect(mirrorLight!.mount).toBe('wall');
    });

    // F1.15 (2026-05-30) — kitchen + dining-room carry pendant_cluster
    // as the largest-area ceiling option.
    it('kitchen archetype prefers pendant_cluster at ≥ 12 m²', () => {
        const arch = archetypeForLighting('kitchen')!;
        const cluster = arch.items.find(it => it.kind === 'pendant_cluster');
        expect(cluster).toBeDefined();
        expect(cluster!.minAreaM2).toBe(12);
        // Order: pendant_cluster must come BEFORE linear_led so first-fit picks it.
        const clusterIdx = arch.items.findIndex(it => it.kind === 'pendant_cluster');
        const linearIdx  = arch.items.findIndex(it => it.kind === 'linear_led');
        expect(clusterIdx).toBeLessThan(linearIdx);
    });

    it('dining-room archetype prefers pendant_cluster at ≥ 10 m²', () => {
        const arch = archetypeForLighting('dining-room')!;
        const cluster = arch.items.find(it => it.kind === 'pendant_cluster');
        expect(cluster).toBeDefined();
        expect(cluster!.minAreaM2).toBe(10);
        const clusterIdx = arch.items.findIndex(it => it.kind === 'pendant_cluster');
        const pendantIdx = arch.items.findIndex(it => it.kind === 'pendant');
        expect(clusterIdx).toBeLessThan(pendantIdx);
    });
});

describe('lightRoom', () => {
    it('places a ceiling fixture (FIRST) at the room centroid', () => {
        // §MORE-LIGHTING (#11) — a living room also gets corner FLOOR lamps, so the
        // result is no longer length 1; the CEILING fixture is still the first item
        // and sits at the centroid.
        const placed = lightRoom(baseInput());
        const ceiling = placed.find(p => p.ceilingMounted)!;
        expect(ceiling).toBeDefined();
        expect(ceiling.origin.x).toBe(2.5);
        expect(ceiling.origin.z).toBe(2);
        // Default ceiling = level elevation (0) + 2.7 m.
        expect(ceiling.origin.y).toBeCloseTo(2.7, 6);
        expect(ceiling.roomId).toBe('r1');
        // The ceiling fixture is emitted first (first-fit ceiling pick).
        expect(placed[0]!.ceilingMounted).toBe(true);
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

    // F1.5' (2026-05-30) — bathroom archetype wiring: ceiling downlight +
    // wall-mounted mirror_light task light, emitted IN ADDITION not as
    // alternatives.
    describe('bathroom — F1.5\' mirror_light wiring', () => {
        it('emits BOTH a ceiling downlight AND a wall-mounted mirror_light', () => {
            const placed = lightRoom(baseInput({
                occupancy: 'bathroom', areaM2: 6, centroid: { x: 1.5, z: 1.5 },
            }));
            expect(placed).toHaveLength(2);
            const ceiling = placed.find(p => p.ceilingMounted);
            const wall    = placed.find(p => !p.ceilingMounted);
            expect(ceiling?.kind).toBe('downlight');
            expect(wall?.kind).toBe('mirror_light');
        });

        it('places the mirror_light at vanity height (levelElevation + 1.8)', () => {
            const placed = lightRoom(baseInput({
                occupancy: 'bathroom', areaM2: 6, levelElevation: 3,
            }));
            const wall = placed.find(p => p.kind === 'mirror_light');
            expect(wall).toBeDefined();
            expect(wall!.origin.y).toBeCloseTo(3 + 1.8, 6);
        });

        it('places the downlight at the ceiling Y, mirror_light is independent', () => {
            const placed = lightRoom(baseInput({
                occupancy: 'bathroom', areaM2: 6, ceilingY: 2.5, levelElevation: 0,
            }));
            const ceiling = placed.find(p => p.kind === 'downlight');
            const wall    = placed.find(p => p.kind === 'mirror_light');
            expect(ceiling!.origin.y).toBeCloseTo(2.5, 6);
            expect(wall!.origin.y).toBeCloseTo(1.8, 6);
        });

        it('mirror_light XZ tracks the centroid (placeholder until F1.6\' vanity-wall detection)', () => {
            const placed = lightRoom(baseInput({
                occupancy: 'bathroom', areaM2: 6, centroid: { x: 2.2, z: 3.4 },
            }));
            const wall = placed.find(p => p.kind === 'mirror_light');
            expect(wall!.origin.x).toBeCloseTo(2.2, 6);
            expect(wall!.origin.z).toBeCloseTo(3.4, 6);
        });

        it('non-bathroom rooms get NO mirror_light', () => {
            for (const occ of ['living-room', 'bedroom', 'kitchen', 'corridor', 'utility-room']) {
                const placed = lightRoom(baseInput({ occupancy: occ, areaM2: 12 }));
                expect(placed.find(p => p.kind === 'mirror_light'),
                    `${occ} should not get mirror_light`).toBeUndefined();
            }
        });
    });

    // F1.15 (2026-05-30) — pendant_cluster picked for large kitchen + dining.
    describe('F1.15 pendant_cluster wiring', () => {
        it('kitchen ≥ 12 m² picks pendant_cluster', () => {
            const placed = lightRoom(baseInput({ occupancy: 'kitchen', areaM2: 18 }));
            expect(placed[0]!.kind).toBe('pendant_cluster');
            expect(placed[0]!.ceilingMounted).toBe(true);
        });

        it('kitchen 8–12 m² falls back to linear_led (pre-F1.15 behaviour preserved)', () => {
            const placed = lightRoom(baseInput({ occupancy: 'kitchen', areaM2: 10 }));
            expect(placed[0]!.kind).toBe('linear_led');
        });

        it('kitchen < 8 m² falls back to downlight', () => {
            const placed = lightRoom(baseInput({ occupancy: 'kitchen', areaM2: 6 }));
            expect(placed[0]!.kind).toBe('downlight');
        });

        it('dining-room ≥ 10 m² picks pendant_cluster', () => {
            const placed = lightRoom(baseInput({ occupancy: 'dining-room', areaM2: 14 }));
            expect(placed[0]!.kind).toBe('pendant_cluster');
        });

        it('dining-room 6–10 m² falls back to single pendant', () => {
            const placed = lightRoom(baseInput({ occupancy: 'dining-room', areaM2: 8 }));
            expect(placed[0]!.kind).toBe('pendant');
        });
    });

    // F3.9 (2026-05-30) — corridor archetype gets a linear_led directional
    // strip when ≥ 3 m², downlight otherwise.
    describe('F3.9 corridor archetype', () => {
        it('corridor ≥ 3 m² picks linear_led (directional strip)', () => {
            const placed = lightRoom(baseInput({ occupancy: 'corridor', areaM2: 4 }));
            expect(placed[0]!.kind).toBe('linear_led');
        });

        it('corridor < 3 m² falls back to downlight', () => {
            const placed = lightRoom(baseInput({ occupancy: 'corridor', areaM2: 2 }));
            expect(placed[0]!.kind).toBe('downlight');
        });
    });

    // §MORE-LIGHTING (founder #11) — floor lamps in living-room + bedroom corners.
    describe('founder #11 — corner floor lamps (more lighting)', () => {
        const FLOOR_KINDS = ['floor_arc_brass', 'floor_wood_post', 'floor_tripod_black'];

        it('a living room gets a ceiling fixture PLUS corner floor lamps (at floor level)', () => {
            const placed = lightRoom(baseInput({ occupancy: 'living-room', areaM2: 20 }));
            const ceiling = placed.filter(p => p.ceilingMounted);
            const floors  = placed.filter(p => FLOOR_KINDS.includes(p.kind));
            expect(ceiling.length).toBe(1);                 // ambient ceiling fixture
            expect(floors.length).toBeGreaterThanOrEqual(2); // ≥ 2 corner lamps at 20 m²
            // Floor lamps sit at floor level (levelElevation = 0) and are NOT ceiling.
            for (const f of floors) {
                expect(f.ceilingMounted).toBe(false);
                expect(f.origin.y).toBeCloseTo(0, 6);
            }
        });

        it('the two living-room floor lamps land in DIFFERENT corners', () => {
            const placed = lightRoom(baseInput({ occupancy: 'living-room', areaM2: 20 }));
            const floors = placed.filter(p => FLOOR_KINDS.includes(p.kind));
            expect(floors.length).toBe(2);
            const apart = Math.hypot(
                floors[0]!.origin.x - floors[1]!.origin.x,
                floors[0]!.origin.z - floors[1]!.origin.z,
            );
            expect(apart).toBeGreaterThan(1.0);            // distinct corners, not stacked
        });

        it('a bedroom gets a corner floor lamp in addition to the ceiling fixture', () => {
            const placed = lightRoom(baseInput({ occupancy: 'bedroom', areaM2: 14 }));
            const floors = placed.filter(p => FLOOR_KINDS.includes(p.kind));
            expect(floors.length).toBeGreaterThanOrEqual(1);
            expect(placed.some(p => p.ceilingMounted)).toBe(true);
        });

        it('a tiny living room (below the floor-lamp threshold) gets NO floor lamp', () => {
            const placed = lightRoom(baseInput({ occupancy: 'living-room', areaM2: 8 }));
            expect(placed.filter(p => FLOOR_KINDS.includes(p.kind)).length).toBe(0);
        });

        it('service rooms (kitchen / bathroom / corridor) get NO floor lamps', () => {
            for (const occ of ['kitchen', 'bathroom', 'corridor', 'utility-room']) {
                const placed = lightRoom(baseInput({ occupancy: occ, areaM2: 18 }));
                expect(placed.filter(p => FLOOR_KINDS.includes(p.kind)).length,
                    `${occ} should get no floor lamp`).toBe(0);
            }
        });

        it('floor-lamp placement is deterministic (ADR-0061)', () => {
            const a = lightRoom(baseInput({ occupancy: 'living-room', areaM2: 20 }));
            const b = lightRoom(baseInput({ occupancy: 'living-room', areaM2: 20 }));
            expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
        });
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
