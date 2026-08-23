// §SCENE6-EMPTY-DRAW-GUARD (L-10002) — AUDIT-C §2.6 row "Empty-draw guard": PRYZM 0 hits.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ THIS IS *NOT* THE SAME FAULT AS THE §L-10010 TSL CRASH — STATED UP FRONT
// ─────────────────────────────────────────────────────────────────────────────
//
// The two look like siblings because both end at "the WebGPU encoder is unhappy",
// and they are NOT one bug with one fix. Measured, both ways:
//
//   §L-10010 (TSL)  — a transmission NODE GRAPH generates invalid WGSL. The failure
//                     is in CODEGEN, before any draw is encoded, and three itself
//                     logs it (`three.webgpu.js:2141`) then substitutes a constant.
//                     A geometry with a full position buffer produces it, so this
//                     guard lets every one of those draws through — correctly.
//   L-10002 (this)  — a geometry with ZERO vertices is SUBMITTED. Codegen is fine;
//                     the draw call itself is degenerate. Chromium: "Draw with a
//                     vertex count of 0 is unusual."
//
// So neither fix serves the other, and the empty-draw guard does NOT prevent the
// founder's crash. It is worth having on its own evidence: Pascal's note
// (`viewer/index.tsx:109-144`, MIT) records that ONE degenerate mesh poisons the
// command encoder and flickers THE WHOLE CANVAS — a symptom with no visual
// relationship to its cause, which is the worst property a render defect can have.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⛔ THE DIRECTION OF DOUBT IS THE WHOLE DESIGN, AND IT IS WHAT THESE TESTS PIN
// ─────────────────────────────────────────────────────────────────────────────
//
// This guard SKIPS draws. A false positive does not cost frame time — it makes
// something the user authored DISAPPEAR, which is strictly worse than the flicker
// it prevents. So the "draws it anyway" arm below is the load-bearing half of this
// file, not the happy path: every shape the predicate does not positively prove
// empty must survive.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
    installEmptyDrawGuard,
    emptyDrawReason,
    getEmptyDrawGuardStats,
    resetEmptyDrawGuardStats,
    type RenderObjectArgs,
} from '../src/EmptyDrawGuard.js';

beforeEach(() => resetEmptyDrawGuardStats());

const obj = (): THREE.Object3D => new THREE.Mesh();

function geomWith(vertices: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
    return g;
}

/** A three-r183-shaped renderer exposing exactly the hook the guard binds to. */
function makeRenderer() {
    const drawn: string[] = [];
    let installed: ((...a: RenderObjectArgs) => void) | null = null;
    const renderer = {
        getRenderObjectFunction: () => installed,
        setRenderObjectFunction: (fn: ((...a: RenderObjectArgs) => void) | null) => { installed = fn; },
        // three's own default, reached when nothing is installed.
        renderObject: (...a: RenderObjectArgs) => { drawn.push((a[0] as THREE.Object3D).uuid); },
    };
    const submit = (
        o: THREE.Object3D,
        g: THREE.BufferGeometry,
        group: { start: number; count: number } | null = null,
    ): void => {
        const fn = installed ?? renderer.renderObject;
        fn(o, new THREE.Scene(), new THREE.Camera(), g, new THREE.MeshBasicMaterial(), group, null);
    };
    return { renderer, drawn, submit };
}

