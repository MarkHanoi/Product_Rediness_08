/**
 * noFamilyElementGroupLabel — §TERM143 guard (L-12340+), 2026-08-26.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Analysis surface + Inspect panel (L7). Test-only.
 * Contract:          C84 EI-9 (ONE vocabulary per concept).
 *
 * ── THE FOUNDER'S RULING, RECORDED SO IT IS NEVER RE-LITIGATED ───────────────
 *
 * The UI used "family" and "category" interchangeably for the same concept —
 * an element group — sometimes on the SAME CARD ("Category report" titled a
 * card whose subtitle read "Element count by family"). The founder ruled:
 * ONE word, and it is **"Category"**. He first asked for "Systems"; shown that
 * "System" already names two OTHER things in this product — the System-based
 * relationship view, and a door/window/wall/slab's SYSTEM TYPE assembly (C15)
 * — he chose "Category" instead, specifically to avoid minting a THIRD
 * meaning for an already-overloaded word.
 *
 * ── WHY THIS GUARD IS NARROW, NOT A REPO-WIDE "family" BAN ───────────────────
 *
 * "family" is a legitimate word for at least TWO OTHER concepts this guard
 * must not flag:
 *   1. A relation KIND in the Unified Building Graph — "edge families" on the
 *      Relationships card ("which edge families are real", `graphReadModel.ts`
 *      `EDGE_FAMILIES`). That is `bounds` / `connectsTo` / `hosts` / …, a
 *      completely different axis from an element's CATEGORY, and renaming it
 *      here would trade one ambiguity for another.
 *   2. A Revit-style component-authoring template — `FamilyBrowserPanel.ts`,
 *      `FamilyToolbar.ts`, backed by the `apps/component-editor/` SPA. That is
 *      a THIRD, unrelated sense of "family" (a reusable parametric definition,
 *      not an inspected element's group) and is a separate subsystem this
 *      guard does not scan.
 * So this guard checks specific, known files/fields for the ELEMENT-GROUP
 * sense only — never a bare `/family/` grep over the repository.
 *
 * ── WHY STRING LITERALS, COMMENT-STRIPPED, NOT RAW SOURCE TEXT ───────────────
 *
 * The guarded files legitimately keep internal identifiers this lane was told
 * NOT to rename (`activeFamilyFilter`, `RoomTreeFamilyGroup`, `familyOf`,
 * `readFamilyRecords`, …) and prose comments that discuss the census's
 * internal "family" vocabulary. A guard over raw source text would trip on
 * those constantly. So `literalTexts()` extracts only quoted / templated
 * STRING LITERALS (what a user can actually read), after `stripComments()`
 * removes `//` and `/* *\/` comments — and `${…}` interpolations inside a
 * template literal are blanked too, so `` `for ${state.activeFamilyFilter}` ``
 * cannot be mistaken for rendered label text. Comment-stripping matters for
 * THIS FILE too: without it, a guard reading its own header prose (which must
 * quote the banned word to explain the rule) would fail itself — the exact
 * trap that cost a lane an hour earlier today matching its own "was
 * `min: 1.80`" comment.
 *
 * ── SCOPE — WHAT THIS GUARD DOES NOT YET COVER ───────────────────────────────
 *
 * `AnalysisSurface.ts` (`FACET_AXIS_LABEL.category = 'Family'` — the
 * highlighting-chip label read as "FAMILY Furniture") and `widgetRenderers.ts`
 * ("families present" KPI tile, the discipline→family census tree, the
 * take-off coverage-ledger noun) both still say "family" for an element
 * group. They are NOT fixed by §TERM143: both files were mid-edit by a
 * concurrent lane (§DEMO141, presentation-mode / graph-expand-controls) when
 * this lane ran, so touching them risked a collision in a shared tree rather
 * than a clean rename. See the §TERM143 report's "deferred" list.
 *
 * ⛔ DO NOT widen this guard to scan those two files until the §DEMO141
 * follow-up pass renames their strings — doing so first would make this guard
 * red for a reason outside its own control, which is a worse failure mode
 * than a guard that is honestly narrower than the whole surface. Add them to
 * `SOURCE_FILES` / a new `it.each` case in the SAME commit that fixes them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ANALYSIS_TABS } from '../analysis/AnalysisTypes';
import { WIDGET_CATALOGUE } from '../analysis/widgetCatalogue';
import { createTreeModeToggle } from '../inspect/audit/TreeModeToggle';
import { renderNodeLegend } from '../analysis/nodeLinkSvg';

/** The element-group sense of the word, whole-word, case-insensitive. */
const FAMILY_WORD = /\bfamil(?:y|ies)\b/i;

