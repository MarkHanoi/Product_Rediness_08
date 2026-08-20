/**
 * §RENDER-QUALITY-USER-PIN (L-1512) — the pin must REACH the renderer, not merely be set.
 *
 * THE FOUNDER'S REQUEST: *"Lately the quality WebGPU has decreased … however I would like
 * to ad-hoc be able to have a sound rendering shadow quality."* His scene is ~4,102 meshes,
 * so §PERF-LARGE-SCENE-TIER-CAP (ADR-0094) holds him at `performance` — shadowLevel
 * `standard`, decorative shadows off.
 *
 * The tier-manager half of the feature is proved in
 * `packages/core-app-model/src/rendering/SceneQualityTierManager.test.ts`. THIS file proves
 * the half that the "committed ≠ reachable" rule is about: a `setTierOverride()` call
 * changes a decision service and NOTHING ELSE. The shadow map, reflection probe and
 * SSGI/TRAA hooks only move when `RenderingPipelineCoordinator.applyTierForMeshCount()`
 * runs, and that is driven by geometry events — which a settings click is not. So the
 * assertion with teeth is: **the coordinator was re-driven, with the mesh count and backend
 * flag the tier manager last saw, and the tier it then computes is the pinned one.**
 *
 * Delete the re-apply in `applyRenderQualityPin` and the first test below goes red while
 * the pin still "works" everywhere except on screen — which is the exact failure mode.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sceneQualityTierManager } from '@pryzm/core-app-model/rendering';
import {
    applyRenderQualityPin,
    getRenderQualityPin,
    isRenderQualityPin,
    pinIsRicherThanAutomatic,
    restoreRenderQualityPin,
    setRenderQualityPin,
    type TierApplier,
} from './renderQualityPin';

/** A minimal in-memory localStorage stub (same idiom as rendererBackendPreference.test.ts). */
function installStorage(initial: Record<string, string> = {}): Map<string, string> {
    const store = new Map<string, string>(Object.entries(initial));
    Object.defineProperty(globalThis, 'localStorage', {
        value: {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(k, v); },
            removeItem: (k: string) => { store.delete(k); },
            clear: () => { store.clear(); },
        },
        configurable: true,
        writable: true,
    });
    return store;
}

beforeEach(() => {
    installStorage({});
    sceneQualityTierManager.reset();
    sceneQualityTierManager.setTierOverride(null);
});

afterEach(() => {
    sceneQualityTierManager.setTierOverride(null);
    sceneQualityTierManager.reset();
    Reflect.deleteProperty(globalThis as object, 'localStorage');
    vi.restoreAllMocks();
});

describe('§RENDER-QUALITY-USER-PIN (L-1512) — the pin reaches the renderer', () => {
    it('re-drives the coordinator with the mesh count and backend the tier manager last saw', () => {
        // The founder's scene has already been tiered once.
        const first = sceneQualityTierManager.update(4_102, true);
        expect(first.tier).toBe('performance');

        const applyTierForMeshCount = vi.fn();
        const coordinator: TierApplier = { applyTierForMeshCount };

        const result = applyRenderQualityPin('balanced', coordinator);

        expect(applyTierForMeshCount).toHaveBeenCalledTimes(1);
        expect(applyTierForMeshCount).toHaveBeenCalledWith(4_102, true);
        expect(result.reapplied).toBe(true);
        expect(result.meshCount).toBe(4_102);
        expect(result.automaticTier).toBe('performance');

        // …and the tier the coordinator would now compute IS the pin, with the shadow
        // quality the founder asked for.
        const second = sceneQualityTierManager.update(4_102, true);
        expect(second.tier).toBe('balanced');
        expect(second.pinned).toBe(true);
        expect(second.settings.shadowLevel).toBe('high');
        expect(second.settings.decorativeFurnitureShadows).toBe(true);
    });

    it('reports reapplied=false rather than claiming a change it did not make', () => {
        // No project open yet → no coordinator, no mesh count.
        const result = applyRenderQualityPin('cinematic', null);
        expect(result.reapplied).toBe(false);
        expect(result.meshCount).toBeUndefined();
        // The pin is still SET and PERSISTED — it takes effect at the next tier evaluation.
        expect(sceneQualityTierManager.tierOverride).toBe('cinematic');
        expect(getRenderQualityPin()).toBe('cinematic');
    });

    it('a coordinator that throws does not take the settings panel down with it', () => {
        sceneQualityTierManager.update(4_102, true);
        const coordinator: TierApplier = {
            applyTierForMeshCount: () => { throw new Error('boom'); },
        };
        vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
        const result = applyRenderQualityPin('balanced', coordinator);
        expect(result.reapplied).toBe(false);
        expect(sceneQualityTierManager.tierOverride).toBe('balanced'); // still pinned
    });

    it('"auto" clears the pin and returns to the automatic policy', () => {
        sceneQualityTierManager.update(4_102, true);
        const applyTierForMeshCount = vi.fn();
        applyRenderQualityPin('cinematic', { applyTierForMeshCount });
        expect(sceneQualityTierManager.currentTier).toBe('cinematic');

        applyRenderQualityPin('auto', { applyTierForMeshCount });
        expect(sceneQualityTierManager.tierOverride).toBeNull();
        expect(sceneQualityTierManager.update(4_102, true).tier).toBe('performance');
        expect(getRenderQualityPin()).toBe('auto');
    });
});

