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

import type { BufferGeometry, Material, Object3D, Mesh } from '@pryzm/renderer-three/three';

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

/**
 * §I2 — Dispose a single THREE Material without ever throwing the WebGPU
 * `usedTimes` device-loss TypeError. Any OTHER error re-throws so genuine
 * disposal bugs are not masked.
 *
 * Safe to call with `null`/`undefined` (no-op).
 */
export function safeDisposeMaterial(material: Material | null | undefined): void {
    if (!material) return;
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
