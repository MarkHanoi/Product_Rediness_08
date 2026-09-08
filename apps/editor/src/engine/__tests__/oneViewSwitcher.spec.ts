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
 *   ARM I — ⭐ THE REPLACEMENT IS REAL DOM. `ViewSwitcherPill` is MOUNTED here, opened,
 *     closed, relabelled and disposed. §COMMITTED-IS-NOT-REACHABLE: a retirement whose
 *     replacement was only described would leave the founder with a quieter screen and no
 *     way to switch — a worse product than the two rows.
 *   ARM J — the pill goes up exactly where the rows come down, and every surface that brings
 *     its OWN switcher stands it down (SWITCHER COUNT == VISIBLE VIEW-REGION COUNT, L-13015).
 *   ARM K — the two things this lane decided NOT to touch, pinned so the decision cannot be
 *     reversed by accident in either direction: the plan pane's `svp-view-select` is already
 *     its ONE dropdown (no second one is mounted beside it), and the right-hand
 *     `Grid · IFC · V/G · Range` toolbar switches no view at all — it is view PROPERTIES
 *     (C59 §6), a different concern, and it is untouched.
 *
 * ⚠ SOURCE-TEXT ARMS (A–H, J, K). `mountGISArea` is a ~7,000-line closure whose controls are
 * built inside private arrow functions with no exported seam. Those arms measure that the
 * teardown is at the transition, that the classification matches the source, and that every
 * relocated capability is still declared. ARM I is the one that mounts DOM. Nothing here
 * measures a pixel, and the founder SEEING a quiet top bar is not established by this file.
 */

import { describe, it, expect, afterEach } from 'vitest';
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
    pryzmViewPillLabel,
    shouldRetireLegacyViewBars,
    type ViewSwitcherPhase,
} from '../views/legacyViewSwitcherRetirement';
import {
    VIEW_SWITCHER_PILL_UNKNOWN_LABEL,
    mountViewSwitcherPill,
} from '../views/ViewSwitcherPill';
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

