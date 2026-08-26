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
 * ## Two entry points (ADR-0267 start-of-generation refinement, L-367)
 *
 *   • {@link maybeAutoSwitchToWebGLForHeavyScene} — REACTIVE: fires once the live scene
 *     is measurably heavy (Gate 3). It is the fallback for scenes that become heavy
 *     without a known building command. Because it needs geometry to exist first, it
 *     fires MID-generation — a few WebGPU sub-batches render before it lands on WebGL.
 *   • {@link proactivelySwitchToWebGLForBuildingGeneration} — PROACTIVE: fires at the
 *     START of a KNOWN heavy building generation (residential / office / house), before
 *     any geometry exists, so the WHOLE generation runs on WebGL (no TSL flash, no
 *     PSO-compile stall). Skips Gate 3 (the caller has already asserted heaviness); all
 *     other gates + the once-per-session guard are shared, so the two never double-swap.
 *
 * ## Gating (all must hold before a swap fires)
 *
 *   1+2. **The current backend must BENEFIT from the classic-renderer swap.**
 *      §L-372 Batch 2 follow-up (L-382) — this keys off the LIVE backend
 *      (`window.pryzmRendererBackend`), not the persisted pref. The swap fires when the
 *      backend is `'webgpu'` (a heavy scene is a near-certain device-loss on the affected
 *      hardware — ADR-0267/§Fix-3/L-366) OR `'webgl-fallback'` (a `WebGPURenderer`
 *      forceWebGL2 that STILL lazily TSL-node-compiles every material's shader per sub-batch
 *      and during navigation — the founder's "Compiling GPU shaders" tail). It is a no-op
 *      only when the backend is already the classic `'webgl-only'` renderer (nothing to
 *      upgrade) or the backend is not yet resolved. This SUPERSEDES both the former
 *      real-WebGPU-only gate AND the "explicit 'webgl' pick is already safe → skip" gate:
 *      the founder's box boots `'webgl-fallback'` via a persisted `'webgl'` pref, so BOTH
 *      old gates wrongly short-circuited the exact case that must upgrade to classic. The
 *      explicit-'webgpu' path still logs a distinct one-time warning; 'auto'/'webgl' log the
 *      plain swap.
 *   3. **Device-loss-risk-for-WebGPU-swap heuristic tripped.** Uses a DEDICATED,
 *   3. **Device-loss-risk-for-WebGPU-swap heuristic tripped.** Uses a DEDICATED,
 *      much lower threshold than the massing-LOD system's {@link isHeavyModel}
 *      (ADR-0267 §Fix-1 / L-366): a swap fires when the scene has **≥ 400 BIM elements
 *      OR ≥ 1000 meshes**. This is deliberately far below the LOD massing gate (≥ 15
 *      levels AND ≥ 1000 elems, OR ≥ 4000 elems) because a NORMAL building generation —
 *      a ~6-storey / ~1,300-element / ~1,645-mesh residential block — reliably
 *      device-losses WebGPU on the affected hardware yet never trips isHeavyModel, so
 *      the reused gate let it stay on WebGPU and crash (L-361). A single manual room /
 *      element edit (< ~100 elements, < ~1000 meshes) stays well under both arms, so
 *      trivial edits never force a swap. The LOD system keeps its own higher
 *      isHeavyModel gate untouched — the two thresholds are intentionally decoupled.
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
import { getRendererBackendPreference, type RendererBackendPreference } from './createRenderer';
// §MESH110 (L-11564) — the swap thresholds now have ONE owner: the zero-import leaf
// module `heavySceneSwapThreshold.ts`, shared with the census's
// §NAV-BACKEND-SWAP-HEADROOM line in pryzmPerfConsole.ts (which could never import
// THIS module — it pulls in the renderer-creation graph via createRenderer, and a
// diagnostic must not change what it measures). The rationale for the values — a
// DEDICATED device-loss-risk threshold (ADR-0267 §Fix-1 / L-366), deliberately far
// below LevelScoped3DCullingService.isHeavyModel — lives with the constants.
import { SWAP_ELEMENT_THRESHOLD, SWAP_MESH_THRESHOLD } from './heavySceneSwapThreshold';

const TRACER = trace.getTracer('pryzm-engine');

/**
 * §AUTO-WEBGL-HEAVY — **THE** backend-swap heaviness predicate (C04 §1.4, NORMATIVE).
 *
 * The dedicated swap-decision predicate (see the threshold note above) — NOT
 * isHeavyModel. Either arm tripping means "proactively drop to WebGL before the PSO
 * storm". `sceneMeshCount` is optional: callers that already have a live mesh count
 * (the initScene tier pass) thread it; callers that don't (the batch hook) rely on the
 * element arm alone.
 *
 * EXPORTED 2026-08-20 (lane SWAP1, L-1413) so it can be measured directly rather than
 * inferred from whether a swap happened. C04 §1.4 previously quoted
 * `LevelScoped3DCullingService.isHeavyModel` as the swap's predicate; it never was, and
 * `isHeavyModel` has no call sites outside its own file. Two documents naming two
 * different authorities for one decision is how a founder-reported swap on a
 * 233-element / 3,191-mesh / 7-level project read as "the guard fired when the contract
 * says it must not". It fired because THIS predicate says so, on the mesh arm.
 */
export function isSwapWorthyHeavyScene(elementCount: number, sceneMeshCount: number | undefined): boolean {
    if (elementCount >= SWAP_ELEMENT_THRESHOLD) return true;
    if (typeof sceneMeshCount === 'number' && sceneMeshCount >= SWAP_MESH_THRESHOLD) return true;
    return false;
}

// ── Once-per-session guard ──────────────────────────────────────────────────
// Module-scoped, mirrored to globalThis so a module re-evaluation (HMR / test)
// cannot re-arm an already-fired swap. §Fix-3 (L-366) folded the former
// explicit-pin "respect the override" path into the swap, so the separate
// `_explicitWarnDone` throttle is gone — the once-per-session `_autoSwapDone`
// guard already fires the swap (and its warning) exactly once.
let _autoSwapDone = false;

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
    // §L-372 Batch 2 follow-up (L-382) — the authoritative resolved backend, set by
    // createRenderer() on every build (boot + live swap). Read to decide whether the
    // classic-renderer swap benefits the CURRENT backend (see the Gate 1+2 note above).
    pryzmRendererBackend?: 'webgpu' | 'webgl-fallback' | 'webgl-only';
    pryzmSwapRendererBackend?: (pref: RendererBackendPreference) => Promise<boolean>;
}

