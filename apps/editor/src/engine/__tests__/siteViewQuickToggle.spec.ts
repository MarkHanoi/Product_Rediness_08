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
    globeClickIntents,
    segmentClickIntents,
    type SiteViewGlobeFraming,
} from '../views/siteViewQuickToggleModel';
import {
    LEFT_PANE,
    RIGHT_PANE,
    VIEW_TYPE_REGISTRY,
    assignViewToPane,
    validatePaneLayout,
    type PaneLayout,
    type ViewType,
    type ViewTypeDescriptor,
} from '../views/paneViewModel';
import { PaneLayoutStore } from '../views/paneLayoutStore';
import { mountSiteViewQuickToggle } from '../views/SiteViewQuickToggle';
import {
    INITIAL_SITE_ENTRY_STATE,
    SITE_ENTRY_ALTITUDE_M,
    SITE_ENTRY_PITCH_DEG,
    WORLD_HOME,
    worldFramingTarget,
} from '../views/siteEntryModel';

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

// ════════════════════════════════════════════════════════════════════════════════
// §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — founder 2026-08-22:
//   *"add in the top panel buttons **3d globe** also"*
//
// ⭐ THE FINDING THIS SUITE ENCODES: the globe was ABSENT from this bar for a
// STRUCTURAL reason, not an oversight. `segments` is derived from
// `VIEW_TYPE_REGISTRY`, so a globe segment needs a globe `ViewType` — and C60 §6.10
// forbids one, because C60 §6.5 says the globe and the 3D Site ARE the same viewer at
// different camera altitudes. The derivation could never have produced it.
// ════════════════════════════════════════════════════════════════════════════════

const globeOf = (
    layout: PaneLayout,
    extra: { globeFraming?: SiteViewGlobeFraming; canReturnToSite?: boolean } = {},
) => describeSiteViewQuickToggle({ layout, canRestoreSplit: false, ...extra }).globe;

const intentsFor = (
    layout: PaneLayout,
    extra: { globeFraming?: SiteViewGlobeFraming; canReturnToSite?: boolean } = {},
) => {
    const m = describeSiteViewQuickToggle({ layout, canRestoreSplit: false, ...extra });
    return globeClickIntents(m.globe, m.segments, layout);
};

describe('§GLOBE-QUICK-TOGGLE — the globe is an ACTION, and could not have been a segment', () => {
    it('⭐ the bar now carries a 3D Globe control', () => {
        const g = globeOf(SPLIT);
        expect(g.label).toContain('3D Globe');
        expect(g.enabled).toBe(true);
        expect(g.moveTo).toBe('world');
    });

    it('⛔ …and it is NOT a segment — the segment set is unchanged', () => {
        // If a later pass "simplifies" this into a third segment it will have had to
        // mint a globe ViewType, which C60 §6.10 forbids. This arm fails first.
        const vts = describeSiteViewQuickToggle({ layout: SPLIT, canRestoreSplit: false })
            .segments.map((s) => s.viewType).sort();
        expect(vts).toEqual(['site-3d', 'site-map-2d']);
    });

    it('⛔ NO globe ViewType was minted (C60 §6.10) — one cesium row, still', () => {
        const cesium = (Object.keys(VIEW_TYPE_REGISTRY) as ViewType[])
            .filter((vt) => VIEW_TYPE_REGISTRY[vt]!.rendererKind === 'cesium');
        expect(cesium).toEqual(['site-3d']);
    });

    it('⭐ THE MEASUREMENT that rules the rival design out (L-6802)', () => {
        // A `site-globe-3d` cesium ViewType is not merely redundant — it is REACHABLY
        // BROKEN. `assignViewToPane` vacates only the SAME view type, so a rival lands
        // beside `site-3d` and `validatePaneLayout` reports a conflict, i.e. in the
        // founder's own default split the globe button would refuse on every click.
        // Re-provable rather than asserted in a comment.
        const RIVAL = {
            ...VIEW_TYPE_REGISTRY,
            'site-globe-3d': {
                viewType: 'site-globe-3d' as ViewType, rendererKind: 'cesium',
                singleton: true, label: '3D Globe', paneHostable: true,
            } as ViewTypeDescriptor,
        } as Readonly<Record<ViewType, ViewTypeDescriptor>>;
        let l: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: null };
        l = assignViewToPane(l, RIGHT_PANE, 'site-3d', RIVAL);
        l = assignViewToPane(l, LEFT_PANE, 'site-globe-3d' as ViewType, RIVAL);
        const check = validatePaneLayout(l, RIVAL);
        expect(check.ok).toBe(false);
        expect(check.conflicts[0]).toEqual({ rendererKind: 'cesium', panes: [LEFT_PANE, RIGHT_PANE] });
    });

    it('the carrier is DERIVED by renderer kind, not hard-coded to a view id', () => {
        expect(globeOf(SPLIT).viewType).toBe('site-3d');
        const code = codeOnly(read('apps/editor/src/engine/views/siteViewQuickToggleModel.ts'));
        // The one declared fact is the RENDERER (C60 §6.5), never the view type.
        expect(code).toContain("GLOBE_RENDERER_KIND: RendererKind = 'cesium'");
        expect(code).not.toMatch(/GLOBE_VIEW_TYPE\s*[:=]/);
    });
});

