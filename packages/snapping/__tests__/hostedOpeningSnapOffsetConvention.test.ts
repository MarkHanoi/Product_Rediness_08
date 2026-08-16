// §MT-06-SNAP-CONVENTION — the two snap providers never adopted the LEFT-EDGE offset.
//
// FOUND WHILE CENSUSING THE READERS OF A HOSTED OPENING'S RECORD (MT-06 step 3).
// `HostedOpeningAuthority.ts` names "the snap providers" as consumers of RECORD B
// (`windowStore` / `doorStore`); MT-06/S1 migrated the four RENDER paths and left
// these two. Reading them turned up something older and larger than staleness:
// they read the offset under the WRONG CONVENTION, so their points are wrong even
// when both records agree perfectly.
//
// THE CONVENTION, AND THE INDEPENDENT SOURCE FOR IT
// ----------------------------------------------------------------------------
// `WallOpeningPositionResolver.ts:22` — "§OPENING-OFFSET-LEFTEDGE-UNIFY 2026-06-24
// — offset is the LEFT EDGE":
//
//     worldCenter = baseLine[0] + normalize(baseLine[1] − baseLine[0]) × (offset + width/2)
//
// That is not one file's opinion. Every producer positions from it:
//   · WallArcParam.hostedElementFrame:415   arcFrameAt(wall, o + w/2)   <- THE frame fn
//   · WindowBuilder.ts:799                  hostedElementFrame(wallData, win.offset,  win.width)
//   · DoorBuilder.ts:479                    hostedElementFrame(wallData, door.offset, door.width)
//   · WallFragmentBuilder.ts:3023,3205      hostedElementFrame(wall, opening.offset, opening.width)
//   · CreateWallOpeningCommand.ts:72        wallOccupancyStore.canPlace(wall, offsetM, widthM)
//                                           — span START, i.e. left edge
// and RECORD B is written from RECORD A's number with NO conversion
// (`windowStore.add({ offset: opening.offset })`, CreateWallOpeningCommand:208).
// So the void, the frame, the plan symbol and the occupancy check all agree that
// `offset` is the left edge.
//
// THE TWO SNAP PROVIDERS DO NOT. Both still carry a pre-unify header — "PLAN-09
// CENTER convention: window.offset = distance from baseLine[0] to CENTRE" — and
// both compute:
//
//     const centerH = win.offset;                  // <- treats LEFT EDGE as CENTRE
//     const leftH   = centerH - win.width * 0.5;
//     const rightH  = centerH + win.width * 0.5;
//
// EVERY window and door snap point is therefore displaced `width/2` BACKWARD
// along its host wall: 0.60 m for the 1.2 m window seeded below, 0.45 m for a
// 0.9 m door. The user's cursor locks to a point that is not on the frame they
// can see, because the frame is drawn from the other convention.
//
// WHY THIS WAS PINNED BEFORE IT WAS FIXED (repo discipline §2, and §L-581, where
// a stated mechanism was confirmed twice and false both times): the numbers were
// first asserted as they were, WRONG, in their own commit. This is the flipped
// half — the same six assertions, now demanding the LEFT-EDGE answers. The
// before/after pair is the evidence, and each assertion carries the number it
// used to return so the flip stays readable after the diff scrolls away.
//
// PROOF SURFACE — `getCandidates()`, the method the snap engine calls on every
// cursor move. Not an internal field and not a pure helper's return: this is the
// provider's shipped output, and a candidate that is not in it is a point the
// user cannot snap to.
//
// NO TOLERANCE IS MINTED (discipline §8). Expected positions are built with the
// SAME float expression as the cited formula, so equality is exact and this file
// consumes no epsilon from anywhere.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowSnapProvider } from '../src/providers/WindowSnapProvider.js';
import { DoorSnapProvider } from '../src/providers/DoorSnapProvider.js';
import { SnapType } from '../src/types.js';

// A 6 m wall running along +x from the origin, so "distance along the wall" and
// "world x" are the same number and every assertion below is readable.
const WALL = {
    id: 'w-1',
    baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 6, y: 0, z: 0 },
    ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
};

const WIN = { id: 'win-1', wallId: 'w-1', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9 };
const DOOR = { id: 'door-1', wallId: 'w-1', offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 };

/** §OPENING-OFFSET-LEFTEDGE-UNIFY, applied verbatim to a +x wall. */
const trueCentreX = (o: { offset: number; width: number }) => o.offset + o.width / 2;
const trueLeftX = (o: { offset: number; width: number }) => o.offset;
const trueRightX = (o: { offset: number; width: number }) => o.offset + o.width;

const ALL_TYPES = new Set<SnapType>([SnapType.ENDPOINT, SnapType.MIDPOINT]);

