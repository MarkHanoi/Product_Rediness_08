/**
 * @pryzm/renderer-three — §RETIRE-RENDERER-DETACHES-LISTENERS  (L-948)
 *
 * ADR-0297 INVARIANT L2 ("DETACH now, RELEASE at the boundary") applied to the
 * one resource nothing else detaches: **the retired renderer's own listeners on
 * the scene's materials and geometries.**
 *
 * ── The defect (founder, 2026-08-17: "many elements batch created — none visible") ──
 * A heavy batch create (1,611 walls / 457 doors / 173 windows) trips the auto-WebGL
 * heavy-scene switch (ADR-0267); the live backend swap runs (ADR-0077,
 * initScene §RENDERER-LIVE-SWAP); the WebGPU device is destroyed. Plan view keeps
 * drawing the whole model — it compiles no shaders — while the 3D viewport shows
 * only the slab shell. Console:
 *
 *   THREE.TSL: TypeError: Cannot read properties of undefined (reading 'usedTimes')
 *       at NodeManager.delete → RenderObjects#onDispose → RenderObject.dispose
 *       → RenderObject.onMaterialDispose → Material.dispatchEvent → Material.dispose
 *       → disposeShadowMaterial → ShadowNode._reset → ShadowNode.dispose
 *       → AnalyticLightNode.setup
 *
 * ── Why the listener outlives the renderer (all real three r183 source) ─────
 *  • `RenderObject`'s constructor registers a `'dispose'` listener on the material
 *    AND the geometry it draws (RenderObject.js:328-329). Only
 *    `RenderObject.dispose()` takes them off again (RenderObject.js:906-907).
 *  • `Renderer.dispose()`'s ONLY render-object teardown is `this._objects.dispose()`
 *    (Renderer.js:2369) — and `RenderObjects.dispose()` is, in full,
 *    `this.chainMaps = {}` (RenderObjects.js:173-177). It never disposes a single
 *    render object, so **every one of those listeners survives the renderer.**
 *    Compare `Geometries.dispose()` (Geometries.js:381-391), which walks
 *    `_geometryDisposeListeners` and removes every one: upstream three saw this
 *    hazard for geometries and closed it. The identical hazard for MATERIALS lives
 *    one level up, in `RenderObjects`, and is still open.
 *  • `Renderer.dispose()` then clears the very DataMaps those leaked listeners
 *    reach into (`_nodes`/`_pipelines`/`_bindings`, Renderer.js:2371-2373;
 *    `DataMap.dispose()` is `this.data = new WeakMap()`). A late listener therefore
 *    lands in `NodeManager.delete()` on `this.get(object).nodeBuilderState` ===
 *    `undefined` → `undefined.usedTimes--` (NodeManager.js:267-268) — the throw.
 *
 * ── Why ONE dead renderer blanks a whole model ─────────────────────────────
 * The resources holding those listeners across a swap are three's own MODULE-GLOBAL
 * caches, not per-renderer state: `Lighting._weakMap` is keyed by **scene**
 * (Lighting.js:4) and `shadowMaterialLib` by **light** (ShadowFilterNode.js:12).
 * The live swap deliberately keeps the same `THREE.Scene`, so the LightsNode, its
 * AnalyticLightNodes, their ShadowNodes and the shadow NodeMaterial all outlive the
 * renderer that minted their render objects. The first material compiled on the new
 * backend runs `AnalyticLightNode.setup()`, which disposes the stale shadow node
 * (AnalyticLightNode.js:266-270 / disposeShadow) → shadow material `dispose()` →
 * the DEAD renderer's leaked listener → throw. `EventDispatcher.dispatchEvent` has
 * no try/catch (EventDispatcher.js:101-126), so the throw both skips the LIVE
 * renderer's listener and escapes into `setup()` **before** its `this.shadowNode =
 * null` — leaving the stale node in place so the next compile throws identically.
 * Every material needing a node build on the new backend fails to compile. Nothing
 * new is drawn.
 *
 * ── The fix ────────────────────────────────────────────────────────────────
 * A retired renderer must dispose its render objects — three's own teardown, which
 * removes the listeners first (RenderObject.js:906-907) — **while its DataMaps are
 * still intact**, and only then dispose itself. `RenderObjects`' chain maps are
 * WeakMap-based (ChainMap.js) and cannot be enumerated, so the render objects are
 * recorded as the renderer mints them: {@link trackRenderObjectsForRetirement} is
 * installed once, at creation, and {@link retireRenderer} is the single retirement
 * seam every dispose site must use.
 *
 * ── What this file deliberately does NOT do ────────────────────────────────
 * It does not swallow the `usedTimes` TypeError. That throw is a SYMPTOM; the
 * existing suppression of it (`ViewportCrashGuard`, `safeDispose`) is precisely why
 * this reached the founder as "nothing is visible" instead of as a crash. Nothing
 * here widens that suppression: the listener is REMOVED, so there is no throw to
 * suppress. A renderer that was never tracked is reported loudly rather than
 * silently tolerated.
 *
 * P2: structurally typed throughout — no THREE value or type import — so the seam
 * is unit-testable without a GPU and carries no coupling of its own.
 *
 * OTel (C10 §2): consistent with `safeDispose.ts` and
 * `RenderPipelineManager._safeDisposeRenderPipeline`, these carry no span — the
 * gate (`tools/ga-gate/check-otel-spans.ts`) scopes to command-bus handler files in
 * `plugins/&#42;/src/handlers/`, and the callers already own a swap/recovery span.
 */

