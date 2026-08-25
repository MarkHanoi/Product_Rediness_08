/**
 * @file apps/editor/src/ui/onboarding/compactPillPlacement.ts
 *
 * §UX-COMPACT-TYPE-PILL (L-11131, lane UXPILL70) — the PURE half of "the BUILDING TYPE
 * pill sits in the same top band as the view-mode bar, immediately beside it".
 *
 * WHY A MODEL AND NOT A NUMBER
 * ---------------------------
 * The bar (`.svq-bar`, `styles/panels/siteViewQuickToggle.ts`) is centred on the ONE
 * published canvas accounting, `--shell-canvas-cx` (C06 §15), and its WIDTH is a function
 * of its own labels and disabled states — it re-renders from `PaneLayoutStore`. A pill
 * placed at "cx + 200px" would be right until the first label changed. So the pill's
 * horizontal position is MEASURED from the bar's live rect, the same way the budget
 * itself measures `#container` rather than enumerating the modes that narrow it
 * (`shellCanvasBudget.ts`: *"an enumerated cause list is a census, and censuses rot"*).
 *
 * This module owns the DECISION only; it is DOM-free so it can be unit-tested under the
 * editor's node-environment vitest config. The controller measures and applies.
 *
 * THE RULES, IN ORDER
 * -------------------
 *  1. No bar on screen (or nothing measurable yet)  → CENTRED on the band, where the bar
 *     would have been. The band is then empty, and the pill is its only occupant.
 *  2. Fits to the bar's RIGHT inside the canvas gutter → BESIDE-RIGHT (reading order:
 *     "which view" → "what to build").
 *  3. Else fits to the bar's LEFT                      → BESIDE-LEFT.
 *  4. Else (narrow viewport, split view)               → BELOW the bar, centred on it,
 *     clamped inside the canvas. Never on top of it — an occluded control is the defect
 *     the float budget exists to stop (C06 §15.6).
 *
 * The canvas span comes from the SAME two tokens every enrolled bar reads; a consumer
 * that computed its own region would be a second accounting.
 */

export interface PillRect {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
}

export interface CanvasSpan {
    readonly left: number;
    readonly right: number;
}

export interface CompactPillPlacementInput {
    /** The view-mode bar's viewport rect, or null when it is not on screen. */
    readonly bar: PillRect | null;
    /** The canvas region the shell publishes (`--shell-canvas-cx` / `--shell-canvas-w`). */
    readonly canvas: CanvasSpan;
    /** The pill's own rendered width (0 when unmeasured ⇒ centred). */
    readonly pillWidth: number;
    /** Clearance between the bar and the pill, in rendered px. */
    readonly gap: number;
    /** Clearance from the canvas edge, in rendered px (the bar keeps 16px authored). */
    readonly gutter: number;
}

export type CompactPillPlacement =
    | { readonly kind: 'centred' }
    | { readonly kind: 'beside-right'; readonly left: number }
    | { readonly kind: 'beside-left'; readonly left: number }
    | { readonly kind: 'below'; readonly left: number; readonly top: number };

/** Decide where the pill goes. Pure; see the file header for the rule order. */
export function placeCompactPill(input: CompactPillPlacementInput): CompactPillPlacement {
    const { bar, canvas, pillWidth, gap, gutter } = input;
    if (!bar || !(pillWidth > 0) || !(bar.right > bar.left)) return { kind: 'centred' };

    const rightLeft = bar.right + gap;
    if (rightLeft + pillWidth + gutter <= canvas.right) {
        return { kind: 'beside-right', left: rightLeft };
    }
    const leftLeft = bar.left - gap - pillWidth;
    if (leftLeft - gutter >= canvas.left) {
        return { kind: 'beside-left', left: leftLeft };
    }
    const barCx = (bar.left + bar.right) / 2;
    const minLeft = canvas.left + gutter;
    const maxLeft = canvas.right - gutter - pillWidth;
    const left = Math.max(minLeft, Math.min(maxLeft, barCx - pillWidth / 2));
    return { kind: 'below', left, top: bar.bottom + gap };
}

/**
 * Resolve the published canvas span from the two budget tokens as they appear on
 * `<body>`'s inline style (`shellCanvasBudget.ts` writes `NN.NNN%` and `NN.NNNvw`; the
 * `tokens.ts` defaults are `50%` / `100vw`). Anything unparseable falls back to the
 * viewport — the same degraded answer the budget itself gives when there is no canvas.
 */
export function readShellCanvasSpan(cx: string, w: string, viewportWidth: number): CanvasSpan {
    const vw = viewportWidth > 0 ? viewportWidth : 0;
    const cxPx = parseLength(cx, vw) ?? vw / 2;
    const wPx = parseLength(w, vw) ?? vw;
    return { left: cxPx - wPx / 2, right: cxPx + wPx / 2 };
}

/** `NN%` and `NNvw` are fractions of the viewport width; `NNpx` is absolute. */
function parseLength(raw: string, viewportWidth: number): number | null {
    const m = /^\s*(-?\d*\.?\d+)\s*(%|vw|px)\s*$/.exec(raw ?? '');
    if (!m) return null;
    const n = Number.parseFloat(m[1]!);
    if (!Number.isFinite(n)) return null;
    return m[2] === 'px' ? n : (n / 100) * viewportWidth;
}
