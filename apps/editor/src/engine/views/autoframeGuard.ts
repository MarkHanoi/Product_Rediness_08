/**
 * autoframeGuard — shared predicate that decides whether a deferred camera
 * auto-frame (zoom-to-all / §VIEW-AUTOFRAME / §3D-FRAME-ON-VIEW-SWITCH) should
 * be SUPPRESSED because the user is actively drawing.
 *
 * §AUTOFRAME-NO-HIJACK-WHILE-DRAWING (2026-06-23)
 * ───────────────────────────────────────────────
 * Several auto-frame paths fire on a short deferred timer (≈300–320 ms) so the
 * just-committed element mesh is present before scene bounds are read. The
 * unwanted side effect: when the user draws their FIRST element in plan view
 * (scene transitions 0 → 1 elements), that deferred frame lands AFTER the wall
 * mesh commits, so it "sees geometry" and zooms to it — yanking the user off
 * the view they were drawing on.
 *
 * Auto-framing as a side effect of the first element appearing WHILE a draw tool
 * is active is never wanted: drawing must not move the camera. Explicit user
 * zoom-to-fit and project-open framing are unaffected (those paths do not call
 * this guard).
 *
 * The predicate is intentionally pure (takes the tool manager, no globals) so it
 * is unit-testable. `shouldSuppressAutoFrameWhileDrawing` reads `window.toolManager`
 * — the same already-allowlisted typed global every plan-view tool overlay uses
 * (PlanViewToolOverlay / SvpPlanToolOverlay / PlanViewInteraction).
 */

/** Minimal structural view of the ToolManager surface this guard needs. */
export interface ToolActivityProbe {
    /** True while ANY drawing tool is active (ToolManager: activeTool !== 'none'). */
    isAnyToolActive?: () => boolean;
    /** Fallback: the active tool id, 'none' when nothing is active. */
    getActiveTool?: () => string;
}

/**
 * Pure predicate: is a drawing tool currently active?
 *
 * Returns `false` when the probe is absent or exposes neither method (fail-open:
 * if we cannot tell, do NOT suppress — preserves existing framing behaviour for
 * explicit zoom paths).
 */
export function isDrawToolActive(probe: ToolActivityProbe | null | undefined): boolean {
    if (!probe) return false;
    if (typeof probe.isAnyToolActive === 'function') return probe.isAnyToolActive();
    if (typeof probe.getActiveTool === 'function') {
        const t = probe.getActiveTool();
        return !!t && t !== 'none';
    }
    return false;
}

/**
 * Convenience wrapper used by the deferred auto-frame call sites. Reads the
 * editor's `window.toolManager` (typed inline — no `(window as any)`, P4-safe)
 * and returns true when the auto-frame should be suppressed.
 */
export function shouldSuppressAutoFrameWhileDrawing(): boolean {
    const tm = (globalThis as { toolManager?: ToolActivityProbe }).toolManager;
    return isDrawToolActive(tm);
}