describe('§RENDER-QUALITY-USER-PIN (L-1512) — persistence', () => {
    it('round-trips through the store and survives a boot via restore()', () => {
        setRenderQualityPin('balanced');
        expect(getRenderQualityPin()).toBe('balanced');

        // A "reload": the tier manager is a fresh singleton with no pin.
        sceneQualityTierManager.setTierOverride(null);
        expect(sceneQualityTierManager.tierOverride).toBeNull();

        expect(restoreRenderQualityPin()).toBe('balanced');
        expect(sceneQualityTierManager.tierOverride).toBe('balanced');
    });

    it('defaults to "auto" when unset, and rejects a garbage stored value', () => {
        expect(getRenderQualityPin()).toBe('auto');
        installStorage({ 'pryzm.render.qualityTier': 'ludicrous' });
        expect(getRenderQualityPin()).toBe('auto');
        expect(restoreRenderQualityPin()).toBe('auto');
        expect(sceneQualityTierManager.tierOverride).toBeNull();
    });

    it('survives storage being unavailable (private mode) without throwing', () => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: {
                getItem: () => { throw new Error('SecurityError'); },
                setItem: () => { throw new Error('SecurityError'); },
            },
            configurable: true,
            writable: true,
        });
        expect(getRenderQualityPin()).toBe('auto');
        expect(() => setRenderQualityPin('cinematic')).not.toThrow();
    });

    it('isRenderQualityPin accepts exactly the five user-expressible values', () => {
        for (const v of ['auto', 'cinematic', 'balanced', 'performance', 'survival']) {
            expect(isRenderQualityPin(v)).toBe(true);
        }
        for (const v of [null, undefined, '', 'ultra', 'high', 42]) {
            expect(isRenderQualityPin(v)).toBe(false);
        }
    });
});

describe('§RENDER-QUALITY-USER-PIN (L-1512) — the UI must be able to be honest', () => {
    it('knows when a pin is RICHER than the automatic tier (the case that needs saying)', () => {
        expect(pinIsRicherThanAutomatic('cinematic', 'performance')).toBe(true);
        expect(pinIsRicherThanAutomatic('balanced', 'performance')).toBe(true);
        expect(pinIsRicherThanAutomatic('performance', 'performance')).toBe(false);
        expect(pinIsRicherThanAutomatic('survival', 'performance')).toBe(false);
        expect(pinIsRicherThanAutomatic('auto', 'performance')).toBe(false);
        // Nothing decided yet — there is no cap to claim we are overriding.
        expect(pinIsRicherThanAutomatic('cinematic', undefined)).toBe(false);
    });
});
