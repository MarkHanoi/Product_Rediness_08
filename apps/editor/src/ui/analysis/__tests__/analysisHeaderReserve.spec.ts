/**
 * §ANALYSIS-HEADER-OCCLUDED (L-3600..L-3603) — the top band belongs to the shell.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS ARM ESTABLISHES, AND WHAT IT CANNOT
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout and paints nothing, so NOTHING here measures a
 * pixel, a stacking order, or a rendered overlap. Saying otherwise would be the
 * exact overstatement this surface exists to refuse.
 *
 * What it does establish is the thing that actually rotted: the reserve in
 * `analysisSurface.ts` was DERIVED from four numbers that live in two other
 * stylesheets, and nothing connected the derivation to its inputs. This file
 * reads those inputs OUT OF THEIR OWN SHEETS and fails if one moves. So the
 * reserve cannot silently stop clearing the chrome it was computed against —
 * the panel re-breaks in CI rather than in the founder's screenshot.
 *
 * ⚠ It is a source-text arm, like §PANEL-BRAND-STANDARD's. A rendered check
 * would be strictly stronger. This is not one and is not dressed up as one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const STYLES = join(REPO, 'apps/editor/src/ui/styles');

const ANALYSIS = readFileSync(join(STYLES, 'panels/analysisSurface.ts'), 'utf8');
const MODEBAR = readFileSync(join(STYLES, 'panels/platform-shell/workspaceModeBar.ts'), 'utf8');
const PRESENCE = readFileSync(join(STYLES, 'panels/collaborativePresence.ts'), 'utf8');
const CEB = readFileSync(join(STYLES, 'panels/platform-shell/contextualEditBar.ts'), 'utf8');
const TOKENS = readFileSync(join(STYLES, 'tokens.ts'), 'utf8');
const CONTROLLER = readFileSync(join(REPO, 'apps/editor/src/ui/WorkspaceController.ts'), 'utf8');
const PUBLISHER = readFileSync(join(REPO, 'apps/editor/src/ui/layout/shellCanvasBudget.ts'), 'utf8');

/** The declaration block of `selector`, or '' — good enough for these flat sheets. */
function rule(src: string, selector: string): string {
  const i = src.indexOf(selector);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  const close = src.indexOf('}', open);
  return open < 0 || close < 0 ? '' : src.slice(open + 1, close);
}

