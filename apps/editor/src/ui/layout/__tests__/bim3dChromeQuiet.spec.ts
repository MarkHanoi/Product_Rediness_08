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
    ).toContain('removeResultToggle()');
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
    expect(
      closureFn(GIS, 'applyBimDualPane'),
      'applyBimDualPane removed the control that used to assert #container is positioned, so '
        + 'it must assert it directly or the pane shell and every floating panel re-anchor to '
        + 'the nearest positioned ancestor',
    ).toContain('ensureViewportPositioned(viewport)');
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
