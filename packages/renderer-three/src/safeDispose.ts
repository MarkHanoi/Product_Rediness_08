/**
 * @pryzm/renderer-three — WebGPU-safe disposal helpers  (§I2 / §FIX-DISPOSE-USEDTIMES-BUILDERS)
 *
 * Contract C04 §1.1 — packages/renderer-three is the SOLE owner of any THREE
 * import. Disposal of THREE materials/geometries during the element-builder
 * rebuild churn must route through these helpers so the WebGPU `usedTimes`
 * device-loss family of throws (already tamed in two narrow places) can never
 * abort a builder's `rebuild()`.
 *
 * ── The bug (recurring, §I2 family) ─────────────────────────────────────────
 * On the WebGPU backend `material.dispose()` fires `onMaterialDispose`, which
 * walks the renderer's `NodeManager` and calls `NodeManager.delete(renderObject)`
 * for each render object that referenced the material. `delete()` reads
 * `this.get(object).nodeBuilderState.usedTimes`. If that render object's node
 * state was already torn down (device loss + recovery, a backend swap, or a
 * stale render object left over from a previous build) then `this.get(object)`
 * returns `undefined` and the read throws:
 *
 *   TypeError: Cannot read properties of undefined (reading 'usedTimes')
 *       at NodeManager.delete (three.webgpu.js)
 *       at onMaterialDispose
 *       at Material.dispose
 *
 * In the LIVE element-rebuild path (DoorBuilder / WallFragmentBuilder /
 * WindowBuilder / …) this throw propagates out of the builder's `dispose()`,
 * up through `rebuild()` / `_drainBuildQueue()`, and is reported as
 * "[DoorBuilder] build error: …" — so the element silently fails to render.
 *
 * ── Why we can't pre-patch like RenderPipelineManager does ──────────────────
 * `RenderPipelineManager._safeDisposeRenderPipeline()` (§I.2.1) normalises
 * `pipeline.usedTimes` on the PIPELINE object before calling dispose, because
 * there the throwing object IS the pipeline. For materials/geometries the
 * throwing object is an INTERNAL WebGPU render object owned by the NodeManager,
 * not reachable from the material handle — so we cannot pre-patch it. The only
 * robust, low-blast-radius fix is to call `dispose()` inside a try/catch that
 * swallows EXCLUSIVELY this `usedTimes` device-loss TypeError (anything else
 * re-throws, so real disposal bugs still surface).
 *
 * On WebGL `material.dispose()` / `geometry.dispose()` never touch a
 * NodeManager and never throw `usedTimes`, so these helpers are a transparent
 * pass-through there — no behaviour change, no leak on the happy path.
 *
 * NOTE on OTel spans (C10 §2): the "every exported function needs ≥1 span" gate
 * (tools/ga-gate/check-otel-spans.ts) scopes ONLY to command-bus handler files
 * in plugins/&#42;/src/handlers/. These are hot, per-dispose, synchronous calls on
 * the render-teardown path; a span per call would be both out-of-scope for the
 * gate and a perf footgun. Consistent with `_safeDisposeRenderPipeline()` (which
 * also carries no span), these helpers are intentionally span-free.
 */

import type { BufferGeometry, Material, Object3D, Mesh, Texture, Scene } from '@pryzm/renderer-three/three';

/**
 * Returns true iff `err` is the WebGPU NodeManager device-loss / stale-render-
 * object `usedTimes` TypeError that §I2 tames. We match on the message text
 * (`usedTimes`) rather than the constructor so the guard survives THREE minor
 * upgrades and bundler renaming of `NodeManager`.
 */
export function isUsedTimesDisposeError(err: unknown): boolean {
    if (!err) return false;
    const msg =
        typeof err === 'string'
            ? err
            : (err as { message?: unknown })?.message;
    return typeof msg === 'string' && msg.includes('usedTimes');
}

/**
 * §RPM-RECOVERY-DOWNGRADE (ADR-0087) — returns true iff `err` is a WebGPU/TSL
 * SHADER-COMPILE failure of the kind THREE.js throws from the WebGPU
 * `Renderer.render()` path after a device-loss + recovery rebuild, e.g.
 *
 *   RuntimeError: Fragment shader failed to compile. Compile log: …
 *   RuntimeError: Vertex shader failed to compile …
 *
 * This is the DEMO-KILLER: when the heavy phase-4 TSL pipeline (SSGI / TRAA /
 * outlines) is rebuilt against a freshly-recovered device and a generated shader
 * fails to compile, THREE flips its internal "Rendering has stopped" latch and
 * the whole render loop dies behind a hard error overlay. We classify these so
 * the pipeline can DOWNGRADE to the lightweight phase-2 pipeline (no post-FX)
 * instead of dying — the viewport keeps rendering plain.
 *
 * We match on message text (compile + shader keywords, or WGSL compile log)
 * rather than the constructor so the guard survives THREE minor upgrades and
 * bundler renaming. A non-shader RuntimeError (e.g. a real logic bug) is NOT
 * matched, so genuine unrecoverable states still surface.
 */
export function isShaderCompileError(err: unknown): boolean {
    if (!err) return false;
    const msg =
        typeof err === 'string'
            ? err
            : (err as { message?: unknown })?.message;
    if (typeof msg !== 'string') return false;
    const lc = msg.toLowerCase();
    // Primary signature: "<stage> shader failed to compile" (the exact THREE text).
    if (lc.includes('shader') && lc.includes('compile')) return true;
    // WGSL compile-log variants emitted by some backends/drivers.
    if (lc.includes('wgsl') && (lc.includes('compile') || lc.includes('compilation'))) return true;
    return false;
}

/* ─── §GPU-RESOURCE-LIFETIME (ADR-0281) — the two lifetime rules ─────────────
 *
 * INVARIANT L1 (OWNERSHIP). A GPU resource handed out by a CACHE is owned by
 *   that cache and MUST NOT be released by an element teardown. "It is not in
 *   MY cache" is not evidence of exclusive ownership — it is only evidence of
 *   ignorance about the other caches. Ownership must therefore be recorded ON
 *   the resource (see {@link markSharedGpuResource}), not inferred from a
 *   per-builder membership test.
 *
 * INVARIANT L2 (ORDERING). A GPU resource may only be released AFTER (a) every
 *   Object3D that references it has been detached from the render graph, and
 *   (b) the frame that last referenced it has finished encoding + submitting.
 *   An element mutation therefore DETACHES on the mutation tick and RELEASES at
 *   the next frame boundary — it never disposes in place.
 *
 * ── The bug these close (founder report, 2026-08-06) ────────────────────────
 * `CHANGE_FURNITURE_TYPE` on a placed sofa →
 *
 *   PIPELINE_FAILURE reason="Failed to execute 'setIndexBuffer' on
 *     'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'."
 *     at u$._renderTransparents … at jr.updateBefore
 *
 * `setIndexBuffer` receives `undefined` because the WebGPU backend's per-
 * attribute record was deleted (`WebGPUBackend.draw` reads
 * `this.get(index).buffer`, and `DataMap.get` returns a bare `{}` once the
 * record is gone — three/src/renderers/webgpu/WebGPUBackend.js:1541-1544).
 * The record is deleted by `Geometries.initGeometry`'s `onDispose` listener
 * (three/src/renderers/common/Geometries.js:185-216) the instant
 * `BufferGeometry.dispose()` runs — which the element builder was calling
 * WHILE the mesh was still parented to the scene, from a DOM store-event
 * listener that has no relationship to the frame boundary. Material disposal
 * is the same family one level up: `RenderObject.onMaterialDispose` disposes
 * the whole render object (three/src/renderers/common/RenderObject.js:307-311),
 * which is where the sibling `Cannot read properties of undefined (reading
 * 'usedTimes')` throw comes from.
 *
 * Both symptoms are ONE defect: a GPU resource was released while the renderer
 * still referenced it. `safeDispose*` (§I2) only stopped the THROW; it never
 * stopped the RELEASE. These helpers stop the release.
 */

