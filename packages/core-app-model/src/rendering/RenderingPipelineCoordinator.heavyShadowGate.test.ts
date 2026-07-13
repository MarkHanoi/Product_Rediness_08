/**
 * §PERF-HEAVY-SHADOW-OFF — the ≥8000-caster shadow ceiling must actually FIRE.
 *
 * Gate G3 (heavy-tower navigation perf), plan step 0.4a. Shipped in `dd9bd8df`.
 *
 * WHY THIS GUARD EXISTS
 * ---------------------
 * The ceiling was documented, implemented, and DEAD for months. Two mechanisms
 * killed it, and both are re-armable by a one-line edit:
 *
 *   1. The gate used to be nested inside `if (this._shadowUpgrader.applied)`.
 *      The upgrader is bound to the OBC WebGL renderer (silenced in Phase 5), so
 *      on the real WebGPU path it is never `applied` — the ceiling toggled a dead
 *      renderer while the live shadow pass ran every frame (13,652 meshes /
 *      12,737 shadow-flagged on the 40-storey office).
 *   2. The gate used to be nested behind `if (!changed) return` — but the 8000
 *      ceiling crosses WITHIN the `performance` tier (2500–15000), where
 *      `changed === false`. A scene growing 2,600 → 13,000 meshes never changes
 *      tier, so the shadow decision was never re-evaluated.
 *
 * The invariants below are asserted with COUNTS and BOOLEANS, never wall-clock —
 * a perf gate that reds when the CI box is busy is a gate everyone learns to
 * ignore (L-234 / L-247).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenderingPipelineCoordinator } from './RenderingPipelineCoordinator';
import { sceneQualityTierManager } from './SceneQualityTierManager';

/** The documented ceiling. Mirrors the private constant under test. */
const CEILING = 8000;

describe('RenderingPipelineCoordinator §PERF-HEAVY-SHADOW-OFF (Gate G3 / 0.4a)', () => {
    let coordinator: RenderingPipelineCoordinator;
    let calls: boolean[];

    beforeEach(() => {
        sceneQualityTierManager.reset();     // cold start — no held tier
        coordinator = new RenderingPipelineCoordinator();
        calls = [];
        coordinator.setTierSceneShadowHook((suppressed) => { calls.push(suppressed); });
    });

    it('suppresses the scene shadow pass at/above the 8000-caster ceiling', () => {
        coordinator.applyTierForMeshCount(13_652, true); // the founder's 40-storey office
        expect(calls.at(-1)).toBe(true);
    });

    it('keeps shadows ON below the ceiling on a small scene', () => {
        coordinator.applyTierForMeshCount(100, true);
        expect(calls.at(-1)).toBe(false);
    });

    it('fires exactly ON the boundary (>= is the contract, not >)', () => {
        coordinator.applyTierForMeshCount(CEILING - 1, true);
        expect(calls.at(-1)).toBe(false);
        coordinator.applyTierForMeshCount(CEILING, true);
        expect(calls.at(-1)).toBe(true);
    });

    it('REGRESSION: the ceiling crosses WITHIN one tier, where changed === false', () => {
        // Both counts sit inside `performance` (2500–15000) — so the tier never
        // changes and `changed` is false on the second call. The shadow gate must
        // still fire, or the ceiling is dead exactly where it matters.
        const first  = coordinator.applyTierForMeshCount(2_600, true);
        const second = coordinator.applyTierForMeshCount(13_000, true);

        expect(first.tier).toBe(second.tier);   // same tier …
        expect(second.changed).toBe(false);     // … and NOT a tier change
        expect(calls).toEqual([false, true]);   // … yet the gate re-evaluated
    });

    it('REGRESSION: the hook is NOT gated on the (dead) ShadowQualityUpgrader', () => {
        // No renderer/scene was ever attached, so `_shadowUpgrader.applied` is false —
        // this is precisely the live WebGPU configuration in which the old gate never
        // fired. The hook must still be driven.
        expect(coordinator.shadowUpgrader.applied).toBe(false);
        coordinator.applyTierForMeshCount(20_000, true);
        expect(calls.at(-1)).toBe(true);
    });

    it('fires on EVERY call (idempotent re-assert, never a one-shot latch)', () => {
        coordinator.applyTierForMeshCount(10_000, true);
        coordinator.applyTierForMeshCount(10_000, true);
        coordinator.applyTierForMeshCount(10_000, true);
        expect(calls).toEqual([true, true, true]);
    });

    it('restores shadows when the scene shrinks back below the ceiling', () => {
        coordinator.applyTierForMeshCount(12_000, true);
        coordinator.applyTierForMeshCount(500, true);
        expect(calls).toEqual([true, false]);
    });

    it('a throwing hook never escapes the geometry-add path', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        coordinator.setTierSceneShadowHook(() => { throw new Error('renderer disposed'); });
        expect(() => coordinator.applyTierForMeshCount(10_000, true)).not.toThrow();
        warn.mockRestore();
    });
});
