/**
 * §GRID-BUTTON-CENSUS (L-4000..L-4004) — the "+ Grid" affordance, all of it.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS, AND IT IS NOT THE OBVIOUS REASON
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder reported a "+ Grid" pill rendering INSIDE the Data panel and
 * INSIDE the Analysis panel. A lane measured `PlanViewToolOverlay`'s button —
 * `position: fixed`, `z-index: 6`, against `#dw-workbench`'s 110 — and reported
 * that it "cannot render over the panel at all".
 *
 * ⭐ THAT z-index COMPARISON WAS CORRECT. Neither `html` nor `body` declares
 * `transform` / `filter` / `opacity` / `will-change` / `contain`
 * (`index.html:38` is the only `body` rule and sets margin/padding/overflow/
 * size/background), so every `position: fixed` body child really does compete
 * in ONE root stacking context and 6 really is buried by 110. The reasoning was
 * sound. **The CENSUS was wrong**: there was a SECOND owner,
 * `SvpPlanToolOverlay`, hand-picking `z-index: 10002` — on the far side of the
 * panel layer. One subject, two buttons, two opposite verdicts.
 *
 * C01 §6 rule 6, in its second direction: *a claim of impossibility is also a
 * measurement*, and a measurement of one member of a set is not a measurement
 * of the set. This file makes the census executable so the next "+ Grid" cannot
 * be added without appearing here.
 *
 * ⚠ SOURCE-TEXT ARM. happy-dom performs no layout and paints nothing. Nothing
 * below measures a pixel or a rendered overlap; it measures the STRUCTURAL
 * facts the containment argument rests on. A rendered check would be strictly
 * stronger. This is not one and is not dressed up as one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

const SHEET = read('apps/editor/src/ui/styles/panels/canvasOverlays.ts');
const PLAN = 'apps/editor/src/engine/views/PlanViewToolOverlay.ts';
const SVP = 'apps/editor/src/engine/views/SvpPlanToolOverlay.ts';

/** The declaration block of `selector`, or ''. */
function rule(src: string, selector: string): string {
  const i = src.indexOf(selector);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  const close = src.indexOf('}', open);
  return open < 0 || close < 0 ? '' : src.slice(open + 1, close);
}