describe('§GLOBE-QUICK-TOGGLE — one click reaches the globe, and the way back is the same button', () => {
    it('⭐ from the founder default split: SOLO the 3D Site, then fly to the world framing', () => {
        expect(intentsFor(SPLIT)).toEqual([
            { type: 'view.pane.solo', paneId: RIGHT_PANE },
            { type: 'view.site.frame-globe' },
        ]);
    });

    it('when the 3D Site is nowhere: ASSIGN, SOLO, then fly — camera LAST', () => {
        // Framing a pane that is not mounted yet drops the target, so the order is not
        // cosmetic.
        expect(intentsFor(EMPTY)).toEqual([
            { type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'site-3d' },
            { type: 'view.pane.solo', paneId: LEFT_PANE },
            { type: 'view.site.frame-globe' },
        ]);
    });

    it('when the 3D Site is ALREADY alone on screen: camera only, no pane churn', () => {
        const SOLO_3D: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' };
        // Delegating the pane half to `segmentClickIntents` is what buys this for free:
        // re-soloing a soloed pane, or re-assigning a heavyweight singleton into the pane
        // it already occupies, would both be churn.
        expect(intentsFor(SOLO_3D)).toEqual([{ type: 'view.site.frame-globe' }]);
        expect(segmentClickIntents(
            describeSiteViewQuickToggle({ layout: SOLO_3D, canRestoreSplit: false })
                .segments.find((s) => s.viewType === 'site-3d')!,
            SOLO_3D,
        )).toEqual([]);
    });

    it('⭐ THE RETURN PATH — the same button flips to "Back to site" and reframes', () => {
        const g = globeOf(SPLIT, { globeFraming: 'world' });
        expect(g.label).toContain('Back to site');
        expect(g.moveTo).toBe('site');
        expect(g.enabled).toBe(true);
        expect(intentsFor(SPLIT, { globeFraming: 'world' })).toEqual([
            { type: 'view.pane.solo', paneId: RIGHT_PANE },
            { type: 'view.site.frame-site' },
        ]);
    });

    it('⛔ NO ONE-WAY DOOR — with no reframe entry point the OUTBOUND click is refused', () => {
        // The gate is on the way OUT, where refusing is free, not on the way back, where
        // refusing strands the user at world altitude (the L-942 shape).
        const g = globeOf(SPLIT, { canReturnToSite: false });
        expect(g.enabled).toBe(false);
        expect(g.reason).toBeTruthy();
        expect(g.reason).toContain('no way back');
        expect(intentsFor(SPLIT, { canReturnToSite: false })).toEqual([]);
    });

    it('a refused 3D Site segment REFUSES THE GLOBE WITH ITS OWN REASON, not a new one', () => {
        const m = describeSiteViewQuickToggle({
            layout: EMPTY, canRestoreSplit: false,
            mountableKinds: new Set(['maplibre'] as const), // no Cesium here
        });
        const seg3d = m.segments.find((s) => s.viewType === 'site-3d')!;
        expect(m.globe.enabled).toBe(false);
        // INHERITED, not restated — a second copy of "why can't I open the 3D Site" is a
        // second thing that can disagree with the first.
        expect(m.globe.reason).toBe(seg3d.reason);
        expect(globeClickIntents(m.globe, m.segments, EMPTY)).toEqual([]);
    });

    it('⛔ every disabled state carries a reason — no bare grey', () => {
        for (const g of [
            globeOf(SPLIT, { canReturnToSite: false }),
            describeSiteViewQuickToggle({
                layout: EMPTY, canRestoreSplit: false, mountableKinds: new Set([] as never[]),
            }).globe,
        ]) {
            if (!g.enabled) expect(g.reason, 'globe greyed with no reason').toBeTruthy();
        }
    });
});

