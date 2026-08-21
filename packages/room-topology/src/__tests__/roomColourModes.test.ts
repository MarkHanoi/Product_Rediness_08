/**
 * @vitest-environment happy-dom
 *
 * §ROOM-COLOUR-MODES (L-1610/L-1611/L-1612) — room colour CATEGORISATION, proven
 * at the RENDERED FILL, not at a function return.
 *
 * WHAT IS BEING PROVEN, and why each half needs its own arm:
 *
 *  1. THE RAMP IS ORDERED BY AREA.  `RoomColourSystem.resolveForMode(..., 'area')`
 *     computed its ramp position as `(room.computed?.area ?? 0 - minA) / (maxA - minA)`.
 *     `??` binds LOOSER than `-`, so that parses as `area ?? (0 - minA)` — when the
 *     area exists (i.e. always, for a real room) the numerator is the RAW AREA and
 *     `minA` is never subtracted. A test that asserted only "returns a hex string"
 *     passes on that expression forever, which is why the arm below asserts the
 *     SMALLEST room is the ramp START colour and the LARGEST is the ramp END colour.
 *     With areas 100/110/120 the old expression gives t = 100/20 = 5 → clamped to 1
 *     → the smallest room is painted the LARGEST room's colour. Exactly inverted.
 *
 *  2. 'uniform' ("all white") EXISTS.  The founder asked for it by name. There was
 *     no such mode, so it fell through `default:` to the detection colour.
 *
 *  3. UNCLASSIFIED IS NOT A DETERMINATION.  A room with no computed area cannot be
 *     placed on a size ramp. It must read as UNCLASSIFIED, and it must not drag the
 *     ramp's min/max — failure and emptiness must not become the same value as a
 *     real measurement of zero.
 *
 *  4. THE MODE REACHES THE MESH, AND SURVIVES A REBUILD.  This is the half that
 *     matters to the founder: `RoomBoundaryBuilder._doUpdateRoom()` painted with the
 *     MODE-LESS `RoomColourSystem.resolve()`, so any room edit silently reverted the
 *     whole level to the detection palette. The assertions below read
 *     `mesh.material.color` — the actual fill in 3D and in every elevation/section
 *     view that renders the 3D scene — before AND after a rebuild.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RoomColourSystem, OCCUPANCY_PALETTE } from '../RoomColourSystem';
import { RoomBoundaryBuilder } from '../RoomBoundaryBuilder';
import { RoomStore } from '../RoomStore';
import type { RoomData, RoomOccupancyType } from '../RoomTypes';

const RAMP_START = '#FFEB3B'; // smallest room
const RAMP_END   = '#4CAF50'; // largest room
const UNCLASSIFIED = '#E0E0E0';
const WHITE = '#FFFFFF';

const IDS = {
    small:  '11111111-1111-4111-8111-111111111111',
    mid:    '22222222-2222-4222-8222-222222222222',
    large:  '33333333-3333-4333-8333-333333333333',
    noArea: '44444444-4444-4444-8444-444444444444',
};

/** A schema-valid room. `side` drives both the polygon and the computed area. */
function makeRoom(
    id: string,
    occupancyType: RoomOccupancyType,
    area: number | undefined,
    xOffset = 0,
): RoomData {
    const side = area !== undefined ? Math.sqrt(area) : 4;
    const polygon = [
        { x: xOffset,        z: 0 },
        { x: xOffset + side, z: 0 },
        { x: xOffset + side, z: side },
        { x: xOffset,        z: side },
    ];
    const computed: Record<string, unknown> = {
        perimeter: side * 4,
        centroid: { x: xOffset + side / 2, z: side / 2 },
        boundingBox: { minX: xOffset, minZ: 0, maxX: xOffset + side, maxZ: side },
    };
    // ⚠ `area` is left ABSENT (not 0) for the unclassified fixture. A room whose
    // area was never computed and a room measured at 0 m² are different facts.
    if (area !== undefined) {
        computed.area = area;
        computed.grossArea = area;
        computed.volume = area * 2.7;
    }
    return {
        id,
        type: 'room',
        levelId: 'L1',
        name: `Room ${id.slice(0, 4)}`,
        roomNumber: `00-${id.slice(0, 3)}`,
        occupancyType,
        boundingWallIds: [],
        boundingSlabIds: [],
        boundingColumnIds: [],
        properties: {},
        boundary: {
            polygon,
            height: 2.7,
            baseOffset: 0,
            detectionMethod: 'manual-boundary',
        },
        computed,
        finishes: {},
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as RoomData;
}

function hexOf(mesh: THREE.Mesh): string {
    return '#' + (mesh.material as THREE.MeshBasicMaterial).color.getHexString().toUpperCase();
}

/** Hex case is not a fact about the colour — compare the COLOUR, not the spelling. */
const norm = (hex: string): string => hex.toUpperCase();

describe('§ROOM-COLOUR-MODES — the size ramp is ordered by size (L-1610)', () => {
    const small = makeRoom(IDS.small, 'bedroom', 100);
    const mid   = makeRoom(IDS.mid,   'kitchen', 110);
    const large = makeRoom(IDS.large, 'bathroom', 120);
    const all = [small, mid, large];

    it('paints the SMALLEST room the ramp START colour', () => {
        // OLD EXPRESSION: t = 100 / (120 - 100) = 5 → clamped to 1 → RAMP_END.
        expect(norm(RoomColourSystem.resolveForMode(small, 'area', all))).toBe(RAMP_START);
    });

    it('paints the LARGEST room the ramp END colour', () => {
        expect(norm(RoomColourSystem.resolveForMode(large, 'area', all))).toBe(RAMP_END);
    });

    it('orders the three rooms monotonically by area', () => {
        // The ramp runs #FFEB3B -> #4CAF50: red FALLS and blue RISES across it.
        // Asserting a strict order on both channels pins the ORDERING, which is
        // the property the precedence bug destroyed (all three clamped to t=1).
        const toRgb = (hex: string) => RoomColourSystem.hexToRgb01(hex);
        const [rS, , bS] = toRgb(RoomColourSystem.resolveForMode(small, 'area', all));
        const [rM, , bM] = toRgb(RoomColourSystem.resolveForMode(mid,   'area', all));
        const [rL, , bL] = toRgb(RoomColourSystem.resolveForMode(large, 'area', all));
        expect(rS).toBeGreaterThan(rM);
        expect(rM).toBeGreaterThan(rL);
        expect(bS).toBeLessThan(bM);
        expect(bM).toBeLessThan(bL);
    });

    it('reads a room with NO computed area as UNCLASSIFIED, and excludes it from the ramp', () => {
        const noArea = makeRoom(IDS.noArea, 'corridor', undefined);
        const withGap = [small, mid, large, noArea];
        expect(norm(RoomColourSystem.resolveForMode(noArea, 'area', withGap))).toBe(UNCLASSIFIED);
        // The un-measured room must not become a phantom 0 m² that pins the ramp floor.
        expect(norm(RoomColourSystem.resolveForMode(small, 'area', withGap))).toBe(RAMP_START);
    });
});

describe('§ROOM-COLOUR-MODES — "all white" is a mode (L-1611)', () => {
    it('paints every room WHITE regardless of occupancy type', () => {
        const a = makeRoom(IDS.small, 'bedroom', 100);
        const b = makeRoom(IDS.mid, 'stairwell', 110);
        expect(norm(RoomColourSystem.resolveForMode(a, 'uniform'))).toBe(WHITE);
        expect(norm(RoomColourSystem.resolveForMode(b, 'uniform'))).toBe(WHITE);
        // …and it must beat an explicit per-room colour override, or "all white"
        // would silently be "all white except the ones somebody coloured".
        const c = makeRoom(IDS.large, 'kitchen', 120);
        (c as { colour?: string }).colour = '#FF0000';
        expect(norm(RoomColourSystem.resolveForMode(c, 'uniform'))).toBe(WHITE);
    });

    it('honours an explicit uniform colour when one is supplied', () => {
        const a = makeRoom(IDS.small, 'bedroom', 100);
        expect(norm(RoomColourSystem.resolveForMode(a, 'uniform', undefined, { uniformColour: '#123456' })))
            .toBe('#123456');
    });
});

describe('§ROOM-COLOUR-MODES — the mode reaches the RENDERED FILL (L-1612)', () => {
    let store: RoomStore;
    let scene: THREE.Scene;
    let builder: RoomBoundaryBuilder;
    let small: RoomData, mid: RoomData, large: RoomData;

    beforeEach(() => {
        store = new RoomStore();
        // ADR-0318 — RoomStore REFUSES a write without the level authority rather
        // than skipping the level-existence guard, so the test attaches a real one.
        store.attachEngine(
            {} as never,
            { getLevelById: (id: string) => (id === 'L1' ? { id: 'L1', elevation: 0, height: 2.7 } : undefined) } as never,
        );
        scene = new THREE.Scene();
        builder = new RoomBoundaryBuilder(scene);
        builder.attachDependencies({ roomStore: store });

        small = makeRoom(IDS.small, 'bedroom',  100, 0);
        mid   = makeRoom(IDS.mid,   'kitchen',  110, 40);
        large = makeRoom(IDS.large, 'bathroom', 120, 80);
        // Explicit per-room overrides, so the DETECTION colour (what the builder
        // paints today) differs from every other mode. Without them 'occupancy'
        // and 'detection' agree and the BY TYPE arm would pass on HEAD by accident.
        (small as { colour?: string }).colour = '#FF0000';
        (mid   as { colour?: string }).colour = '#00FF00';
        (large as { colour?: string }).colour = '#0000FF';
        for (const r of [small, mid, large]) {
            store.add(r);
            builder.updateRoom(r);
        }
    });

    const fill = (id: string) =>
        scene.children.find(o => o.name === `room-overlay-${id}`) as THREE.Mesh;
    const volume = (id: string) =>
        scene.children.find(o => o.name === `room-volume-${id}`) as THREE.Mesh;

    it('BY TYPE — each room takes its occupancy colour', () => {
        builder.setVisualisationMode('occupancy');
        expect(hexOf(fill(IDS.small))).toBe(OCCUPANCY_PALETTE['bedroom'].toUpperCase());
        expect(hexOf(fill(IDS.mid))).toBe(OCCUPANCY_PALETTE['kitchen'].toUpperCase());
        expect(hexOf(fill(IDS.large))).toBe(OCCUPANCY_PALETTE['bathroom'].toUpperCase());
    });

    it('BY SIZE — the rendered fills are ordered smallest → largest', () => {
        builder.setVisualisationMode('area');
        expect(hexOf(fill(IDS.small))).toBe(RAMP_START);
        expect(hexOf(fill(IDS.large))).toBe(RAMP_END);
    });

    it('ALL WHITE — every fill AND every room volume goes white', () => {
        builder.setVisualisationMode('uniform');
        for (const id of [IDS.small, IDS.mid, IDS.large]) {
            expect(hexOf(fill(id))).toBe(WHITE);
            // The volume mesh is what an ELEVATION / 3D view shows. Repainting only
            // the floor fill would leave elevations on the old palette.
            expect(hexOf(volume(id))).toBe(WHITE);
        }
    });

    it('THE MODE SURVIVES A ROOM REBUILD — this is the one the founder hits', () => {
        builder.setVisualisationMode('uniform');
        expect(hexOf(fill(IDS.small))).toBe(WHITE);

        // Any edit at all — rename, reshape, an occupancy change — rebuilds the mesh.
        builder.updateRoom(small);

        expect(hexOf(fill(IDS.small))).toBe(WHITE);
        expect(hexOf(volume(IDS.small))).toBe(WHITE);
    });

    it('a room ADDED while a mode is active is born in that mode', () => {
        builder.setVisualisationMode('occupancy');
        const extra = makeRoom(IDS.noArea, 'stairwell', 60, 120);
        // An explicit per-room override, so 'detection' and 'occupancy' differ and
        // the assertion cannot pass by the two modes happening to agree.
        (extra as { colour?: string }).colour = '#FF00FF';
        store.add(extra);
        builder.updateRoom(extra);
        expect(hexOf(fill(IDS.noArea))).toBe(OCCUPANCY_PALETTE['stairwell'].toUpperCase());
    });
});
