/**
 * getRendererBackendPreference resolution tests — ADR-0076 §PERF-WEBGPU-FRAGMENT.
 *
 * Proves the boot backend-resolution chain:
 *   - UNSET profile (cleared localStorage)  → 'webgl'  (the new founder default)
 *   - explicit 'webgpu' / 'auto' / 'webgl'  → honoured verbatim
 *   - storage throwing (private mode)        → 'webgl'
 *
 * This is the SINGLE function both the prewarm path (rendererPrewarm →
 * createRenderer) and the direct Phase-5 path (initScene → createRenderer) consult,
 * so an unset profile prewarms + boots WebGL through BOTH paths.
 *
 * ROOT-CAUSE NOTE: a boot that still logs `backend: webgpu` on a "fresh" profile is
 * a STALE PERSISTED 'webgpu' value (set by an earlier toggle click), NOT an
 * independent default — there is exactly one renderer-creation path and it consults
 * this function. Clearing localStorage (or picking WebGL/Auto in the toggle) resolves it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A minimal in-memory localStorage stub installed on globalThis for the test.
function installStorage(initial: Record<string, string> = {}): Map<string, string> {
    const store = new Map<string, string>(Object.entries(initial));
    const stub = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
    };
    Object.defineProperty(globalThis, 'localStorage', {
        value: stub,
        configurable: true,
        writable: true,
    });
    return store;
}

describe('getRendererBackendPreference (ADR-0076 §PERF-WEBGPU-FRAGMENT)', () => {
    beforeEach(() => {
        vi.resetModules();
    });
    afterEach(() => {
        // Remove the stub so other suites are unaffected.
        Reflect.deleteProperty(globalThis as object, 'localStorage');
    });

    it('UNSET profile resolves to webgl (the new default — was webgpu-first)', async () => {
        installStorage({}); // cleared profile
        const { getRendererBackendPreference } = await import('./createRenderer');
        expect(getRendererBackendPreference()).toBe('webgl');
    });

    it('explicit stored values are honoured verbatim (stale webgpu stays webgpu)', async () => {
        installStorage({ 'pryzm.renderer.backend': 'webgpu' });
        const { getRendererBackendPreference } = await import('./createRenderer');
        // This is exactly the founder's situation: an earlier toggle persisted webgpu,
        // so the boot honours it. Not an independent default.
        expect(getRendererBackendPreference()).toBe('webgpu');
    });

    it('explicit auto and webgl are honoured', async () => {
        installStorage({ 'pryzm.renderer.backend': 'auto' });
        let mod = await import('./createRenderer');
        expect(mod.getRendererBackendPreference()).toBe('auto');

        vi.resetModules();
        installStorage({ 'pryzm.renderer.backend': 'webgl' });
        mod = await import('./createRenderer');
        expect(mod.getRendererBackendPreference()).toBe('webgl');
    });

    it('a garbage stored value falls back to the webgl default', async () => {
        installStorage({ 'pryzm.renderer.backend': 'vulkan' });
        const { getRendererBackendPreference } = await import('./createRenderer');
        expect(getRendererBackendPreference()).toBe('webgl');
    });

    it('storage throwing (private mode) falls back to webgl', async () => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: { getItem() { throw new Error('blocked'); } },
            configurable: true,
            writable: true,
        });
        const { getRendererBackendPreference } = await import('./createRenderer');
        expect(getRendererBackendPreference()).toBe('webgl');
    });
});

// §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION (L-203) — the per-call override the device-loss
// safe-mode recovery uses so it can force WebGL for the CURRENT session WITHOUT persisting
// (i.e. without silently flip-flopping the user's stored WebGPU/Auto preference).
describe('resolveEffectiveBackendPreference (§DIAG-FIX-WEBGPU-BACKEND-OSCILLATION)', () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => { Reflect.deleteProperty(globalThis as object, 'localStorage'); });

    it('an explicit override WINS over the persisted preference (and does not mutate storage)', async () => {
        const store = installStorage({ 'pryzm.renderer.backend': 'webgpu' });
        const { resolveEffectiveBackendPreference } = await import('./createRenderer');
        // Safe-mode recovery forces 'webgl' for this call only…
        expect(resolveEffectiveBackendPreference('webgl')).toBe('webgl');
        // …but the user's persisted WebGPU choice is UNTOUCHED (no flip-flop).
        expect(store.get('pryzm.renderer.backend')).toBe('webgpu');
    });

    it('with NO override, falls through to the persisted preference', async () => {
        installStorage({ 'pryzm.renderer.backend': 'auto' });
        const { resolveEffectiveBackendPreference } = await import('./createRenderer');
        expect(resolveEffectiveBackendPreference()).toBe('auto');
        expect(resolveEffectiveBackendPreference(undefined)).toBe('auto');
    });

    it('with NO override and an unset profile, resolves to the webgl default', async () => {
        installStorage({});
        const { resolveEffectiveBackendPreference } = await import('./createRenderer');
        expect(resolveEffectiveBackendPreference()).toBe('webgl');
    });
});
