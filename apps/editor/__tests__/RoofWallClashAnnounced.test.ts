/**
 * PR-10 (gap register §2) — the roof→walls-beneath subscriber ANNOUNCES.
 *
 * The algorithm (`detectRoofWallClashes`, §GE-06-ROOF-WALL-SLICE, `83c82c02`)
 * is pure and oracle-pinned in `packages/geometry-roof`. This suite pins the
 * WIRING half: a level move that leaves a wall poking through a stranded roof
 * must produce an ANNOUNCED finding — a channel a user or harness can read
 * (the `showAppToast` DOM channel by default, injected here as a spy), not a
 * bare console.log. A conforming level must announce nothing.
 *
 * Oracle (hand-computed, mirroring roofWallClash.test.ts's strandedness pair):
 *   Level L1 at elevation 0, walls height 3, flat roof baseOffset 3.25 /
 *   thickness 0.25 (§ROOF-SIT-ON-WALL-HEAD post-fix: underside = wall head at
 *   y = 3.00). Level re-elevated +0.5 ⇒ delta = +0.5, walls now base 0.5 /
 *   top 3.5. The roof is STRANDED (C72 §5.1: no reconcile consumer), so its
 *   real origin is (newElevation − delta) + baseOffset = 0 + 3.25 = 3.25 and
 *   its underside stays 3.00 ⇒ every wall beneath PENETRATES by 0.50 m.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Node env: initDependencyCascade registers a window listener at call time and
// the announcer's default channel is a DOM toast — stub the established way
// (see annotationPlanToolCommit.test.ts) BEFORE the dynamic imports below.
(globalThis as any).window = (globalThis as any).window ?? {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
};

const { checkAndAnnounceRoofWallClashes } = await import(
    '../src/engine/roofWallClashAnnouncer'
);

const LEVEL = 'L1';

/** 10 × 10 m footprint, matching the geometry-roof oracle fixtures. */
const SQUARE_10: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];

function flatRoof(overrides: Record<string, unknown> = {}) {
    return {
        id: 'r1',
        type: 'roof',
        levelId: LEVEL,
        footprint: { polygon: SQUARE_10, centroid: [5, 5] as [number, number] },
        roofType: 'flat',
        overhang: 0,
        baseOffset: 3.25,
        thickness: 0.25,
        ...overrides,
    };
}

function wallRec(overrides: Record<string, unknown> = {}) {
    return {
        id: 'w1',
        levelId: LEVEL,
        baseLine: [{ x: 1, y: 0, z: 5 }, { x: 9, y: 0, z: 5 }],
        height: 3,
        thickness: 0.2,
        ...overrides,
    };
}

function makeParams(over: Partial<Parameters<typeof checkAndAnnounceRoofWallClashes>[0]> = {}) {
    return {
        levelId: LEVEL,
        elevationDeltaM: 0.5,
        roofStore: { getByLevel: (id: string) => (id === LEVEL ? [flatRoof()] : []) },
        wallStore: { getByLevel: (id: string) => (id === LEVEL ? [wallRec()] : []) },
        getLevelElevation: (id: string) => (id === LEVEL ? 0.5 : undefined), // NEW elevation
        announce: vi.fn(),
        ...over,
    };
}