/**
 * Resources whose lifetime is owned by a CACHE, not by any single element.
 * A WeakSet so stamping cannot keep a resource alive.
 *
 * Deliberately module-global (one per renderer-three module instance) rather
 * than per-builder: the whole point of INVARIANT L1 is that ownership is a
 * property of the RESOURCE, visible to every disposer, not a fact each builder
 * has to independently know.
 */
const _sharedGpuResources = new WeakSet<object>();

/**
 * §GPU-RESOURCE-LIFETIME INVARIANT L1 — declare that `resource` (a Material,
 * BufferGeometry or Texture) is owned by a cache and shared across elements.
 * Every `safeDispose*` helper becomes a NO-OP for it, so no element teardown
 * can destroy a resource its siblings still draw with.
 *
 * Call this at the point a cache MINTS the resource. Returns the resource so it
 * can wrap a cache's return expression:
 *
 *   return markSharedGpuResource(new THREE.MeshStandardMaterial({ color }));
 *
 * Idempotent. Safe with null/undefined.
 */
export function markSharedGpuResource<T extends object | null | undefined>(resource: T): T {
    if (resource) _sharedGpuResources.add(resource as object);
    return resource;
}

/** True iff `resource` was stamped by {@link markSharedGpuResource}. */
export function isSharedGpuResource(resource: object | null | undefined): boolean {
    return Boolean(resource) && _sharedGpuResources.has(resource as object);
}

/**
 * §GPU-RESOURCE-LIFETIME — hand ownership of `resource` BACK to its element, so
 * `safeDispose*` will free it again.
 *
 * INVARIANT L1 says a cache owns what it hands out. That is a statement about a
 * LIFETIME, not a permanent property of the object: when the cache itself is torn
 * down (project close), nothing in any scene can still reach the resource and the
 * cache is no longer there to serve it. Without this call the stamp would outlive
 * the cache and every teardown path would silently no-op forever — trading a
 * bounded crash for an unbounded leak, which is not a trade worth making.
 *
 * Call ONLY from the cache that stamped it, at the instant it drops the reference
 * (e.g. `resetSharedMaterialCache()`). Never from an element teardown — that is
 * precisely the "it is not in MY cache" reasoning L1 exists to forbid.
 *
 * Idempotent. Safe with null/undefined.
 */
export function unmarkSharedGpuResource<T extends object | null | undefined>(resource: T): T {
    if (resource) _sharedGpuResources.delete(resource as object);
    return resource;
}

/* ─── §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) ────────────────────────────────
 *
 * ⭐ THE DERIVED ANSWER to *"which mutation changes the shadow CASTER SET?"*
 *
 * `apps/editor/src/engine/geometryMutationEvents.ts` answers that question by
 * ENUMERATING the BIM events that are known to lead there
 * (§GEOM-CASTER-EVENT-CHOKEPOINT, L-1189). That list is now gated, disjoint and
 * complete against the event catalogue — and it is still a REMEMBERED rule: it
 * only covers a mutation that ANNOUNCES ITSELF as a classified `bim-*` event.
 * The founder's crash has now recurred five times in a week along five different
 * routes, and the fifth (a railing MATERIAL change) reaches the same 279-mesh /
 * 93-material teardown through the GENERIC `element.updateParameters` bridge —
 * a verb no per-family event list is shaped to cover, and which emits the
 * family event TWICE, so the churn is doubled.
 *
 * This is the same answer DERIVED instead of remembered. Every element builder
 * in the repo already funnels its teardown through {@link scheduleGpuRelease} /
 * {@link detachAndReleaseChildren} (76 call sites; ADR-0297 INVARIANT L2 made
 * that the only legal way to free element-owned GPU memory). So the instant a
 * shadow CASTER is actually released is observable HERE — at the point where
 * the danger IS, not at the event that led to it. A route that forgets to
 * announce itself is still safe, because it cannot free a mesh without passing
 * through this funnel.
 *
 * The observer is `RenderPipelineManager`, which opens its submit-pause +
 * shadow-freeze window (`runShadowCasterMutation`'s ordering) and closes it at
 * the frame boundary once the queue has drained.
 *
 * ⚠ WHAT THIS DOES **NOT** COVER, stated so nobody reads it as total:
 *   - a bare `kind: 'material'` / `'geometry'` release. The handle carries no
 *     back-reference to the mesh that drew with it, so `castShadow` is not
 *     knowable from it. Subtree releases (`kind: 'object3d'`) are the shape
 *     every builder actually uses, and they ARE covered.
 *   - an in-place `mesh.geometry.dispose()` that never reaches this funnel.
 *     That is an ADR-0297 L2 violation in its own right and is gated separately
 *     by `packages/renderer-three/__tests__/casterReleaseChokepoint.test.ts`
 *     ARM C, which is what makes THIS derivation load-bearing rather than
 *     optimistic: the funnel is only "the" chokepoint while nothing bypasses it.
 */

/** Notified once per release batch when that batch frees a shadow caster. */
export type ShadowCasterReleaseObserver = () => void;

let _casterReleaseObserver: ShadowCasterReleaseObserver | null = null;
/**
 * Latched per release BATCH: the observer's job (open one guard window) is
 * idempotent, so notifying 279 times for one handrail teardown would be 278
 * subtree walks for no added safety. Reset when the batch is drained.
 */
let _casterReleaseNotified = false;

/**
 * Install the sole observer notified when a release frees a shadow caster.
 * `RenderPipelineManager` claims this on `bind()` and clears it on `dispose()`;
 * a single slot (rather than a listener list) is deliberate — C04 §2, the frame
 * owner owns the frame boundary, and there is exactly one frame owner.
 */
export function setShadowCasterReleaseObserver(observer: ShadowCasterReleaseObserver | null): void {
    _casterReleaseObserver = observer;
}

/** True iff a frame owner has claimed the observer slot (diagnostics + tests). */
export function hasShadowCasterReleaseObserver(): boolean {
    return _casterReleaseObserver !== null;
}

/**
 * True iff `root`'s subtree contains at least one mesh flagged `castShadow`.
 *
 * Iterative + EARLY-EXIT on the first hit, so the common case (a builder
 * releasing one mesh at a time via `detachAndReleaseChildren`) is O(1) and the
 * worst case is bounded by the ELEMENT's own mesh count — never by the scene's.
 * That bound is the whole reason this is safe to call from a release path: the
 * L-1151/L-1155 defect class is a full-scene traverse per event, and this is not
 * one.
 */
export function subtreeHasShadowCaster(root: Object3D | null | undefined): boolean {
    if (!root) return false;
    const stack: Object3D[] = [root];
    while (stack.length > 0) {
        const node = stack.pop() as (Object3D & { isMesh?: boolean; castShadow?: boolean }) | undefined;
        if (node === undefined) break;
        if (node.isMesh === true && node.castShadow === true) return true;
        const kids = node.children;
        if (kids !== undefined) {
            for (let i = 0; i < kids.length; i++) {
                const kid = kids[i];
                if (kid !== undefined) stack.push(kid);
            }
        }
    }
    return false;
}

