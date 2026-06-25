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
        it('maps normal scenes to balanced (today behaviour band)', () => {
            expect(nominalTierForMeshCount(1_501)).toBe('balanced');
            expect(nominalTierForMeshCount(6_000)).toBe('balanced');
        });
        it('maps heavy scenes to performance', () => {
            expect(nominalTierForMeshCount(6_001)).toBe('performance');
            expect(nominalTierForMeshCount(15_000)).toBe('performance');
            // The audited ~13,048-mesh scene lands in performance.
            expect(nominalTierForMeshCount(13_048)).toBe('performance');
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
        it('performance drops SSGI, decorative shadows and full PBR', () => {
            const s = settingsForTier('performance');
            expect(s.ssgi).toBe(false);
            expect(s.traa).toBe(true);
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
            expect(computeTier(3_000, undefined)).toBe('balanced');
        });

        it('holds the previous tier inside the ±10% guard band on a step DOWN', () => {
            // balanced upper bound = 6000; +10% band = 6600. At 6300 (just over the
            // nominal boundary but within the band) we must HOLD balanced.
            expect(computeTier(6_300, 'balanced')).toBe('balanced');
            // Clearly over the band → step down to performance.
            expect(computeTier(6_700, 'balanced')).toBe('performance');
        });

        it('holds the previous tier inside the band on a step UP', () => {
            // Coming from performance, balanced floor boundary = 6000; −10% = 5400.
            // At 5700 (under nominal boundary but inside band) HOLD performance.
            expect(computeTier(5_700, 'performance')).toBe('performance');
            // Clearly under the band → step up to balanced.
            expect(computeTier(5_300, 'performance')).toBe('balanced');
        });

        it('does not oscillate when count wobbles across a boundary inside the band', () => {
            let tier: SceneQualityTier = 'balanced';
            for (const n of [6_100, 5_900, 6_200, 5_950, 6_050]) {
                tier = computeTier(n, tier);
                // All within ±10% of 6000 (5400..6600) → must stay balanced.
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
            const first = mgr.update(3_000);
            expect(first.tier).toBe('balanced');
            expect(first.changed).toBe(true); // cold start counts as a change

            const second = mgr.update(3_200);
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
