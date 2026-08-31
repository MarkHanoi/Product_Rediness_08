/**
 * §OBC-SEAM binding test (Axis 7 Wave A, 2026-08-31).
 *
 * ONE focused suite proving the seam BINDS:
 *   1. type-level — the REAL `@thatopen/components` shapes are assignable to
 *      the structural seam types (checked by `tsc -p tsconfig.json --noEmit`:
 *      the package tsconfig includes `src/**\/*`, so this file IS in the
 *      program and a broken assignability turns the const initializers below
 *      into compile errors);
 *   2. runtime — each seam member delegates to the ADOPTED instance/namespace
 *      (recording doubles sit at the binding boundary; the OBC namespace
 *      itself is REAL and unmocked).
 *
 * This file lives under `__tests__/` DELIBERATELY:
 * `tools/ga-gate/check-layer-boundaries.ts` excludes paths containing
 * `__tests__`, so the real `@thatopen/components` import below does not move
 * the §FIX-RESTRICTED-IMPORT-RATCHET count (124/113 RED, shrink-only, at seam
 * mint time). Colocated `*.test.ts` files outside `__tests__/` ARE counted —
 * that is how 7 dynamic type-position imports in src/drawing tests ended up
 * inside the 124.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// `@thatopen/components-front` is imported by ../BimWorld.ts at module scope
// but used only inside createBimWorld(), which this suite never calls. Mocked
// so the suite does not drag the postproduction renderer into a headless run.
// The binding boundary under test — `@thatopen/components` — stays REAL.
vi.mock('@thatopen/components-front', () => ({}));

import * as OBC from '@thatopen/components';
import * as THREE from '@pryzm/renderer-three/three';
import {
    getSceneRaycaster,
    isManualRenderer,
    projectToDrawingSpace,
    requestManualFrame,
} from '../ObcSeam.js';
import type {
    ComponentsHandle,
    DrawingSurface,
    SeamCamera,
    SeamWorld,
} from '../ObcSeamTypes.js';

// ── 1. Type-level: the REAL OBC shapes satisfy the structural seam types ────
// A `false` verdict makes each initializer a type error (Type 'true' is not
// assignable to type 'false'), failing the package typecheck.
type Extends<A, B> = A extends B ? true : false;
const worldIsSeamWorld: Extends<OBC.World, SeamWorld> = true;
const simpleCameraIsSeamCamera: Extends<OBC.SimpleCamera, SeamCamera> = true;
const technicalDrawingIsDrawingSurface: Extends<OBC.TechnicalDrawing, DrawingSurface> = true;
const componentsIsHandle: Extends<OBC.Components, ComponentsHandle> = true;

function makeWorld(renderer: unknown): SeamWorld {
    return {
        scene: { three: new THREE.Scene() },
        camera: { three: new THREE.PerspectiveCamera(), controls: { enabled: true } },
        renderer,
    } as SeamWorld;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('§OBC-SEAM — the seam binds to the real @thatopen/components surface', () => {
    it('holds the type-level verdicts computed at compile time', () => {
        expect(worldIsSeamWorld).toBe(true);
        expect(simpleCameraIsSeamCamera).toBe(true);
        expect(technicalDrawingIsDrawingSurface).toBe(true);
        expect(componentsIsHandle).toBe(true);
    });

    it('projectToDrawingSpace delegates to the REAL OBC.TechnicalDrawing.toDrawingSpace static, args and return passing through by identity', () => {
        const projected = new THREE.LineSegments();
        const spy = vi
            .spyOn(OBC.TechnicalDrawing, 'toDrawingSpace')
            .mockReturnValue(projected as never);
        const lines = new THREE.LineSegments();
        const drawing = {
            layers: {
                has: (): boolean => false,
                create: (): object => ({}),
                get: (): undefined => undefined,
            },
            addProjectionLines: (ls: THREE.LineSegments) => ls,
        } as unknown as DrawingSurface;

        const out = projectToDrawingSpace(lines, drawing);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toBe(lines);
        // Identity passthrough — the seam adopts the caller's drawing, it
        // does not wrap or copy it.
        expect(spy.mock.calls[0][1]).toBe(drawing);
        expect(out).toBe(projected);
    });

    it('requestManualFrame flips needsUpdate ONLY for a renderer in the REAL OBC.RendererMode.MANUAL mode', () => {
        const manual = { mode: OBC.RendererMode.MANUAL, needsUpdate: false, three: {} };
        const wManual = makeWorld(manual);
        expect(isManualRenderer(wManual)).toBe(true);
        expect(requestManualFrame(wManual)).toBe(true);
        expect(manual.needsUpdate).toBe(true);

        // AUTO renderer: untouched. This also proves the seam compares
        // against the real enum member (MANUAL === 0 is falsy — a truthiness
        // implementation would get this wrong in the opposite direction).
        const auto = { mode: OBC.RendererMode.AUTO, needsUpdate: false };
        const wAuto = makeWorld(auto);
        expect(isManualRenderer(wAuto)).toBe(false);
        expect(requestManualFrame(wAuto)).toBe(false);
        expect(auto.needsUpdate).toBe(false);

        // No renderer at all (OBC World.renderer is BaseRenderer | null).
        expect(isManualRenderer(makeWorld(null))).toBe(false);
        expect(requestManualFrame(makeWorld(null))).toBe(false);

        // MANUAL renderer WITHOUT a needsUpdate member — the `'needsUpdate'
        // in renderer` guard every call site carries today must survive in
        // the seam: no repaint requested, no property invented.
        const bare = { mode: OBC.RendererMode.MANUAL };
        expect(requestManualFrame(makeWorld(bare))).toBe(false);
        expect('needsUpdate' in bare).toBe(false);
    });

    it('getSceneRaycaster resolves via the REAL OBC.Raycasters token against the ADOPTED components handle and hands back .three', () => {
        const sentinel = new THREE.Raycaster();
        const seen: { token?: unknown; world?: unknown; gets: number } = { gets: 0 };
        const world = makeWorld(null);
        // Recording double at the binding boundary — stands in for THE one
        // live OBC.Components instance (createBimWorld() needs a browser).
        const components: ComponentsHandle = {
            get(token: unknown) {
                seen.gets += 1;
                seen.token = token;
                return {
                    get(w: unknown) {
                        seen.world = w;
                        return { three: sentinel };
                    },
                };
            },
        };

        const out = getSceneRaycaster(components, world);

        // Exactly one resolution against the caller's handle — the seam
        // adopted it and constructed no second Components.
        expect(seen.gets).toBe(1);
        // The REAL class token — not a rename, copy, or re-declaration.
        expect(seen.token).toBe(OBC.Raycasters);
        // World identity passes through untouched (OBC keys per-world
        // raycasters on world identity).
        expect(seen.world).toBe(world);
        expect(out).toBe(sentinel);
    });
});
