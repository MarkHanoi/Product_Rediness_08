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
// WHY THIS IS PINNED BEFORE IT IS FIXED (repo discipline §2, and §L-581, where a
// stated mechanism was confirmed twice and false both times): the numbers below
// are asserted as they are TODAY. The commit that fixes the providers flips them,
// and the flip is the evidence.
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

    it('PINNED WRONG — the CENTRE point sits at the LEFT EDGE, width/2 short', () => {
        const centre = pts.get('winCenterBase')!;
        // What it should be, by the cited formula: 2.0 + 0.6 = 2.6
        // What it is today:                        2.0
        expect(centre.x).toBe(WIN.offset);
        expect(centre.x).not.toBe(trueCentreX(WIN));
        expect(trueCentreX(WIN) - centre.x).toBeCloseTo(WIN.width / 2, 12);
    });

    it('PINNED WRONG — the LEFT point sits width/2 BEHIND the opening, off the frame entirely', () => {
        const left = pts.get('winLeftBase')!;
        expect(left.x).toBe(WIN.offset - WIN.width / 2);   // 1.4
        expect(left.x).not.toBe(trueLeftX(WIN));           // should be 2.0
    });

    it('PINNED WRONG — the RIGHT point lands exactly on the true CENTRE, which is the tell', () => {
        // 2.0 + 0.6 = 2.6 is the true CENTRE of this window. The provider offers it
        // as the RIGHT edge. A user snapping "to the right jamb" gets mid-glass.
        const right = pts.get('winRightBase')!;
        expect(right.x).toBe(trueCentreX(WIN));
        expect(right.x).not.toBe(trueRightX(WIN));         // should be 3.2
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

    it('PINNED WRONG — the CENTRE point sits at the LEFT EDGE, width/2 short', () => {
        const centre = [...pts.entries()].find(([l]) => /center.*base/i.test(l))![1];
        expect(centre.x).toBe(DOOR.offset);                 // 1.5
        expect(centre.x).not.toBe(trueCentreX(DOOR));       // should be 1.95
        expect(trueCentreX(DOOR) - centre.x).toBeCloseTo(DOOR.width / 2, 12);
    });
});