/** The shape of `THREE.RenderObject` this module needs (three/src/renderers/common/RenderObject.js). */
interface RenderObjectLike {
    dispose(): void;
    readonly material?: { removeEventListener?(type: string, listener: unknown): void } | null;
    readonly geometry?: { removeEventListener?(type: string, listener: unknown): void } | null;
    readonly onMaterialDispose?: unknown;
    readonly onGeometryDispose?: unknown;
}

/** The shape of `THREE.RenderObjects` this module needs (…/common/RenderObjects.js). */
interface RenderObjectsLike {
    createRenderObject(...args: unknown[]): RenderObjectLike;
}

/**
 * The shape of a three `Renderer`/`WebGPURenderer` this module needs. `_objects` is
 * private in three but is the only handle on the render objects a renderer minted;
 * a classic `THREE.WebGLRenderer` simply has none (see {@link retireRenderer}).
 */
interface RetirableRendererLike {
    _objects?: RenderObjectsLike | null;
    dispose?(): void;
}

/**
 * Live render objects per renderer. Two deliberate choices:
 *
 *  • A WeakMap keyed by the renderer (not a field ON the renderer), so tracking adds
 *    no enumerable property to a THREE object and cannot keep a retired renderer alive.
 *
 *  • `WeakRef` entries, so **tracking never pins a render object.** This matters at
 *    exactly the scale that produced L-948: a render object holds its object,
 *    material, geometry, scene and camera, and a 1,611-wall model mints thousands of
 *    them, per pass. A strong Set would keep every one — and its whole subtree —
 *    alive until the renderer was retired, trading a listener-lifetime bug for a
 *    memory-lifetime one on the heaviest scenes we have. The weak entry costs no
 *    coverage: a render object whose material is still live is ALREADY strongly
 *    reachable (`material._listeners.dispose` holds `renderObject.onMaterialDispose`,
 *    an arrow closure over the render object), so anything a weak ref loses is
 *    precisely something that registered no surviving listener to detach.
 */
const _tracked = new WeakMap<object, Set<WeakRef<RenderObjectLike>>>();

/** Renderers whose `createRenderObject` we have already wrapped (idempotence). */
const _instrumented = new WeakSet<object>();

/**
 * §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) — how many render objects each renderer has
 * EVER minted, monotonic and never pruned.
 *
 * `_tracked` holds `WeakRef`s and is therefore a "what is still detachable" set. That
 * makes its count a **lossy** answer to the only question a retirement log is asked:
 * *"did the sweep find the things it was supposed to find?"* A `0` from it has three
 * different meanings and the log printed one word for all three —
 *
 *   • the renderer MINTS NONE (a classic `THREE.WebGLRenderer` has no `RenderObjects`
 *     at all): 0 is CORRECT and complete; nothing was ever attached.
 *   • the renderer owns `RenderObjects` but was never instrumented: 0 means the sweep
 *     LOOKED IN THE WRONG PLACE and every listener is about to leak (already warned).
 *   • the renderer WAS instrumented and minted N > 0, yet 0 are detachable now: the
 *     tracking set was emptied by something other than this seam. Previously SILENT.
 *
 * The third is the one this repo keeps being wrong about (a version count, an audit
 * detector, an in-flight guard, a rescue that rescued nothing — all reported `0`).
 * A monotonic mint counter is the cheapest thing that makes the three distinguishable,
 * and it is DERIVED at the one place render objects come into existence rather than
 * remembered by a caller.
 */
const _minted = new WeakMap<object, number>();

