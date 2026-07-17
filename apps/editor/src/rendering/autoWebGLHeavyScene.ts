/**
 * @file apps/editor/src/rendering/autoWebGLHeavyScene.ts
 *
 * §AUTO-WEBGL-HEAVY (ADR-0267) — Auto-mode proactive WebGL fallback for heavy scenes.
 *
 * ## Why this exists
 *
 * Generating a residential / office building on the **WebGPU** backend reliably
 * device-losses some GPUs (the founder's Windows box): the heavy-scene PSO-compile
 * storm + transmission-glass TSL node graph tips the GPU-driver watchdog (TDR) —
 * `THREE.TSL: Invalid generated code, expected a "float"` / `WebGPU Device Lost:
 * "A valid external Instance reference no longer exists"` (L-361). The SAME building
 * renders cleanly on WebGL (founder-confirmed repeatedly), so this is a fundamental
 * WebGPU heavy-scene instability on that hardware, not a recent regression.
 *
 * The device-loss RECOVERY (createRenderer.ts §FIX-HEAVY-SCENE-3D-SCALABILITY cap →
 * WebGL safe-mode) already exists as a SAFETY NET, but it is REACTIVE — it fires only
 * AFTER the GPU has already been lost (and on a truly unlucky box the WebGL2 fallback
 * can be lost too, reaching the §L-324 terminal reload state). This guard is
 * PROACTIVE: when a scene becomes heavy and the backend is in **Auto** mode on a real
 * WebGPU device, it live-swaps to WebGL ONCE per session, BEFORE the heavy PSO-compile
 * that would TDR the device, and pins WebGL for the session.
 *
 * ## Gating (all must hold before a swap fires)
 *
 *   1. **Auto mode only.** An explicit 'webgpu' pick is a user override we RESPECT
 *      (keep WebGPU, log once, never swap). The unset default is 'webgl'
 *      (§PERF-WEBGPU-FRAGMENT), so only a user who explicitly chose 'auto' can reach
 *      the swap. Light scenes on 'auto' keep WebGPU (nicer glass gloss).
 *   2. **Real WebGPU backend only.** `renderPipelineManager.status.webGpuActive`
 *      (set from `RenderPipelineManager.isRealWebGPUBackend()`). On the WebGL2 fallback
 *      there is no WebGPU device to lose — nothing to do.
 *   3. **Device-loss-risk heuristic tripped.** REUSES the EXACT
 *      {@link isHeavyModel} predicate from LevelScoped3DCullingService (≥ 15 levels
 *      AND ≥ 1000 elements, OR ≥ 4000 elements), fed the same top-level-element count
 *      semantics, so the two subsystems never disagree on "heavy".
 *   4. **Once per session.** A module-scoped guard (mirrored to globalThis for
 *      observability + cross-re-eval idempotency). Set BEFORE the async swap so the
 *      two call-sites (batch GPU-compile-start + per-add tier pass) can never
 *      double-fire; left set even on swap failure (the device-loss recovery is the
 *      net — we never thrash the swap).
 *
 * ## Contract compliance
 *   P2 — no THREE import (structural {@link SceneLike} only); the scene comes from the
 *        caller (initScene / initBatchLifecycle, the THREE owners at L5).
 *   P4 — no `(window as any)`; a typed `globalThis` cast (the same pattern
 *        LevelScoped3DCullingService uses).
 *   P8 — the swap-trigger path opens a `pryzm.renderer.auto-webgl-heavy` OTel span.
 *   C04 §1.4 — Known-behavior backend policy (ADR-0267), not a violation.
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isHeavyModel } from '@pryzm/core-app-model/rendering';
import { getRendererBackendPreference, type RendererBackendPreference } from './createRenderer';

const TRACER = trace.getTracer('pryzm-engine');

// ── Once-per-session guards ─────────────────────────────────────────────────
// Module-scoped, mirrored to globalThis so a module re-evaluation (HMR / test)
// cannot re-arm an already-fired swap. `_explicitWarnDone` throttles the
// respected-override warning to once.
let _autoSwapDone = false;
let _explicitWarnDone = false;

// ── Typed global access (P4 — no `window as any`) ───────────────────────────

/**
 * Structural view of a THREE.Scene — just the top-level children + their userData —
 * so this module needs NO THREE import (P2). The callers pass `world.scene.three`.
 */
interface SceneLike {
    children: ReadonlyArray<{
        userData?: { id?: string; levelId?: string; isPreview?: boolean; isHelper?: boolean };
    }>;
}

interface AutoWebGLGlobals {
    __pryzmAutoSwappedToWebGL?: boolean;
    bimManager?: { getLevels?: () => unknown[] };
    renderPipelineManager?: { status?: { webGpuActive?: boolean } };
    pryzmSwapRendererBackend?: (pref: RendererBackendPreference) => Promise<boolean>;
}

function G(): AutoWebGLGlobals {
    return globalThis as unknown as AutoWebGLGlobals;
}

/**
 * Count top-level BIM element roots — a verbatim mirror of
 * `LevelScoped3DCullingService._elementCount`, so {@link isHeavyModel} sees the
 * SAME element count both subsystems calibrate their thresholds against.
 */
function countElements(scene: SceneLike): number {
    let count = 0;
    for (const child of scene.children) {
        const ud = child.userData;
        if (!ud) continue;
        if (!ud.id && !ud.levelId) continue;
        if (ud.isPreview === true || ud.isHelper === true) continue;
        count++;
    }
    return count;
}

