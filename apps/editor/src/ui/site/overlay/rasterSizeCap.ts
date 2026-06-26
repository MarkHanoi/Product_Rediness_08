// §SITE-PLAN-OVERLAY (raster size cap) — pure helper that decides a SAFE output size
// for a raster destined for the GPU / a 2D canvas, given the source dimensions and the
// device's max texture dimension. HEADLESS (no DOM, no THREE) so it is unit-testable.
//
// WHY THIS EXISTS — the link-then-crash root cause
// ------------------------------------------------
// The legacy floor-plan importer rasterises a PDF/image capped at 1500px WIDE
// (PDFToImageConverter MAX_WIDTH_PX) but leaves the HEIGHT UNCAPPED. A tall plan (a long
// PDF, a portrait survey) therefore rasterises to e.g. 1500 × 50000 px, and
// FloorPlanUnderlayTool.loadTexture() uploads it straight to a THREE texture with NO
// device-limit clamp. On the WebGPU backend that exceeds `maxTextureDimension2D` (8192 on
// most hardware) → the GPU device is LOST on the next render → the app crashes a beat
// after the underlay "links" (exactly the founder's report).
//
// This helper is the single chokepoint both the legacy texture loader and the new site
// overlay use to guarantee NEITHER dimension exceeds a safe cap, downscaling uniformly
// (aspect-preserving) when needed. The new MapLibre `image`-source overlay does not touch
// the GPU device at all, but capping the rasterised source still bounds memory + decode
// cost, so it shares the same guard.

/**
 * The conservative default max dimension. WebGPU guarantees `maxTextureDimension2D ≥ 8192`
 * but we target a safe headroom below that AND well under WebGL's common 4096 floor, so a
 * capped raster is uploadable on every backend without a device-limit query. The real
 * device cap (when known) is passed in and the MIN of the two is used.
 */
export const SAFE_MAX_TEXTURE_DIM = 4096;

export interface SizeCapInput {
    readonly srcWidth: number;
    readonly srcHeight: number;
    /** The device's reported max texture dimension, if known (e.g. WebGPU
     *  `device.limits.maxTextureDimension2D` or WebGL `MAX_TEXTURE_SIZE`). */
    readonly deviceMaxDim?: number;
    /** Hard ceiling regardless of device (defaults to SAFE_MAX_TEXTURE_DIM). */
    readonly hardCap?: number;
}

export interface SizeCapResult {
    /** Capped output width in pixels (≥ 1). */
    readonly width: number;
    /** Capped output height in pixels (≥ 1). */
    readonly height: number;
    /** Uniform downscale factor applied (1 = no downscale, < 1 = shrunk). */
    readonly scale: number;
    /** True when a downscale was needed (source exceeded the effective cap). */
    readonly capped: boolean;
}

/**
 * Compute a safe, aspect-preserving output size for a raster.
 *
 * The effective cap is `min(hardCap ?? SAFE_MAX_TEXTURE_DIM, deviceMaxDim ?? ∞)`. If the
 * larger source dimension exceeds the cap, both dimensions are scaled down by the SAME
 * factor so neither exceeds the cap and the aspect ratio is preserved. Degenerate /
 * non-finite inputs collapse to a 1×1 result rather than throwing.
 */
export function computeCappedSize(input: SizeCapInput): SizeCapResult {
    const srcW = sanitiseDim(input.srcWidth);
    const srcH = sanitiseDim(input.srcHeight);
    const hardCap = Number.isFinite(input.hardCap) && (input.hardCap ?? 0) > 0
        ? (input.hardCap as number)
        : SAFE_MAX_TEXTURE_DIM;
    const deviceCap = Number.isFinite(input.deviceMaxDim) && (input.deviceMaxDim ?? 0) > 0
        ? (input.deviceMaxDim as number)
        : Number.POSITIVE_INFINITY;
    const cap = Math.max(1, Math.min(hardCap, deviceCap));

    const longest = Math.max(srcW, srcH);
    if (longest <= cap) {
        return { width: srcW, height: srcH, scale: 1, capped: false };
    }
    const scale = cap / longest;
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    return { width, height, scale, capped: true };
}

/** Whether a source raster would need downscaling to fit the effective cap. */
export function exceedsSafeSize(input: SizeCapInput): boolean {
    return computeCappedSize(input).capped;
}

function sanitiseDim(v: number): number {
    if (!Number.isFinite(v) || v <= 0) return 1;
    return Math.max(1, Math.floor(v));
}
