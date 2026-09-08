/**
 * §ONE-REGION-SWITCHER (founder 2026-09-08 · L-13257 · C59 §1.4 / §6)
 *
 * THE ASK, VERBATIM:
 *   *"the way the user can change a view should always be robust and the same - drop down on
 *    the middle of the view already implemented but not always implemented - on pryzm view
 *    (check first image) we still have the legacy style ... I want this absolutely
 *    standardized and really architecturally sound."*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ WHY THIS SUITE EXISTS WHEN `oneViewSwitcher.spec.ts` ALREADY PASSES
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * That suite measures the COUNT — one switcher per visible view region — and it was green
 * throughout the period the founder was photographing the divergence. Its ARM K blesses the
 * plan pane's native `<select>` BY NAME. **A count invariant cannot see a form divergence**,
 * and that is the whole reason this file exists: it measures the SHAPE, the SET and the
 * PLACEMENT, which are the three axes the screenshots are actually about.
 *
 *   ARM A — the census is COMPLETE and COHERENT (`viewRegionSwitcherCoverage()` clean), and
 *     every declared phase has at least one region, so a phase cannot lose its switcher.
 *   ARM B — ⭐ EVERY REGION OFFERS THE FOUNDER'S SIX. This is the axis on which the two
 *     option tables disagreed: the globe and the satellite were reachable from a PRYZM view
 *     and not from a site pane.
 *   ARM C — ⭐ ONE SHAPE. No region may carry a native `<select>` or a segmented bar for view
 *     switching. The type has no member for either, so this arm proves the REGISTRY agrees
 *     with the type rather than restating it — it reads the shipped source.
 *   ARM D — the PLACEMENT rule is pure and correct, including the two cases that produced
 *     the founder's screenshot: an overlapping centred bar pushes the pill down; a zero-area
 *     box does NOT.
 *   ARM E — ⭐ THE SOURCE ACTUALLY CHANGED. §COMMITTED-IS-NOT-REACHABLE: a registry saying
 *     "the plan pane carries a pill" while `SplitViewManager` still appends a `<select>` to
 *     its header would be exactly the authored-but-unwired shape this repo keeps re-learning.
 *     These arms read the two shipped files.
 *   ARM F — the honesty survives: a whole-screen region still PRINTS why choosing a view
 *     leaves the layout, and a pane region does not print a warning that would be false.
 *
 * ⚠ ARMS C/E ARE SOURCE-TEXT ARMS. `SplitViewManager._buildDOM` is a private method on a
 * class whose construction needs a THREE scene, an OBC world and a live canvas; mounting it
 * headless is not what this lane is for. They measure that the wiring is present, not that a
 * pixel moved — and they say so rather than implying more.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    PRYZM_CANVAS_LIMIT_NOTE,
    PRYZM_PLAN_PANE_LIMIT_NOTE,
    REGION_OFFERS,
    SWITCHER_CLEARANCE_PX,
    SWITCHER_DEFAULT_TOP_PX,
    VIEW_REGION_REGISTRY,
    listViewRegions,
    regionsVisibleIn,
    resolveSwitcherTopPx,
    sharesItsPhase,
    viewRegionSwitcherCoverage,
    type Box,
    type ViewRegionId,
} from '../views/viewRegionSwitcher';
import { viewPanelOptions } from '../views/viewPanelOptions';
import type { ViewSwitcherPhase } from '../views/legacyViewSwitcherRetirement';

const ROOT = resolve(__dirname, '../../../../..');
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8');

const SVM = read('apps/editor/src/engine/views/SplitViewManager.ts');
const GIS = read('apps/editor/src/ui/layout/GISAreaLayout.ts');
const REG = read('apps/editor/src/engine/views/viewRegionSwitcher.ts');

const PHASES: readonly ViewSwitcherPhase[] =
    ['site-authoring-split', 'site-whole-screen', 'pryzm-view'];

describe('§ONE-REGION-SWITCHER — ARM A · the census is complete and coherent', () => {
    it('reports NO findings', () => {
        const findings = viewRegionSwitcherCoverage();
        expect(
            findings.map((f) => `${f.regionId}: ${f.kind} — ${f.detail}`).join('\n'),
        ).toBe('');
        expect(findings).toHaveLength(0);
    });

    it('declares every region the app actually shows', () => {
        // The five rectangles the audit found. A SIXTH appearing without a row here is the
        // failure mode this registry exists to prevent, so the set is pinned, not the count.
        expect(new Set(listViewRegions())).toEqual(new Set<ViewRegionId>([
            'site-pane-left', 'site-pane-right', 'site-whole-screen',
            'pryzm-canvas', 'pryzm-plan-pane',
        ]));
    });

    it('every phase has at least one region — a phase cannot lose its switcher silently', () => {
        for (const phase of PHASES) {
            expect(regionsVisibleIn(phase).length, `phase ${phase} has no region`)
                .toBeGreaterThan(0);
        }
    });

    it('the PRYZM phase has BOTH halves of the split, which is the founder\'s screenshot', () => {
        const ids = regionsVisibleIn('pryzm-view').map((r) => r.regionId);
        expect(ids).toContain('pryzm-canvas');    // the model half
        expect(ids).toContain('pryzm-plan-pane'); // the plan half — the "legacy style" one
    });
});

describe('§ONE-REGION-SWITCHER — ARM B · every region offers the founder\'s six', () => {
    it('no region offers a smaller set', () => {
        for (const id of listViewRegions()) {
            expect(REGION_OFFERS.theSix(VIEW_REGION_REGISTRY[id]), `${id} offers fewer`)
                .toBe(true);
        }
    });

    it('⭐ the six INCLUDE the globe and the satellite — the two the pane table omitted', () => {
        // The measured divergence: `describePaneViewOptions` derives from VIEW_TYPE_REGISTRY,
        // which models neither the globe (a Cesium camera altitude) nor the satellite (a
        // MapLibre style). `viewPanelOptions()` is the definition every region now offers.
        const ids = viewPanelOptions().map((o) => o.id);
        expect(ids).toContain('site-globe');
        expect(ids).toContain('site-satellite');
        expect(ids).toHaveLength(6);
    });
});

describe('§ONE-REGION-SWITCHER — ARM C · one shape, and no region may pick another', () => {
    it('every region carries a pill', () => {
        for (const id of listViewRegions()) {
            expect(['pill', 'pane-picker']).toContain(VIEW_REGION_REGISTRY[id].shape);
        }
    });

    it('⛔ the shape type has no `select` and no `segmented-bar` member', () => {
        // Proving the TYPE, not just the data: a future region cannot declare a native
        // control and still typecheck. Source-read because a type is erased at runtime.
        const shapeDecl = REG.slice(REG.indexOf('export type SwitcherShape'));
        const body = shapeDecl.slice(0, shapeDecl.indexOf(';'));
        expect(body).not.toMatch(/'select'/);
        expect(body).not.toMatch(/'segmented-bar'/);
        expect(body).toMatch(/'pill'/);
    });
});

describe('§ONE-REGION-SWITCHER — ARM D · placement resolves collisions, never guesses', () => {
    const region: Box = { top: 0, bottom: 900, left: 0, right: 1000 };

    it('nothing in the way ⇒ the default band', () => {
        expect(resolveSwitcherTopPx(region, [])).toBe(SWITCHER_DEFAULT_TOP_PX);
    });

    it('⭐ a centred bar OVER the band pushes the pill below it — the founder\'s screenshot', () => {
        // `.wmb-toplevel-wrapper`: top 6, ~34 tall, centred. `#container` starts at y=0.
        const modeBar: Box = { top: 6, bottom: 40, left: 380, right: 620 };
        expect(resolveSwitcherTopPx(region, [modeBar])).toBe(40 + SWITCHER_CLEARANCE_PX);
    });

    it('⛔ a ZERO-AREA box is an absence, not an obstacle at the origin', () => {
        // Every rect in happy-dom is all-zero, and so is a `display:none` node's. Treating
        // that as an obstacle would displace every pill in every test and under hidden
        // chrome — a fake obstacle producing a real displacement.
        const zero: Box = { top: 0, bottom: 0, left: 0, right: 0 };
        expect(resolveSwitcherTopPx(region, [zero])).toBe(SWITCHER_DEFAULT_TOP_PX);
    });

    it('chrome that does not overlap HORIZONTALLY cannot occlude a centred pill', () => {
        // The platform toolbar sits top-RIGHT; a pane whose box ends before it is clear.
        const narrow: Box = { top: 0, bottom: 900, left: 0, right: 300 };
        const topRight: Box = { top: 6, bottom: 40, left: 700, right: 990 };
        expect(resolveSwitcherTopPx(narrow, [topRight])).toBe(SWITCHER_DEFAULT_TOP_PX);
    });

    it('chrome far BELOW the band is beside the view, not over the pill', () => {
        const lowBar: Box = { top: 300, bottom: 340, left: 0, right: 1000 };
        expect(resolveSwitcherTopPx(region, [lowBar])).toBe(SWITCHER_DEFAULT_TOP_PX);
    });

    it('the region\'s OWN top is the origin — a pane that starts low is not pushed twice', () => {
        // C59 §2.10.3 clause 4: chrome is positioned relative to ITS OWN region. A pane
        // beginning at y=120 under a bar ending at y=40 has nothing in its way.
        const lowPane: Box = { top: 120, bottom: 900, left: 0, right: 1000 };
        const modeBar: Box = { top: 6, bottom: 40, left: 380, right: 620 };
        expect(resolveSwitcherTopPx(lowPane, [modeBar])).toBe(SWITCHER_DEFAULT_TOP_PX);
    });

    it('an in-flow header inside the pane pushes the pill below it', () => {
        // The plan pane's `.svp-header` is 36 px and in flow at the pane's top edge.
        const pane: Box = { top: 0, bottom: 900, left: 600, right: 1000 };
        const header: Box = { top: 0, bottom: 36, left: 600, right: 1000 };
        expect(resolveSwitcherTopPx(pane, [header])).toBe(36 + SWITCHER_CLEARANCE_PX);
    });
});

describe('§ONE-REGION-SWITCHER — ARM E · the wiring is REAL, not only declared', () => {
    it('⭐ the plan pane MOUNTS the pill', () => {
        expect(SVM).toContain('mountViewSwitcherPill');
        expect(SVM).toContain('_mountRegionPill');
        expect(SVM).toContain("idSuffix: 'svp'");
    });

    it('⭐ the plan pane\'s popup carries BOTH groups — the six AND the view definitions', () => {
        expect(SVM).toContain('mountViewSegmentSwitcher'); // the founder's six
        expect(SVM).toContain('svp-region-pill-definitions'); // this pane's own granularity
    });

    it('⛔ the `<select>` is NO LONGER appended to the header title group', () => {
        // The exact line the founder photographed. It is re-parented into the pill, so this
        // append must not come back — that would be two controls again.
        expect(SVM).not.toContain('titleGroup.appendChild(viewSel)');
    });

    it('the select ELEMENT is reused, not rebuilt as a second list', () => {
        // Rebuilding the view-definition list as pill rows would be a second definition of
        // the same list, which is the defect this lane removes, arriving inside its own fix.
        expect(SVM).toContain('_buildViewSelectOptions');
        expect(SVM).toContain('group.appendChild(this._viewSelect)');
    });

    it('the pill is disposed with the pane, and BEFORE the select reference is dropped', () => {
        const dispose = SVM.indexOf('this._regionPill?.dispose()');
        const clear = SVM.indexOf('this._viewSelect     = null;', dispose);
        expect(dispose).toBeGreaterThan(-1);
        expect(clear).toBeGreaterThan(dispose);
    });

    it('⭐ the BIM canvas pill is placed by MEASUREMENT, not by a constant', () => {
        expect(GIS).toContain('resolveSwitcherTopPx');
        expect(GIS).toContain('pryzmPillTopPx');
        expect(GIS).toContain('.wmb-toplevel-wrapper');
        // ⛔ The failure this replaced: `topPx` absent ⇒ the pill defaulted to 10 and sat
        // underneath the mode bar. A hardcoded number here would rot with the bar's height.
        expect(GIS).toContain('topPx: pryzmPillTopPx(viewport)');
        expect(GIS).not.toMatch(/topPx:\s*\d+/);
    });

    it('the superseded ARM K decision is recorded where the control is', () => {
        // §CONFIDENT-REGISTER-ROWS — the previous decision was reasoned and wrong on one
        // axis. It is kept, marked superseded, with the axis named.
        expect(SVM).toContain('§ONE-REGION-SWITCHER');
        expect(SVM).toMatch(/SUPERSEDED 2026-09-08/);
        expect(SVM).toMatch(/COUNT INVARIANT CANNOT SEE A FORM DIVERGENCE/i);
    });
});

describe('§ONE-REGION-SWITCHER — ARM F · the limits are printed, not hidden', () => {
    it('every whole-screen region explains that choosing a view leaves the layout', () => {
        for (const id of listViewRegions()) {
            const r = VIEW_REGION_REGISTRY[id];
            if (r.dispatch !== 'whole-screen') continue;
            // ⭐ Only a region that SHARES its phase has a layout to lose. `site-whole-screen`
            // is already the whole screen, so a warning there would be false — and this gate
            // caught that on its first run, which is why the predicate is `sharesItsPhase`
            // rather than the dispatch alone.
            if (!sharesItsPhase(r)) { expect(r.limitNote).toBeNull(); continue; }
            expect(r.limitNote, `${id} must say why`).toBeTruthy();
            expect(r.limitNote).toMatch(/full screen/);
        }
    });

    it('a PANE region carries no limit note — it would be a false warning', () => {
        for (const id of listViewRegions()) {
            const r = VIEW_REGION_REGISTRY[id];
            if (r.dispatch === 'pane') expect(r.limitNote).toBeNull();
        }
    });

    it('the notes cite the C59 phase that causes the limit, not a vague "not yet"', () => {
        expect(PRYZM_CANVAS_LIMIT_NOTE).toMatch(/C59 Phase 3/);
        expect(PRYZM_PLAN_PANE_LIMIT_NOTE).toMatch(/C59 Phase 4/);
    });

    it('only the plan pane offers view DEFINITIONS — the per-level granularity', () => {
        const withDefs = listViewRegions()
            .filter((id) => VIEW_REGION_REGISTRY[id].offersViewDefinitions);
        expect(withDefs).toEqual(['pryzm-plan-pane']);
    });
});
