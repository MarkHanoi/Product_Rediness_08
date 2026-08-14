/**
 * §OPENED-REGION (L-880) — the detector's two obligations, both executed.
 *
 * 1. It FIRES on the founder's shape: a perimeter wall moves away, the interior
 *    partition that met it is left dangling, and the region it used to close merges
 *    into its neighbour. The proposal must be the stretch of that region's OWN former
 *    boundary that no longer has a wall on it.
 * 2. It stays SILENT on a healthy move: the same building, the same kind of gesture,
 *    but the wall that moves is one the rooms simply follow. A system that cries wolf
 *    gets muted, which is worse than saying nothing — so the silent case is tested at
 *    the same weight as the firing one.
 *
 * The reference building for every case, in world XZ metres:
 *
 *     z=6  ┌──────────────┬──────────┐
 *          │              │          │
 *          │   room A     ‖  room B  │     ‖ = interior partition at x=6
 *          │   36 m²      ‖  24 m²   │
 *     z=0  └──────────────┴──────────┘
 *         x=0            x=6        x=10
 */

import { describe, it, expect } from 'vitest';
import { scanForOpenedRegions, openedRegionNotifier } from '../OpenedRegionDetector';
import type { RegionSnapshot, SurvivingWall, OpenedRegionFinding } from '../OpenedRegionDetector';

const T = 0.20;   // wall thickness used throughout
const H = 2.70;   // wall height used throughout

function wall(id: string, x1: number, z1: number, x2: number, z2: number): SurvivingWall {
    return { id, start: { x: x1, z: z1 }, end: { x: x2, z: z2 }, thickness: T, height: H };
}

function room(id: string, name: string, pts: Array<[number, number]>): RegionSnapshot {
    return { id, name, polygon: pts.map(([x, z]) => ({ x, z })) };
}

const ROOM_A = room('room_A', 'Living', [[0, 0], [6, 0], [6, 6], [0, 6]]);
const ROOM_B = room('room_B', 'Bedroom', [[6, 0], [10, 0], [10, 6], [6, 6]]);

describe('§OPENED-REGION — the founder\'s shape: a perimeter wall moves and a region is left open', () => {
    /**
     * The SOUTH perimeter wall (z=0, spanning x=0..10) moves out to z=-4. The interior
     * partition at x=6 still runs z=0..6 and now ends in mid-air, so the two rooms are
     * one connected space. Detection reports ONE room where there were two.
     */
    const wallsAfter: SurvivingWall[] = [
        wall('w_south_MOVED', 0, -4, 10, -4),
        wall('w_north', 0, 6, 10, 6),
        wall('w_west', 0, -4, 0, 6),
        wall('w_east', 10, -4, 10, 6),
        wall('w_partition', 6, 0, 6, 6),
    ];
    const merged = room('room_merged', 'Room 1', [[0, -4], [10, -4], [10, 6], [0, 6]]);

    const scan = scanForOpenedRegions({
        levelId: 'L0',
        roomsBefore: [ROOM_A, ROOM_B],
        roomsAfter: [merged],
        wallsAfter,
    });

    it('produces exactly one finding — one wall left, one card, not one per lost room', () => {
        expect(scan.roomsBefore).toBe(2);
        expect(scan.roomsAfter).toBe(1);
        expect(scan.findings).toHaveLength(1);
    });

    it('classifies it as a merge, not as a vanish', () => {
        expect(scan.findings[0]!.cause).toBe('merged-into-neighbour');
    });

    it('proposes a wall, and does not refuse', () => {
        expect(scan.findings[0]!.kind).toBe('region-opened');
    });

    it('places the proposal on the missing edge — the z=0 line the moved wall vacated', () => {
        const f = scan.findings[0]! as Extract<OpenedRegionFinding, { kind: 'region-opened' }>;
        // Both endpoints sit on the room's former south edge, z = 0.
        expect(Math.abs(f.gap.start.z)).toBeLessThan(0.05);
        expect(Math.abs(f.gap.end.z)).toBeLessThan(0.05);
        // …spanning essentially the whole 6 m width of the lost room.
        const lo = Math.min(f.gap.start.x, f.gap.end.x);
        const hi = Math.max(f.gap.start.x, f.gap.end.x);
        expect(lo).toBeLessThan(0.35);
        expect(hi).toBeGreaterThan(5.65);
        expect(f.gap.lengthM).toBeGreaterThan(5.3);
        expect(f.gap.lengthM).toBeLessThan(6.3);
    });

    it('reports both ends as anchored on walls that are still there', () => {
        const f = scan.findings[0]! as Extract<OpenedRegionFinding, { kind: 'region-opened' }>;
        expect(f.gap.anchoredEndpoints).toBe(2);
    });

    it('carries thickness and height from a real neighbouring wall, never invented', () => {
        const f = scan.findings[0]! as Extract<OpenedRegionFinding, { kind: 'region-opened' }>;
        expect(f.gap.matchedWallId).toBeDefined();
        expect(f.gap.thicknessM).toBe(T);
        expect(f.gap.heightM).toBe(H);
    });

    it('names the room and its area in the detail the user will read', () => {
        const f = scan.findings[0]!;
        expect(f.detail).toContain('Living');
        expect(f.detail).toMatch(/36\.0 m²/);
    });
});