/**
 * True once the Auto-mode heavy-scene swap has already fired (or been mirrored on
 * globalThis) this session. Exposed for the (rare) caller that wants to short-circuit
 * its own work when the backend is already pinned to WebGL by this policy.
 */
export function hasAutoSwitchedToWebGL(): boolean {
    return _autoSwapDone || G().__pryzmAutoSwappedToWebGL === true;
}

/**
 * §AUTO-WEBGL-HEAVY — if the live scene is device-loss-risk and the backend is in
 * Auto mode on a real WebGPU device, proactively live-swap to WebGL ONCE for the
 * session (before the heavy PSO-compile that would TDR the device). No-op on every
 * gate miss (light scene / explicit backend / already swapped / no real WebGPU / no
 * live-swap entry point). Safe to call on any hot path — the cheap gates return
 * early; only the genuine trigger opens a span or does work.
 *
 * @param scene  the live THREE.Scene (structural), from the caller (initScene owns THREE).
 * @param reason short tag for the log/span (e.g. `'gpu-compile-start'`, `'tier:add:bim-wall-added'`).
 */
export function maybeAutoSwitchToWebGLForHeavyScene(
    scene: SceneLike | null | undefined,
    reason: string,
): void {
    // Gate 4 (cheapest) — once per session.
    if (hasAutoSwitchedToWebGL()) return;
    if (!scene) return;

    // Gate 1 — Auto mode only. 'webgl' is already the safe path; 'webgpu' is a
    // respected override handled below (only after we know the scene is heavy, so the
    // warning is meaningful).
    const pref = getRendererBackendPreference();
    if (pref === 'webgl') return;

    // Gate 2 — real WebGPU backend only. On the WebGL2 fallback there is no WebGPU
    // device to lose. (undefined = RPM not yet bound → not real WebGPU yet → skip.)
    if (G().renderPipelineManager?.status?.webGpuActive !== true) return;

    // Gate 3 — device-loss-risk heuristic (REUSED verbatim from the culling service).
    const levelCount = G().bimManager?.getLevels?.().length ?? 0;
    const elementCount = countElements(scene);
    if (!isHeavyModel(levelCount, elementCount)) return;

    // Heavy scene on a real WebGPU device.
    if (pref === 'webgpu') {
        // Explicit user override wins — keep WebGPU, warn ONCE (the device-loss
        // recovery safe-mode remains the fallback if the GPU is then lost).
        if (!_explicitWarnDone) {
            _explicitWarnDone = true;
            console.warn(
                `[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — scene is device-loss-risk ` +
                `(${elementCount} elems / ${levelCount} levels; reason=${reason}) but the backend is ` +
                `EXPLICITLY pinned to WebGPU — respecting the override, NOT switching. If the GPU is ` +
                `lost the device-loss recovery safe-mode is the net. Pick 'Auto' to allow the ` +
                `proactive WebGL swap on heavy scenes.`,
            );
        }
        return;
    }

    // pref === 'auto' → proactively swap to WebGL, once.
    const swap = G().pryzmSwapRendererBackend;
    if (typeof swap !== 'function') {
        // The live-swap entry point (initScene §RENDERER-LIVE-SWAP) is not registered
        // (no PRYZM overlay renderer / Phase-5). Leave WebGPU; the device-loss recovery
        // remains the safety net. Do NOT set the guard — a later add may find it wired.
        return;
    }

    // Set the guard BEFORE the async swap so a concurrent call-site cannot double-fire.
    // Left set even if the swap fails — recovery is the net, never a swap thrash.
    _autoSwapDone = true;
    G().__pryzmAutoSwappedToWebGL = true;

    const span = TRACER.startSpan('pryzm.renderer.auto-webgl-heavy', {
        attributes: {
            'pryzm.renderer.auto-webgl.reason': reason,
            'pryzm.renderer.auto-webgl.elements': elementCount,
            'pryzm.renderer.auto-webgl.levels': levelCount,
        },
    });
    console.warn(
        `[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — scene is device-loss-risk ` +
        `(${elementCount} elems / ${levelCount} levels; reason=${reason}); Auto mode switching ` +
        `WebGPU→WebGL to avoid heavy-scene device loss. (Explicit WebGPU selection would override this.)`,
    );
    // Fire the existing live backend swap (persists 'webgl' + rebinds in place, no
    // reload). Deliberately NOT awaited: the caller (a batch GPU-compile-start hook or
    // a per-add tier pass) must not block on the rebuild. The swap's synchronous
    // prefix (stop the rAF loop + dispose the old pipeline) runs before this call
    // returns, so no further WebGPU frame renders — the PSO storm never reaches the
    // doomed device.
    void swap('webgl')
        .then((ok) => {
            span.setAttribute('pryzm.renderer.auto-webgl.swapped', ok);
            span.setStatus({ code: ok ? SpanStatusCode.OK : SpanStatusCode.ERROR });
            if (!ok) {
                console.warn(
                    '[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — live swap returned false (kept current ' +
                    'backend); the device-loss recovery safe-mode remains the net.',
                );
            }
        })
        .catch((err: unknown) => {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            console.error('[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — live swap threw (non-fatal):', err);
        })
        .finally(() => span.end());
}
