/**
 * §QTYHL132 (L-12120) — THE REACHABILITY ARM. Fail-then-pass at the layer the
 * founder experiences: the real producer's output, through the real consumer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL — THE SUITE THAT COULD NOT SEE THE BUG
 * ─────────────────────────────────────────────────────────────────────────────
 * `analysis/__tests__/graph3dViewState.spec.ts` already exercises the 3-D graph
 * subject thoroughly, and has never failed. It could not: its fixture is
 *
 *     nodeColour: () => '#6600FF'
 *
 * a literal hex — where the ONE live caller (`widgetRenderers.ts:991`) passes
 * `seriesColour(...)`, i.e. `var(--app-cat-N)`. THE FAKE WAS MORE CAPABLE THAN
 * THE REAL CALLER ([[fake-more-capable-than-real]]), so the entire 3-D colour
 * path was measured with an input production never produces, and hundreds of
 * `THREE.Color: Unknown color model var(--app-cat-1)` lines lived under green.
 *
 * So this file takes its inputs from `seriesColour` — the actual producer — and
 * puts them through `graphMarkColour` — the actual consumer, the one function
 * `buildGraphContent` uses for both the node instances and the link vertices.
 *
 * ⭐ THE ASSERTION IS ON A CONSOLE SPY, DELIBERATELY. `THREE.Color.set` does not
 * throw on an unparseable value: it warns and leaves the instance WHITE. The
 * return value therefore cannot distinguish success from failure — THE WARNING
 * IS THE DEFECT SIGNATURE.
 *
 * ⛔ Do NOT relax any arm to `expect(colour).toBeTruthy()`. `var(--app-cat-1)`
 * is truthy, and was the bug.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { graphMarkColour } from '../ElementPreviewRenderer';
import { seriesColour, CAT_TOKENS, CAT_UNASSIGNED } from '../../analysis/AnalysisTypes';
import {
  CATEGORICAL_SERIES,
  CATEGORICAL_UNASSIGNED,
  UNRESOLVED_COLOUR,
  _resetUnresolvedWarningsForTest,
} from '../../styles/categoricalPalette';

const PALETTE = new Set([...CATEGORICAL_SERIES, CATEGORICAL_UNASSIGNED].map((h) => h.toUpperCase()));

const hex = (c: THREE.Color): string => `#${c.getHexString().toUpperCase()}`;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  _resetUnresolvedWarningsForTest();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('L-12120 — the raw token is what broke, stated as the premise', () => {
  it('⛔ `THREE.Color` parses NONE of the nine tokens — all nine warn, all nine go WHITE', () => {
    // The founder's console, reproduced — and measured OVER THE WHOLE SET, not
    // for the three ids his model happened to contain. Not a guard on our code:
    // the statement of what THREE does, which is why a resolver has to exist.
    // If THREE ever learns CSS this arm fails and the resolver's justification
    // must be rewritten, not deleted.
    const table = [...CAT_TOKENS, CAT_UNASSIGNED].map((t) => ({
      token: t,
      drawn: hex(new THREE.Color(t)),
    }));
    expect(table).toHaveLength(9);
    for (const row of table) expect(row.drawn, `${row.token} drawn as`).toBe('#FFFFFF');
    expect(warn).toHaveBeenCalledTimes(9);
    for (const call of warn.mock.calls) expect(String(call[0])).toContain('Unknown color model');
  });
});

describe('L-12120 — every category the widget can produce survives the renderer', () => {
  // The founder's log named cat-1, cat-2 and cat-4 only because those were the
  // families in HIS model. Every token in the rotation is exercised here, so a
  // three-token patch could not have passed.
  const EVERY = [...CAT_TOKENS.map((_, i) => seriesColour(i, `fam${i}`)), seriesColour(0, 'unassigned')];

  it('⭐ TOTAL over the set — no warning, and every mark lands on a PALETTE colour', () => {
    for (const token of EVERY) {
      const c = graphMarkColour(token, 1);
      // Differentiating: white is not in the scale, so a silent parse failure
      // fails this arm for the right reason rather than by luck.
      expect(PALETTE.has(hex(c)), `${token} → ${hex(c)} is not a palette colour`).toBe(true);
    }
    expect(warn, `warnings: ${JSON.stringify(warn.mock.calls)}`).not.toHaveBeenCalled();
  });

  it('⭐ `--app-cat-1` — the founder\'s first failing line — now draws the brand purple', () => {
    expect(graphMarkColour('var(--app-cat-1)', 1).getHex()).toBe(0x6600ff);
    expect(warn).not.toHaveBeenCalled();
  });

  it('⭐ the categories are DISTINCT AS DRAWN, not distinct only as strings', () => {
    // ⛔ This is the arm that says the graph carried NO categorical information.
    // Pre-fix there were eight different STRINGS that all parsed to one white,
    // so any assertion over `n.colour` was already satisfied and proved nothing.
    const drawn = new Set(CAT_TOKENS.map((t) => graphMarkColour(t, 1).getHex()));
    expect(drawn.size, `the eight series collapsed to ${drawn.size} drawn colour(s)`).toBe(8);
  });

  it('the named neutral stays outside the rotation after resolution', () => {
    const n = hex(graphMarkColour(CAT_UNASSIGNED, 1));
    expect(n).toBe(CATEGORICAL_UNASSIGNED.toUpperCase());
    expect(CATEGORICAL_SERIES.map((h) => h.toUpperCase())).not.toContain(n);
  });
});

describe('L-12121 — DORMANT, NOT GONE, and the two producers share one clamp', () => {
  it('a dormant mark moves towards WHITE and keeps its hue order', () => {
    const lit = graphMarkColour('var(--app-cat-1)', 1).clone();
    const dim = graphMarkColour('var(--app-cat-1)', 0.3).clone();
    // ⚠ PER-CHANNEL `>` IS WRONG AND THIS ARM SAID SO ON ITS FIRST RUN: cat-1
    // is #6600FF, whose blue is already 1.0, and blending towards white cannot
    // raise a channel that is already at the ceiling. The property is "no
    // channel darkens and the mark as a whole lightens", which is what a blend
    // towards white means.
    expect(dim.r).toBeGreaterThanOrEqual(lit.r);
    expect(dim.g).toBeGreaterThanOrEqual(lit.g);
    expect(dim.b).toBeGreaterThanOrEqual(lit.b);
    expect(dim.r + dim.g + dim.b).toBeGreaterThan(lit.r + lit.g + lit.b);
    // Still on screen: not white, not transparent, not dropped.
    expect(hex(dim)).not.toBe('#FFFFFF');
  });

  it('alpha is clamped to 0.12 … 1 — a mark can never be dimmed out of existence', () => {
    expect(hex(graphMarkColour('var(--app-cat-1)', 0))).toBe(hex(graphMarkColour('var(--app-cat-1)', 0.12)));
    expect(hex(graphMarkColour('var(--app-cat-1)', 9))).toBe(hex(graphMarkColour('var(--app-cat-1)', 1)));
  });
});

describe('L-12121 — an unresolvable colour REFUSES LOUDLY at the renderer boundary', () => {
  it('⛔ draws the designated UNRESOLVED magenta, never a silent white', () => {
    const c = graphMarkColour('var(--app-cat-not-a-thing)', 1);
    expect(hex(c)).toBe(UNRESOLVED_COLOUR.toUpperCase());
    expect(hex(c)).not.toBe('#FFFFFF');
    expect(PALETTE.has(hex(c))).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('--app-cat-not-a-thing');
  });

  it('⛔ one warning per DISTINCT token — a 320-node graph is not 320 lines', () => {
    for (let i = 0; i < 320; i++) graphMarkColour('var(--app-nope)', 1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
