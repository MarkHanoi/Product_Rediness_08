// @pryzm/snapping — §SNAP-LEVEL-SCOPE (L-1108)
//
// Founder, production: "WHEN A USER IS CREATING AN ELEMENT NOT ON THE GROUND FLOOR,
// THE REFERENCE POINTS (SUCH AS GRID A, WALL JOIN T, END POINT…) ALWAYS REFERENCE TO
// GROUND FLOOR — BUT THEY SHOULD REFERENCE DEPENDING ON THE ACTIVE LEVEL."
//
// WHAT THIS SUITE IS AND IS NOT
// ─────────────────────────────
// It drives the REAL `SnapManager` with the REAL `WallSnapProvider`,
// `WallJoinSnapProvider` and `GridSnapProvider`. Nothing under test is stubbed. The
// only fakes are the STORES — plain object literals standing in for data, which is the
// same thing `slabCornerRefs.test.ts` does and is not a stub of the code under test.
//
// It is deliberately NOT a test of `WallTool`: a passing unit test is not proof the
// fix is reachable. The reachability evidence is the one-shot
// `[SnapManager] §SNAP-LEVEL-SCOPE (L-1108) active level "…"` console line, which
// fires from `rankCandidates()` inside the live pointer-move path — see the ISSUE-LOG
// row for the exact repro.
//
// Node environment: the provider/manager sources are imported directly (not via the
// barrel) so the DOM-requiring `SnapVisualizer` import graph is not pulled in. The
// manager is used WITHOUT `initVisualizer()`, which is the supported headless mode.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SnapManager } from '../src/SnapManager.js';
import { WallSnapProvider } from '../src/providers/WallSnapProvider.js';
import { WallJoinSnapProvider } from '../src/providers/WallJoinSnapProvider.js';
import { GridSnapProvider } from '../src/providers/GridSnapProvider.js';
import { SnapType } from '../src/types.js';
import { OTHER_LEVEL_DEMOTION, classifyCandidateLevel, defaultLevelScopeFor } from '../src/LevelScope.js';

// ── Fixture ──────────────────────────────────────────────────────────────────────
// A three-metre storey. Two walls at the SAME XZ footprint, one per storey — the exact
// situation the founder is in: he is drawing on Level 1 directly above the Level-0 shell.
const L0_Y = 0;
const L1_Y = 3;

const wallL0 = {
    id: 'wall-L0',
    levelId: 'L0',
    thickness: 0.2,
    baseLine: [
        new THREE.Vector3(0, L0_Y, 0),
        new THREE.Vector3(10, L0_Y, 0),
    ] as [THREE.Vector3, THREE.Vector3],
};

const wallL1 = {
    id: 'wall-L1',
    levelId: 'L1',
    thickness: 0.2,
    baseLine: [
        new THREE.Vector3(0, L1_Y, 0),
        new THREE.Vector3(10, L1_Y, 0),
    ] as [THREE.Vector3, THREE.Vector3],
};

/** A wall store carrying BOTH storeys, exactly as the real one does. */
const bothLevels = { getAll: () => [wallL0, wallL1] };
/** A ground-floor-only model — the "nothing on my floor yet" case. */
const groundOnly = { getAll: () => [wallL0] };

const ALL_TYPES = new Set([
    SnapType.ENDPOINT,
    SnapType.MIDPOINT,
    SnapType.CENTERLINE,
    SnapType.EDGE,
    SnapType.FACE,
    SnapType.WALL_JOIN,
    SnapType.GRID_LINE,
    SnapType.GRID_INTERSECTION,
]);

function managerOn(levelId: string, store: { getAll: () => any[] }): SnapManager {
    const m = new SnapManager({ enabledTypes: ALL_TYPES, snapRadius: 1.0 });
    m.setActiveLevelId(levelId);
    m.registerProvider(new WallSnapProvider(store as any));
    m.registerProvider(new WallJoinSnapProvider(store as any));
    return m;
}

beforeEach(() => {
    // The demotion log is a process-lifetime latch; reset it so each case can observe it.
    (SnapManager as unknown as { _loggedCrossLevelDemotion: boolean })._loggedCrossLevelDemotion = false;
});

// ── The classifier ───────────────────────────────────────────────────────────────

