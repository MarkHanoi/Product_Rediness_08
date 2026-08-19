// §JOIN1-DEGRADATION-IS-NOT-SILENT (L-1270) — the founder's wedge, through the REAL
// store → WallJoinResolver → WallFragmentBuilder path. Nothing here is stubbed: every
// number comes off the world-space vertices of the meshes the builder actually produced.
//
// THE REPORT (founder, 2026-08-19, three screenshots): a raked wall on Level 3 of a curved
// multi-storey building, `WA-03-002`, 9.237 m, plain type. At its junctions with the
// neighbouring walls there are open wedges — CLOSED AT THE BOTTOM, OPENING TOWARD THE TOP.
//
// WHAT THE MEASUREMENT FOUND, and it falsified the leading hypothesis. The hypothesis was
// "the join pipeline is 2-D and the rake is applied afterwards, so the mitre is right at
// the base and wrong above it". It is NOT: ADR-0312's twin-solve loft re-runs the junction
// solve at a raked elevation and closes the corner to 0 mm at drifts up to 7.3 m
// (`L=9.237 rake=30/30` — see `WallRakeJoint.test.ts` for the closed-form proof).
//
// The wedge comes from the loft's own SAFETY GUARD:
//   1. `loftOffsets` refuses when the lofted top polygon's signed area flips sign.
//   2. On refusal the caller substitutes the ADR-0310 UNIFORM shear — which is precisely
//      the pre-ADR-0312 geometry whose top corner is known to be OPEN.
//   3. ⭐ The refusal is decided PER WALL. A mitre corner belongs to TWO walls, and each
//      decides alone. When they disagree the shared corner is placed by two rules.
//
// ⭐ AND IT IS THE SHORT WALL THAT REFUSES. A wall whose mitre corner drifts further than
// the wall is LONG has a lofted top face of negative area. So the founder's 9.237 m wall
// is built CORRECTLY and its short return is not — the hole is on the corner they share,
// which is why it reads as a defect of the wall he selected.
//
// This file pins BOTH halves so neither can regress:
//   A. the three cases that must CLOSE (raked↔plumb, equal rakes, different rakes) — and
//      they close at the founder's own 9.237 m length, not at a toy length;
//   B. the short-neighbour case, which does NOT close, is REPORTED by name rather than
//      silently. If someone later builds the clipped (height-varying-mitre) solid that
//      would close it, arm B fails and tells them to promote the case into arm A.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { WallPipelineV2Cache } from '../src/WallPipelineV2';
import { buildWallFootprint } from '../src/WallFootprint2D';
import {
    mk, specOf, levelProvider, bodyVertices, ringAt, minGap, sharedCount, H, COINCIDENT_M,
} from './support/wallJointHarness';
import type { WallData } from '../src/WallTypes';
import type { WallInput } from '../src/JunctionResolverV2';

/** The founder's wall: `WA-03-002`, 9.237 m. Used as the LONG leg everywhere below. */
const FOUNDER_LEN = 9.237;

interface Built {
    topGap: number; topShared: number;
    baseGap: number; baseShared: number;
    refusals: string[];
}

/** The cache's own base solve for one wall — the polygon the extruder would receive. */
function footprintFor(c: WallPipelineV2Cache, w: WallData) {
    return buildWallFootprint(
        {
            id: w.id,
            start: { x: w.baseLine[0]!.x, z: w.baseLine[0]!.z },
            end: { x: w.baseLine[1]!.x, z: w.baseLine[1]!.z },
            thickness: w.thickness,
        } as WallInput,
        c.getMiter(w.id),
    );
}

/**
 * Build a two-wall level through the REAL path and measure the shared corner at the floor
 * and at the top. `refusals` comes from a cache refreshed with the SAME specs and asked at
 * the SAME height the builder built at, so a reported refusal and the measured gap cannot
 * disagree about which build they describe.
 *
 * ⚠ `resolveLevel` TRIMS baselines in place, so it is handed deep copies — a shallow copy
 * shares the `baseLine` array and would leave the walls this function later measures with
 * post-trim coordinates. That mistake made an earlier probe in this lane report a refusal
 * on a wall that had not refused.
 */
