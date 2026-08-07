// cesiumWarmup.ts — §STARTUP-CESIUM-CHUNK-WARM (founder 2026-08-07: 5× startup; L-433's
// recorded residual: "there is a RendererPrewarm for THREE … but no Cesium equivalent").
//
// THE PROBLEM
// -----------
// The Cesium viewport module (`CesiumViewport.ts` + the `cesium` package it statically imports)
// is a DYNAMIC import behind `GISAreaLayout`'s cesium mounter — a multi-MB chunk that is
// downloaded + parsed ONLY when the onboarding `location` step mounts the globe. Structurally
// that puts the chunk's download+parse on the globe's first-paint critical path: the user clicks
// "New Project" and watches a blank hero while the chunk streams.
//
// THE FIX (identical shape to `engineWarmup.ts`'s O.14 — start earlier, skip nothing)
// -----------------------------------------------------------------------------------
// `ensureCesiumWarm()` kicks off the SAME dynamic import (same module specifier ⇒ same Vite
// chunk ⇒ the mounter's later `import()` resolves from the module cache) the moment onboarding
// opens. Module EVALUATION only registers exports and module-level constants — it does not
// construct a viewer, touch a canvas, or start any network stream; the viewer itself still
// mounts exactly where it always did.
//
// SAFETY: idempotent (one cached in-flight promise), best-effort (a failed warm clears the
// cache so the mounter's own import retries cold — behaviour without this module), and it never
// throws into the caller.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.startup.cesium-warmup');

type CesiumViewportModule = typeof import('../ui/geospatial/CesiumViewport');

let _warmPromise: Promise<CesiumViewportModule> | null = null;

/** Resolve (and cache) the Cesium viewport module promise. P8: carries a span. */
export function warmCesiumModule(): Promise<CesiumViewportModule> {
    const span = _tracer.startSpan('pryzm.startup.cesium-warmup.warmModule');
    try {
        if (_warmPromise === null) {
            _warmPromise = import('../ui/geospatial/CesiumViewport').catch((err) => {
                _warmPromise = null; // next call (typically the real mount) retries cold
                throw err;
            });
        }
        return _warmPromise;
    } finally {
        span.end();
    }
}

/**
 * §STARTUP-CESIUM-CHUNK-WARM — fire-and-forget Cesium chunk warm. Call when onboarding starts
 * so the chunk downloads + evaluates while the user reads/types, instead of when the globe
 * first paints. Never throws; a warm failure leaves the cold path intact. P8: carries a span.
 */
export function ensureCesiumWarm(): void {
    const span = _tracer.startSpan('pryzm.startup.cesium-warmup.ensureWarm');
    span.end();
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    void warmCesiumModule()
        .then(() => {
            const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
            console.log(
                `[cesiumWarmup] §STARTUP-CESIUM-CHUNK-WARM — Cesium viewport chunk pre-warmed in ` +
                    `${dt.toFixed(0)} ms during onboarding; the globe's first paint no longer pays it.`,
            );
        })
        .catch((err) => {
            console.warn(
                '[cesiumWarmup] §STARTUP-CESIUM-CHUNK-WARM — pre-warm failed (non-fatal; the cold ' +
                    'mounter import remains the fallback):',
                err instanceof Error ? err.message : err,
            );
        });
}
