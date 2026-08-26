/**
 * §QTYHL132 (L-12120..L-12123) — THE PALETTE RESOLVER, MEASURED AGAINST THE
 * CONSUMER THAT BROKE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `THREE.Color` IS IN A STYLES TEST
 * ─────────────────────────────────────────────────────────────────────────────
 * Because the defect is not "the palette is wrong", it is "the palette's values
 * are unreadable by one of its two consumers". Asserting that
 * `resolveCssColour('var(--app-cat-1)')` returns `'#6600FF'` would pass against
 * a resolver that returned any well-formed string; the only arm that can fail
 * for the right reason is the one that puts the returned value through the very
 * parser that rejected the token, and watches the console.
 *
 * ⭐ THE ASSERTION IS ON A CONSOLE SPY, DELIBERATELY. `new THREE.Color(x)` does
 * NOT throw on an unparseable value — it warns and leaves the instance at its
 * default WHITE. So the return value cannot distinguish success from failure,
 * and the WARNING IS THE DEFECT SIGNATURE. An arm that only checked the colour
 * came back would pass on the broken build.
 *
 * ⭐ TOTAL OVER THE SET, NOT A SPOT-CHECK. Every arm below iterates every token
 * the module claims to cover, derived from the module's own array — so adding a
 * ninth series cannot slip past by being unlisted here.
 *
 * ⚠ WHY THE OLD SUITE MISSED THIS: `graph3dViewState.spec.ts:63` passes
 * `nodeColour: () => '#6600FF'` — a literal hex where production passes
 * `var(--app-cat-N)`. The fake was more capable than the real caller
 * ([[fake-more-capable-than-real]]), so no arm could ever see the failure.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import {
  CATEGORICAL_SERIES,
  CATEGORICAL_TOKEN_CSS,
  CATEGORICAL_TOKEN_VALUES,
  CATEGORICAL_UNASSIGNED,
  CAT_UNASSIGNED_TOKEN_NAME,
  UNRESOLVED_COLOUR,
  _resetUnresolvedWarningsForTest,
  catSeriesTokenName,
  resolveCssColour,
  unresolvedTokensSoFar,
} from '../categoricalPalette';
import { DESIGN_TOKENS } from '../tokens';
import { CAT_TOKENS, CAT_UNASSIGNED, seriesColour } from '../../analysis/AnalysisTypes';

/** Every `var(--app-cat-*)` expression this app can produce, from the authority. */
const ALL_TOKEN_EXPRS: readonly string[] = [
  ...CATEGORICAL_SERIES.map((_, i) => `var(${catSeriesTokenName(i)})`),
  `var(${CAT_UNASSIGNED_TOKEN_NAME})`,
];

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _resetUnresolvedWarningsForTest();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe('L-12120 — the defect signature, pinned before the fix is asserted', () => {
  it('⛔ THREE cannot parse a raw `var()` — it warns and silently keeps WHITE', () => {
    // This is the founder's console line, reproduced. It is NOT a regression
    // guard on our code — it is the statement of what THREE does, which is the
    // whole reason a resolver has to exist. If THREE ever learns CSS this arm
    // fails and the resolver's justification has to be rewritten, not deleted.
    const c = new THREE.Color(ALL_TOKEN_EXPRS[0] as unknown as string);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('Unknown color model');
    // …and the value is not "missing", it is WHITE. Failure wearing an answer.
    expect(c.getHexString()).toBe('ffffff');
  });
});