function buildPair(A: WallData, B: WallData): Built {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    const walls = [A, B];
    const specs = walls.map(specOf);
    builder.refreshV2Cache(specs);
    const joins = WallJoinResolver.resolveLevel(
        walls.map(w => JSON.parse(JSON.stringify(w)) as WallData), { snapRadius: 0.5 },
    );

    // The refusal ledger is read BEFORE the build mutates anything, from its own cache.
    const ledger = new WallPipelineV2Cache();
    ledger.refresh(specs.map(s => ({ ...s })));
    for (const w of walls) ledger.rakedTopOffsets(w.id, footprintFor(ledger, w), H);
    const refusals = ledger.rakeJointRefusals().map(r => `${r.wallId}:${r.reason}`);

    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);

    const rootA = builder.getWallRoot(A.id) as unknown as THREE.Object3D | null;
    const rootB = builder.getWallRoot(B.id) as unknown as THREE.Object3D | null;
    expect(rootA, 'wall A produced no group').toBeTruthy();
    expect(rootB, 'wall B produced no group').toBeTruthy();
    const vA = bodyVertices(rootA!), vB = bodyVertices(rootB!);
    expect(vA.length, 'wall A produced no body geometry').toBeGreaterThan(0);
    expect(vB.length, 'wall B produced no body geometry').toBeGreaterThan(0);

    const baseA = ringAt(vA, 0), baseB = ringAt(vB, 0);
    const topA = ringAt(vA, H), topB = ringAt(vB, H);
    return {
        topGap: minGap(topA, topB),
        topShared: sharedCount(topA, topB, COINCIDENT_M),
        baseGap: minGap(baseA, baseB),
        baseShared: sharedCount(baseA, baseB, COINCIDENT_M),
        refusals,
    };
}

/** An L-corner at the origin: A arrives along −X, B leaves along +Z. */
const lCorner = (
    lenA: number, lenB: number, rakeA?: number, rakeB?: number,
): [WallData, WallData] => [
    mk([-lenA, 0], [0, 0], rakeA === undefined ? {} : { rake: rakeA }),
    mk([0, 0], [0, lenB], rakeB === undefined ? {} : { rake: rakeB }),
];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

// ─── ARM A — the corner CLOSES, at the founder's own wall length ──────────────

describe('§JOIN1 — a raked corner is closed at the TOP, not only at the floor', () => {
    // 70° and 80° bracket the angles the founder has been authoring; 45° is well past
    // anything architectural and is included so the arm cannot pass by being timid.
    for (const rake of [80, 70, 45]) {
        it(`raked ${rake} deg meets PLUMB — the shared corner survives to the top`, () => {
            const r = buildPair(...lCorner(FOUNDER_LEN, FOUNDER_LEN, rake, undefined));
            expect(r.baseShared, 'the floor corner must be shared to begin with').toBeGreaterThanOrEqual(2);
            expect(r.refusals, 'no wall may fall back to the uniform shear here').toEqual([]);
            expect(r.topShared).toBeGreaterThanOrEqual(2);
            expect(r.topGap).toBeLessThan(COINCIDENT_M);
        });

        it(`raked ${rake} deg meets raked ${rake} deg (SAME angle) — closed at the top`, () => {
            const r = buildPair(...lCorner(FOUNDER_LEN, FOUNDER_LEN, rake, rake));
            expect(r.baseShared).toBeGreaterThanOrEqual(2);
            expect(r.refusals).toEqual([]);
            expect(r.topShared).toBeGreaterThanOrEqual(2);
            expect(r.topGap).toBeLessThan(COINCIDENT_M);
        });

        it(`raked ${rake} deg meets raked ${180 - rake} deg (OPPOSITE lean) — closed at the top`, () => {
            const r = buildPair(...lCorner(FOUNDER_LEN, FOUNDER_LEN, rake, 180 - rake));
            expect(r.baseShared).toBeGreaterThanOrEqual(2);
            expect(r.refusals).toEqual([]);
            expect(r.topShared).toBeGreaterThanOrEqual(2);
            expect(r.topGap).toBeLessThan(COINCIDENT_M);
        });
    }

    it('raked 80 deg meets raked 70 deg (DIFFERENT angles) — closed at the top', () => {
        const r = buildPair(...lCorner(FOUNDER_LEN, FOUNDER_LEN, 80, 70));
        expect(r.baseShared).toBeGreaterThanOrEqual(2);
        expect(r.refusals).toEqual([]);
        expect(r.topShared).toBeGreaterThanOrEqual(2);
        expect(r.topGap).toBeLessThan(COINCIDENT_M);
    });
});

