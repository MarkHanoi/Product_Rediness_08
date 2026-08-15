/**
 * §ROOF-FOLLOWS-WALL — the roof re-derivation's VOCABULARY, proven borrowed
 * rather than minted. (C79 §5.2/§5.3 · C78 §8.1/§8.3 · GR-12.)
 *
 * A five-state channel is only worth anything if its five states are THE five
 * states and its refusal reasons are members of THE closed union. A family that
 * quietly invents a sixth state, or a twelfth reason, has not joined the
 * contract — it has forked it, and every consumer that switches on the union
 * gets a silent default branch. So these assertions read the OTHER packages'
 * SOURCE and fail on drift, exactly as `c79RecomputeStates.test.ts` does for the
 * slab. They are deliberately not `import`s: importing would prove the two
 * agree at this commit, while reading the source proves they cannot diverge
 * without a test going red.
 *
 * `roofFollowsMovedWall.test.ts` proves the BEHAVIOUR. This file proves the
 * WORDS. Both are needed: a correct re-derivation reported in private vocabulary
 * is C78 §8.1's U-INV-3 breach ("no reason is encoded as a hash, a prose
 * `detail`, or a silent return").
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ROOF_RECOMPUTE_STATE_ORDER,
    worstRoofRecomputeState,
    ringsEqualCyclicXZ,
    signedAreaXZ,
    selfIntersectsXZ,
    toStoredFootprint,
    toWorldRing,
    classifyRoofRecompute,
    type RoofRecomputeState,
    type RoofRecomputeUndeterminedReason,
} from '../src/roofRecomputeVerdict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../..');

/** The four members this family narrows C78 §8.1 to. */
const ROOF_REASONS: RoofRecomputeUndeterminedReason[] = [
    'GEOMETRY_UNPREDICTABLE',
    'STALE_DERIVED_STATE',
    'RELATIONSHIP_NOT_RECORDED',
    'ENGINE_NOT_AVAILABLE',
];

