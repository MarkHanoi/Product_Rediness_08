/**
 * SceneQualityTierManager unit tests — ADR-0076 Axis 1 (§PERF-WEBGPU-FRAGMENT).
 *
 * Imports the module DIRECTLY (not via the rendering barrel, which pulls in
 * THREE/window-touching modules that throw under the node test env). The service
 * itself imports no THREE.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    computeTier,
    nominalTierForMeshCount,
    settingsForTier,
    SceneQualityTierManager,
    type SceneQualityTier,
} from './SceneQualityTierManager';

describe('SceneQualityTierManager (ADR-0076 §PERF-WEBGPU-FRAGMENT)', () => {
    describe('nominalTierForMeshCount — boundary mapping', () => {
        it('maps small scenes to cinematic', () => {
            expect(nominalTierForMeshCount(0)).toBe('cinematic');
            expect(nominalTierForMeshCount(1_500)).toBe('cinematic');
        });
        it('maps a narrow balanced band (1501–2500) — re-tuned 2026-06-25', () => {
            expect(nominalTierForMeshCount(1_501)).toBe('balanced');
            expect(nominalTierForMeshCount(2_500)).toBe('balanced');
        });
        it('maps a typical generated building (~4000 meshes) to performance', () => {
            // §PERF-WEBGPU-FRAGMENT re-tune: balanced ceiling 6000→2500 so the
            // founder's real ~4000-mesh building lands in performance (SSGI off).
            expect(nominalTierForMeshCount(2_501)).toBe('performance');
            expect(nominalTierForMeshCount(4_062)).toBe('performance'); // founder's real count
            expect(nominalTierForMeshCount(13_048)).toBe('performance');
            expect(nominalTierForMeshCount(15_000)).toBe('performance');
        });
        it('maps very large scenes to survival', () => {
            expect(nominalTierForMeshCount(15_001)).toBe('survival');
            expect(nominalTierForMeshCount(1_000_000)).toBe('survival');
        });
        it('clamps NaN / negative to 0 (cinematic)', () => {
            expect(nominalTierForMeshCount(Number.NaN)).toBe('cinematic');
            expect(nominalTierForMeshCount(-5)).toBe('cinematic');
        });
    });

    describe('settingsForTier — quality contract', () => {
        it('balanced keeps post-FX + furniture shadows on, but SKIPS the costly whole-scene PBR upgrade', () => {
            const s = settingsForTier('balanced');
            expect(s.ssgi).toBe(true);
            expect(s.traa).toBe(true);
            expect(s.decorativeFurnitureShadows).toBe(true);
            // §PERF-WEBGPU-FRAGMENT — the 38.7s post-batch PBR upgrade is skipped at
            // balanced+ (only cinematic ≤1500 meshes runs it).
            expect(s.fullScenePbrTraverse).toBe(false);
        });
        it('only cinematic runs the full PBR upgrade (the 38.7s pass)', () => {
            expect(settingsForTier('cinematic').fullScenePbrTraverse).toBe(true);
            expect(settingsForTier('balanced').fullScenePbrTraverse).toBe(false);
            expect(settingsForTier('performance').fullScenePbrTraverse).toBe(false);
            expect(settingsForTier('survival').fullScenePbrTraverse).toBe(false);
        });
        it('cinematic adds reflection probes', () => {
            expect(settingsForTier('cinematic').reflectionProbes).toBe(true);
            expect(settingsForTier('balanced').reflectionProbes).toBe(false);
        });
        it('performance drops SSGI, TRAA, decorative shadows and full PBR', () => {
            const s = settingsForTier('performance');
            expect(s.ssgi).toBe(false);
            // §PERF-WEBGPU-FRAGMENT re-tune — TRAA also OFF at performance.
            expect(s.traa).toBe(false);
            expect(s.decorativeFurnitureShadows).toBe(false);
            expect(s.fullScenePbrTraverse).toBe(false);
            expect(s.shadowLevel).toBe('standard');
        });
        it('survival drops all post-FX', () => {
            const s = settingsForTier('survival');
            expect(s.ssgi).toBe(false);
            expect(s.traa).toBe(false);
            expect(s.reflectionProbes).toBe(false);
        });
    });

    describe('computeTier — hysteresis (no thrash at boundaries)', () => {
        it('cold start (no prevTier) returns the nominal tier', () => {
            expect(computeTier(7_000, undefined)).toBe('performance');
            expect(computeTier(2_000, undefined)).toBe('balanced'); // 1501–2500
            expect(computeTier(4_062, undefined)).toBe('performance'); // founder's building
        });

        it('holds the previous tier inside the ±10% guard band on a step DOWN', () => {
            // balanced upper bound = 2500; +10% band = 2750. At 2600 (just over the
            // nominal boundary but within the band) we must HOLD balanced.
            expect(computeTier(2_600, 'balanced')).toBe('balanced');
            // Clearly over the band → step down to performance.
            expect(computeTier(2_800, 'balanced')).toBe('performance');
        });

        it('holds the previous tier inside the band on a step UP', () => {
            // Coming from performance, balanced/performance boundary = 2500; −10% = 2250.
            // At 2400 (under nominal boundary but inside band) HOLD performance.
            expect(computeTier(2_400, 'performance')).toBe('performance');
            // Clearly under the band → step up to balanced.
            expect(computeTier(2_200, 'performance')).toBe('balanced');
        });

        it('does not oscillate when count wobbles across a boundary inside the band', () => {
            let tier: SceneQualityTier = 'balanced';
            for (const n of [2_600, 2_400, 2_700, 2_450, 2_550]) {
                tier = computeTier(n, tier);
                // All within ±10% of 2500 (2250..2750) → must stay balanced.
                expect(tier).toBe('balanced');
            }
        });

        it('crosses cleanly when the count moves decisively past the band', () => {
            let tier = computeTier(20_000, 'balanced'); // far over → survival
            expect(tier).toBe('survival');
            tier = computeTier(500, tier); // far under → cinematic
            expect(tier).toBe('cinematic');
        });
    });

    describe('SceneQualityTierManager instance — change reporting + reset', () => {
        let mgr: SceneQualityTierManager;
        beforeEach(() => {
            mgr = new SceneQualityTierManager();
        });

        it('reports changed=true only on a real transition', () => {
            const first = mgr.update(2_000);
            expect(first.tier).toBe('balanced');
            expect(first.changed).toBe(true); // cold start counts as a change

            const second = mgr.update(2_100);
            expect(second.tier).toBe('balanced');
            expect(second.changed).toBe(false); // same tier → no re-apply

            const third = mgr.update(20_000);
            expect(third.tier).toBe('survival');
            expect(third.changed).toBe(true);
        });

        it('returns settings alongside the tier', () => {
            const { settings } = mgr.update(13_048);
            expect(settings.ssgi).toBe(false); // performance tier
            expect(settings.decorativeFurnitureShadows).toBe(false);
        });

        it('reset() forces the next update to be a cold start', () => {
            mgr.update(3_000);
            mgr.reset();
            expect(mgr.currentTier).toBeUndefined();
            const after = mgr.update(3_000);
            expect(after.changed).toBe(true);
        });
    });
});
