/**
 * engineWarmup.ts — O.14 (+ O.8 direction): warm the heavy BIM-engine BOOT
 * during onboarding so the post-brief "Downloading BIM engine…" wait feels fast.
 *
 * THE PROBLEM
 * -----------
 * The BIM engine bundle (`@app/engine/engineLauncher`, ~2.6 MB — Three.js +
 * @thatopen + web-ifc, see `vite.config.ts §manualChunks`) is a DYNAMIC import
 * behind `loadEngine()` in `src/main.ts`. It is downloaded + module-evaluated
 * ONLY on the user's first project open (`workspaceMount.ensure()`), i.e. AFTER
 * the onboarding brief CTA. The first overlay stage is literally
 * "Downloading BIM engine…" (`EngineLoadingOverlay.ts:32`, 6 s budget): the user
 * waits while the 2.6 MB chunk downloads + parses cold.
 *
 * Meanwhile the WebGPU renderer is already pre-warmed during the landing/hub via
 * `rendererPrewarm.ts` (NFT-2). The engine MODULE download is the remaining cold
 * cost on the generate path.
 *
 * THE FIX (conservative — START EARLIER, do not skip anything)
 * -----------------------------------------------------------
 * `ensureEngineWarm()` kicks off the engine-chunk dynamic import as soon as
 * onboarding starts (the RAC role/brief/location/draw steps take several seconds
 * — ample time to download + evaluate the chunk). It caches the resulting module
 * promise. `src/main.ts`'s `loadEngine()` then AWAITS THE SAME cached promise
 * instead of starting a cold download, so the real boot (`bootstrap()`) finds the
 * module already resolved from cache. We move the START of the download earlier
 * and parallelise it with the conversation; we do NOT skip or re-order any
 * correctness-bearing init.
 *
 * WHAT THIS WARMS EARLY
 * ---------------------
 * Only the PROJECT-INDEPENDENT, side-effect-free part: the engine MODULE
 * download + ES-module evaluation (`import('@app/engine/engineLauncher')`).
 * Evaluating the module merely registers its exports — it does NOT call
 * `bootstrap()`, construct the Three.js world, build stores/tools, or touch any
 * project id. That is safe to do before a project exists.
 *
 * WHAT STAYS LATE (deliberately)
 * ------------------------------
 * `bootstrap(runtime)` itself — and everything it drives (initScene → renderer
 * mount on the real #container canvas, initBuilders, initTools, initUI,
 * persistence/collaboration, the ~34 stores, physics/temporal/semantic graphs) —
 * stays on the project-open path. It REQUIRES a live DOM canvas (`#container`) and
 * an open project context (`window.currentProjectId`, active level) that do not
 * exist during onboarding, so warming it early would be unsafe / impossible.
 * See `engineLauncher.ts:bootstrap()` (container lookup at line ~144) and
 * `main.ts:bootPlatform()` §16.4 D.3 (renderer mount deferred until canvas).
 *
 * SAFETY / FALLBACK
 * -----------------
 * - Pure NO-OP-safe: a warm FAILURE clears the cache and resolves to `null`; the
 *   cold `loadEngine()` path in `main.ts` then runs unchanged.
 * - Idempotent: repeated calls return the same in-flight/resolved promise; the
 *   chunk is downloaded at most once per session (browser cache covers re-opens).
 * - Best-effort: it NEVER throws into the onboarding/auth flow (the caller fires
 *   it fire-and-forget; the promise rejection is swallowed here).
 */

type EngineModule = typeof import('@app/engine/engineLauncher');

// Single shared cached promise — the module is downloaded + evaluated at most
// once per session. `loadEngine()` in main.ts delegates to `warmEngineModule()`
// so the prefetch and the real boot share ONE download.
let _warmPromise: Promise<EngineModule> | null = null;

/**
 * Resolve (and cache) the engine module promise. Shared by both the early warm
 * (`ensureEngineWarm()`) and the real boot (`main.ts:loadEngine()`).
 *
 * On rejection the cache is cleared so the next call retries cold — identical to
 * the prior `loadEngine()` retry semantics.
 */
export function warmEngineModule(): Promise<EngineModule> {
    if (_warmPromise === null) {
        _warmPromise = import('@app/engine/engineLauncher').catch((err) => {
            // Clear so the next call (typically the real boot) retries cold.
            _warmPromise = null;
            throw err;
        });
    }
    return _warmPromise;
}

/**
 * O.14 — fire-and-forget engine warm. Call this when onboarding starts so the
 * engine chunk downloads + evaluates DURING the RAC/brief/location/draw steps,
 * making the post-brief generate→loader wait short.
 *
 * Best-effort and never throws: a warm failure is swallowed (logged) and the
 * cold `loadEngine()` path in main.ts handles it on the real open.
 */
export function ensureEngineWarm(): void {
    // If already warming/warmed, this is a no-op (same cached promise).
    void warmEngineModule()
        .then(() => {
            console.log('[engineWarmup] O.14 — BIM engine module pre-warmed during onboarding; generate→loader wait will be short.');
        })
        .catch((err) => {
            // Swallow: the cold loadEngine() path remains the fallback.
            console.warn(
                '[engineWarmup] O.14 — engine pre-warm failed (non-fatal; cold boot fallback intact):',
                err instanceof Error ? err.message : err,
            );
        });
}
