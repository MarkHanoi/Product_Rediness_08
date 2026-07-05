/**
 * @file src/core/rendering/SharedRenderingState.ts
 * @description Single source of truth for the active HDRI preset and enhancement
 *   level. All rendering panels (VisualizationEnginePanel, ViewportRenderModePanel,
 *   RenderPanel, PanoramaPanel) read from and write to this singleton.
 *
 * CONTRACT (PHOTOREALISTIC-CONSOLIDATION-PLAN.md Phase 1):
 *   - This module is a plain TypeScript object + CustomEvent — zero new dependencies.
 *   - The VisualizationEnginePanel is the ONLY writer of HDRI state.
 *   - Export panels (RenderPanel, PanoramaPanel, ViewportRenderModePanel) are
 *     read-only consumers — they inherit the active HDRI from here.
 *   - Mutation helpers fire 'pryzm-rendering-state-changed' so any subscriber
 *     can react without polling.
 *
 * What does NOT change (per §5 of the consolidation plan):
 *   - PhotorealisticRenderer, ViewportPathTracer, PanoramaCapture — untouched.
 *   - All BIM stores, commands, builders — completely unaffected.
 */

export interface ISharedRenderingState {
    hdriPresetId:     string;
    enhancementLevel: 'off' | 'standard' | 'high' | 'ultra';
    realSunEnabled:   boolean;
    realSunHour:      number;
    // §FEAT-REAL-ENVIRONMENT (ADR-0106) — persisted View Properties environment
    // state so the panel survives a rebuild (it is reconstructed per selection).
    sunMode:          'real+offset' | 'manual';
    groundShadows:    boolean;
    // 8C — post-processing panel state (take effect + persist within the session).
    aoEnabled:        boolean;
    bloomEnabled:     boolean;
    exposure:         number;
}

export const sharedRenderingState: ISharedRenderingState = {
    hdriPresetId:     'studio-neutral',
    enhancementLevel: 'off',
    realSunEnabled:   false,
    realSunHour:      12,
    sunMode:          'real+offset',
    groundShadows:    true,
    aoEnabled:        false,
    bloomEnabled:     false,
    exposure:         1.0,
};

/** §FEAT-REAL-ENVIRONMENT (ADR-0106) — persist the View Properties post-processing
 *  + environment toggles so the panel restores them when it is next rebuilt. */
export function setSharedPostProcessing(next: Partial<Pick<ISharedRenderingState,
    'aoEnabled' | 'bloomEnabled' | 'exposure' | 'sunMode' | 'groundShadows'>>): void {
    if (next.aoEnabled     !== undefined) sharedRenderingState.aoEnabled     = next.aoEnabled;
    if (next.bloomEnabled  !== undefined) sharedRenderingState.bloomEnabled  = next.bloomEnabled;
    if (next.exposure      !== undefined) sharedRenderingState.exposure      = next.exposure;
    if (next.sunMode       !== undefined) sharedRenderingState.sunMode       = next.sunMode;
    if (next.groundShadows !== undefined) sharedRenderingState.groundShadows = next.groundShadows;
    window.dispatchEvent(new CustomEvent('pryzm-rendering-state-changed', {
        detail: { ...next },
    }));
}

export function setSharedHdri(hdriPresetId: string): void {
    sharedRenderingState.hdriPresetId = hdriPresetId;
    window.dispatchEvent(new CustomEvent('pryzm-rendering-state-changed', { // TODO(TASK-15)
        detail: { hdriPresetId },
    }));
}

export function setSharedEnhancementLevel(level: ISharedRenderingState['enhancementLevel']): void {
    sharedRenderingState.enhancementLevel = level;
    window.dispatchEvent(new CustomEvent('pryzm-rendering-state-changed', { // TODO(TASK-15)
        detail: { enhancementLevel: level },
    }));
}

export function setSharedRealSun(enabled: boolean, hour?: number): void {
    sharedRenderingState.realSunEnabled = enabled;
    if (hour !== undefined) sharedRenderingState.realSunHour = hour;
    window.dispatchEvent(new CustomEvent('pryzm-rendering-state-changed', { // TODO(TASK-15)
        detail: { realSunEnabled: enabled, realSunHour: sharedRenderingState.realSunHour },
    }));
}