/** Notify the frame owner, at most once per release batch. Never throws. */
function _notifyShadowCasterRelease(root: Object3D): void {
    if (_casterReleaseObserver === null || _casterReleaseNotified) return;
    if (!subtreeHasShadowCaster(root)) return;
    _casterReleaseNotified = true;
    try {
        _casterReleaseObserver();
    } catch (err) {
        // An observer that throws must never strand a release — the release is
        // the thing that keeps memory bounded.
        console.warn(
            '[renderer-three] §GPU-CASTER-RELEASE-CHOKEPOINT observer threw (non-fatal):',
            err instanceof Error ? err.message : err,
        );
    }
}

/** One deferred release request. Discriminated so the queue stays inspectable. */
type GpuReleaseEntry =
    | { readonly kind: 'object3d'; readonly root: Object3D; readonly disposeMaterials: boolean }
    | { readonly kind: 'material'; readonly material: Material }
    | { readonly kind: 'geometry'; readonly geometry: BufferGeometry }
    | { readonly kind: 'texture'; readonly texture: Texture; readonly scene: Scene | null }
    | { readonly kind: 'renderTarget'; readonly target: DisposableGpuTarget };

/**
 * Structural shape of a THREE render target (WebGLRenderTarget / WebGLRenderTarget
 * subclasses, including the `LightShadow.map` shadow depth target). Typed
 * structurally so this module needs no value import of THREE (P2).
 */
interface DisposableGpuTarget { dispose(): void; readonly isRenderTarget?: boolean }

/** Pending releases, drained at the next frame boundary. */
let _releaseQueue: GpuReleaseEntry[] = [];
/** Re-entrancy latch — a drain must never enqueue into the batch it is draining. */
let _draining = false;

/**
 * §GPU-RESOURCE-LIFETIME INVARIANT L2 — enqueue a detached Object3D subtree (or
 * a single material/geometry) for release at the NEXT frame boundary instead of
 * releasing it now.
 *
 * The caller MUST have already detached the subtree from the scene graph — this
 * function defers the RELEASE, it does not perform the DETACH. Use
 * {@link detachAndReleaseChildren} to get both in the correct order.
 *
 * Enqueuing is O(1) and never touches the GPU, so it is safe to call from a
 * store-event listener, a command handler, or any other non-frame context —
 * which is exactly the property the old in-place `dispose()` lacked.
 */
export function scheduleGpuRelease(
    target: Object3D | Material | BufferGeometry | Texture | DisposableGpuTarget | null | undefined,
    disposeMaterials = true,
): void {
    if (!target) return;
    const maybe = target as Partial<Object3D> & Partial<Material> & Partial<BufferGeometry> &
        Partial<Texture> & Partial<DisposableGpuTarget>;
    // Render targets FIRST — a WebGLRenderTarget carries a `.texture`, so an
    // isTexture-style check must not claim it. NOTE (§SHADOW-MAP-REALLOC-AT-
    // BOUNDARY): a LIGHT-OWNED shadow map (`LightShadow.map`) must NOT be routed
    // here — the WebGPU ShadowNode keeps its own live reference and would keep
    // submitting the destroyed texture forever. Use scheduleShadowMapRealloc()
    // for those; this branch is for targets whose sole owner is the caller.
    if (maybe.isRenderTarget === true && typeof maybe.dispose === 'function') {
        _releaseQueue.push({ kind: 'renderTarget', target: target as DisposableGpuTarget });
        return;
    }
    if (typeof maybe.traverse === 'function') {
        _releaseQueue.push({ kind: 'object3d', root: target as Object3D, disposeMaterials });
        // §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) — tell the frame owner BEFORE the
        // boundary, not after: the guard window has to be open across the tick that
        // is tearing the caster set down, not merely across the free.
        _notifyShadowCasterRelease(target as Object3D);
    } else if ((maybe as Partial<BufferGeometry>).isBufferGeometry === true) {
        _releaseQueue.push({ kind: 'geometry', geometry: target as BufferGeometry });
    } else if ((maybe as Partial<Material>).isMaterial === true) {
        _releaseQueue.push({ kind: 'material', material: target as Material });
    } else if ((maybe as Partial<Texture>).isTexture === true) {
        // Textures are the WebGL2 sibling of the same defect: a shared env/PBR map
        // deleted while live meshes still bind it produces the 251× flood
        // "WebGL: INVALID_OPERATION: bindTexture: attempt to use a deleted object"
        // (founder, slab-batch session). Deferring the release to the frame boundary
        // closes the same window for textures that it closes for index buffers.
        _releaseQueue.push({ kind: 'texture', texture: target as Texture, scene: null });
    } else {
        // Unrecognised handle — refuse silently rather than guess and destroy the
        // wrong thing. (A leak is recoverable; a use-after-dispose is not.)
    }
}

/** Number of releases waiting for the next frame boundary (diagnostics + tests). */
export function pendingGpuReleaseCount(): number {
    return _releaseQueue.length;
}

/**
 * §GPU-RESOURCE-LIFETIME INVARIANT L2 — release everything queued by
 * {@link scheduleGpuRelease}. MUST be called at a frame boundary: at the TOP of
 * a frame, before that frame encodes any pass. At that instant the previous
 * frame's passes are fully encoded and submitted, and the current frame has not
 * yet built a draw list — so nothing the renderer is about to touch, or has yet
 * to submit, can reference a resource released here.
 *
 * `RenderPipelineManager.render()` is the single caller (C04 §2 — the frame
 * owner owns the frame boundary). Never throws.
 *
 * @returns the number of entries released.
 */
export function drainGpuReleaseQueue(): number {
    if (_draining || _releaseQueue.length === 0) return 0;
    _draining = true;
    const batch = _releaseQueue;
    _releaseQueue = [];
    // §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) — a NEW batch may open a NEW guard
    // window. Cleared here, at the batch swap, so a release enqueued while this
    // drain runs still re-arms the frame owner.
    _casterReleaseNotified = false;
    try {
        for (const entry of batch) {
            try {
                if (entry.kind === 'object3d') {
                    safeDisposeObject3D(entry.root, entry.disposeMaterials);
                } else if (entry.kind === 'geometry') {
                    safeDisposeGeometry(entry.geometry);
                } else if (entry.kind === 'texture') {
                    safeDisposeTexture(entry.texture, entry.scene);
                } else if (entry.kind === 'renderTarget') {
                    if (!isSharedGpuResource(entry.target)) {
                        try {
                            entry.target.dispose();
                        } catch (err) {
                            if (!isUsedTimesDisposeError(err)) throw err; // §I2
                        }
                    }
                } else {
                    safeDisposeMaterial(entry.material);
                }
            } catch (err) {
                // A single bad handle must not strand the rest of the batch, and a
                // disposal error at a frame boundary must never kill the frame.
                console.warn(
                    '[renderer-three] §GPU-RESOURCE-LIFETIME deferred release failed (non-fatal):',
                    err instanceof Error ? err.message : err,
                );
            }
        }
    } finally {
        _draining = false;
    }
    return batch.length;
}

