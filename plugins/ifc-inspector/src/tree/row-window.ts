/**
 * `row-window.ts` — the bounded row materialiser.
 *
 * §IFC-TREE-BOUND (L-8340..L-8342) · C66 (concurrency & scale).
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM, STATED IN THE FOUNDER'S OWN NUMBERS
 * ---------------------------------------------------------------------------
 * His reference model is **111,263 elements**. A tree that materialises a row
 * per element on expand will build ~111k DOM nodes and stall the editor for
 * seconds — and he has spent this week making navigation smooth. Spending that
 * on a panel would be a straight regression.
 *
 * ---------------------------------------------------------------------------
 * THE SPLIT THAT LETS BOTH HALVES BE TRUE
 * ---------------------------------------------------------------------------
 * `groupings.ts` counts in ONE O(n) pass and never builds a row. So:
 *
 *   • COUNTS and GROUP ACTIONS cover ALL 111,263 elements — exactly.
 *   • ROW RENDERING is capped at `MAX_MATERIALISED_ROWS`.
 *
 * When the cap bites, the notice STATES THE TRUE TOTAL. It never says "showing
 * 500 elements" and leaves the reader to assume that is all there are — that
 * would be an under-report dressed as a fact, the same defect shape as a gate
 * that reports a count it did not measure.
 *
 * ⭐ This mirrors the Analysis graph's node cap and the founder's own reference,
 * which says: "showing a responsive preview of element rows. Counts and group
 * actions still cover all 111,263 elements; use Find for a specific object."
 */

import type { IfcGroup } from './groupings.js';

/**
 * The bound. 1,500 rows is ~30x a typical viewport at 40px/row, so scrolling
 * stays ahead of the user while the DOM cost stays in the low milliseconds.
 *
 * ⚠ This is a MATERIALISATION cap, not a windowing cap. It bounds how many row
 * DESCRIPTORS exist; the DOM layer windows further to what is visible. Raising
 * it trades memory for scroll depth and changes NO count anywhere.
 */
export const MAX_MATERIALISED_ROWS = 1500;

/** Rows a group shows before its own "+N more" fold. Keeps one huge group from eating the whole budget. */
export const MAX_ROWS_PER_GROUP = 300;

export interface IfcTreeRow {
  readonly kind: 'group' | 'element';
  readonly id: string;
  readonly label: string;
  readonly depth: number;
  /** Group rows only — the EXACT member count, never the rendered count. */
  readonly count?: number;
  readonly deficit?: IfcGroup['deficit'];
}

export interface RowWindow {
  readonly rows: readonly IfcTreeRow[];
  /** Element rows actually materialised. */
  readonly renderedElements: number;
  /** ⭐ The TRUE total. Always exact, always shown when truncated. */
  readonly totalElements: number;
  readonly truncated: boolean;
  /**
   * The sentence rendered under a truncated tree. `null` when nothing was cut —
   * never an empty string, so a caller cannot render a blank notice bar.
   */
  readonly notice: string | null;
}

/**
 * Flatten groups into rows, stopping at the cap.
 *
 * `expanded` holds the group keys the user has opened. A collapsed group costs
 * exactly one row regardless of how many members it holds — which is why the
 * default collapsed tree over 111k elements is free.
 */
export function materialiseRows(
  groups: readonly IfcGroup[],
  expanded: ReadonlySet<string>,
  labelForElement: (id: string) => string,
  totalElements: number,
): RowWindow {
  const rows: IfcTreeRow[] = [];
  let rendered = 0;
  let truncated = false;

  const walk = (group: IfcGroup, depth: number): void => {
    rows.push({
      kind: 'group',
      id: group.key,
      label: group.label,
      depth,
      count: group.count,
      ...(group.deficit ? { deficit: group.deficit } : {}),
    });

    if (!expanded.has(group.key)) return;

    for (const child of group.children) walk(child, depth + 1);

    const budget = Math.min(group.memberIds.length, MAX_ROWS_PER_GROUP);
    for (let i = 0; i < budget; i++) {
      if (rendered >= MAX_MATERIALISED_ROWS) {
        truncated = true;
        return;
      }
      const id = group.memberIds[i]!;
      rows.push({ kind: 'element', id, label: labelForElement(id), depth: depth + 1 });
      rendered++;
    }

    if (group.memberIds.length > budget) {
      truncated = true;
      const hidden = group.memberIds.length - budget;
      rows.push({
        kind: 'group',
        id: `${group.key}::more`,
        label: `+${hidden.toLocaleString()} more in this group — use Find to reach a specific object`,
        depth: depth + 1,
      });
    }
  };

  for (const g of groups) {
    if (rendered >= MAX_MATERIALISED_ROWS) {
      truncated = true;
      break;
    }
    walk(g, 0);
  }

  return {
    rows,
    renderedElements: rendered,
    totalElements,
    truncated,
    notice: truncated ? truncationNotice(rendered, totalElements) : null,
  };
}

/**
 * ⭐ The truncation notice. It states the TRUE TOTAL and says explicitly that
 * counts and group actions are NOT truncated — because they are not.
 */
export function truncationNotice(rendered: number, total: number): string {
  return (
    `Large model: showing a responsive preview of ${rendered.toLocaleString()} element rows. ` +
    `Counts and group actions still cover all ${total.toLocaleString()} elements; ` +
    `use Find for a specific object.`
  );
}
