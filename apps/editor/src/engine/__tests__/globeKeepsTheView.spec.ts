/**
 * §GLOBE-KEEPS-THE-VIEW (L-13070) — switching between `3D Site` and `3D Globe` keeps the camera.
 *
 * Founder, 2026-09-07, with a screenshot of his Barcelona parcel on the left and the whole Earth
 * on the right: *"After — when selecting the parcel — I have selected 3D Globe — it goes into the
 * right view — but it should keep zooming (ideally the precise same view) than the previous view
 * on 3D Site. Check the logs — this was requested long time ago — I would like ideally the same
 * view — precisely the same."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT "PRECISELY THE SAME" IS, AS A TESTABLE PROPERTY — AND WHY IT IS NOT A TOLERANCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `3D Site` and `3D Globe` are the SAME Cesium viewer (§L-412 · C60 §6.5 · STR §26.1.1), so this
 * is not a save/restore problem across two cameras — there is one camera, and the founder's ask
 * is that nothing move it. That makes exactness structural rather than numeric: the assertion is
 * that the switch calls NOTHING that can move a camera. There are exactly two such capabilities
 * reachable from `defaultSiteViewCameraPorts()` — `host.flyToGeographic()` and the declared
 * `window.pryzmZoomToSite` action — and the fake host below records every call to both. A pose
 * compared "within tolerance" would be the weaker claim; this is the stronger one.
 *
 * ⚠ THE FAKE IS DELIBERATELY MORE PASSIVE THAN THE REAL VIEWPORT, NOT MORE CAPABLE
 * ([[fake-more-capable-than-real]]). It does not model Cesium's camera maths at all; it models
 * the SEAM — which methods were invoked, in which order, with which arguments. A fake built to
 * reproduce the real camera's behaviour could not falsify the claim being made about it, because
 * the claim is about the calls, not the arithmetic.
 *
 * ⛔ WHAT THIS FILE DOES NOT ESTABLISH, said here rather than left to be assumed: it verifies the
 * CODE ROUTE, never the RENDER. That the `global-earth` surface actually draws Barcelona's
 * photoreal tiles at 600 m, and that the ground under the unchanged camera looks right once the
 * city terrain detaches, are GPU facts and belong to the founder's browser.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    SITE_ENTRY_ALTITUDE_M,
    SITE_FRAMING_CARRY_CEILING_M,
    describeSiteFramingReturn,
    siteFramingReturnDecision,
    worldFramingTarget,
} from '../views/siteEntryModel';
import { defaultSiteViewCameraPorts } from '../views/SiteAuthoringPaneShell';

const REPO = resolve(__dirname, '../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

// ════════════════════════════════════════════════════════════════════════════════
// THE PURE RULE
// ════════════════════════════════════════════════════════════════════════════════

describe('§GLOBE-KEEPS-THE-VIEW — siteFramingReturnDecision', () => {
    it('the ceiling IS the declared city band — not a number invented for this lane', () => {
        // ⭐ The threshold is chosen, not guessed, and this arm is where that is checkable.
        // `SITE_ENTRY_ALTITUDE_M.city` is the altitude the entry flow already flies to for
        // "looking at a city", WITH a city-bounded terrain tileset attached and no shard
        // reported. Above it the same model calls the stage `country`/`world` — i.e. not a site.
        expect(SITE_FRAMING_CARRY_CEILING_M).toBe(SITE_ENTRY_ALTITUDE_M.city);
        expect(SITE_FRAMING_CARRY_CEILING_M).toBe(18_000);
        // …and it is three orders of magnitude below the framing the shard was photographed at.
        expect(SITE_ENTRY_ALTITUDE_M.world / SITE_FRAMING_CARRY_CEILING_M).toBeGreaterThan(1000);
    });

    it('CARRIES inside the site band — the parcel range the founder is actually on', () => {
        for (const h of [0, 1, 120, 600, 1_800, 17_999, SITE_FRAMING_CARRY_CEILING_M]) {
            const d = siteFramingReturnDecision(h);
            expect(d.action, `altitude ${h} m should carry`).toBe('carry');
            expect(d.altitudeM).toBe(h);
        }
    });

    it('REFRAMES above the site band — carrying there would rebuild the L-12991 shard', () => {
        for (const h of [18_001, 100_000, SITE_ENTRY_ALTITUDE_M.country, SITE_ENTRY_ALTITUDE_M.world]) {
            const d = siteFramingReturnDecision(h);
            expect(d.action, `altitude ${h} m should reframe`).toBe('reframe');
            if (d.action === 'reframe') expect(d.reason).toBe('above-site-band');
        }
    });

    it('⛔ an UNREADABLE altitude reframes — a missing fact is not a small one', () => {
        for (const h of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
            const d = siteFramingReturnDecision(h as number | null);
            expect(d.action).toBe('reframe');
            if (d.action === 'reframe') expect(d.reason).toBe('altitude-unreadable');
        }
        // The degraded answer is EXACTLY the pre-L-13070 behaviour, so a host that cannot report
        // its altitude loses the carry and nothing else — it is never made worse than it was.
        expect(siteFramingReturnDecision(null).altitudeM).toBeNull();
    });

    it('the console line names the number that decided, on every arm', () => {
        expect(describeSiteFramingReturn(siteFramingReturnDecision(600))).toContain('600 m');
        expect(describeSiteFramingReturn(siteFramingReturnDecision(600))).toContain('CARRYING');
        expect(describeSiteFramingReturn(siteFramingReturnDecision(9e6))).toContain('REFRAMING');
        expect(describeSiteFramingReturn(siteFramingReturnDecision(null))).toMatch(/could not be read/);
        for (const h of [600, 9e6, null]) {
            expect(describeSiteFramingReturn(siteFramingReturnDecision(h))).toContain('L-13070');
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// THE ROUND TRIP, THROUGH THE REAL PORTS
// ════════════════════════════════════════════════════════════════════════════════

/** Every call the ports can make that is capable of moving the ONE camera, plus the framing. */
interface Recorder {
    readonly framings: string[];
    readonly flights: unknown[];
    readonly zoomToSite: number[];
}