/* ─── §SHADOW-MAP-REALLOC-AT-BOUNDARY (founder P0, 2026-08-10) ────────────────
 *
 * A LIGHT-OWNED shadow map must NEVER be destroyed from outside the renderer,
 * not even via the deferred release queue above. On the WebGPU node path,
 * three r183's `ShadowNode` holds ITS OWN reference to the render target
 * (`this.shadowMap`, assigned alongside `shadow.map` — ShadowNode.js:563-564)
 * and keeps rendering into / sampling it EVERY frame. Externally nulling
 * `shadow.map` does nothing (the node never re-reads it), and externally
 * disposing the target destroys the ShadowDepthTexture while:
 *   • the node's next depth pass still renders into it, and
 *   • the main pass's cached bind groups still sample it,
 * so EVERY subsequent `Queue.submit()` references a destroyed texture:
 *
 *   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
 *     — While calling [Queue].Submit([[CommandBuffer from CommandEncoder
 *       "renderContext_1"]])
 *
 * — permanently, because the target's SIZE still matches `shadow.mapSize`, so
 * `ShadowNode.renderShadow()`'s own `shadowMap.setSize()` (ShadowNode.js:662)
 * never triggers a recreate. No pipeline rebuild can reach it
 * (§RECOVERY-MUST-REFUSE) → the founder's dead viewport + refuse/recover loop.
 *
 * The ONLY safe way to change a live light's shadow-map resolution is to make
 * THREE's own realloc happen AT A FRAME BOUNDARY: resize the light-owned target
 * (`shadow.map.setSize(mapSize)`) at the top of a frame — after the previous
 * frame's `Queue.submit()` has returned (destroy-after-submit is legal WebGPU;
 * destroy-BEFORE-the-submit-of-a-referencing-command-buffer is the validation
 * error) and before this frame opens a command encoder. The subsequent shadow
 * pass then re-creates the GPU textures at the new size through the normal
 * `updateRenderTarget` path (the same proven-safe mechanism `renderer.setSize`
 * uses in `_reconcileRenderSize`), and `ShadowNode.renderShadow()`'s own
 * mid-encode `setSize` becomes a no-op because the sizes already agree.
 *
 * Callers (ShadowQualityUpgrader and any other mapSize writer) therefore write
 * the NEW `shadow.mapSize` on their own tick and enqueue the shadow here; the
 * frame owner (`RenderPipelineManager.render()`) drains the queue at the frame
 * boundary. ADR-0111 / C04 §SHADOW rule set: external code never disposes a
 * light-owned texture — this queue keeps that invariant while still letting the
 * resolution change land.
 */

/**
 * Structural shape of a `THREE.LightShadow` whose map realloc must be ordered
 * against submission. Structural so this module needs no THREE value import (P2)
 * and unit tests need no GPU.
 */
export interface ReallocatableLightShadow {
    /** The light-owned render target (ShadowNode.shadowMap === shadow.map), or null before first allocation. */
    map?: { setSize(width: number, height: number): void; width?: number; height?: number } | null;
    /** The live resolution (THREE.Vector2 exposes width/height accessors and set()). */
    mapSize: { width: number; height: number; set?(width: number, height: number): void };
    /** Set true after a boundary realloc so the depth pass regenerates once. */
    needsUpdate?: boolean;
}

/**
 * Shadows with a pending frame-boundary resolution change, mapped to the
 * REQUESTED size. Map (not Set) so the request itself is deferred — see
 * {@link scheduleShadowMapRealloc}. Last write per shadow wins.
 */
const _shadowReallocQueue = new Map<ReallocatableLightShadow, { width: number; height: number }>();

/**
 * §SHADOW-MAP-REALLOC-AT-BOUNDARY — request a frame-ordered reallocation of a
 * light-owned shadow map to a new resolution.
 *
 * §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY (L-819) — the requested size is CAPTURED
 * here and `shadow.mapSize` itself is written only by the DRAIN, at the frame
 * boundary. The first revision of this queue had callers write `mapSize`
 * immediately and deferred only the target resize — which left a window in
 * which `mapSize` (say 2048) disagreed with the allocated map (512). Inside
 * that window ANY depth pass — and three r183 runs `ShadowNode.updateBefore`
 * MID-PASS, after `backend.beginRender` has opened the frame's command encoder
 * (Renderer.js `renderObject` → `_nodes.updateBefore`) — hits the node's own
 * `shadowMap.setSize(shadow.mapSize…)` (ShadowNode.js:662), which disposes the
 * old GPU texture while the OPEN encoder's earlier draws already reference it:
 * "Destroyed texture [ShadowDepthTexture] used in a submit …
 * CommandEncoder renderContext_1" — the founder's saved-project-open crash.
 * The window exists because `needsUpdate = true` OVERRIDES every freeze
 * (`needsUpdate || autoUpdate`, the L-197 lesson), so a freeze cannot be
 * trusted to hold the depth pass shut while mapSize diverges. Deferring the
 * `mapSize` WRITE removes the divergence itself: outside the boundary the
 * allocated size and `mapSize` always agree, so the node's mid-encode setSize
 * is structurally a no-op no matter which writer sets `needsUpdate`.
 *
 * O(1), touches no GPU state, callable from any tick (store listener, tier
 * apply, command handler). Idempotent per shadow (Map-keyed) — a burst of tier
 * changes coalesces into one boundary realloc at the FINAL requested size.
 * The caller must NOT null `shadow.map`, must NOT dispose the old target, and
 * (post-L-819) must NOT write `shadow.mapSize` — all three are the defect this
 * queue exists to remove.
 *
 * @param width  requested width;  defaults to the shadow's current `mapSize.width`.
 * @param height requested height; defaults to the shadow's current `mapSize.height`.
 */
export function scheduleShadowMapRealloc(
    sh: ReallocatableLightShadow | null | undefined,
    width?: number,
    height?: number,
): void {
    if (!sh || !sh.mapSize) return;
    _shadowReallocQueue.set(sh, {
        width:  width  ?? sh.mapSize.width,
        height: height ?? sh.mapSize.height,
    });
}

/** Number of shadows awaiting a boundary realloc (diagnostics + tests). */
export function pendingShadowMapReallocCount(): number {
    return _shadowReallocQueue.size;
}

/**
 * §SHADOW-MAP-REALLOC-AT-BOUNDARY — perform every queued shadow-map realloc.
 * MUST be called only at a frame boundary (top of `RenderPipelineManager.render()`,
 * alongside {@link drainGpuReleaseQueue}), and NOT while the shadow map is frozen
 * (a frozen map's depth pass is suppressed, so a destroyed-and-not-yet-regenerated
 * texture would be sampled by the main pass — the caller gates on the freeze latch
 * and the queue simply holds entries until the first unfrozen frame).
 *
 * For each queued shadow, first writes the REQUESTED size into `shadow.mapSize`
 * (§SHADOW-MAPSIZE-WRITE-AT-BOUNDARY, L-819 — mapSize and the allocated map may
 * only ever disagree AT this instant, never across a frame), then, if a live map
 * disagrees, calls the target's own `setSize()` — THREE disposes the old GPU
 * textures here, at the boundary, ordered against submission by construction —
 * and sets `needsUpdate = true` so the depth pass regenerates exactly once at
 * the new resolution. A shadow with no live map needs only the `mapSize` write:
 * THREE mints at the live `mapSize` on its next shadow pass. Never throws.
 *
 * @returns the number of maps actually reallocated.
 */
