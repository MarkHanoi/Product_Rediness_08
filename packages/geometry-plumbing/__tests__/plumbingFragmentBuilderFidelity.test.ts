/**
 * §FIX-PLUMB-SUBSTITUTION / §FIX-PLUMB-DISPOSE / §FIX-PLUMB-DEGENERATE
 * (L-11960 · L-11961 · L-11962)
 *
 * THE THREE DEFECTS THIS PINS, all measured in
 * audit/full-stack/2026-08-31/builders/plumbing.json against head d91d30d4:
 *
 *  1. SILENT SUBSTITUTION. The fixtureType dispatch was an if/else chain whose
 *     FINAL ELSE was createToiletMesh. `PlumbingFixtureType` has seven members;
 *     five have a factory. An authored 'urinal' or 'bidet' therefore drew a
 *     TOILET and announced nothing — the substitution C84/C100 prohibit.
 *  2. THE ONE DISPOSAL LEAK. `grep -cE 'dispose\(\)|safeDispose'` over the
 *     builder returned 0 — the only builder in the repo measured at zero. Both
 *     the UPDATE leg (root.clear()) and the DELETE leg (scene.remove) detached
 *     children and freed nothing, so every architect edit and every delete
 *     leaked that fixture's geometry and materials for the session.
 *  3. DEGENERATE INPUT. `data.width || 1.7` and `parseInt(color.replace(...))`
 *     turned an authored 0 / negative / NaN / non-hex colour into a catalogue
 *     default with no trace, and a negative that survived the `||` reached
 *     BoxGeometry.
 *
 * These assertions read the BUILT GEOMETRY and the GPU release queue, not a
 * store — a presence test on the store is exactly what the seven-fact chain
 * already does and exactly what could not see any of this.
 *
 * @vitest-environment happy-dom
 */
import * as THREE from '@pryzm/renderer-three/three';
import { pendingGpuReleaseCount, drainGpuReleaseQueue } from '@pryzm/renderer-three';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlumbingFragmentBuilder } from '../src/PlumbingFragmentBuilder';
import type { PlumbingFixtureData, PlumbingFixtureType } from '../src/PlumbingTypes';

const seed = (over: Partial<PlumbingFixtureData> = {}): PlumbingFixtureData => ({
    id: 'fx-1',
    type: 'plumbing_fixture',
    fixtureType: 'toilet',
    position: new THREE.Vector3(1, 0.4, 2),
    rotation: new THREE.Euler(0, 0, 0),
    levelId: 'L0',
    levelName: 'Ground Floor',
    levelElevation: 0,
    baseOffset: 0.4,
    properties: {},
    ...over,
});

/** Every BufferGeometry currently hanging under a root, in scene-graph order. */
function geometriesUnder(root: THREE.Object3D): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) out.push(m.geometry as THREE.BufferGeometry);
    });
    return out;
}

/** Does any vertex under this root carry a non-finite coordinate? */
function hasNonFiniteVertex(root: THREE.Object3D): boolean {
    for (const g of geometriesUnder(root)) {
        const pos = g.getAttribute('position');
        if (!pos) continue;
        const arr = pos.array as ArrayLike<number>;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return true;
    }
    return false;
}

