// @vitest-environment happy-dom
//
// §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — a globe / 3D-Site activation FAILURE must stay IN the
// editor with a retry, and must NEVER eject the founder to /projects (or hard-reload).
//
// THE BUG: opening the 3D globe is triggered from `void applyResultView('3D')` / a sync click
// handler. When the activation throws/rejects (e.g. the L-313 stale-viewer "no live Cesium
// viewer/scene available", or a Cesium/GIS error), the error escapes as an unhandled window
// error/rejection. The editor's ViewportCrashGuard only SWALLOWS GPU/render-KEYWORD unhandled
// errors (keeping the viewport alive); a Cesium/GIS activation error slips that net and
// propagates to the router / a global handler that navigates to /projects (or reloads) — a
// fresh app boot at the hub. The contrast the founder saw: a render-keyword rejection ("TSL
// module not loaded") IS caught by ViewportCrashGuard and the user stays put.
//
// THE FIX: `containViewActivation()` is the GIS-boundary containment — it runs the activation
// step, and on ANY throw/rejection it logs + surfaces the in-editor retry (onFail) and NEVER
// re-propagates. This test is the tooth: a FAILING activation (a) invokes retry, (b) triggers
// NO navigation/reload API, and (c) never rejects (so nothing reaches the global crash guard).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { containViewActivation } from '../src/ui/geospatial/viewActivationLoading';

describe('§FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — containViewActivation keeps a failing globe IN-editor', () => {
    let reloadSpy: ReturnType<typeof vi.fn>;
    let assignSpy: ReturnType<typeof vi.fn>;
    let hrefBefore: string;

    beforeEach(() => {
        // Spy on every navigation/reload channel so we can assert NONE fire on failure.
        reloadSpy = vi.fn();
        assignSpy = vi.fn();
        // happy-dom exposes window.location; override the navigating members with spies.
        Object.defineProperty(window.location, 'reload', { configurable: true, value: reloadSpy });
        Object.defineProperty(window.location, 'assign', { configurable: true, value: assignSpy });
        hrefBefore = window.location.href;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function assertNoNavigation(): void {
        expect(reloadSpy).not.toHaveBeenCalled();
        expect(assignSpy).not.toHaveBeenCalled();
        expect(window.location.href).toBe(hrefBefore);
    }

    it('a REJECTING activation surfaces the in-editor retry (onFail) and never navigates/reloads', async () => {
        const onFail = vi.fn();
        const step = () => Promise.reject(new Error('no live Cesium viewer/scene available'));

        // The whole point: it RESOLVES (contained) — no unhandled rejection escapes to the crash guard.
        await expect(containViewActivation(step, onFail, 'The 3D globe failed to open')).resolves.toBeUndefined();

        // Retry surfaced IN-editor (distinguishes "activate was called" from "failing activate → retry").
        expect(onFail).toHaveBeenCalledTimes(1);
        expect(onFail.mock.calls[0][0]).toContain('The 3D globe failed to open');
        expect(onFail.mock.calls[0][0]).toContain('no live Cesium viewer/scene available');
        assertNoNavigation();
    });

    it('a SYNCHRONOUSLY-THROWING activation is contained the same way (no navigate-out)', async () => {
        const onFail = vi.fn();
        const step = () => { throw new Error('Cannot read properties of undefined (reading \'scene\')'); };

        await expect(containViewActivation(step, onFail)).resolves.toBeUndefined();

        expect(onFail).toHaveBeenCalledTimes(1);
        assertNoNavigation();
    });

    it('a SUCCEEDING activation does NOT surface retry and does not navigate (not vacuous)', async () => {
        const onFail = vi.fn();
        const step = vi.fn(() => Promise.resolve());

        await expect(containViewActivation(step, onFail)).resolves.toBeUndefined();

        expect(step).toHaveBeenCalledTimes(1);
        expect(onFail).not.toHaveBeenCalled();
        assertNoNavigation();
    });

    it('even if the onFail surface itself throws, containment holds (no escape, no navigate)', async () => {
        const onFail = vi.fn(() => { throw new Error('overlay blew up'); });
        const step = () => Promise.reject(new Error('activation failed'));

        // Must STILL resolve — a broken retry-surface can never re-throw into the global crash guard.
        await expect(containViewActivation(step, onFail)).resolves.toBeUndefined();
        expect(onFail).toHaveBeenCalledTimes(1);
        assertNoNavigation();
    });
});