/** Strip `//` line comments and `/* *\/` block comments. Good enough for the
 *  TypeScript this repo writes; not a general-purpose lexer. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Every quoted / templated string literal in `src`, with `${…}`
 * interpolations blanked so an identifier referenced inside one cannot be
 * mistaken for rendered label text. Not a full parser (does not handle
 * nested-brace interpolation) — sufficient for the two guarded files, which
 * have none.
 */
function literalTexts(src: string): string[] {
  const out: string[] = [];
  const re = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push(m[0].replace(/\$\{[^}]*\}/g, ' '));
  }
  return out;
}

/**
 * A single-token, hyphen/underscore-joined literal with no whitespace — a CSS
 * class (`'aud-room-family-filter'`), a store key, or a similar CODE
 * IDENTIFIER rather than rendered prose. This lane was explicitly told not to
 * rename identifiers, only what a user reads, so these are excluded from the
 * scan rather than allowlisted one at a time.
 */
function looksLikeIdentifier(literal: string): boolean {
  const inner = literal.slice(1, -1).trim();
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(inner);
}

// Files whose user-visible strings are known-clean as of §TERM143 — see the
// header for the two files intentionally NOT yet on this list.
const SOURCE_FILES = [
  '../inspect/audit/RoomTreeZone.ts',
  '../inspect/audit/ProjectTreeZone.ts',
] as const;

describe('§TERM143 guard — "family" must not reappear as an element-group label', () => {
  it.each(SOURCE_FILES)('%s carries no element-group "family" string literal', (rel) => {
    const abs = resolve(__dirname, rel);
    const src = stripComments(readFileSync(abs, 'utf8'));
    const offenders = literalTexts(src).filter((s) => FAMILY_WORD.test(s) && !looksLikeIdentifier(s));
    expect(offenders, `found element-group "family" text in ${rel}: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it('the level/room tree-mode toggle tooltips say "category", never "family"', () => {
    const handle = createTreeModeToggle('level', () => {});
    const buttons = Array.from(handle.element.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.getAttribute('title') ?? '').not.toMatch(FAMILY_WORD);
      expect(btn.textContent ?? '').not.toMatch(FAMILY_WORD);
    }
  });

  it('the Analysis tab ledes say "category" for the element axis (the Relationships lede is EXEMPT: "edge families" names a relation KIND, C84 EI-9\'s other sense)', () => {
    for (const tab of ANALYSIS_TABS) {
      expect(tab.label, `tab "${tab.id}" label`).not.toMatch(FAMILY_WORD);
      if (tab.id === 'relationships') {
        // The one deliberate exception — assert it still says what it is
        // allowed to say, so a drift away from "edge families" is caught too.
        expect(tab.lede).toMatch(/edge families/);
        continue;
      }
      expect(tab.lede, `tab "${tab.id}" lede`).not.toMatch(FAMILY_WORD);
    }
  });

  it('the widget catalogue never labels an ELEMENT-GROUP widget "family" (the two relation-kind cards are exempt BY ID, never by pattern-match)', () => {
    const RELATION_KIND_EXEMPT = new Set(['relationship-coverage', 'relationship-table']);
    expect(WIDGET_CATALOGUE.length).toBeGreaterThan(0);
    for (const w of WIDGET_CATALOGUE) {
      if (RELATION_KIND_EXEMPT.has(w.id)) continue;
      expect(w.title, `widget "${w.id}" title`).not.toMatch(FAMILY_WORD);
      if (w.subtitle) expect(w.subtitle, `widget "${w.id}" subtitle`).not.toMatch(FAMILY_WORD);
    }
  });

  it('the node-link graph legend reads "element category", never "element family"', () => {
    const host = document.createElement('div');
    const legend = renderNodeLegend(host, new Map([['wall', 0]]), new Map([['wall', 1]]));
    expect(legend.textContent ?? '').not.toMatch(FAMILY_WORD);
    expect(legend.textContent ?? '').toContain('element category');
  });
});