describe('§GLOBE-QUICK-TOGGLE — ⛔ it never enters the C60 entry flow (C19 §1.3/§1.4)', () => {
    it('⭐ NO site.entry.* intent is producible from this control, over every input', () => {
        // The parcel boundary is a ONE-SHOT IMMUTABLE polygon and `site.entry.select-parcel`
        // is the one intent that can commit it. A mid-project button that re-opened that
        // machine would walk the user toward re-committing the site of a project that
        // already has one. Pinned as a PROPERTY over the whole input space, not as a
        // code-reading promise.
        const layouts: PaneLayout[] = [
            SPLIT, EMPTY, SOLO_MAP, { [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: null },
        ];
        for (const layout of layouts) {
            for (const globeFraming of ['site', 'world'] as const) {
                for (const canReturnToSite of [true, false]) {
                    for (const intent of intentsFor(layout, { globeFraming, canReturnToSite })) {
                        expect(intent.type.startsWith('site.entry.'), intent.type).toBe(false);
                        expect([
                            'view.pane.assign', 'view.pane.solo',
                            'view.site.frame-globe', 'view.site.frame-site',
                        ]).toContain(intent.type);
                    }
                }
            }
        }
    });

    it('the model imports NO store and NO reducer — it cannot reach a hand-off', () => {
        // ⚠ `codeOnly`, and this file's own header says why: the header of the module
        // under test EXPLAINS the absence by naming `siteEntryPaneIntent()`, so the raw
        // text matches the very pattern this arm forbids. Third recurrence in this file.
        const code = codeOnly(read('apps/editor/src/engine/views/siteViewQuickToggleModel.ts'));
        expect(code).not.toMatch(/SiteEntryStore|SiteEntryState/);
        expect(code).not.toMatch(/reduceSiteEntry\(|siteEntryPaneIntent\(/);
    });

    it('worldFramingTarget() is the DECLARED world framing, and is a flight not a cut', () => {
        const t = worldFramingTarget();
        expect(t.stage).toBe('world');
        expect(t.lat).toBe(WORLD_HOME.lat);
        expect(t.lon).toBe(WORLD_HOME.lon);
        expect(t.altitudeM).toBe(SITE_ENTRY_ALTITUDE_M.world);
        expect(t.pitchDeg).toBe(SITE_ENTRY_PITCH_DEG.world);
        // A mount is not a navigation, but this IS one — the user pressed a button.
        expect(t.instant).toBe(false);
        expect(t.durationS).toBeGreaterThan(0);
        // Derived from the declared initial state — no second copy of the framing.
        expect(INITIAL_SITE_ENTRY_STATE.stage).toBe('world');
    });
});

describe('§GLOBE-QUICK-TOGGLE — ⭐ REACHABILITY: the button exists on a mounted bar and works', () => {
    // "Committed ≠ reachable" — this repo's most-repeated defect is a fix that runs
    // nowhere. Every arm above tests a pure function; this one mounts the real DOM
    // against the real `PaneLayoutStore` and clicks the real button.
    const mountBar = (layout: PaneLayout) => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const store = new PaneLayoutStore(layout);
        const calls: string[] = [];
        const handle = mountSiteViewQuickToggle({
            store,
            parent,
            camera: {
                frameGlobe: () => { calls.push('frameGlobe'); },
                frameSite: () => { calls.push('frameSite'); },
                canFrameSite: () => true,
            },
        });
        const globeBtn = (): HTMLButtonElement =>
            parent.querySelector('[data-testid="site-view-quick-toggle-globe"]')!;
        return { parent, store, calls, handle, globeBtn };
    };

    it('⭐ the 3D Globe button is IN THE MOUNTED BAR, enabled, beside the segments', () => {
        const { parent, globeBtn, handle } = mountBar(SPLIT);
        const btn = globeBtn();
        expect(btn, 'no globe button rendered').toBeTruthy();
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toContain('3D Globe');
        // Beside, not instead of: both segments and the split control survive.
        expect(parent.querySelector('[data-testid="site-view-quick-toggle-site-3d"]')).toBeTruthy();
        expect(parent.querySelector('[data-testid="site-view-quick-toggle-site-map-2d"]')).toBeTruthy();
        expect(parent.querySelector('[data-testid="site-view-quick-toggle-split"]')).toBeTruthy();
        handle.dispose();
        parent.remove();
    });

    it('⭐ clicking it SOLOs the 3D Site AND flies the camera — then offers the way back', () => {
        const { store, calls, globeBtn, handle, parent } = mountBar(SPLIT);
        globeBtn().click();
        expect(calls).toEqual(['frameGlobe']);
        expect(store.getLayout()).toEqual({ [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' });
        // The label flipped, so the return trip is on the same button the user just used.
        expect(globeBtn().textContent).toContain('Back to site');
        globeBtn().click();
        expect(calls).toEqual(['frameGlobe', 'frameSite']);
        expect(globeBtn().textContent).toContain('3D Globe');
        handle.dispose();
        parent.remove();
    });

    it('⛔ with NO camera ports the control is refused WITH A REASON, never dropped', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const handle = mountSiteViewQuickToggle({ store: new PaneLayoutStore(SPLIT), parent });
        const btn = parent.querySelector<HTMLButtonElement>(
            '[data-testid="site-view-quick-toggle-globe"]',
        )!;
        expect(btn, 'the control vanished instead of explaining itself').toBeTruthy();
        expect(btn.disabled).toBe(true);
        expect(btn.title).toBeTruthy();
        handle.dispose();
        parent.remove();
    });

    it('a camera port that THROWS leaves the framing where it was', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const handle = mountSiteViewQuickToggle({
            store: new PaneLayoutStore(SPLIT),
            parent,
            camera: {
                frameGlobe: () => { throw new Error('no viewer'); },
                frameSite: () => { /* unreachable in this arm */ },
            },
        });
        const btn = (): HTMLButtonElement =>
            parent.querySelector('[data-testid="site-view-quick-toggle-globe"]')!;
        btn().click();
        // Still offering the OUTBOUND move — a control that flipped to "Back to site"
        // after a failed flight would be claiming a move that did not happen.
        expect(btn().textContent).toContain('3D Globe');
        handle.dispose();
        parent.remove();
    });
});

describe('§GLOBE-QUICK-TOGGLE — the production wiring is real, not authored-and-unwired', () => {
    const GLOBE_SHELL = 'apps/editor/src/engine/views/SiteAuthoringPaneShell.ts';

    it('⭐ the shell PASSES camera ports — an omitted port disables the control', () => {
        const src = read(GLOBE_SHELL);
        expect(src).toMatch(/mountSiteViewQuickToggle\(\{[\s\S]{0,240}camera:/);
        expect(src).toContain('defaultSiteViewCameraPorts');
    });

    it('the ports resolve the DECLARED globals — no new machinery, no window-any (P4)', () => {
        const code = codeOnly(read(GLOBE_SHELL));
        expect(code).toContain('window.pryzmGetSiteEntryCameraHost');
        // The return trip is the ONE declared `site.zoom-to-site` action, not a third
        // hand-written "fly back to the site" target.
        expect(code).toContain('window.pryzmZoomToSite');
        expect(code).not.toMatch(/window as any/);
        // The world framing comes from C60's own declaration, never a literal here.
        expect(code).toContain('worldFramingTarget()');
        expect(code).not.toMatch(/altitudeM:\s*\d/);
    });

    it('both globals it reaches for are actually TYPED (P4)', () => {
        const g = read('apps/editor/src/types/globals.d.ts');
        expect(g).toContain('pryzmGetSiteEntryCameraHost?:');
        expect(g).toContain('pryzmZoomToSite?:');
        // §L-6806 — `durationS` was missing from the declaration while the implementation
        // accepted it, so every `SiteEntryCameraTarget` passed through was silently untyped.
        expect(g).toMatch(/durationS\?:\s*number/);
    });

    it('⛔ the DOM half still reads no globals of its own', () => {
        // It is chrome. Knowing that the world framing comes from C60, or that the site
        // reframe is a window hook, is the composition layer's job (P1).
        const dom = codeOnly(read('apps/editor/src/engine/views/SiteViewQuickToggle.ts'));
        expect(dom).not.toMatch(/window\.pryzm/);
        expect(dom).not.toMatch(/worldFramingTarget/);
    });

    it('⛔ the globe pill is STYLED, and the sheet is still the one that is injected', () => {
        const css = codeOnly(read('apps/editor/src/ui/styles/panels/siteViewQuickToggle.ts'));
        expect(css).toContain('.svq-btn--globe');
        expect(css).toContain('.svq-btn--globe-return');
        // Brand: white + purple only (memory: preview-color-unified-pryzm-purple).
        expect(css).toContain('#6600FF');
        // ⚠ Matched as a COLOUR VALUE, not as a word. A prose ban on the word would fire
        // on the stylesheet's own comment explaining the ban — the `codeOnly` lesson
        // again, in the one place `codeOnly` cannot help (CSS block-comment bodies do
        // not start with a comment marker).
        expect(css).not.toMatch(/:\s*(#000\b|#000000|black)\b/);
    });
});
