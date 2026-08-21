/**
 * treemap — squarified treemap layout. Pure arithmetic, no DOM, no renderer.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/treemap.ts
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §4.2 W8
 * Issue log:       L-3008
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN A DEPENDENCY
 * ─────────────────────────────────────────────────────────────────────────────
 * SPEC §5, measured: there is no d3, echarts, recharts, plotly, visx, uplot,
 * cytoscape or force-graph anywhere in this workspace, and Chart.js — the one
 * charting dependency — has no treemap type in its core registerables. So a
 * treemap is either ~70 lines of arithmetic or a new dependency in a monorepo
 * where a stray `package.json` edit desyncs `pnpm-lock.yaml` for every other
 * agent sharing this tree. It is 70 lines.
 *
 * ALGORITHM: Bruls, Huizing & van Wijk, "Squarified Treemaps" (2000). Rows are
 * accumulated while adding the next item IMPROVES the worst aspect ratio in the
 * row, and closed when it stops. That is what keeps the rectangles readable
 * instead of degenerating into slivers, which matters here because the whole
 * claim of a treemap is that AREA ENCODES QUANTITY — a 400:1 sliver encodes it
 * correctly and communicates nothing.
 *
 * ⛔ WHAT IT REFUSES: a non-positive value has no area, and an item with no area
 * is not in the map. It is returned separately in `omitted` so the caller can
 * SAY it was left out. Silently dropping it would make the rectangles sum to
 * less than the stated total with nothing on screen explaining the difference
 * (ADR-0343 §D.6 H2).
 *
 * L7 file, but importable anywhere: it touches no browser API at all.
 */

export interface TreemapItem {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export interface TreemapTile {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Fractions of the container, 0..1. Multiply by the box to place. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TreemapLayout {
  readonly tiles: readonly TreemapTile[];
  /** Items with a non-positive value: they have no area and are NOT tiles. */
  readonly omitted: readonly TreemapItem[];
  /** Σ of the values that were actually laid out. */
  readonly laidOutTotal: number;
}

interface Box { x: number; y: number; w: number; h: number }

/** Worst aspect ratio of a row of areas laid along `side`. Lower is better. */
function worstRatio(row: readonly number[], side: number, rowArea: number): number {
  if (row.length === 0 || rowArea <= 0 || side <= 0) return Infinity;
  let min = Infinity;
  let max = 0;
  for (const a of row) {
    if (a < min) min = a;
    if (a > max) max = a;
  }
  const s2 = side * side;
  const a2 = rowArea * rowArea;
  return Math.max((s2 * max) / a2, a2 / (s2 * min));
}

/**
 * Lay `items` out in a unit rectangle. Returns fractional coordinates so the
 * caller owns pixels — the layout is resolution-independent and testable
 * without a DOM.
 */
export function squarify(items: readonly TreemapItem[]): TreemapLayout {
  const omitted = items.filter((i) => !(i.value > 0) || !Number.isFinite(i.value));
  const live = items
    .filter((i) => i.value > 0 && Number.isFinite(i.value))
    .slice()
    .sort((a, b) => b.value - a.value);

  const total = live.reduce((s, i) => s + i.value, 0);
  if (live.length === 0 || total <= 0) return { tiles: [], omitted, laidOutTotal: 0 };

  // Work in AREA units of the unit square: each item's area is its share.
  const areas = live.map((i) => i.value / total);
  const tiles: TreemapTile[] = [];
  let box: Box = { x: 0, y: 0, w: 1, h: 1 };
  let i = 0;

  while (i < areas.length) {
    const side = Math.min(box.w, box.h);
    const row: number[] = [];
    let rowArea = 0;
    // Grow the row while the worst aspect ratio improves.
    while (i < areas.length) {
      const next = areas[i]!;
      const currentWorst = worstRatio(row, side, rowArea);
      const nextWorst = worstRatio([...row, next], side, rowArea + next);
      if (row.length > 0 && nextWorst > currentWorst) break;
      row.push(next);
      rowArea += next;
      i++;
    }

    // Place the row along the SHORT side, so rows stay squarish.
    const horizontal = box.w >= box.h;
    const thickness = rowArea / side;
    let offset = 0;
    for (let k = 0; k < row.length; k++) {
      const a = row[k]!;
      const extent = a / thickness;
      const src = live[i - row.length + k]!;
      tiles.push(
        horizontal
          ? { key: src.key, label: src.label, value: src.value, x: box.x, y: box.y + offset, w: thickness, h: extent }
          : { key: src.key, label: src.label, value: src.value, x: box.x + offset, y: box.y, w: extent, h: thickness },
      );
      offset += extent;
    }

    box = horizontal
      ? { x: box.x + thickness, y: box.y, w: Math.max(0, box.w - thickness), h: box.h }
      : { x: box.x, y: box.y + thickness, w: box.w, h: Math.max(0, box.h - thickness) };
    if (box.w <= 1e-9 || box.h <= 1e-9) break;
  }

  return { tiles, omitted, laidOutTotal: live.reduce((s, x) => s + x.value, 0) };
}