describe('§1 — the vocabulary is C79’s and C78’s, not this package’s', () => {
    it('the five states are C79 §5.2’s five, in §5.3’s severity order', () => {
        expect([...ROOF_RECOMPUTE_STATE_ORDER]).toEqual([
            'preserved', 'resized', 'regenerated', 'conflicted', 'undetermined',
        ]);
    });

    it('the state union has NOT drifted from the slab path’s SlabRecomputeState', () => {
        // Siblings: geometry-roof depends on geometry-slab, but the states are
        // duplicated rather than imported because the roof classifier is a
        // different mechanism (re-trace, not sketch intersection). What matters
        // is that the two cannot silently diverge.
        const src = readFileSync(
            resolve(REPO, 'packages/geometry-slab/src/slabRecomputeVerdict.ts'), 'utf8');
        const block = /export type SlabRecomputeState =([\s\S]*?);/.exec(src);
        expect(block, 'SlabRecomputeState not found — the slab path was renamed').not.toBeNull();
        const slabMembers = [...block![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!).sort();
        expect(slabMembers).toEqual([...ROOF_RECOMPUTE_STATE_ORDER].sort());
    });

    it('the state union has NOT drifted from finish-host-tracker’s ReprojectState either', () => {
        const src = readFileSync(
            resolve(REPO, 'packages/finish-host-tracker/src/reprojectFinishBoundary.ts'), 'utf8');
        const block = /export type ReprojectState =([\s\S]*?);/.exec(src);
        expect(block, 'ReprojectState not found — the finish path was renamed').not.toBeNull();
        const finishMembers = [...block![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!).sort();
        expect(finishMembers).toEqual([...ROOF_RECOMPUTE_STATE_ORDER].sort());
    });

    it('every roof undetermined reason is a member of command-bus’s CLOSED C78 §8.1 union', () => {
        const src = readFileSync(resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8');
        const block = /export type UndeterminedReason =([\s\S]*?);/.exec(src);
        expect(block, 'UndeterminedReason not found — C78 §8.1’s encoding moved').not.toBeNull();
        const closedUnion = [...block![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);

        for (const member of ROOF_REASONS) {
            expect(closedUnion, `${member} must EXIST in C78 §8.1, not be minted here`)
                .toContain(member);
        }
        // A genuine SUBSET, not a rename of the whole union: if roof ever needed
        // all eleven, that would mean the narrowing carries no information.
        expect(ROOF_REASONS.length).toBeLessThan(closedUnion.length);
    });

    it('§5.3 — an element’s state is the WORST of its parts, and `preserved` for none', () => {
        expect(worstRoofRecomputeState([])).toBe('preserved');
        expect(worstRoofRecomputeState(['preserved', 'resized'])).toBe('resized');
        expect(worstRoofRecomputeState(['resized', 'undetermined', 'preserved'])).toBe('undetermined');
        expect(worstRoofRecomputeState(['conflicted', 'regenerated'])).toBe('conflicted');
    });
});

describe('§2 — the geometry helpers the verdict rests on', () => {
    const SQUARE: [number, number][] = [[0, 0], [4, 0], [4, 4], [0, 4]];

    it('signed area is positive CCW and carries the sign a winding flip depends on', () => {
        expect(signedAreaXZ(SQUARE)).toBeCloseTo(16, 9);
        expect(signedAreaXZ([...SQUARE].reverse())).toBeCloseTo(-16, 9);
    });

    it('ring equality is CYCLIC but NOT reflection-invariant — a flip is a real change', () => {
        const rotated: [number, number][] = [[4, 0], [4, 4], [0, 4], [0, 0]];
        expect(ringsEqualCyclicXZ(SQUARE, rotated)).toBe(true);
        expect(ringsEqualCyclicXZ(SQUARE, [...SQUARE].reverse())).toBe(false);
    });

    it('a self-intersecting ring is detected; a simple one is not falsely flagged', () => {
        expect(selfIntersectsXZ(SQUARE)).toBe(false);
        // A bowtie: the two diagonals cross.
        expect(selfIntersectsXZ([[0, 0], [4, 4], [4, 0], [0, 4]])).toBe(true);
    });

    it('stored ↔ world footprint round-trips, so a write-back cannot double the offset', () => {
        const world: [number, number][] = [[10, 20], [14, 20], [14, 24], [10, 24]];
        const stored = toStoredFootprint(world);
        expect(stored.centroid).toEqual([12, 22]);
        expect(toWorldRing(stored)).toEqual(world);
    });
});

describe('§3 — the classifier reaches each state it claims, and refuses to reach one it does not', () => {
    const PREV: [number, number][] = [[0, 0], [6, 0], [6, 6], [0, 6]]; // 36 m²
    const live = (ring: [number, number][] | null, hosts: string[] = ['a', 'b', 'c', 'd']) => ({
        ring, hostWallIds: hosts, resolvedHostIds: ['a', 'b', 'c', 'd'], missingHostIds: [],
    });
    const classify = (res: any) => classifyRoofRecompute({
        roofId: 'r1', previousRing: PREV, recordedHostIds: ['a', 'b', 'c', 'd'], resolution: res,
    });

    it('preserved — re-derived and unchanged, with both numbers and NO footprint to write', () => {
        const v = classify(live(PREV));
        expect(v.state).toBe('preserved');
        expect(v.numbers).toEqual({ oldAreaM2: 36, newAreaM2: 36 });
        expect(v.footprint).toBeUndefined();
    });

    it('resized — the normal success case carries the re-derived footprint', () => {
        const v = classify(live([[0, 0], [6, 0], [6, 8], [0, 8]]));
        expect(v.state).toBe('resized');
        expect(v.numbers).toEqual({ oldAreaM2: 36, newAreaM2: 48 });
        expect(v.footprint!.centroid).toEqual([3, 4]);
    });

    it('conflicted — a winding inversion refuses WITH BOTH NUMBERS (§5.2.2 / C73 §4)', () => {
        const v = classify(live([[0, 6], [6, 6], [6, 0], [0, 0]]));
        expect(v.state).toBe('conflicted');
        expect(v.numbers).toEqual({ oldAreaM2: 36, newAreaM2: 36 });
        expect(v.subReason).toMatch(/36\.000 m² → 36\.000 m²/);
        expect(v.subReason).toMatch(/INVERTED/);
    });

    it('conflicted — a self-intersecting re-derivation is not a buildable footprint', () => {
        // Deliberately ASYMMETRIC (net area 12 m², same winding as the record):
        // a symmetric bowtie nets zero area and is correctly caught one branch
        // earlier as degenerate, which would make this arm pass for the wrong
        // reason and never exercise `selfIntersectsXZ` at all.
        const v = classify(live([[0, 0], [8, 0], [2, 6], [6, 6]]));
        expect(v.state).toBe('conflicted');
        expect(v.subReason).toMatch(/crosses itself/);
        expect(v.numbers).toEqual({ oldAreaM2: 36, newAreaM2: 12 });
    });

    it('regenerated — a different vertex count or a different host set, NOT reachable by a move', () => {
        const byVertexCount = classify(live([[0, 0], [6, 0], [6, 8], [3, 9], [0, 8]]));
        expect(byVertexCount.state).toBe('regenerated');

        const byHostSet = classify(live([[0, 0], [6, 0], [6, 8], [0, 8]], ['a', 'b', 'c', 'e']));
        expect(byHostSet.state).toBe('regenerated');
        expect(byHostSet.subReason).toMatch(/different wall set/);
    });

    it('undetermined — each of the four reasons is produced by its own cause, never collapsed', () => {
        // GEOMETRY_UNPREDICTABLE — no closed loop encloses the anchor.
        const noRegion = classify(live(null));
        expect(noRegion.state).toBe('undetermined');
        expect(noRegion.reason).toBe('GEOMETRY_UNPREDICTABLE');
        expect(noRegion.footprint).toBeUndefined();

        // STALE_DERIVED_STATE — a recorded bounding wall is gone.
        const stale = classify({
            ring: PREV, hostWallIds: ['a', 'b', 'c'],
            resolvedHostIds: ['a', 'b', 'c'], missingHostIds: ['d'],
        });
        expect(stale.reason).toBe('STALE_DERIVED_STATE');

        // RELATIONSHIP_NOT_RECORDED — nothing to judge the re-derivation against.
        const noPrev = classifyRoofRecompute({
            roofId: 'r1', previousRing: null, recordedHostIds: ['a'],
            resolution: live([[0, 0], [6, 0], [6, 8], [0, 8]]),
        });
        expect(noPrev.reason).toBe('RELATIONSHIP_NOT_RECORDED');

        // ENGINE_NOT_AVAILABLE — "I could not look" ≠ "I looked and it is gone".
        const unreachable = classify({
            ...live(null),
            undetermined: { reason: 'ENGINE_NOT_AVAILABLE', subReason: 'no wall set in this runtime' },
        });
        expect(unreachable.reason).toBe('ENGINE_NOT_AVAILABLE');

        // The four are DISTINCT values. A channel that answered one reason for
        // every cause would satisfy "is typed" while being worthless.
        const reasons = [noRegion.reason, stale.reason, noPrev.reason, unreachable.reason];
        expect(new Set(reasons).size).toBe(4);
    });

    it('§5.2.1 — a stale ring EQUAL to the record still reads `undetermined`, never `preserved`', () => {
        // The forbidden collapse, in its exact shape: the same pixels, opposite
        // facts. The ring handed in IS the recorded ring, byte-identical — and a
        // recorded bounding wall has vanished, so it is a memory, not a
        // measurement.
        const v = classify({
            ring: PREV, hostWallIds: ['a', 'b', 'c'],
            resolvedHostIds: ['a', 'b', 'c'], missingHostIds: ['d'],
        });
        expect(ringsEqualCyclicXZ(PREV, PREV)).toBe(true); // same pixels, asserted
        expect(v.state).toBe('undetermined');              // opposite facts
        expect(classify(live(PREV)).state).toBe('preserved');
    });

    it('every state carries a subReason — C78 §8.3, never prose-only detail', () => {
        const all: RoofRecomputeState[] = [];
        for (const res of [
            live(PREV),
            live([[0, 0], [6, 0], [6, 8], [0, 8]]),
            live([[0, 6], [6, 6], [6, 0], [0, 0]]),
            live([[0, 0], [6, 0], [6, 8], [3, 9], [0, 8]]),
            live(null),
        ]) {
            const v = classify(res);
            all.push(v.state);
            expect(v.subReason, `${v.state} carried no subReason`).toBeTruthy();
        }
        expect(new Set(all).size).toBe(5); // all five reached by this suite
    });
});