describe('§OPENED-REGION — SILENCE on a healthy move (the cry-wolf guard)', () => {
    it('says nothing when the moved wall simply grows the room that followed it', () => {
        // The EAST wall moves x=10 → x=14. Room B follows and grows; the ring stays closed.
        const wallsAfter: SurvivingWall[] = [
            wall('w_south', 0, 0, 14, 0),
            wall('w_north', 0, 6, 14, 6),
            wall('w_west', 0, 0, 0, 6),
            wall('w_east_MOVED', 14, 0, 14, 6),
            wall('w_partition', 6, 0, 6, 6),
        ];
        const scan = scanForOpenedRegions({
            levelId: 'L0',
            roomsBefore: [ROOM_A, ROOM_B],
            roomsAfter: [
                room('room_A2', 'Living', [[0, 0], [6, 0], [6, 6], [0, 6]]),
                room('room_B2', 'Bedroom', [[6, 0], [14, 0], [14, 6], [6, 6]]),
            ],
            wallsAfter,
        });
        expect(scan.findings).toHaveLength(0);
        expect(scan.roomsAfter).toBe(2);
    });

    it('says nothing when nothing changed at all', () => {
        const wallsAfter: SurvivingWall[] = [
            wall('w_south', 0, 0, 10, 0),
            wall('w_north', 0, 6, 10, 6),
            wall('w_west', 0, 0, 0, 6),
            wall('w_east', 10, 0, 10, 6),
            wall('w_partition', 6, 0, 6, 6),
        ];
        const scan = scanForOpenedRegions({
            levelId: 'L0',
            roomsBefore: [ROOM_A, ROOM_B],
            roomsAfter: [ROOM_A, ROOM_B],
            wallsAfter,
        });
        expect(scan.findings).toHaveLength(0);
        expect(scan.survivedIntact).toBe(2);
    });

    it('says nothing when a room merely shrinks because the wall moved inward', () => {
        // East wall moves x=10 → x=8. Room B shrinks; still its own closed room.
        const wallsAfter: SurvivingWall[] = [
            wall('w_south', 0, 0, 8, 0),
            wall('w_north', 0, 6, 8, 6),
            wall('w_west', 0, 0, 0, 6),
            wall('w_east_MOVED', 8, 0, 8, 6),
            wall('w_partition', 6, 0, 6, 6),
        ];
        const scan = scanForOpenedRegions({
            levelId: 'L0',
            roomsBefore: [ROOM_A, ROOM_B],
            roomsAfter: [
                room('room_A2', 'Living', [[0, 0], [6, 0], [6, 6], [0, 6]]),
                room('room_B2', 'Bedroom', [[6, 0], [8, 0], [8, 6], [6, 6]]),
            ],
            wallsAfter,
        });
        expect(scan.findings).toHaveLength(0);
    });
});

describe('§OPENED-REGION — a region that stops being detected at all', () => {
    it('reports the vanish and proposes the region\'s own missing edge', () => {
        // Room B is gone from the after-set entirely; its south edge lost its wall.
        const wallsAfter: SurvivingWall[] = [
            wall('w_north', 6, 6, 10, 6),
            wall('w_east', 10, 0, 10, 6),
            wall('w_partition', 6, 0, 6, 6),
        ];
        const scan = scanForOpenedRegions({
            levelId: 'L0',
            roomsBefore: [ROOM_B],
            roomsAfter: [],
            wallsAfter,
        });
        expect(scan.findings).toHaveLength(1);
        const f = scan.findings[0]!;
        expect(f.cause).toBe('no-longer-detected');
        expect(f.kind).toBe('region-opened');
        const g = (f as Extract<OpenedRegionFinding, { kind: 'region-opened' }>).gap;
        expect(Math.abs(g.start.z)).toBeLessThan(0.05);
        expect(Math.abs(g.end.z)).toBeLessThan(0.05);
        expect(g.lengthM).toBeGreaterThan(3.3);
    });
});