export function drainShadowMapReallocQueue(): number {
    if (_shadowReallocQueue.size === 0) return 0;
    const batch = Array.from(_shadowReallocQueue.entries());
    _shadowReallocQueue.clear();
    let realloced = 0;
    for (const [sh, req] of batch) {
        try {
            const w = req.width;
            const h = req.height;
            if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
            // §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY — the deferred mapSize write lands
            // here, at the boundary, immediately before the matching realloc.
            if (sh.mapSize.width !== w || sh.mapSize.height !== h) {
                if (typeof sh.mapSize.set === 'function') sh.mapSize.set(w, h);
                else { sh.mapSize.width = w; sh.mapSize.height = h; }
            }
            const map = sh.map;
            if (!map || typeof map.setSize !== 'function') continue; // not yet allocated — THREE will mint at mapSize
            if (map.width === w && map.height === h) continue;       // already consistent — no churn
            map.setSize(w, h); // THREE's own dispose+resize, AT the boundary
            sh.needsUpdate = true;
            realloced++;
        } catch (err) {
            // One bad handle must not strand the rest, and a realloc error at a
            // frame boundary must never kill the frame.
            console.warn(
                '[renderer-three] §SHADOW-MAP-REALLOC-AT-BOUNDARY realloc failed (non-fatal):',
                err instanceof Error ? err.message : err,
            );
        }
    }
    return realloced;
}


/* ── §SHADOW-CASTER-FLIP-AT-BOUNDARY (L-10380) ───────────────────────────────
 *
 * ⭐ THE SECOND HALF OF §SHADOW-MAP-REALLOC-AT-BOUNDARY, AND THE HALF THAT WAS
 *    MISSING. The realloc queue above orders the ONE trigger that RESIZES a
 *    light-owned shadow map (`shadow.mapSize`). MEASURED against the installed
 *    three r183.2, there are THREE MORE triggers that FREE it outright, and none
 *    of them went through any queue:
 *
 *      T1  `light.castShadow` → false.  `AnalyticLightNode.setup()`
 *          (AnalyticLightNode.js:267-270) responds with
 *          `this.shadowNode.dispose()` → `ShadowNode._reset()` (ShadowNode.js:769)
 *          → `this.shadowMap.dispose()`. That target's depth texture is named
 *          `ShadowDepthTexture` verbatim at ShadowNode.js:396.
 *      T2  `renderer.shadowMap.type` change. `ShadowNode.setup()`
 *          (ShadowNode.js:615-622) compares `_currentShadowType` and calls the
 *          same `_reset()`.
 *      T3  `light.dispose()` / `light.dispatchEvent({type:'dispose'})`.
 *          `AnalyticLightNode` subscribes to it (AnalyticLightNode.js:99-107)
 *          and calls `disposeShadow()` SYNCHRONOUSLY, from whatever tick fired it.
 *
 * ── WHY T1/T2 ARE THE FOUNDER'S "Destroyed texture … used in a submit" ───────
 * T1 and T2 do NOT fire when the flag is WRITTEN. They fire on the next
 * node-graph BUILD, and three r183 builds LAZILY, INSIDE the frame's open command
 * encoder: `Renderer._renderObjectDirect` (Renderer.js:3381-3395) →
 * `RenderObject.getNodeBuilderState()` (RenderObject.js:379) →
 * `NodeManager.getForRender()` → `nodeBuilder.build()` (NodeManager.js:224/229/301)
 * — all of it AFTER `backend.beginRender(renderContext)` (Renderer.js:1641).
 * So the free lands between `beginRender` and `Queue.submit()` of the SAME frame,
 * which is the founder's message verbatim:
 *
 *   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
 *    - While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])
 *
 * ⛔ AND THE DELAY IS WHY A PAUSE-AROUND-THE-WRITE GUARD CANNOT FIX IT.
 * `RenderObjects.get` only re-reads the cache key when `material.version` bumped
 * or `renderObject.needsUpdate` is set (RenderObjects.js:127-129), so a caster
 * flip can sit LATENT for many frames and detonate on an unrelated event — a
 * fixture placement, a material swap, a new mesh. `runShadowCasterMutation()`
 * pauses submits AROUND THE WRITE; by the time the free actually happens its
 * window has long closed. That is why this family kept recurring WITH a guard in
 * place (L-25 → L-39 → L-64 → L-908 → here).
 *
 * ── THE ORDERING, AND WHY IT IS SAFE ────────────────────────────────────────
 * `releaseLightOwnedShadowNow()` performs three's OWN release — the sanctioned
 * `'dispose'` event, exactly as `RenderPipelineManager._recreateLightOwnedShadowMaps()`
 * already does on the recovery ladder — at the FRAME BOUNDARY, where no encoder is
 * open. Afterwards `AnalyticLightNode.shadowNode === null`, so the build that runs
 * mid-encode later finds nothing left to free and the T1/T2 branch is a no-op.
 * External code still never destroys a light-owned texture directly (ADR-0111 /
 * C04 §SHADOW): the light's own node does it, at an instant we choose.
 *
 * ⚠ The CALLER must invalidate the compiled node states in the SAME boundary step
 * (`RenderPipelineManager._resetCompiledNodeStates()`), because the graph compiled
 * while the light WAS casting still binds the map we just freed. Release without
 * that reset trades a mid-encode free for a stale binding — see
 * `RenderPipelineManager._orderPendingCasterReleasesAtBoundary()`, the single
 * production caller, which does both inside the submit-pause window.
 */

/**
 * Structural shape of a THREE `Light` that owns a shadow map. Structural so this
 * module still needs no THREE value import (P2) and the tests need no GPU.
 */
export interface ShadowOwningLight {
    /** THREE stamps this on every light. */
    isLight?: boolean;
    /** The caster flag three hashes into `LightsNode.customCacheKey()`. */
    castShadow?: boolean;
    /** `LightShadow` — `map` is the light-owned render target, or null. */
    shadow?: { map?: unknown } | null;
    /** `Object3D.dispatchEvent` — three's sanctioned signal to the light's node. */
    dispatchEvent?: (event: { type: string }) => void;
    /** Diagnostics only. */
    id?: number;
    name?: string;
}

/** True iff `light` currently owns an ALLOCATED shadow render target. */
export function lightOwnsLiveShadowMap(light: ShadowOwningLight | null | undefined): boolean {
    if (!light || !light.shadow) return false;
    const map = (light.shadow as { map?: unknown }).map;
    return map !== null && map !== undefined;
}