describe('checkAndAnnounceRoofWallClashes — the announced finding (PR-10)', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('a level move that leaves a wall poking through the stranded roof ANNOUNCES a penetration', () => {
        const announce = vi.fn();
        const reports = checkAndAnnounceRoofWallClashes(makeParams({ announce }));

        // Oracle: stranded underside 3.00, wall top 3.50 ⇒ penetrates 0.50 m.
        expect(reports).toHaveLength(1);
        expect(reports[0]!.roofId).toBe('r1');
        expect(reports[0]!.findings).toEqual([
            expect.objectContaining({ wallId: 'w1', kind: 'penetrates' }),
        ]);
        expect(reports[0]!.findings[0]!.magnitudeM).toBeCloseTo(0.5, 9);

        // ANNOUNCED — the channel fires with the numbers, not a bare log.
        expect(announce).toHaveBeenCalledTimes(1);
        const msg = String(announce.mock.calls[0]![0]);
        expect(msg).toContain('r1');
        expect(msg).toContain('penetrate');
        expect(msg).toContain('0.50');
        expect(msg).toContain('PR-10');
    });

    it('a level dropped below a stranded roof ANNOUNCES the gap with the closest approach', () => {
        const announce = vi.fn();
        // delta −0.5: walls top = −0.5 + 3 = 2.5; stranded underside stays 3.00 ⇒ gap 0.5.
        const reports = checkAndAnnounceRoofWallClashes(makeParams({
            announce,
            elevationDeltaM: -0.5,
            getLevelElevation: () => -0.5,
        }));
        expect(reports[0]!.findings).toEqual([
            expect.objectContaining({ wallId: 'w1', kind: 'gap' }),
        ]);
        expect(reports[0]!.findings[0]!.magnitudeM).toBeCloseTo(0.5, 9);
        expect(announce).toHaveBeenCalledTimes(1);
        expect(String(announce.mock.calls[0]![0])).toContain('gap');
    });

    it('a conforming level announces NOTHING (walls outside the eave polygon)', () => {
        const announce = vi.fn();
        const reports = checkAndAnnounceRoofWallClashes(makeParams({
            announce,
            wallStore: { getByLevel: () => [wallRec({ baseLine: [{ x: 20, y: 0, z: 5 }, { x: 30, y: 0, z: 5 }] })] },
        }));
        expect(reports).toEqual([]);
        expect(announce).not.toHaveBeenCalled();
    });

    it('a level with no roofs announces NOTHING', () => {
        const announce = vi.fn();
        const reports = checkAndAnnounceRoofWallClashes(makeParams({
            announce,
            roofStore: { getByLevel: () => [] },
        }));
        expect(reports).toEqual([]);
        expect(announce).not.toHaveBeenCalled();
    });

    it('an unknown delta REFUSES to classify (console.warn) instead of reading false-clean', () => {
        // (newElevation + baseOffset) with no delta would call every strand
        // clean — the context-data-honesty defect. Absence must refuse loudly.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const announce = vi.fn();
        const reports = checkAndAnnounceRoofWallClashes(makeParams({ announce, elevationDeltaM: undefined }));
        expect(reports).toEqual([]);
        expect(announce).not.toHaveBeenCalled();
        expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('cannot classify');
    });

    it('the pitched form maps roofType ≠ flat to the pitched underside model', () => {
        const announce = vi.fn();
        // Gable, slope 0.5, baseOffset 3 (pitched keeps the eave at the wall head).
        // Level +0.5 ⇒ stranded originY = 0 + 3 = 3; walls top 3.5.
        // Underside(x,5) = 3 + 0.5·min(x, 10−x, 5): at x=1 ⇒ 3.5 (= top, clean
        // sample), at x=5 ⇒ 5.5. No penetration anywhere, some sample within ε ⇒
        // CLEAN under the detector's rules ⇒ nothing announced.
        const reports = checkAndAnnounceRoofWallClashes(makeParams({
            announce,
            roofStore: { getByLevel: () => [flatRoof({ roofType: 'gable', slope: 0.5, baseOffset: 3 })] },
        }));
        expect(reports).toEqual([]);
        expect(announce).not.toHaveBeenCalled();
    });
});

describe('initWallLevelSubscribers wiring — the level-rebuild callback runs the check (PR-10)', () => {
    it('the registered callback announces the strandedness finding after walls rebuild and slabs re-project', async () => {
        const { initWallLevelSubscribers } = await import('../src/engine/initWallLevelSubscribers');

        let rebuildCb: ((levelId: string, ids: string[], delta?: number) => void) | null = null;
        const spatialAuthority = {
            registerLevelRebuildCallback: (fn: typeof rebuildCb) => { rebuildCb = fn; },
        };
        const wall = wallRec();
        const updateWall = vi.fn();
        const wallTool = {
            getWallStore: () => ({
                subscribe: () => () => {},
                getById: (id: string) => (id === wall.id ? wall : undefined),
                getByLevel: (id: string) => (id === LEVEL ? [wall] : []),
            }),
            getFragmentBuilder: () => ({ updateWall }),
        };
        const slabStore = { getAll: () => [], triggerRebuild: vi.fn(), getById: () => undefined };
        const roofStore = { getByLevel: (id: string) => (id === LEVEL ? [flatRoof()] : []) };
        const bimManager = { getLevelById: (id: string) => (id === LEVEL ? { elevation: 0.5 } : undefined) };
        const announce = vi.fn();

        initWallLevelSubscribers({
            wallTool, slabStore, spatialAuthority, roofStore, bimManager,
            announceRoofWallClash: announce,
        } as never);

        expect(rebuildCb).toBeTypeOf('function');
        rebuildCb!(LEVEL, [wall.id], 0.5);

        // The wall rebuild still ran (the pre-existing half of the callback) …
        expect(updateWall).toHaveBeenCalled();
        // … and the strandedness finding reached the announced channel.
        expect(announce).toHaveBeenCalledTimes(1);
        const msg = String(announce.mock.calls[0]![0]);
        expect(msg).toContain('r1');
        expect(msg).toContain('penetrate');
        expect(msg).toContain('PR-10');
    });

    it('a conforming reconcile (no roofs on the level) announces nothing through the wiring', async () => {
        const { initWallLevelSubscribers } = await import('../src/engine/initWallLevelSubscribers');

        let rebuildCb: ((levelId: string, ids: string[], delta?: number) => void) | null = null;
        const announce = vi.fn();
        initWallLevelSubscribers({
            wallTool: {
                getWallStore: () => ({ subscribe: () => () => {}, getById: () => undefined, getByLevel: () => [] }),
                getFragmentBuilder: () => ({ updateWall: vi.fn() }),
            },
            slabStore: { getAll: () => [], triggerRebuild: vi.fn(), getById: () => undefined },
            spatialAuthority: { registerLevelRebuildCallback: (fn: typeof rebuildCb) => { rebuildCb = fn; } },
            roofStore: { getByLevel: () => [] },
            bimManager: { getLevelById: () => ({ elevation: 0.5 }) },
            announceRoofWallClash: announce,
        } as never);

        rebuildCb!(LEVEL, [], 0.5);
        expect(announce).not.toHaveBeenCalled();
    });
});
