// §PERF-DRAWCALLS-ARE-CUMULATIVE (L-2502) — the ONE owner of "how many draw calls
// was that frame?", because the honest answer depends on which `Info` class the
// live renderer happens to be carrying, and every reader in this repo guessed.
//
// ── THE DEFECT THIS EXISTS TO CLOSE ────────────────────────────────────────────
//
// `three@0.183.2` ships TWO unrelated `Info` implementations, and the SAME field
// name means DIFFERENT things in each. Verified in the vendored build, not quoted
// from a doc.
//
// ⚠ LINE NUMBERS RE-MEASURED 2026-09-04 against `node_modules/three` at the
// installed version — `node -p "require('three/package.json').version"` → 0.183.2.
// The five `three.webgpu.js` citations in the first draft of this header were each
// 20-45 lines stale (`:30867/:30891/:30892/:30968/:30987`). The FACTS were right and
// the CITATIONS were wrong, which is the failure shape CLAUDE.md documents six times
// over. ⛔ Re-grep before quoting; a `three` bump moves all of these.
//
//   build/three.webgpu.js  — `class Info` (:30859) (WebGPURenderer, both backends)
//     :30911  render.calls       "The number of render calls since the app has been
//                                 started" (its own JSDoc, :30902)
//     :30912  render.frameCalls  render calls of the current frame
//     :30913  render.drawCalls   DRAW CALLS OF THE CURRENT FRAME    ← the real one
//     :30959  update() does `this.render.drawCalls ++` — per DRAW call.
//     :58180  `info.render.calls ++` / :58181 `info.render.frameCalls ++` — per
//              RENDER call. `calls` is incremented here and zeroed NOWHERE below.
//     :30988  reset()  zeroes drawCalls / frameCalls / triangles / points / lines.
//              ⛔ It does NOT zero `calls`. Only dispose() does (:31004).
//     :28916  `if ( this.info.autoReset === true ) this.info.reset();` — so the
//              frame-scoped fields really are frame-scoped, and `calls` really is not.
//
//   build/three.module.js  — `function WebGLInfo` (:4515) (classic WebGLRenderer)
//     :4522   render = { frame, calls, triangles, points, lines }
//              ⛔ There is NO `drawCalls` and NO `frameCalls` field at all.
//     :4564   reset() DOES zero `calls`, and render() calls it every frame while
//              `info.autoReset === true` (:17483; default set at :4577).
//              So here `calls` IS a per-frame draw-call count.
//
// ⭐ ONE LINE, TWO MEANINGS, NO LABEL. `info.render.calls` is a per-frame count on
// a classic WebGLRenderer and a monotonically-rising since-boot total on a
// WebGPURenderer. Reading it blind and printing it as "LAST RENDERED FRAME" — which
// is what every reader in this repo did — produces a number that grows without
// bound and looks like a catastrophic scene, on a backend where it is simply an
// odometer.
//
// ── WHY THE SCOPE IS WIDER THAN L-2502 RECORDED ───────────────────────────────
//
// L-2502 wrote: *"On `webgl-classic` the same field DOES mean per-frame draw
// calls"*, which reads as "only the WebGPU sessions are affected". MEASURED HERE,
// that under-states it.
//
// ⚠ THE FIRST DRAFT OF THIS PARAGRAPH SAID "FOUR backends and only ONE of them is a
// classic renderer" AND THEN LISTED THREE. Both halves were wrong. Re-read
// `RendererHandleFactory.create()` 2026-09-04: there are FIVE return sites, and TWO
// adapter classes, hence exactly TWO `Info` shapes. Ordered as the function tries them:
//
//   1. :158  preferClassicWebGL → `new WebGLRendererAdapter`  → WebGLInfo → per-frame
//            (§L-372B, the heavy-generation "webgl-only" target)
//   2. :192  forceWebGL → WebGPURendererAdapter{forceWebGL2}  → Info    → CUMULATIVE
//            (this is `webgl-fallback`, the path `autoWebGLHeavyScene` forces a heavy
//             scene onto — i.e. the founder's own sessions)
//   3. :211  forceWebGL, WebGL2-via-WebGPURenderer failed      → WebGLInfo → per-frame
//   4. :224  auto → WebGPURendererAdapter.create()             → Info    → CUMULATIVE
//            (`type` is 'webgpu' natively or 'webgl2' on its WebGL2 backend — the
//             SAME `Info` class either way, which is why `type` cannot discriminate)
//   5. :252  last resort → `new WebGLRendererAdapter`          → WebGLInfo → per-frame
//
// So THREE of five sites yield a classic renderer, not one — but the two CUMULATIVE
// sites are the ones a normal boot and the forced-WebGL escape hatch actually reach,
// which is why the mislabelling was live rather than theoretical. Adapters verified:
// `WebGLRendererAdapter.ts:83` → `new THREE.WebGLRenderer`;
// `WebGPURendererAdapter.ts:141` → `new WebGPURenderer`, `:149` passes `forceWebGL`.
//
// So the mislabelling covered the WebGL fallback too, and any arithmetic done
// against a `webgl-fallback` reading — comparing a scene-graph mesh count to it,
// subtracting a forward-pass estimate from it — was comparing a per-frame quantity
// against an odometer. That class of arithmetic is numerology; the ledger said so
// about one such number (§1.2(b)) and then did it again in its own §9.1.
//
// ── HOW THE BACKEND IS DISCRIMINATED, AND WHY NOT BY NAME ─────────────────────
//
// By the SHAPE of the info object, never by the renderer's class name.
// `isWebGPURenderer` is a known false positive — a `WebGPURenderer` built with
// `forceWebGL: true` still reports `true` (see `pryzmPerfConsole.ts`'s own warning
// on `RendererLike`) — so a name test would misattribute exactly the case that
// matters most here, backend 2 above.
//
// `render.drawCalls` exists ONLY on the WebGPU-family `Info` (verified above: the
// classic `WebGLInfo.render` literal has five keys and that is not one of them).
// Its presence is therefore an exact structural discriminator, and it needs no
// renderer handle, no backend string and no cross-check to be right.
//
// ── CONTRACT NOTES ────────────────────────────────────────────────────────────
//
// P2 (single THREE owner): this file imports NOTHING — not even the re-export. It
//   is structurally typed over the two `info` shapes, which is all a counter read
//   needs. It lives in renderer-three because that is where renderer knowledge
//   belongs, not because it needs THREE.
// P8: no span, deliberately, matching the sibling `materialSignature.ts` and
//   `SharedMaterialCache._isDedupEnabled`'s stated rationale — this is read on a
//   per-frame diagnostic path and a span per read would be a cost the instrument
//   itself imposes on the thing it measures. Zone C (ungated census), not Zone B.
// C04 §1.1: renderer-internal knowledge, exposed as a pure reader.

