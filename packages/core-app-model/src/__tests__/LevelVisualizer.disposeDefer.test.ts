/**
 * §FIX-LEVEL-DISPOSE-MID-SUBMIT (L-303) — LevelVisualizer must NEVER dispose a
 * departing level's GPU resources synchronously during teardown (mid-submit).
 *
 * The crash: editing a level's elevation runs `UPDATE_LEVEL` → updateLevel →
 * buildLevel → _disposeLevel, which used to call `geometry.dispose()` /
 * `material.dispose()` SYNCHRONOUSLY while a WebGPU command buffer still
 * referenced the resource → `Cannot read properties of undefined (reading
 * 'usedTimes')` + `Destroyed texture [ShadowDepthTexture] used in a submit`.
 *
 * The teeth-bearing assertion is NOT "dispose was called" — it is
 * "dispose was called AFTER the current call stack (post-submit), NEVER during
 * synchronous teardown". Every test below asserts the count is 0 immediately
 * after the teardown call returns, and only becomes 1 after the deferred tick.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LevelVisualizer, deferDisposePastSubmit } from '../LevelVisualizer';
import type { Level } from '../BimKernel';

// happy-dom does not implement a canvas 2D context; _makeLevelHead needs one to
// draw the Revit level-head bubble. Stub a no-op 2D context so the visualizer
// builds real THREE.Sprite/Line objects (whose dispose() we assert on). This
// is a test-env shim only — orthogonal to the §FIX-LEVEL-DISPOSE-MID-SUBMIT fix.
beforeAll(() => {
    const stub2d = () => ({
        beginPath() {}, arc() {}, fill() {}, stroke() {}, fillText() {},
        fillStyle: '', strokeStyle: '', lineWidth: 0, font: '',
        textAlign: '', textBaseline: '',
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        stub2d as unknown as HTMLCanvasElement['getContext'],
    );
});

function makeLevel(id: string, elevation: number, over: Partial<Level> = {}): Level {
    return {
        id,
        name: id,
        elevation,
        height: 3,
        isVisible: true,
        order: 0,
        childrenIds: [],
        ...over,
    };
}

/** The per-level THREE.Group most recently added to the datum group. */
function latestLevelGroup(viz: LevelVisualizer): THREE.Group {
    const kids = viz.levelsGroup.children;
    return kids[kids.length - 1] as THREE.Group;
}

/** Spy on every GPU `dispose` reachable from a level group. */
function spyDisposals(group: THREE.Object3D): ReturnType<typeof vi.spyOn>[] {
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    group.traverse(obj => {
        if (obj instanceof THREE.Line) {
            spies.push(vi.spyOn(obj.geometry, 'dispose'));
            spies.push(vi.spyOn(obj.material as THREE.Material, 'dispose'));
        } else if (obj instanceof THREE.Sprite) {
            const mat = obj.material as THREE.SpriteMaterial;
            if (mat.map) spies.push(vi.spyOn(mat.map, 'dispose'));
            spies.push(vi.spyOn(mat, 'dispose'));
        }
    });
    return spies;
}

const callCounts = (spies: ReturnType<typeof vi.spyOn>[]) =>
    spies.map(s => s.mock.calls.length);

describe('LevelVisualizer §FIX-LEVEL-DISPOSE-MID-SUBMIT (L-303)', () => {
    let scene: THREE.Scene;
    let viz: LevelVisualizer;

    beforeEach(() => {
        vi.useFakeTimers();
        scene = new THREE.Scene();
        viz = new LevelVisualizer(scene);
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('updateLevel does NOT dispose the departing level synchronously — deferred past submit', () => {
        viz.buildLevel(makeLevel('L0', 0));
        const departing = latestLevelGroup(viz);
        const spies = spyDisposals(departing);
        expect(spies.length).toBeGreaterThan(0); // real geometry + materials exist

        // UPDATE_LEVEL — the crash reproduction. Must NOT throw.
        expect(() => viz.updateLevel(makeLevel('L0', 3))).not.toThrow();

        // TEETH: synchronous teardown has returned; the OLD path would have
        // disposed mid-submit here. Nothing must have been disposed yet.
        expect(callCounts(spies)).toEqual(spies.map(() => 0));

        // After the post-submit tick, every resource is released exactly once.
        vi.runAllTimers();
        expect(callCounts(spies)).toEqual(spies.map(() => 1));
    });

    it('removeLevel defers disposal past the current submit, then releases exactly once', () => {
        viz.buildLevel(makeLevel('L1', 3));
        const departing = latestLevelGroup(viz);
        const spies = spyDisposals(departing);

        viz.removeLevel('L1');

        // Detached from the scene graph immediately (renders no more)…
        expect(viz.levelsGroup.children).not.toContain(departing);
        // …but GPU dispose is NOT called during the synchronous call.
        expect(callCounts(spies)).toEqual(spies.map(() => 0));

        vi.runAllTimers();
        expect(callCounts(spies)).toEqual(spies.map(() => 1)); // once — no leak, no double-free
    });

    it('dispose() (project clear / HMR) defers every level, releases each once', () => {
        viz.buildLevel(makeLevel('A', 0));
        viz.buildLevel(makeLevel('B', 3));
        const spies = [
            ...spyDisposals(viz.levelsGroup.children[0]),
            ...spyDisposals(viz.levelsGroup.children[1]),
        ];

        viz.dispose();
        expect(callCounts(spies)).toEqual(spies.map(() => 0)); // nothing mid-submit

        vi.runAllTimers();
        expect(callCounts(spies)).toEqual(spies.map(() => 1));
    });

    it('deferDisposePastSubmit runs the callback on the next macrotask, exactly once', () => {
        const dispose = vi.fn();
        deferDisposePastSubmit(dispose);

        expect(dispose).not.toHaveBeenCalled(); // not synchronous
        vi.runAllTimers();
        expect(dispose).toHaveBeenCalledTimes(1); // bounded + guaranteed
    });

    it('deferDisposePastSubmit swallows a throw from an already-reclaimed resource', () => {
        deferDisposePastSubmit(() => { throw new Error('already reclaimed'); });
        expect(() => vi.runAllTimers()).not.toThrow();
    });
});
