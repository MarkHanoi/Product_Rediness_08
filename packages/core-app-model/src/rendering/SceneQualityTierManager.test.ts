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
        // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — SSGI + TRAA now
        // default OFF at EVERY tier (even cinematic/balanced) on WebGPU. SSGINode's
        // per-frame denoise flickers all elements; the TRAA colour-filter rebuild
        // presents a ~1s black frame on tier-driven activation. Both are user-opt-in.
        it('cinematic + balanced default SSGI + TRAA OFF (user-opt-in) — L-59', () => {
            const c = settingsForTier('cinematic');
            expect(c.ssgi).toBe(false);
            expect(c.traa).toBe(false);
            const b = settingsForTier('balanced');
            expect(b.ssgi).toBe(false);
            expect(b.traa).toBe(false);
        });
        it('balanced keeps furniture shadows on, but SKIPS the costly whole-scene PBR upgrade', () => {
            const s = settingsForTier('balanced');
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
            // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH — SSGI/TRAA now default OFF at
            // balanced on WebGPU too; the gate must still leave the tier settings intact.
            expect(gated.ssgi).toBe(false);
            expect(gated.traa).toBe(false);
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

        it('isWebGPU=true → SSGI + TRAA OFF at cinematic (L-59 default, user-opt-in)', () => {
            const { tier, settings } = mgr.update(500, true);
            expect(tier).toBe('cinematic');
            // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH — even on real WebGPU the tier no
            // longer auto-enables SSGI/TRAA (they flicker / rebuild-to-black on select).
            expect(settings.ssgi).toBe(false);
            expect(settings.traa).toBe(false);
        });

        it('omitting isWebGPU keeps SSGI + TRAA OFF at cinematic (L-59 default)', () => {
            const { settings } = mgr.update(500);
            expect(settings.ssgi).toBe(false);
            expect(settings.traa).toBe(false);
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

// ─────────────────────────────────────────────────────────────────────────────
// §RENDER-QUALITY-USER-PIN (L-1512) — the explicit user tier override.
//
// THE FOUNDER'S REPORT: "Lately the quality WebGPU has decreased — probably to remove
// some performance error — however I would like to ad-hoc be able to have a sound
// rendering shadow quality." His scene is ~4,102 meshes, so §PERF-LARGE-SCENE-TIER-CAP
// (ADR-0094) pins him at `performance` — shadowLevel 'standard', decorative shadows off
// — and NOTHING he can do to the scene reaches 'high'. The cap is correct as an automatic
// default; the pin is the missing way to say "I accept the frame cost here".
//
// The two claims that carry risk, and therefore the two tests with teeth:
//   1. Unpinned, the manager is BYTE-IDENTICAL to the pre-pin algorithm. Asserted against
//      the pure functions the old `update()` composed — they are unchanged, so this is a
//      real equivalence proof, not a restatement.
//   2. The pin never claims a CAPABILITY. It runs BEFORE applyBackendGate, never instead
//      of it, so a `cinematic` pin on WebGL2 still comes back with SSGI/TRAA off.
// ─────────────────────────────────────────────────────────────────────────────
describe('§RENDER-QUALITY-USER-PIN (L-1512) — explicit tier override', () => {
    /** Mesh counts that cross every boundary the automatic policy has, in both directions. */
    const SWEEP: ReadonlyArray<readonly [number, boolean | undefined]> = [
        [0, true], [800, true], [1_199, true], [1_211, true], [4_102, true],
        [2_600, true], [1_000, true], [500, undefined], [16_000, false],
        [14_000, false], [16_400, true], [900, true], [4_102, true],
    ];

    it('unpinned: update() is byte-identical to the pre-pin pure composition', () => {
        const mgr = new SceneQualityTierManager();
        let prev: SceneQualityTier | undefined;
        for (const [n, gpu] of SWEEP) {
            // Exactly what the old `update()` body did.
            const expectedTier = computeTier(n, prev);
            const expectedChanged = expectedTier !== prev;
            const expectedSettings = applyBackendGate(settingsForTier(expectedTier), gpu);
            prev = expectedTier;

            const got = mgr.update(n, gpu);
            expect(got.tier).toBe(expectedTier);
            expect(got.changed).toBe(expectedChanged);
            expect(got.settings).toEqual(expectedSettings);
            expect(got.pinned).toBe(false);
            expect(got.automaticTier).toBe(expectedTier);
        }
    });

    it('a pin does not corrupt the hysteresis state — clearing it rejoins the automatic path', () => {
        const control = new SceneQualityTierManager();
        const pinned  = new SceneQualityTierManager();
        pinned.setTierOverride('cinematic');

        const controlTiers: SceneQualityTier[] = [];
        const pinnedAutoTiers: SceneQualityTier[] = [];
        for (const [n, gpu] of SWEEP) {
            controlTiers.push(control.update(n, gpu).tier);
            pinnedAutoTiers.push(pinned.update(n, gpu).automaticTier);
        }
        // The automatic tier underneath the pin tracked the control exactly.
        expect(pinnedAutoTiers).toEqual(controlTiers);

        // Clearing the pin returns the SAME tier the control is holding — the pin never
        // fed itself back into the hysteresis state machine.
        pinned.setTierOverride(null);
        const after = pinned.update(4_102, true);
        const controlAfter = control.update(4_102, true);
        expect(after.tier).toBe(controlAfter.tier);
        expect(after.pinned).toBe(false);
    });

    it('the founder\'s case: pinning beats the ADR-0094 cap on a 4,102-mesh building', () => {
        const mgr = new SceneQualityTierManager();

        const auto = mgr.update(4_102, true);
        expect(auto.tier).toBe('performance');          // the cap, as designed
        expect(auto.settings.shadowLevel).toBe('standard');
        expect(auto.settings.decorativeFurnitureShadows).toBe(false);

        mgr.setTierOverride('balanced');
        const pin = mgr.update(4_102, true);
        expect(pin.pinned).toBe(true);
        expect(pin.tier).toBe('balanced');
        expect(pin.automaticTier).toBe('performance');  // reported, so the UI can say so
        expect(pin.changed).toBe(true);                 // so the wiring layer re-applies
        expect(pin.settings.shadowLevel).toBe('high');  // the "sound shadow quality" asked for
        expect(pin.settings.decorativeFurnitureShadows).toBe(true);
        expect(pin.settings.shadows).toBe(true);
    });

    it('a pin is a PREFERENCE, never a CAPABILITY claim — WebGL2 still gates it', () => {
        const mgr = new SceneQualityTierManager();
        mgr.setTierOverride('cinematic');
        const { tier, settings } = mgr.update(4_102, false);
        expect(tier).toBe('cinematic');
        // applyBackendGate ran AFTER the pin, not instead of it.
        expect(settings.ssgi).toBe(false);
        expect(settings.traa).toBe(false);
        expect(settings.reflectionProbes).toBe(false);
        expect(settings.shadowLevel).toBe('standard');
        expect(settings.decorativeFurnitureShadows).toBe(false);
    });

    it('changed fires on pin/unpin, and not on a re-apply with the same pin', () => {
        const mgr = new SceneQualityTierManager();
        mgr.update(4_102, true);
        mgr.setTierOverride('cinematic');
        expect(mgr.update(4_102, true).changed).toBe(true);
        expect(mgr.update(4_102, true).changed).toBe(false);
        mgr.setTierOverride(null);
        expect(mgr.update(4_102, true).changed).toBe(true);
    });

    it('currentTier reports what is APPLIED; automaticTier reports what policy wanted', () => {
        const mgr = new SceneQualityTierManager();
        mgr.update(4_102, true);
        expect(mgr.currentTier).toBe('performance');
        expect(mgr.tierOverride).toBeNull();

        mgr.setTierOverride('cinematic');
        expect(mgr.currentTier).toBe('cinematic');
        expect(mgr.automaticTier).toBe('performance');
        expect(mgr.tierOverride).toBe('cinematic');
    });

    it('the last inputs are recalled so a pin change can be re-applied immediately', () => {
        const mgr = new SceneQualityTierManager();
        expect(mgr.lastMeshCount).toBeUndefined();
        mgr.update(4_102, true);
        expect(mgr.lastMeshCount).toBe(4_102);
        expect(mgr.lastIsWebGPU).toBe(true);
    });

    it('reset() clears the derived hysteresis state but NEVER the user\'s pin (L-1483)', () => {
        const mgr = new SceneQualityTierManager();
        mgr.update(4_102, true);
        mgr.setTierOverride('balanced');
        mgr.reset();
        expect(mgr.automaticTier).toBeUndefined();
        expect(mgr.lastMeshCount).toBeUndefined();
        expect(mgr.tierOverride).toBe('balanced');
        expect(mgr.currentTier).toBe('balanced');
    });
});
