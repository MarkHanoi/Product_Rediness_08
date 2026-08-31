/**
 * §FIX-BEAM-DEGENERATE (L-11963) — A BEAM THAT CANNOT BE DRAWN SAYS SO.
 *
 * ─── ⛔ THE DEFECT ──────────────────────────────────────────────────────────
 *
 * Measured at head d91d30d4 (audit/full-stack/2026-08-31/builders/beam.json):
 * `BeamFragmentBuilder` carried ZERO `isFinite`/`isNaN` checks and ZERO `throw`
 * across 634 lines. Two outcomes, and only the first was visible in the source:
 *
 *   (a) a ZERO-LENGTH beam returned a bare `THREE.Object3D` that was added to the
 *       scene and registered in `elementRegistry` exactly like a beam that drew.
 *       Present to every registry, absent from the screen, and NOTHING said so.
 *   (b) a NON-FINITE endpoint or section slipped PAST that guard, because
 *       `dir.length()` is NaN and `NaN < 0.001` is false. `BoxGeometry(NaN, NaN,
 *       NaN)` then produced a mesh whose every vertex is NaN — invisible,
 *       un-pickable, and indistinguishable from a beam that had not built yet.
 *
 * This suite drives the PRODUCTION builder and reads the BUILT SCENE GRAPH: the
 * vertices of the mesh it returns, and the verdict it records. A store assertion
 * could not see either half — which is the whole point of the fidelity axis.
 *
 * ⚠ THE SCENE-GRAPH OUTCOME FOR (a) IS DELIBERATELY UNCHANGED. The dummy is still
 * added and still registered, because downstream selection and the level-cleanup
 * handler resolve the id through those maps. What is new is the announcement.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { BeamFragmentBuilder } from '../src/BeamFragmentBuilder';
import type { BeamData } from '@pryzm/core-app-model/stores';

function makeBeam(over: Partial<BeamData> = {}): BeamData {
    return {
        id: 'beam-1',
        levelId: 'level-1',
        startPoint: { x: 0, y: 3, z: 0 },
        endPoint: { x: 4, y: 3, z: 0 },
        width: 0.3,
        depth: 0.5,
        loadBearing: true,
        sectionType: 'rectangular',
        properties: {},
        ...over,
    } as BeamData;
}

/** True when ANY vertex under this object carries a non-finite coordinate. */
function hasNonFiniteVertex(root: THREE.Object3D): boolean {
    let bad = false;
    root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        const pos = (m.geometry as THREE.BufferGeometry).getAttribute('position');
        if (!pos) return;
        const arr = pos.array as ArrayLike<number>;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad = true; return; }
    });
    return bad;
}

function meshCount(root: THREE.Object3D): number {
    let n = 0;
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
    return n;
}

