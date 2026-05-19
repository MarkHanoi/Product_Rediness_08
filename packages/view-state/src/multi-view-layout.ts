// multi-view-layout — pure layout solver for multi-view tab/grid arrangement
// (post-2B closeout / ADR-0030).
//
// SCOPE (skeleton; full feature S46)
// ─────────────────────────────────────────────────────────────────────────────
// Computes pixel-rectangles for an ordered list of active views in three
// arrangements:
//   * `tabs`    — one view fills the surface; others are offscreen tabs.
//   * `split-2` — two-up, vertical split (50/50 by default).
//   * `grid-4`  — four-up, 2×2 grid.
//
// The solver is pure (input → output) so the canvas host can render at
// any size without owning the layout math.  The "splitter drag" UI lives
// in the workbench at S46 D1 — but it consumes this same solver.
//
// PURE: no DOM, no THREE, no Node-only globals.

export type LayoutMode = 'tabs' | 'split-2' | 'grid-4';

export interface ViewLayoutInput {
  readonly mode: LayoutMode;
  readonly viewIds: readonly string[];
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /** Ratio for split-2 (0..1) — default 0.5. */
  readonly splitRatio?: number;
}

export interface ViewRect {
  readonly viewId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** True if this view is currently visible in the layout. */
  readonly visible: boolean;
}

export interface ViewLayoutResult {
  readonly rects: readonly ViewRect[];
}

const HIDDEN: Pick<ViewRect, 'x' | 'y' | 'w' | 'h' | 'visible'> = {
  x: 0, y: 0, w: 0, h: 0, visible: false,
};

export function computeMultiViewLayout(input: ViewLayoutInput): ViewLayoutResult {
  const { mode, viewIds, canvasWidthPx: W, canvasHeightPx: H } = input;
  if (viewIds.length === 0) return { rects: [] };

  switch (mode) {
    case 'tabs': {
      const rects = viewIds.map((id, idx): ViewRect => idx === 0
        ? { viewId: id, x: 0, y: 0, w: W, h: H, visible: true }
        : { viewId: id, ...HIDDEN });
      return { rects };
    }
    case 'split-2': {
      const ratio = clamp01(input.splitRatio ?? 0.5);
      const wA = Math.round(W * ratio);
      const wB = W - wA;
      const rects = viewIds.map((id, idx): ViewRect => {
        if (idx === 0) return { viewId: id, x: 0, y: 0, w: wA, h: H, visible: true };
        if (idx === 1) return { viewId: id, x: wA, y: 0, w: wB, h: H, visible: true };
        return { viewId: id, ...HIDDEN };
      });
      return { rects };
    }
    case 'grid-4': {
      const halfW = Math.round(W / 2);
      const halfH = Math.round(H / 2);
      const grid = [
        { x: 0,     y: 0     },
        { x: halfW, y: 0     },
        { x: 0,     y: halfH },
        { x: halfW, y: halfH },
      ];
      const widths  = [halfW, W - halfW, halfW, W - halfW];
      const heights = [halfH, halfH,     H - halfH, H - halfH];
      const rects = viewIds.map((id, idx): ViewRect => {
        if (idx >= 4) return { viewId: id, ...HIDDEN };
        return {
          viewId: id,
          x: grid[idx]!.x, y: grid[idx]!.y,
          w: widths[idx]!, h: heights[idx]!,
          visible: true,
        };
      });
      return { rects };
    }
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0.05) return 0.05;
  if (n > 0.95) return 0.95;
  return n;
}
