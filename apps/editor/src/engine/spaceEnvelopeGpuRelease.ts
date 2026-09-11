/**
 * spaceEnvelopeGpuRelease — THE ONE WAY an envelope-edit producer lets go of GPU memory.
 *
 * §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) · §GPU-RESOURCE-LIFETIME INVARIANTS L1 + L2
 * (ADR-0281 / ADR-0297) · C04 §3.1.2a rules 2 + 7 · C114 §10 · C84 EI-9 · P2.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S WHITE WebGPU VIEWPORT AFTER DRAGGING ENVELOPE FACES
 * ═══════════════════════════════════════════════════════════════════════════════
 *   PIPELINE_FAILURE reason="Failed to execute 'setIndexBuffer' on 'GPURenderPassEncoder':
 *     parameter 1 is not of type 'GPUBuffer'."  … at _renderTransparents …
 *
 * `SpaceEnvelopeMeshBuilder.removeSpaceEnvelope` — which runs on EVERY preview frame of a
 * face drag, on every committed redraw off `subscribeDirty`, and on teardown — tore down in
 * the INVERTED order ADR-0297 L2 forbids:
 *
 *   1. RAW `geometry.dispose()` on every face WHILE the group was still parented to the
 *      scene. three r183.2 `Geometries.initGeometry`'s onDispose (Geometries.js:185-216)
 *      deletes the index/vertex attribute records and destroys their GPUBuffers at once,
 *      and leaves `initialized === true`, so nothing re-initialises the geometry later;
 *   2. RAW `material.dispose()` — the label sprite's, then the faces' shared one. On the
 *      WebGPU backend after a live renderer swap (the founder's exact precondition) or a
 *      recovery, a stale `RenderObject.onMaterialDispose` → `NodeManager.delete` reads
 *      `this.get(object).nodeBuilderState.usedTimes` off a torn-down record
 *      (NodeManager.js:271-272) and THROWS — the §I2 family `safeDispose*` exists for;
 *   3. only THEN `group.removeFromParent()`.
 *
 * When (2) throws, (3) never runs. The prism stays in the scene with every face geometry
 * destroyed, and `_groups` still maps its id to it, so every later redraw walks into the
 * same trap. It is translucent (`transparent` + `DoubleSide`), so it is drawn in
 * `_renderTransparents`, and its caps are indexed `ShapeGeometry`. Its render objects share
 * ONE `NodeMaterialObserver` with every sibling of the same program (RenderObject.js:388-390
 * — the observer lives on the cached `NodeBuilderState`), so once a sibling has claimed this
 * `renderId`, `needsRefresh` answers false for an unchanged record
 * (NodeMaterialObserver.js:589-613), `_geometries.updateForRender` is SKIPPED
 * (Renderer.js:3381-3390), and `WebGPUBackend.draw` reads `this.get(index).buffer` from the
 * deleted record → `undefined` → `setIndexBuffer(undefined)` (WebGPUBackend.js:1541-1544).
 * Transparent sort order changes with the camera, which is why it took several drags.
 *
 * ⚠ THE PRISM IS THE ONLY STRANDING PATH. A raw `geometry.dispose()` alone cannot raise the §I2
 * throw (three's `RenderObject.onGeometryDispose` only nulls its attribute cache), so what makes
 * the inversion observable is the MATERIAL dispose between free and detach. The face gizmo's old
 * `clear()` freed and detached in one synchronous tick, which no frame can observe, and its old
 * `dispose()` could strand only an EMPTY root. The gizmo goes through this helper as HARDENING,
 * so the family's one order is written once.
 *
 * ⚠ AND THE WHITE THAT PERSISTED IS A SECOND DEFECT, in the frame owner: the frame that threw
 * also stranded the renderer on the scene pass's render target, so even the rebuilt pipeline
 * composited off the canvas. That half is fixed in `@pryzm/renderer-three`
 * (`pipeline/renderFrameUnwind.ts`, §FRAME-THROW-STRANDS-RENDER-STATE).
 *
 * ⭐ THE FIX IS THE ORDER, AND IT IS WRITTEN ONCE, HERE — NOT AT EACH CALL SITE.
 *   ① DETACH first, unconditionally, before anything that can throw (L2 (a)).
 *   ② RELEASE through the repo's ONE funnel — `scheduleGpuRelease` → `drainGpuReleaseQueue()`
 *      at the top of `RenderPipelineManager.render()` (L2 (b), C04 §2: the frame owner owns
 *      the boundary) — where `safeDispose*` also SWALLOWS the §I2 throw instead of letting it
 *      abort a teardown.
 * Every envelope-edit producer — the drag preview, the preview restore, the committed
 * redraw, the gizmo re-target / clear / dispose, and the render-attach teardown — reaches GPU
 * memory only through the two builders' teardown, and the two builders reach it only through
 * this module. `spaceEnvelopeEditGpuLifetime.spec.ts` gates that no envelope producer calls a
 * GPU `dispose()` of its own.
 *
 * ⛔ NOT A RIVAL OF `detachAndReleaseChildren`. That helper empties a root the CALLER keeps.
 * An envelope group is ONE child of the SHARED scene, which must be left alone; this composes
 * the same two primitives (`removeFromParent`, `scheduleGpuRelease`) in the same order for a
 * single subtree.
 *
 * ⛔ AND NO THREE VALUE IMPORT (P2). Types only — the release itself is `@pryzm/renderer-three`'s.
 *
 * NOTE on OTel spans (P8 / C10 §2): intentionally span-free, for the reason `safeDispose.ts`
 * states for the funnel it wraps — a synchronous per-pointermove teardown on the render path,
 * outside the handler zones `check-otel-spans.ts` gates, where a span per call is a perf footgun.
 */