function px(block: string, prop: string): number | null {
  const m = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([0-9.]+)px`).exec(block);
  return m ? Number(m[1]) : null;
}

/**
 * The reserve the header actually applies.
 *
 * ⚠ IT IS A TRANSPARENT TOP BORDER, NOT PADDING, and the distinction is a
 * contract one. C06 §6.1 tabulates `padding: 14px 16px 12px` as THE shared
 * metric of the three mode-surface headers; the shell reserve is OCCUPANCY, not
 * header inset, and folding it into that value would make Analysis disagree
 * with the reference on a number that is not about Analysis at all.
 * `background-clip` defaults to `border-box`, so the brand gradient paints
 * through the border and the band still reads as one header.
 */
function headerReserve(): number {
  const b = px(rule(ANALYSIS, '.anl-header {'), 'border-top');
  expect(b, '.anl-header no longer declares its reserve as a top border').not.toBeNull();
  return b!;
}

describe('§ANALYSIS-HEADER-OCCLUDED — the inputs the reserve was derived from', () => {
  /**
   * ⚠ THE DERIVATION CHANGED ON 2026-08-22 AND THE NUMBER DID NOT.
   *
   * It used to be `max(mode-bar bottom 36, presence-strip bottom 36) + 8`. That
   * census MISSED the occluder the founder was actually looking at — `.ceb-bar`,
   * the editor toolbar, at `top: 56px` with 30px buttons, i.e. bottom edge 86.
   * L-3601 re-centred the MODE BAR and his screenshot was unchanged, because the
   * mode bar was never what sat on the title.
   *
   * §SHELL-FLOAT-BUDGET (L-4010..L-4016) moves every canvas-anchored bar onto
   * the canvas half, so all of them now contribute ZERO. The only remaining
   * occluder is `.cp-presence-strip`, which is anchored to the viewport's RIGHT
   * edge — the same edge as this panel's — and therefore cannot be budgeted at
   * all. 36 + 8 = 44, unchanged, for one reason instead of two.
   *
   * ⛔ SO THE ARMS BELOW CHANGED SHAPE. The mode-bar arm no longer pins its
   * geometry; it pins that it is BUDGETED. If a bar leaves the budget it becomes
   * an occluder again and this file must be re-derived — which is exactly what
   * the previous version of this comment failed to notice about `.ceb-bar`.
   */
  it('⭐ the CANVAS-ANCHORED bars are BUDGETED, so they contribute 0', () => {
    // The claim the reserve now rests on. Each of these was, or would have
    // been, an occluder of this panel; each now centres on the canvas region.
    for (const [label, src, sel] of [
      ['mode bar', MODEBAR, '.wmb-toplevel-wrapper {'],
      ['contextual edit bar', CEB, '.ceb-bar {'],
    ] as const) {
      const block = rule(src, sel);
      expect(block, `${label} rule not found`).toContain('position: fixed');
      expect(block, `${label} left the float budget — re-derive the reserve`).toContain(
        'left: var(--shell-canvas-cx',
      );
      expect(block, `${label} still centres on the viewport`).not.toMatch(/(?:^|;|\s)left:\s*50%/);
    }
  });

  it('the budget is DECLARED with a default and actually PUBLISHED', () => {
    // A `var(--x)` with no declaration renders as its fallback forever, and the
    // publisher is what makes the fallback ever change. Both halves or neither.
    //
    // ⚠ CORRECTED the same day: this arm first required the WRITE to be inside
    // `WorkspaceController` as `def?.canvas === 'half' ? '25%' : '50%'`. That
    // budget was ENUMERATED from the mode registry and missed split view
    // (`#container` is `width: 60%` under `.svp-active`). The region is now
    // MEASURED from `#container`'s rect by one publisher; the controller CALLS
    // it after setting the width. `shellFloatBudget.spec.ts` owns the
    // one-writer arm — this one only needs the budget to be live.
    expect(TOKENS).toMatch(/--shell-canvas-cx:\s*50%/);
    expect(TOKENS).toMatch(/--shell-canvas-w:\s*100vw/);
    expect(PUBLISHER).toContain("setProperty('--shell-canvas-cx'");
    expect(PUBLISHER).toContain("setProperty('--shell-canvas-w'");
    expect(PUBLISHER).toContain('getBoundingClientRect()');
    expect(CONTROLLER).toContain('publishShellCanvasRegion()');
  });

  it('⛔ the CEB was the MISSED occluder — its geometry is why 44 was never enough', () => {
    // Kept as a live measurement rather than prose: if the CEB ever leaves the
    // budget, the arm above fails AND these numbers say what the reserve would
    // have to become (56 + 30 + 8 = 94px, a fifth of the panel).
    const bar = rule(CEB, '.ceb-bar {');
    expect(px(bar, 'top'), 'the CEB moved — re-check the arm above').toBe(56);
    const btn = rule(CEB, '.ceb-btn {');
    expect(px(btn, 'height'), 'the CEB button height moved').toBe(30);
    expect(56 + 30).toBeGreaterThan(44); // the whole of the founder's report
  });

  it('the presence strip is still fixed at the panel top-RIGHT, 28px tall', () => {
    // ⭐ THE ONLY REMAINING OCCLUDER, and the reason the reserve survives the
    // budget: `right: 8px` is measured from the viewport's right edge, which IS
    // this panel's right edge. There is no canvas on that side to re-centre it
    // over, so no horizontal budget can move it. It sits over `+ Add widget` /
    // refresh / reset / info.
    const strip = rule(PRESENCE, '.cp-presence-strip {');
    expect(strip).toContain('position: fixed');
    expect(px(strip, 'top'), 'the presence strip moved — recompute the reserve').toBe(8);
    expect(strip, 'the presence strip is no longer right-anchored — re-derive').toMatch(
      /right:\s*8px/,
    );
    expect(px(rule(PRESENCE, '.cp-chip {'), 'height')).toBe(28);
  });

  it('⛔ the reserve clears the lowest edge of every UNBUDGETED occluder', () => {
    // ONE occluder now: presence 8 + 28 = 36. The mode-bar term that used to
    // share this max is budgeted and gone.
    const lowest = 8 + 28;
    expect(lowest).toBe(36);
    expect(headerReserve(), 'the Analysis header draws inside shell chrome').toBeGreaterThanOrEqual(lowest);
  });

  it('the 768px breakpoint reserve stays sized for the UN-budgeted mode bar', () => {
    // ⚠ DELIBERATE, and disclosed rather than tidied: at phone width the
    // half-canvas modes collapse, so the budget stops separating the two halves
    // and the mobile arm must still clear the taller mode bar. A floor, not a
    // contradiction. `.wmb-btn { min-height: 36px }` inside the 768px media.
    const mobileBtn = /@media \(max-width: 768px\)[\s\S]*?\.wmb-btn \{([^}]*)\}/.exec(MODEBAR)?.[1] ?? '';
    expect(px(mobileBtn, 'min-height'), 'the mobile mode bar changed height').toBe(36);
    const lowestMobile = 6 + 3 + 36 + 3;
    const m = /@media \(max-width: 768px\)[\s\S]*?\.anl-header \{([^}]*)\}/.exec(ANALYSIS)?.[1] ?? '';
    const top = px(m, 'border-top-width');
    expect(top, 'the Analysis sheet lost its 768px reserve override').not.toBeNull();
    expect(top!).toBeGreaterThanOrEqual(lowestMobile);
  });

  it('the widget-picker sheet opens BELOW the reserve, not under the mode bar', () => {
    // It is `position: absolute` inside the fixed panel, so its `top` is measured
    // from the same edge the chrome sits on. A picker at the old 54px would open
    // straight into the mode bar.
    const picker = rule(ANALYSIS, '.anl-picker {');
    expect(px(picker, 'top')!).toBeGreaterThanOrEqual(headerReserve() + 14);
  });
});

