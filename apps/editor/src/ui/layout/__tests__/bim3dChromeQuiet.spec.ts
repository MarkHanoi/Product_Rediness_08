/**
 * §BIM-3D-CHROME-QUIET (founder 2026-09-07 · L-13027 · L-13084 · C59 §2.10.3)
 *
 * THE ASK, VERBATIM:
 *   *"The PRYZM 3D view shall have just the two dropdowns to switch to other view — as we
 *    have on the initial layout — same principle — clean the rest on the top — make it
 *    simple."*
 *
 * He struck three things off the PRYZM 3D (BIM 3D + plan) split. This suite pins the ONE
 * that could be retired today — the segmented `[◧ 3D + plan][◉ 3D globe][◉ 3D Site]` strip —
 * and, more importantly, pins THE TWO THINGS THAT MADE IT SAFE. Both are the kind of fact a
 * later "tidy-up" silently reverses:
 *
 *   ARM A — THE STRIP IS RETIRED ON THAT VIEW, AND ONLY THERE. `applyBimDualPane` (the one
 *     transition into the BIM dual pane) tears it down; `mountResultToggleBar` is NOT deleted,
 *     because `ensureResultToggle()` (the Forma "3D Site" sub-bar) and `showSiteResultView('3D')`
 *     (the photoreal globe) still build it and on those views it is the switch.
 *
 *   ARM B — ⭐ THE POSITIONING INVARIANT DID NOT LEAVE WITH IT. This is the arm that earns
 *     the file. The strip was `position: absolute` on `#container`, so it needed an offset
 *     parent, so it ASSERTED `#container { position: relative }` as a side effect. `#container`
 *     is also the mount parent of `mountSiteAuthoringPaneShell` (`position:absolute; inset:0`)
 *     and of every floating panel in `GISAreaLayout`. Retiring the strip WITHOUT moving that
 *     assertion would have re-anchored all of them to the nearest positioned ANCESTOR — which
 *     is L-13027's defect verbatim (*"a control anchored to the canvas cannot be 'centred on
 *     the view' once the view stops being the canvas"*), reintroduced by the very change made
 *     to remove it. The assertion is now `ensureViewportPositioned`, a named function with ONE
 *     definition, and the BIM path calls it.
 *
 *   ARM C — NOTHING BECAME UNREACHABLE. The strip's three functions are declared
 *     `GIS_ACTIONS` rows (`site.bim-split` · `site.globe` · `site.earth`) rendered live by
 *     `renderGisActions` in the Project Browser's GIS tab. ⚠ This is a REAL DEGRADATION, and
 *     the arm exists to keep it visible rather than to bless it: a rail-panel route is not the
 *     one-gesture on-view switch the founder asked for. The on-view replacement is the two
 *     per-pane dropdowns, which need a `PaneLayoutStore` this split does not have — the
 *     registry refuses `bim-3d` per-pane BY NAME (C59 Phase 3). Arm C fails the moment one of
 *     those three declarations disappears, so the fallback cannot rot unnoticed.
 *
 * ⚠ SOURCE-TEXT ARMS. `mountGISArea` is a ~7,000-line closure whose controls are built inside
 * private arrow functions with no exported seam; happy-dom performs no layout and paints
 * nothing. Nothing here measures a pixel. It measures that the teardown is AT the transition,
 * that the invariant has a named owner, and that the fallback routes are still declared.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

const GIS = read('apps/editor/src/ui/layout/GISAreaLayout.ts');
const REGISTRY = read('apps/editor/src/ui/gis/gisActionRegistry.ts');
const PANE_MODEL = read('apps/editor/src/engine/views/paneViewModel.ts');
const BROWSER = read('apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts');
const SVM = read('apps/editor/src/engine/views/SplitViewManager.ts');
const SPLIT_CSS = read('apps/editor/src/ui/styles/panels/splitView.ts');
const ALH = read('apps/editor/src/ui/levels/ActiveLevelHUD.ts');
const DOCKING = read('apps/editor/src/ui/layout/DockingLayout.ts');
const CPL = read('apps/editor/src/ui/layout/CreatePanelLayout.ts');
const LG_RAIL = read('apps/editor/src/ui/ViewBrowser/panels/LevelsGridsRailPanel.ts');
const BINDER = read('apps/editor/src/engine/views/LevelPlanViewBinder.ts');
const PLAN_CANVAS = read('packages/core-app-model/src/views/PlanViewCanvas.ts');

/**
 * ⭐ SOURCE WITH COMMENTS REMOVED, and it is load-bearing for every "this is GONE" arm.
 * §BIM-3D-CHROME-QUIET documents each retired control IN PLACE — naming
 * `_setCameraElevation`, `_getLevels` and `projectContext.activeLevelId` in the comment
 * that explains why they left. A naive `not.toContain` over the raw file therefore fails
 * on the explanation rather than on a regression, which is the §RAF-GATE-COMMENT-BLIND
 * defect (P3, L-13084): a gate that counts sentences instead of code.
 */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const SVM_CODE = stripComments(SVM);