describe('LevelScope — the three scopes', () => {
    it('classes structural grids and the maths grid as project-wide DATUMS', () => {
        expect(defaultLevelScopeFor(SnapType.GRID)).toBe('datum');
        expect(defaultLevelScopeFor(SnapType.GRID_LINE)).toBe('datum');
        expect(defaultLevelScopeFor(SnapType.GRID_INTERSECTION)).toBe('datum');
    });

    it('classes element references as level-scoped', () => {
        expect(defaultLevelScopeFor(SnapType.ENDPOINT)).toBe('element');
        expect(defaultLevelScopeFor(SnapType.WALL_JOIN)).toBe('element');
        expect(defaultLevelScopeFor(SnapType.FACE)).toBe('element');
    });

    it('leaves a candidate with NO declared level alone rather than guessing', () => {
        // The register (L-1087) measured that level handling is inconsistent across this
        // codebase. A provider that has not been taught about levels must not have its
        // behaviour changed by this module — silence is 'unknown', never 'other'.
        expect(classifyCandidateLevel({ type: SnapType.ENDPOINT }, 'L1')).toBe('unknown');
        expect(classifyCandidateLevel({ type: SnapType.ENDPOINT, levelId: 'L0' }, null)).toBe('unknown');
    });

    it('separates active from other', () => {
        expect(classifyCandidateLevel({ type: SnapType.ENDPOINT, levelId: 'L1' }, 'L1')).toBe('active');
        expect(classifyCandidateLevel({ type: SnapType.ENDPOINT, levelId: 'L0' }, 'L1')).toBe('other');
    });
});

// ── The founder's defect ─────────────────────────────────────────────────────────

describe('§SNAP-LEVEL-SCOPE — the ACTIVE storey wins', () => {
    it('END POINT: drawing on L1 over a co-located L0/L1 corner snaps to the L1 wall', () => {
        const m = managerOn('L1', bothLevels);
        // Cursor 40 mm from the shared XZ corner, on the Level-1 plane.
        const res = m.snap(new THREE.Vector3(0.04, L1_Y, 0));

        expect(res.snapped).toBe(true);
        expect(res.candidate?.sourceId).toBe('wall-L1');
        expect(res.candidate?.levelId).toBe('L1');
        expect(res.candidate?.metadata?.crossLevel).toBeUndefined();
    });

    it('WALL JOIN T: an L0 wall face can no longer be offered as the winner on L1', () => {
        // This is the provider that made the defect UNCONDITIONAL: its broad phase is
        // `cursor-to-start distance × 1.2`, not the snap tolerance, so every wall in the
        // building enters it once the drawn segment exceeds the storey height — and it
        // then rewrote the hit's Y to the cursor's, erasing the evidence.
        const m = managerOn('L1', bothLevels);
        m.setActiveStartPoint(new THREE.Vector3(5, L1_Y, -6)); // 6 m away → wide broad phase

        const res = m.snap(new THREE.Vector3(5, L1_Y, -0.12));

        const joins = res.allCandidates.filter(c => c.type === SnapType.WALL_JOIN);
        expect(joins.length).toBeGreaterThan(0);
        // Both storeys' faces are still FOUND — the capability is intact…
        expect(joins.some(c => c.sourceId === 'wall-L0')).toBe(true);
        expect(joins.some(c => c.sourceId === 'wall-L1')).toBe(true);
        // …but the winner is never the other storey's.
        expect(res.candidate?.sourceId).toBe('wall-L1');
    });

    it('an other-storey candidate is demoted below EVERY active-storey one', () => {
        const m = managerOn('L1', bothLevels);
        const res = m.snap(new THREE.Vector3(0.04, L1_Y, 0));

        const l0 = res.allCandidates.filter(c => c.sourceId === 'wall-L0');
        const l1 = res.allCandidates.filter(c => c.sourceId === 'wall-L1');
        if (l0.length > 0 && l1.length > 0) {
            const worstActive = Math.min(...l1.map(c => c.priority));
            const bestOther = Math.max(...l0.map(c => c.priority));
            expect(bestOther).toBeLessThan(worstActive);
        }
        // The demotion must exceed the whole priority band, or a future priority tweak
        // could let an other-storey reference back in through the top.
        expect(OTHER_LEVEL_DEMOTION).toBeGreaterThan(210);
    });
});

// ── The capability that must NOT be destroyed ────────────────────────────────────