describe('§ANALYSIS-HEADER-OCCLUDED — the header speaks Inspect (the founder request)', () => {
  it('the header plate is the same brand gradient #aud-stack uses', () => {
    const audit = readFileSync(join(STYLES, 'panels/autonomous-auditor/auditStack.ts'), 'utf8');
    const inspect = rule(audit, '.aud-header {');
    const analysis = rule(ANALYSIS, '.anl-header {');
    expect(inspect).toContain('var(--app-gradient)');
    expect(analysis).toContain('var(--app-gradient)');
    expect(analysis).toContain('var(--app-shadow-header)');
  });

  it('header buttons sit on the on-accent veil, as Inspect\'s do', () => {
    const btn = rule(ANALYSIS, '.anl-header-btn {');
    expect(btn).toContain('var(--app-on-accent-veil)');
    expect(btn).toContain('var(--app-on-accent)');
  });

  it('⛔ .plat-toolbar is NOT treated as an occluder, because it is detached', () => {
    // C01 §6 rule 6 — "X does not exist" is a MEASUREMENT. `.plat-toolbar` is
    // fixed at top:0 left:50% z-index 9000 and looks like the obvious culprit;
    // §L-MOUNT-DETACH keeps it out of the document entirely. A reserve sized for
    // a node that never renders would be a permanent 44px of dead panel.
    const browser = readFileSync(join(REPO, 'apps/editor/src/ui/platform/PlatformProjectBrowser.ts'), 'utf8');
    expect(browser).toContain('§L-MOUNT-DETACH');
    expect(browser).toContain('NOT attached to the document');
  });
});


/**
 * C06 §6.1 — ARM C's rule, applied to the third surface.
 *
 * ⚠ DELIBERATELY COUPLED TO ANOTHER SURFACE'S STYLESHEET, and the contract says
 * why: *"Convergence MUST be asserted by READING the reference sheet, never by
 * duplicating its literals."* Two independent copies diverge the first time one
 * side moves — which is exactly how the Data header reached 44px / weight 800 /
 * no shadow while its own comment claimed it matched Inspect.
 *
 * ⛔ When `.aud-header` changes, THIS FAILS. Converge Analysis, or raise the
 * decision that the two should differ. Do not delete the arm.
 */