// ─── ARM B — the SHORT NEIGHBOUR, and why it is a REFUSAL and not a pass ──────

describe('§JOIN1 — the short neighbour refuses the loft, and SAYS SO', () => {
    it('9.237 m @80 deg beside a 0.5 m return: the corner IS open, and it is NAMED', () => {
        const [A, B] = lCorner(FOUNDER_LEN, 0.5, 80, 80);
        const r = buildPair(A, B);

        // The floor is sound — which is exactly why this reads as a wedge rather than a
        // detached wall, and why it survived every base-plane check in the repo.
        expect(r.baseShared, 'the floor corner is closed').toBeGreaterThanOrEqual(2);
        expect(r.baseGap).toBeLessThan(COINCIDENT_M);

        // The top is not. This is the founder's photograph, in millimetres.
        expect(r.topShared).toBe(0);
        expect(r.topGap).toBeGreaterThan(0.05);

        // ⭐ THE FIX: it is no longer silent. Exactly ONE wall refused — the SHORT one —
        // and it named the geometric reason rather than returning a bare null.
        expect(r.refusals).toEqual([`${B.id}:top-face-overtrimmed`]);
        expect(
            warn.mock.calls.some(c =>
                String(c[0]).includes('§JOIN1-DEGRADATION-IS-NOT-SILENT') && String(c[0]).includes(B.id),
            ),
            'the refusal must reach a log a human can grep',
        ).toBe(true);
    });

    it('THE ASYMMETRY IS THE DEFECT: the long wall lofts while its short neighbour does not', () => {
        const [A, B] = lCorner(FOUNDER_LEN, 0.5, 80, 80);
        const r = buildPair(A, B);
        // Only ONE of the two walls is in the ledger. That is the whole mechanism: one
        // corner, two walls, two different rules. If BOTH were listed the corner would
        // still be wrong but it would be SYMMETRICALLY wrong, which is a different bug.
        expect(r.refusals.length).toBe(1);
        expect(r.refusals[0]).toContain(B.id);
        expect(r.refusals[0]).not.toContain(A.id);
    });

    it('the SAME two walls with the return lengthened to 3 m close completely', () => {
        const r = buildPair(...lCorner(FOUNDER_LEN, 3, 80, 80));
        expect(r.refusals).toEqual([]);
        expect(r.topShared).toBeGreaterThanOrEqual(2);
        expect(r.topGap).toBeLessThan(COINCIDENT_M);
    });

    it('an UNRAKED level records nothing at all — no new logging on any existing project', () => {
        const r = buildPair(...lCorner(FOUNDER_LEN, 0.5, undefined, undefined));
        expect(r.refusals).toEqual([]);
        expect(r.topShared).toBeGreaterThanOrEqual(2);
        expect(warn.mock.calls.filter(c => String(c[0]).includes('§JOIN1')).length).toBe(0);
    });
});