function G(): AutoWebGLGlobals {
    return globalThis as unknown as AutoWebGLGlobals;
}

/**
 * Count top-level BIM element roots — a verbatim mirror of
 * `LevelScoped3DCullingService._elementCount`, so this element count matches the
 * one the culling/LOD subsystem calibrates its own thresholds against.
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
 * §L-372 Batch 2 follow-up (L-382) — does the CURRENT backend benefit from upgrading to
 * the classic `'webgl-only'` renderer?
 *
 *  • `'webgpu'`         → YES — a heavy scene on a real WebGPU device is a device-loss risk
 *                         on the affected hardware (ADR-0267); swap to classic pre-empts it.
 *  • `'webgl-fallback'` → YES — this is a `WebGPURenderer({forceWebGL2})` whose TSL node
 *                         system STILL lazily node-compiles every material's shader per
 *                         deferred sub-batch AND during navigation (the founder's "Finishing
 *                         up — Compiling GPU shaders" / `WebGPU PSO compile LONGTASK`). The
 *                         founder's box BOOTS straight into this backend (persisted `'webgl'`
 *                         pref → `createRenderer` forceWebGL2), so it never reached a real-
 *                         WebGPU state and the OLD real-WebGPU-only gate never let the swap
 *                         fire. Upgrading to the classic renderer (stock GLSL, no TSL/node
 *                         compile) kills that tail.
 *  • `'webgl-only'`     → NO — already the classic renderer; nothing to upgrade.
 *  • unresolved (`undefined`) → NO — the backend is not yet known; skip.
 */