/**
 * §RETIRE-RENDERER-DETACHES-LISTENERS — record every render object `renderer`
 * mints, so {@link retireRenderer} can tear them down in the right order.
 *
 * Install ONCE, immediately after `await renderer.init()` (which is where
 * `Renderer._objects` is created — Renderer.js:796). Idempotent: a second call on
 * the same renderer is a no-op that still reports `true`.
 *
 * @returns `true` when tracking is active for this renderer; `false` when the
 *          renderer exposes no `RenderObjects` (a classic `THREE.WebGLRenderer`,
 *          or a renderer whose `init()` has not run yet). A `false` here is not an
 *          error — but it does mean {@link retireRenderer} can only fall back to a
 *          bare `dispose()`, so callers that expect tracking should install it late
 *          enough to get `true`.
 */
export function trackRenderObjectsForRetirement(renderer: unknown): boolean {
    const r = renderer as RetirableRendererLike | null | undefined;
    const objects = r?._objects;
    if (!objects || typeof objects.createRenderObject !== 'function') return false;

    if (_instrumented.has(r as object)) return true;

    const live = new Set<WeakRef<RenderObjectLike>>();
    _tracked.set(r as object, live);
    _instrumented.add(r as object);

    const original = objects.createRenderObject.bind(objects);
    objects.createRenderObject = (...args: unknown[]): RenderObjectLike => {
        const renderObject = original(...args);
        if (renderObject && typeof renderObject.dispose === 'function') {
            const ref = new WeakRef(renderObject);
            live.add(ref);
            // §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) — monotonic; never pruned.
            _minted.set(r as object, (_minted.get(r as object) ?? 0) + 1);
            // three disposes render objects during normal churn too (a material
            // version change — RenderObjects.js:131). Drop them from the set there
            // as well, so the set tracks what is LIVE rather than what was ever made.
            const disposeOnce = renderObject.dispose.bind(renderObject);
            (renderObject as { dispose: () => void }).dispose = () => {
                live.delete(ref);
                disposeOnce();
            };
        }
        return renderObject;
    };
    return true;
}

/**
 * How many live render objects are currently tracked for `renderer` (diagnostics +
 * tests). Prunes entries whose target has been collected, so the count is what is
 * still detachable rather than what was ever minted.
 */
export function trackedRenderObjectCount(renderer: unknown): number {
    const live = _tracked.get(renderer as object);
    if (!live) return 0;
    let n = 0;
    for (const ref of Array.from(live)) {
        if (ref.deref() === undefined) live.delete(ref);
        else n++;
    }
    return n;
}

/**
 * §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) — how many render objects `renderer` has EVER
 * minted. Monotonic; unaffected by GC and by normal render-object churn, so it is the
 * denominator that makes a `0` from {@link retireRenderer} readable.
 */
export function mintedRenderObjectCount(renderer: unknown): number {
    return _minted.get(renderer as object) ?? 0;
}

/**
 * §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) — what KIND of renderer is being retired, so a
 * zero detach count can be read.
 *
 *  • `'mints-none'` — the renderer exposes no `RenderObjects` at all (a classic
 *    `THREE.WebGLRenderer`). It registers no material/geometry `'dispose'` listeners,
 *    so **0 is the complete and correct answer**: nothing was ever attached.
 *  • `'tracked'`    — instrumented; the sweep looked in the right place. Read the
 *    detached count against {@link mintedRenderObjectCount}.
 *  • `'untracked'`  — the renderer OWNS `RenderObjects` but was never instrumented.
 *    A 0 here means the sweep found nothing **because it looked in the wrong place**;
 *    every listener it registered is about to outlive it (L-948).
 *
 * DERIVED from the renderer's own shape and this module's own instrumentation record —
 * never from a remembered list of renderer class names.
 */
export function classifyRetirement(renderer: unknown): 'mints-none' | 'tracked' | 'untracked' {
    const r = renderer as RetirableRendererLike | null | undefined;
    const objects = r?._objects;
    if (!objects || typeof objects.createRenderObject !== 'function') return 'mints-none';
    return _instrumented.has(r as object) ? 'tracked' : 'untracked';
}

/**
 * §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) — a retirement log line that cannot say `0` and
 * mean three different things. Call it BEFORE {@link retireRenderer} to capture `minted`
 * and `kind` while the tracking state is still intact, then pass the detached count in.
 *
 * Exists because `"0 render object(s) detached"` has been printed by this codebase for a
 * correct classic-renderer retirement, for a never-rendered renderer, and (in principle)
 * for a sweep that missed — three states one string could not distinguish. C84 EI-1: the
 * counter and its denominator are ONE fact, reported together.
 */
