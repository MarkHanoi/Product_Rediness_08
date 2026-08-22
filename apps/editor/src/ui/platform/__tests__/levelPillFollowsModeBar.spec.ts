/**
 * §LEVEL-PILL-FOLLOWS-THE-MODE-BAR (L-3500) — the guard.
 *
 * WHAT THIS ESTABLISHES, AND WHAT IT CANNOT
 * -----------------------------------------
 * The founder's report is a LAYOUT one: the `Level 3 / +9.000` pill floated at
 * the top-right, far from `Author | Inspect | Analysis | Data`, and did not move
 * with them. The fix is compositional — the pill's host slot is created in the
 * ONE place the mode bar is composed (`DockingLayout.ts`), as a sibling of
 * `WorkspaceModeBar.element` inside `.wmb-toplevel-wrapper`.
 *
 * ⚠ THESE ARMS READ THE SHIPPED TYPESCRIPT AS TEXT, and they say so rather than
 * dressing up as behavioural tests — the same honesty `workspaceModeRegistry.spec.ts`
 * applies to its ARMs 2–4. Importing `DockingLayout.ts` in a unit test is not
 * available: its module graph reaches the whole editor shell (tool classes, the
 * command manager, `BottomActionMenu`), so a DOM assertion here would be testing
 * a mock of the composition rather than the composition.
 *
 * WHAT IS THEREFORE **NOT** PROVEN HERE, stated so nobody reads more into a green
 * run than it earns:
 *   · that the pill is VISUALLY adjacent (that is CSS + a browser),
 *   · that `CreatePanelLayout`'s 600 ms mount fires after `DockingLayout` has run
 *     (ordering is a runtime fact; the fallback chain exists precisely because it
 *     is not guaranteed),
 *   · that `body.pryzm-mode-inspect` re-centres the wrapper correctly.
 * ARM 4 pins the closest checkable proxy for the last one: the pill's slot is a
 * CHILD of the wrapper the inspect-mode rule targets, so it cannot be re-centred
 * separately from the mode bar.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const DOCKING = join(REPO, 'apps/editor/src/ui/layout/DockingLayout.ts');
const CREATE_PANEL = join(REPO, 'apps/editor/src/ui/layout/CreatePanelLayout.ts');
const LEVEL_CSS = join(REPO, 'apps/editor/src/ui/styles/panels/levelsGrids.ts');
const WMB_CSS = join(REPO, 'apps/editor/src/ui/styles/panels/platform-shell/workspaceModeBar.ts');

const read = (p: string): string => readFileSync(p, 'utf8');

/** Strip block + line comments — the ids are deliberately DISCUSSED in prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('§LEVEL-PILL-FOLLOWS-THE-MODE-BAR (L-3500)', () => {
  // ── ARM 1 — the slot is composed WITH the mode bar, in one place ──────────
  it('ARM 1: DockingLayout creates the level slot inside the mode-bar wrapper', () => {
    const src = stripComments(read(DOCKING));

    // The wrapper the mode bar lives in.
    expect(src).toMatch(/topBarWrapper\.className\s*=\s*'wmb-toplevel-wrapper'/);
    // The mode bar and the level slot are BOTH appended to it.
    expect(src).toMatch(/topBarWrapper\.appendChild\(\s*workspaceModeBar\.element\s*\)/);
    expect(src).toMatch(/topBarWrapper\.appendChild\(\s*levelSlot\s*\)/);
    expect(src).toMatch(/levelSlot\.id\s*=\s*'alh-modebar-slot'/);
  });

  it('ARM 1b: the slot is appended AFTER the mode bar, so it reads to its right', () => {
    const src = stripComments(read(DOCKING));
    const bar = src.indexOf('topBarWrapper.appendChild(workspaceModeBar.element)');
    const slot = src.indexOf('topBarWrapper.appendChild(levelSlot)');
    expect(bar).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(bar);
  });

  // ── ARM 2 — the mount PREFERS that slot, and still has a fallback chain ───
  it('ARM 2: CreatePanelLayout prefers the mode-bar slot over .plat-toolbar', () => {
    const src = stripComments(read(CREATE_PANEL));

    const modebar = src.indexOf("getElementById('alh-modebar-slot')");
    const platbar = src.indexOf("querySelector('.plat-toolbar')");
    const hudMount = src.indexOf("getElementById('alh-hud-mount')");

    expect(modebar).toBeGreaterThan(-1);
    expect(platbar).toBeGreaterThan(-1);
    // ⛔ The fallback chain is REQUIRED — `toolbar/__tests__/mountHost.spec.ts`
    // exists because a mount host that is absent must degrade, never unmount.
    expect(hudMount).toBeGreaterThan(-1);
    // Preference order = source order of the branches.
    expect(modebar).toBeLessThan(platbar);
    expect(platbar).toBeLessThan(hudMount);
  });

  // ── ARM 3 — the two hosts share ONE layout reset, so they cannot drift ────
  it('ARM 3: both host slots carry the shared .alh-slot class, and the CSS keys on it', () => {
    const layout = stripComments(read(CREATE_PANEL)) + stripComments(read(DOCKING));
    // Both slot elements opt into the same class.
    expect(layout.match(/className\s*=\s*'alh-slot'/g)?.length).toBe(2);

    const css = read(LEVEL_CSS);
    // The layout reset is class-keyed…
    expect(css).toContain('.alh-slot .alh-hud');
    // …and the id-keyed original is gone as a SELECTOR, so a third host cannot
    // miss the reset by forgetting to re-copy a rule block. Comments are stripped
    // first: the block header still NAMES `#alh-toolbar-slot` as one of the two
    // hosts, and documenting the id is not the same as selecting on it.
    expect(stripComments(css)).not.toContain('#alh-toolbar-slot');
  });

  it('ARM 3b: the mode-bar host restores the glass the toolbar host switches off', () => {
    const css = read(LEVEL_CSS);
    // The shared reset kills the blur (redundant inside an opaque toolbar)…
    expect(css).toMatch(/\.alh-slot \.alh-badge \{[^}]*backdrop-filter:\s*none/);
    // …and the mode-bar host, which floats over the 3-D canvas, restores it.
    // Dropping this silently costs the measured 4.80:1 worst-case contrast.
    expect(css).toMatch(/#alh-modebar-slot \.alh-badge \{[^}]*backdrop-filter:\s*blur/);
  });

  // ── ARM 4 — "follows them" is a DOM property, not a second coordinate set ─
  it('ARM 4: the wrapper — not the pill — owns the fixed anchor and the inspect re-centre', () => {
    const wmb = read(WMB_CSS);
    // The wrapper owns position/anchor for every child, so a child cannot be
    // anchored independently of the mode bar.
    expect(wmb).toMatch(/\.wmb-toplevel-wrapper \{[\s\S]*?position:\s*fixed/);
    expect(wmb).toMatch(/\.wmb-toplevel-wrapper \{[\s\S]*?display:\s*flex/);

    // The pill must NOT reintroduce its own fixed/absolute anchor inside a slot —
    // that is exactly the "second floating element" the founder reported.
    const css = read(LEVEL_CSS);
    expect(css).toMatch(/\.alh-slot \.alh-hud \{[^}]*position:\s*static/);
  });
});