/* ── §FOREIGN-SHADOW-MAP-CLAIM (L-13281) ──────────────────────────────────────
 *
 * ⭐ THE FOURTH BOUNDARY ARM, AND THE ONE THAT DOES NOT NEED TO KNOW WHO DID IT.
 *
 * The three arms above (`drainShadowMapReallocQueue`, `drainShadowCasterFlipQueue`,
 * `_orderPendingCasterReleasesAtBoundary`) all order a free that PRYZM's OWN code
 * is about to cause. None of them can see the fifth trigger, which is caused by
 * nobody in this package:
 *
 *   T5  A SECOND THREE.WebGLRenderer renders the SAME scene with
 *       `shadowMap.enabled === true`. A THREE light has exactly ONE
 *       `LightShadow.map` slot, so `WebGLShadowMap.render()` walks straight into
 *       the WebGPU node's target and frees it (three r183.2,
 *       WebGLShadowMap.js:203-227):
 *           :203  if ( shadow.map === null || typeChanged === true ) {
 *           :209      shadow.map.depthTexture.dispose();
 *           :214      shadow.map.dispose();      ← frees the LIVE WebGPU target
 *           :227      shadow.map = new WebGLRenderTarget( … );
 *       The WebGPU `ShadowNode` keeps its OWN reference (`this.shadowMap`,
 *       ShadowNode.js:563-564) and keeps sampling the corpse every frame:
 *           Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
 *       — the founder's dead viewport, and the reason §RECOVERY-MUST-REFUSE
 *       correctly refuses (a light-owned map is unreachable from a pipeline
 *       rebuild).
 *
 * ⛔ WHY THE OTHER ARMS ARE STRUCTURALLY BLIND TO IT. T5 changes NOTHING they
 * observe: no `castShadow` flip, no light id change (so
 * `LightsNode.customCacheKey()` is byte-identical), no `renderer.shadowMap.type`
 * change on OUR renderer, and no `shadow.mapSize` write. The caster-fingerprint
 * detector reads exactly the state three keys its node cache on — and three's node
 * cache is not what moved. The slot's CONTENTS moved.
 *
 * ⭐ THE DETECTOR IS A CONSTRUCTION, NOT A HEURISTIC. The two renderers mint
 * structurally different objects for that one slot, and three itself brands them:
 *   • WebGPU node path — `ShadowNode.setupRenderTarget()` (ShadowNode.js:389-403)
 *     calls `builder.createRenderTarget()`, which is
 *     `new RenderTarget(…)` (NodeBuilder.js:505-509). A plain `RenderTarget` sets
 *     `isRenderTarget = true` and NOTHING else (RenderTarget.js:75).
 *   • WebGL path — `WebGLShadowMap.render()` calls `new WebGLRenderTarget(…)`,
 *     whose constructor sets `isWebGLRenderTarget = true` (WebGLRenderTarget.js:28).
 *
 * So on a session whose live renderer is the WebGPU node path,
 * `light.shadow.map.isWebGLRenderTarget === true` is not evidence of a claim —
 * it IS the claim, positively identified, with no false-positive branch. It does
 * not depend on WHICH module armed `shadowMap.enabled`, on a log line, on a name,
 * or on the caller remembering anything. That property is what makes this arm
 * survive the defect shape this repo keeps re-learning: *the same rule fixed in
 * the copy nobody is looking at.*
 *
 * The REPAIR is the machinery that already exists — `releaseLightOwnedShadowNow()`
 * plus the caller's `_resetCompiledNodeStates()`, at the boundary, inside the
 * submit pause. See `RenderPipelineManager._healForeignShadowMapClaimsAtBoundary()`,
 * the single production caller.
 */

/**
 * §FOREIGN-SHADOW-MAP-CLAIM — true iff this light's shadow slot currently holds a
 * target minted by a `THREE.WebGLRenderer`'s `WebGLShadowMap`, rather than by the
 * WebGPU `ShadowNode` that owns it on this backend.
 *
 * MEANINGFUL ONLY ON THE NODE (WebGPU / WebGPURenderer) PATH. On a genuine WebGL
 * session a `WebGLRenderTarget` here is the correct and only possible value, so
 * the caller MUST gate on the live backend — this predicate deliberately does not
 * guess which renderer is live.
 */
export function shadowMapClaimedByWebGlRenderer(
    light: ShadowOwningLight | null | undefined,
): boolean {
    if (!light || !light.shadow) return false;
    const map = (light.shadow as { map?: unknown }).map as
        { isWebGLRenderTarget?: boolean } | null | undefined;
    if (!map) return false;
    return map.isWebGLRenderTarget === true;
}

/**
 * §FOREIGN-SHADOW-MAP-CLAIM — the lights whose shadow slot a foreign WebGL
 * renderer has claimed. O(#lights), allocation-free on the (overwhelmingly
 * common) empty result, so it is safe to run at every frame boundary.
 */
export function lightsWithForeignShadowMapClaim(
    lights: Iterable<ShadowOwningLight> | null | undefined,
): ShadowOwningLight[] {
    const out: ShadowOwningLight[] = [];
    if (!lights) return out;
    for (const light of lights) {
        if (shadowMapClaimedByWebGlRenderer(light)) out.push(light);
    }
    return out;
}

/**
 * The lights carrying a LATENT, three-side free: they have stopped casting, but
 * their `AnalyticLightNode` still holds a `ShadowNode` whose `shadowMap` is live.
 * The next node-graph build — whenever it happens, and it happens MID-ENCODE —
 * will free it. This is the predicate the frame owner acts on.
 *
 * O(#lights) and allocation-free on the empty result, so it is safe per frame.
 */
export function lightsWithPendingCasterRelease(
    lights: Iterable<ShadowOwningLight> | null | undefined,
): ShadowOwningLight[] {
    const out: ShadowOwningLight[] = [];
    if (!lights) return out;
    for (const light of lights) {
        if (light && light.castShadow === false && lightOwnsLiveShadowMap(light)) out.push(light);
    }
    return out;
}

/**
 * §SHADOW-CASTER-FLIP-AT-BOUNDARY — perform three's OWN release of a light-owned
 * shadow map NOW. MUST be called only from a frame boundary (no command encoder
 * open); the whole point is to move the free off the mid-encode build.
 *
 * Dispatches the `'dispose'` event the light's `AnalyticLightNode` subscribes to
 * (AnalyticLightNode.js:107) — NOT `light.dispose()`, which would also tear down
 * the light itself — then nulls `shadow.map`, because `ShadowNode._reset()` nulls
 * only the NODE's reference and leaves `LightShadow.map` pointing at the corpse
 * (§L-819). Never throws.
 *
 * @returns true iff a live map was actually released.
 */
export function releaseLightOwnedShadowNow(light: ShadowOwningLight | null | undefined): boolean {
    if (!lightOwnsLiveShadowMap(light) || !light) return false;
    try {
        light.dispatchEvent?.({ type: 'dispose' });
        (light.shadow as { map?: unknown }).map = null;
        return true;
    } catch (err) {
        console.warn(
            '[renderer-three] §SHADOW-CASTER-FLIP-AT-BOUNDARY release failed (non-fatal):',
            err instanceof Error ? err.message : err,
        );
        return false;
    }
}

/** Pending caster-flag writes, keyed by light. Last write per light wins. */
const _casterFlipQueue = new Map<ShadowOwningLight, boolean>();

/**
 * §SHADOW-CASTER-FLIP-AT-BOUNDARY — request a frame-ordered change to a light's
 * `castShadow` flag. The WRITE itself is deferred to the boundary, exactly as
 * §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY (L-819) defers the `mapSize` write, so the
 * flag and the allocated shadow map can only ever disagree AT the boundary.
 *
 * O(1), touches no GPU state, callable from any tick (tier gate, sun driver,
 * store listener). The caller must NOT write `light.castShadow` itself, must NOT
 * call `light.dispose()`, and must NOT dispose `light.shadow.map` — all three are
 * the defect this queue removes.
 *
 * ⚠ This is the OPT-IN half. The frame owner also runs a DERIVED arm that catches
 * a bare write anyway (`_orderPendingCasterReleasesAtBoundary`), so a call site
 * that forgets this function is still ordered — the queue exists so a caller that
 * KNOWS it is flipping a caster does not have to wait one frame for the detector.
 */
