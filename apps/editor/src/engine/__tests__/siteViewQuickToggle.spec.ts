/**
 * §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117) — the top-centre 3D globe / 3D site control.
 *
 * Founder 2026-08-21: *"we don't really need this 3D Site button on the top-right corner
 * (almost hidden) — at this stage the user should be able to just go to 3D globe, so a
 * button 3D globe / 3D site in the middle top would be beneficial."*
 *
 * ⛔ THE BRIEF'S HARD CONSTRAINT, AND IT GETS ITS OWN ARM: *"Do not delete that menu —
 * it carries real refusals with reasons."* Every other arm here would pass just as
 * happily over an implementation that ripped the pane picker out.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    describeSiteViewQuickToggle,
    segmentClickIntents,
} from '../views/siteViewQuickToggleModel';
import { LEFT_PANE, RIGHT_PANE, type PaneLayout } from '../views/paneViewModel';

const REPO = resolve(__dirname, '../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

/**
 * Source with comment lines removed.
 *
 * ⚠ NOT optional, and this lane learned it FOUR TIMES in one session. Every
 * source-text arm below asserts the ABSENCE of a pattern — and a well-written
 * header EXPLAINS the absence by naming the very pattern it forbids
 * ("this file must not touch `MultiPaneController`", "never `left: 50%`"). So the
 * better the comment, the more certainly the raw-text arm fails. `codeOnly` is
 * what makes an absence arm mean what it says. `shellFloatBudget.spec.ts` carries
 * the same note, independently arrived at.
 */
function codeOnly(src: string): string {
    return src
        .split(String.fromCharCode(10))
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join(String.fromCharCode(10));
}

/** The founder's default: 2D map LEFT, 3D Site RIGHT. */
const SPLIT: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' };
const EMPTY: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: null };
const SOLO_MAP: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: null };

const model = (layout: PaneLayout, canRestoreSplit = false) =>
    describeSiteViewQuickToggle({ layout, canRestoreSplit });

const seg = (layout: PaneLayout, vt: string, canRestoreSplit = false) =>
    model(layout, canRestoreSplit).segments.find((s) => s.viewType === vt)!;

describe('§SITE-VIEW-QUICK-TOGGLE — the segment set is DERIVED from the registry', () => {
    it('offers exactly the SITE views — the globe and the 2D map', () => {
        const vts = model(SPLIT).segments.map((s) => s.viewType).sort();
        expect(vts).toEqual(['site-3d', 'site-map-2d']);
    });

    it('⛔ does NOT promote the BIM projections — those are what the pane menu is for', () => {
        const vts = model(SPLIT).segments.map((s) => s.viewType);
        for (const bim of ['bim-3d', 'bim-plan-2d', 'bim-elevation-2d', 'bim-section-2d']) {
            expect(vts).not.toContain(bim);
        }
    });

    it('labels come from the registry, not from this bar', () => {
        // "3D Site" is the registry's own label — a second spelling here would be a
        // second name for one view.
        expect(seg(SPLIT, 'site-3d').label).toBe('3D Site');
        expect(seg(SPLIT, 'site-map-2d').label).toBeTruthy();
    });

    it('the segment set is not hand-listed in the module', () => {
        // A literal ['site-map-2d','site-3d'] would be a census beside the registry,
        // and this repo's own finding is that censuses rot (C01 §6 rule 6).
        const code = codeOnly(read('apps/editor/src/engine/views/siteViewQuickToggleModel.ts'));
        expect(code).not.toMatch(/\[\s*'site-map-2d'\s*,\s*'site-3d'\s*\]/);
        expect(code).toContain('SITE_RENDERER_KINDS');
    });
});

