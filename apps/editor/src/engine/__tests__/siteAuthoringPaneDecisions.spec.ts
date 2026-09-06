// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59) — PURE decision tests for the
// site-authoring two-pane layout. These pin the founder-visible behaviour WITHOUT a
// live SplitViewManager (OBC.World + THREE) or Cesium viewer:
//   Req 1 — during SITE authoring the legacy Canvas2D plan pane's project-load
//           auto-open is SUPPRESSED → exactly two panes (2D map + 3D Site); after site
//           authoring ends the suppression lifts and the plan pane can re-open.
//   Req 2 — the paned 3D Site FRAMES the plot ONCE on the first parcel-boundary commit
//           (no whole-city zoom-out), then falls back to the no-re-fly path (no jitter).
//   L-13000 — the split MAY NOT EXIST while the onboarding globe still owns the screen
//           (§ONBOARDING-IS-FULL-BLEED), and the §22 reveal must still get through.

import { describe, it, expect } from 'vitest';
import {
    shouldAutoOpenSplitView,
    shouldFramePanedSiteOnUpdate,
    shouldMountSiteAuthoringSplit,
    ringCentroidXZ,
    resolveLiveUpdateEventBus,
    PARCEL_BOUNDARY_SET_EVENT,
    type LiveUpdateEventBus,
} from '../views/siteAuthoringPaneDecisions';

describe('§L-412 Req 1 — legacy plan-pane auto-open vs the site-authoring split', () => {
    it('auto-opens on a fresh project load (not active, not suppressed)', () => {
        expect(shouldAutoOpenSplitView({ isActive: false, autoOpenSuppressed: false })).toBe(true);
    });

    it('does NOT auto-open while the site-authoring split has suppressed it', () => {
        // The site-authoring split is mounted → exactly two panes; the redundant
        // Canvas2D plan pane must stay OFF.
        expect(shouldAutoOpenSplitView({ isActive: false, autoOpenSuppressed: true })).toBe(false);
    });

    it('does NOT re-open when it is already active (idempotent)', () => {
        expect(shouldAutoOpenSplitView({ isActive: true, autoOpenSuppressed: false })).toBe(false);
    });

    it('wins the idle-callback race: suppression set AFTER scheduling still blocks the open', () => {
        // At schedule time the split had not mounted yet → would have opened.
        const atScheduleTime = { isActive: false, autoOpenSuppressed: false };
        expect(shouldAutoOpenSplitView(atScheduleTime)).toBe(true);
        // Between schedule and fire, the site-authoring split mounts + suppresses.
        const atFireTime = { isActive: false, autoOpenSuppressed: true };
        // Because the guard is re-evaluated at FIRE time, the plan pane stays closed.
        expect(shouldAutoOpenSplitView(atFireTime)).toBe(false);
    });

    it('after site authoring ends the suppression lifts → the plan pane can re-open', () => {
        // unmountSiteAuthoringPanes() → allowAutoOpen() clears the flag.
        expect(shouldAutoOpenSplitView({ isActive: false, autoOpenSuppressed: false })).toBe(true);
    });
});

describe('§L-412 Req 2 — paned 3D Site frames the plot on the first commit', () => {
    // Never framed yet → lastFramedCentroid is null; a fresh commit at some plot.
    const base = {
        source: PARCEL_BOUNDARY_SET_EVENT,
        site3dPaned: true,
        newCentroid: { x: 100, z: 100 },
        lastFramedCentroid: null,
    };

    it('frames on the FIRST parcel-boundary commit into a live pane (never framed yet)', () => {
        expect(shouldFramePanedSiteOnUpdate(base)).toBe(true);
    });

    it('does NOT re-frame when the SAME plot is re-committed (centroid unchanged) — no jitter', () => {
        // Already framed to (100,100); a re-commit of the identical plot must not re-fly.
        expect(
            shouldFramePanedSiteOnUpdate({
                ...base,
                lastFramedCentroid: { x: 100, z: 100 },
                newCentroid: { x: 100, z: 100 },
            }),
        ).toBe(false);
    });

    it('does NOT frame on zoning / layout edits — only the parcel-boundary commit frames', () => {
        expect(shouldFramePanedSiteOnUpdate({ ...base, source: 'site.zoning-updated' })).toBe(false);
        expect(shouldFramePanedSiteOnUpdate({ ...base, source: 'apartment.layout-executed' })).toBe(false);
    });

    it('does NOT frame when the 3D Site is not hosted in a pane (classic single-view)', () => {
        expect(shouldFramePanedSiteOnUpdate({ ...base, site3dPaned: false })).toBe(false);
    });
});