const makeStore = <T extends { id: string }>(recs: T[]) => ({
    getAll: () => recs,
    getById: (id: string) => recs.find(r => r.id === id),
});

/** Every candidate the provider will offer anywhere on this wall, by label. */
function candidatesByLabel(provider: { getCandidates: (p: THREE.Vector3, r: number, t: Set<SnapType>) => Array<{ point: THREE.Vector3; metadata?: Record<string, unknown> }> }) {
    const all = provider.getCandidates(new THREE.Vector3(3, 1, 0), 100, ALL_TYPES);
    const byLabel = new Map<string, THREE.Vector3>();
    for (const c of all) byLabel.set(String(c.metadata?.label), c.point);
    return byLabel;
}

describe('§MT-06-SNAP-CONVENTION — window snap points vs the LEFT-EDGE offset', () => {
    const provider = new WindowSnapProvider(makeStore([WIN]) as never, makeStore([WALL]) as never);
    const pts = candidatesByLabel(provider as never);

    it('the provider offers the expected label set (the subject exists)', () => {
        // An empty provider would make every assertion below vacuously "not at the
        // right place". Establish the subject before grading it.
        expect(pts.size).toBe(10);
        expect(pts.has('winCenterBase')).toBe(true);
    });

    it('the CENTRE point is at offset + width/2', () => {
        const centre = pts.get('winCenterBase')!;
        expect(centre.x).toBe(trueCentreX(WIN));           // 2.6 — was 2.0
    });

    it('the LEFT point is at the opening\'s left edge, i.e. offset itself', () => {
        const left = pts.get('winLeftBase')!;
        expect(left.x).toBe(trueLeftX(WIN));               // 2.0 — was 1.4
    });

    it('the RIGHT point is at offset + width, not at the centre', () => {
        // The old code put the RIGHT point at 2.6, which is the true CENTRE: a
        // user snapping "to the right jamb" got mid-glass. It is the tell that the
        // whole block was one convention behind.
        const right = pts.get('winRightBase')!;
        expect(right.x).toBe(trueRightX(WIN));             // 3.2 — was 2.6
        expect(right.x).not.toBe(trueCentreX(WIN));
    });

    it('the three along-wall points are evenly spaced by width/2, in order', () => {
        // A guard against a future half-fix that corrects one point and not the
        // other two: left < centre < right, and the gaps are equal.
        const l = pts.get('winLeftBase')!.x;
        const c = pts.get('winCenterBase')!.x;
        const r = pts.get('winRightBase')!.x;
        expect(c - l).toBeCloseTo(WIN.width / 2, 12);
        expect(r - c).toBeCloseTo(WIN.width / 2, 12);
        expect(r - l).toBeCloseTo(WIN.width, 12);
    });

    it('every one of the ten points shares the corrected along-wall triple', () => {
        // Sill and top rows are built from the SAME lx/cx/rx, so a fix that
        // reached only the base row would leave the other six behind.
        for (const row of ['Base', 'Sill', 'Top'] as const) {
            expect(pts.get(`winLeft${row}`)!.x).toBe(trueLeftX(WIN));
            expect(pts.get(`winCenter${row}`)!.x).toBe(trueCentreX(WIN));
            expect(pts.get(`winRight${row}`)!.x).toBe(trueRightX(WIN));
        }
        expect(pts.get('winCenterMid')!.x).toBe(trueCentreX(WIN));
    });

    it('vertical placement is NOT part of this defect — sill/top are already correct', () => {
        // Stated so the fix is not over-scoped: only the along-wall axis is wrong.
        expect(pts.get('winLeftSill')!.y).toBe(WIN.sillHeight);
        expect(pts.get('winLeftTop')!.y).toBe(WIN.sillHeight + WIN.height);
    });
});

describe('§MT-06-SNAP-CONVENTION — door snap points carry the identical defect', () => {
    const provider = new DoorSnapProvider(makeStore([DOOR]) as never, makeStore([WALL]) as never);
    const pts = candidatesByLabel(provider as never);

    it('the provider offers a non-empty label set (the subject exists)', () => {
        expect(pts.size).toBeGreaterThan(0);
    });

    it('the CENTRE point is at offset + width/2', () => {
        const centre = pts.get('doorCenterBase')!;
        expect(centre.x).toBe(trueCentreX(DOOR));           // 1.95 — was 1.5
    });

    it('the left and right points bracket the leaf at offset and offset + width', () => {
        expect(pts.get('doorLeftBase')!.x).toBe(trueLeftX(DOOR));    // 1.5  — was 1.05
        expect(pts.get('doorRightBase')!.x).toBe(trueRightX(DOOR));  // 2.4  — was 1.95
    });
});
