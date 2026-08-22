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

  it('⭐ they are published from the mode REGISTRY, not from a mode name', () => {
    // ADR-0343 §D.1: adding a half-canvas mode must be a ROW, not a sixth CSS
    // rule. If this ever reads `this._mode === 'analysis'` the budget has become
    // the fifth hand-written copy of the thing it replaced.
    expect(CONTROLLER).toContain("setProperty('--shell-canvas-cx'");
    expect(CONTROLLER).toContain("setProperty('--shell-canvas-w'");
    expect(CONTROLLER).toMatch(/const half = def\?\.canvas === 'half'/);
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
