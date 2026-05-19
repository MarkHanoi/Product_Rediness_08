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
}

export const sharedRenderingState: ISharedRenderingState = {
    hdriPresetId:     'studio-neutral',
    enhancementLevel: 'off',
    realSunEnabled:   false,
    realSunHour:      12,
};

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