describe('BeamFragmentBuilder — degenerate records are REFUSED BY NAME, never drawn as NaN', () => {
    let scene: THREE.Scene;
    let builder: BeamFragmentBuilder;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new BeamFragmentBuilder(scene);
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
    });
    afterEach(() => vi.restoreAllMocks());

    // ── CONTROL ──────────────────────────────────────────────────────────────
    // `hasNonFiniteVertex` returning false is the load-bearing assertion below, so
    // prove the detector can say TRUE. Without this, a detector that always
    // returned false would make every NaN assertion pass vacuously — the exact
    // shape of a test that cannot falsify its own claim.
    it('CONTROL — the NaN detector actually detects NaN', () => {
        const nanMesh = new THREE.Mesh(new THREE.BoxGeometry(Number.NaN, 1, 1));
        expect(hasNonFiniteVertex(nanMesh)).toBe(true);
        expect(hasNonFiniteVertex(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))).toBe(false);
    });

    it('a WELL-FORMED beam still builds, and the authored section reaches the vertices', () => {
        const root = builder.build(makeBeam({ width: 0.3, depth: 0.5 }));
        expect(meshCount(root)).toBeGreaterThan(0);
        expect(hasNonFiniteVertex(root)).toBe(false);

        // the AUTHORED width/depth, measured OUT OF THE BUILT GEOMETRY (the beam
        // runs along +X, so the box's local x=width and y=depth map to world y/z)
        const box = new THREE.Box3().setFromObject(root);
        expect(box.max.x - box.min.x).toBeCloseTo(4, 3);   // the authored length
        expect(box.max.y - box.min.y).toBeCloseTo(0.5, 3); // the authored depth
        expect(box.max.z - box.min.z).toBeCloseTo(0.3, 3); // the authored width

        const v = builder.getBuildVerdict('beam-1')!;
        expect(v.state).toBe('built');
        expect(warn).not.toHaveBeenCalled();
    });

    it('⛔ a NON-FINITE endpoint used to slip past `length < 0.001` and mint a NaN mesh', () => {
        const root = builder.build(makeBeam({ id: 'nan-1', endPoint: { x: Number.NaN, y: 3, z: 0 } }));

        // THE REGRESSION THIS PINS: not one NaN vertex anywhere.
        expect(hasNonFiniteVertex(root)).toBe(false);
        expect(meshCount(root)).toBe(0);

        const v = builder.getBuildVerdict('nan-1')!;
        expect(v.state).toBe('refused-degenerate');
        expect(v.detail).toMatch(/endPoint\.x is NaN/);
        expect(root.userData.buildRefusal).toMatch(/endPoint\.x is NaN/);
        expect(warn.mock.calls.flat().join(' ')).toMatch(/§FIX-BEAM-DEGENERATE/);
        // ...and it is still registered, so selection and level cleanup still resolve it
        expect(scene.children).toContain(root);
    });

    it('an INFINITE start coordinate is refused with the same channel', () => {
        builder.build(makeBeam({ id: 'inf-1', startPoint: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 } }));
        expect(builder.getBuildVerdict('inf-1')!.state).toBe('refused-degenerate');
        expect(builder.getBuildVerdict('inf-1')!.detail).toMatch(/startPoint\.y is Infinity/);
    });

    it('a ZERO-LENGTH beam was ALREADY invisible — now it is invisible AND named, with the tolerance quoted', () => {
        const root = builder.build(makeBeam({ id: 'zero-1', endPoint: { x: 0, y: 3, z: 0 } }));
        expect(meshCount(root)).toBe(0);
        const v = builder.getBuildVerdict('zero-1')!;
        expect(v.state).toBe('refused-degenerate');
        expect(v.detail).toMatch(/same point/);
        expect(v.detail).toMatch(/0\.001/);
    });

    it.each([
        ['width', Number.NaN],
        ['width', 0],
        ['width', -0.3],
        ['depth', Number.NaN],
        ['depth', 0],
    ] as Array<['width' | 'depth', number]>)(
        'a %s of %s is refused by name, with the authored value quoted',
        (field, value) => {
            const id = 'sec-' + field + '-' + String(value);
            builder.build(makeBeam({ id, [field]: value } as Partial<BeamData>));
            const v = builder.getBuildVerdict(id)!;
            expect(v.state).toBe('refused-degenerate');
            expect(v.detail).toContain(field);
            expect(v.detail).toContain(String(value));
        },
    );

    it('the announcement does not repeat on an unchanged rebuild — a drag must not print sixty identical lines', () => {
        const b = makeBeam({ id: 'rep-1', width: Number.NaN });
        builder.build(b);
        builder.build(b);
        builder.build(b);
        expect(warn).toHaveBeenCalledTimes(1);
        // ...but a DIFFERENT reason on the same beam is news again
        builder.build(makeBeam({ id: 'rep-1', endPoint: { x: 0, y: 3, z: 0 } }));
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('remove() drops the verdict with the element — a verdict never outlives its beam', () => {
        builder.build(makeBeam({ id: 'rm-1' }));
        expect(builder.getBuildVerdict('rm-1')).toBeDefined();
        builder.remove('rm-1');
        expect(builder.getBuildVerdict('rm-1')).toBeUndefined();
    });

    it('getBuildReport() puts the refusals first and measures hasMesh from the live map', () => {
        builder.build(makeBeam({ id: 'ok-1' }));
        builder.build(makeBeam({ id: 'bad-1', width: Number.NaN }));
        const report = builder.getBuildReport();
        expect(report[0].beamId).toBe('bad-1');
        expect(report.every(r => r.hasMesh)).toBe(true); // both register a root
    });
});