export function describeRetirement(
    _renderer: unknown,
    detached: number,
    mintedBefore: number,
    kind: 'mints-none' | 'tracked' | 'untracked',
): string {
    switch (kind) {
        case 'mints-none':
            return `${detached} detached — this renderer MINTS NO render objects (classic ` +
                   `THREE.WebGLRenderer); zero is complete, nothing was ever attached`;
        case 'untracked':
            return `${detached} detached of ${mintedBefore} minted — UNTRACKED: the renderer owns ` +
                   `RenderObjects but was never instrumented, so this sweep looked in the wrong ` +
                   `place and its listeners WILL outlive it (L-948)`;
        default:
            return mintedBefore === 0
                ? `${detached} detached — tracked, but this renderer never minted a render object ` +
                  `(retired before its first draw); zero is complete`
                : `${detached} detached of ${mintedBefore} minted (tracked)`;
    }
}

/**
 * §RETIRE-RENDERER-DETACHES-LISTENERS — dispose every tracked render object of
 * `renderer`, which is what removes its `'dispose'` listeners from the scene's
 * materials and geometries (RenderObject.js:906-907).
 *
 * MUST run BEFORE `renderer.dispose()`: that call clears the `_nodes` /
 * `_pipelines` / `_bindings` DataMaps these teardowns read, and after it the same
 * teardown throws instead of completing. {@link retireRenderer} enforces the order;
 * this function is exported for callers that already own their dispose sequencing.
 *
 * Never throws. If a single render object's teardown fails anyway, its two
 * listeners are removed directly — detaching is the point, and one bad handle must
 * not strand the rest.
 *
 * @returns the number of render objects torn down.
 */
export function disposeTrackedRenderObjects(renderer: unknown): number {
    const live = _tracked.get(renderer as object);
    if (!live || live.size === 0) return 0;

    let released = 0;
    for (const ref of Array.from(live)) {
        const renderObject = ref.deref();
        if (renderObject === undefined) {
            // Already collected — so is every listener it registered. Nothing to detach.
            live.delete(ref);
            continue;
        }
        try {
            renderObject.dispose();
        } catch (err) {
            // The listeners come off FIRST inside RenderObject.dispose(), so by here
            // they are almost certainly already gone; remove them anyway rather than
            // assume. This is not error suppression — the failure is reported.
            try { renderObject.material?.removeEventListener?.('dispose', renderObject.onMaterialDispose); } catch { /* detached already */ }
            try { renderObject.geometry?.removeEventListener?.('dispose', renderObject.onGeometryDispose); } catch { /* detached already */ }
            console.warn(
                '[renderer-three] §RETIRE-RENDERER-DETACHES-LISTENERS a render object failed to tear ' +
                'down cleanly; its dispose listeners were detached directly:',
                err instanceof Error ? err.message : err,
            );
        }
        live.delete(ref);
        released++;
    }
    return released;
}

/**
 * §RETIRE-RENDERER-DETACHES-LISTENERS — **the single seam for retiring a renderer.**
 * Every site that disposes a live renderer (the ADR-0077 live backend swap, the
 * ADR-0089 device-loss recovery, adapter teardown) must call this instead of
 * `renderer.dispose()`.
 *
 * Order is the whole point (ADR-0297 INVARIANT L2): DETACH the retired renderer
 * from every material and geometry it was listening to, and only then RELEASE the
 * renderer. Reversing it is the L-948 defect.
 *
 * Never throws — a retirement failure must not abort the swap that is mid-flight.
 *
 * @returns the number of render objects detached (0 for a classic
 *          `THREE.WebGLRenderer`, which mints none — its own `onMaterialDispose` is
 *          guarded upstream at WebGLRenderer.js:1136-1140 and never produced this
 *          throw).
 */
