/**
 * NightModeBackgroundResolver — §NIGHT-BG-WEBGL-FALLBACK (2026-06-26)
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder/inspect layer (pure decision derivation — no store,
 *                    registry, or semantic-graph mutation; the CALLER owns the
 *                    actual scene.background / clear-color / uniform write).
 * Architectural Classification: A (view-only)
 *
 * Impact Assessment: Semantic No · Constraint No · Graph No · Topology No ·
 *                    Store-Registry No · Undo No.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The bottom-menu Day/Night toggle drove the viewport background through ONLY
 * the WebGPU TSL `BackgroundUniform` (RenderPipelineManager.setTheme). That
 * worked on the native-WebGPU backend, where the final-output node mixes
 * `bgUniform` with scene content. But on the WebGL2 backend (the §PERF default
 * / fallback, and what most prod sessions actually run) the pipeline never
 * builds a BackgroundUniform — `rpm._backgroundUniform` is null, so
 * `setTheme('dark')` is a SILENT no-op. The toggle's old `if (rpm) { … } else
 * { scene.background … }` branch always took the `if (rpm)` arm (the manager
 * object exists regardless of backend), so the WebGL `scene.background`
 * fallback was unreachable. Net effect the founder reported: switching to
 * NIGHT left the 3D viewport WHITE instead of going to a dark night sky.
 *
 * FIX: this resolver returns the night/day background DECISION plus the path
 * that can actually paint it for the live backend:
 *   - 'webgpu-uniform' when the TSL BackgroundUniform is live (native WebGPU)
 *   - 'webgl-clear'     otherwise — the caller writes scene.background AND the
 *                       renderer clear-color so the canvas is painted directly.
 * The caller (BottomActionMenu) owns the actual writes (P7 — no view-state is
 * baked here).
 *
 * Night colour: deep desaturated navy `#0a0f2c`, matching DARK_BG_HEX in
 * renderer-three/BackgroundUniform and SCENE_BG_DARK_HEX in core-app-model —
 * reads as night against the white/purple PRYZM brand without clashing.
 * Day colour: the user's stored scene background (defaults to white #ffffff).
 */

import { SCENE_BG_DARK_HEX, SceneTheme } from '@pryzm/core-app-model';
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm-engine');

/** Which render path can actually paint the resolved background for this backend. */
export type NightBgApplyPath = 'webgpu-uniform' | 'webgl-clear';

/** A pure decision describing how to paint the viewport background for day/night. */
export interface NightBgDecision {
    /** True when night mode is requested. */
    night: boolean;
    /** Resolved CSS hex background colour to apply (e.g. '#0a0f2c' or '#ffffff'). */
    hex: string;
    /**
     * The path the caller should use to paint it:
     *   'webgpu-uniform' — drive RenderPipelineManager.setTheme/.setColor (TSL).
     *   'webgl-clear'    — write scene.background + renderer clear-color directly.
     */
    applyPath: NightBgApplyPath;
}

/**
 * Resolve the day/night viewport background decision for the live renderer.
 *
 * Pure derivation — performs no scene mutation. The caller applies the result
 * via the indicated path.
 *
 * @param night            true ⇒ night mode (dark navy); false ⇒ day (stored/white).
 * @param webGpuUniformLive true when the TSL BackgroundUniform is live (native
 *                          WebGPU pipeline). When false the WebGPU `setTheme`
 *                          call is a no-op, so the caller must paint the WebGL
 *                          clear path instead.
 * @returns the colour + the path that can actually paint it.
 */
export function resolveNightBackground(
    night: boolean,
    webGpuUniformLive: boolean,
): NightBgDecision {
    return _tracer.startActiveSpan('pryzm.inspect.resolveNightBackground', (span) => {
        try {
            // Day colour respects the user's stored scene background (custom
            // picker value or the #ffffff default). Night is the brand navy.
            const dayHex = SceneTheme.getStoredColor();
            const hex = night ? SCENE_BG_DARK_HEX : dayHex;
            const applyPath: NightBgApplyPath = webGpuUniformLive
                ? 'webgpu-uniform'
                : 'webgl-clear';

            span.setAttribute('pryzm.night_bg.night', night);
            span.setAttribute('pryzm.night_bg.hex', hex);
            span.setAttribute('pryzm.night_bg.apply_path', applyPath);
            span.end();
            return { night, hex, applyPath };
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            // Fail safe — never blank the viewport; fall back to a sensible
            // colour on the WebGL clear path the caller can always paint.
            const fallback: NightBgDecision = {
                night,
                hex: night ? SCENE_BG_DARK_HEX : '#ffffff',
                applyPath: 'webgl-clear',
            };
            return fallback;
        }
    });
}