describe('PlumbingFragmentBuilder — fidelity of the authored record in the BUILT mesh', () => {
    let scene: THREE.Scene;
    let builder: PlumbingFragmentBuilder;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new PlumbingFragmentBuilder(scene);
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
        vi.spyOn(console, 'log').mockImplementation(() => { /* silence */ });
        drainGpuReleaseQueue();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        drainGpuReleaseQueue();
    });

    // ── CONTROL ──────────────────────────────────────────────────────────────
    // `hasNonFiniteVertex` returning false is load-bearing below, so prove the
    // detector can say TRUE. A detector that always returned false would make
    // every NaN assertion pass vacuously.
    it('CONTROL — the NaN-vertex detector actually detects NaN', () => {
        expect(hasNonFiniteVertex(new THREE.Mesh(new THREE.BoxGeometry(Number.NaN, 1, 1)))).toBe(true);
        expect(hasNonFiniteVertex(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))).toBe(false);
    });

    // ── 1. SILENT SUBSTITUTION ───────────────────────────────────────────────

    it('§FIX-PLUMB-SUBSTITUTION — an authored bidet still DRAWS, and the built root NAMES both the authored type and the geometry actually drawn', () => {
        builder.updateFixture(seed({ id: 'bidet-1', fixtureType: 'bidet' }));

        const root = builder.fixtureRoots.get('bidet-1')!;
        expect(root).toBeDefined();
        // it draws (the stand-in is deliberately preserved — refusing to draw would
        // make a fixture that is visible today disappear)
        expect(geometriesUnder(root).length).toBeGreaterThan(0);

        // THE AUTHORED FIELD, ASSERTED IN THE BUILT GEOMETRY — not in the store.
        expect(root.userData.fixtureType).toBe('bidet');
        expect(root.userData.drawnGeometry).toBe('toilet');

        const v = builder.getBuildVerdict('bidet-1')!;
        expect(v.drew).toBe('substituted');
        expect(v.requestedFixtureType).toBe('bidet');
        expect(v.drawnGeometry).toBe('toilet');
        // BOTH numbers, by name (C74 / CA-18)
        expect(v.refusals.join(' ')).toMatch(/fixtureType/);
        expect(v.refusals.join(' ')).toMatch(/bidet/);
        expect(v.refusals.join(' ')).toMatch(/toilet/);
        expect(warn.mock.calls.flat().join(' ')).toMatch(/§FIX-PLUMB-SUBSTITUTION/);
    });

    it('§FIX-PLUMB-SUBSTITUTION — urinal is the second authored member with no factory, and is announced identically', () => {
        builder.updateFixture(seed({ id: 'ur-1', fixtureType: 'urinal' }));
        const v = builder.getBuildVerdict('ur-1')!;
        expect(v.drew).toBe('substituted');
        expect(v.requestedFixtureType).toBe('urinal');
        expect(builder.fixtureRoots.get('ur-1')!.userData.fixtureType).toBe('urinal');
    });

    it('§FIX-PLUMB-SUBSTITUTION — the announcement does not repeat on an unchanged rebuild', () => {
        const d = seed({ id: 'rep-1', fixtureType: 'bidet' });
        builder.updateFixture(d);
        builder.updateFixture(d);
        builder.updateFixture(d);
        expect(warn).toHaveBeenCalledTimes(1);
        // a CHANGE of type on the same fixture is news again
        builder.updateFixture(seed({ id: 'rep-1', fixtureType: 'urinal' }));
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('§FIX-PLUMB-SUBSTITUTION — a fixtureType this build has never heard of is named, not silently made a toilet', () => {
        builder.updateFixture(seed({ id: 'x-1', fixtureType: 'macerator' as PlumbingFixtureType }));
        const v = builder.getBuildVerdict('x-1')!;
        expect(v.drew).toBe('substituted');
        expect(v.requestedFixtureType).toBe('macerator');
    });

    it.each<PlumbingFixtureType>(['toilet', 'sink', 'bath', 'shower', 'accessory'])(
        '§FIX-PLUMB-SUBSTITUTION — %s has a factory of its own and reports EXACT with no refusals',
        (fixtureType) => {
            builder.updateFixture(seed({ id: 'ok-' + fixtureType, fixtureType }));
            const v = builder.getBuildVerdict('ok-' + fixtureType)!;
            expect(v.drew).toBe('exact');
            expect(v.refusals).toEqual([]);
            expect(v.drawnGeometry).toBe(fixtureType);
            expect(builder.fixtureRoots.get('ok-' + fixtureType)!.userData.fixtureType).toBe(fixtureType);
        },
    );

    it('§FIX-PLUMB-SUBSTITUTION — a fixtureType CHANGE re-stamps the built root (it was stamped only on the first build)', () => {
        builder.updateFixture(seed({ id: 'fx-9', fixtureType: 'sink' }));
        const root = builder.fixtureRoots.get('fx-9')!;
        expect(root.userData.fixtureType).toBe('sink');

        builder.updateFixture(seed({ id: 'fx-9', fixtureType: 'bath' }));
        // same reusable root — the builder keeps the THREE.Group across updates
        expect(builder.fixtureRoots.get('fx-9')).toBe(root);
        expect(root.userData.fixtureType).toBe('bath');
        expect(builder.getBuildVerdict('fx-9')!.drawnGeometry).toBe('bath');
    });

    // ── 2. DISPOSAL ──────────────────────────────────────────────────────────

    it('§FIX-PLUMB-DISPOSE — the UPDATE leg releases the geometry it replaces', () => {
        builder.updateFixture(seed({ id: 'd-1', fixtureType: 'sink' }));
        const first = geometriesUnder(builder.fixtureRoots.get('d-1')!);
        expect(first.length).toBeGreaterThan(0);
        const spies = first.map(g => vi.spyOn(g, 'dispose'));

        drainGpuReleaseQueue();
        expect(pendingGpuReleaseCount()).toBe(0);

        builder.updateFixture(seed({ id: 'd-1', fixtureType: 'sink' }));
        // detached NOW, released at the frame boundary (INVARIANT L2)
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
        expect(spies.every(s => s.mock.calls.length === 0)).toBe(true);

        drainGpuReleaseQueue();
        expect(spies.every(s => s.mock.calls.length > 0)).toBe(true);
    });

    it('§FIX-PLUMB-DISPOSE — the DELETE leg releases the geometry, and drops the verdict with it', () => {
        builder.updateFixture(seed({ id: 'd-2', fixtureType: 'bath' }));
        const geos = geometriesUnder(builder.fixtureRoots.get('d-2')!);
        expect(geos.length).toBeGreaterThan(0);
        const spies = geos.map(g => vi.spyOn(g, 'dispose'));
        drainGpuReleaseQueue();

        builder.removeFixture('d-2');
        expect(builder.fixtureRoots.has('d-2')).toBe(false);
        expect(builder.getBuildVerdict('d-2')).toBeUndefined();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);

        drainGpuReleaseQueue();
        expect(spies.every(s => s.mock.calls.length > 0)).toBe(true);
    });

    it('§FIX-PLUMB-DISPOSE — clearProjectGeometry routes through removeFixture, so the project sweep frees too', () => {
        builder.updateFixture(seed({ id: 'p-1', fixtureType: 'sink' }));
        builder.updateFixture(seed({ id: 'p-2', fixtureType: 'shower' }));
        const geos = [
            ...geometriesUnder(builder.fixtureRoots.get('p-1')!),
            ...geometriesUnder(builder.fixtureRoots.get('p-2')!),
        ];
        const spies = geos.map(g => vi.spyOn(g, 'dispose'));
        drainGpuReleaseQueue();

        builder.clearProjectGeometry();
        drainGpuReleaseQueue();
        expect(builder.fixtureRoots.size).toBe(0);
        expect(spies.every(s => s.mock.calls.length > 0)).toBe(true);
    });

    // ── 3. DEGENERATE INPUT ──────────────────────────────────────────────────

    it('§FIX-PLUMB-DEGENERATE — a NaN width is refused BY NAME and the built bath carries no non-finite vertex', () => {
        builder.updateFixture(seed({ id: 'b-1', fixtureType: 'bath', width: Number.NaN }));
        const v = builder.getBuildVerdict('b-1')!;
        expect(v.refusals.join(' ')).toMatch(/width/);
        expect(v.refusals.join(' ')).toMatch(/NaN/);
        expect(hasNonFiniteVertex(builder.fixtureRoots.get('b-1')!)).toBe(false);
        expect(warn.mock.calls.flat().join(' ')).toMatch(/§FIX-PLUMB-DEGENERATE/);
    });

    it('§FIX-PLUMB-DEGENERATE — a NEGATIVE width used to survive the || and reach BoxGeometry; it is now refused', () => {
        builder.updateFixture(seed({ id: 'b-2', fixtureType: 'bath', width: -1.2 }));
        const v = builder.getBuildVerdict('b-2')!;
        expect(v.refusals.join(' ')).toMatch(/width: authored -1\.2/);
        expect(hasNonFiniteVertex(builder.fixtureRoots.get('b-2')!)).toBe(false);
    });

    it('§FIX-PLUMB-DEGENERATE — a zero height leaves no interior above the rim, and says so', () => {
        builder.updateFixture(seed({ id: 'b-3', fixtureType: 'bath', height: 0 }));
        expect(builder.getBuildVerdict('b-3')!.refusals.join(' ')).toMatch(/height/);
    });

    it('§FIX-PLUMB-DEGENERATE — a non-hex colour is refused instead of becoming NaN inside THREE.Color', () => {
        builder.updateFixture(seed({ id: 'b-4', fixtureType: 'bath', color: 'red' }));
        const v = builder.getBuildVerdict('b-4')!;
        expect(v.refusals.join(' ')).toMatch(/color: authored "red"/);
    });

    it('§FIX-PLUMB-DEGENERATE — an AUTHORED, USABLE size reaches the mesh unchanged (the fix must not become a blanket default)', () => {
        builder.updateFixture(seed({ id: 'b-5', fixtureType: 'bath', width: 2.4, length: 0.9, height: 0.7, color: '#204060' }));
        const v = builder.getBuildVerdict('b-5')!;
        expect(v.refusals).toEqual([]);

        // measure the authored width OUT OF THE BUILT GEOMETRY
        const root = builder.fixtureRoots.get('b-5')!;
        const box = new THREE.Box3().setFromObject(root);
        expect(box.max.x - box.min.x).toBeCloseTo(2.4, 5);
        expect(box.max.z - box.min.z).toBeCloseTo(0.9, 5);

        // and the authored colour, off a real material in the built mesh
        let sawColour = false;
        root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh && m.material && !Array.isArray(m.material)) {
                const c = (m.material as THREE.MeshStandardMaterial).color;
                if (c) {
                    expect(c.getHexString()).toBe('204060');
                    sawColour = true;
                }
            }
        });
        expect(sawColour).toBe(true);
    });

    it('getBuildReport() ranks substitutions and refusals ahead of clean builds', () => {
        builder.updateFixture(seed({ id: 'r-ok', fixtureType: 'sink' }));
        builder.updateFixture(seed({ id: 'r-sub', fixtureType: 'bidet' }));
        const report = builder.getBuildReport();
        expect(report[0].fixtureId).toBe('r-sub');
        expect(report.every(r => r.hasRoot)).toBe(true);
    });
});
