// §CREATE-SHOULD-TAKE-HIM-WHERE-THE-RESULT-LIVES (lane CREATE-HOUSE-IS-ATOMIC, L-13013 / L-13014)
//
// The two PROHIBITIONS are the important half of this spec, not the happy path:
//   ⛔ never navigate on a FAILED run — after L-13011's crash the correct behaviour is to stay
//      put and say what failed;
//   ⛔ never navigate on "Keep this as a level envelope" — the founder wants to watch that on the
//      SITE views (L-13007).
// Both are satisfied structurally, by keying on `house.layout-executed` (which only a completed
// build emits) rather than on the pipeline promise (which resolves when the CHOOSER OPENS). These
// tests pin that structure, so a later refactor onto the promise fails here.

import { describe, it, expect, vi } from 'vitest';
import {
    armLandInBimOnNextHouse,
    defaultLandInBimDeps,
    HOUSE_BUILT_EVENT,
    ARM_TIMEOUT_MS,
    type LandInBimDeps,
} from '../landInBimAfterCreateHouse.js';

/** A harness whose `fire()` stands in for the executor emitting `house.layout-executed`. */
function harness(overrides: Partial<LandInBimDeps> = {}) {
    const calls: string[] = [];
    let handler: (() => void) | null = null;
    let unsubCount = 0;
    let timerFn: (() => void) | null = null;
    const deps: LandInBimDeps = {
        onHouseBuilt: (h) => { handler = h; return () => { unsubCount++; handler = null; }; },
        setAuthorMode: () => { calls.push('mode:author'); },
        showBimDualPane: () => { calls.push('layout:bim-dual-pane'); },
        setTimer: (fn) => { timerFn = fn; return 1; },
        clearTimer: () => { timerFn = null; },
        ...overrides,
    };
    return {
        deps,
        calls,
        fire: (): void => { handler?.(); },
        expire: (): void => { timerFn?.(); },
        isSubscribed: (): boolean => handler !== null,
        unsubCount: (): number => unsubCount,
    };
}

describe('§CREATE-SHOULD-TAKE-HIM-WHERE-THE-RESULT-LIVES — the landing layout', () => {
    it('applies Author mode and the 3D-left / 2D-right dual pane once a house is built', () => {
        const h = harness();
        armLandInBimOnNextHouse(h.deps);
        expect(h.calls).toEqual([]);   // nothing happens at ARM time
        h.fire();
        // ⛔ MODE BEFORE LAYOUT — `setMode` runs its own `_applyLayout()`, which reconciles the
        // split pane against the new canvas width. Opening the pane first would let that
        // reconciliation close the pane this feature exists to open.
        expect(h.calls).toEqual(['mode:author', 'layout:bim-dual-pane']);
    });

    it('⛔ does NOT navigate when no house is ever built — a failed run leaves the user put', () => {
        const h = harness();
        armLandInBimOnNextHouse(h.deps);
        // The pipeline threw / refused, so the executor never emitted. Nothing fires.
        expect(h.calls).toEqual([]);
        h.expire();
        expect(h.calls).toEqual([]);
    });

    it('⛔ keys on the BUILD event, never on the pipeline promise', () => {
        // The regression guard for the modal path: `generateHouseFromBoundary` resolves ok when
        // the CHOOSER OPENS. If this feature is ever re-seated onto that promise, the event name
        // below stops being the trigger and this assertion is the tripwire.
        expect(HOUSE_BUILT_EVENT).toBe('house.layout-executed');
        const seen: string[] = [];
        const rt = { events: { on: (k: string) => { seen.push(k); return () => {}; } } };
        const deps = defaultLandInBimDeps(rt as never);
        deps.onHouseBuilt(() => {});
        expect(seen).toEqual(['house.layout-executed']);
    });

    it('is ONE-SHOT — a second build does not navigate again', () => {
        const h = harness();
        armLandInBimOnNextHouse(h.deps);
        h.fire();
        expect(h.calls).toHaveLength(2);
        h.fire();   // the handler was detached on the first fire
        expect(h.calls).toHaveLength(2);
        expect(h.unsubCount()).toBe(1);
    });

    it('the disposer disarms it, so a cancelled chooser cannot navigate later', () => {
        const h = harness();
        const disarm = armLandInBimOnNextHouse(h.deps);
        disarm();
        expect(h.isSubscribed()).toBe(false);
        h.fire();
        expect(h.calls).toEqual([]);
    });

    it('expires on its own after the bounded arm window', () => {
        const h = harness();
        armLandInBimOnNextHouse(h.deps);
        h.expire();
        expect(h.isSubscribed()).toBe(false);
        h.fire();
        expect(h.calls).toEqual([]);
        expect(ARM_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('⛔ reports honestly, and does not claim to be armed, when there is no event channel', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const h = harness({ onHouseBuilt: () => undefined });
        const disarm = armLandInBimOnNextHouse(h.deps);
        expect(warn).toHaveBeenCalled();
        expect(() => disarm()).not.toThrow();
        warn.mockRestore();
    });

    it('never throws — a navigation helper must not break the build it follows', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const h = harness({
            setAuthorMode: () => { throw new Error('mode exploded'); },
            showBimDualPane: () => { throw new Error('layout exploded'); },
        });
        expect(() => armLandInBimOnNextHouse(h.deps)).not.toThrow();
        expect(() => h.fire()).not.toThrow();
        warn.mockRestore();
    });

    it('the production deps reach BOTH declared globals and neither is a window cast', () => {
        const w = window as unknown as Record<string, unknown>;
        const seen: string[] = [];
        w.workspaceController = { setMode: (m: string) => seen.push(`mode:${m}`) };
        w.pryzmShowSiteResultView = (v?: string) => seen.push(`result:${v}`);
        const deps = defaultLandInBimDeps(null);
        deps.setAuthorMode();
        deps.showBimDualPane();
        // '2D' is the argument that yields LEFT 3D viewport · RIGHT 2D plan (applyBimDualPane).
        expect(seen).toEqual(['mode:author', 'result:2D']);
        delete w.workspaceController;
        delete w.pryzmShowSiteResultView;
    });

    it('⛔ says so, rather than failing silently, when the BIM host is not mounted', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const w = window as unknown as Record<string, unknown>;
        delete w.pryzmShowSiteResultView;
        defaultLandInBimDeps(null).showBimDualPane();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('pryzmShowSiteResultView is not available'));
        warn.mockRestore();
    });
});