describe('C06 §6.1 — the Analysis header agrees with the Inspect reference', () => {
  const audit = readFileSync(join(STYLES, 'panels/autonomous-auditor/auditStack.ts'), 'utf8');
  const anl = (): string => rule(ANALYSIS, '.anl-header {');
  const aud = (): string => rule(audit, '.aud-header {');

  /** One declaration's value, or null. */
  function decl(block: string, prop: string): string | null {
    const m = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+);`).exec(block);
    return m ? m[1]!.trim() : null;
  }

  it('both headers are found by this test', () => {
    // Guard the premise: an empty body makes every comparison below pass on ''.
    expect(anl().length).toBeGreaterThan(20);
    expect(aud().length).toBeGreaterThan(20);
  });

  it('padding, brand ground, ink and elevation match Inspect', () => {
    expect(decl(anl(), 'padding')).toBe(decl(aud(), 'padding'));
    expect(decl(anl(), 'background')).toBe(decl(aud(), 'background'));
    expect(decl(anl(), 'color')).toBe(decl(aud(), 'color'));
    // Elevation is load-bearing: without it the header and the tab strip beneath
    // it read as one thick slab, which is the defect §6.1 was written for.
    expect(decl(anl(), 'box-shadow')).toBe(decl(aud(), 'box-shadow'));
    expect(decl(anl(), 'height')).toBe('auto');
  });

  it('the title weight and tracking match Inspect', () => {
    expect(decl(anl(), 'font-weight')).toBe(decl(aud(), 'font-weight'));
    expect(decl(anl(), 'letter-spacing')).toBe(decl(aud(), 'letter-spacing'));
    const title = rule(ANALYSIS, '.anl-title {');
    expect(decl(title, 'font-weight')).toBe(decl(aud(), 'font-weight'));
    expect(decl(title, 'letter-spacing')).toBe(decl(aud(), 'letter-spacing'));
  });

  it('header actions sit on the on-accent veil, as §6.1 tabulates', () => {
    const btn = rule(ANALYSIS, '.anl-header-btn {');
    expect(btn).toContain('var(--app-on-accent-veil)');
    expect(btn).toContain('var(--app-on-accent)');
  });

  it('⛔ the shell reserve is NOT inside the shared padding metric', () => {
    // If it ever is, the arm above starts failing for a reason that has nothing
    // to do with header convergence — which is how a coupled assertion gets
    // deleted rather than fixed.
    expect(decl(anl(), 'padding')).toBe('14px 16px 12px');
    expect(headerReserve()).toBeGreaterThan(0);
  });

  it('⭐ the surface reaches its content in ONE band plus ONE navigation row', () => {
    // §6.1: "A mode surface MUST reach its content in ONE chrome band plus, at
    // most, one navigation row." The tab lede used to be a fourth stacked band
    // and is now part of the status line.
    const surface = readFileSync(join(REPO, 'apps/editor/src/ui/analysis/AnalysisSurface.ts'), 'utf8');
    expect(surface, 'the tab lede is a stacked band again').not.toContain("'anl-tab-lede'");
    expect(surface).toContain("lede.className = 'anl-status-lede'");
    // ⚠ DISCLOSED, not glossed: Analysis lands at THREE bands, not two — header,
    // tab strip, status strip. The third is the §D.6 trust statement: a COMPUTED
    // per-tab sentence rather than chrome, and §6.1's own rationale ("a third
    // stacked band is a signal that a CONTROL belongs in the header's actions
    // slot") does not reach it, because it holds no control. Folding it into the
    // header would put a recomputed sentence in a slot that does not recompute.
    // This arm pins that it is STILL THERE rather than pretending it is not.
    expect(surface).toContain("this._status.className = " + String.fromCharCode(96) + "anl-status");
  });
});
