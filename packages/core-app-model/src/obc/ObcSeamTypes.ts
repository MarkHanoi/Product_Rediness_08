/**
 * §OBC-SEAM (Axis 7 Wave A, 2026-08-31) — structural seam TYPES over the
 * `@thatopen/components` (OBC) surface that geometry-* tools and plan/elevation
 * symbol builders actually consume.
 *
 * PURITY CONTRACT — this file imports NOTHING from `@thatopen/*`, not even in
 * type position. `tools/ga-gate/check-layer-boundaries.ts`
 * (§FIX-RESTRICTED-IMPORT-RATCHET) counts every `@thatopen/components`
 * specifier outside `plugins/ifc-import/`, type positions included, and the
 * ratchet is shrink-only (124 measured at seam-mint time against baseline
 * 113). The runtime face of the seam (projectToDrawingSpace /
 * requestManualFrame / isManualRenderer / getSceneRaycaster) lives beside the
 * ONE `OBC.Components` instance owner in `../BimWorld.ts` — the only module
 * here that already imports OBC — and is re-exported through `./ObcSeam.ts`.
 *
 * The interfaces model the MEASURED member surface only (scout table:
 * audit/full-stack/2026-08-31/_p5/obc-seam-scout.md): `world.scene.three`
 * ×126, `world.camera.three` ×34, `world.camera.controls.enabled` ×27,
 * `world.renderer.three` ×3, `renderer.mode` ×7, `renderer.needsUpdate` ×9,
 * `drawing.layers.has/create/get` + `drawing.addProjectionLines` ×19.
 *
 * DELIBERATELY LOOSE where the real OBC declarations are loose (scout risk 2,
 * verified against @thatopen/components@3.4.x d.ts):
 *   - `World.scene` is `BaseScene`, whose `three` is `THREE.Object3D` — NOT
 *     `THREE.Scene`. Demanding `Scene` here would make the real `OBC.World`
 *     unassignable.
 *   - `World.camera` is `BaseCamera`, which declares no `controls`; only the
 *     concrete `SimpleCamera`/`OrthoPerspectiveCamera` add them. Hence
 *     `controls` is optional.
 *   - `World.renderer` is `BaseRenderer | null`, whose declared type has
 *     neither `mode` nor `needsUpdate` — the runtime seam probes those
 *     structurally, exactly as today's call sites do with their
 *     `'needsUpdate' in renderer` guards.
 * Assignability of the REAL shapes is asserted at compile time in
 * `__tests__/ObcSeam.test.ts`.
 *
 * ⚠ NAME RIVAL — there is deliberately NO exported type named `RendererMode`:
 * `packages/renderer/src/Renderer.ts:29` already exports a `RendererMode`
 * with different semantics (`'auto' | 'webgpu' | 'webgl2'`, re-exported by
 * plugin-sdk). The seam must never mint a rival for that name.
 */
import type * as THREE from '@pryzm/renderer-three/three';

/**
 * The camera-controls sub-surface tools touch: `.enabled` only (×27 measured
 * sites — enable/disable orbit while a tool gesture owns the pointer).
 */
export interface SeamCameraControls {
    enabled: boolean;
}

/**
 * Structural stand-in for `OBC.SimpleCamera` in type-only positions
 * (input-host `SelectionManager` and friends read `.three` only).
 */
export interface SeamCamera {
    readonly three: THREE.Camera;
}

/**
 * Structural stand-in for `OBC.World` in tool constructor/param positions.
 * Only the measured member surface is modeled; see the file header for why
 * each looseness is load-bearing.
 */
export interface SeamWorld {
    readonly scene: { readonly three: THREE.Object3D };
    readonly camera: {
        readonly three: THREE.Camera;
        readonly controls?: SeamCameraControls | null;
    };
    readonly renderer?: {
        readonly three?: THREE.WebGLRenderer;
    } | null;
}

/**
 * The narrow per-layer record builders reach via `drawing.layers.get(name)`
 * (recolouring a shared layer material via `material.color.setHex(...)`).
 */
export interface SeamDrawingLayer {
    material?: { color: { setHex(hex: number): void } };
}

/**
 * Structural stand-in for `OBC.TechnicalDrawing` in symbol-builder parameter
 * positions. Real `drawing.layers` is a `DataMap extends Map<string,
 * DrawingLayer>`, so `has`/`get` come from `Map` and `create` from
 * `DrawingLayers` — all satisfied structurally by width subtyping.
 */
export interface DrawingSurface {
    readonly layers: {
        has(name: string): boolean;
        create(name: string, options?: unknown): unknown;
        get(name: string): SeamDrawingLayer | undefined;
    };
    addProjectionLines(lines: THREE.LineSegments, layer?: string): THREE.LineSegments;
}

/**
 * Opaque handle to THE one live `OBC.Components` instance — constructed once
 * in `createBimWorld()` (`../BimWorld.ts`) and handed to tools by
 * `apps/editor/src/engine/initTools.ts`. The seam ADOPTS this instance
 * (§BLSTORE precedent: adoption, never construction); nothing in the seam may
 * construct a second `Components`. Only `.get(token)` is modeled, and only
 * the seam runtime (`getSceneRaycaster`) should call it — consumers pass the
 * handle through untouched.
 */
export interface ComponentsHandle {
    get(componentClass: unknown): unknown;
}