/** The body of a top-level CSS rule inside a `styles/panels/*.ts` template literal. */
function cssRule(src: string, selector: string): string {
  const at = src.indexOf(`\n${selector} {`);
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  const close = src.indexOf('\n}', open);
  return src.slice(open + 1, close);
}

/**
 * The body of a `const <name> = (...) => { … };` arrow declared inside `mountGISArea`,
 * from its opening brace to the first line that closes it at the SAME indent (`    };`).
 * Brace-counting would be defeated by the braces inside template literals and comments
 * these functions are full of; the indent terminator is exact because this file's closure
 * members are all declared at one level.
 */
function closureFn(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = `);
  expect(start, `${name} not found in GISAreaLayout`).toBeGreaterThan(-1);
  const end = src.indexOf('\n    };', start);
  expect(end, `${name} has no same-indent terminator`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('§BIM-3D-CHROME-QUIET — ARM A: the segmented strip is retired on the PRYZM 3D split', () => {
  it('applyBimDualPane tears the strip down', () => {
    const fn = closureFn(GIS, 'applyBimDualPane');
    expect(
      fn,
      'the BIM dual pane must remove the segmented strip — it is `left: 50%` on #container, '
        + 'and this layout gives 40% of #container to the plan pane, so its centre is not on '
        + 'the view it names (L-13027)',
    ).toContain("retireLegacyViewBars('applyBimDualPane')");
    // §ONE-VIEW-SWITCHER (L-13160) — the teardown MOVED ONE LEVEL, it did not weaken: the
    // bare `removeResultToggle()` that stood here is now inside the ONE named retirement,
    // which removes BOTH legacy rows and is also called from `activateView` (the route
    // `site.bim-3d` / `site.bim-plan` take, which this function never enters). Follow it.
    const retire = closureFn(GIS, 'retireLegacyViewBars');
    expect(retire).toContain('removeResultToggle()');
    expect(retire).toContain('removeFormaViewToggle()');
  });

  it('the 2D landing does not mount-then-tear-down (a one-frame flash)', () => {
    const fn = closureFn(GIS, 'showSiteResultView');
    expect(
      fn,
      "showSiteResultView must skip the pre-mount for '2D' — that landing IS the BIM split, "
        + 'which removes the bar a moment later',
    ).toMatch(/if\s*\(initial\s*!==\s*'2D'\)\s*mountResultToggleBar\(\)/);
  });

  it('⛔ mountResultToggleBar is NOT deleted — other views still need it', () => {
    // Deleting the builder is the failure mode this arm exists to block: the Forma "3D Site"
    // sub-bar (`ensureResultToggle`) and the photoreal globe (`showSiteResultView('3D')`)
    // both build it, and on those views it is the only top-level switch on screen.
    expect(GIS).toContain('const mountResultToggleBar = ');
    expect(GIS).toContain('const ensureResultToggle = (): void => { mountResultToggleBar(); };');
    expect(closureFn(GIS, 'mountFormaViewToggle')).toContain('ensureResultToggle()');
  });
});

describe('§BIM-3D-CHROME-QUIET — ARM B: #container keeps a NAMED positioning owner', () => {
  it('the assertion is one named function, not a side effect of a control that may not mount', () => {
    expect(GIS).toContain('const ensureViewportPositioned = (viewport: HTMLElement): void =>');
    // Exactly ONE definition of the idiom. A second inline copy is how this invariant came to
    // depend on whichever control happened to be built.
    const inline = GIS.match(
      /viewport\.style\.position !== 'absolute' && viewport\.style\.position !== 'relative'/g,
    );
    expect(
      inline?.length,
      'the offset-parent idiom must exist exactly once — inside ensureViewportPositioned',
    ).toBe(1);
  });

  it('⭐ the BIM path — which no longer mounts the strip — asserts it itself', () => {
    // §ONE-VIEW-SWITCHER (L-13160) — the assertion moved WITH the teardown, into
    // `retireLegacyViewBars`, so it now covers `activateView`'s route as well as
    // `applyBimDualPane`'s. ⛔ THE ARM IS STRENGTHENED, NOT RELAXED: before this it was
    // asserted on ONE of the four routes into a PRYZM view; the other three tore nothing
    // down and re-asserted nothing.
    expect(
      closureFn(GIS, 'retireLegacyViewBars'),
      'the retirement removes the control that used to assert #container is positioned, so '
        + 'it must assert it directly or the pane shell and every floating panel re-anchor to '
        + 'the nearest positioned ancestor',
    ).toContain('ensureViewportPositioned(viewport)');
    // …and every BIM route reaches it.
    expect(closureFn(GIS, 'applyBimDualPane')).toContain('retireLegacyViewBars(');
    expect(closureFn(GIS, 'activateView')).toContain('retireLegacyViewBars(');
  });

  it('every surviving mount into #container still goes through the one owner', () => {
    for (const fn of ['mountResultToggleBar', 'mountFormaViewToggle']) {
      expect(closureFn(GIS, fn), `${fn} must use the named owner`).toContain(
        'ensureViewportPositioned(viewport)',
      );
    }
  });
});

describe('§BIM-3D-CHROME-QUIET — ARM C: the three functions are still declared and rendered', () => {
  it.each([
    ['site.bim-split', '◧ 3D + plan'],
    ['site.globe', '◉ 3D globe'],
    ['site.earth', '◉ 3D Site'],
  ])('%s (the strip\'s "%s") is still a declared GIS action', (id) => {
    expect(REGISTRY, `${id} is the surviving route — it may not be removed`).toContain(
      `id: '${id}'`,
    );
  });

  it('the GIS panel renders EVERY declared action (no caller-supplied id list)', () => {
    // `renderGisActions` refuses a caller-supplied subset by construction, so "it renders the
    // registry" is established by the call itself — there is no list here that could omit one.
    expect(BROWSER).toContain('renderGisActions(window as unknown as GisCapabilityHost)');
  });

  it('⚠ and the reason there is no on-view replacement yet is still stated in the registry', () => {
    // If this refusal ever disappears, `bim-3d` became pane-hostable — and at that moment the
    // founder's actual ask (two per-pane dropdowns on this split) is buildable and this whole
    // fallback should be revisited. So the arm reads as: "the deferral is still real".
    expect(PANE_MODEL).toContain("viewType: 'bim-3d'");
    expect(PANE_MODEL).toMatch(/'bim-3d'[\s\S]{0,600}paneHostable:\s*false/);
    expect(PANE_MODEL).toContain('cannot be ');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * ARM D — THE PANE-HEADER LEVEL CHIP IS RELOCATED, NOT DELETED.
 *
 * `Level: [Ground ▾]` in `.svp-header` was the SECOND writer of
 * `projectContext.activeLevelId`. It is gone from the pane header, and every one of
 * its three jobs has a named owner elsewhere. The arms below fail if any of those
 * owners disappears — which is the only way this becomes a deletion.
 * ════════════════════════════════════════════════════════════════════════════ */
describe('§BIM-3D-CHROME-QUIET — ARM D: the level chip moved to a control that is always on screen', () => {
  it('the split pane no longer builds a level chip, and no longer WRITES the active level', () => {
    expect(SVM_CODE, 'the pane header still builds a level select').not.toContain("'svp-level-select'");
    expect(SVM_CODE, 'the pane header still builds the level group').not.toContain('levelGroup.className');
    // ⭐ THE POINT OF THE MOVE. C59 §2 invariant 3 / P6: the level has ONE authority and
    // the pane FOLLOWS it (via LevelPlanViewBinder → setPlanViewId) rather than writing it.
    expect(
      SVM_CODE,
      'SplitViewManager writes projectContext again — it is a follower, not a writer',
    ).not.toContain('projectContext.activeLevelId =');
  });

  it('⭐ CHANGING the level is still one gesture — ActiveLevelHUD writes the SAME field', () => {
    expect(ALH).toContain('this.props.projectContext.activeLevelId = id');
    // And it is genuinely mounted, in the mode bar, beside Author | Inspect | Analysis | Data —
    // not conditional on this pane being open.
    expect(DOCKING, 'the mode-bar slot the HUD mounts into is gone').toContain("levelSlot.id        = 'alh-modebar-slot'");
    expect(CPL, 'nothing fills that slot any more').toContain("document.getElementById('alh-modebar-slot')");
    expect(CPL).toContain('new ActiveLevelHUD(');
  });

  it('JUMPING to a level BY NAME from a list is still reachable (the HUD only steps up/down)', () => {
    // ⚠ THE STATED COST OF THE MOVE, pinned so it cannot quietly get worse: the HUD is a
    // stepper, so the by-name list lives in the Levels & Grids rail panel. If that mount
    // goes, the degradation stops being "one extra gesture" and becomes "unreachable".
    expect(LG_RAIL).toContain('LevelManagerPanel');
    expect(LG_RAIL).toContain('new LevelManagerPanel(');
  });

  it('⛔ the chip ONE unproven residual was PROBED, and the probe still holds', () => {
    // The chip also called `_setCameraElevation(lv.elevation)`; the HUD does not. That leg
    // was measured INERT before removal, and these arms are the measurement, kept alive:
    //   (a) nothing sets a camera elevation in the pane any more, and
    //   (b) `PlanViewCanvas` still reads `camTarget.y` for a finiteness check and a log
    //       string ONLY — never for geometry. If (b) ever changes, the probe is void and
    //       a per-level plan camera has to be built deliberately.
    expect(SVM_CODE).not.toContain('_setCameraElevation(');
    expect(SVM_CODE).not.toMatch(/_camTarget\.y\s*=/);
    // MEASURED: FOUR mentions of `camTarget.y` in PlanViewCanvas, and not one is geometry —
    //   1. `Number.isFinite(camTarget.y)`      — the sanity check
    //   2. the cm-rounded `refusedKey`          — log de-duplication
    //   3. the refusal message text             — a printed number
    //   4. `fitToDrawing`'s `this._camTarget.y` — PRESERVES the existing y while writing x/z
    // A FIFTH is the signal that someone started using it, and the probe must be re-run.
    const yReads = PLAN_CANVAS.match(/camTarget\.y/g) ?? [];
    expect(
      yReads.length,
      'PlanViewCanvas gained a new camTarget.y reader — re-run the §BIM-3D-CHROME-QUIET probe '
        + 'before trusting that the retired level chip changed no pixel',
    ).toBe(4);
    expect(PLAN_CANVAS).toContain('Number.isFinite(camTarget.y)');
  });

  it('the chip OTHER two legs are carried by the binder, which the HUD write drives', () => {
    // `_hasFitProjectedDrawing = false` + the pane re-target both live on the path
    // activeLevelChanged → LevelPlanViewBinder._retargetPlanSurfaces → svm.setPlanViewId
    // → _onViewSelectChange.
    expect(BINDER).toContain("window.addEventListener('activeLevelChanged'");
    expect(BINDER).toContain('svm.setPlanViewId?.(target.id)');
    expect(SVM).toMatch(/setPlanViewId\(viewId: string\): void \{[\s\S]{0,200}_onViewSelectChange\(viewId\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * ARM E — THE VIEW-DEFINITION SELECT IS QUIETER AND STILL THERE.
 *
 * ⭐ THIS IS THE PUSHBACK THE FOUNDER RULED ON. He struck `Ground Fl…` with the rest
 * of the header; it is NOT a level chip — it is the ONLY route in the product to open
 * a SECTION or an ELEVATION, and `paneViewModel.ts` refuses both per-pane by pointing
 * the user AT it. Removing it would turn two registry refusals into lies. Ruling:
 * keep it, make it quieter.
 * ════════════════════════════════════════════════════════════════════════════ */
describe('§BIM-3D-CHROME-QUIET — ARM E: .svp-view-select is quiet, labelled, and still the only door to sections/elevations', () => {
  it('⛔ it is still built, and still carries every optgroup', () => {
    expect(SVM).toContain("viewSel.className = 'svp-view-select'");
    for (const group of ['Floor Plans', 'Reflected Ceiling Plans', 'Sections', 'Elevations']) {
      expect(SVM, `the "${group}" optgroup left the only control that offers it`).toContain(
        `addGroup('${group}'`,
      );
    }
  });

  it('⭐ the two refusals that POINT at it are still worded as pointers, so it may not go', () => {
    // If these refusals are ever reworded away from "that pane's own view selector", the
    // reason this control is exempt from the tidy-up has changed and this arm should be
    // revisited — not silenced.
    expect(PANE_MODEL).toContain("'bim-section-2d'");
    expect(PANE_MODEL).toContain("'bim-elevation-2d'");
    // ⚠ The apostrophe is BACKSLASH-ESCAPED in the source (a single-quoted TS string), so
    // the literal on disk reads `pane\'s`. Matching the human spelling silently found zero.
    const pointers = PANE_MODEL.match(/pane\\?'s own view selector/g) ?? [];
    expect(pointers.length, 'the refusals stopped naming the control they depend on').toBe(2);
  });

  it('QUIETER: no filled box at rest — the chrome arrives on hover and focus', () => {
    const rest = cssRule(SPLIT_CSS, '.svp-view-select');
    expect(rest.length, '.svp-view-select rule not found').toBeGreaterThan(20);
    expect(rest, 'the select is a filled box again').toContain('background: transparent');
    // ⛔ TRANSPARENT, NOT ABSENT. A removed border reflows the header by 1px the moment
    // hover restores it; a transparent one reserves the space.
    expect(rest, 'the border was removed rather than made transparent').toContain(
      'border: 1px solid transparent',
    );
    for (const state of [':hover', ':focus']) {
      const body = cssRule(SPLIT_CSS, `.svp-view-select${state}`);
      expect(body, `.svp-view-select${state} no longer draws the control`).toContain('border-color');
    }
  });

  it('⛔ QUIET IS NOT ICON-ONLY — the legibility floors that shellFloatBudget pins are intact', () => {
    // The reason, and it is measured elsewhere: a `<select>` with `appearance: none` paints
    // its chevron as a background-image at ANY width, so the affordance outlives the label
    // and you get a control the user can click and cannot read. Shrinking this to a bare
    // chevron would BE that defect, deliberately.
    const rest = cssRule(SPLIT_CSS, '.svp-view-select');
    expect(rest).toContain('appearance: none');
    expect(rest).toMatch(/min-width:\s*\d+px/);
    expect(rest).toContain('text-overflow: ellipsis');
  });
});