/**
 * The camera as the ports can observe it: an altitude reading and an identity. Nothing here
 * simulates Cesium — `pose` is an opaque token that only a recorded flight could change, which
 * is precisely the property under test.
 */
const mountFakeHost = (opts: { altitudeM: number | null; withZoomToSite?: boolean }): Recorder => {
    const rec: Recorder = { framings: [], flights: [], zoomToSite: [] };
    window.pryzmGetSiteEntryCameraHost = () => ({
        flyToGeographic: (t) => { rec.flights.push(t); },
        setViewFraming: (f) => { rec.framings.push(f); },
        getCameraAltitudeM: () => opts.altitudeM,
    });
    if (opts.withZoomToSite !== false) {
        window.pryzmZoomToSite = () => { rec.zoomToSite.push(Date.now()); };
    }
    return rec;
};

describe('§GLOBE-KEEPS-THE-VIEW — the round trip on the ONE viewer', () => {
    beforeEach(() => {
        delete window.pryzmGetSiteEntryCameraHost;
        delete window.pryzmZoomToSite;
    });
    afterEach(() => {
        delete window.pryzmGetSiteEntryCameraHost;
        delete window.pryzmZoomToSite;
    });

    it('⭐ THE FOUNDER\'S DEFECT: 3D Globe swaps the surface and issues NO flight', () => {
        const rec = mountFakeHost({ altitudeM: 600 });          // his parcel range
        defaultSiteViewCameraPorts().frameGlobe();
        expect(rec.framings).toEqual(['world']);
        // ⭐ THIS is "precisely the same view". Not a pose compared within a tolerance — the
        // camera is never addressed, so there is nothing for a tolerance to be about.
        expect(rec.flights).toEqual([]);
        expect(rec.zoomToSite).toEqual([]);
    });

    it('⭐ SITE → GLOBE → SITE: the camera is never touched in EITHER direction', () => {
        const rec = mountFakeHost({ altitudeM: 600 });
        const ports = defaultSiteViewCameraPorts();
        ports.frameGlobe();
        ports.frameSite();
        // Both surfaces were declared, in order…
        expect(rec.framings).toEqual(['world', 'site']);
        // …and the round trip moved the camera zero times, so it ends on the state it started
        // on by construction rather than by comparison.
        expect(rec.flights).toEqual([]);
        expect(rec.zoomToSite).toEqual([]);
    });

    it('the trip is idempotent and stays camera-free however many times it is made', () => {
        const rec = mountFakeHost({ altitudeM: 1_500 });
        const ports = defaultSiteViewCameraPorts();
        for (let i = 0; i < 5; i++) { ports.frameGlobe(); ports.frameSite(); }
        expect(rec.framings).toHaveLength(10);
        expect(rec.flights).toEqual([]);
        expect(rec.zoomToSite).toEqual([]);
    });

    it('⛔ RETURNING FROM WORLD RANGE REFRAMES — the shard is not rebuilt in the mirror', () => {
        // The user pressed 3D Globe at his parcel, then zoomed the mouse wheel out to space.
        // Carrying THAT camera back into `3D Site` would attach a city-bounded terrain tileset
        // under a whole-Earth frame: L-12991's beige shard, arrived at from the other side.
        const rec = mountFakeHost({ altitudeM: SITE_ENTRY_ALTITUDE_M.world });
        defaultSiteViewCameraPorts().frameSite();
        expect(rec.framings).toEqual(['site']);
        expect(rec.zoomToSite).toHaveLength(1);                 // the ONE declared reframe action
        expect(rec.flights).toEqual([]);                        // …and never a second target here
    });

    it('a host that cannot report its altitude reframes — never a silent wrong carry', () => {
        const rec = mountFakeHost({ altitudeM: null });
        defaultSiteViewCameraPorts().frameSite();
        expect(rec.framings).toEqual(['site']);
        expect(rec.zoomToSite).toHaveLength(1);
    });

    it('a host with NO altitude member at all still returns — the reading is OPTIONAL', () => {
        // §L-6806's lesson: a declaration that drifts from the implementation is silent. A host
        // predating `getCameraAltitudeM` must degrade to the old always-reframe, not throw.
        const rec: Recorder = { framings: [], flights: [], zoomToSite: [] };
        window.pryzmGetSiteEntryCameraHost = () => ({
            flyToGeographic: (t) => { rec.flights.push(t); },
            setViewFraming: (f) => { rec.framings.push(f); },
        });
        window.pryzmZoomToSite = () => { rec.zoomToSite.push(0); };
        defaultSiteViewCameraPorts().frameSite();
        expect(rec.framings).toEqual(['site']);
        expect(rec.zoomToSite).toHaveLength(1);
    });

    it('NO globe mounted: both rows refuse out loud and move nothing (C84 EI-6)', () => {
        // First entry with no Cesium viewport at all. The answer is a warning, not a throw and
        // not a fabricated camera — and `frameSite` now needs the same guard `frameGlobe` had,
        // because it reads the host twice (framing + altitude).
        window.pryzmZoomToSite = () => { throw new Error('must not be reached without a host'); };
        const ports = defaultSiteViewCameraPorts();
        expect(() => ports.frameGlobe()).not.toThrow();
        expect(() => ports.frameSite()).not.toThrow();
    });

    it('canFrameSite still requires the ONE declared reframe action', () => {
        mountFakeHost({ altitudeM: 600, withZoomToSite: false });
        expect(defaultSiteViewCameraPorts().canFrameSite?.()).toBe(false);
        mountFakeHost({ altitudeM: 600 });
        expect(defaultSiteViewCameraPorts().canFrameSite?.()).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// THE RULINGS THIS MUST NOT BREAK
// ════════════════════════════════════════════════════════════════════════════════

describe('§GLOBE-KEEPS-THE-VIEW — the constraints it is built inside', () => {
    const SHELL = 'apps/editor/src/engine/views/SiteAuthoringPaneShell.ts';

    it('⛔ STR §26.1.1 / §L-412 — still ONE viewer, resolved not constructed', () => {
        const src = read(SHELL);
        // The ports reach the ONE registered viewport and never build one.
        expect(src).toContain('window.pryzmGetSiteEntryCameraHost');
        expect(src).not.toMatch(/new CesiumViewport/);
    });

    it('⛔ L-12991 SURVIVES — the surface swap is still declared on BOTH rows', () => {
        // Deleting the flight must not have deleted the fix that shipped one day earlier: the
        // surface is what now distinguishes the two rows, so it is more load-bearing, not less.
        const src = read(SHELL);
        expect(src).toContain("setViewFraming('world')");
        expect(src).toContain("setViewFraming('site')");
    });

    it('⛔ the framing is still DECLARED, never inferred from the altitude', () => {
        // `CesiumViewport.viewFraming`'s field doc rules that out — a height read mid-`flyTo`
        // would make the surface flicker through the flight. The altitude reading added by
        // L-13070 decides whether a click is FOLLOWED by a flight; it never picks a surface.
        const vp = read('apps/editor/src/ui/geospatial/CesiumViewport.ts');
        expect(vp).toMatch(/getCameraAltitudeM\(\): number \| null/);
        // The one consumer is the pane picker's port, not this class.
        expect(vp).not.toMatch(/cesiumSurfaceKind\(\{[^}]*getCameraAltitudeM/);
    });

    it('worldFramingTarget() is retained and still declares the world framing', () => {
        // It is UNWIRED from the `3D Globe` row (that is the fix), not deleted — a future
        // explicit "take me out to the planet" affordance is this function and nothing else.
        const t = worldFramingTarget();
        expect(t.altitudeM).toBe(SITE_ENTRY_ALTITUDE_M.world);
        expect(t.stage).toBe('world');
    });
});