describe('§SITE-VIEW-QUICK-TOGGLE — active, soloed and available are THREE facts', () => {
    it('in the default split BOTH are active and NEITHER is soloed', () => {
        expect(seg(SPLIT, 'site-3d').active).toBe(true);
        expect(seg(SPLIT, 'site-map-2d').active).toBe(true);
        expect(seg(SPLIT, 'site-3d').soloed).toBe(false);
        expect(seg(SPLIT, 'site-map-2d').soloed).toBe(false);
    });

    it('"visible" and "the only thing on screen" do not render as one state', () => {
        // Two different facts; the stylesheet gives them two different treatments
        // (--active outline vs --solo fill) because collapsing them would tell the
        // user the globe is full screen when it is sharing with the map.
        const m = seg(SOLO_MAP, 'site-map-2d');
        expect(m.active).toBe(true);
        expect(m.soloed).toBe(true);
        expect(seg(SOLO_MAP, 'site-3d').active).toBe(false);
    });

    it('a view with no registered mounter is REFUSED WITH A REASON, not hidden', () => {
        const m = describeSiteViewQuickToggle({
            layout: EMPTY,
            canRestoreSplit: false,
            mountableKinds: new Set(['maplibre'] as const), // no Cesium here
        });
        const globe = m.segments.find((s) => s.viewType === 'site-3d')!;
        expect(globe.enabled).toBe(false);
        expect(globe.reason).toBeTruthy();
        expect(globe.reason).toContain('cesium');
        // It is still OFFERED. A silently missing control is the answer C59 Phase 2
        // already ruled out.
        expect(m.segments.map((s) => s.viewType)).toContain('site-3d');
    });

    it('⛔ every disabled segment carries a reason — no bare grey', () => {
        for (const kinds of [new Set([] as never[]), new Set(['maplibre'] as const)]) {
            const m = describeSiteViewQuickToggle({
                layout: EMPTY, canRestoreSplit: false, mountableKinds: kinds as never,
            });
            for (const s of m.segments) {
                if (!s.enabled) expect(s.reason, `${s.viewType} greyed with no reason`).toBeTruthy();
            }
        }
    });
});

describe('§SITE-VIEW-QUICK-TOGGLE — one click reaches the globe, and there is a way back', () => {
    it('⭐ clicking 3D Site while split SOLOs it — "just go to 3D globe"', () => {
        const intents = segmentClickIntents(seg(SPLIT, 'site-3d'), SPLIT);
        // It is already in the right pane, so no re-assign: re-mounting a heavyweight
        // Cesium singleton to put it where it already is would be churn.
        expect(intents).toEqual([{ type: 'view.pane.solo', paneId: RIGHT_PANE }]);
    });

    it('clicking a view that is nowhere ASSIGNS then SOLOs, in that order', () => {
        const intents = segmentClickIntents(seg(EMPTY, 'site-3d'), EMPTY);
        expect(intents).toHaveLength(2);
        expect(intents[0]).toEqual({
            type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'site-3d',
        });
        expect(intents[1]).toEqual({ type: 'view.pane.solo', paneId: LEFT_PANE });
    });

    it('clicking the view that is ALREADY alone on screen does nothing', () => {
        expect(segmentClickIntents(seg(SOLO_MAP, 'site-map-2d'), SOLO_MAP)).toEqual([]);
    });

    it('a refused segment dispatches NOTHING', () => {
        const m = describeSiteViewQuickToggle({
            layout: EMPTY, canRestoreSplit: false, mountableKinds: new Set(['maplibre'] as const),
        });
        const globe = m.segments.find((s) => s.viewType === 'site-3d')!;
        expect(segmentClickIntents(globe, EMPTY)).toEqual([]);
    });

    it('⭐ the route BACK exists exactly when it can work', () => {
        // A control that takes the user full screen with no way back is the L-942
        // shape: a branch whose escape hatch was never built.
        expect(model(SOLO_MAP, true).split.enabled).toBe(true);
        // …and is refused WITH A REASON when it cannot.
        expect(model(SOLO_MAP, false).split.enabled).toBe(false);
        expect(model(SOLO_MAP, false).split.reason).toBeTruthy();
        expect(model(SPLIT, true).split.enabled).toBe(false);
        expect(model(SPLIT, true).split.reason).toContain('Already split');
    });
});

