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
    applyBackendGate,
    SceneQualityTierManager,
    type SceneQualityTier,
} from './SceneQualityTierManager';

describe('SceneQualityTierManager (ADR-0076 §PERF-WEBGPU-FRAGMENT)', () => {
    describe('nominalTierForMeshCount — boundary mapping', () => {
        it('maps small scenes to cinematic (below the large-scene cap)', () => {
            expect(nominalTierForMeshCount(0)).toBe('cinematic');
            // §PERF-LARGE-SCENE-TIER-CAP — cinematic now only holds below the 1200-mesh
            // cap (the 1211-tower evidence). 1199 stays cinematic; 1500 is capped.
            expect(nominalTierForMeshCount(1_199)).toBe('cinematic');
        });
        it('§PERF-LARGE-SCENE-TIER-CAP — caps ≥1200 meshes at performance (1211-tower evidence)', () => {
            // A generated office tower logged `1211 meshes → tier=cinematic
            // (SSGI/TRAA/shadow=high)` and was terrible to interact with. The hard cap
            // forces any scene at/above 1200 meshes to `performance` (SSGI/TRAA OFF,
            // shadow=standard) regardless of the nominal cinematic/balanced band.
            expect(nominalTierForMeshCount(1_200)).toBe('performance'); // at the cap
            expect(nominalTierForMeshCount(1_211)).toBe('performance'); // the real evidence count
            expect(nominalTierForMeshCount(1_500)).toBe('performance'); // was cinematic pre-cap
            expect(nominalTierForMeshCount(2_500)).toBe('performance'); // was balanced pre-cap
        });
        it('maps a typical generated building (~4000 meshes) to performance', () => {
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
            // §PERF-LARGE-SCENE-TIER-CAP — 2000 meshes is now capped to performance
            // (was balanced pre-cap).
            expect(computeTier(2_000, undefined)).toBe('performance');
            expect(computeTier(4_062, undefined)).toBe('performance'); // founder's building
            expect(computeTier(500, undefined)).toBe('cinematic');     // small scene unchanged
        });

        it('holds the previous tier inside the ±10% guard band on a step DOWN (perf↔survival)', () => {
            // performance upper bound = 15000; +10% band = 16500. At 16000 (just over the
            // nominal boundary but within the band) we must HOLD performance.
            expect(computeTier(16_000, 'performance')).toBe('performance');
            // Clearly over the band → step down to survival.
            expect(computeTier(17_000, 'performance')).toBe('survival');
        });

        it('does not oscillate when count wobbles across the perf/survival boundary', () => {
            let tier: SceneQualityTier = 'performance';
            for (const n of [16_000, 14_000, 16_400, 14_500, 15_500]) {
                tier = computeTier(n, tier);
                // All within ±10% of 15000 (13500..16500) → must stay performance.
                expect(tier).toBe('performance');
            }
        });

        it('crosses cleanly when the count moves decisively past the band', () => {
            let tier = computeTier(20_000, 'performance'); // far over → survival
            expect(tier).toBe('survival');
            tier = computeTier(500, tier); // far under → cinematic
            expect(tier).toBe('cinematic');
        });
    });

    // §PERF-LARGE-SCENE-TIER-CAP (ADR-0094) — the 1200-mesh cap is DECISIVE (not
    // subject to the cinematic step-down band) and has its own release hysteresis.
    describe('computeTier — large-scene cap is decisive + has release hysteresis', () => {
        it('snaps a scene that GREW through cinematic up to 1211 meshes to performance', () => {
            // The bug: cinematic bound 1500 × 1.1 = 1650 > 1211, so the normal step-down
            // band would HOLD cinematic — the 1211-tower freeze. The cap must override.
            expect(computeTier(1_211, 'cinematic')).toBe('performance');
            expect(computeTier(1_200, 'cinematic')).toBe('performance');
        });

        it('keeps a small scene (1199) cinematic — cap does not touch normal scenes', () => {
            expect(computeTier(1_199, 'cinematic')).toBe('cinematic');
            expect(computeTier(800, 'cinematic')).toBe('cinematic');
        });

        it('holds performance until the count drops clearly below the cap band (release ≈1080)', () => {
            // Cap release = 1200 × 0.9 = 1080. Between 1080 and 1199 the cap is held.
            expect(computeTier(1_150, 'performance')).toBe('performance'); // in release band
            expect(computeTier(1_100, 'performance')).toBe('performance'); // still in band
            expect(computeTier(1_000, 'performance')).toBe('cinematic');   // clearly under → release
        });

        it('does not thrash cinematic↔performance around the 1200-mesh cap', () => {
            let tier: SceneQualityTier = 'cinematic';
            // 1250 engages the cap; wobbling 1090..1250 must NOT bounce back to cinematic.
            for (const n of [1_250, 1_120, 1_240, 1_090, 1_210]) {
                tier = computeTier(n, tier);
                expect(tier).toBe('performance');
            }
        });
    });

    describe('SceneQualityTierManager instance — change reporting + reset', () => {
        let mgr: SceneQualityTierManager;
        beforeEach(() => {
            mgr = new SceneQualityTierManager();
        });

        it('reports changed=true only on a real transition', () => {
            // §PERF-LARGE-SCENE-TIER-CAP — 2000/2100 meshes are capped to performance.
            const first = mgr.update(2_000);
            expect(first.tier).toBe('performance');
            expect(first.changed).toBe(true); // cold start counts as a change

            const second = mgr.update(2_100);
            expect(second.tier).toBe('performance');
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

    // ── §PERF-WEBGL2-NO-SSGI — backend gate (forced-WebGL2 must never run SSGI/TRAA) ──
    describe('applyBackendGate — non-WebGPU forces SSGI/TRAA off', () => {
        it('forces SSGI + TRAA off on a "balanced" tier when isWebGPU=false', () => {
            // balanced = the smoking-gun tier (2221 meshes → SSGI=on TRAA=on) that
            // froze the WebGL2 viewport. With the backend gate it must come back
            // lightweight: SSGI off, TRAA off, standard shadows, no decorative shadows.
            const gated = applyBackendGate(settingsForTier('balanced'), false);
            expect(gated.ssgi).toBe(false);
            expect(gated.traa).toBe(false);
            expect(gated.shadowLevel).toBe('standard');
            expect(gated.decorativeFurnitureShadows).toBe(false);
            expect(gated.reflectionProbes).toBe(false);
        });

        it('forces SSGI + TRAA off on a "cinematic" tier too (small scene on WebGL2)', () => {
            const gated = applyBackendGate(settingsForTier('cinematic'), false);
            expect(gated.ssgi).toBe(false);
            expect(gated.traa).toBe(false);
            expect(gated.reflectionProbes).toBe(false);
        });

        it('leaves real-WebGPU settings EXACTLY unchanged (isWebGPU=true)', () => {
            const base = settingsForTier('balanced');
            const gated = applyBackendGate(base, true);
            expect(gated).toEqual(base);
            expect(gated.ssgi).toBe(true);  // WebGPU keeps SSGI on at balanced
            expect(gated.traa).toBe(true);
        });

        it('treats unknown backend (undefined) as unchanged (cold-start safe)', () => {
            const base = settingsForTier('cinematic');
            expect(applyBackendGate(base, undefined)).toEqual(base);
        });

        it('does not preserve the fullScenePbrTraverse independence of the tier', () => {
            // PBR upgrade is orthogonal to the backend gate — it is driven by tier,
            // not backend, so the gate must NOT touch fullScenePbrTraverse.
            const gated = applyBackendGate(settingsForTier('cinematic'), false);
            expect(gated.fullScenePbrTraverse).toBe(true); // unchanged by the gate
        });
    });

    describe('SceneQualityTierManager.update(meshCount, isWebGPU) — backend-gated settings', () => {
        let mgr: SceneQualityTierManager;
        beforeEach(() => {
            mgr = new SceneQualityTierManager();
        });

        it('isWebGPU=false → SSGI=false + TRAA=false at an SSGI-enabled (cinematic) mesh count', () => {
            // 500 meshes is a small "cinematic" tier that WOULD enable SSGI/TRAA on WebGPU.
            // (§PERF-LARGE-SCENE-TIER-CAP: ≥1200-mesh scenes are now capped to performance,
            // where SSGI/TRAA are already off, so we use a small scene to exercise the gate.)
            const { tier, settings } = mgr.update(500, false);
            expect(tier).toBe('cinematic');           // tier itself is backend-agnostic
            expect(settings.ssgi).toBe(false);        // …but SSGI is gated off on WebGL2
            expect(settings.traa).toBe(false);
            expect(settings.shadowLevel).toBe('standard');
        });

        it('isWebGPU=true → unchanged (SSGI on at cinematic)', () => {
            const { tier, settings } = mgr.update(500, true);
            expect(tier).toBe('cinematic');
            expect(settings.ssgi).toBe(true);
            expect(settings.traa).toBe(true);
        });

        it('omitting isWebGPU preserves today\'s behaviour (SSGI on at cinematic)', () => {
            const { settings } = mgr.update(500);
            expect(settings.ssgi).toBe(true);
            expect(settings.traa).toBe(true);
        });

        it('held tier (hysteresis) is identical regardless of backend flag', () => {
            // The held mesh-count tier must not depend on the backend flag — only the
            // applied SETTINGS are gated — so hysteresis is consistent across backends.
            const a = new SceneQualityTierManager();
            const b = new SceneQualityTierManager();
            for (const n of [16_000, 14_000, 16_400]) {
                const ra = a.update(n, true);
                const rb = b.update(n, false);
                expect(ra.tier).toBe(rb.tier);
            }
        });
    });
});
