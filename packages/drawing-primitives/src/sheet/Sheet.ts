// C29 / C24 — Sheet composition primitives (sheet-α-1).
//
// Sheet: the composed first-class entity — a paper, a title block, and a
// list of viewports. All mutators are pure (return a new sheet).
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM.

import type { PaperSize } from './PaperSize.js';
import type { TitleBlock } from './TitleBlock.js';
import type { Viewport } from './Viewport.js';
import { viewportBoundsContain } from './Viewport.js';

/**
 * A composed sheet. `viewports` is ordered: the last entry is the topmost
 * (drawn last / hit-tested first). `gridSpacingMm` is an optional snap-grid
 * spacing for the sheet editor — purely a UI hint, not used by the renderer.
 */
export interface Sheet {
  readonly id: string;
  readonly paper: PaperSize;
  readonly titleBlock: TitleBlock;
  readonly viewports: readonly Viewport[];
  readonly gridSpacingMm?: number;
}

/**
 * Pure: returns a NEW sheet with the viewport appended. The original sheet
 * is not mutated.
 */
export function addViewport(sheet: Sheet, vp: Viewport): Sheet {
  return { ...sheet, viewports: [...sheet.viewports, vp] };
}

/**
 * Pure: returns a NEW sheet with the named viewport removed. If no viewport
 * matches the id the returned sheet has the same logical content as the
 * input (a fresh copy is still returned to keep behaviour predictable).
 */
export function removeViewport(sheet: Sheet, viewportId: string): Sheet {
  return {
    ...sheet,
    viewports: sheet.viewports.filter((vp) => vp.id !== viewportId),
  };
}

/**
 * Hit-test: returns the topmost viewport whose bounds contain the point, or
 * `undefined` if none match. "Topmost" = the last viewport added that
 * contains the point.
 */
export function findViewportAt(
  sheet: Sheet,
  xMm: number,
  yMm: number,
): Viewport | undefined {
  for (let i = sheet.viewports.length - 1; i >= 0; i--) {
    const vp = sheet.viewports[i]!;
    if (viewportBoundsContain(vp.bounds, xMm, yMm)) return vp;
  }
  return undefined;
}

/**
 * Validate the structural invariants of a sheet:
 *   - every viewport fits inside the paper.
 *   - no two viewports share the same id.
 *   - viewport scales are positive finite numbers.
 *
 * Viewports MAY overlap each other — overlap is architecturally legal
 * (e.g. a detail callout sits on top of a plan).
 */
export function validateSheet(
  sheet: Sheet,
): { valid: true } | { valid: false; reasons: string[] } {
  const reasons: string[] = [];
  const seenIds = new Set<string>();

  for (const vp of sheet.viewports) {
    if (seenIds.has(vp.id)) {
      reasons.push(`duplicate viewport id: ${vp.id}`);
    } else {
      seenIds.add(vp.id);
    }

    if (!(Number.isFinite(vp.scale) && vp.scale > 0)) {
      reasons.push(`viewport ${vp.id} has non-positive scale: ${vp.scale}`);
    }

    const b = vp.bounds;
    if (
      b.xMm < 0 ||
      b.yMm < 0 ||
      b.xMm + b.widthMm > sheet.paper.widthMm ||
      b.yMm + b.heightMm > sheet.paper.heightMm
    ) {
      reasons.push(`viewport ${vp.id} extends outside the paper`);
    }
  }

  return reasons.length === 0 ? { valid: true } : { valid: false, reasons };
}