/** The `render` sub-object of either `Info` implementation. All fields optional. */
export interface RendererRenderInfoLike {
    /** Both: WebGPU = since app start · classic WebGL = current frame. */
    calls?: number;
    /** WebGPU-family only: render calls this frame. */
    frameCalls?: number;
    /** WebGPU-family only: DRAW calls this frame. Absent on classic WebGLInfo. */
    drawCalls?: number;
    triangles?: number;
}

/** The `info` surface of either renderer. */
export interface RendererInfoLike {
    render?: RendererRenderInfoLike;
}

/**
 * Which field the reading came from, and therefore what it means. Printed beside
 * the number so a reader can never inherit the ambiguity this module removes.
 */
export type DrawCallProvenance =
    /** `render.drawCalls` — per-frame, WebGPURenderer (native or WebGL2 backend). */
    | 'drawCalls/frame (webgpu-family Info)'
    /** `render.calls` — per-frame, classic THREE.WebGLRenderer (autoReset zeroes it). */
    | 'calls/frame (classic WebGLInfo)'
    /** No usable field — the caller MUST NOT print a number. */
    | 'unavailable';

export interface FrameDrawCallReading {
    /**
     * Draw calls submitted in the LAST RENDERED FRAME, or `null` when no field on
     * this renderer carries that meaning.
     *
     * ⛔ `null` is not zero. A caller printing `0` here would manufacture the exact
     * false exoneration `pryzmPerfConsole`'s rule 3 forbids.
     */
    perFrame: number | null;
    /** Where {@link perFrame} came from — print this next to it. */
    provenance: DrawCallProvenance;
    /**
     * The since-boot render-call odometer, when the renderer keeps one
     * (WebGPU-family only; `null` on classic WebGL, which has no such field).
     * Useful as a liveness signal — it must keep rising — and for NOTHING else.
     * ⛔ Never subtract a per-frame quantity from this.
     */
    cumulativeCalls: number | null;
    /** Render calls this frame (WebGPU-family only). A frame's PASS count. */
    frameCalls: number | null;
}

const UNAVAILABLE: FrameDrawCallReading = Object.freeze({
    perFrame: null,
    provenance: 'unavailable',
    cumulativeCalls: null,
    frameCalls: null,
});

/**
 * Resolve the per-frame draw-call count from a live renderer's `info`, naming the
 * field it came from.
 *
 * PURE: reads only; allocates one small result object; never mutates `info`.
 *
 * @param info `renderer.info` from either renderer family, or null/undefined.
 * @returns a reading whose `perFrame` is `null` (never 0) when unresolvable.
 */
export function readFrameDrawCalls(info: RendererInfoLike | null | undefined): FrameDrawCallReading {
    const render = info?.render;
    if (!render) return UNAVAILABLE;

    // WebGPU-family Info: `drawCalls` is present and is already per-frame, because
    // Info.reset() zeroes it and the renderer resets once per frame.
    if (typeof render.drawCalls === 'number') {
        return {
            perFrame: render.drawCalls,
            provenance: 'drawCalls/frame (webgpu-family Info)',
            cumulativeCalls: typeof render.calls === 'number' ? render.calls : null,
            frameCalls: typeof render.frameCalls === 'number' ? render.frameCalls : null,
        };
    }

    // Classic WebGLInfo: no `drawCalls` field exists, and `calls` IS the per-frame
    // count because WebGLRenderer.render() calls info.reset() under autoReset.
    if (typeof render.calls === 'number') {
        return {
            perFrame: render.calls,
            provenance: 'calls/frame (classic WebGLInfo)',
            // There is no odometer on this renderer. Saying `null` rather than
            // echoing `calls` keeps the two meanings from re-merging downstream.
            cumulativeCalls: null,
            frameCalls: null,
        };
    }

    return UNAVAILABLE;
}

/**
 * True when this renderer's `info.render.calls` is a since-boot odometer rather
 * than a per-frame count — i.e. when reading `calls` directly would be wrong.
 *
 * Exposed so a diagnostic can WARN about a legacy reading it does not own (there
 * is one such reader outside this lane's files: `core-app-model`'s
 * `RenderPerformanceService`), instead of silently disagreeing with it.
 */
export function isCumulativeCallsField(info: RendererInfoLike | null | undefined): boolean {
    return typeof info?.render?.drawCalls === 'number';
}
