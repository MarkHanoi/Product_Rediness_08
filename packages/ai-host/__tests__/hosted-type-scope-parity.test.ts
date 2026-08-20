// @pryzm/ai-host — §FIX-HOSTED-TYPE-SCOPE-PHRASING (L-1440)
// =============================================================================
//
// ⭐ THE DEFINITE ARTICLE, AND THE FIVE FAMILIES IT SILENTLY BROKE.
//
// The founder typed **"Make all the stairs type X"**. It did not parse — and
// the reason had nothing to do with stairs. `makeHostedTypeParser`, the ONE
// factory serving window / door / slab / ceiling (and now the two stair
// families), spelled its scope phrase WITHOUT the `(?: of)?(?: the)?` that
// `WALL_TYPE_RE` has carried since ADR-0314:
//
//     wall grammar    (?:the )?(all|every|each|…)(?: of)?(?: the)? walls?
//     hosted grammar  (?:the )?(all|every|each|…)(?: selected)?     <noun>s?
//
// So **"make all THE windows type X", "…the doors…", "…the slabs…" and
// "…the ceilings…" have ALL been unclaimed since U4.3** and nobody reported it.
// A stair family was simply the first to be asked for in the founder's own
// idiom, which is how the gap surfaced at all.
//
// ── WHY THIS FILE IS A PARITY TEST AND NOT FOUR MORE PHRASINGS ──────────────
//
// Adding "make all the windows to X" to the window acceptance family would pin
// THAT sentence and nothing else — and the next divergence between the two
// grammars would land in whichever phrasing nobody thought to add. The defect
// is not a missing sentence; it is TWO SPELLINGS OF ONE CONCEPT, which is the
// same shape §FIX-SCOPE-TAIL-ONE-PARSER (L-1201) found three times in the
// spatial tail and §FIX-RAKE-SWALLOWED-AS-TYPE (L-1370) found in the
// near-miss guard. Both were fixed by making one grammar READ the other's
// definition and pinning the EQUIVALENCE.
//
// The scope phrase here cannot be shared as a literal (the two regexes differ
// in verb set and in what follows the noun — deliberately, see the factory's
// header), so what is pinned instead is the OBSERVABLE consequence: for every
// scope phrasing the wall grammar accepts, the hosted grammar accepts the same
// phrasing over its own noun. That is a claim about behaviour, which is what a
// user experiences, rather than about two regex sources looking alike.
//
// C84 EI-8a: a licensed copy is pinned by a TEST, never by a comment — this
// repo records that the comment mechanism "has already failed twice, measured".

import { describe, expect, it } from 'vitest';
import {
  parseWallTypeIntent,
  parseWindowTypeIntent,
  parseDoorTypeIntent,
  resolveUtterance,
  type ResolverContext,
} from '../src/intents/ZeroTokenResolver.js';

const ctx = (over: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  mintId: () => 'id-1',
  ...over,
} as ResolverContext);

/**
 * The scope phrasings under test. Each is a (prefix, expected scope) pair that
 * the WALL grammar has always accepted; the hosted grammar must accept the
 * identical phrasing over its own noun.
 *
 * ⭐ "all the" is the one the founder used and the one that was broken. The
 * others are here so the parity claim is about the PHRASE SET, not about the
 * single sentence that happened to be reported.
 */
const SCOPE_PHRASINGS: readonly (readonly [string, 'all' | 'selection'])[] = [
  ['all', 'all'],
  ['all the', 'all'],
  ['all of the', 'all'],
  ['every', 'all'],
  ['each', 'all'],
  ['the selected', 'selection'],
  ['these', 'selection'],
  ['those', 'selection'],
];

describe('§FIX-HOSTED-TYPE-SCOPE-PHRASING — the hosted grammar accepts every scope phrase the wall grammar does', () => {
  for (const [phrase, expected] of SCOPE_PHRASINGS) {
    it(`"make ${phrase} <noun>s …" → ${expected}, in BOTH grammars`, () => {
      // The wall grammar is the reference — it has always accepted these.
      const wall = parseWallTypeIntent(`make ${phrase} walls interior partition`, ctx());
      expect(wall, `wall grammar lost "${phrase}"`).not.toBeNull();
      expect(wall!.scope, `wall scope for "${phrase}"`).toBe(expected);

      // …and the hosted factory must now agree, noun for noun.
      const window = parseWindowTypeIntent(`make ${phrase} windows timber casement`, ctx());
      expect(window, `window grammar rejects "${phrase}"`).not.toBeNull();
      expect(window!.scope, `window scope for "${phrase}"`).toBe(expected);

      const door = parseDoorTypeIntent(`make ${phrase} doors white primed softwood`, ctx());
      expect(door, `door grammar rejects "${phrase}"`).not.toBeNull();
      expect(door!.scope, `door scope for "${phrase}"`).toBe(expected);
    });
  }

  // ── THE REGRESSION, NAMED ────────────────────────────────────────────────
  it('⭐ "make all the windows type X" — the sentence that was silently unclaimed', () => {
    const hit = parseWindowTypeIntent('make all the windows type timber casement', ctx());
    expect(hit, 'the definite article still breaks the hosted grammar').not.toBeNull();
    expect(hit!.typeRef).toBe('timber casement');
    expect(hit!.scope).toBe('all');
  });

  it('the leading ARTICLE on a type ref is stripped, as the wall grammar strips it', () => {
    // Before the fix this resolved a type called "a timber casement" and
    // refused by listing the real ones — confidently wrong copy over a
    // sentence the wall grammar handles.
    const wall = parseWallTypeIntent('make all walls a interior partition', ctx());
    expect(wall!.typeRef).toBe('interior partition');
    const window = parseWindowTypeIntent('make all windows a timber casement', ctx());
    expect(window!.typeRef).toBe('timber casement');
  });

  // ── WHAT MUST NOT HAVE WIDENED ───────────────────────────────────────────
  //
  // A scope-phrase fix must not turn an unclaimed sentence into a claimed one.
  // These are the three non-claims the factory's guards exist for, re-asserted
  // against the NEW regex so the fix cannot have quietly relaxed any of them.
  it('a sentence with NO scope word is still not claimed', () => {
    expect(parseWindowTypeIntent('make windows timber casement', ctx())).toBeNull();
  });

  it('a DIMENSION sentence is still not claimed as a type', () => {
    expect(parseWindowTypeIntent('make all the windows 2m wide', ctx())).toBeNull();
    expect(parseDoorTypeIntent('change all the doors width to 900mm', ctx())).toBeNull();
  });

  it('§FIX-RAKE-SWALLOWED-AS-TYPE — a capability word is still declined, article or not', () => {
    expect(parseWindowTypeIntent('make all the windows raked 90 degrees', ctx())).toBeNull();
    expect(parseWallTypeIntent('make all the walls on level 3 raked 90 dregress', ctx())).toBeNull();
  });

  it('the whole ladder still answers the article form rather than missing', () => {
    const r = resolveUtterance('make all the windows type timber casement', ctx({
      resolveScope: (() => ({
        ids: ['w1', 'w2'], kindCounts: { window: 2 }, skipped: [], diagnostics: [],
      })) as never,
    }));
    expect(r.kind).not.toBe('miss');
  });
});
