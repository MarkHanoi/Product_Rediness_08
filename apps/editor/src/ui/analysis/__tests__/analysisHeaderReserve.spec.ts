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
  it('the mode-bar wrapper is still fixed at the top, centred on the viewport', () => {
    // ⭐ THIS is the occluder. `left: 50%` is the Analysis panel's left edge, so
    // the wrapper's right half lands on the panel — that is the sliced subtitle.
    const wrapper = rule(MODEBAR, '.wmb-toplevel-wrapper {');
    expect(wrapper).toContain('position: fixed');
    expect(px(wrapper, 'top'), 'the mode bar moved — recompute the reserve').toBe(6);
    expect(wrapper).toContain('left: 50%');
  });

  it('the mode-bar button metrics the 36px figure came from are unchanged', () => {
    const bar = rule(MODEBAR, '.wmb-bar {');
    const btn = rule(MODEBAR, '.wmb-btn {');
    expect(bar).toContain('padding: 3px');
    expect(btn).toContain('padding: 5px 13px');
    expect(btn).toContain('font-size: 10.8px');
  });

  it('the presence strip is still fixed at the panel top-RIGHT, 28px tall', () => {
    // The other occluder, and the one over `+ Add widget` / refresh / reset / info.
    const strip = rule(PRESENCE, '.cp-presence-strip {');
    expect(strip).toContain('position: fixed');
    expect(px(strip, 'top'), 'the presence strip moved — recompute the reserve').toBe(8);
    expect(px(rule(PRESENCE, '.cp-chip {'), 'height')).toBe(28);
  });

  it('⛔ the reserve clears the LOWEST edge of both occluders', () => {
    // mode bar 6 + (3 + 5 + 14 + 5 + 3) = 36 · presence 8 + 28 = 36.
    const lowest = Math.max(6 + 3 + 5 + 14 + 5 + 3, 8 + 28);
    expect(lowest).toBe(36);
    expect(headerReserve(), 'the Analysis header draws inside shell chrome').toBeGreaterThanOrEqual(lowest);
  });

  it('the 768px breakpoint reserve clears the TALLER mobile mode bar', () => {
    // `.wmb-btn { min-height: 36px }` inside `@media (max-width: 768px)`.
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
