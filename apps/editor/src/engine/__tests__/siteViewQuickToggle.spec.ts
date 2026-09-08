/**
 * §SITE-VIEW-QUICK-TOGGLE / §VIEW-PANEL-PER-PANE — the view panel.
 *
 * Founder 2026-08-21: *"we don't really need this 3D Site button on the top-right corner
 * (almost hidden) — at this stage the user should be able to just go to 3D globe, so a
 * button 3D globe / 3D site in the middle top would be beneficial."*
 *
 * Founder 2026-09-06, with screenshots: *"the 2d map satellite and non-satellite option is
 * MASKED FOR ANOTHER PANEL — add those options to the main panel … WHEN BEING IN A SINGLE
 * VIEW (this applies even in PRYZM views) WE KEEP THE PANEL WITH ALL MAIN OPTIONS TO THE
 * TOP: 2D SITE MAP / 2D SATELLITE / 3D SITE / 3D GLOBE / 3D PRYZM / 2D PRYZM … WHEN BEING
 * IN SPLIT VIEW — WE SHALL HAVE TWO PANELS LIKE THAT — AND THE USER CAN DECIDE WHAT TO ADD
 * IN EACH OF THE SPLIT VIEWS (LEFT OR RIGHT)."*
 *
 * ⛔ THE 2026-08 BRIEF'S HARD CONSTRAINT SURVIVES AND STILL GETS ITS OWN ARM: *"Do not
 * delete that menu — it carries real refusals with reasons."* Every other arm here would
 * pass just as happily over an implementation that ripped the pane picker out.
 *
 * ⭐ WHAT THE 2026-09-06 REWRITE CHANGED, so a reader is not left comparing this against a
 * stale memory of the file:
 *   · `model.globe` is GONE as a separate action. The globe is a ROW of the six — `site-3d`
 *     at the world framing — and satellite is its exact analogue on the 2D map. The
 *     properties the old `globe` arms pinned (no globe ViewType, camera last, no one-way
 *     door, inherited refusals) are all still pinned; they are just pinned on a row.
 *   · The BIM projections ARE promoted now. The old arm asserting they must not be was a
 *     lane decision; the founder has overridden it by name.
 *   · The panel is PER PANE. A pane-scoped click assigns and NEVER solos.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    describeSiteViewQuickToggle,
    segmentClickIntents,
    type SiteViewGlobeFraming,
    type SiteViewSegment,
} from '../views/siteViewQuickToggleModel';
import {
    viewPanelCoverage,
    viewPanelOptions,
    type ViewPanelOptionId,
} from '../views/viewPanelOptions';
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
import { VIEW_SEGMENTS } from '../../ui/site/viewSegmentSwitcher';
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
 * ⚠ NOT optional, and this lane learned it FOUR TIMES in one session. Every source-text arm
 * below asserts the ABSENCE of a pattern — and a well-written header EXPLAINS the absence by
 * naming the very pattern it forbids ("this file must not touch `MultiPaneController`",
 * "never `left: 50%`"). So the better the comment, the more certainly the raw-text arm fails.
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

type Extra = Partial<Parameters<typeof describeSiteViewQuickToggle>[0]>;

const model = (layout: PaneLayout, canRestoreSplit = false, extra: Extra = {}) =>
    describeSiteViewQuickToggle({ layout, canRestoreSplit, ...extra });

const row = (layout: PaneLayout, id: ViewPanelOptionId, extra: Extra = {}): SiteViewSegment =>
    model(layout, false, extra).segments.find((s) => s.optionId === id)!;

const intents = (layout: PaneLayout, id: ViewPanelOptionId, extra: Extra = {}) =>
    segmentClickIntents(row(layout, id, extra), layout);

// ════════════════════════════════════════════════════════════════════════════════
// THE PANEL DEFINITION
// ════════════════════════════════════════════════════════════════════════════════

describe('§VIEW-PANEL-PER-PANE — the founder named the six, and the panel is exactly them', () => {
    it('⭐ six rows, in his order, under his words', () => {
        expect(viewPanelOptions().map((o) => o.id)).toEqual([
            'site-map', 'site-satellite', 'site-3d', 'site-globe', 'pryzm-3d', 'pryzm-2d',
        ]);
        expect(viewPanelOptions().map((o) => o.label)).toEqual([
            '2D Site Map', '2D Satellite', '3D Site', '3D Globe', '3D PRYZM', '2D PRYZM',
        ]);
    });

    it('⛔ six ROWS but FOUR views — the variants are variants, not rival view types', () => {
        const byView = new Map<ViewType, number>();
        for (const o of viewPanelOptions()) byView.set(o.viewType, (byView.get(o.viewType) ?? 0) + 1);
        expect([...byView.entries()].sort()).toEqual([
            ['bim-3d', 1], ['bim-plan-2d', 1], ['site-3d', 2], ['site-map-2d', 2],
        ]);
        // The two doubled views are doubled by a VARIANT, and the variant names its port.
        expect(viewPanelOptions().find((o) => o.id === 'site-satellite')!.variant)
            .toEqual({ kind: 'basemap', value: 'satellite' });
        expect(viewPanelOptions().find((o) => o.id === 'site-globe')!.variant)
            .toEqual({ kind: 'framing', value: 'world' });
    });

    it('⛔ the set is DERIVED from the registry, and both directions are clean', () => {
        // A promoted view with no row is a MISSING option; rows for an unpromoted view are
        // an ORPHAN one. A count can be right while the set is wrong — this checks the set.
        expect(viewPanelCoverage()).toEqual({ promotedWithoutRows: [], rowsWithoutPromotion: [] });
        const promoted = (Object.keys(VIEW_TYPE_REGISTRY) as ViewType[])
            .filter((vt) => VIEW_TYPE_REGISTRY[vt]!.panelPromoted);
        expect(promoted).toEqual(['site-map-2d', 'site-3d', 'bim-3d', 'bim-plan-2d']);
    });

    it('⭐ THE CONVERGENCE GUARANTEE — the whole-screen host renders the SAME six', () => {
        // `viewSegmentSwitcher` (the Parcel Law tab, dispatching GIS_ACTIONS) and this panel
        // (the panes, dispatching view.pane.*) are two HOSTS of ONE definition. If they ever
        // drift, the founder sees two different "main panels" — which is the complaint that
        // started this lane.
        expect(VIEW_SEGMENTS.map((s) => s.id)).toEqual(viewPanelOptions().map((o) => o.id));
        expect(VIEW_SEGMENTS.map((s) => s.label)).toEqual(viewPanelOptions().map((o) => o.label));
    });

    it('elevations and sections are NOT promoted — they live in the pane menu', () => {
        // Founder: "if the user wants to open more they can do it in the browser."
        for (const vt of ['bim-elevation-2d', 'bim-section-2d'] as const) {
            expect(VIEW_TYPE_REGISTRY[vt].panelPromoted).toBeFalsy();
            expect(viewPanelOptions().some((o) => o.viewType === vt)).toBe(false);
            // …and they still say WHY, in the menu that does list them.
            expect(VIEW_TYPE_REGISTRY[vt].unavailableReason).toBeTruthy();
        }
    });
});

describe('§VIEW-PANEL-PER-PANE — the two rival view types that were NOT minted', () => {
    it('⛔ NO globe ViewType (C60 §6.10) — one cesium row, still', () => {
        const cesium = (Object.keys(VIEW_TYPE_REGISTRY) as ViewType[])
            .filter((vt) => VIEW_TYPE_REGISTRY[vt]!.rendererKind === 'cesium');
        expect(cesium).toEqual(['site-3d']);
        expect(viewPanelOptions().find((o) => o.id === 'site-globe')!.viewType).toBe('site-3d');
    });

    it('⭐ THE MEASUREMENT that rules the rival globe design out (L-6802)', () => {
        // A `site-globe-3d` cesium ViewType is not merely redundant — it is REACHABLY
        // BROKEN. `assignViewToPane` vacates only the SAME view type, so a rival lands
        // beside `site-3d` and `validatePaneLayout` reports a conflict, i.e. in the
        // founder's own default split the globe button would refuse on every click.
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

    it('⛔ NO satellite ViewType either — one maplibre row, and one satellite path', () => {
        // The founder called satellite "MASKED FOR ANOTHER PANEL": it is a MapLibre STYLE on
        // the ONE 2D map (`SiteBoundaryMap2D.swapBasemap`, A.8.c.f.4), not a second map. A
        // rival `site-satellite-2d` would need a second MapLibre instance and a second
        // mounter — a second satellite implementation, which is what this lane must not build.
        const maplibre = (Object.keys(VIEW_TYPE_REGISTRY) as ViewType[])
            .filter((vt) => VIEW_TYPE_REGISTRY[vt]!.rendererKind === 'maplibre');
        expect(maplibre).toEqual(['site-map-2d']);
        expect(viewPanelOptions().find((o) => o.id === 'site-satellite')!.viewType).toBe('site-map-2d');
        // …and the panel dispatches a BASEMAP intent, never a second view assignment.
        const sat = intents(SPLIT, 'site-satellite');
        expect(sat.filter((i) => i.type === 'view.pane.assign')).toEqual([]);
        expect(sat).toContainEqual({ type: 'view.site.basemap', value: 'satellite' });
    });

    it('the ONE basemap implementation is the map\'s own, re-hosted not re-written', () => {
        // ⛔ `codeOnly`, NOT `read` — CORRECTED 2026-09-06 (lane GLOBE-AND-ENVELOPE-IN-CESIUM), and
        // this is the FIFTH recurrence of the defect THIS FILE'S OWN `codeOnly` DOCSTRING DESCRIBES:
        // *"Every source-text arm below asserts the ABSENCE of a pattern — and a well-written header
        // EXPLAINS the absence by naming the very pattern it forbids … So the better the comment,
        // the more certainly the raw-text arm fails."* It said "learned it FOUR TIMES in one
        // session"; this arm was the one that had not learned it.
        //
        // WHAT WENT RED, AND WHY IT WAS NOT A REGRESSION. §MAP2D-ENVELOPE registered the buildable-
        // envelope layers inside `installRingLayers`, which is correct and load-bearing — a
        // `setStyle(style, {diff:false})` wipes every added source and layer, and that function is
        // what the `style.load` handler re-runs. Saying so REQUIRES naming `map.setStyle(`, so a
        // raw-text count read 2 while `SiteBoundaryMap2D.ts` still contained exactly ONE CALL
        // (measured: raw 2, code-only 1 — the other is the comment at ~:1142).
        //
        // ⭐ THE COUNT IS STILL 1, DELIBERATELY. The invariant is intact and is NOT being relaxed:
        // there is one basemap implementation, RE-HOSTED not re-written, and a second `setStyle`
        // call site would still fail this line. Only the MEASUREMENT changed — from counting
        // sentences to counting code. This is the same correction §RAF-GATE-COMMENT-BLIND made to
        // the P3 gate, which reported "5 owners" when there was 1 owner and 4 comment lines, three
        // of them doc comments asserting P3 compliance (CLAUDE.md P3).
        //
        // ⛔ Do NOT "fix" a future red here by watering down the comment in `SiteBoundaryMap2D.ts`.
        // A gate that punishes accurate comments trains the codebase to lie.
        const map2d = codeOnly(read('apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts'));
        // Exactly one `setStyle` CALL in the app's 2D map — the swap this panel drives.
        expect((map2d.match(/map\.setStyle\(/g) ?? []).length).toBe(1);
        // The handle hands OUT that function; it does not re-implement it.
        expect(map2d).toContain('setBasemap: (next) => swapBasemap(next)');
        const gis = codeOnly(read('apps/editor/src/ui/layout/GISAreaLayout.ts'));
        expect(gis).toContain('window.pryzmSetSiteBasemap');
        expect(gis).toContain('map2dHandle?.setBasemap(next)');
        // ⛔ …and the map's own corner chip is NOT deleted (C19 §5.6 clause 4).
        expect(map2d).toContain("satBtn.addEventListener('click', () => swapBasemap('satellite'))");
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// ACTIVE / SOLOED / UNREPORTED / AVAILABLE
// ════════════════════════════════════════════════════════════════════════════════

describe('§VIEW-PANEL-PER-PANE — active, soloed and available are THREE facts', () => {
    it('in the default split both site views are active and neither is soloed', () => {
        expect(row(SPLIT, 'site-3d', { basemap: 'map' }).active).toBe(true);
        expect(row(SPLIT, 'site-map', { basemap: 'map' }).active).toBe(true);
        expect(row(SPLIT, 'site-3d').soloed).toBe(false);
        expect(row(SPLIT, 'site-map').soloed).toBe(false);
    });

    it('"visible" and "the only thing on screen" do not render as one state', () => {
        const m = row(SOLO_MAP, 'site-map', { basemap: 'map' });
        expect(m.active).toBe(true);
        expect(m.soloed).toBe(true);
        expect(row(SOLO_MAP, 'site-3d').active).toBe(false);
    });

    it('⭐ the VARIANT decides which of a pair is active — never both', () => {
        // The whole point of promoting satellite: the panel must be able to say WHICH 2D
        // map you are looking at. Lighting both rows would be the same lie as lighting
        // neither, with a friendlier face on it.
        expect(row(SPLIT, 'site-map', { basemap: 'map' }).active).toBe(true);
        expect(row(SPLIT, 'site-satellite', { basemap: 'map' }).active).toBe(false);
        expect(row(SPLIT, 'site-map', { basemap: 'satellite' }).active).toBe(false);
        expect(row(SPLIT, 'site-satellite', { basemap: 'satellite' }).active).toBe(true);
        // …and the same for the camera framing.
        expect(row(SPLIT, 'site-3d', { globeFraming: 'site' }).active).toBe(true);
        expect(row(SPLIT, 'site-globe', { globeFraming: 'site' }).active).toBe(false);
        expect(row(SPLIT, 'site-3d', { globeFraming: 'world' }).active).toBe(false);
        expect(row(SPLIT, 'site-globe', { globeFraming: 'world' }).active).toBe(true);
    });

    it('⛔ UNREPORTED ≠ NOT CURRENT (C84 EI-1b) — an unreadable basemap is not "cream"', () => {
        // With no basemap reading, the 2D map IS on screen but which style it draws is not
        // knowable. Painting `active: false` on both would assert the user is looking at
        // neither, which is a claim the panel cannot make.
        const m = row(SPLIT, 'site-map', { basemap: null });
        expect(m.active).toBe(false);
        expect(m.variantUnreported).toBe(true);
        expect(row(SPLIT, 'site-satellite', { basemap: null }).variantUnreported).toBe(true);
        // A view that is NOT hosted is a different fact again — that one really is "off".
        expect(row(EMPTY, 'site-map', { basemap: null }).variantUnreported).toBe(false);
        // The framing is a MEMORY, always available, so it is never unreported.
        expect(row(SPLIT, 'site-3d', { basemap: null }).variantUnreported).toBe(false);
    });

    it('a view with no registered mounter is REFUSED WITH A REASON, not hidden', () => {
        const m = model(EMPTY, false, { mountableKinds: new Set(['maplibre'] as const) });
        const globe = m.segments.find((s) => s.optionId === 'site-3d')!;
        expect(globe.enabled).toBe(false);
        expect(globe.reason).toContain('cesium');
        // It is still OFFERED. A silently missing control is the answer C59 Phase 2 ruled out.
        expect(m.segments.map((s) => s.optionId)).toContain('site-3d');
    });

    it('⭐ 3D PRYZM cannot be a PANE, and is REACHABLE anyway (L-13257)', () => {
        // ⚠ AMENDED 2026-09-08 (§ONE-REGION-SWITCHER). This arm asserted `enabled === false`,
        // and it passed while the founder was reporting *"I still don't see 3D PRYZM
        // accessible"* — twice. The pane refusal it describes is STILL TRUE and still tested
        // below; what was wrong was concluding that a row with nowhere to go IN A PANE
        // therefore has nowhere to go at all (the L-942 shape: a refusal whose own text names
        // the way out, with no way to take it).
        const p = row(SPLIT, 'pryzm-3d');
        expect(p.viewType).toBe('bim-3d');
        // ⭐ REACHABLE — it dispatches the DECLARED whole-screen route.
        expect(p.enabled).toBe(true);
        expect(p.fullScreenRoute).toBe('3D');
        // ⛔ AND STILL NOT A PANE: the reason keeps naming the renderer and the phase, and the
        // click still produces ZERO pane intents (`view.pane.assign` on a `paneHostable:
        // false` view is exactly what `validatePaneLayout` rejects).
        expect(p.reason).toContain('#container');
        expect(p.reason).toContain('C59 Phase 3');
        expect(segmentClickIntents(p, SPLIT)).toEqual([]);
        // 2D PRYZM, by contrast, IS pane-hostable — the Canvas2D plan pane mounter exists.
        expect(row(SPLIT, 'pryzm-2d', { mountableKinds: new Set(['canvas2d'] as const) }).enabled)
            .toBe(true);
    });

    it('⛔ every disabled row carries a reason — no bare grey', () => {
        const cases: Array<[string, Extra]> = [
            ['nothing mountable', { mountableKinds: new Set([] as never[]) as never }],
            ['maplibre only', { mountableKinds: new Set(['maplibre'] as const) }],
            ['no camera port', { canReturnToSite: false }],
            ['no basemap port', { canSetBasemap: false }],
        ];
        for (const [name, extra] of cases) {
            for (const s of model(EMPTY, false, extra).segments) {
                if (!s.enabled) expect(s.reason, `${name}: ${s.optionId} greyed with no reason`).toBeTruthy();
            }
        }
    });

    it('⛔ NO ONE-WAY DOOR (L-6804) — with no reframe port the GLOBE row is refused', () => {
        // The gate is on the way OUT, where refusing is free, not on the way back, where
        // refusing strands the user at world altitude (the L-942 shape).
        const g = row(SPLIT, 'site-globe', { canReturnToSite: false });
        expect(g.enabled).toBe(false);
        expect(g.reason).toContain('no way back');
        expect(segmentClickIntents(g, SPLIT)).toEqual([]);
        // ⭐ …and `3D Site` — the way BACK — stays live. Gating the return would be the
        // exact defect this rule exists to prevent.
        expect(row(SPLIT, 'site-3d', { canReturnToSite: false }).enabled).toBe(true);
    });

    it('⛔ with no basemap port BOTH 2D rows are refused — a swap that cannot happen is not offered', () => {
        for (const id of ['site-map', 'site-satellite'] as const) {
            const r = row(SPLIT, id, { canSetBasemap: false });
            expect(r.enabled).toBe(false);
            expect(r.reason).toContain('basemap swap is not wired');
        }
        // The rows with no basemap variant are untouched by that port.
        expect(row(SPLIT, 'site-3d', { canSetBasemap: false }).enabled).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// CLICKS — the whole-screen panel and the per-pane panel
// ════════════════════════════════════════════════════════════════════════════════

describe('§VIEW-PANEL-PER-PANE — the WHOLE-SCREEN panel solos', () => {
    it('⭐ clicking 3D Site while split SOLOs it, then frames on the site', () => {
        // Already in the right pane, so no re-assign: re-mounting a heavyweight Cesium
        // singleton to put it where it already is would be churn.
        expect(intents(SPLIT, 'site-3d', { globeFraming: 'world' })).toEqual([
            { type: 'view.pane.solo', paneId: RIGHT_PANE },
            { type: 'view.site.frame-site' },
        ]);
    });

    it('clicking a view that is nowhere ASSIGNS then SOLOs, in that order', () => {
        expect(intents(EMPTY, 'site-3d', { globeFraming: 'world' })).toEqual([
            { type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'site-3d' },
            { type: 'view.pane.solo', paneId: LEFT_PANE },
            { type: 'view.site.frame-site' },
        ]);
    });

    it('⭐ 3D Globe: SOLO the 3D Site, THEN fly — the camera is LAST', () => {
        // Framing a pane that is not mounted yet drops the target, so the order is not
        // cosmetic (`cesiumSiteEntryCameraPort` logs exactly that).
        expect(intents(SPLIT, 'site-globe')).toEqual([
            { type: 'view.pane.solo', paneId: RIGHT_PANE },
            { type: 'view.site.frame-globe' },
        ]);
        expect(intents(EMPTY, 'site-globe')).toEqual([
            { type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'site-3d' },
            { type: 'view.pane.solo', paneId: LEFT_PANE },
            { type: 'view.site.frame-globe' },
        ]);
    });

    it('⭐ 2D Satellite: SOLO the 2D map, THEN swap the basemap — the variant is LAST', () => {
        expect(intents(SPLIT, 'site-satellite', { basemap: 'map' })).toEqual([
            { type: 'view.pane.solo', paneId: LEFT_PANE },
            { type: 'view.site.basemap', value: 'satellite' },
        ]);
        expect(intents(EMPTY, 'site-satellite')).toEqual([
            { type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'site-map-2d' },
            { type: 'view.pane.solo', paneId: LEFT_PANE },
            { type: 'view.site.basemap', value: 'satellite' },
        ]);
    });

    it('the row that is already alone AND already in its variant does nothing', () => {
        expect(intents(SOLO_MAP, 'site-map', { basemap: 'map' })).toEqual([]);
    });

    it('⛔ an UNREPORTED variant still dispatches the swap — "I cannot read it" is not "it is set"', () => {
        // The founder presses `2D Site Map` because he wants the cream map. If the panel
        // skipped the swap on the grounds that it could not read the basemap, the press
        // would do nothing visible — the silent no-op this panel exists to remove.
        expect(intents(SOLO_MAP, 'site-map', { basemap: null }))
            .toEqual([{ type: 'view.site.basemap', value: 'map' }]);
    });

    it('a refused row dispatches NOTHING', () => {
        expect(intents(EMPTY, 'site-3d', { mountableKinds: new Set(['maplibre'] as const) }))
            .toEqual([]);
    });

    it('⭐ the route BACK exists exactly when it can work', () => {
        expect(model(SOLO_MAP, true).split.enabled).toBe(true);
        expect(model(SOLO_MAP, false).split.enabled).toBe(false);
        expect(model(SOLO_MAP, false).split.reason).toBeTruthy();
        expect(model(SPLIT, true).split.enabled).toBe(false);
        expect(model(SPLIT, true).split.reason).toContain('Already split');
    });
});

describe('§VIEW-PANEL-PER-PANE — ⭐ the PER-PANE panel drives ONLY its own pane', () => {
    // The founder's substantive ask: "THE USER CAN DECIDE WHAT TO ADD IN EACH OF THE SPLIT
    // VIEWS (LEFT OR RIGHT)." A panel that soloed would empty the other pane on every click,
    // which is the opposite of a split.

    it('a pane-scoped click ASSIGNS to its pane and never SOLOs', () => {
        const i = segmentClickIntents(row(SPLIT, 'pryzm-2d', {
            paneId: RIGHT_PANE, mountableKinds: new Set(['canvas2d', 'cesium', 'maplibre'] as const),
        }), SPLIT);
        expect(i).toEqual([
            { type: 'view.pane.assign', paneId: RIGHT_PANE, viewType: 'bim-plan-2d' },
        ]);
        expect(i.some((x) => x.type === 'view.pane.solo')).toBe(false);
    });

    it('⭐ THE FOUNDER\'S SENTENCE, as a layout: satellite LEFT, 3D Site RIGHT', () => {
        const store = new PaneLayoutStore(SPLIT);
        // Left panel, "2D Satellite": the map is already left, so only the basemap moves.
        for (const intent of segmentClickIntents(
            row(store.getLayout(), 'site-satellite', { paneId: LEFT_PANE, basemap: 'map' }),
            store.getLayout(),
        )) {
            if (intent.type === 'view.pane.assign' || intent.type === 'view.pane.solo') {
                store.dispatch(intent);
            }
        }
        // ⛔ The RIGHT pane still holds the 3D Site. On the whole-screen panel the same
        // press would have emptied it.
        expect(store.getLayout()).toEqual({ [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' });
    });

    it('each panel reports ITS OWN pane\'s view as active, not the screen\'s', () => {
        const left = model(SPLIT, false, { paneId: LEFT_PANE, basemap: 'map' });
        const right = model(SPLIT, false, { paneId: RIGHT_PANE, basemap: 'map' });
        expect(left.segments.find((s) => s.optionId === 'site-map')!.active).toBe(true);
        expect(left.segments.find((s) => s.optionId === 'site-3d')!.active).toBe(false);
        expect(right.segments.find((s) => s.optionId === 'site-3d')!.active).toBe(true);
        expect(right.segments.find((s) => s.optionId === 'site-map')!.active).toBe(false);
        expect(left.paneId).toBe(LEFT_PANE);
    });

    it('every row of a pane panel targets THAT pane', () => {
        for (const pane of [LEFT_PANE, RIGHT_PANE]) {
            for (const s of model(SPLIT, false, { paneId: pane }).segments) {
                expect(s.targetPane).toBe(pane);
                expect(s.paneScoped).toBe(true);
            }
        }
    });

    it('the pinned-surface refusal is computed for the PANE, not for a solo', () => {
        // §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720). Assigning the 3D Site into the RIGHT
        // pane does not evict a map pinned in the LEFT one, so it must NOT be refused — a
        // pin that refused a harmless click would be the unsatisfiable-gate shape (§L-716).
        const pinned = new Map<ViewType, string>([['site-map-2d', 'the map is load-bearing']]);
        expect(row(SPLIT, 'site-3d', { paneId: RIGHT_PANE, pinnedViews: pinned }).enabled).toBe(true);

        // ⚠ THE SECOND HALF ASSERTED A REFUSAL ON `SPLIT` UNTIL §SWAP-NOT-VACATE (L-12999,
        // 2026-09-06), with the comment *"assigning something else INTO the pinned pane
        // does evict it"*. On `SPLIT` that is no longer true: `site-3d` is live in the
        // RIGHT pane, so assigning it LEFT now SWAPS and the map lands right — moved, not
        // evicted, which is the distinction this pin has always drawn. Re-pointed at
        // `MAP_ONLY`, where the incoming view is live nowhere else, so it genuinely
        // replaces the map and the refusal is the correct answer. Both halves of the arm's
        // point survive: a harmless click is allowed, an evicting one is refused.
        const MAP_ONLY: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: null };
        expect(row(MAP_ONLY, 'site-3d', { paneId: LEFT_PANE, pinnedViews: pinned }).reason)
            .toBe('the map is load-bearing');
        // …and on the split the same row is live, because nothing is evicted there.
        expect(row(SPLIT, 'site-3d', { paneId: LEFT_PANE, pinnedViews: pinned }).enabled).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// REACHABILITY — the real DOM, the real store, real clicks
// ════════════════════════════════════════════════════════════════════════════════

describe('§VIEW-PANEL-PER-PANE — ⭐ REACHABILITY: it is mounted, and the buttons work', () => {
    // "Committed ≠ reachable" — this repo's most-repeated defect is a fix that runs
    // nowhere. Every arm above tests a pure function; these mount the real DOM against the
    // real `PaneLayoutStore` and click the real button.
    const mountPanel = (layout: PaneLayout, paneId?: string) => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const store = new PaneLayoutStore(layout);
        const calls: string[] = [];
        let basemap: 'map' | 'satellite' = 'map';
        const handle = mountSiteViewQuickToggle({
            store,
            parent,
            ...(paneId ? { paneId } : {}),
            camera: {
                frameGlobe: () => { calls.push('frameGlobe'); },
                frameSite: () => { calls.push('frameSite'); },
                canFrameSite: () => true,
            },
            basemap: {
                setBasemap: (n) => { calls.push(`setBasemap:${n}`); basemap = n; },
                getBasemap: () => basemap,
                canSetBasemap: () => true,
            },
        });
        const btn = (id: string): HTMLButtonElement =>
            parent.querySelector(
                `[data-testid="site-view-quick-toggle-${id}${paneId ? `-${paneId}` : ''}"]`,
            )!;
        return { parent, store, calls, handle, btn };
    };

    it('⭐ all six rows are IN the mounted panel, beside the split control', () => {
        const { parent, btn, handle } = mountPanel(SPLIT);
        for (const id of ['site-map', 'site-satellite', 'site-3d', 'site-globe', 'pryzm-3d', 'pryzm-2d']) {
            expect(btn(id), `no ${id} button rendered`).toBeTruthy();
        }
        expect(btn('site-satellite').textContent).toContain('2D Satellite');
        expect(btn('pryzm-3d').textContent).toContain('3D PRYZM');
        expect(parent.querySelector('[data-testid="site-view-quick-toggle-split"]')).toBeTruthy();
        handle.dispose();
        parent.remove();
    });

    it('⭐ clicking 2D Satellite SOLOs the 2D map AND swaps the basemap', () => {
        const { store, calls, btn, handle, parent } = mountPanel(SPLIT);
        btn('site-satellite').click();
        expect(store.getLayout()).toEqual({ [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: null });
        expect(calls).toEqual(['setBasemap:satellite']);
        // The panel repainted off the port's own reading — satellite is now the active row.
        expect(btn('site-satellite').getAttribute('aria-pressed')).toBe('true');
        expect(btn('site-map').getAttribute('aria-pressed')).toBe('false');
        // …and pressing 2D Site Map swaps back.
        btn('site-map').click();
        expect(calls).toEqual(['setBasemap:satellite', 'setBasemap:map']);
        handle.dispose();
        parent.remove();
    });

    it('⭐ clicking 3D Globe SOLOs the 3D Site AND flies the camera — 3D Site brings it back', () => {
        const { store, calls, btn, handle, parent } = mountPanel(SPLIT);
        btn('site-globe').click();
        expect(calls).toEqual(['frameGlobe']);
        expect(store.getLayout()).toEqual({ [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' });
        expect(btn('site-globe').getAttribute('aria-pressed')).toBe('true');
        // The return trip is a row of its own now, not a flipped label.
        btn('site-3d').click();
        expect(calls).toEqual(['frameGlobe', 'frameSite']);
        expect(btn('site-3d').getAttribute('aria-pressed')).toBe('true');
        handle.dispose();
        parent.remove();
    });

    it('⭐ TWO PANELS, one per pane, each driving only its own pane', () => {
        const store = new PaneLayoutStore(SPLIT);
        const leftEl = document.createElement('div');
        const rightEl = document.createElement('div');
        document.body.append(leftEl, rightEl);
        const mk = (parent: HTMLElement, paneId: string) =>
            mountSiteViewQuickToggle({
                store, parent, paneId,
                basemap: { setBasemap: () => { /* recorded elsewhere */ }, getBasemap: () => 'map' },
            });
        const l = mk(leftEl, LEFT_PANE);
        const r = mk(rightEl, RIGHT_PANE);
        // Put the 3D Site in the LEFT pane from the LEFT panel.
        leftEl.querySelector<HTMLButtonElement>(`[data-testid="site-view-quick-toggle-site-3d-${LEFT_PANE}"]`)!.click();
        // ⚠ THIS ASSERTED `{left:'site-3d', right:null}` UNTIL §SWAP-NOT-VACATE (L-12999
        // clause 4, 2026-09-06), with the comment *"the right pane is now empty — the
        // model's own rule, not a solo"*. Still the model's own rule and still not a solo;
        // the rule changed. This is the founder's exact panel gesture (a 3D row pressed in
        // the pane that does not hold it), and clause 4 of his ruling is that the other
        // pane must not be left blank — so the two panes exchange.
        expect(store.getLayout()).toEqual({ [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: 'site-map-2d' });
        // The RIGHT panel repainted from the shared store: 3D Site is no longer ITS view…
        expect(
            rightEl.querySelector(`[data-testid="site-view-quick-toggle-site-3d-${RIGHT_PANE}"]`)!
                .getAttribute('aria-pressed'),
        ).toBe('false');
        // …and the view it DID receive is the one it now reports as active. The panel is
        // mounted inside its pane, so this is also the proof the right pane still has
        // chrome to state itself with — the escape hatch the old vacate took off screen.
        expect(
            rightEl.querySelector(`[data-testid="site-view-quick-toggle-site-map-${RIGHT_PANE}"]`)!
                .getAttribute('aria-pressed'),
        ).toBe('true');
        l.dispose(); r.dispose();
        leftEl.remove(); rightEl.remove();
    });

    it('⛔ with NO ports the affected rows are refused WITH A REASON, never dropped', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const handle = mountSiteViewQuickToggle({ store: new PaneLayoutStore(SPLIT), parent });
        for (const id of ['site-globe', 'site-map', 'site-satellite']) {
            const b = parent.querySelector<HTMLButtonElement>(`[data-testid="site-view-quick-toggle-${id}"]`)!;
            expect(b, `${id} vanished instead of explaining itself`).toBeTruthy();
            expect(b.disabled).toBe(true);
            expect(b.title).toBeTruthy();
        }
        handle.dispose();
        parent.remove();
    });

    it('a port that THROWS leaves the state where it was', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const handle = mountSiteViewQuickToggle({
            store: new PaneLayoutStore(SPLIT),
            parent,
            camera: {
                frameGlobe: () => { throw new Error('no viewer'); },
                frameSite: () => { /* unreachable in this arm */ },
            },
            basemap: { setBasemap: () => { throw new Error('no map'); }, getBasemap: () => 'map' },
        });
        const btn = (id: string): HTMLButtonElement =>
            parent.querySelector(`[data-testid="site-view-quick-toggle-${id}"]`)!;
        btn('site-globe').click();
        // A control that reported "you are on the globe" after a failed flight would be
        // claiming a move that did not happen.
        expect(btn('site-globe').getAttribute('aria-pressed')).toBe('false');
        btn('site-satellite').click();
        expect(btn('site-satellite').getAttribute('aria-pressed')).toBe('false');
        handle.dispose();
        parent.remove();
    });

    it('⛔ an UNREADABLE basemap renders aria-pressed="mixed", never "false"', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const handle = mountSiteViewQuickToggle({
            store: new PaneLayoutStore(SPLIT),
            parent,
            basemap: { setBasemap: () => { /* live */ }, getBasemap: () => null },
        });
        const b = parent.querySelector<HTMLButtonElement>('[data-testid="site-view-quick-toggle-site-map"]')!;
        expect(b.disabled).toBe(false);                       // it WORKS
        expect(b.getAttribute('aria-pressed')).toBe('mixed'); // …but is unreadable
        expect(b.getAttribute('data-variant-unreported')).toBe('true');
        expect(b.title).toContain('missing reading');
        handle.dispose();
        parent.remove();
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// IT ADDS ROUTES AND REMOVES NONE
// ════════════════════════════════════════════════════════════════════════════════

describe('§VIEW-PANEL-PER-PANE — it ADDS a route and removes none', () => {
    const SHELL = 'apps/editor/src/engine/views/SiteAuthoringPaneShell.ts';

    it('⛔ THE PANE MENU SURVIVES — both per-pane pickers are still mounted', () => {
        // The 2026-08 brief: "Do not delete that menu — it carries real refusals with reasons."
        const src = read(SHELL);
        expect(src).toContain('mountPaneViewPicker');
        // ⭐ RE-POINTED 2026-09-07 (§PANE-DROPDOWN-CENTRED) — FOUNDER RULING, not drift.
        // These read `'top-left'` / `'top-right'`, the C59 mirrored pair. Asked where the two
        // dropdowns belong, he answered verbatim: *"THEY NEED TO BE CENTERED."* What the arm
        // exists to prove is unchanged — BOTH panes still mount a picker, from this shell, with
        // an explicit position — so it is re-pointed at the ruling rather than deleted.
        expect(src).toMatch(/paneId: LEFT_PANE[\s\S]{0,80}corner: 'top-center'/);
        expect(src).toMatch(/paneId: RIGHT_PANE[\s\S]{0,80}corner: 'top-center'/);
        expect(read('apps/editor/src/engine/views/PaneViewPicker.ts')).toContain('reasonEl');
    });

    // ⭐ RE-POINTED 2026-09-06 (§ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN, L-13015/L-13025).
    //
    // These four arms asserted that `SiteAuthoringPaneShell` mounts THIS control per pane as
    // the floating `.svq-bar--pane`. It no longer does, and that is a FOUNDER RULING, not
    // drift: he photographed three switchers stacked over one pane and said *"keep the one,
    // the formal and more robust only, and keep it DROP DOWN only … when in split view … keep
    // TWO dropdown panels"*, then completed it with *"exactly ONE dropdown per pane, carrying
    // ALL views, present from STARTUP"*. So the invariant these arms guard has MOVED — the
    // panel is now hosted inside each pane's `PaneViewPicker` popup — and they are re-pointed
    // at the new host rather than deleted. ⛔ The thing they must keep proving is unchanged
    // and is the reason they exist: ONE panel per pane, ONE store, ONE shared camera memory,
    // and both torn down with the shell.
    it('⭐ the shell mounts ONE panel PER PANE — now INSIDE that pane dropdown', () => {
        const code = codeOnly(read(SHELL));
        // One `panel` port set, handed to BOTH pickers — so the two panes cannot acquire
        // different rows, different ports or different cameras.
        expect(code).toMatch(/mountPaneViewPicker\(\{[\s\S]{0,160}paneId: LEFT_PANE[\s\S]{0,160}panel/);
        expect(code).toMatch(/mountPaneViewPicker\(\{[\s\S]{0,160}paneId: RIGHT_PANE[\s\S]{0,160}panel/);
        // ⛔ AND THE FLOATING BAR IS GONE — not hidden, not conditional. A second control
        // that merely stopped being visible is the stack he photographed, one CSS rule away.
        expect(code).not.toMatch(/mountSiteViewQuickToggle\(/);
        // The dropdown host mounts it, in the MENU shape, with the split suppressed because
        // that popup already renders `describePaneLayoutActions`.
        const picker = codeOnly(read('apps/editor/src/engine/views/PaneViewPicker.ts'));
        expect(picker).toMatch(/mountSiteViewQuickToggle\(\{[\s\S]{0,400}shape: 'menu'/);
        expect(picker).toMatch(/showSplit: false/);
    });

    it('the panels share the ONE store — no second write path (C59 §2 invariant 3)', () => {
        const picker = codeOnly(read('apps/editor/src/engine/views/PaneViewPicker.ts'));
        expect(picker).toMatch(/mountSiteViewQuickToggle\(\{\s*store,/);
        const dom = codeOnly(read('apps/editor/src/engine/views/SiteViewQuickToggle.ts'));
        expect(dom).not.toContain('MultiPaneController');
        expect(dom).not.toMatch(/applyLayout\(/);
        expect(dom).toContain('store.dispatch(');
    });

    it('⭐ the globe FRAMING is shared by both panels — one camera, one memory', () => {
        // Two panels holding private memories of one camera would let the left one say
        // "you are on the globe" while the right one says you are not.
        const code = codeOnly(read(SHELL));
        expect(code).toContain('let globeFraming');
        expect(code).toContain('getFraming: () => globeFraming');
        expect(code).toMatch(/onFramingChanged:[\s\S]{0,200}p\.refresh\(\)/);
    });

    it('both panels are torn down with the shell', () => {
        // The panel is disposed BY its dropdown host, and the host by the shell — so the
        // chain is asserted at both links rather than at a loop that no longer exists.
        expect(codeOnly(read(SHELL))).toMatch(/for \(const p of pickers\)[\s\S]{0,80}p\.dispose\(\)/);
        expect(codeOnly(read('apps/editor/src/engine/views/PaneViewPicker.ts')))
            .toMatch(/panel\?\.dispose\(\)/);
    });

    it('⛔ the SHELL bar is still BUDGETED, and the PANE panel is deliberately not', () => {
        const dom = codeOnly(read('apps/editor/src/engine/views/SiteViewQuickToggle.ts'));
        // No inline positioning — an inline `left` is invisible to the budget's arm.
        expect(dom).not.toMatch(/position:\s*['"]absolute['"]/);
        expect(dom).not.toMatch(/style\.left\s*=/);
        const css = codeOnly(read('apps/editor/src/ui/styles/panels/siteViewQuickToggle.ts'));
        const body = (sel: string): string => {
            const i = css.indexOf(`${sel} {`);
            return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
        };
        // `.svq-bar` — the shell shape — keeps the ONE published horizontal accounting.
        expect(body('.svq-bar')).toContain('left: var(--shell-canvas-cx');
        expect(body('.svq-bar')).not.toMatch(/left:\s*50%/);
        expect(body('.svq-bar')).toContain('var(--shell-topbar-h');
        // `.svq-bar--pane` is PANE chrome: absolute inside its own pane, so it never
        // overlays its sibling — and `shellFloatBudget` ARM D only classifies `fixed` rules.
        expect(body('.svq-bar--pane')).toContain('position: absolute');
        expect(body('.svq-bar--pane')).not.toContain('position: fixed');
    });

    it('⛔ the sheet is actually INJECTED — an unregistered sheet renders nothing', () => {
        // "Authored but unwired" is this repo's most-repeated defect.
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
// IT NEVER ENTERS THE C60 ENTRY FLOW
// ════════════════════════════════════════════════════════════════════════════════

describe('§VIEW-PANEL-PER-PANE — ⛔ it never enters the C60 entry flow (C19 §1.3/§1.4)', () => {
    it('⭐ NO site.entry.* intent is producible from this control, over every input', () => {
        // The parcel boundary is a ONE-SHOT IMMUTABLE polygon and `site.entry.select-parcel`
        // is the one intent that can commit it. A mid-project button that re-opened that
        // machine would walk the user toward re-committing the site of a project that
        // already has one. Pinned as a PROPERTY over the whole input space.
        const layouts: PaneLayout[] = [
            SPLIT, EMPTY, SOLO_MAP, { [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: null },
        ];
        const allowed = [
            'view.pane.assign', 'view.pane.solo',
            'view.site.frame-globe', 'view.site.frame-site', 'view.site.basemap',
        ];
        for (const layout of layouts) {
            for (const paneId of [undefined, LEFT_PANE, RIGHT_PANE]) {
                for (const globeFraming of ['site', 'world'] as SiteViewGlobeFraming[]) {
                    for (const basemap of ['map', 'satellite', null] as const) {
                        for (const canReturnToSite of [true, false]) {
                            const m = describeSiteViewQuickToggle({
                                layout, canRestoreSplit: false, paneId, globeFraming, basemap,
                                canReturnToSite,
                            });
                            for (const s of m.segments) {
                                for (const i of segmentClickIntents(s, layout)) {
                                    expect(i.type.startsWith('site.entry.'), i.type).toBe(false);
                                    expect(allowed).toContain(i.type);
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    it('the model imports NO store and NO reducer — it cannot reach a hand-off', () => {
        // ⚠ `codeOnly`, and this file's own header says why: the header of the module under
        // test EXPLAINS the absence by naming `siteEntryPaneIntent()`, so the raw text
        // matches the very pattern this arm forbids.
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
        expect(t.instant).toBe(false);
        expect(t.durationS).toBeGreaterThan(0);
        expect(INITIAL_SITE_ENTRY_STATE.stage).toBe('world');
    });
});

describe('§VIEW-PANEL-PER-PANE — the production wiring is real, not authored-and-unwired', () => {
    const SHELL = 'apps/editor/src/engine/views/SiteAuthoringPaneShell.ts';

    it('⭐ the shell PASSES both port sets — an omitted port disables its rows', () => {
        const src = read(SHELL);
        expect(src).toContain('defaultSiteViewCameraPorts');
        expect(src).toContain('defaultSiteViewBasemapPorts');
        // §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — the ports now travel to the
        // panel through the pane dropdown that hosts it. The shell is still the ONE place
        // that resolves them (P1), which is what this arm exists to hold.
        expect(src).toMatch(/const panel = \{[\s\S]{0,300}camera,[\s\S]{0,120}basemap,/);
        expect(codeOnly(read('apps/editor/src/engine/views/PaneViewPicker.ts')))
            .toMatch(/mountSiteViewQuickToggle\(\{[\s\S]{0,500}camera: opts\.panel\.camera/);
    });

    it('the ports resolve the DECLARED globals — no new machinery, no window-any (P4)', () => {
        const code = codeOnly(read(SHELL));
        expect(code).toContain('window.pryzmGetSiteEntryCameraHost');
        // The return trip is the ONE declared `site.zoom-to-site` action.
        expect(code).toContain('window.pryzmZoomToSite');
        // The basemap swap is the ONE declared map function, re-hosted.
        expect(code).toContain('window.pryzmSetSiteBasemap');
        expect(code).toContain('window.pryzmGetSiteBasemap');
        expect(code).not.toMatch(/window as any/);
        expect(code).not.toMatch(/altitudeM:\s*\d/);
    });

    it('⭐ §GLOBE-KEEPS-THE-VIEW (L-13070) — the shell issues NO outbound flight at all', () => {
        // The founder's defect in one assertion. `frameGlobe` used to end
        // `flyToGeographic(worldFramingTarget())` — 15°N 5°E at 20 000 km — which is why his
        // Barcelona parcel became the whole Earth. The row is now a SURFACE swap and nothing
        // else, and "nothing else" is only checkable as an absence.
        const code = codeOnly(read(SHELL));
        expect(code).not.toMatch(/worldFramingTarget/);
        expect(code).not.toMatch(/flyToGeographic/);
        // The return trip still owns the ONE declared reframe action, on its reframe arm only.
        expect(code).toContain('siteFramingReturnDecision');
        expect(code).toMatch(/decision\.action === 'reframe'[\s\S]{0,80}pryzmZoomToSite/);
    });

    it('every global it reaches for is actually TYPED (P4)', () => {
        const g = read('apps/editor/src/types/globals.d.ts');
        expect(g).toContain('pryzmGetSiteEntryCameraHost?:');
        expect(g).toContain('pryzmZoomToSite?:');
        expect(g).toContain('pryzmSetSiteBasemap?:');
        expect(g).toContain('pryzmGetSiteBasemap?:');
        // §L-6806 — `durationS` was missing from the declaration while the implementation
        // accepted it, so every `SiteEntryCameraTarget` passed through was silently untyped.
        expect(g).toMatch(/durationS\?:\s*number/);
        // §GLOBE-KEEPS-THE-VIEW (L-13070) — the altitude reading the `3D Site` row's carry
        // decision is made from. OPTIONAL: a host without it degrades to the old always-reframe.
        expect(g).toMatch(/getCameraAltitudeM\?\(\):\s*number \| null/);
    });

    it('⛔ the DOM half still reads no globals of its own', () => {
        // It is chrome. Knowing that the world framing comes from C60, or that the basemap
        // swap is a window hook, is the composition layer's job (P1).
        const dom = codeOnly(read('apps/editor/src/engine/views/SiteViewQuickToggle.ts'));
        expect(dom).not.toMatch(/window\.pryzm/);
        expect(dom).not.toMatch(/worldFramingTarget/);
    });

    it('⛔ the globe pill is STYLED, and the brand is white + purple only', () => {
        const css = codeOnly(read('apps/editor/src/ui/styles/panels/siteViewQuickToggle.ts'));
        expect(css).toContain('.svq-btn--globe');
        expect(css).toContain('#6600FF');
        // ⚠ Matched as a COLOUR VALUE, not as a word. A prose ban on the word would fire on
        // the stylesheet's own comment explaining the ban.
        expect(css).not.toMatch(/:\s*(#000\b|#000000|black)\b/);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// §PANE-DROPDOWN-VISIBLE (L-13052) — THE DROPDOWN WAS BUILT AND COULD NOT BE SEEN
// ════════════════════════════════════════════════════════════════════════════════
//
// Founder 2026-09-07, with two red-boxed screenshots: *"I WANT A DROP DOWN PANEL WHERE USER
// CAN SELECT FROM ANY OTHER VIEW TO RENDER INSTEAD"* and *"REMOVE THOSE TWO SMALL PANELS —
// 2D SITE / 2D SATELLITE — IS HIDDEN ON THE LEFT HAND SIDE TOP RIGHT CORNER."*
//
// ⭐ THE CONTROL EXISTED AND EVERY BEHAVIOURAL ARM ABOVE PASSED. All three defects were
// PAINT ORDER and CASCADE — facts no headless DOM assertion in this file can observe,
// because jsdom/happy-dom resolve neither stacking order nor `!important`. So they are
// asserted where they are decided: in the source text of the two files that declare them.
//
// ⛔ EACH ARM PINS A MEASURED TIE, NOT A PREFERENCE. Every number here was read off the
// file that owns the rival value, and the rival file is named in the arm.
describe('§PANE-DROPDOWN-VISIBLE (L-13052) — the picker is actually PAINTED', () => {
    const PICKER = 'apps/editor/src/engine/views/PaneViewPicker.ts';
    const SHEET = 'apps/editor/src/ui/styles/panels/siteViewQuickToggle.ts';
    const MAP = 'apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts';

    it('⛔ the picker outranks the MapLibre overlay it shares a stacking context with', () => {
        // THE DEFECT: both were `zIndex: '40'`. The pane element is `position: relative`
        // with `z-index: auto`, so it is NOT a stacking context and the tie fell to DOM
        // order — and the map overlay is appended LAST, always, because the picker mounts
        // with the shell and the overlay when the renderer mounter runs. The left pane's
        // dropdown was covered edge to edge by the pastel map.
        const mapZ = /zIndex:\s*'(\d+)'/.exec(
            codeOnly(read(MAP)).slice(codeOnly(read(MAP)).indexOf('pryzm-gis-map2d')),
        );
        expect(mapZ).not.toBeNull();
        const pickerZ = /zIndex:\s*'(\d+)'/.exec(codeOnly(read(PICKER)));
        expect(pickerZ).not.toBeNull();
        // STRICTLY greater — equality is the bug, not a near miss.
        expect(Number(pickerZ![1])).toBeGreaterThan(Number(mapZ![1]));
    });

    it('⛔ the MENU shape neutralises `.svq-bar`\'s `position: fixed`', () => {
        // THE DEFECT: the root carries BOTH classes and `.svq-bar--menu` reset display,
        // padding, border, background, shadow and max-width but never `position` — so the
        // six rows were painted FIXED at the top-centre of the WINDOW, outside the popup
        // that hosts them, at `z-index: 8980`. The file's own comment asserted the reset
        // that the sheet did not perform.
        const css = codeOnly(read(SHEET));
        const menu = css.slice(css.indexOf('.svq-bar--menu {'));
        const block = menu.slice(0, menu.indexOf('}'));
        expect(block).toMatch(/position:\s*static/);
        expect(block).toMatch(/top:\s*auto/);
        expect(block).toMatch(/left:\s*auto/);
        expect(block).toMatch(/transform:\s*none/);
        expect(block).toMatch(/z-index:\s*auto/);
    });

    it('⛔ the basemap-chip hide rule can beat the chip\'s INLINE `display`', () => {
        // THE DEFECT: `SiteBoundaryMap2D` builds the chip with an inline `display: 'flex'`,
        // and an inline declaration outranks any author rule at any specificity — so the
        // scoped `display: none` did nothing and the founder kept seeing the chip. The
        // SCOPE is deliberate and must not widen: the map also mounts standalone, where
        // this chip is the only basemap route (C19 §5.6 clause 4 / L-942).
        expect(codeOnly(read(MAP))).toMatch(/pryzm-gis-basemap-toggle/);
        const css = codeOnly(read(SHEET));
        expect(css).toMatch(
            /#pryzm-site-authoring-panes\s+\.pryzm-gis-basemap-toggle\s*\{\s*display:\s*none\s*!important;/,
        );
        // …and it stays SCOPED — an unscoped rule would delete the standalone route.
        expect(css).not.toMatch(/^\s*\.pryzm-gis-basemap-toggle\s*\{/m);
    });

    it('⭐ the popup measures ITS OWN PANE, never the window (C59 §2.10.3 clause 4)', () => {
        // `max-height: 70vh` and `max-width: 340px` were window/half-screen assumptions in a
        // box that is neither. Measuring `paneEl` keeps the control pane-anchored — the
        // opposite of the L-13027 window-anchoring defect, not a repeat of it.
        const picker = codeOnly(read(PICKER));
        expect(picker).toContain('sizePopupToPane');
        expect(picker).toMatch(/paneEl\.clientWidth/);
        expect(picker).toMatch(/paneEl\.clientHeight/);
        // ⛔ and it is still a CHILD of its pane — never `position: fixed`.
        expect(picker).not.toMatch(/position:\s*'fixed'/);
    });
});
