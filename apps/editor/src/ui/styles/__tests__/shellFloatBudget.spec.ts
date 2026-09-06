/**
 * §SHELL-FLOAT-BUDGET (L-4010..L-4016) — ONE owned layout budget for the
 * shell's floating, canvas-anchored chrome.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE DEFECT, AND WHY A FIFTH PER-PANEL RESERVE WAS THE WRONG FIX
 * ═════════════════════════════════════════════════════════════════════════════
 * The shell floats a couple of dozen bars at `position: fixed; left: 50%`. In a
 * HALF-canvas mode (`inspect`, `analysis`) `left: 50%` is the right-hand
 * PANEL's own left edge, so every one of them drew its right half onto the
 * panel. The escape had been written by hand, once per (mode × bar):
 *
 *     body.pryzm-mode-inspect  .wmb-toplevel-wrapper { left: 25% }
 *     body.pryzm-mode-inspect  .bam-container        { left: 25% }
 *     body.pryzm-mode-inspect  .ins-lens-bar         { left: 25% … }
 *     body.pryzm-mode-inspect  .ins-explode-bar      { left: 25% … }
 *     body.pryzm-mode-analysis .wmb-toplevel-wrapper { left: 25% }   (L-3601)
 *
 * FIVE of the eight cells two modes × four bars make. And `.ceb-bar` — the
 * editor toolbar the founder was actually looking at, `top: 56px` with 30px
 * buttons — was in NEITHER list, which is why L-3601 moved the mode bar and his
 * screenshot did not change.
 *
 * ⭐ The horizontal accounting is now ONE published number. `tokens.ts` declares
 * `--shell-canvas-cx` / `--shell-canvas-w`; `WorkspaceController._applyLayout()`
 * writes them from the `canvas` column of `WORKSPACE_MODES`. A half-canvas mode
 * is a ROW (ADR-0343 §D.1). No bar names a mode and no mode names a bar.
 *
 * ⚠ SOURCE-TEXT ARM. happy-dom performs no layout and paints nothing. Nothing
 * here measures a pixel or a rendered overlap — it measures that the accounting
 * exists in one place and that no bar has quietly left it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const PANELS = 'apps/editor/src/ui/styles/panels';
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

const TOKENS = read('apps/editor/src/ui/styles/tokens.ts');
const CONTROLLER = read('apps/editor/src/ui/WorkspaceController.ts');
const DOCK = read('apps/editor/src/ui/layout/DockingLayout.ts');
const PUBLISHER = read('apps/editor/src/ui/layout/shellCanvasBudget.ts');
const MODES = read('apps/editor/src/ui/platform/workspaceModes.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(REPO, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(REPO, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.ts')) out.push(rel);
  }
  return out;
}

/** Every `selector { … }` block in every panel sheet. */
function everyRule(): Array<{ file: string; selector: string; body: string }> {
  const out: Array<{ file: string; selector: string; body: string }> = [];
  for (const file of walk(PANELS)) {
    for (const m of read(file).matchAll(/([.#][A-Za-z][^{}\n]*?)\s*\{([^}]*)\}/g)) {
      out.push({ file, selector: m[1]!.trim(), body: m[2]! });
    }
  }
  return out;
}

/** The declaration block of `selector` in `src`, or ''. No dynamic regex — a
 *  template literal eats `\.` and `\s`, which silently turns a selector match
 *  into a wildcard. This lane hit that once; the helper removes the class. */
function ruleBody(src: string, selector: string): string {
  const i = src.indexOf(`${selector} {`);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  const close = src.indexOf('}', open);
  return open < 0 || close < 0 ? '' : src.slice(open + 1, close);
}

/** Source with comment lines removed — a comment quoting old code is not code. */
function codeOnly(src: string): string {
  return src
    .split(String.fromCharCode(10))
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join(String.fromCharCode(10));
}

const isFixed = (b: string): boolean => /position:\s*fixed/.test(b);
const centresOnViewport = (b: string): boolean => /(?:^|;|\s)left:\s*50%/.test(b);
const budgeted = (b: string): boolean => /left:\s*var\(--shell-canvas-cx/.test(b);

describe('§SHELL-FLOAT-BUDGET — ARM A: the budget is DECLARED and PUBLISHED', () => {
  it('both properties are declared in tokens.ts with a viewport-centred default', () => {
    // A `var(--x)` with no declaration renders as its fallback forever. The
    // default is deliberately the OLD behaviour, so an un-migrated sheet and a
    // headless shell both keep working.
    expect(TOKENS).toMatch(/--shell-canvas-cx:\s*50%/);
    expect(TOKENS).toMatch(/--shell-canvas-w:\s*100vw/);
  });

  it('⛔ there is exactly ONE writer, and it is not a mode branch', () => {
    /**
     * ⚠ CORRECTED THE SAME DAY IT SHIPPED. This arm first required
     * `const half = def?.canvas === 'half'` inside `WorkspaceController` — a
     * budget ENUMERATED from the mode registry. The founder's next screenshot
     * falsified it: `#container` is also `width: 60%` under `.svp-active`, so a
     * mode-derived budget left the opaque centred row at 50% of the VIEWPORT,
     * on top of the split pane's own header.
     *
     * ⭐ Enumerating the causes of a narrow canvas is a CENSUS, and this lane's
     * whole finding is that censuses rot (C01 §6 rule 6). The region is now
     * MEASURED from `#container`'s rect by one function, so split view,
     * half-canvas modes, pinned docks and anything added later need no entry.
     */
    // ⚠ COMMENTS STRIPPED. `WorkspaceController` QUOTES the deleted mode-branch
    // in its correction note, and a comment that quotes old code is not code —
    // this lane already had two arms match their own explanatory comment.
    const writers = [CONTROLLER, DOCK, PUBLISHER].flatMap((src, i) =>
      [...codeOnly(src).matchAll(/setProperty\('--shell-canvas-(cx|w)'/g)].map(() => i),
    );
    // Every write is in the publisher (index 2) and nowhere else.
    expect(new Set(writers)).toEqual(new Set([2]));
    expect(PUBLISHER).toContain('getBoundingClientRect()');
    expect(PUBLISHER).toContain("getElementById('container')");
  });

  it('both call sites CALL the publisher rather than computing a value', () => {
    // The registry still DECIDES the canvas width; the publisher READS it. A
    // second computation of "the same" number is the defect shape this file
    // was extracted to avoid.
    expect(CONTROLLER).toContain('publishShellCanvasRegion()');
    expect(DOCK).toContain('publishShellCanvasRegion()');
    // and the ResizeObserver on #container is what catches split view.
    expect(DOCK).toMatch(/new ResizeObserver\([\s\S]{0,600}?publishShellCanvasRegion\(\)/);
  });

  it('⛔ a zero-width canvas falls back rather than publishing 0%', () => {
    // Data mode is `canvas: 'hidden'` — `#container` measures 0x0. Publishing
    // `0%` would pile every bar on the left edge; the mode bar must stay
    // reachable over the full-width workbench or the mode cannot be left.
    expect(PUBLISHER).toMatch(/if \(r\.width > 0\)/);
    expect(PUBLISHER).toMatch(/VIEWPORT_CENTRE = '50%'/);
  });

  it('the registry really has half-canvas modes for the budget to serve', () => {
    // Guard the premise: if every row were `full`, every arm below would pass
    // vacuously and the budget would be dead code that still looked alive.
    expect((MODES.match(/canvas: 'half'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('§SHELL-FLOAT-BUDGET — ARM B: every enrolled bar is really enrolled', () => {
  /**
   * The bars that were, or would have been, occluders of a half-canvas panel.
   * ⛔ `.ceb-bar` is the founder's report; it is first for that reason.
   */
  const ENROLLED: ReadonlyArray<[string, string]> = [
    ['platform-shell/contextualEditBar.ts', '.ceb-bar'],
    ['platform-shell/workspaceModeBar.ts', '.wmb-toplevel-wrapper'],
    ['drawingHuds.ts', '.bam-container'],
    ['drawingHuds.ts', '.wdh-bar'],
    // §SITE-VIEW-QUICK-TOGGLE (L-5110) — the founder's top-centre 3D globe / 3D site
    // bar. Enrolled IN LOCK-STEP with the file that creates it, never afterwards: a
    // new centred bar that is not in this table is exactly what ARM D exists to catch.
    ['siteViewQuickToggle.ts', '.svq-bar'],
    // §VIEW-SWITCHER-ON-THE-VIEW (L-12985) — the founder's 2026-09-06 ask that the
    // view choice leave the right-hand panel and be *"CENTRED ON THE VIEW"*. Enrolled
    // in the same commit that creates it, for the reason stated one line above: in a
    // half-canvas mode `left: 50%` IS the panel's own left edge, so a bar moved OFF the
    // panel and centred on the VIEWPORT would land half back on it.
    ['analysisSurface.ts', '.vsw-onview'],
    ['drawingHuds.ts', '.sth-bar'],
    ['drawingHuds.ts', '.bsp-overlay'],
    ['drawingHuds.ts', '.stsp-panel'],
    ['toolHud.ts', '.th-overlay'],
    ['toolHud.ts', '.th-pill'],
    ['toolHud.ts', '.th-status-pill'],
    ['toolHud.ts', '.th-dim-overlay'],
    ['toolHud.ts', '.spt-hud'],
    ['toolHud.ts', '.spt-params'],
    ['autonomous-auditor/inspectModeShell.ts', '.ins-lens-bar'],
    ['autonomous-auditor/inspectModeShell.ts', '.ins-explode-bar'],
  ];

  it.each(ENROLLED)('%s %s centres on the canvas region', (file, selector) => {
    const src = read(`${PANELS}/${file}`);
    const m = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(src);
    expect(m, `${selector} not found in ${file}`).not.toBeNull();
    const body = m![1]!;
    expect(budgeted(body), `${selector} left the float budget`).toBe(true);
    expect(centresOnViewport(body), `${selector} still centres on the viewport`).toBe(false);
  });

  it('⛔ the two WIDEST always-on bars also carry a hard width stop', () => {
    // Centring alone is not enough for a row that GROWS: `.ceb-bar` gains
    // buttons per element type, so at a narrow viewport a canvas-centred bar can
    // still reach across the panel edge. The clamp is the half the arithmetic
    // cannot do, and it is the part this lane could not verify in a browser.
    for (const [file, sel] of [
      ['platform-shell/contextualEditBar.ts', '.ceb-bar'],
      ['platform-shell/workspaceModeBar.ts', '.wmb-toplevel-wrapper'],
    ] as const) {
      const body = new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(read(`${PANELS}/${file}`))![1]!;
      expect(body, `${sel} lost its width stop`).toMatch(
        /max-width:\s*calc\(var\(--shell-canvas-w/,
      );
    }
  });
});

describe('§SHELL-FLOAT-BUDGET — ARM C: the per-mode `left` overrides are RETIRED', () => {
  it('no sheet re-anchors a floating bar with a hand-written per-mode left', () => {
    // The five rules the budget replaced. One returning means the accounting has
    // forked again — and a fork is invisible until a mode is added.
    const offenders: string[] = [];
    for (const { file, selector, body } of everyRule()) {
      if (!/^body\.pryzm-mode-/.test(selector)) continue;
      if (/(?:^|;|\s)left:\s*/.test(body)) offenders.push(`${file}  ${selector}`);
    }
    expect(offenders).toEqual([]);
  });

  it('what SURVIVES as mode-keyed is a positioning-MODEL change, not a budget', () => {
    // Inspect promotes two absolutely-positioned bars to `fixed` and re-anchors
    // their `bottom`. Folding that into `--shell-canvas-cx` would make one
    // variable mean two unrelated things, so it stays mode-keyed on purpose.
    const shell = read(`${PANELS}/autonomous-auditor/inspectModeShell.ts`);
    expect(shell).toMatch(/body\.pryzm-mode-inspect \.ins-lens-bar \{[^}]*position: fixed/);
    expect(shell).toMatch(/body\.pryzm-mode-inspect \.ins-explode-bar \{[^}]*bottom: 62px/);
  });
});

describe('§SHELL-TOPBAR-BAND (L-4030..L-4035) — the VERTICAL half of the budget', () => {
  /**
   * ⭐ THE FOUNDER'S SECOND SCREENSHOT, AND THE COORDINATOR'S READING OF IT WAS
   * WRONG IN A WAY THAT MATTERED.
   *
   * It was relayed as ONE fixed row at `top: 6px` *"into which several
   * independent owners inject"*, holding two rival level controls plus an
   * orphan chevron, with the fix being to delete one of the level controls.
   *
   * ⛔ MEASURED 2026-08-22 — `.wmb-toplevel-wrapper` has exactly THREE children
   * and they are all appended in `DockingLayout.ts` (`saveUndoRedoHUD.element`,
   * `workspaceModeBar.element`, `levelSlot`). NOTHING else in the repo appends
   * to it. The `Level:` select and the Grid / IFC / V-G / INTENT / Range chips
   * are NOT in that row at all — they belong to `.svp-plan-view-header`, a
   * DIFFERENT bar built by both `PlanViewManager` and `SplitViewManager`.
   *
   * It is TWO BARS SHARING ONE BAND: `fixed, top: 6px, z-index: 200, opaque`
   * over `absolute, top: 10px, z-index: 6`. Deleting a level control would have
   * left every other control in that header under the same bar.
   */
  const SPLIT = read(`${PANELS}/splitView.ts`);

  it('the always-on top row is ONE composition with exactly THREE children', () => {
    // The premise. If a fourth owner starts injecting here, the band grows and
    // the clearance below must be re-derived — so this is asserted, not assumed.
    const dock = read('apps/editor/src/ui/layout/DockingLayout.ts');
    const appends = [...dock.matchAll(/topBarWrapper\.appendChild\(([^)]*)\)/g)].map((m) =>
      m[1]!.trim(),
    );
    expect(appends).toEqual([
      'saveUndoRedoHUD.element',
      'workspaceModeBar.element',
      'levelSlot',
    ]);
  });

  it('the band height is DECLARED once, on the same derivation as the reserve', () => {
    // 6 top + 3 wmb-bar padding + (5 + 14 + 5) wmb-btn + 3 = 36. Identical to the
    // figure analysisHeaderReserve.spec.ts derives, so there is ONE number.
    expect(TOKENS).toMatch(/--shell-topbar-h:\s*36px/);
  });

  it('⛔ the plan-view header starts BELOW the band, not inside it', () => {
    const body = ruleBody(SPLIT, '.svp-plan-view-header');
    expect(body.length).toBeGreaterThan(20);
    expect(body).toContain('position: absolute');
    expect(body, 'the view header is back inside the shell row').toMatch(
      /top:\s*calc\(var\(--shell-topbar-h/,
    );
    expect(body, 'the view header went back to a hand-picked top').not.toMatch(/top:\s*10px/);
  });

  it('the TWO top-of-pane headers are distinct, and each is handled', () => {
    // ⚠ MEASURED, not assumed — and they are NOT one class. `PlanViewManager`
    // builds `.svp-plan-view-header` (absolute, top: 10px) over the MAIN
    // viewport; `SplitViewManager` builds `.svp-header` (in flow, 36px tall) at
    // the top of `.svp-pane`. Both shared the shell row's band and each needs a
    // DIFFERENT remedy, which is why one arm cannot cover both.
    expect(read('apps/editor/src/engine/views/PlanViewManager.ts')).toContain(
      "'svp-plan-view-header'",
    );
    expect(read('apps/editor/src/engine/views/SplitViewManager.ts')).toContain("'svp-header'");
    // The main-viewport header clears the band by starting below it (arm above).
    // The split-pane header is inside `.svp-pane`, which occupies the 40% the
    // canvas gives up — so the BUDGET keeps the shell row out of it, and that
    // only works because the region is measured rather than mode-derived.
    expect(ruleBody(SPLIT, '.svp-pane')).toMatch(/width:\s*40%/);
    // ⭐ `#container.svp-active { width: 60% }` WAS ASSERTED HERE AND IS DELETED
    // (L-13030 · C59 §2 invariant 10 / §2.10). It was a STYLESHEET declaration of a
    // geometry four modules were already writing inline, and its 60 % was a fraction of
    // the WINDOW — so in a half-canvas mode it claimed pixels the Analysis panel owned.
    // The region's box now has ONE owner, `layout/viewRegionGeometry.ts`, which writes it
    // inline; the sheet must therefore contain NO rival width for it.
    expect(ruleBody(SPLIT, '#container.svp-active')).toBe('');
  });

  it('⭐ no labelled control in that header can collapse to its own chevron', () => {
    // The mechanism, and it is not a flex-squeeze curiosity: a `<select>` with
    // `appearance: none` draws its chevron as a `background-image` pinned to the
    // right edge, so the glyph renders at ANY width — including one too small
    // for a single character, and including one whose label is under an opaque
    // bar. The affordance outlives the label. Floors are the only fix.
    for (const sel of ['.svp-view-select', '.svp-level-select']) {
      const body = ruleBody(SPLIT, sel);
      expect(body.length, `${sel} rule not found`).toBeGreaterThan(20);
      expect(body, `${sel} draws a background chevron`).toContain('appearance: none');
      expect(body, `${sel} has no legible min-width floor`).toMatch(/min-width:\s*\d+px/);
    }
    expect(
      ruleBody(SPLIT, '.svp-header-level'),
      'the level group can be crushed again',
    ).toContain('flex-shrink: 0');
  });
});

describe('§SHELL-FLOAT-BUDGET — ARM D: the un-budgeted remainder is NAMED', () => {
  /**
   * ⚠ THIS IS A CLASSIFIED, SHRINK-ONLY BACKLOG, NOT A PASS.
   *
   * 23 `position: fixed; left: 50%` rules remain. Most are CORRECT: a blocking
   * mode-picker or an app-level toast is about the whole application, not about
   * the canvas, and centring it on the viewport is the right answer. The rest
   * are genuinely canvas-anchored and are simply not migrated yet.
   *
   * Every entry carries which of the two it is. The arms below make the list
   * shrink-only in BOTH directions: an unlisted rule fails, and a listed rule
   * that no longer matches ALSO fails — so removing one is a visible act and
   * padding the list to silence a new bar is a reviewable one.
   */
  const VIEWPORT_BY_DESIGN: ReadonlyArray<string> = [
    // Blocking element mode-pickers — modal, about the tool not the canvas.
    '.bmp-panel',
    '.cmp-panel',
    '.cwmp-panel',
    '.dmp-panel',
    '.fmp-panel',
    '.hrmp-panel',
    '.omp-panel',
    '.rfmp-container',
    '.smp-panel',
    '.wmp-panel',
    '.wnmp-panel',
    // App-level transient notifications.
    '.ann-ai-toast',
    '.ann-constr-toast',
    '.pn-toast',
    '.ren-toast',
    '.vex-toast',
    // Detached from the document entirely — §L-MOUNT-DETACH, so it occludes
    // nothing and budgeting it would be budgeting a node that never renders.
    '.plat-toolbar',
  ];

  const BUDGET_BACKLOG: ReadonlyArray<string> = [
    '.ann-dim-opt-bar', // dimension options bar — canvas-anchored, not migrated
    '.fw-hud', // walkthrough HUD — canvas-anchored, not migrated
    '.iml-root', // imported-models launcher — canvas-anchored, not migrated
    '.sched-panel', // schedule panel — canvas-anchored, not migrated
    '.vg-panel', // visibility graphics — owned by another lane today
  ];

  function unbudgetedOnDisk(): string[] {
    const out = new Set<string>();
    for (const { selector, body } of everyRule()) {
      if (isFixed(body) && centresOnViewport(body)) out.add(selector);
    }
    return [...out].sort();
  }

  it('every un-budgeted centred bar is classified', () => {
    const classified = new Set([...VIEWPORT_BY_DESIGN, ...BUDGET_BACKLOG]);
    const unclassified = unbudgetedOnDisk().filter((s) => !classified.has(s));
    expect(
      unclassified,
      'a new viewport-centred fixed bar was added without classifying it — ' +
        'enrol it in the budget, or list it as VIEWPORT_BY_DESIGN with a reason',
    ).toEqual([]);
  });

  it('⛔ every classified entry is still real — the lists cannot rot', () => {
    const onDisk = new Set(unbudgetedOnDisk());
    const stale = [...VIEWPORT_BY_DESIGN, ...BUDGET_BACKLOG].filter((s) => !onDisk.has(s));
    expect(
      stale,
      'these are listed as un-budgeted but no longer are — delete the entries',
    ).toEqual([]);
  });

  it('the backlog is shrink-only and its size is stated, not implied', () => {
    // 2026-08-22, lane SHELL7: 23 un-budgeted, of which 18 are correct by
    // design and 5 are debt. NEVER raise this ceiling to make a new bar pass.
    expect(BUDGET_BACKLOG.length).toBeLessThanOrEqual(5);
    expect(unbudgetedOnDisk().length).toBeLessThanOrEqual(23);
  });
});