describe('§L-416 — re-frame when a NEW parcel is chosen outside the framed area', () => {
    const base = {
        source: PARCEL_BOUNDARY_SET_EVENT,
        site3dPaned: true,
        lastFramedCentroid: { x: 0, z: 0 },
        newCentroid: { x: 0, z: 0 },
    };

    it('RE-FRAMES when the new plot centroid moved beyond the threshold (a point not in the original circle)', () => {
        // 50 m away → clearly a new parcel → re-fly to it.
        expect(shouldFramePanedSiteOnUpdate({ ...base, newCentroid: { x: 50, z: 0 } })).toBe(true);
        expect(shouldFramePanedSiteOnUpdate({ ...base, newCentroid: { x: 0, z: 40 } })).toBe(true);
    });

    it('does NOT re-frame for a tiny centroid nudge (same plot, within threshold) — no jitter', () => {
        // < 5 m default threshold → treat as the same plot; hold the camera.
        expect(shouldFramePanedSiteOnUpdate({ ...base, newCentroid: { x: 2, z: 2 } })).toBe(false);
    });

    it('honours a custom re-frame threshold', () => {
        expect(
            shouldFramePanedSiteOnUpdate({ ...base, newCentroid: { x: 8, z: 0 }, reframeThresholdM: 20 }),
        ).toBe(false);
        expect(
            shouldFramePanedSiteOnUpdate({ ...base, newCentroid: { x: 25, z: 0 }, reframeThresholdM: 20 }),
        ).toBe(true);
    });

    it('does NOT re-frame when the new centroid is unknown (null) but the pane was already framed', () => {
        expect(shouldFramePanedSiteOnUpdate({ ...base, newCentroid: null })).toBe(false);
    });
});