describe('§SCENE6-EMPTY-DRAW-GUARD — proves the draw is empty, or draws it', () => {

    it('SKIPS every shape that provably submits zero vertices', () => {
        const noPosition = new THREE.BufferGeometry();
        expect(emptyDrawReason(obj(), noPosition, null)).toBe('no position attribute');

        expect(emptyDrawReason(obj(), geomWith(0), null)).toBe('position.count === 0');

        const emptyIndex = geomWith(3);
        emptyIndex.setIndex(new THREE.BufferAttribute(new Uint16Array(0), 1));
        expect(emptyDrawReason(obj(), emptyIndex, null)).toBe('index.count === 0');

        // The clause a geometry-merge batcher produces when every member of a run is
        // released: the buffer is intact and ONE group range collapsed to zero.
        expect(emptyDrawReason(obj(), geomWith(3), { start: 0, count: 0 })).toBe('group.count === 0');

        const zeroRange = geomWith(3);
        zeroRange.setDrawRange(0, 0);
        expect(emptyDrawReason(obj(), zeroRange, null)).toBe('drawRange.count === 0');

        const im = new THREE.InstancedMesh(geomWith(3), new THREE.MeshBasicMaterial(), 4);
        im.count = 0;
        expect(emptyDrawReason(im, im.geometry, null)).toBe('InstancedMesh.count === 0');
    });

    it('DRAWS everything it cannot prove empty — the arm that protects real geometry', () => {
        // An ordinary mesh.
        expect(emptyDrawReason(obj(), geomWith(3), null)).toBeNull();
        // A non-empty group inside a multi-material geometry.
        expect(emptyDrawReason(obj(), geomWith(9), { start: 3, count: 3 })).toBeNull();
        // A populated index.
        const indexed = geomWith(3);
        indexed.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
        expect(emptyDrawReason(obj(), indexed, null)).toBeNull();
        // `drawRange.count` defaults to Infinity — never mistake the default for 0.
        expect(geomWith(3).drawRange.count).toBe(Infinity);
        // An InstancedMesh with instances.
        const im = new THREE.InstancedMesh(geomWith(3), new THREE.MeshBasicMaterial(), 4);
        expect(emptyDrawReason(im, im.geometry, null)).toBeNull();
        // Shapes the predicate does NOT understand fall through to "draw it".
        expect(emptyDrawReason(obj(), null, null)).toBeNull();
        expect(emptyDrawReason(obj(), undefined, null)).toBeNull();
        // A Points/Line geometry is just a position buffer — must survive.
        expect(emptyDrawReason(new THREE.Points(), geomWith(1), null)).toBeNull();
    });

    it('CHAINS onto an already-installed function instead of replacing it', () => {
        const { renderer, drawn, submit } = makeRenderer();

        // three installs its own for MRT / post-processing passes. Replacing rather
        // than chaining would silently disable whichever pass installed first.
        const passCalls: string[] = [];
        renderer.setRenderObjectFunction((...a: RenderObjectArgs) => {
            passCalls.push('pass');
            renderer.renderObject(...a);
        });

        const handle = installEmptyDrawGuard(renderer);
        expect(handle).not.toBeNull();

        const good = obj();
        submit(good, geomWith(3));
        expect(passCalls).toEqual(['pass']);          // the earlier pass still ran
        expect(drawn).toEqual([good.uuid]);

        submit(obj(), geomWith(0));
        expect(passCalls).toEqual(['pass']);          // skipped BEFORE the chain
        expect(drawn).toHaveLength(1);
    });

    it('delegates to renderer.renderObject when nothing was installed', () => {
        const { renderer, drawn, submit } = makeRenderer();
        installEmptyDrawGuard(renderer);
        const good = obj();
        submit(good, geomWith(3));
        expect(drawn).toEqual([good.uuid]);
    });

    it('uninstall() restores the previous function EXACTLY — null included', () => {
        const { renderer } = makeRenderer();
        // `null` is meaningful to three: "use my own renderObject"
        // (three.webgpu.js:58174 `this._renderObjectFunction || this.renderObject`).
        expect(renderer.getRenderObjectFunction()).toBeNull();
        const handle = installEmptyDrawGuard(renderer)!;
        expect(renderer.getRenderObjectFunction()).not.toBeNull();
        handle.uninstall();
        expect(renderer.getRenderObjectFunction()).toBeNull();

        const prior = (): void => { /* a pass's own function */ };
        renderer.setRenderObjectFunction(prior);
        installEmptyDrawGuard(renderer)!.uninstall();
        expect(renderer.getRenderObjectFunction()).toBe(prior);
    });

    it('counts what it skipped, without a (window as any) publication (P4)', () => {
        const { renderer, submit } = makeRenderer();
        installEmptyDrawGuard(renderer);
        submit(obj(), geomWith(3));
        submit(obj(), geomWith(0));
        const s = getEmptyDrawGuardStats();
        expect(s.inspected).toBe(2);
        expect(s.skipped).toBe(1);
        expect(s.lastReason).toBe('position.count === 0');
    });

    it('returns null — never throws — on a renderer with no hook (the webgl-only rung)', () => {
        expect(installEmptyDrawGuard(null)).toBeNull();
        expect(installEmptyDrawGuard(undefined)).toBeNull();
        // A classic THREE.WebGLRenderer has no setRenderObjectFunction.
        expect(installEmptyDrawGuard({} as never)).toBeNull();
    });

    it('reports the skip to an observer so a transient is visible, not repaired', () => {
        const { renderer, submit } = makeRenderer();
        const onSkip = vi.fn();
        installEmptyDrawGuard(renderer, { onSkip });
        const degenerate = obj();
        submit(degenerate, geomWith(0));
        expect(onSkip).toHaveBeenCalledWith('position.count === 0', degenerate);
    });
});