function backendBenefitsFromClassicSwap(): boolean {
    const backend = G().pryzmRendererBackend;
    return backend === 'webgpu' || backend === 'webgl-fallback';
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
 * @param sceneMeshCount optional live scene mesh count (the initScene tier pass already
 *   computes it); feeds the ≥ 1000-mesh swap arm. Omit on callers without a mesh count —
 *   the ≥ 400-element arm still applies.
 */
export function maybeAutoSwitchToWebGLForHeavyScene(
    scene: SceneLike | null | undefined,
    reason: string,
    sceneMeshCount?: number,
): void {
    // Gate 4 (cheapest) — once per session.
    if (hasAutoSwitchedToWebGL()) return;
    if (!scene) return;

    // Gate 1+2 — §L-372 Batch 2 follow-up (L-382): key off the CURRENT backend, not the
    // persisted pref. Swap when the live backend BENEFITS from the classic renderer —
    // 'webgpu' (device-loss risk) OR 'webgl-fallback' (still TSL-node-compiling: the
    // founder's "Compiling GPU shaders" tail). Skip only when already on 'webgl-only'
    // (nothing to upgrade) or the backend is unresolved. This REPLACES the former real-
    // WebGPU-only gate AND the "explicit 'webgl' pick is already safe → skip" gate: on the
    // founder's box the persisted pref IS 'webgl' and the backend IS 'webgl-fallback' — the
    // exact case that must upgrade, which both old gates wrongly short-circuited.
    if (!backendBenefitsFromClassicSwap()) return;

    // `pref` is read only for the explicit-WebGPU-pin warning wording in fireSwapToWebGL.
    const pref = getRendererBackendPreference();

    // Gate 3 — DEDICATED device-loss-risk-for-WebGPU-swap heuristic (ADR-0267 §Fix-1 /
    // L-366). NOT isHeavyModel — a much lower, swap-specific threshold (see the note at
    // SWAP_ELEMENT_THRESHOLD) so a normal building generation trips it but a manual edit
    // does not. `levelCount` is retained purely for the log/span below.
    const levelCount = G().bimManager?.getLevels?.().length ?? 0;
    const elementCount = countElements(scene);
    if (!isSwapWorthyHeavyScene(elementCount, sceneMeshCount)) return;

    // Heavy scene on a real WebGPU device → fire the shared swap (once). §Fix-3 (L-366):
    // BOTH 'auto' AND explicit 'webgpu' swap on a device-loss-risk scene; an explicit pin
    // no longer keeps such a scene on WebGPU (that reliably crashed on this hardware). Only
    // LIGHT scenes (which never reach here) still honour an explicit WebGPU pin.
    fireSwapToWebGL(reason, pref === 'webgpu', {
        elements: elementCount,
        meshes: sceneMeshCount ?? -1,
        levels: levelCount,
        proactive: false,
    });
}

/**
 * §AUTO-WEBGL-HEAVY-PROACTIVE (ADR-0267 start-of-generation refinement, L-367) — swap
 * WebGPU→WebGL at the **START** of a KNOWN heavy building generation (residential /
 * office / house), BEFORE any of its geometry exists or is rendered on WebGPU.
 *
 * ## Why a second entry point
 *
 * {@link maybeAutoSwitchToWebGLForHeavyScene} is REACTIVE: it can only decide once the
 * scene is already heavy (its Gate 3 counts live elements / meshes), so it fires MID-
 * generation — after the first heavy WebGPU sub-batch has already rendered. On the
 * affected hardware that first pass is exactly what tips the TDR: the founder saw a
 * `THREE.TSL: Invalid generated code, expected a "float"` flash and an ~11 s
 * `WebGPU PSO compile LONGTASK` stall BEFORE the reactive swap finally landed on WebGL.
 *
 * A multi-storey building generation is KNOWN to be heavy up front (that is the whole
 * premise of ADR-0267), so we do not need to wait for the scene to prove it. This entry
 * point is called from the building-generation lifecycle hook the moment a generation
 * BEGINS, so the WHOLE generation runs on WebGL (no TSL flash, no PSO-compile stall).
 *
 * ## Gating
 *
 * Identical to the reactive path EXCEPT Gate 3 is intentionally omitted — the caller has
 * already asserted "this is a heavy building generation". Gates 1+2/4 still hold, so an
 * already-classic ('webgl-only') backend / an unresolved backend / an already-fired swap
 * are all no-ops. §L-372 Batch 2 follow-up (L-382): the swap now ALSO fires when the live
 * backend is 'webgl-fallback' (the founder's box boots there and never had a real-WebGPU
 * swap to trigger), not only on real 'webgpu'. Shares the once-per-session guard with the
 * reactive path, so whichever fires first wins and the other no-ops (no double swap).
 */
export function proactivelySwitchToWebGLForBuildingGeneration(reason: string): void {
    // Gate 4 (cheapest) — once per session (shared guard with the reactive path).
    if (hasAutoSwitchedToWebGL()) return;
    // Gate 1+2 — §L-372 Batch 2 follow-up (L-382): swap when the CURRENT backend benefits
    // from the classic renderer — 'webgpu' (device-loss risk) OR 'webgl-fallback' (still
    // TSL-node-compiling → "Compiling GPU shaders"). Skip only when already on 'webgl-only'
    // or the backend is unresolved. Keys off the live backend, NOT the persisted pref, so
    // the founder's box (pref 'webgl' → backend 'webgl-fallback') now upgrades to classic.
    if (!backendBenefitsFromClassicSwap()) return;
    // `pref` is read only for the explicit-WebGPU-pin warning wording in fireSwapToWebGL.
    const pref = getRendererBackendPreference();
    // NO Gate 3 — a KNOWN multi-storey building generation is heavy by definition; the
    // point of this entry is to swap BEFORE the geometry (and its first heavy render)
    // exists, so there is nothing to count yet.
    const levelCount = G().bimManager?.getLevels?.().length ?? 0;
    fireSwapToWebGL(reason, pref === 'webgpu', { elements: -1, meshes: -1, levels: levelCount, proactive: true });
}

/**
 * Shared swap-firing tail for BOTH the reactive ({@link maybeAutoSwitchToWebGLForHeavyScene})
 * and proactive ({@link proactivelySwitchToWebGLForBuildingGeneration}) paths. Sets the
 * once-per-session guard, opens the OTel span, warns, and fires the live backend swap.
 * `diag.proactive` only affects the log wording + the span attribute; `diag.elements` /
 * `diag.meshes` are `-1` on the proactive path (no geometry exists yet).
 */
function fireSwapToWebGL(
    reason: string,
    explicitPin: boolean,
    diag: { elements: number; meshes: number; levels: number; proactive: boolean },
): void {
    const swap = G().pryzmSwapRendererBackend;
    if (typeof swap !== 'function') {
        // The live-swap entry point (initScene §RENDERER-LIVE-SWAP) is not registered
        // (no PRYZM overlay renderer / Phase-5). Leave WebGPU; the device-loss recovery
        // remains the safety net. Do NOT set the guard — a later call may find it wired.
        return;
    }

    // Set the guard BEFORE the async swap so a concurrent call-site cannot double-fire.
    // Left set even if the swap fails — recovery is the net, never a swap thrash.
    _autoSwapDone = true;
    G().__pryzmAutoSwappedToWebGL = true;

    const span = TRACER.startSpan('pryzm.renderer.auto-webgl-heavy', {
        attributes: {
            'pryzm.renderer.auto-webgl.reason': reason,
            'pryzm.renderer.auto-webgl.elements': diag.elements,
            'pryzm.renderer.auto-webgl.meshes': diag.meshes,
            'pryzm.renderer.auto-webgl.levels': diag.levels,
            'pryzm.renderer.auto-webgl.explicit-pin': explicitPin,
            'pryzm.renderer.auto-webgl.proactive': diag.proactive,
        },
    });
    if (diag.proactive) {
        // §AUTO-WEBGL-HEAVY-PROACTIVE (L-367) — start-of-generation swap, before geometry.
        console.warn(
            `[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY-PROACTIVE — a heavy building generation is ` +
            `starting (${diag.levels} level(s); reason=${reason}); switching WebGPU→WebGL up front ` +
            `so the whole generation avoids the heavy-scene device loss.` +
            (explicitPin ? ' (overrides the explicit WebGPU pin — re-pick WebGPU to override.)' : ''),
        );
    } else if (explicitPin) {
        // §Fix-3 (L-366) — heavy scene under an EXPLICIT WebGPU pin: swap anyway (stability),
        // and tell the user clearly + how to force WebGPU back.
        console.warn(
            `[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — device-loss-risk scene ` +
            `(${diag.elements} elems / ${diag.meshes} meshes / ${diag.levels} levels; reason=${reason}); ` +
            `switched WebGPU→WebGL for stability despite the explicit WebGPU pin. Re-pick WebGPU to override.`,
        );
    } else {
        console.warn(
            `[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — scene is device-loss-risk ` +
            `(${diag.elements} elems / ${diag.meshes} meshes / ${diag.levels} levels; reason=${reason}); Auto mode switching ` +
            `WebGPU→WebGL to avoid heavy-scene device loss.`,
        );
    }
    // §L-372 Batch 2 / L-382 — fire the live backend swap to the CLASSIC target
    // ('webgl-classic' → a genuine THREE.WebGLRenderer, backend 'webgl-only'), NOT the
    // WebGPURenderer(forceWebGL2) 'webgl' path. The forceWebGL2 path is still a
    // WebGPURenderer whose TSL node system lazily node-compiles every material's shader
    // per deferred sub-batch AND during navigation ("Finishing up — Compiling GPU
    // shaders", the founder's L-382 symptom); routing heavy generation to the classic
    // renderer uses stock GLSL with NO TSL/node compile, so that tail disappears.
    // The material-safety audit confirmed the generated scene is 100% classic materials,
    // so it renders correctly (walls/slabs/glass/stairs/furniture + WebGLShadowMap
    // shadows) on the classic renderer. Deliberately NOT awaited: the caller (a
    // generation-start hook, a batch GPU-compile-start hook, or a per-add tier pass) must
    // not block on the rebuild. The swap's synchronous prefix (stop the rAF loop + dispose
    // the old pipeline) runs before this call returns, so no further WebGPU frame renders —
    // the PSO storm never reaches the doomed device. If classic construction/wiring fails,
    // the swap's guarded fallback lands on 'webgl-fallback' (today's behaviour), never dead.
    void swap('webgl-classic')
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