export function retireRenderer(renderer: unknown): number {
    if (!renderer || typeof renderer !== 'object') return 0;

    let detached = 0;
    try {
        detached = disposeTrackedRenderObjects(renderer);
    } catch (err) {
        console.warn(
            '[renderer-three] §RETIRE-RENDERER-DETACHES-LISTENERS render-object teardown failed (non-fatal):',
            err instanceof Error ? err.message : err,
        );
    }

    const r = renderer as RetirableRendererLike;
    // Say so when a renderer that DOES own render objects was never instrumented:
    // its listeners are about to leak and the next material dispose will throw
    // `usedTimes`. Loud, because a silent version of this is exactly L-948.
    if (detached === 0 && r._objects && !_instrumented.has(renderer)) {
        console.warn(
            '[renderer-three] §RETIRE-RENDERER-DETACHES-LISTENERS retiring a renderer that owns ' +
            'RenderObjects but was never tracked — its material/geometry dispose listeners will ' +
            'outlive it (L-948). Call trackRenderObjectsForRetirement() right after renderer.init().',
        );
    }
    // §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) — the THIRD zero, which was SILENT. The
    // renderer WAS instrumented and DID mint render objects, yet none were detachable
    // when the sweep ran. The tracking set was emptied by something other than this
    // seam, so listeners this module believes it removed may still be attached. Never
    // fatal — but never silent again: a `0` next to a non-zero mint count is the exact
    // shape of every counter this project has previously been wrong about.
    if (detached === 0 && _instrumented.has(renderer) && (_minted.get(renderer) ?? 0) > 0) {
        console.warn(
            '[renderer-three] §RETIRE-ZERO-IS-NOT-ONE-FACT retiring a TRACKED renderer that minted ' +
            `${_minted.get(renderer)} render object(s) but had 0 detachable at retirement — the ` +
            'sweep found nothing where there was something. Its listeners may still be attached ' +
            '(L-948 / L-1410).',
        );
    }

    try {
        r.dispose?.();
    } catch (err) {
        console.warn(
            '[renderer-three] §RETIRE-RENDERER-DETACHES-LISTENERS renderer.dispose() failed (non-fatal):',
            err instanceof Error ? err.message : err,
        );
    }
    return detached;
}

/* ─── §DEVICE-DESTROY-IS-NOT-DEVICE-LOSS (L-1001) ─────────────────────────────
 *
 * `GPUDevice.lost` resolves for TWO categorically different events, and the WebGPU
 * spec distinguishes them in the one field nothing here was reading:
 *
 *   reason = "unknown"    — the DEVICE FAILED. The driver reset, the GPU hung, the
 *                           browser evicted us. Nobody chose this; recovery is the
 *                           correct response.
 *   reason = "destroyed"  — `device.destroy()` was CALLED. That is US. It is the
 *                           last step of {@link retireRenderer} → `renderer.dispose()`
 *                           → `backend.destroy()`, i.e. the normal, intended end of
 *                           every live backend swap (ADR-0077 §RENDERER-LIVE-SWAP),
 *                           every device-loss REBUILD, and every adapter teardown.
 *
 * Treating the second as the first is a self-inflicted cascade: a deliberate
 * teardown fires "context lost" at the app, which kicks the recovery pipeline, which
 * retires a renderer, which destroys a device, which resolves another `lost`.
 *
 * MEASURED 2026-08-18 (founder, third production sample, alongside L-981):
 *   [renderer-three/WebGPURendererAdapter] WebGPU device lost: reason="destroyed", …
 *   [createRenderer] WebGPU device lost: reason="destroyed", …
 * TWO handlers on the SAME device, printing back to back. `createRenderer.ts:391`
 * had the guard — `if (info.reason === 'destroyed') return;` — and stopped.
 * `WebGPURendererAdapter`'s did NOT, and fired its `onContextLost` callbacks anyway.
 * One of the two was already right; the defect was that the rule lived as a literal
 * inside one call site instead of as a shared, named authority both could consult.
 *
 * That is what this function is. It is the ONLY place the string `'destroyed'` is
 * interpreted; both handlers dispatch into it. Deliberately here in
 * `rendererRetirement` and not in an adapter: this module is what CAUSES the
 * `destroyed` reason, so it is the module that gets to say the reason is ours.
 *
 * ⛔ NOT a suppression. Nothing is swallowed and no diagnostic is weakened — both
 * call sites still log the raw `reason` and `message` verbatim before asking. What
 * changes is only whether a DELIBERATE teardown is allowed to masquerade as a
 * failure and trigger repair machinery for a fault that did not occur.
 */

/** The shape of `GPUDeviceLostInfo` this decision needs — structural, so no DOM/WebGPU lib types are required. */
export interface DeviceLostReasonLike {
    reason?: string;
}

/**
 * §DEVICE-DESTROY-IS-NOT-DEVICE-LOSS (L-1001) — true when a `GPUDevice.lost`
 * resolution describes OUR OWN `device.destroy()` rather than a real device failure.
 *
 * Callers must still LOG the raw info; this only decides whether to run recovery.
 *
 * @param info the resolved `GPUDeviceLostInfo` (or anything carrying `.reason`).
 * @returns true ⇒ deliberate teardown, do not treat as a loss and do not recover.
 */
export function isDeliberateDeviceDestroy(info: DeviceLostReasonLike | null | undefined): boolean {
    return info?.reason === 'destroyed';
}
