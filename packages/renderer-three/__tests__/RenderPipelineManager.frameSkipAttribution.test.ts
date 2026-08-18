// §L900-FRAME-SKIP-ATTRIBUTION (founder L-900) — the INSTRUMENT, not the fix.
//
// L-900: "the user moves a wall in 3d — in plan view renders correctly, but the 3d
// environment did not catch up." The plan proxies the LIVE scene meshes, so the plan being
// correct proves the scene graph is already right and only the PRESENTED FRAME is old.
// Two leads were refuted by reading code (ViewDependencyTracker; then the SVP mirror, which
// is a 30 fps drawImage blit that can never be fresher than the main canvas). The remaining
// candidates all end at the same place: one of `render()`'s early returns is being taken —
// and until now they were indistinguishable from each other AND from a healthy idle
// scheduler.
//
// ⚠ WHY THIS MATTERS MORE THAN IT LOOKS. `RenderPipelineManager.render()`'s FrameCoordinator
// gate used to carry the comment "The OBC base render (driven by the other rAF loop) still
// runs normally so the display never goes blank." That is FALSE:
// `UnifiedFrameLoop.setObcRenderCallback()` has NO CALLER anywhere in apps/, packages/ or
// plugins/, so `_obcCallback` is permanently null and the block it gates is dead. There is
// no second loop painting underneath. Every early return is a TOTAL VIEWPORT FREEZE.
//
// These tests pin the instrument's CONTRACT, not any repair:
//   (1) each gate attributes its own declined frames, by name;
//   (2) `consecutiveSkips` — the load-bearing number — distinguishes a transient skip
//       (normal) from a stuck latch (the defect);
//   (3) a presented frame resets the run, so a recovered viewport reads as recovered;
//   (4) it changes NO control flow.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

type Priv = {
    _webGpuActive: boolean;
    _renderer: unknown;
    _scene: unknown;
    _camera: unknown;
    _suspended: boolean;
    _shadowRebuildPaused: boolean;
    _hasPipelineError: boolean;
    _renderPipeline: unknown;
    _lightweightWebGlActive: boolean;
    _isRenderTargetZeroSize(): boolean;
};

function priv(rpm: RenderPipelineManager): Priv {
    return rpm as unknown as Priv;
}

/** Arm a WebGPU-active manager that would reach the submit but for the gate under test. */
function armPastEarlyGates(rpm: RenderPipelineManager): void {
    const p = priv(rpm);
    p._webGpuActive   = true;
    p._renderPipeline = { render: vi.fn() };
    p._hasPipelineError = false;
    p._suspended = false;
    p._shadowRebuildPaused = false;
    // Non-zero viewport: the zero-size gate must not swallow the frame first.
    p._isRenderTargetZeroSize = () => false;
}

