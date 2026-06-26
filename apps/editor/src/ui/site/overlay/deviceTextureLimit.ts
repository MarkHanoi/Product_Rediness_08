// §SITE-PLAN-OVERLAY (device limit) — best-effort read of the GPU's max texture
// dimension, used to cap rasters BEFORE they reach the GPU (the link-then-crash fix).
//
// We probe a throwaway WebGL context's MAX_TEXTURE_SIZE — a cheap, synchronous, P2-safe
// read (no `import * as THREE`; a raw WebGL context, not the renderer). WebGPU does not
// expose a limit without an async adapter request, so we treat the WebGL floor as a
// conservative lower bound that is also safe for WebGPU (whose guaranteed minimum,
// 8192, is ≥ any WebGL MAX_TEXTURE_SIZE). The result is cached.
//
// Returns 0 when no GL context is available (headless / blocked), letting callers fall
// back to the pure SAFE_MAX_TEXTURE_DIM cap.

let _cached: number | null = null;

/** Max 2D texture dimension the device reports, or 0 when unknown. Cached after first read. */
export function getMaxTextureDimension(): number {
    if (_cached !== null) return _cached;
    _cached = probe();
    return _cached;
}

function probe(): number {
    try {
        if (typeof document === 'undefined') return 0;
        const canvas = document.createElement('canvas');
        const gl =
            (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
            (canvas.getContext('webgl') as WebGLRenderingContext | null);
        if (!gl) return 0;
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        // Release the probe context promptly.
        const ext = gl.getExtension('WEBGL_lose_context');
        ext?.loseContext?.();
        return Number.isFinite(max) && max > 0 ? max : 0;
    } catch {
        return 0;
    }
}

/** Test seam — reset the cache (so unit tests can re-probe with a stub). */
export function __resetDeviceTextureLimitCacheForTest(): void {
    _cached = null;
}