describe('§SITE-VIEW-QUICK-TOGGLE — it ADDS a route and removes none', () => {
    const SHELL = 'apps/editor/src/engine/views/SiteAuthoringPaneShell.ts';

    it('⛔ THE PANE MENU SURVIVES — both per-pane pickers are still mounted', () => {
        // The brief: "Do not delete that menu — it carries real refusals with reasons."
        const src = read(SHELL);
        expect(src).toContain('mountPaneViewPicker');
        expect(src).toMatch(/paneId: LEFT_PANE[\s\S]{0,80}corner: 'top-left'/);
        expect(src).toMatch(/paneId: RIGHT_PANE[\s\S]{0,80}corner: 'top-right'/);
        // …and the picker component still renders its disabled-with-reason rows.
        expect(read('apps/editor/src/engine/views/PaneViewPicker.ts')).toContain('reasonEl');
    });

    it('the toggle shares the ONE store — no second write path (C59 §2 invariant 3)', () => {
        const src = read(SHELL);
        expect(src).toMatch(/mountSiteViewQuickToggle\(\{\s*store,/);
        // The DOM layer must not reach a renderer or the controller directly.
        const dom = codeOnly(read('apps/editor/src/engine/views/SiteViewQuickToggle.ts'));
        expect(dom).not.toContain('MultiPaneController');
        expect(dom).not.toMatch(/applyLayout\(/);
        expect(dom).toContain('store.dispatch(');
    });

    it('it is torn down with the shell', () => {
        expect(read(SHELL)).toContain('quickToggle?.dispose()');
    });

    it('⛔ it is BUDGETED chrome, not a new absolutely-positioned float (C06 §15)', () => {
        // The brief: "enrol your control in the budget rather than floating a new
        // absolutely-positioned element."
        const dom = codeOnly(read('apps/editor/src/engine/views/SiteViewQuickToggle.ts'));
        // No inline positioning — an inline `left` is invisible to the budget's arm.
        expect(dom).not.toMatch(/position:\s*['"]absolute['"]/);
        expect(dom).not.toMatch(/style\.left\s*=/);
        const css = codeOnly(read('apps/editor/src/ui/styles/panels/siteViewQuickToggle.ts'));
        expect(css).toContain('left: var(--shell-canvas-cx');
        expect(css).not.toMatch(/left:\s*50%/);
        // It clears the published band rather than a hand-picked number.
        expect(css).toContain('var(--shell-topbar-h');
    });

    it('⛔ the sheet is actually INJECTED — an unregistered sheet renders nothing', () => {
        // "Authored but unwired" is this repo's most-repeated defect. A stylesheet
        // that is not concatenated into the theme is a file, not a style.
        const theme = read('apps/editor/src/ui/styles/AppTheme.ts');
        expect(theme).toContain("from './panels/siteViewQuickToggle'");
        expect(theme).toContain('+ SITE_VIEW_QUICK_TOGGLE_STYLES');
    });
});

describe('§MODE-STRIP-CLEARS-BAND (L-5120) — the mode strip moved UP, derived', () => {
    it('.wdh-bar clears the published band instead of a hand-picked 68px', () => {
        const css = codeOnly(read('apps/editor/src/ui/styles/panels/drawingHuds.ts'));
        const i = css.indexOf('.wdh-bar {');
        const body = css.slice(i, css.indexOf('}', i));
        expect(body).toContain('var(--shell-topbar-h');
        expect(body, 'the hand-picked top is back').not.toMatch(/top:\s*68px/);
    });

    it('the mode strip still outranks the selection toolbar where they meet', () => {
        // They share y-space now (56..86 vs 50..). z-order is what makes that safe,
        // and it is asserted rather than assumed.
        const huds = codeOnly(read('apps/editor/src/ui/styles/panels/drawingHuds.ts'));
        const ceb = codeOnly(read('apps/editor/src/ui/styles/panels/platform-shell/contextualEditBar.ts'));
        const zOf = (src: string, sel: string): number => {
            const i = src.indexOf(`${sel} {`);
            const body = src.slice(i, src.indexOf('}', i));
            return Number(/z-index:\s*(\d+)/.exec(body)?.[1] ?? '0');
        };
        expect(zOf(huds, '.wdh-bar')).toBeGreaterThan(zOf(ceb, '.ceb-bar'));
    });
});