describe('RenderPipelineManager §L900-FRAME-SKIP-ATTRIBUTION', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('starts clean — nothing skipped, nothing presented', () => {
        const report = new RenderPipelineManager().getFrameSkipReport();
        expect(report.skips).toEqual({});
        expect(report.lastSkipReason).toBeNull();
        expect(report.consecutiveSkips).toBe(0);
    });

    it('attributes a declined frame to the SHADOW-REBUILD pause by name', () => {
        const rpm = new RenderPipelineManager();
        armPastEarlyGates(rpm);
        priv(rpm)._shadowRebuildPaused = true;

        rpm.render();

        const report = rpm.getFrameSkipReport();
        expect(report.lastSkipReason).toBe('shadowRebuildPaused');
        expect(report.skips.shadowRebuildPaused).toBe(1);
    });

    it('attributes the SUSPEND latch separately (initUI has no try/finally around it)', () => {
        const rpm = new RenderPipelineManager();
        armPastEarlyGates(rpm);
        priv(rpm)._suspended = true;

        rpm.render();

        expect(rpm.getFrameSkipReport().lastSkipReason).toBe('suspended');
    });

    it('distinguishes a DEAD pipeline from a pipeline that never built', () => {
        const a = new RenderPipelineManager();
        armPastEarlyGates(a);
        priv(a)._hasPipelineError = true;
        a.render();
        expect(a.getFrameSkipReport().lastSkipReason).toBe('pipelineError');

        const b = new RenderPipelineManager();
        armPastEarlyGates(b);
        priv(b)._renderPipeline = null;
        b.render();
        expect(b.getFrameSkipReport().lastSkipReason).toBe('noPipeline');
    });

    it('⭐ consecutiveSkips is the diagnostic — a STUCK latch is not a busy one', () => {
        const rpm = new RenderPipelineManager();
        armPastEarlyGates(rpm);
        priv(rpm)._shadowRebuildPaused = true;

        for (let i = 0; i < 5; i++) rpm.render();

        const report = rpm.getFrameSkipReport();
        expect(report.consecutiveSkips).toBe(5);
        expect(report.framesPresented).toBe(0);
        // This is the whole point: "3D is stale" becomes "gate X has held for N frames".
        expect(report.lastSkipReason).toBe('shadowRebuildPaused');
    });

    it('a presented frame RESETS the run, so recovery is visible too', () => {
        const rpm = new RenderPipelineManager();
        armPastEarlyGates(rpm);
        priv(rpm)._shadowRebuildPaused = true;
        rpm.render();
        rpm.render();
        expect(rpm.getFrameSkipReport().consecutiveSkips).toBe(2);

        // The latch releases (what `_endShadowRebuildGuard` does).
        priv(rpm)._shadowRebuildPaused = false;
        rpm.render();

        const report = rpm.getFrameSkipReport();
        expect(report.consecutiveSkips).toBe(0);
        expect(report.lastSkipReason).toBeNull();
        expect(report.framesPresented).toBe(1);
        // The historical total is retained — the stall happened and stays on the record.
        expect(report.skips.shadowRebuildPaused).toBe(2);
    });

    it('a switch of gate restarts the run rather than accumulating across causes', () => {
        const rpm = new RenderPipelineManager();
        armPastEarlyGates(rpm);

        priv(rpm)._shadowRebuildPaused = true;
        rpm.render();
        rpm.render();

        priv(rpm)._shadowRebuildPaused = false;
        priv(rpm)._suspended = true;
        rpm.render();

        const report = rpm.getFrameSkipReport();
        expect(report.consecutiveSkips).toBe(1);              // restarted, not 3
        expect(report.skips).toEqual({ shadowRebuildPaused: 2, suspended: 1 });
    });

    it('warns EXACTLY ONCE per stall, and re-arms after the viewport recovers', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rpm = new RenderPipelineManager();
        armPastEarlyGates(rpm);
        priv(rpm)._shadowRebuildPaused = true;

        for (let i = 0; i < 300; i++) rpm.render();
        const stallWarnings = warn.mock.calls.filter(
            (c) => String(c[0]).includes('§L900-FRAME-SKIP-ATTRIBUTION'),
        );
        expect(stallWarnings.length).toBe(1);   // never a per-frame flood

        priv(rpm)._shadowRebuildPaused = false;
        rpm.render();                            // recovered
        priv(rpm)._shadowRebuildPaused = true;
        for (let i = 0; i < 300; i++) rpm.render();

        const afterRecovery = warn.mock.calls.filter(
            (c) => String(c[0]).includes('§L900-FRAME-SKIP-ATTRIBUTION'),
        );
        expect(afterRecovery.length).toBe(2);   // a SECOND stall is a second report
        warn.mockRestore();
    });

    it('changes NO control flow — a healthy frame still submits exactly once', () => {
        const rpm = new RenderPipelineManager();
        armPastEarlyGates(rpm);
        const submit = vi.fn();
        priv(rpm)._renderPipeline = { render: submit };

        rpm.render();

        expect(submit).toHaveBeenCalledTimes(1);
        expect(rpm.getFrameSkipReport().framesPresented).toBe(1);
        expect(rpm.getFrameSkipReport().skips).toEqual({});
    });
});