/** Every .ts under a directory tree, recursively. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(REPO, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(REPO, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.ts')) out.push(rel);
  }
  return out;
}

/** Source with comment lines removed — so a comment cannot satisfy a code arm. */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('§GRID-BUTTON-CENSUS — ARM A: the census is CLOSED and it is TWO', () => {
  /**
   * ⛔ SET-BASED, NOT A COUNT. A count can be right while the membership is
   * wrong — which is the defect this file was written for. Adding a third
   * owner fails here loudly rather than shipping a third hand-picked z-index.
   */
  const DECLARED_OWNERS: ReadonlyArray<string> = [PLAN, SVP];

  function ownersOnDisk(): string[] {
    const found: string[] = [];
    for (const f of [...walk('apps/editor/src/engine/views'), ...walk('apps/editor/src/ui')]) {
      const src = codeOnly(read(f));
      // The LABEL as it is EMITTED, not a comment mentioning it.
      if (/(?:textContent|innerHTML)\s*=\s*['"]\+ Grid['"]/.test(src)) found.push(f);
      else if (/=\s*isPlan\s*\?\s*'\+ Grid'/.test(src)) found.push(f);
    }
    return found.sort();
  }

  it('exactly the declared owners emit a "+ Grid" label', () => {
    expect(ownersOnDisk()).toEqual([...DECLARED_OWNERS].sort());
  });

  it('the declared owners really do emit it — the list cannot be padded', () => {
    for (const f of DECLARED_OWNERS) expect(codeOnly(read(f))).toContain('+ Grid');
  });
});

describe('§GRID-BUTTON-CENSUS — ARM B: neither owner body-parents its button', () => {
  /**
   * The defect in one line. A `document.body` child with `position: fixed` has
   * NO relationship to the canvas it names: not its width (half-canvas modes),
   * not its `display` (Data mode is `canvas: 'hidden'`), not its stacking.
   */
  it('the plan-view owner mounts into the canvas pane', () => {
    const src = read(PLAN);
    const fn = src.slice(src.indexOf('_mountCreateActionButton(viewDef'));
    const body = codeOnly(fn.slice(0, fn.indexOf('private _handleCreateGrid(): void {')));
    expect(body, 'the create button is body-parented again').not.toContain(
      'document.body.appendChild(btn)',
    );
    expect(body).toContain("document.getElementById('container')");
    expect(body).toContain('host.appendChild(btn)');
  });

  it('the split-view owner mounts into its own pane', () => {
    const src = read(SVP);
    const fn = src.slice(src.indexOf('_mountGridButton(): void'));
    const body = codeOnly(fn.slice(0, fn.indexOf('private _clearOverlay(): void {')));
    expect(body, 'the grid button is body-parented again').not.toContain(
      'document.body.appendChild(btn)',
    );
    expect(body).toContain(".closest('.svp-pane')");
    expect(body).toContain('host.appendChild(btn)');
  });

  it('neither owner computes the button position in JS any more', () => {
    // The whole class of drift: two rect-derived coordinate sets kept in step
    // by hand, one of which ran while the element was still `display: none`
    // (so `offsetHeight` was 0 and the button landed below the canvas).
    for (const f of [PLAN, SVP]) {
      expect(codeOnly(read(f)), `${f} still positions the button in JS`).not.toMatch(
        /_position(CreateAction|Grid)Button\s*\(/,
      );
    }
  });
});

describe('§GRID-BUTTON-CENSUS — ARM C: no hand-picked z-index (C06 §7.3)', () => {
  it('neither owner sets a zIndex on the create button', () => {
    for (const f of [PLAN, SVP]) {
      const src = read(f);
      const marker = f === PLAN ? '_mountCreateActionButton(viewDef' : '_mountGridButton(): void';
      const fn = src.slice(src.indexOf(marker));
      const end = fn.indexOf(
        f === PLAN ? 'private _handleCreateGrid(): void {' : 'private _clearOverlay(): void {',
      );
      expect(end).toBeGreaterThan(0);
      expect(codeOnly(fn.slice(0, end)), `${f} hand-picks a z-index again`).not.toMatch(
        /zIndex\s*:/,
      );
    }
  });

  it('⛔ the shared class declares NO z-index, and that is the containment argument', () => {
    // Adding `var(--z-viewport-hud)` (900) here would REINTRODUCE the bug:
    // 900 out-paints `#anl-surface` (50) and `#dw-workbench` (110), because
    // neither panel has been migrated to `--z-panel` (1000). "Below every
    // panel" is expressed by carrying no z-index at all and letting the pane
    // do the containing. C06 §7.4.
    const btn = rule(SHEET, '.vco-create-btn {');
    expect(btn.length, '.vco-create-btn is not declared in canvasOverlays.ts').toBeGreaterThan(20);
    expect(btn).toContain('position: absolute');
    expect(btn).not.toMatch(/z-index/);
  });

  it('both owners use the ONE shared class', () => {
    for (const f of [PLAN, SVP]) expect(read(f)).toContain("className = 'vco-create-btn'");
  });
});

describe('§GRID-BUTTON-CENSUS — ARM D: the premises the containment rests on', () => {
  /**
   * ⭐ These are the facts that make ARM C's "no z-index" SAFE. If one moves,
   * the button silently starts painting somewhere else — so each is pinned in
   * the sheet it actually lives in, never transcribed.
   */
  it('#container is a positioned parent, so left/bottom mean the canvas pane', () => {
    expect(read('index.html')).toMatch(/#container \{[^}]*position: relative/);
  });

  it('#container declares NO z-index — C06 §7.2 names this trap by hand', () => {
    // An `auto` positioned descendant paints below every positioned body
    // sibling with z-index >= 1. That is every panel in the shell.
    const m = /#container \{([^}]*)\}/.exec(read('index.html'))?.[1] ?? '';
    expect(m.length).toBeGreaterThan(10);
    expect(m).not.toMatch(/z-index/);
  });

  it('.svp-pane DOES carry a z-index — that is what CONTAINS the split-view button', () => {
    const pane = rule(read('apps/editor/src/ui/styles/panels/splitView.ts'), '.svp-pane {');
    expect(pane).toContain('position: fixed');
    expect(pane, '.svp-pane lost its z-index — its button is no longer contained').toMatch(
      /z-index:\s*1\s*;/,
    );
  });

  it('the two right-hand panels still out-rank a contained canvas child', () => {
    const dw = rule(read('apps/editor/src/ui/styles/panels/dataWorkbench.ts'), '#dw-workbench {');
    const anl = rule(read('apps/editor/src/ui/styles/panels/analysisSurface.ts'), '#anl-surface {');
    expect(/z-index:\s*110\s*;/.test(dw), '#dw-workbench z-index moved').toBe(true);
    expect(/z-index:\s*50\s*;/.test(anl), '#anl-surface z-index moved').toBe(true);
  });

  it('⛔ neither html nor body creates a stacking context', () => {
    // The measurement that VINDICATED the earlier "6 vs 110" reasoning and
    // localised the real error to the census. A `transform` / `filter` /
    // `opacity` / `will-change` / `contain` on either would have made every
    // cross-tree z-index comparison in this file invalid.
    const html = read('index.html');
    const bodyRule = /(?:^|\n)\s*body \{([^}]*)\}/.exec(html)?.[1] ?? '';
    expect(bodyRule.length).toBeGreaterThan(10);
    expect(bodyRule).not.toMatch(/transform|filter|opacity|will-change|contain\s*:/);
  });
});
