/**
 * MIGRATION NOTE (S92-WIRE, 2026-05-01):
 *   Moved from `src/rendering/rendererPrewarm.ts` → `src/engine/subsystems/rendering/rendererPrewarm.ts`
 *   Reason: Intra-src consolidation: L6 renderer pre-warmer → engine subsystems (NFT-2)
 *   Per `02-ARCHITECTURE.md §8` convergence boolean row 1 (`legacy_src_folders == 1`).
 *   Package promotion deferred to Wave 11 (`15-PACKAGE-POPULATION-GAP.md §3`).
 */
/**
 * @file src/rendering/rendererPrewarm.ts
 *
 * WebGPU renderer pre-warmer — NFT-2 performance optimisation.
 *
 * PROBLEM:
 *   `initScene.ts` Phase 5 calls `createRenderer()` synchronously on the
 *   project-open critical path.  `WebGPURenderer.init()` (GPU adapter request
 *   + shader pipeline compilation) blocks the main thread for 2,401 ms on this
 *   host, causing a LONGTASK that alone violates NFT-2 (project-load < 6 s p95)
 *   per `01-VISION.md §5`.
 *
 * FIX:
 *   `prewarmRenderer()` is called fire-and-forget at the end of Phase B
 *   (`main.ts` deferred wiring), while the user is still browsing the landing
 *   page / project hub.  The WebGPU renderer is initialised on a detached
 *   canvas.  `consumePrewarmedRenderer()` is called from `initScene.ts Phase 5`
 *   and returns the already-initialised canvas + renderer in O(1) — no GPU
 *   adapter round-trip on the project-open path.
 *
 * FALLBACK:
 *   If the pre-warm has not yet completed (user opened a project extremely
 *   quickly) or failed (no WebGPU / WebGL2), `consumePrewarmedRenderer()`
 *   returns `null`.  `initScene.ts` then falls back to the original synchronous
 *   `createRenderer()` call.
 *
 * CONSTRAINTS:
 *   - No @thatopen/* imports permitted here (01-BIM-ENGINE-CORE §4.3).
 *   - No direct `requestAnimationFrame` calls (P3 — only frame-scheduler rAF).
 *   - Canvas is created detached; DOM insertion happens in `initScene.ts`.
 */

import { createRenderer } from './createRenderer';
import type { RendererResult } from './createRenderer';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrewarmResult {
    /** The detached canvas the renderer was initialised on. */
    canvas: HTMLCanvasElement;
    /** The fully-initialised renderer + backend descriptor. */
    rendererResult: RendererResult;
}

// ── Module-level state ───────────────────────────────────────────────────────

let _promise: Promise<PrewarmResult | null> | null = null;
let _consumed = false;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Kicks off WebGPU renderer initialisation in the background.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Should be called fire-and-forget at the end of Phase B in `main.ts`.
 *
 * NFT alignment: eliminates the 2,401 ms LONGTASK from the project-open
 * critical path (NFT-2: project-load < 6 s p95, `01-VISION.md §5`).
 */
export function prewarmRenderer(): void {
    if (_promise !== null) return;

    const t0 = performance.now();

    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-pryzm', 'webgpu');
    // Size to current viewport — `initScene.ts` will re-sync on consume.
    canvas.width  = window.innerWidth  || 1920;
    canvas.height = window.innerHeight || 1080;

    _promise = createRenderer(canvas)
        .then((rendererResult): PrewarmResult => {
            const elapsed = (performance.now() - t0).toFixed(0);
            console.log(
                `[RendererPrewarm] ${rendererResult.backend} renderer pre-warmed in ${elapsed} ms` +
                ` — LONGTASK eliminated from project-open critical path.`,
            );
            return { canvas, rendererResult };
        })
        .catch((err): null => {
            console.warn(
                '[RendererPrewarm] Pre-warm failed — renderer will be created on demand:',
                err instanceof Error ? err.message : err,
            );
            _promise = null;
            return null;
        });
}

/**
 * Returns the pre-warmed canvas + renderer if available, or `null`.
 *
 * Each pre-warmed result is consumed exactly once (singleton — the canvas
 * is appended to the DOM by `initScene.ts`).
 *
 * If the pre-warm Promise is still pending (user opened a project before
 * Phase B completed), this call awaits it so the project-open path still
 * benefits from however much of the init has already happened.
 */
export async function consumePrewarmedRenderer(): Promise<PrewarmResult | null> {
    if (_consumed)          return null;   // already handed to initScene.ts
    if (_promise === null)  return null;   // prewarmRenderer() was never called

    const result = await _promise;
    if (result === null) return null;      // pre-warm failed

    _consumed = true;
    return result;
}
