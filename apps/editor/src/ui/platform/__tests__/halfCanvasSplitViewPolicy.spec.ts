/**
 * §HALF-CANVAS-OWNS-THE-RIGHT-EDGE (L-12915 · STR §24.1 item 2) — the guard.
 *
 * WHAT EACH ARM ESTABLISHES, AND WHAT IT CANNOT
 * ---------------------------------------------
 * ARM 1 is a real unit test of the decision. It is TOTAL — every combination of the
 * three inputs is asserted, including the two that used to be a stale claim.
 *
 * ARM 2 reads the SHIPPED CSS as text and pins the COLLISION ITSELF: `.svp-pane` and
 * `#anl-surface` both at `right: 0`, the surface above the pane. If someone re-homes
 * either one, this arm stops being true and the policy stops being needed — and the
 * test says so out loud rather than quietly passing forever.
 *
 * ARM 3 reads `WorkspaceController.ts` as text and pins the ORDER, which is the half
 * of this fix a unit test of a pure function cannot reach: close BEFORE the width
 * switch (`_teardownDOM` clears `style.width`), reopen AFTER it (`_buildDOM` sets its
 * own). ⛔ It is a text scan and is named as one; it cannot prove the shell behaves.
 * What it can do is fail the moment the two calls are reordered, which is the only
 * way this fix silently stops working.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  decideSplitViewForCanvas,
  type SplitViewShellState,
} from '../halfCanvasSplitViewPolicy';
import { WORKSPACE_MODES } from '../workspaceModes';

const REPO = resolve(__dirname, '../../../../../..');
const CONTROLLER = join(REPO, 'apps/editor/src/ui/WorkspaceController.ts');
const SPLIT_CSS = join(REPO, 'apps/editor/src/ui/styles/panels/splitView.ts');
const ANALYSIS_CSS = join(REPO, 'apps/editor/src/ui/styles/panels/analysisSurface.ts');

const read = (p: string): string => readFileSync(p, 'utf8');
const decide = (s: SplitViewShellState) => decideSplitViewForCanvas(s);

describe('§HALF-CANVAS-OWNS-THE-RIGHT-EDGE — ARM 1, the decision is total', () => {
  it('closes an OPEN pane when a half-canvas mode takes the right edge, and claims it', () => {
    expect(decide({ canvas: 'half', splitViewActive: true, closedByShell: false }))
      .toEqual({ action: 'close', closedByShell: true });
  });

  it('leaves a CLOSED pane alone on entering a half-canvas mode, and claims nothing', () => {
    // A pane the USER closed is not the shell's to reopen. This is the difference
    // between restoring what we took and helpfully opening something nobody asked for.
    expect(decide({ canvas: 'half', splitViewActive: false, closedByShell: false }))
      .toEqual({ action: 'leave', closedByShell: false });
  });

  it('reopens on return to a full canvas — but ONLY what the shell itself closed', () => {
    expect(decide({ canvas: 'full', splitViewActive: false, closedByShell: true }))
      .toEqual({ action: 'reopen', closedByShell: false });
    expect(decide({ canvas: 'full', splitViewActive: false, closedByShell: false }))
      .toEqual({ action: 'leave', closedByShell: false });
  });

  it('releases a claim that someone else already satisfied — the stale-claim bug', () => {
    // The pane is open and the shell still thinks it holds a claim (the GIS bar or the
    // user reopened it). Reopening is a no-op; KEEPING the claim is the defect, because
    // the next full-canvas entry would then open a pane the shell never closed.
    expect(decide({ canvas: 'full', splitViewActive: true, closedByShell: true }))
      .toEqual({ action: 'leave', closedByShell: false });
  });

  it('carries the claim THROUGH a hidden-canvas mode — Analysis to Data to Author restores', () => {
    // 'hidden' is deliberately not acted on (the workbench geometry is unmeasured), but
    // it must not swallow the claim, or the round trip loses the user's pane.
    const s = decide({ canvas: 'hidden', splitViewActive: false, closedByShell: true });
    expect(s).toEqual({ action: 'leave', closedByShell: true });
    expect(decide({ canvas: 'full', splitViewActive: false, closedByShell: s.closedByShell }).action)
      .toBe('reopen');
  });

  it('is defined for every canvas layout the registry can declare — no unhandled row', () => {
    // Derived from the registry, not a hand-written list: a fifth mode with a new
    // canvas layout fails here instead of falling silently into a default.
    for (const m of WORKSPACE_MODES) {
      for (const splitViewActive of [true, false]) {
        for (const closedByShell of [true, false]) {
          const d = decide({ canvas: m.canvas, splitViewActive, closedByShell });
          expect(['close', 'reopen', 'leave'], `${m.id}`).toContain(d.action);
          expect(typeof d.closedByShell).toBe('boolean');
        }
      }
    }
  });

  it('never asks to reopen a pane that is already open, or close one that is shut', () => {
    for (const m of WORKSPACE_MODES) {
      for (const splitViewActive of [true, false]) {
        for (const closedByShell of [true, false]) {
          const { action } = decide({ canvas: m.canvas, splitViewActive, closedByShell });
          if (action === 'close') expect(splitViewActive).toBe(true);
          if (action === 'reopen') expect(splitViewActive).toBe(false);
        }
      }
    }
  });
});

describe('§HALF-CANVAS-OWNS-THE-RIGHT-EDGE — ARM 2, the collision is real (shipped CSS)', () => {
  it('.svp-pane and #anl-surface both claim right:0, with the surface on top', () => {
    const svp = read(SPLIT_CSS);
    const anl = read(ANALYSIS_CSS);

    const paneAt = svp.indexOf('.svp-pane {');
    expect(paneAt, '.svp-pane rule not found').toBeGreaterThan(-1);
    const paneRule = svp.slice(paneAt, paneAt + 400);
    expect(paneRule).toContain('position: fixed');
    expect(paneRule).toMatch(/right:\s*0/);
    const paneZ = Number(/z-index:\s*(\d+)/.exec(paneRule)?.[1]);

    const anlAt = anl.indexOf('#anl-surface {');
    expect(anlAt, '#anl-surface rule not found').toBeGreaterThan(-1);
    const anlRule = anl.slice(anlAt, anlAt + 400);
    expect(anlRule).toContain('position: fixed');
    expect(anlRule).toMatch(/right:\s*0/);
    const anlZ = Number(/z-index:\s*(\d+)/.exec(anlRule)?.[1]);

    // The measurement this whole policy rests on: same edge, and the pane loses.
    expect(Number.isFinite(paneZ) && Number.isFinite(anlZ)).toBe(true);
    expect(
      anlZ > paneZ,
      `#anl-surface z-index ${anlZ} is no longer above .svp-pane's ${paneZ}. If the two ` +
      `surfaces have been re-homed so they no longer overlap, this policy is obsolete — ` +
      `delete it deliberately rather than leaving a rule that acts on a defect that is gone.`,
    ).toBe(true);
  });

  it('SplitViewManager still writes #container.style.width — the second owner is real', () => {
    const svm = read(join(REPO, 'apps/editor/src/engine/views/SplitViewManager.ts'));
    expect(svm).toContain("container.classList.add('svp-active')");
    expect(svm).toMatch(/container\.style\.width\s*=\s*pct/);
    expect(svm).toMatch(/container\.style\.width\s*=\s*''/);
  });
});

describe('§HALF-CANVAS-OWNS-THE-RIGHT-EDGE — ARM 3, the shell performs it in ORDER', () => {
  /**
   * Comments are STRIPPED first, and that is not tidiness. `WorkspaceController` now
   * explains in prose why it does not use `suppressAutoOpen()` — a guard that failed on
   * its own rationale would teach the next person to delete the rationale. Same reason
   * `workspaceModeRegistry.spec.ts` strips before scanning.
   */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const body = stripComments(read(CONTROLLER));

  it('consults the policy rather than branching on a mode name', () => {
    expect(body).toContain('decideSplitViewForCanvas');
    expect(body).toContain('resolveSplitViewPane');
    // P4 — the pane is reached through a structural type, never a `(window as any)`.
    expect(body).not.toMatch(/\(window as any\)[^\n]*splitViewManager/);
  });

  it('closes BEFORE the canvas width switch and reopens AFTER it', () => {
    const close = body.indexOf('pane?.deactivate()');
    const widthSwitch = body.indexOf("canvas.style.width = '50%'");
    const reopen = body.indexOf('pane?.activate()');
    expect(close, 'no deactivate call').toBeGreaterThan(-1);
    expect(widthSwitch, 'no half-canvas width write').toBeGreaterThan(-1);
    expect(reopen, 'no activate call').toBeGreaterThan(-1);
    expect(
      close < widthSwitch,
      'the split pane is closed AFTER the canvas width is set. `_teardownDOM` clears ' +
      '`#container.style.width`, so the 50% the shell just wrote is wiped and the ' +
      'viewport expands under the panel.',
    ).toBe(true);
    expect(
      reopen > widthSwitch,
      'the split pane is reopened BEFORE the canvas width is set. `_buildDOM` writes its ' +
      'own 60%, which the full-canvas branch then clears to "" — the pane opens beside a ' +
      'full-width canvas and overlaps it.',
    ).toBe(true);
  });

  it('does not touch suppressAutoOpen — that latch has two other claimants', () => {
    // §L-412 / C59. Clearing it here would clear a suppression this file never set.
    expect(body).not.toContain('allowAutoOpen');
    expect(body).not.toContain('suppressAutoOpen');
  });
});