describe('L-12120 — every category resolves to a THREE-parseable literal', () => {
  it('the set is complete: 8 series + 1 named neutral, all distinct', () => {
    expect(CATEGORICAL_SERIES).toHaveLength(8);
    expect(CATEGORICAL_TOKEN_VALUES.size).toBe(9);
    expect(new Set(CATEGORICAL_TOKEN_VALUES.values()).size).toBe(9);
  });

  it('⭐ TOTAL over the set — `new THREE.Color(resolved)` emits NO warning for any token', () => {
    const resolved = ALL_TOKEN_EXPRS.map((t) => [t, resolveCssColour(t)] as const);

    for (const [token, value] of resolved) {
      const c = new THREE.Color(value);
      // Differentiating twice over: the colour must be the AUTHORED one, not
      // merely something THREE accepted (white would satisfy a weaker arm).
      const expected = CATEGORICAL_TOKEN_VALUES.get(
        /var\((--[a-z0-9-]+)\)/.exec(token)![1]!,
      )!;
      expect(`#${c.getHexString().toUpperCase()}`, `${token} → ${value}`).toBe(expected);
    }

    // The console spy IS the assertion. Nine tokens, zero warnings.
    expect(warn, `unexpected warnings: ${JSON.stringify(warn.mock.calls)}`).not.toHaveBeenCalled();
  });

  it('⭐ `--app-cat-1` — the founder\'s first failing line — is highlight-capable', () => {
    // Fail-then-pass against the pre-fix state: before this lane the ONLY value
    // reaching THREE for category 1 was the string `var(--app-cat-1)`, which
    // parsed to white. Now it is the brand purple, and it round-trips.
    const value = resolveCssColour('var(--app-cat-1)');
    expect(value).toBe('#6600FF');
    expect(new THREE.Color(value).getHex()).toBe(0x6600ff);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a literal is passed through untouched — the resolver is not a rewriter', () => {
    for (const literal of ['#6600FF', '#fff', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'red']) {
      expect(resolveCssColour(literal)).toBe(literal);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('the neutral resolves and is NOT one of the eight — absence keeps its own colour', () => {
    const neutral = resolveCssColour(CAT_UNASSIGNED);
    expect(neutral).toBe(CATEGORICAL_UNASSIGNED);
    expect(CATEGORICAL_SERIES).not.toContain(neutral);
  });
});

describe('L-12121 — an unresolvable token REFUSES LOUDLY, never silently defaults', () => {
  it('⛔ returns the designated UNRESOLVED magenta, not black and not white', () => {
    const v = resolveCssColour('var(--app-cat-does-not-exist)');
    expect(v).toBe(UNRESOLVED_COLOUR);
    // The three values a silent failure would have produced. None of them.
    expect(v).not.toBe('#000000');
    expect(v).not.toBe('#ffffff');
    expect(CATEGORICAL_SERIES).not.toContain(v);
  });

  it('⛔ warns EXACTLY ONCE, and the warning NAMES the token', () => {
    resolveCssColour('var(--app-cat-does-not-exist)');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('--app-cat-does-not-exist');
    expect(unresolvedTokensSoFar()).toEqual(['--app-cat-does-not-exist']);
  });

  it('⛔ one line per DISTINCT token, not one per mark — a 320-node graph is not 320 lines', () => {
    for (let i = 0; i < 320; i++) resolveCssColour('var(--app-nope)');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('an inline `var(--x, fallback)` fallback is honoured before refusing', () => {
    expect(resolveCssColour('var(--app-nope, #123456)')).toBe('#123456');
    expect(warn).not.toHaveBeenCalled();
  });

  it('an empty expression refuses rather than returning an empty string', () => {
    expect(resolveCssColour('')).toBe(UNRESOLVED_COLOUR);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a NON-categorical token still resolves from the live cascade when one exists', () => {
    // The `--app-*` tokens outside this scale have no TS authority yet, so the
    // resolver falls through to the document. Prove the fall-through works
    // rather than assuming it — and prove the arm is real by using a value the
    // module cannot know.
    document.documentElement.style.setProperty('--qtyhl132-probe', '#0A0B0C');
    expect(resolveCssColour('var(--qtyhl132-probe)')).toBe('#0A0B0C');
    expect(warn).not.toHaveBeenCalled();
    document.documentElement.style.removeProperty('--qtyhl132-probe');
  });
});

describe('L-12122 — ONE authority: the CSS is generated, never restated', () => {
  it('every token this app declares in CSS comes from the TS array', () => {
    for (const [name, hex] of CATEGORICAL_TOKEN_VALUES) {
      expect(CATEGORICAL_TOKEN_CSS).toContain(`${name}:`);
      expect(CATEGORICAL_TOKEN_CSS).toContain(hex);
    }
  });

  it('⛔ `DESIGN_TOKENS` ships the generated block — the sheet and the array agree', () => {
    for (const [name, hex] of CATEGORICAL_TOKEN_VALUES) {
      expect(DESIGN_TOKENS, `${name} missing from the injected sheet`)
        .toMatch(new RegExp(`${name}\\s*:\\s*${hex}\\s*;`));
    }
  });

  it('⛔ `AnalysisTypes` derives its token list — the count cannot fork', () => {
    expect(CAT_TOKENS).toHaveLength(CATEGORICAL_SERIES.length);
    expect(CAT_TOKENS[0]).toBe('var(--app-cat-1)');
    expect(CAT_UNASSIGNED).toBe(`var(${CAT_UNASSIGNED_TOKEN_NAME})`);
    // …and `seriesColour` — the function every widget calls — stays token-shaped
    // for its DOM consumers. This is not an oversight: CSS must keep the var so
    // the cascade stays the DOM authority. The resolver is for the OTHER half.
    expect(seriesColour(0, 'walls')).toBe('var(--app-cat-1)');
  });
});
