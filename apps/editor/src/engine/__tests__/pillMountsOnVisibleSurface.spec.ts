/**
 * §PILL-MOUNTS-ON-THE-VISIBLE-SURFACE (L-13265) + §ONE-SWITCHER-ON-EVERY-VIEW PART 2 (L-13266)
 * founder 2026-09-08 · C59 §1.5 / invariant 11
 *
 * THE ASK:
 *   *"PLEASE CHECK ALSO THE LEGACY PANEL ON 3D SITE VIEW AFTER SELECTING FROM PRYZM VIEW -
 *    MAYBE YOU HAVE FIXED THIS ALREADY."*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ HE HAD NOT — AND CHECKING SURFACED A REGRESSION L-13261 HAD JUST SHIPPED
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * TWO defects, both in this session's own work:
 *
 *   1. THERE WERE **TWO** LEGACY BARS, NOT ONE. L-13261 retired the RESULT bar's three
 *      segments (`3D + plan · 3D globe · 3D Site`) and recorded audit row 3 as closed. The
 *      FORMA sub-bar carries three MORE (`2D Map · Plan · 3D`). The audit counted HOSTS OF
 *      `viewSegmentSwitcher`; these two bars are hand-built and were never in that population,
 *      so "four hosts of one shape" was measured against the wrong set. ⭐ A census cannot
 *      report a thing missing that it never enumerated.
 *
 *   2. THE REPLACEMENT PILL WAS INVISIBLE ON THE VERY VIEWS L-13261 RETIRED THE SEGMENTS ON.
 *      `ensurePryzmViewPill()` mounted into `#container` (the BIM canvas). On a site/globe
 *      view Cesium's container is raised to `CESIUM_Z = 15` ABOVE it, and a child's z-index
 *      resolves INSIDE its parent's stacking context — so the pill sat underneath Cesium.
 *      Segments down, replacement unseeable: the L-942 shape, arriving inside the lane whose
 *      own commit message claimed to avoid it. A COUNT invariant would have read "1 switcher"
 *      while the user had none.
 *
 *   ARM A — the host is a READING of what is on top, and it re-mounts when that changes.
 *   ARM B — both bars lose their view segments; every non-view control on them survives.
 *   ARM C — the replacement goes up in the same breath as each retirement.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../..');
const GIS = readFileSync(resolve(ROOT, 'apps/editor/src/ui/layout/GISAreaLayout.ts'), 'utf8');

describe('§PILL-MOUNTS-ON-THE-VISIBLE-SURFACE — ARM A · the host is read, not assumed', () => {
    it('⭐ the Cesium container is preferred when it is on screen', () => {
        expect(GIS).toContain('pryzmViewPillHost');
        expect(GIS).toContain("getElementById('cesium-viewport-container')");
    });

    it('⛔ it MEASURES visibility rather than trusting the `_gisActive` flag', () => {
        // The flag and the DOM disagree during a transition, and the pill must follow the
        // pixels the user is looking at, not the phase we believe we are in.
        // ⚠ COMMENTS STRIPPED, AND THE THIRD TIME THIS EXACT TRAP FIRED TODAY. Both the doc
        // block AND an inline note explain WHY the function does not read `_gisActive` — so any
        // window over the source matches the very word the arm forbids. Documentation is not
        // code; a prose ban is the wrong instrument. Strip the comments and read what RUNS.
        const at = GIS.indexOf('const pryzmViewPillHost = (');
        const body = GIS.slice(at, at + 700)
            .split(String.fromCharCode(10))
            .filter((l) => !l.trim().startsWith('//'))
            .join(' ');
        expect(body).toMatch(/display === 'none'|offsetParent === null/);
        expect(body).not.toContain('_gisActive');
    });

    it('⭐ a host CHANGE re-mounts — `isConnected` alone is not enough', () => {
        // The regression in one line: a pill still attached to `#container` while Cesium owns
        // the screen is CONNECTED and INVISIBLE, so an `isConnected` early-out preserves it.
        const at = GIS.indexOf('const ensurePryzmViewPill');
        const body = GIS.slice(at, at + 900);
        expect(body).toContain('pryzmViewPillHostEl === viewport');
    });

    it('and the remembered host is cleared on removal', () => {
        const at = GIS.indexOf('const removePryzmViewPill');
        expect(GIS.slice(at, at + 200)).toContain('pryzmViewPillHostEl = null');
    });
});

describe('§ONE-SWITCHER-ON-EVERY-VIEW PART 2 — ARM B · both bars, view segments only', () => {
    it('⛔ neither legacy bar appends a VIEW segment any more', () => {
        for (const gone of [
            'bar.appendChild(btn2dRef)',        // result bar — 3D + plan
            'bar.appendChild(btn3dRef)',        // result bar — 3D globe
            'bar.appendChild(formaBtn)',        // result bar — 3D Site
            'bar.appendChild(formaMap2dBtn)',   // forma bar — 2D Map
            'bar.appendChild(formaPlanBtn)',    // forma bar — Plan
            'bar.appendChild(formaThreeBtn)',   // forma bar — 3D
        ]) {
            expect(GIS.includes(gone), `${gone} must not be appended`).toBe(false);
        }
    });

    it('⭐ every NON-view control on those bars SURVIVES — sorted by subject, not adjacency', () => {
        // Deleting a working control because it sits beside a redundant one is the defect the
        // classification table exists to prevent. These act on the Cesium surface, which IS on
        // screen here, so they keep their subject and they keep their place.
        for (const kept of [
            'bar.appendChild(fidelityWrap)',   // Real / Massing (globe)
            'bar.appendChild(zoomToSiteBtn)',  // Zoom to Site (globe)
            'bar.appendChild(tourBtn)',        // Fly tour
            'bar.appendChild(zoomBtn)',        // Zoom to Site (forma)
            'bar.appendChild(analysisBtn)',    // Site Analysis
            'bar.appendChild(realBtn)',        // Real (forma)
            'bar.appendChild(massingBtn)',     // Massing (forma)
            'bar.appendChild(floorSel)',       // All floors
        ]) {
            expect(GIS.includes(kept), `${kept} must still be appended`).toBe(true);
        }
    });

    it('the refs are still BUILT, so the paint path is untouched', () => {
        // `refreshResultButtons` / `refreshFormaViewButtons` paint from these; deleting the
        // builders would turn a retirement into a refactor of the paint path.
        for (const built of ['btn2dRef = mkBtn', 'formaMap2dBtn = mkBtn', 'formaThreeBtn = mkBtn']) {
            expect(GIS).toContain(built);
        }
    });
});

describe('§ONE-SWITCHER-ON-EVERY-VIEW PART 2 — ARM C · the replacement goes up with it', () => {
    it('⭐ BOTH bar builders call `ensurePryzmViewPill()` where the segments came down', () => {
        // ⛔ SWITCHER COUNT == VISIBLE VIEW-REGION COUNT, in both directions. A bar that drops
        // its segments without raising the pill leaves the region with no way to change view —
        // which is precisely what shipped in L-13261 on the globe.
        const calls = [...GIS.matchAll(/ensurePryzmViewPill\(\)/g)];
        expect(calls.length).toBeGreaterThanOrEqual(3); // retirement + result bar + forma bar
    });

    it('the regression is recorded where the code is, not only in a report', () => {
        expect(GIS).toContain('§PILL-MOUNTS-ON-THE-VISIBLE-SURFACE');
        expect(GIS).toMatch(/CESIUM_Z/);
        expect(GIS).toMatch(/THERE WERE \*\*TWO\*\* LEGACY BARS|TWO\*\* LEGACY BARS/);
    });
});
