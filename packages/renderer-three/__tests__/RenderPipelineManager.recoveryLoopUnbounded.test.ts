// §L-663-RECOVERY-LOOP — CHARACTERISATION TEST (pins TODAY'S DEFECTIVE behaviour).
//
// ⚠ READ THIS BEFORE "FIXING" A FAILURE HERE. These assertions do NOT describe
// desired behaviour. They pin the *current* shape of the viewport crash-recovery
// path so that the L-663 fix has to consciously replace it rather than drift past
// it. When loop protection lands, these expectations MUST be rewritten (not
// deleted) to assert the bounded behaviour.
//
// PROD EVIDENCE (founder, 2026-08-01, https://pryzm.fly.dev, WebGPU backend, 48
// meshes): editing a kitchen furniture element's arm dimensions froze the editor.
// The console shows this cycle repeating, with NO project switch anywhere in the
// session:
//
//   [RenderPipelineManager] onProjectSwitch — clearing outline refs, resetting retry counter
//   [RenderPipelineManager] SHADOW_REBUILD_SCHEDULED meshCount=48
//   [ViewportCrashGuard]    Soft recovery initiated via RPM.onProjectSwitch().
//   [RenderPipelineManager] Rebuilding pipeline after shadow-map update.
//   [RenderPipelineManager] SHADOW_REBUILD_COMPLETE elapsed=0.9ms
//   … repeats …
//
// THE DEFECT THIS FILE PINS — the recovery path resets every counter that is
// supposed to BOUND it, and adds no counter of its own:
//
//   1. `onProjectSwitch()` sets `_retryCount = 0`. That is the very counter whose
//      exhaustion (`_retryCount >= MAX_RETRIES`) is what promotes the pipeline to
//      `phase='error'` → `ViewportCrashGuard.handlePipelineError()`. Recovery
//      therefore hands the failing pipeline a FRESH full retry ladder.
//   2. `ViewportCrashGuard`'s retry handler clears `_hasCrashed` and
//      `_consecutiveFailures`.
//   3. NOTHING counts how many times recovery has already been attempted, so the
//      crash → recover → same-error → crash cycle has no escalation ceiling and
//      never falls through to the hard reload. Each turn of the cycle costs a full
//      pipeline dispose + recompose (`scheduleShadowRebuild`), which is what the
//      founder experiences as a freeze.
//
// See docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md L-663 and C04 §RECOVERY.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** Minimal WebGPU-shaped renderer stub — enough for _reconcileRenderSize + the shadow cycle. */
function fakeWebGpuRenderer(): any {
  const setSizeCalls: Array<{ w: number; h: number }> = [];
  return {
    isWebGPURenderer: true,
    backend: { isWebGPUBackend: true },
    // Live canvas is the founder's 726×981 viewport; the renderer's backing store still
    // reports the pre-fault size, so _reconcileRenderSize() has real work to do on every
    // recovery turn (that is the observable "one full reconstruction per recovery").
    domElement: { clientWidth: 726, clientHeight: 981 },
    getSize: (t: any) => { if (t?.set) { t.set(733, 987); return t; } return { x: 733, y: 987 }; },
    setSize: (w: number, h: number) => { setSizeCalls.push({ w, h }); },
    __setSizeCalls: setSizeCalls,
  };
}

describe('RenderPipelineManager — crash-recovery is UNBOUNDED (§L-663-RECOVERY-LOOP, characterisation)', () => {
  // Hold the 100 ms shadow-rebuild debounce so no async GPU body ever runs.
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('DEFECT: the recovery primitive resets the retry counter that is meant to bound it', () => {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer     = fakeWebGpuRenderer();

    // Pipeline has already burned its whole retry ladder (MAX_RETRIES = 3) — this is
    // exactly the state that produced phase='error' → handlePipelineError() → the
    // crash overlay whose "Reload viewport" button calls onProjectSwitch().
    rpm._retryCount = 3;

    rpm.onProjectSwitch();

    // Recovery hands the STILL-FAILING pipeline a fresh full ladder. Nothing about the
    // underlying render fault changed; only the bound on retrying it was erased.
    expect(rpm.status.retryCount).toBe(0);
  });

  it('DEFECT: no recovery-attempt counter exists, so crash→recover→crash never escalates', () => {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer     = fakeWebGpuRenderer();

    // There is no field anywhere on the manager that counts soft recoveries. The only
    // counters are _retryCount (reset BY recovery) and the crash guard's
    // _consecutiveFailures (also reset by recovery), so the cycle is unbounded.
    const recoveryCounters = Object.keys(rpm).filter(k => /recover/i.test(k));
    expect(recoveryCounters).toEqual([]);
  });

  it('DEFECT: N successive recoveries each re-arm a FULL pipeline rebuild, with no ceiling', () => {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer     = fakeWebGpuRenderer();

    const RECOVERY_TURNS = 10;
    for (let i = 0; i < RECOVERY_TURNS; i++) {
      // Simulate the render fault re-firing and exhausting the ladder again…
      rpm._retryCount = 3;
      // …then the crash guard's "soft recovery".
      rpm.onProjectSwitch();

      // Every single turn arms another guarded shadow/pipeline rebuild (dispose +
      // recompose of the whole render graph) and wipes the bound again. Turn 10 is
      // indistinguishable from turn 1 — there is no escalation to a hard reload.
      expect(rpm._shadowRebuildTimer).not.toBeNull();
      expect(rpm.status.retryCount).toBe(0);

      // Drop the armed debounce so the next turn re-arms cleanly (the real loop is
      // driven by the next frame's throw, not by this timer firing).
      clearTimeout(rpm._shadowRebuildTimer);
      rpm._shadowRebuildTimer = null;
    }

    // The renderer was re-sized once per recovery turn — one full reconstruction each.
    expect(rpm._renderer.__setSizeCalls).toHaveLength(RECOVERY_TURNS);
  });

  it('DEFECT: onProjectSwitch is reused as the error-recovery primitive (lifecycle/recovery coupling)', () => {
    // The ONLY soft-recovery entry point the crash guard has is a method named and
    // shaped for a PROJECT-LIFECYCLE event (C13). It clears the outgoing project's
    // outline refs, reconciles size, and schedules a shadow rebuild — none of which
    // is scoped to "the render fault that just occurred". A render fault during a
    // furniture property edit therefore executes a project-switch reconstruction.
    const rpm = new RenderPipelineManager() as any;
    expect(typeof rpm.onProjectSwitch).toBe('function');
    // No dedicated recovery entry point exists to route the crash guard to instead.
    expect((rpm as Record<string, unknown>).recoverFromRenderFault).toBeUndefined();
  });
});
