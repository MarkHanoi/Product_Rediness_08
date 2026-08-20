// §HEURISTIC-MAY-OVERRIDE-A-PIN-BUT-NEVER-OVERWRITE-IT (L-1483, lane WEBGL4, 2026-08-20)
//
// ── THE DEFECT ────────────────────────────────────────────────────────────────────
// The founder had PINNED WebGPU in the corner toggle. `§AUTO-WEBGL-HEAVY` swapped him to
// the classic renderer anyway — which is DELIBERATE (ADR-0267 §Fix-3 / L-366; C04 §1.4
// now records it honestly) — and its console message told him *"Re-pick WebGPU to
// override."*
//
// But `initScene.ts` §RENDERER-LIVE-SWAP also ran, unconditionally:
//
//     setRendererBackendPreference(intendedClassicWebGL ? 'webgl' : pref);
//
// `'webgl-classic'` is a PROGRAMMATIC target that no user toggle can produce and that
// `getRendererBackendPreference()` has never round-tripped — so the swap TRANSLATED it
// into a different, user-expressible value and wrote THAT over the top of his `'webgpu'`.
// His next boot then resolved `'webgl'` → `forceWebGL` → `'webgl-fallback'` **before the
// heuristic ran at all**. He was not being overridden for a session; he was being
// permanently re-defaulted, which is why re-picking WebGPU never survived a reload.
//
// ⭐ THE RULE, and it is general: a stored preference is the USER'S STATEMENT OF INTENT.
// A safety heuristic may override it FOR A SESSION; it may not DESTROY it. Persisting
// collapses two states the system can never separate again — *"the user chose WebGL"* and
// *"a guard chose WebGL for the user"*. That is this repo's failure-vs-empty defect class
// wearing a renderer costume. `§DIAG-FIX-WEBGPU-BACKEND-OSCILLATION` had already added the
// per-call, NON-persisting `backendOverride` parameter for exactly this (L-203); the
// mechanism existed and this call site did not use it.
//
// ── WHAT THIS TEST PINS ───────────────────────────────────────────────────────────
// The DECISION, extracted to `swapMayPersistPreference()` so it is reachable without an
// initScene boot (the same pattern `isUnintendedWebglOnlySwap` was extracted for). It is
// a DERIVATION, not a special case for one string: a swap may persist exactly the values
// the STORE round-trips, so a fourth programmatic target added tomorrow lands on
// "do not persist" automatically instead of needing a second site to remember.
//
// ⛔ Honestly stated: this does not boot initScene, so it does not prove the call site
// USES the predicate — only that the predicate answers correctly. The call site is a
// single `if (!swapMayPersistPreference(pref))` at initScene.ts §RENDERER-LIVE-SWAP; if
// that line is ever removed, this suite stays green. That gap is real and named.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    swapMayPersistPreference,
    isRoundTrippableBackendPreference,
    getRendererBackendPreference,
    setRendererBackendPreference,
} from '../src/rendering/createRenderer';

// ── A minimal localStorage so the round-trip can be measured, not asserted ────────
class MemoryStorage {
    private _m = new Map<string, string>();
    getItem(k: string): string | null { return this._m.has(k) ? this._m.get(k)! : null; }
    setItem(k: string, v: string): void { this._m.set(k, v); }
    removeItem(k: string): void { this._m.delete(k); }
    clear(): void { this._m.clear(); }
}

describe('§HEURISTIC-MAY-OVERRIDE-A-PIN-BUT-NEVER-OVERWRITE-IT (L-1483)', () => {
    let restore: () => void;

    beforeEach(() => {
        const prev = (globalThis as Record<string, unknown>).localStorage;
        (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
        restore = () => { (globalThis as Record<string, unknown>).localStorage = prev; };
    });
    afterEach(() => restore());

    it('THE SEPARATING CASE — the PROGRAMMATIC heavy-gen target must NOT be persisted', () => {
        // This is the founder's swap. `'webgl-classic'` is what §AUTO-WEBGL-HEAVY fires.
        expect(swapMayPersistPreference('webgl-classic')).toBe(false);
    });

    it("a user's explicit pin SURVIVES the heavy-scene swap it was overridden by", () => {
        // He pinned WebGPU.
        setRendererBackendPreference('webgpu');
        expect(getRendererBackendPreference()).toBe('webgpu');

        // §AUTO-WEBGL-HEAVY fires `swap('webgl-classic')`. The swap consults the predicate
        // and, because it says no, writes nothing.
        if (swapMayPersistPreference('webgl-classic')) {
            setRendererBackendPreference('webgl-classic' as never);
        }

        // ⭐ The next BOOT must still resolve his choice — not the guard's.
        expect(getRendererBackendPreference()).toBe('webgpu');
    });

    it('a USER-driven toggle still persists, unchanged — the fix must not disarm the toggle', () => {
        setRendererBackendPreference('webgl');
        for (const pref of ['auto', 'webgpu', 'webgl'] as const) {
            expect(swapMayPersistPreference(pref)).toBe(true);
            setRendererBackendPreference(pref);
            expect(getRendererBackendPreference()).toBe(pref);
        }
    });

    it('the predicate is DERIVED from the store, not a hand-written exception list', () => {
        // Whatever the store can give back unchanged is exactly what a swap may write.
        // These two must never be able to disagree — that equivalence IS the rule.
        for (const v of ['auto', 'webgpu', 'webgl', 'webgl-classic'] as const) {
            expect(swapMayPersistPreference(v)).toBe(isRoundTrippableBackendPreference(v));
        }
    });

    it('a value the store would silently reject is never written (the round-trip is real)', () => {
        setRendererBackendPreference('auto');
        // Force the non-round-trippable value into storage the way the OLD code path could
        // not, and confirm the reader refuses it — this is why persisting it is unsafe.
        (globalThis.localStorage as Storage).setItem('pryzm.renderer.backend', 'webgl-classic');
        expect(getRendererBackendPreference()).toBe('webgl'); // the unset default, not 'webgl-classic'
        expect(isRoundTrippableBackendPreference('webgl-classic')).toBe(false);
    });
});