describe('§SNAP-LEVEL-SCOPE — cross-storey references SURVIVE, subordinate and labelled', () => {
    // MEASURED, not assumed. `WallSnapProvider` reaches other storeys only through the
    // WALL-JOIN provider: see the "reach" case at the bottom of this block for why.
    function joinManagerOn(levelId: string, store: { getAll: () => any[] }) {
        const m = managerOn(levelId, store);
        m.setActiveStartPoint(new THREE.Vector3(5, L1_Y, -6));
        return m;
    }
    const cursorAtL0Face = new THREE.Vector3(5, L1_Y, -0.12);

    it('with nothing on the active storey, the floor below is still offered', () => {
        // "Align the Level-1 wall to the Level-0 wall below" is the gesture ADR-0112 /
        // L-31 exists to provide. A hard filter would have closed the founder's bug by
        // deleting it.
        const res = joinManagerOn('L1', groundOnly).snap(cursorAtL0Face);

        expect(res.snapped).toBe(true);
        expect(res.candidate?.sourceId).toBe('wall-L0');
    });

    it('and it is TAGGED, so it cannot win SILENTLY', () => {
        const res = joinManagerOn('L1', groundOnly).snap(cursorAtL0Face);

        expect(res.candidate?.metadata?.crossLevel).toBe(true);
        expect(res.candidate?.metadata?.sourceLevelId).toBe('L0');
        expect(res.candidate?.metadata?.activeLevelId).toBe('L1');
    });

    it('logs the demotion once per process, so the policy is provable in a live console', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const m = joinManagerOn('L1', groundOnly);
            m.snap(cursorAtL0Face);
            m.snap(cursorAtL0Face);
            const hits = spy.mock.calls.filter(c => String(c[0]).includes('§SNAP-LEVEL-SCOPE'));
            expect(hits).toHaveLength(1);
            expect(String(hits[0]?.[0])).toContain('active level "L1"');
            expect(String(hits[0]?.[0])).toContain('level "L0"');
        } finally {
            spy.mockRestore();
        }
    });

    it('setCrossLevelReferences(false) is the HARD filter, and is not the default', () => {
        const m = joinManagerOn('L1', groundOnly);
        expect(m.getCrossLevelReferences()).toBe(true);

        m.setCrossLevelReferences(false);
        const res = m.snap(cursorAtL0Face);
        expect(res.allCandidates.every(c => c.sourceId !== 'wall-L0')).toBe(true);
        expect(res.snapped).toBe(false);
    });

    it('MEASURES the reach: an L0 wall IS found from L1, and is demoted, not deleted', () => {
        // A MEASUREMENT, recorded so a future change to it is deliberate.
        //
        // Two effects decide reach, and both were mis-stated before this lane measured
        // them. (a) `WallSnapProvider`'s broad phase is a 3-D box of half-extent
        // `tolerance × 2` — nominally 2 m at the `MAX_WORLD_TOLERANCE_M = 1.0` clamp,
        // which looks like it cannot span a 3 m storey — but `SpatialGrid`'s 2 m CELLS
        // are coarser than the box, so a wall at y ≈ 0 shares cell row 0 with a query
        // at y = 3 and IS returned. (b) The fine test for CENTERLINE / EDGE / FACE is
        // now genuinely planar (see `GeometryUtils.pointToLineDistance2D`), so it
        // passes on XZ proximity alone.
        //
        // Net: an other-storey wall is REACHABLE from an upper floor. Before L-1108 it
        // was reachable and RANKED EQUAL; now it is reachable and SUBORDINATE. Level
        // scoping here is a policy, not an accident of arithmetic.
        const endpointsOnly = new SnapManager({ enabledTypes: ALL_TYPES, snapRadius: 1.0 });
        endpointsOnly.setActiveLevelId('L1');
        endpointsOnly.registerProvider(new WallSnapProvider(groundOnly as any));

        const res = endpointsOnly.snap(new THREE.Vector3(0.04, L1_Y, 0));
        expect(res.snapped).toBe(true);
        expect(res.candidate?.sourceId).toBe('wall-L0');
        expect(res.candidate?.metadata?.crossLevel).toBe(true);
        expect(res.candidate!.priority).toBeLessThan(0); // demoted out of the band
    });

    it('the planar snap families are ALIVE above the ground floor (they were dead)', () => {
        // `pointToLineDistance2D` returned sqrt(dxz² + point.y²) against a point forced
        // to y = 0, so `distance <= radius` was UNSATISFIABLE at any storey elevation
        // above the 1 m tolerance clamp. CENTERLINE / EDGE / FACE never fired on an
        // upper floor at all — the snap was not mis-ranked, it did not exist.
        const m = new SnapManager({ enabledTypes: ALL_TYPES, snapRadius: 1.0 });
        m.setActiveLevelId('L1');
        m.registerProvider(new WallSnapProvider({ getAll: () => [wallL1] } as any));

        // Mid-wall, 120 mm off the centreline: a CENTERLINE/EDGE/FACE region, no endpoint.
        const res = m.snap(new THREE.Vector3(5, L1_Y, 0.12));
        const kinds = new Set(res.allCandidates.map(c => c.type));
        expect(kinds.has(SnapType.CENTERLINE)).toBe(true);
        expect(kinds.has(SnapType.FACE)).toBe(true);
        // …and the point comes back on the ACTIVE storey, not on the world origin plane.
        expect(res.candidate?.point.y).toBeCloseTo(L1_Y, 6);
    });
});