export function scheduleShadowCasterFlip(
    light: ShadowOwningLight | null | undefined,
    castShadow: boolean,
): void {
    if (!light) return;
    _casterFlipQueue.set(light, castShadow);
}

/** Number of caster flips awaiting the boundary (diagnostics + tests). */
export function pendingShadowCasterFlipCount(): number {
    return _casterFlipQueue.size;
}

/**
 * §SHADOW-CASTER-FLIP-AT-BOUNDARY — apply every queued caster flip and, for each
 * light that STOPS casting while still owning a live map, perform three's own
 * release here at the boundary rather than leaving it latent for a mid-encode
 * build. MUST be called only at a frame boundary. Never throws.
 *
 * @returns the number of light-owned shadow maps actually released.
 */
export function drainShadowCasterFlipQueue(): number {
    if (_casterFlipQueue.size === 0) return 0;
    const batch = Array.from(_casterFlipQueue.entries());
    _casterFlipQueue.clear();
    let released = 0;
    for (const [light, wanted] of batch) {
        try {
            light.castShadow = wanted;
            if (wanted === false && releaseLightOwnedShadowNow(light)) released++;
        } catch (err) {
            console.warn(
                '[renderer-three] §SHADOW-CASTER-FLIP-AT-BOUNDARY flip failed (non-fatal):',
                err instanceof Error ? err.message : err,
            );
        }
    }
    return released;
}

/**
 * §GPU-RESOURCE-LIFETIME — the canonical ELEMENT-MUTATION teardown: detach every
 * child of `root` from the scene graph NOW, and release their GPU resources at
 * the next frame boundary.
 *
 * This is the helper every fragment builder should call where it currently does
 * `traverse(… geometry.dispose() …); root.clear()`. That ordering is inverted:
 * it destroys GPU buffers while the meshes are still parented to the scene, so a
 * frame that has already been encoded (or is encoded before the rebuild lands)
 * draws with a destroyed index/vertex buffer — the `setIndexBuffer … not of type
 * 'GPUBuffer'` hard stop.
 *
 * The detached children are moved onto a bare holder object so `root` is empty
 * and reusable immediately, exactly as `root.clear()` left it.
 *
 * @param root the element root whose children are being replaced/removed.
 * @param disposeMaterials false for builders that share materials across
 *        elements. Prefer {@link markSharedGpuResource} on the cache instead —
 *        it is not defeated by a builder forgetting the flag.
 */
export function detachAndReleaseChildren(
    root: Object3D | null | undefined,
    disposeMaterials = true,
): void {
    if (!root) return;
    const children = root.children.slice();
    if (children.length === 0) return;
    // DETACH first (INVARIANT L2 (a)) — after this line nothing in the scene
    // graph can reach these resources, so the release below is unobservable.
    root.clear();
    for (const child of children) {
        child.parent = null;
        scheduleGpuRelease(child, disposeMaterials);
    }
}

/**
 * §GPU-RESOURCE-LIFETIME — classify the "a GPU resource was released while the
 * renderer still referenced it" family of render-time failures.
 *
 * These are structurally DIFFERENT from the shader-compile family
 * ({@link isShaderCompileError}) and from a transient pass error: the damage is
 * in the RENDERER's per-attribute / per-render-object bookkeeping, NOT in the
 * post-FX pipeline. Rebuilding the render pipeline therefore CANNOT repair them
 * — which is precisely why the founder's 3-attempt retry ladder burned through
 * and left a permanently blocked scene. A caller that matches here must escalate
 * to a real GPU-state reset (or degrade deliberately + visibly), never retry.
 *
 * Matched signatures (message text, so the guard survives THREE upgrades and
 * bundler renaming):
 *   • "parameter 1 is not of type 'GPUBuffer'"  (deleted attribute record)
 *   • "is not of type 'GPUTexture'"             (deleted texture record)
 *   • "Destroyed buffer … used in a submit"     (destroyed-but-referenced)
 *   • "Destroyed texture … used in a submit"
 *   • "attempt to use a deleted object"         (WebGL2 sibling signature)
 *
 * NOT matched: `usedTimes` (that one is a THROW during dispose, already tamed by
 * {@link isUsedTimesDisposeError}, and is handled at the dispose site).
 */
export function isDestroyedGpuResourceError(err: unknown): boolean {
    if (!err) return false;
    const msg =
        typeof err === 'string'
            ? err
            : (err as { message?: unknown })?.message;
    if (typeof msg !== 'string') return false;
    const lc = msg.toLowerCase();
    if (lc.includes('is not of type') && (lc.includes('gpubuffer') || lc.includes('gputexture'))) {
        return true;
    }
    if (lc.includes('destroyed') && (lc.includes('buffer') || lc.includes('texture'))) return true;
    if (lc.includes('deleted object')) return true;
    return false;
}

/**
 * §GPU-RESOURCE-LIFETIME — is the destroyed resource a SHADOW resource (a light's
 * depth target / the shadow map), as opposed to a scene attribute or a pipeline
 * render target?
 *
 *   "Destroyed texture [Texture "ShadowDepthTexture"] used in a submit."
 *
 * This distinction is load-bearing for RECOVERY, not just for logging. A light's
 * `LightShadow.map` is owned by the LIGHT and reallocated by THREE's shadow pass —
 * it is not reachable from, and not replaceable by, a render-pipeline rebuild.
 * A caller that classifies here must therefore REFUSE to "repair" it by rebuilding
 * the pipeline (ADR-0299 §RECOVERY-MUST-REFUSE): that repair cannot perform what
 * its name promises, and attempting it costs the user a multi-second rebuild before
 * failing anyway.
 *
 * §L-819 — also matches the DANGLING-SHADOW-NODE TypeError,
 *
 *   TypeError: Cannot read properties of null (reading 'depthTexture')
 *       at ShadowNode.updateShadow (three r183: `shadowMap.depthTexture.version`)
 *
 * which is the same fault class one step later: a ShadowNode whose target was
 * dropped (`_reset()` nulls `node.shadowMap`) while its compiled `updateBefore`
 * registration survived in a cached node-builder state. A pipeline rebuild does
 * not recompile cached material node states, so the backoff retry ladder can
 * NEVER fix it either — it must route to the same refuse-then-real-recovery path.
 */
export function isShadowResourceError(err: unknown): boolean {
    if (!err) return false;
    const msg =
        typeof err === 'string'
            ? err
            : (err as { message?: unknown })?.message;
    if (typeof msg !== 'string') return false;
    const lc = msg.toLowerCase();
    return lc.includes('shadowdepthtexture')
        || lc.includes('shadowmap')
        || lc.includes('shadow map')
        || lc.includes("depthtexture");
}

/**
 * §I2 — Dispose a single THREE Material without ever throwing the WebGPU
 * `usedTimes` device-loss TypeError. Any OTHER error re-throws so genuine
 * disposal bugs are not masked.
 *
 * §GPU-RESOURCE-LIFETIME INVARIANT L1 — a cache-owned material
 * ({@link markSharedGpuResource}) is NEVER disposed here.
 *
 * Safe to call with `null`/`undefined` (no-op).
 */
export function safeDisposeMaterial(material: Material | null | undefined): void {
    if (!material) return;
    if (isSharedGpuResource(material)) return; // INVARIANT L1 — cache owns it.
    try {
        material.dispose();
    } catch (err) {
        if (isUsedTimesDisposeError(err)) {
            // §I2 — stale WebGPU node state; the GPU resource is already (being)
            // reclaimed by the device-loss/backend-swap path. Swallow so the
            // builder's rebuild() completes and the element still renders.
            return;
        }
        throw err;
    }
}