// ═════════════════════════════════════════════════════════════════════════════════════════
// ARM I — THE REPLACEMENT IS REAL DOM, NOT A PLAN.
//
// ⭐ The other arms read source text; these MOUNT the control. §COMMITTED-IS-NOT-REACHABLE:
// a retirement whose replacement was only described would leave the founder with a quieter
// screen and no way to switch — which is a worse product than the two rows.
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM I — the PRYZM view keeps a REAL dropdown', () => {
    const region = (): HTMLElement => {
        const el = document.createElement('div');
        el.id = 'test-view-region';
        el.style.position = 'relative';
        document.body.appendChild(el);
        return el;
    };

    afterEach(() => { document.body.replaceChildren(); });

    /** A menu body that records what the pill did to it. */
    const recordingMenu = () => {
        const calls = { mounted: 0, repaints: 0, disposes: 0 };
        return {
            calls,
            mountMenu: (body: HTMLElement) => {
                calls.mounted += 1;
                const row = document.createElement('button');
                row.setAttribute('data-testid', 'fake-menu-row');
                row.textContent = '3D Site';
                body.appendChild(row);
                return {
                    repaint: () => { calls.repaints += 1; },
                    dispose: () => { calls.disposes += 1; },
                };
            },
        };
    };

    it('mounts inside its REGION, positioned relative to it — never fixed to the window (L-13027)', () => {
        const parent = region();
        const m = recordingMenu();
        const pill = mountViewSwitcherPill({ parent, label: () => '3D PRYZM', mountMenu: m.mountMenu });
        expect(pill.element.parentElement).toBe(parent);
        expect(pill.element.style.position).toBe('absolute');
        // Centred on the REGION — 50% of this box, not of the canvas or the viewport.
        expect(pill.element.style.left).toBe('50%');
        expect(pill.element.style.transform).toBe('translateX(-50%)');
        // The same band `PaneViewPicker` claims, so the two read as one chrome language.
        expect(pill.element.style.zIndex).toBe('60');
        pill.dispose();
    });

    it('the trigger NAMES the current view, re-read on every repaint — never a remembered click', () => {
        const parent = region();
        const m = recordingMenu();
        let mode: string | null = 'Top';
        const pill = mountViewSwitcherPill({
            parent, label: () => pryzmViewPillLabel(mode), mountMenu: m.mountMenu,
        });
        const trigger = parent.querySelector('[data-testid="view-switcher-pill-trigger"]')!;
        expect(trigger.textContent).toBe('2D PRYZM ▾');
        mode = '3D';
        pill.refresh();
        expect(trigger.textContent).toBe('3D PRYZM ▾');
        pill.dispose();
    });

    it('⛔ an unreportable view prints a NEUTRAL word, never a guessed view name (C84 EI-1b)', () => {
        const parent = region();
        const m = recordingMenu();
        const pill = mountViewSwitcherPill({ parent, label: () => null, mountMenu: m.mountMenu });
        expect(parent.querySelector('[data-testid="view-switcher-pill-trigger"]')!.textContent)
            .toBe(`${VIEW_SWITCHER_PILL_UNKNOWN_LABEL} ▾`);
        pill.dispose();
    });

    it('opens on the trigger, closes on Escape and on an outside click', () => {
        const parent = region();
        const m = recordingMenu();
        const pill = mountViewSwitcherPill({ parent, label: () => 'X', mountMenu: m.mountMenu });
        const trigger = parent.querySelector<HTMLButtonElement>('[data-testid="view-switcher-pill-trigger"]')!;
        const popup = parent.querySelector<HTMLElement>('[data-testid="view-switcher-pill-popup"]')!;

        expect(popup.style.display).toBe('none');
        trigger.click();
        expect(popup.style.display).toBe('block');
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(popup.style.display).toBe('none');

        trigger.click();
        expect(popup.style.display).toBe('block');
        document.body.click();
        expect(popup.style.display).toBe('none');
        pill.dispose();
    });

    it('⛔ the popup body is INJECTED, mounted ONCE, and repainted on every open', () => {
        const parent = region();
        const m = recordingMenu();
        const pill = mountViewSwitcherPill({ parent, label: () => 'X', mountMenu: m.mountMenu });
        expect(m.calls.mounted).toBe(1);
        expect(parent.querySelector('[data-testid="fake-menu-row"]')).not.toBeNull();

        const trigger = parent.querySelector<HTMLButtonElement>('[data-testid="view-switcher-pill-trigger"]')!;
        trigger.click();
        trigger.click();
        trigger.click();
        // Two opens ⇒ two repaints, and STILL one mount: the pill re-hosts a control, it
        // does not rebuild one (which is how a second option table gets born).
        expect(m.calls.mounted).toBe(1);
        expect(m.calls.repaints).toBe(2);
        pill.dispose();
        expect(m.calls.disposes).toBe(1);
        expect(parent.querySelector('[data-testid="view-switcher-pill"]')).toBeNull();
    });

    it('⭐ the C59 Phase-3 limit is PRINTED in the popup, not buried in a title (STR §26.1.1)', () => {
        const parent = region();
        const m = recordingMenu();
        const pill = mountViewSwitcherPill({
            parent, label: () => '3D PRYZM', mountMenu: m.mountMenu,
            limitNote: PRYZM_VIEW_PANE_LIMIT_NOTE,
        });
        const note = parent.querySelector('[data-testid="view-switcher-pill-note"]');
        expect(note).not.toBeNull();
        expect(note!.textContent).toBe(PRYZM_VIEW_PANE_LIMIT_NOTE);
        pill.dispose();
    });

    it('idempotent per region — a re-mount never leaves two pills over one view', () => {
        const parent = region();
        const a = mountViewSwitcherPill({ parent, label: () => 'A', mountMenu: recordingMenu().mountMenu });
        const b = mountViewSwitcherPill({ parent, label: () => 'B', mountMenu: recordingMenu().mountMenu });
        expect(parent.querySelectorAll('[data-testid="view-switcher-pill"]').length).toBe(1);
        expect(parent.querySelector('[data-testid="view-switcher-pill-trigger"]')!.textContent).toBe('B ▾');
        a.dispose();
        b.dispose();
    });

    it('a menu that throws does not take the pill with it — it says so instead', () => {
        const parent = region();
        const pill = mountViewSwitcherPill({
            parent,
            label: () => '3D PRYZM',
            mountMenu: () => { throw new Error('menu exploded'); },
        });
        expect(parent.querySelector('[data-testid="view-switcher-pill"]')).not.toBeNull();
        expect(parent.querySelector('[data-testid="view-switcher-pill-trigger"]')!.textContent).toBe('3D PRYZM ▾');
        const err = parent.querySelector('[data-testid="view-switcher-pill-menu-error"]');
        expect(err).not.toBeNull();
        expect(err!.textContent).toMatch(/GIS panel/);
        pill.dispose();
    });

    it('`pryzmViewPillLabel` uses the founder\'s spelling, and refuses to name what it cannot map', () => {
        expect(pryzmViewPillLabel('3D')).toBe('3D PRYZM');
        expect(pryzmViewPillLabel('Top')).toBe('2D PRYZM');
        // ⚠ An elevation is a real PRYZM view and is NOT one of the six — it gets an honest
        // label rather than being folded into "3D PRYZM" to fit the panel.
        expect(pryzmViewPillLabel('Front')).toBe('PRYZM elevation — Front');
        expect(pryzmViewPillLabel('Ceiling')).toBe('PRYZM reflected ceiling');
        expect(pryzmViewPillLabel(null)).toBeNull();
        expect(pryzmViewPillLabel('something-else')).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// ARM J — SWITCHER COUNT == VISIBLE VIEW-REGION COUNT (L-13015), as WIRING.
// The pill goes up exactly where the legacy rows come down, and stands down wherever another
// switcher owns the region. Source-text, for the same reason the other GIS arms are.
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM J — the pill is mounted where the rows retire, and nowhere else', () => {
    it('the retirement mounts it in the same breath', () => {
        const body = GIS.slice(GIS.indexOf('const retireLegacyViewBars ='));
        expect(body.slice(0, body.indexOf('\n    };'))).toContain('ensurePryzmViewPill()');
    });

    it('⭐ and RE-READS the label AFTER the awaited activation, not only before it', () => {
        // The mount happens inside `retireLegacyViewBars`, which runs BEFORE
        // `await _viewController.activate(mode)` — so at mount time `currentMode` is still
        // the view being left. Without a second call the pill names the previous view.
        const at = GIS.indexOf('const activateView = async');
        const body = GIS.slice(at, GIS.indexOf('\n    };', at));
        const first = body.indexOf('ensurePryzmViewPill()');
        const activate = body.indexOf('await props._viewController.activate(mode)');
        expect(activate).toBeGreaterThan(-1);
        // The one inside `retireLegacyViewBars` is not in this body; the call here must come
        // AFTER the await.
        expect(first).toBeGreaterThan(activate);
    });

    it('⛔ it injects the SHIPPED option host — no seventh copy of the founder\'s six', () => {
        const body = GIS.slice(GIS.indexOf('const ensurePryzmViewPill ='));
        const fn = body.slice(0, body.indexOf('\n    };'));
        expect(fn).toContain('mountViewSegmentSwitcher(window)');
        expect(fn).toContain('limitNote: PRYZM_VIEW_PANE_LIMIT_NOTE');
        // A READING of the authority that performed the switch, never a remembered dispatch.
        expect(fn).toContain('props._viewController?.currentMode');
    });

    it('every surface that brings its OWN switcher stands the pill down', () => {
        // Same-indent terminator, the idiom `bim3dChromeQuiet.spec.ts` uses: brace-counting is
        // defeated by the template literals and comments these closures are full of, and a
        // fixed character window would silently read into the NEXT function and pass on its
        // call instead of this one's.
        const closure = (name: string): string => {
            const at = GIS.indexOf(`const ${name} = `);
            expect(at, `${name} not found in GISAreaLayout`).toBeGreaterThan(-1);
            const end = GIS.indexOf('\n    };', at);
            expect(end, `${name} has no same-indent terminator`).toBeGreaterThan(at);
            return GIS.slice(at, end);
        };
        for (const owner of [
            'mountResultToggleBar',
            'mountFormaViewToggle',
            'toggleGIS',
            'mountSiteAuthoringPanes',
        ]) {
            expect(
                closure(owner).includes('removePryzmViewPill()'),
                `${owner} owns the region's switcher, so it must stand the pill down (L-13015)`,
            ).toBe(true);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// ARM K — THE RIGHT-HAND BAR IS VIEW **PROPERTIES**, AND THE PLAN PANE KEEPS ONE VIEW
// CONTROL. An arm keeps both from being quietly reversed — a future "consolidation" deleting
// the plan pane's select, or a future "uniformity" pass stacking a second switcher beside it.
//
// ⚠ AMENDED 2026-09-08 (§ONE-REGION-SWITCHER, L-13257). The properties half is UNCHANGED and
// still holds. The plan-pane half said the select should stay AS IT WAS; the founder overruled
// that on FORM, and the select now lives inside the shared pill. See the note on the arm.
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§ONE-VIEW-SWITCHER · ARM K — the plan pane keeps ONE view control, and its toolbar is properties', () => {
    const SVM = read('apps/editor/src/engine/views/SplitViewManager.ts');
    const VHB = read('apps/editor/src/ui/views/ViewHeaderButtons.ts');

    it('the pane builds exactly ONE view control — its own `svp-view-select`', () => {
        const built = SVM.match(/viewSel\.className = 'svp-view-select'/g) ?? [];
        expect(built.length).toBe(1);
    });

    // ═════════════════════════════════════════════════════════════════════════════════════
    // ⛔ AMENDED 2026-09-08 BY §ONE-REGION-SWITCHER (L-13257) — THE INTENT SURVIVES, THE
    // CONCLUSION DOES NOT, AND THE DIFFERENCE IS THE LESSON.
    //
    // This arm used to read: *"NO second switcher is mounted into it"*, enforced by asserting
    // that `SplitViewManager` contains none of `mountViewSwitcherPill`,
    // `mountSiteViewQuickToggle`, `mountViewSegmentSwitcher`, `mountPaneViewPicker`.
    //
    // ⭐ THE INTENT — never TWO view controls over one region — IS STILL RIGHT AND IS STILL
    // ENFORCED, below. What was wrong was inferring from it that the pane's control must stay
    // as it was. The founder photographed the result: every other region carried a centred
    // white/violet pill and this one carried a native `<select>` sunk in a grey uppercase
    // header — *"we still have the legacy style"*.
    //
    // ⛔ THE ORIGINAL ASSERTION COULD NOT HAVE CAUGHT THAT, BY CONSTRUCTION. It measured the
    // COUNT of controls; the defect was their FORM. A count invariant is blind to a form
    // divergence, so this arm passed for the whole period the divergence shipped. The second
    // axis lives in `viewRegionSwitcher.spec.ts` (`viewRegionSwitcherCoverage`), and the
    // amendment here is to measure the count in a way that survives the select MOVING.
    // ═════════════════════════════════════════════════════════════════════════════════════
    it('⛔ still exactly ONE view control — the select is RE-PARENTED, not duplicated', () => {
        // The stack this originally guarded against (L-13015) is a pill mounted BESIDE a
        // select that stays in the header. That is still forbidden, and this is what it
        // would look like: the header append coming back while the pill also mounts.
        expect(SVM).toContain('mountViewSwitcherPill');
        expect(SVM).not.toContain('titleGroup.appendChild(viewSel)');
        // And still only one select is BUILT — a pill that minted its own rows for the same
        // view definitions would be a second list of the same thing.
        expect((SVM.match(/viewSel\.className = 'svp-view-select'/g) ?? []).length).toBe(1);
    });

    it('⛔ and no OTHER switcher component is stacked into the pane', () => {
        for (const rival of ['mountSiteViewQuickToggle', 'mountPaneViewPicker']) {
            expect(SVM.includes(rival), `SplitViewManager must not host ${rival}`).toBe(false);
        }
        // `mountViewSegmentSwitcher` IS hosted now — but INSIDE the pill's popup, which is
        // the same re-hosting `ViewSwitcherPill` already does on `#container`. Pinned so the
        // exception stays deliberate rather than becoming a loophole.
        expect(SVM).toContain('mountViewSegmentSwitcher');
        expect(SVM).toContain('_mountRegionPill');
    });

    it('the DECISION is written where the control is, not only in a report', () => {
        expect(SVM).toContain('§ONE-VIEW-SWITCHER');
        // Both halves of it: why one is enough, and what this pane genuinely cannot do.
        expect(SVM).toMatch(/SWITCHER COUNT == VISIBLE VIEW-REGION COUNT/);
        expect(SVM).toMatch(/cannot host the 3D Site/);
        // ⭐ And the supersession is recorded beside the superseded reasoning, not only here.
        expect(SVM).toContain('§ONE-REGION-SWITCHER');
        expect(SVM).toMatch(/SUPERSEDED 2026-09-08/);
    });

    it('⭐ the right-hand toolbar switches NO view — it is Grid / IFC / V-G / Range / Close', () => {
        // The founder's screenshot boxed it with the two legacy rows. It is a different
        // concern (C59 §6 — standardized view PROPERTIES), so it is untouched. The arm proves
        // the classification rather than asserting it: none of those controls dispatches a
        // declared view action or a pane-layout intent.
        for (const t of ['Hide grid', 'Visibility & Graphics', 'View Properties & Range']) {
            expect(VHB.includes(t), `${t} must still be built`).toBe(true);
        }
        for (const viewish of ['site.earth', 'site.globe', 'site.map-2d', 'site.bim-3d', 'view.pane.assign']) {
            expect(VHB.includes(viewish), `the header toolbar must not dispatch ${viewish}`).toBe(false);
        }
    });
});
