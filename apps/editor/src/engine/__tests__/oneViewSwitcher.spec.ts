/**
 * §ONE-VIEW-SWITCHER (founder 2026-09-07 · L-13160 · C59 §1.4 / §2 invariant 9 / §4 Phase 3)
 *
 * THE ASK, VERBATIM:
 *   *"At the moment we have a sound format at the beginning — this shall continue during the
 *    whole project life cycle — at the beginning we have a dropdown panel to select the
 *    desired view — but after we move into PRYZM 3D / PRYZM 2D view the layout changes — so
 *    I want to keep the same all through."*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE IS FOR, AND WHY THE CLASSIFICATION ARMS OUTNUMBER THE TEARDOWN ARM
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Retiring two rows of buttons is one line. The thing that can go WRONG is deleting a
 * working control because it sat next to a redundant one — those rows carry `⤢ Zoom to Site`,
 * `☀ Analysis`, `◉ Real` / `▢ Massing`, `▶ Fly tour` and `▤ All floors`, none of which is a
 * view switch. So most of this file pins the SORT rather than the removal:
 *
 *   ARM A — the classification is TOTAL and CONSISTENT: every legacy control is classified,
 *     every view switch has the app's view layout as its subject, and every non-view control
 *     has the Cesium site surface as its subject. ⭐ That last equivalence is the whole
 *     safety argument: a control whose subject is hidden on a PRYZM view was not doing
 *     anything there, so its absence there is not a loss.
 *   ARM B — every view switch RETIRES INTO a real row of the ONE panel definition
 *     (`viewPanelOptions()`), or is explicitly recorded as staying declared elsewhere.
 *   ARM C — every non-view control still has a DECLARED home (`GIS_ACTIONS`), and the one
 *     that does not resolve (`site.floor-filter`) is named as a pre-existing gap rather than
 *     silently inherited.
 *   ARM D — THE LABELS STILL EXIST IN THE SOURCE. A renamed or deleted button fails here
 *     instead of leaving a classification table describing a screen nobody ships.
 *   ARM E — THE TEARDOWN IS AT THE CHOKE POINT. `activateView` is the ONE function every
 *     route into a PRYZM view lands on; §BIM-3D-CHROME-QUIET put its teardown at
 *     `applyBimDualPane`, which is one route of four, and that is why the founder saw the
 *     rows again after clicking `3D PRYZM` on the dropdown.
 *   ARM F — ONE SURFACE PER PHASE, and the count follows the visible view regions.
 *   ARM G — ⛔ NEITHER BAR IS DELETED. Both still mount on the site views, where their
 *     controls have a subject.
 *   ARM H — THE HONESTY SURVIVES: C59 Phase 3 is still named, `bim-3d` is still refused
 *     per-pane BY NAME, and `596dfe21`'s draw-surface pin still names BOTH commit routes.
 *
 * ⚠ SOURCE-TEXT ARMS. `mountGISArea` is a ~7,000-line closure whose controls are built
 * inside private arrow functions with no exported seam. Nothing here measures a pixel; it
 * measures that the teardown is at the transition, that the classification matches the
 * source, and that every relocated capability is still declared. The founder SEEING a quiet
 * top bar is not established by this file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    LEGACY_BAR_CONTROLS,
    LEGACY_VIEW_BAR_RETIREMENT_REASON,
    PRYZM_VIEW_PANE_LIMIT_NOTE,
    describeViewSwitcherSurface,
    legacyBarControls,
    legacyNonViewControls,
    legacyViewBarsAllowedIn,
    legacyViewSwitches,
    shouldRetireLegacyViewBars,
    type ViewSwitcherPhase,
} from '../views/legacyViewSwitcherRetirement';
import { viewPanelOptions } from '../views/viewPanelOptions';
import { GIS_ACTIONS } from '../../ui/gis/gisActionRegistry';
import { DRAW_SURFACE_PIN_REASON } from '../views/siteAuthoringPaneDecisions';

const REPO = resolve(__dirname, '../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

const GIS = read('apps/editor/src/ui/layout/GISAreaLayout.ts');
const PANE_MODEL = read('apps/editor/src/engine/views/paneViewModel.ts');

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM A — the classification is total, and consistent by SUBJECT', () => {
    it('classifies every control on both legacy rows, with no duplicate ids', () => {
        const ids = LEGACY_BAR_CONTROLS.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        // Both rows are represented — a table describing only one of them would pass every
        // other arm here while leaving the second row on screen.
        expect(legacyBarControls('result-toggle').length).toBeGreaterThan(0);
        expect(legacyBarControls('forma-view-toggle').length).toBeGreaterThan(0);
    });

    it('⭐ a VIEW SWITCH always acts on the app view layout; everything else on the Cesium site surface', () => {
        for (const c of legacyViewSwitches()) {
            expect(`${c.id}:${c.subject}`).toBe(`${c.id}:app-view-layout`);
        }
        // THE SAFETY ARGUMENT, as an assertion. If a non-view control ever appears whose
        // subject is the app view layout, retiring the bar on a PRYZM view WOULD lose it and
        // this arm must fail rather than let the teardown stand.
        for (const c of legacyNonViewControls()) {
            expect(`${c.id}:${c.subject}`).toBe(`${c.id}:cesium-site-surface`);
        }
    });

    it('names all four non-view kinds — the sort is by what a control DOES, not by adjacency', () => {
        const kinds = new Set(legacyNonViewControls().map((c) => c.kind));
        expect(kinds).toEqual(new Set(['camera-action', 'render-mode', 'panel-toggle', 'level-filter']));
    });

    it('every control states its disposition — a row with no sentence is a row nobody checked', () => {
        for (const c of LEGACY_BAR_CONTROLS) {
            expect(c.disposition.length, `${c.id} has no disposition`).toBeGreaterThan(40);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM B — every view switch retires into the ONE panel definition', () => {
    const panelIds = new Set(viewPanelOptions().map((o) => o.id));

    it('`retiresInto` names a real `viewPanelOptions()` row', () => {
        for (const c of legacyViewSwitches()) {
            if (c.retiresInto === null) continue;
            expect(panelIds.has(c.retiresInto), `${c.id} → ${c.retiresInto} is not a panel row`).toBe(true);
        }
    });

    it('the six panel rows cover four of the five view switches; the fifth is recorded, not lost', () => {
        const withoutRow = legacyViewSwitches().filter((c) => c.retiresInto === null);
        // `◳ Plan` (site.plan-oblique) is not one of the founder's six. It is a CAMERA PRESET
        // of the 3D Site (C60 §6.5), so it stays on the Forma bar AND stays declared —
        // exactly what C19 §5.6 clause 4 requires of a route that leaves a host.
        expect(withoutRow.map((c) => c.id)).toEqual(['forma.plan-oblique']);
        expect(withoutRow[0]!.actionId).toBe('site.plan-oblique');
        expect(withoutRow[0]!.disposition).toMatch(/not removed/i);
    });

    it('a retiring switch dispatches the panel row\'s action — or says why it deliberately differs', () => {
        const byId = new Map(viewPanelOptions().map((o) => [o.id, o] as const));
        for (const c of legacyViewSwitches()) {
            if (c.retiresInto === null) continue;
            const row = byId.get(c.retiresInto)!;
            if (c.actionId === row.actionId) continue;
            // The ONE deliberate divergence: `◧ 3D + plan` opens the DUAL PANE
            // (`site.bim-split`) while the panel's `3D PRYZM` row activates the model
            // full-canvas (`site.bim-3d`) — §PARCEL-LAW-BIM3D chose that for a panel host on
            // purpose. A divergence with no sentence explaining it fails here.
            expect(`${c.id}:${c.actionId}`).toBe('result.bim-split:site.bim-split');
            expect(c.disposition).toMatch(/NOT the same dispatch/);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM C — no non-view control is swept up without a declared home', () => {
    const declaredIds = new Set(GIS_ACTIONS.map((a) => a.id));

    it('every declared `actionId` on the table resolves to a real `GIS_ACTIONS` row', () => {
        for (const c of LEGACY_BAR_CONTROLS) {
            if (c.actionId === null) continue;
            expect(declaredIds.has(c.actionId), `${c.id} cites undeclared action ${c.actionId}`).toBe(true);
        }
    });

    it('⚠ the ONE non-view control with no declared action is `▶ Fly tour`, and it says so', () => {
        const orphans = legacyNonViewControls().filter((c) => c.actionId === null);
        expect(orphans.map((c) => c.id)).toEqual(['result.fly-tour']);
        expect(orphans[0]!.disposition).toMatch(/NO DECLARED ACTION AND NO SECOND HOME/);
    });

    it('⚠ `site.floor-filter` is declared with NO entry point — a pre-existing gap, named on the row', () => {
        const decl = GIS_ACTIONS.find((a) => a.id === 'site.floor-filter')!;
        expect(decl.entryPoints).toEqual([]);
        expect(decl.unavailableReason ?? '').toMatch(/not yet re-hosted/i);
        const row = LEGACY_BAR_CONTROLS.find((c) => c.id === 'forma.floor-filter')!;
        expect(row.disposition).toMatch(/EMPTY `entryPoints`/);
    });

    it('the other four non-view actions DO have entry points, so the GIS-panel route is real', () => {
        for (const id of ['site.zoom-to-site', 'site.analysis', 'site.fidelity.real', 'site.fidelity.massing']) {
            const decl = GIS_ACTIONS.find((a) => a.id === id)!;
            expect(decl.entryPoints.length, `${id} has no entry point`).toBeGreaterThan(0);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM D — the classification still describes the shipped source', () => {
    it('every classified label is still minted in GISAreaLayout.ts', () => {
        for (const c of LEGACY_BAR_CONTROLS) {
            expect(GIS.includes(c.label), `${c.id}: label "${c.label}" is gone from GISAreaLayout`).toBe(true);
        }
    });

    it('both bar classes still exist — the table names the bars this app actually builds', () => {
        expect(GIS).toContain("bar.className = 'pryzm-result-toggle'");
        expect(GIS).toContain("bar.className = 'pryzm-forma-view-toggle'");
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM E — the teardown is at the CHOKE POINT, not at one route', () => {
    it('`activateView` retires the bars — the route `site.bim-3d` / `site.bim-plan` take', () => {
        // The founder's route: the dropdown's `3D PRYZM` / `2D PRYZM` rows dispatch
        // `pryzmActivateBimView`, which is `activateView`. §BIM-3D-CHROME-QUIET's teardown
        // was in `applyBimDualPane`, which this route never enters.
        const body = GIS.slice(GIS.indexOf('const activateView = async'));
        const end = body.indexOf('const gizmoMode');
        expect(end).toBeGreaterThan(0);
        expect(body.slice(0, end)).toContain('retireLegacyViewBars(');
    });

    it('`applyBimDualPane` routes through the SAME named retirement (no rival teardown)', () => {
        const body = GIS.slice(GIS.indexOf('const applyBimDualPane = async'));
        const end = body.indexOf('§FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — open a loading session');
        expect(end).toBeGreaterThan(0);
        expect(body.slice(0, end)).toContain("retireLegacyViewBars('applyBimDualPane')");
    });

    it('`pryzmActivateBimView` is still registered as `activateView` — the choke point is the real one', () => {
        expect(GIS).toContain('window.pryzmActivateBimView = (mode) =>');
        expect(GIS).toMatch(/window\.pryzmActivateBimView = \(mode\) =>\s*\n\s*activateView\(/);
    });

    it('⭐ ARM B of §BIM-3D-CHROME-QUIET survives: the retirement re-asserts `#container` positioning', () => {
        const body = GIS.slice(GIS.indexOf('const retireLegacyViewBars ='));
        const end = body.indexOf('// Active-state styling for the toggle buttons');
        expect(end).toBeGreaterThan(0);
        const fn = body.slice(0, end);
        expect(fn).toContain('ensureViewportPositioned(viewport)');
        // Both bars, one place. A retirement that removed only the strip is the bug that
        // left the founder's second row on screen.
        expect(fn).toContain('removeFormaViewToggle()');
        expect(fn).toContain('removeResultToggle()');
        // And it asks the PURE predicate rather than re-deciding here.
        expect(fn).toContain("shouldRetireLegacyViewBars('pryzm-view')");
    });

    it('the retirement logs a reason naming both halves of the finding', () => {
        expect(LEGACY_VIEW_BAR_RETIREMENT_REASON).toMatch(/view dropdown/);
        expect(LEGACY_VIEW_BAR_RETIREMENT_REASON).toMatch(/Cesium site surface/);
        expect(LEGACY_VIEW_BAR_RETIREMENT_REASON).toMatch(/stay mounted on the 3D Site \/ 3D Globe views/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM F — exactly ONE view-switching surface, in every phase', () => {
    const PHASES: readonly ViewSwitcherPhase[] = ['site-authoring-split', 'site-whole-screen', 'pryzm-view'];

    it('the surface is the pane dropdown everywhere — the founder\'s "same principle all through"', () => {
        for (const p of PHASES) {
            expect(`${p}:${describeViewSwitcherSurface(p).surface}`).toBe(`${p}:pane-dropdown`);
        }
    });

    it('SWITCHER COUNT == VISIBLE VIEW-REGION COUNT (L-13015)', () => {
        expect(describeViewSwitcherSurface('site-authoring-split').count).toBe(2);
        expect(describeViewSwitcherSurface('site-whole-screen').count).toBe(1);
        expect(describeViewSwitcherSurface('pryzm-view').count).toBe(1);
    });

    it('only the PRYZM phase dispatches the whole-screen route, and only it carries a limit note', () => {
        expect(describeViewSwitcherSurface('site-authoring-split').dispatch).toBe('view.pane.*');
        expect(describeViewSwitcherSurface('site-whole-screen').dispatch).toBe('view.pane.*');
        expect(describeViewSwitcherSurface('pryzm-view').dispatch).toBe('GIS_ACTIONS');

        expect(describeViewSwitcherSurface('site-authoring-split').limitNote).toBeNull();
        expect(describeViewSwitcherSurface('site-whole-screen').limitNote).toBeNull();
        expect(describeViewSwitcherSurface('pryzm-view').limitNote).toBe(PRYZM_VIEW_PANE_LIMIT_NOTE);
    });

    it('the legacy bars are refused on the PRYZM phase and ONLY there', () => {
        expect(shouldRetireLegacyViewBars('pryzm-view')).toBe(true);
        expect(legacyViewBarsAllowedIn('pryzm-view')).toBe(false);
        for (const p of ['site-authoring-split', 'site-whole-screen'] as const) {
            expect(`${p}:${shouldRetireLegacyViewBars(p)}`).toBe(`${p}:false`);
            expect(`${p}:${legacyViewBarsAllowedIn(p)}`).toBe(`${p}:true`);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM G — ⛔ neither bar is DELETED; both still mount on the site views', () => {
    it('`mountResultToggleBar` still exists and is still guaranteed by `ensureResultToggle`', () => {
        expect(GIS).toContain('const mountResultToggleBar = (): void =>');
        expect(GIS).toContain('const ensureResultToggle = (): void => { mountResultToggleBar(); };');
        // The photoreal globe landing still pre-mounts it — that view is where it IS the switch.
        expect(GIS).toContain("if (initial !== '2D') mountResultToggleBar();");
    });

    it('`mountFormaViewToggle` still exists and still calls `ensureResultToggle`', () => {
        expect(GIS).toContain('const mountFormaViewToggle = (initial: FormaViewMode');
        const body = GIS.slice(GIS.indexOf('const mountFormaViewToggle = (initial: FormaViewMode'));
        expect(body.slice(0, body.indexOf('const removeFormaViewToggle'))).toContain('ensureResultToggle();');
    });

    it('the Cesium-only controls are still built — nothing was deleted with the rows', () => {
        for (const label of ['▶ Fly tour', '☀ Analysis', '⤢ Zoom to Site', '▤ All floors']) {
            expect(GIS.includes(label), `${label} was deleted`).toBe(true);
        }
        expect(GIS).toContain('cesiumViewport?.setVisibleFormaLevels?.');
        expect(GIS).toContain('vp.flyTour()');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM H — the honesty this lane inherited is not deleted', () => {
    it('C59 Phase 3 is named on the surface the user reads, not only in a comment', () => {
        expect(PRYZM_VIEW_PANE_LIMIT_NOTE).toMatch(/C59 Phase 3/);
        expect(PRYZM_VIEW_PANE_LIMIT_NOTE).toMatch(/renderer still owns the whole viewport/);
        // And it offers the way back rather than stranding (C59 §2.9.3 clause 5 / L-942).
        expect(PRYZM_VIEW_PANE_LIMIT_NOTE).toMatch(/◧ Split/);
    });

    it('the pane registry still refuses `bim-3d` BY NAME — this lane faked nothing past Phase 3', () => {
        expect(PANE_MODEL).toContain("'bim-3d'");
        expect(PANE_MODEL).toMatch(/paneHostable:\s*false/);
        expect(PANE_MODEL).toMatch(/#container|whole viewport|owns the container/i);
    });

    it('⚠ `596dfe21`\'s draw-surface pin still names BOTH commit routes (do not undo it)', () => {
        expect(DRAW_SURFACE_PIN_REASON).toMatch(/drawn, or picked from the cadastre/);
        expect(DRAW_SURFACE_PIN_REASON).toMatch(/The 3D Site is live beside it\./);
    });
});