// ── The case that must NOT change ────────────────────────────────────────────────

describe('§SNAP-LEVEL-SCOPE — GRIDS are project-wide datums and must not be touched', () => {
    const gridA = { id: 'g-A', name: 'A', axis: 'X' as const, position: 0, isVisible: true, mode: 'orthogonal' as const };
    const grid1 = { id: 'g-1', name: '1', axis: 'Y' as const, position: 0, isVisible: true, mode: 'orthogonal' as const };

    function gridManager(levelId: string) {
        const m = new SnapManager({ enabledTypes: ALL_TYPES, snapRadius: 1.0 });
        m.setActiveLevelId(levelId);
        m.registerProvider(new GridSnapProvider(0.5, () => [gridA, grid1]));
        return m;
    }

    it('Grid A is offered at FULL priority on Level 1 — grids on upper floors are CORRECT', () => {
        const onL0 = gridManager('L0').snap(new THREE.Vector3(0.05, L0_Y, 0.05));
        const onL1 = gridManager('L1').snap(new THREE.Vector3(0.05, L1_Y, 0.05));

        expect(onL0.snapped).toBe(true);
        expect(onL1.snapped).toBe(true);
        expect(onL1.candidate?.type).toBe(onL0.candidate?.type);
        expect(onL1.candidate?.priority).toBeCloseTo(onL0.candidate!.priority, 6);
        expect(onL1.candidate?.metadata?.crossLevel).toBeUndefined();
    });

    it('a grid datum is never dropped even by the HARD filter', () => {
        const m = gridManager('L1');
        m.setCrossLevelReferences(false);
        expect(m.snap(new THREE.Vector3(0.05, L1_Y, 0.05)).snapped).toBe(true);
    });

    it('the grid candidate is reported on the ACTIVE storey plane, not y = 0', () => {
        // It used to emit `new THREE.Vector3(x, 0, z)` unconditionally. BeamTool returns
        // `res.point` WITHOUT re-stamping Y, so a grid snap there placed the beam on the
        // ground floor; and SnapVisualizer drew every grid marker three metres below the
        // wall being drawn.
        const res = gridManager('L1').snap(new THREE.Vector3(0.05, L1_Y, 0.05));
        expect(res.candidate?.point.y).toBeCloseTo(L1_Y, 6);
    });
});

// ── Backwards compatibility ──────────────────────────────────────────────────────

describe('§SNAP-LEVEL-SCOPE — a level-blind caller behaves exactly as before', () => {
    it('no active level → nothing is demoted, nothing is dropped', () => {
        const m = new SnapManager({ enabledTypes: ALL_TYPES, snapRadius: 1.0 });
        m.setActiveLevelAccessor(undefined); // explicit opt-out
        m.registerProvider(new WallSnapProvider(bothLevels as any));

        const res = m.snap(new THREE.Vector3(0.04, L1_Y, 0));
        expect(res.allCandidates.every(c => c.metadata?.crossLevel !== true)).toBe(true);
    });

    it('a store that does not declare levelId yields untouched candidates', () => {
        const legacyStore = {
            getAll: () => [{ id: 'legacy', thickness: 0.2, baseLine: wallL1.baseLine }],
        };
        const m = new SnapManager({ enabledTypes: ALL_TYPES, snapRadius: 1.0 });
        m.setActiveLevelId('L1');
        m.registerProvider(new WallSnapProvider(legacyStore as any));

        const res = m.snap(new THREE.Vector3(0.04, L1_Y, 0));
        expect(res.snapped).toBe(true);
        expect(res.candidate?.metadata?.crossLevel).toBeUndefined();
    });
});