import { scheduleGpuRelease } from '@pryzm/renderer-three';
import type { BufferGeometry, Material, Object3D, Texture } from '@pryzm/renderer-three/three';

export interface ReleaseSpaceEnvelopeObjectOptions {
    /**
     * Release the materials the subtree's meshes and sprites carry, each ONCE (the prism's
     * faces share one material, and freeing it `n + 2` times is exactly what the old body's
     * comment warned against). `false` for a builder whose materials OUTLIVE the subtree —
     * the gizmo's two shared arrow materials — which hands them in `ownedMaterials` when the
     * builder itself is torn down.
     *
     * ⚠ With `true`, a SPRITE's `map` goes too: the only sprite an envelope subtree carries is
     * the label `SpaceEnvelopeMeshBuilder._label` mints, with its own per-label CanvasTexture.
     * That is a fact about THIS family, which is why the rule lives here and not in
     * `safeDisposeObject3D` (whose textures may be cache-shared).
     */
    readonly disposeMaterials: boolean;
    /** Materials the CALLER owns that are not reachable from `root` (a builder's shared pair). */
    readonly ownedMaterials?: readonly Material[];
}

/**
 * §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) — take an envelope subtree out of the scene NOW and
 * release its GPU resources at the NEXT frame boundary.
 *
 * Nothing here touches the GPU: enqueueing is O(1), so this is safe from a pointermove, a
 * store-dirty listener or a teardown — the property the old in-place `dispose()` lacked.
 * THREE's shared `Sprite` geometry is never freed (`safeDisposeObject3D` skips it, L1).
 */
export function releaseSpaceEnvelopeObject(
    root: Object3D | null | undefined,
    opts: ReleaseSpaceEnvelopeObjectOptions,
): void {
    if (!root) return;

    // ① DETACH — first, and before anything that can throw. After this line no draw list the
    //    renderer builds can reach this subtree, so the release below is unobservable to it.
    root.removeFromParent();

    // ② COLLECT what the subtree owns beyond its geometries, each exactly once.
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    if (opts.disposeMaterials) {
        root.traverse((node: Object3D) => {
            const carrier = node as unknown as {
                readonly material?: Material | readonly Material[] | null;
                readonly isSprite?: boolean;
            };
            const raw = carrier.material;
            if (!raw) return;
            const list: readonly Material[] = Array.isArray(raw) ? raw : [raw as Material];
            for (const m of list) {
                if (!m) continue;
                materials.add(m);
                if (carrier.isSprite === true) {
                    const map = (m as unknown as { readonly map?: Texture | null }).map;
                    if (map) textures.add(map);
                }
            }
        });
    }
    for (const m of opts.ownedMaterials ?? []) materials.add(m);

    // ③ RELEASE at the frame boundary: the geometries by subtree walk (materials excluded —
    //    they are released once each below), then the materials, then the owned textures.
    scheduleGpuRelease(root, false);
    for (const m of materials) scheduleGpuRelease(m);
    for (const t of textures) scheduleGpuRelease(t);
}

/**
 * §ENVELOPE-EDIT-GPU-LIFETIME — release ONE resource an envelope producer minted but never
 * attached (e.g. a cap geometry the triangulator left empty). Routed through the same
 * funnel so the rule "an envelope producer never frees GPU memory in place" has no exception
 * a later edit could widen.
 */
export function releaseSpaceEnvelopeResource(
    resource: BufferGeometry | Material | Texture | null | undefined,
): void {
    scheduleGpuRelease(resource);
}