/**
 * §I2 — Dispose one or many THREE Materials (handles the `Material | Material[]`
 * shape that `Mesh.material` can take). WebGPU-safe; see {@link safeDisposeMaterial}.
 */
export function safeDisposeMaterials(
    material: Material | Material[] | null | undefined,
): void {
    if (!material) return;
    if (Array.isArray(material)) {
        for (const m of material) safeDisposeMaterial(m);
    } else {
        safeDisposeMaterial(material);
    }
}

/**
 * §I2 — Dispose a single THREE BufferGeometry without throwing the WebGPU
 * `usedTimes` device-loss TypeError (geometry disposal can also fan out into
 * NodeManager teardown on WebGPU). Any other error re-throws.
 *
 * Safe to call with `null`/`undefined` (no-op).
 */
export function safeDisposeGeometry(geometry: BufferGeometry | null | undefined): void {
    if (!geometry) return;
    if (isSharedGpuResource(geometry)) return; // INVARIANT L1 — cache owns it.
    try {
        geometry.dispose();
    } catch (err) {
        if (isUsedTimesDisposeError(err)) return; // §I2
        throw err;
    }
}

/**
 * §I2 — Deep-dispose an Object3D subtree: every descendant Mesh/LineSegments
 * has its geometry and material(s) disposed WebGPU-safely. This is the helper
 * element builders should call from their `dispose()` instead of a raw
 * `traverse(... geometry.dispose() / material.dispose())` loop, so a single
 * stale render object can never abort the whole teardown (and therefore the
 * whole `rebuild()`).
 *
 * `disposeMaterials` defaults to true; pass `false` for builders that share
 * materials across elements (e.g. a per-builder singleton) and dispose those
 * separately — matching the existing GLB-exporter rule of never disposing
 * shared resources.
 */
export function safeDisposeObject3D(
    root: Object3D | null | undefined,
    disposeMaterials = true,
): void {
    if (!root) return;
    root.traverse((obj: Object3D) => {
        const maybeMesh = obj as Partial<Mesh>;
        if (maybeMesh.geometry) {
            safeDisposeGeometry(maybeMesh.geometry as BufferGeometry);
        }
        if (disposeMaterials && maybeMesh.material) {
            safeDisposeMaterials(maybeMesh.material as Material | Material[]);
        }
    });
}

/* ─── §FIX-DELETED-TEXTURE-BIND — shared-texture disposal safety ─────────────
 *
 * The bug (same FAMILY as §I2, but for TEXTURES): a SHARED THREE.Texture — an
 * HDRI/PMREM env map, or a PBR color/normal/roughness map cached in the
 * material library and assigned as `.map` / `.envMap` on HUNDREDS of per-element
 * materials across every storey of a heavy scene — is `.dispose()`d (a quality /
 * HDRI / sky change, a reload, an env-map re-bake) while LIVE meshes still carry
 * a reference to it. `Texture.dispose()` deletes the underlying GL texture object
 * immediately; every material that still points at it then asks the renderer to
 * bind a deleted object, and the (WebGL / webgl-fallback) driver floods:
 *
 *     WebGL: INVALID_OPERATION: bindTexture: attempt to use a deleted object
 *
 * Those draws are rejected, so the elements referencing that texture DROP OUT of
 * the frame — the founder's "it doesn't render all the elements" on the
 * 40-storey office (~1316 elements). WebGPU device-loss re-baking hits the same
 * dangling-reference class.
 *
 * The fix mirrors the guarded/ref-counted spirit of `safeDisposeMaterial`: never
 * delete a texture that a live mesh still binds. `detachTextureFromScene()`
 * walks the scene and NULLS every material slot (and `scene.environment` /
 * `scene.background`) that points at the doomed texture BEFORE it is deleted, so
 * no live draw can bind a deleted object. `safeDisposeTexture()` does that detach
 * then disposes the texture WebGPU-safely.
 */

/** Texture-carrying slots on THREE materials we may need to detach. */
const TEXTURE_MATERIAL_SLOTS = [
    'map',
    'envMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'bumpMap',
    'displacementMap',
    'alphaMap',
    'lightMap',
    'clearcoatMap',
    'clearcoatNormalMap',
    'clearcoatRoughnessMap',
    'sheenColorMap',
    'sheenRoughnessMap',
    'specularMap',
    'specularIntensityMap',
    'specularColorMap',
    'transmissionMap',
    'thicknessMap',
    'iridescenceMap',
    'iridescenceThicknessMap',
    'anisotropyMap',
    'gradientMap',
] as const;

/**
 * §FIX-DELETED-TEXTURE-BIND — Detach `texture` from every live reference in
 * `scene` (all material texture slots on every Mesh, plus `scene.environment` /
 * `scene.background`) so that once it is deleted no live draw can bind it. Sets
 * `material.needsUpdate = true` on any material we detached so the renderer drops
 * the stale binding on the next frame.
 *
 * No-op when `texture` or `scene` is null/undefined.
 */
export function detachTextureFromScene(
    texture: Texture | null | undefined,
    scene: Scene | null | undefined,
): void {
    if (!texture || !scene) return;

    // Scene-level IBL / background slots.
    const sceneRec = scene as unknown as Record<string, unknown>;
    if (sceneRec.environment === texture) sceneRec.environment = null;
    if (sceneRec.background === texture) sceneRec.background = null;

    scene.traverse((obj: Object3D) => {
        const maybeMesh = obj as Partial<Mesh>;
        const material = maybeMesh.material;
        if (!material) return;
        const mats = Array.isArray(material) ? material : [material];
        for (const mat of mats) {
            if (!mat) continue;
            const rec = mat as unknown as Record<string, unknown>;
            let touched = false;
            for (const slot of TEXTURE_MATERIAL_SLOTS) {
                if (rec[slot] === texture) {
                    rec[slot] = null;
                    touched = true;
                }
            }
            if (touched) (mat as Material).needsUpdate = true;
        }
    });
}

/**
 * §FIX-DELETED-TEXTURE-BIND — Dispose a THREE.Texture WITHOUT ever leaving a
 * deleted texture bound to a live mesh.
 *
 * When `scene` is provided, every live reference to `texture` is detached first
 * (see {@link detachTextureFromScene}) — this is the guard that stops the
 * `bindTexture: attempt to use a deleted object` flood on shared env/PBR maps.
 * Callers that KNOW the texture is exclusively theirs may omit `scene`.
 *
 * WebGPU-safe: the `usedTimes` device-loss TypeError (§I2 family — texture
 * disposal can also fan out into NodeManager teardown on WebGPU) is swallowed;
 * any other error re-throws so genuine disposal bugs still surface.
 *
 * Safe to call with `null`/`undefined` (no-op).
 */
export function safeDisposeTexture(
    texture: Texture | null | undefined,
    scene?: Scene | null | undefined,
): void {
    if (!texture) return;
    if (isSharedGpuResource(texture)) return; // INVARIANT L1 — cache owns it.
    if (scene) detachTextureFromScene(texture, scene);
    try {
        texture.dispose();
    } catch (err) {
        if (isUsedTimesDisposeError(err)) return; // §I2
        throw err;
    }
}