describe('§L-416 — ringCentroidXZ (plot centroid helper)', () => {
    it('averages the ring vertices', () => {
        expect(ringCentroidXZ([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }]))
            .toEqual({ x: 5, z: 5 });
    });

    it('returns null for a degenerate ring (< 3 points) or nullish input', () => {
        expect(ringCentroidXZ([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBeNull();
        expect(ringCentroidXZ(null)).toBeNull();
        expect(ringCentroidXZ(undefined)).toBeNull();
    });
});

describe('§L-412 root-cause — the Forma live-update bus survives a null captured runtime', () => {
    /** A fake bus whose `on` records subscriptions + handlers and can DISPATCH them,
     *  mirroring both the composed `runtime.events` and the `window.runtime` slot (both
     *  return a callable disposer). */
    interface FakeBus extends LiveUpdateEventBus {
        events: string[];
        emit(event: string, payload?: unknown): void;
    }
    const makeBus = (): FakeBus => {
        const events: string[] = [];
        const handlers = new Map<string, Array<(p: unknown) => void>>();
        return {
            events,
            on(event: string, handler: (p: unknown) => void) {
                events.push(event);
                const list = handlers.get(event) ?? [];
                list.push(handler);
                handlers.set(event, list);
                return () => { /* disposer */ };
            },
            emit(event: string, payload?: unknown) {
                for (const h of handlers.get(event) ?? []) h(payload);
            },
        };
    };

    it('prefers the captured runtime bus when present', () => {
        const captured = makeBus();
        const windowBus = makeBus();
        expect(resolveLiveUpdateEventBus(captured, windowBus)).toBe(captured);
    });

    it('falls back to the window.runtime bus when the captured runtime is null (LIVE boot path)', () => {
        // createMainLayout(props, null) → mountGISArea captured runtime is null, so
        // `runtime?.events` is undefined; the composed bus is only on window.runtime.
        const windowBus = makeBus();
        expect(resolveLiveUpdateEventBus(null, windowBus)).toBe(windowBus);
        expect(resolveLiveUpdateEventBus(undefined, windowBus)).toBe(windowBus);
    });

    it('returns null only when neither bus exists (subscription genuinely cannot arm)', () => {
        expect(resolveLiveUpdateEventBus(null, null)).toBeNull();
        expect(resolveLiveUpdateEventBus(undefined, undefined)).toBeNull();
    });

    it('ignores a malformed bus object (no callable `on`) and uses the valid one', () => {
        const windowBus = makeBus();
        const brokenCaptured = {} as unknown as LiveUpdateEventBus;
        expect(resolveLiveUpdateEventBus(brokenCaptured, windowBus)).toBe(windowBus);
    });

    it('END-TO-END: a boundary drawn AFTER the pane mounts, on the window bus, still frames + renders the envelope', () => {
        // Repro of the founder symptom's fix: the captured runtime is null (live boot),
        // so the live-update bus is resolved from window.runtime. When the parcel-boundary
        // commit lands on THAT bus into a live 3D-Site pane that has not yet framed, the
        // pure decision says FRAME — the same one-shot fly that renders the plot + envelope.
        const captured: LiveUpdateEventBus | null = null; // createMainLayout(props, null)
        const windowBus = makeBus();
        const bus = resolveLiveUpdateEventBus(captured, windowBus);
        expect(bus).toBe(windowBus);

        // Simulate GISAreaLayout subscribing on the resolved bus; the fake bus records
        // the handler, and on commit the pure decision drives the one-shot frame.
        let framed = false;
        bus!.on(PARCEL_BOUNDARY_SET_EVENT, () => {
            framed = shouldFramePanedSiteOnUpdate({
                source: PARCEL_BOUNDARY_SET_EVENT,
                site3dPaned: true,          // hostsView('site-3d') true synchronously after applyLayout
                newCentroid: { x: 10, z: 10 },
                lastFramedCentroid: null,   // pane mounted empty (boundary drawn afterwards)
            });
        });
        // The subscription armed on the window bus (the crux of the fix)…
        expect(windowBus.events).toContain(PARCEL_BOUNDARY_SET_EVENT);
        // …and dispatching the commit into a not-yet-framed live pane frames the plot.
        windowBus.emit(PARCEL_BOUNDARY_SET_EVENT);
        expect(framed).toBe(true);
    });
});

describe('§ONBOARDING-IS-FULL-BLEED (L-13000) — the split may not exist over the onboarding globe', () => {
    // The founder, 2026-09-06, with a screenshot of "STEP 1 OF 4 · LOCATION" and the globe
    // squeezed into the left half: *"pLEASE MAKE SURE AT THIS STAGE THE VIEW IS ALWAYS IN
    // 'AUTHOR' FULL VIEW WITH THE EARTH"*. The globe is a FULL-BLEED surface, not a pane.
    it('REFUSES the mount on the onboarding globe before the model has a Site', () => {
        expect(shouldMountSiteAuthoringSplit({
            onboardingGlobePhase: true,
            siteCommitted: false,
        })).toBe(false);
    });

    // ⭐ THE REGRESSION THIS FILE EXISTS TO CATCH, and it is the one a "simplification"
    // would cause: refusing on the PHASE ALONE deletes PRD §22's zoom-then-split reveal,
    // which mounts DURING the guided flow by design. The reveal's contractual order
    // (`siteRevealSequence`: seed-frame → anchor-site-location → arm-listener → mount-split)
    // means the Site is committed by the time the mount is asked for.
    it('ALLOWS the §22 reveal: same phase, but the location has been anchored first', () => {
        expect(shouldMountSiteAuthoringSplit({
            onboardingGlobePhase: true,
            siteCommitted: true,
        })).toBe(true);
    });

    // "Draw it on the map" with NO location: `startDrawThenGenerate()` calls `ensureSite()`,
    // which seeds {0, 0} deliberately. Refusing here would strand the user on the drawing
    // step with no map — L-10721 again — which is why the predicate asks about the Site's
    // EXISTENCE and not about a plausible lat/lon.
    it('ALLOWS the draw step reached with no geocoded location (ensureSite seeds 0/0)', () => {
        expect(shouldMountSiteAuthoringSplit({
            onboardingGlobePhase: true,
            siteCommitted: true,
        })).toBe(true);
    });

    it('is INERT outside the guided flow — on the canvas the split is ordinary chrome', () => {
        // A project opened from the hub declares `canvas` at the open gesture (§L-1186),
        // so neither arm of the gate may touch the Parcel Law tab’s view switcher.
        expect(shouldMountSiteAuthoringSplit({
            onboardingGlobePhase: false,
            siteCommitted: false,
        })).toBe(true);
        expect(shouldMountSiteAuthoringSplit({
            onboardingGlobePhase: false,
            siteCommitted: true,
        })).toBe(true);
    });
});