describe('§OPENED-REGION — it refuses with a NAMED reason rather than guessing', () => {
    it('refuses when the region lost its walls on two separate stretches', () => {
        // Room B loses BOTH its north and south edges — which one did the user mean?
        const wallsAfter: SurvivingWall[] = [
            wall('w_east', 10, 0, 10, 6),
            wall('w_partition', 6, 0, 6, 6),
        ];
        const scan = scanForOpenedRegions({
            levelId: 'L0',
            roomsBefore: [ROOM_B],
            roomsAfter: [],
            wallsAfter,
        });
        expect(scan.findings).toHaveLength(1);
        const f = scan.findings[0]!;
        expect(f.kind).toBe('position-unknown');
        expect((f as Extract<OpenedRegionFinding, { kind: 'position-unknown' }>).reason)
            .toBe('multiple-disjoint-gaps');
        expect(f.detail).toContain('genuinely unknown');
    });

    it('refuses when the region stopped closing but every metre of its edge still has a wall', () => {
        // Both rooms merge in the after-set, yet the partition is still standing.
        const wallsAfter: SurvivingWall[] = [
            wall('w_south', 0, 0, 10, 0),
            wall('w_north', 0, 6, 10, 6),
            wall('w_west', 0, 0, 0, 6),
            wall('w_east', 10, 0, 10, 6),
            wall('w_partition', 6, 0, 6, 6),
        ];
        const scan = scanForOpenedRegions({
            levelId: 'L0',
            roomsBefore: [ROOM_A, ROOM_B],
            roomsAfter: [room('room_merged', 'Room 1', [[0, 0], [10, 0], [10, 6], [0, 6]])],
            wallsAfter,
        });
        expect(scan.findings).toHaveLength(1);
        const f = scan.findings[0]!;
        expect(f.kind).toBe('position-unknown');
        expect((f as Extract<OpenedRegionFinding, { kind: 'position-unknown' }>).reason)
            .toBe('no-unwalled-edge');
        expect(f.detail).toContain('no wall position to propose');
    });

    it('refuses when almost the whole boundary is gone — that is demolition, not an opening', () => {
        const wallsAfter: SurvivingWall[] = [wall('w_east', 10, 0, 10, 6)];
        const scan = scanForOpenedRegions({
            levelId: 'L0',
            roomsBefore: [ROOM_B],
            roomsAfter: [],
            wallsAfter,
        });
        expect(scan.findings).toHaveLength(1);
        const f = scan.findings[0]!;
        expect(f.kind).toBe('position-unknown');
        expect((f as Extract<OpenedRegionFinding, { kind: 'position-unknown' }>).reason)
            .toBe('gap-dominates-perimeter');
    });
});

describe('§OPENED-REGION — the notifier is the only channel out, and it is fail-soft', () => {
    it('delivers to subscribers and unsubscribes cleanly', () => {
        const seen: OpenedRegionFinding[] = [];
        const off = openedRegionNotifier.subscribe(f => seen.push(f));
        const finding = {
            kind: 'position-unknown',
            levelId: 'L0',
            cause: 'no-longer-detected',
            roomId: 'r',
            roomName: 'r',
            roomAreaM2: 1,
            reason: 'no-unwalled-edge',
            detail: 'x',
        } as const;
        openedRegionNotifier.publish(finding);
        expect(seen).toHaveLength(1);
        off();
        openedRegionNotifier.publish(finding);
        expect(seen).toHaveLength(1);
    });

    it('a throwing subscriber never breaks detection for the next one', () => {
        const seen: string[] = [];
        const offBad = openedRegionNotifier.subscribe(() => { throw new Error('boom'); });
        const offGood = openedRegionNotifier.subscribe(() => seen.push('ok'));
        expect(() => openedRegionNotifier.publish({
            kind: 'position-unknown',
            levelId: 'L0',
            cause: 'no-longer-detected',
            roomId: 'r',
            roomName: 'r',
            roomAreaM2: 1,
            reason: 'no-unwalled-edge',
            detail: 'x',
        })).not.toThrow();
        expect(seen).toEqual(['ok']);
        offBad();
        offGood();
    });
});
