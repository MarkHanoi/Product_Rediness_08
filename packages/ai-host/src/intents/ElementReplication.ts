// @pryzm/ai-host — ElementReplication (§REFUSE-RAC-REPLICATE, L-1542)
// =============================================================================
//
// ⭐ *"create same stair in ground in level 1"* — the founder, verbatim. Today
// it is `{kind:'miss'}`: no grammar claims it, nothing is said about it, and he
// sees *"I'm not sure how to help with that yet."*
//
// ── THE CAPABILITY THE SENTENCE ASKS FOR, NAMED ─────────────────────────────
//
// **COPY BY REFERENCE.** "Same … as" says *take that object's parameters and
// build me another one somewhere else*, and it is the referential sibling of the
// two other things this sentence needs — a SELECTION reference ("that one") and
// a LEVEL reference ("ground", "level 1"). Of the three, exactly one is built:
//
//   • **level-name resolution** ✅ BUILT — `findLevel` + `SpatialScopeTail`
//     resolve "ground" and "level 1" onto real level ids, and this module uses
//     them, so the refusal below quotes the levels it actually resolved rather
//     than echoing the user's raw words back. A refusal that proves it resolved
//     the easy half is a very different object from one that merely repeats it.
//   • **selection as a SUBJECT** ✅ BUILT — `ResolverContext.selection` gives
//     identity and kind for what the user picked.
//   • **copy by reference** ⛔ NOT BUILT — and, measured, there is no command
//     underneath it either. See the table below.
//
// ── WHY THIS IS A REFUSAL AND NOT A FEATURE (MEASURED 2026-08-20) ───────────
//
// | candidate route | why it cannot carry this ask |
// |---|---|
// | `CopyElementCommand` (`command-registry/src/operations/`) | `CopyableElementType = 'wall' \| 'furniture'` — **stair is not a member**. And its only placement input is a world-space `offset: {x,y,z}`; there is no `targetLevelId`, so "onto level 1" is inexpressible even for the kinds it does accept. |
// | `DuplicateFloorPlanCommand` (`command-registry/src/levels/`) | copies a WHOLE floor plate, and its `affectedStores` are `['wall','slab','floor','ceiling','column','furniture','level']` — **'stair' is absent**, deliberately: a stair already spans two levels, so "copy it to level N" is not a translation. |
// | `stair.create` | would mean re-deriving `riserHeight` for the new level pair against `CreateStairCommand`'s `HEIGHT_TOLERANCE` gate and re-synthesising `flights[]` — i.e. **a fifth copy of the shape→flights conversion** (four already exist). C98 §16.6 forbids exactly this: *"Constructing a `CreateStairCommand` at the call site would mean a second copy of `StairPathAdapter`."* |
//
// ⛔ SO THE ARITHMETIC IS DELIBERATELY NOT DONE, for the same reason
// `StairNotYet` declines to compute `stepsBeforeLanding`: it is a handful of
// lines, and those lines would be a SECOND authority for a geometry the stair
// pipeline already owns, driven by numbers the user never named. C98 §L-1441.5.b
// states the principle in one sentence — ***"Refusing is the correct answer, not
// the lesser one."***
//
// ⭐ AND THE REFUSAL NAMES A ROUTE THAT REALLY WORKS (C16 CA-18): `duplicate-level`
// is a live, shipped capability on `level.duplicate-floor-plan`. It copies the
// walls, slabs, floors, ceilings, columns and furniture of a whole storey. It
// does NOT copy stairs — and saying so is the difference between a suggestion
// and a trap.
//
// ── WHY THE GRAMMAR IS GENERAL AND THE REFUSAL IS PER-KIND ──────────────────
//
// Copy-by-reference is not a stair feature; the founder's sentence merely
// happens to be about a stair. So the grammar claims the SHAPE ("same X … in
// level Y") for any element noun, and the copy is specific about which kinds
// the live floor-plate route does and does not carry. Narrowing the grammar to
// "stair" would have made the next report — the same sentence about a column —
// a fresh miss.
//
// PURE — regexes, `findLevel`, and copy. No stores, no I/O.

import type { ResolverContext, SemanticApplication, SemanticIntent } from './ZeroTokenResolver.js';
import { LEVEL_NOUN_SRC, STOREY_NAME_SRC } from './SpatialScopeTail.js';

/** Creation + copying verbs. "create" is here because the founder's own sentence
 *  opens with it — "create SAME stair" — which is copying expressed as making. */
const REPLICATE_VERB_SRC = String.raw`(?:create|make|copy|duplicate|replicate|clone|repeat|mirror|reproduce|put|add|place)`;

/**
 * ⭐ THE REFERENTIAL MARKER — the word that turns "create a stair" into "create
 * THE SAME stair". Without one of these the sentence is an ordinary creation ask
 * and `parsePlacementRef` owns it; that boundary is what keeps this grammar from
 * standing in front of a path that works.
 */
const SAMENESS_SRC =
  String.raw`(?:the\s+same|same|an?\s+identical|identical|a\s+copy\s+of|copies\s+of|another\s+of|a\s+duplicate\s+of|the\s+one)`;

/** Element nouns. Broad on purpose — see the header. */
const ELEMENT_NOUN_SRC =
  String.raw`(?:stairs?|staircases?|walls?|slabs?|floors?|roofs?|columns?|beams?|doors?|windows?|rooms?|railings?|handrails?|furniture|elements?|ones?)`;

/** A level reference — "ground", "level 1", "the 2nd floor". Same sources as
 *  every other spatial grammar, so "ground" cannot mean two things here. */
const LEVEL_REF_SRC =
  String.raw`(?:the\s+)?(?:${LEVEL_NOUN_SRC}\s+)?(?:${STOREY_NAME_SRC}|[\w][\w.-]*)(?:\s+${LEVEL_NOUN_SRC})?`;

/**
 * ⭐ THE FOUNDER'S SHAPE — "create same stair in ground in level 1".
 *
 * Note the TWO place tails. He named the SOURCE storey and the TARGET storey
 * with the same preposition, which is how people talk and is precisely why the
 * existing grammars missed it: every spatial tail in this package is
 * single-valued, and a second "in …" reads as noise to all of them. Both are
 * captured so the refusal can say which it took as the source and which as the
 * target — and be corrected if it guessed wrong.
 */
const REPLICATE_RE = new RegExp(
  String.raw`^${REPLICATE_VERB_SRC}\s+${SAMENESS_SRC}\s+(${ELEMENT_NOUN_SRC})`
  + String.raw`(?:\s+(?:as|like)\s+(?:this|that|the\s+selected|the\s+one)(?:\s+${ELEMENT_NOUN_SRC})?)?`
  + String.raw`(?:\s+(?:from|in|on|at)\s+(${LEVEL_REF_SRC}))?`
  + String.raw`(?:\s+(?:to|in|on|onto|at)\s+(${LEVEL_REF_SRC}))?`
  + String.raw`\s*[.?!]?$`,
  'i',
);

/**
 * ⭐ THE OTHER SHAPE — "copy the selected stair to level 1", "duplicate this
 * stair onto level 3". Verb-led rather than sameness-led.
 *
 * ⛔ IT MUST NOT STEAL `duplicate-level`, which is a LIVE capability
 * ("duplicate level 0 to level 1"). That parser already declines every
 * element-shaped source — its own guard lists `stairs?` among the nouns it
 * refuses — so the two are disjoint by construction: it claims only when the
 * source is a LEVEL, this claims only when the source is an ELEMENT.
 */
const COPY_ELEMENT_RE = new RegExp(
  String.raw`^(?:copy|duplicate|replicate|clone|mirror)\s+(?:the\s+|this\s+|that\s+|these\s+|those\s+)?`
  + String.raw`(?:selected\s+|picked\s+|highlighted\s+|current\s+)?(${ELEMENT_NOUN_SRC})`
  + String.raw`\s+(?:to|onto|into|in|on)\s+(${LEVEL_REF_SRC})\s*[.?!]?$`,
  'i',
);

/** Normalise an element noun to its singular kind word for the copy. */
function singular(noun: string): string {
  const n = noun.trim().toLowerCase();
  // One vocabulary for the stair family, so "staircases" and "stairs" cannot
  // produce two different refusals about the same thing (C84 EI-8).
  if (/^(?:stairs?|staircases?)$/.test(n)) return 'stair';
  if (/^(?:handrails?)$/.test(n)) return 'handrail';
  if (n === 'furniture') return 'furniture';
  return n.replace(/ies$/, 'y').replace(/s$/, '');
}

/**
 * Claim a copy-by-reference sentence.
 *
 * ⛔ NON-CLAIM GUARD: a sentence with no sameness marker AND no explicit copy
 * verb is an ordinary creation ask that `parsePlacementRef` (or the stair-shape
 * grammar) owns and can actually honour. This parser demands evidence that the
 * user is pointing at an EXISTING object.
 */
export function parseReplicateElementIntent(text: string): SemanticIntent | null {
  const m = REPLICATE_RE.exec(text);
  if (m !== null) {
    const kind = singular(m[1]!);
    const first = m[2]?.trim();
    const second = m[3]?.trim();
    // Two tails ⇒ source then target. One tail ⇒ it is the TARGET: "create the
    // same stair in level 1" names where the copy goes, never where it came
    // from (the source is the thing being pointed at, not a place).
    return {
      intent: 'replicate-element',
      elementKind: kind,
      ...(second !== undefined && second.length > 0
        ? { sourceLevelQuery: first, targetLevelQuery: second }
        : first !== undefined && first.length > 0
          ? { targetLevelQuery: first }
          : {}),
    } as SemanticIntent;
  }
  const c = COPY_ELEMENT_RE.exec(text);
  if (c === null) return null;
  return {
    intent: 'replicate-element',
    elementKind: singular(c[1]!),
    targetLevelQuery: c[2]!.trim(),
  } as SemanticIntent;
}

/** Element kinds the LIVE floor-plate duplication really carries — read off
 *  `DuplicateFloorPlanCommand.affectedStores`, so the offer below cannot
 *  promise a kind that command drops. */
const FLOOR_PLATE_COPIES: readonly string[] =
  ['wall', 'slab', 'floor', 'ceiling', 'column', 'furniture'];

/**
 * The refusal.
 *
 * ⭐ IT RESOLVES THE HALF IT CAN. `findLevel` is applied to whatever level the
 * user named, and the reply quotes the level's REAL name when it resolved and
 * says plainly that it did not recognise it when it did not. That is the
 * difference between "I can't do that" and "I understood you want it on Level 1
 * and I still can't do that" — only the second one is falsifiable by the reader.
 */
export function applyReplicateElementRefusal(
  si: Extract<SemanticIntent, { intent: 'replicate-element' }>,
  ctx: ResolverContext,
  findLevelFn: (q: string, levels: ResolverContext['levels']) => { id: string; name: string } | undefined,
): SemanticApplication {
  const kind = si.elementKind;
  const target = si.targetLevelQuery === undefined
    ? undefined
    : findLevelFn(si.targetLevelQuery, ctx.levels);
  const targetPhrase = si.targetLevelQuery === undefined
    ? ''
    : target !== undefined
      ? ` onto ${target.name}`
      : ` onto "${si.targetLevelQuery}" (which is not a level in this project — the levels I can see are `
        + `${ctx.levels.map((l) => l.name).join(', ')})`;

  const carried = FLOOR_PLATE_COPIES.includes(kind);

  const why = kind === 'stair'
    ? 'copying ONE stair to another storey is not a command this product has. A stair is not '
      + 'positioned like a wall — it already spans two levels, so "put another one on level 1" '
      + 'means re-deriving its riser height for a different floor-to-floor gap and re-cutting the '
      + 'slab it pierces. I will not synthesise that from a sentence: it would be a second '
      + 'authority for geometry the stair pipeline already owns, computed from numbers you did '
      + 'not give me'
    : `copying ONE existing ${kind} by pointing at it is not a command this product has. The copy `
      + 'verb it does have takes a distance to move by, not a level to land on, so there is nothing '
      + 'I could send that would put it where you asked';

  const offer = carried
    ? `What does work today: "duplicate ground to level 1" copies a whole storey's floor plan — `
      + `walls, slabs, floor finishes, ceilings, columns and furniture, ${kind}s included — in one go.`
    : 'What does work today: "duplicate ground to level 1" copies a whole storey\'s floor plan — '
      + 'walls, slabs, floor finishes, ceilings, columns and furniture. '
      + `⚠ It does NOT copy ${kind}s, and I would rather tell you that than let you find out after.`;

  const stairExtra = kind === 'stair'
    ? ' To put a second stair on another storey: say "create a stair in L shape" (or whichever shape '
      + 'you want) and draw it there — then "change width of all stairs to 1.2 meters" and '
      + '"make all the stairs monolithic concrete" match it to the first one in one sentence each.'
    : '';

  return {
    kind: 'refusal',
    intent: 'replicate-element',
    reason:
      `I can't create the same ${kind}${targetPhrase} — ${why}. `
      + 'Nothing was created, and nothing about your model changed. '
      + offer
      + stairExtra,
    suggestions: [
      'duplicate ground to level 1',
      ...(kind === 'stair'
        ? ['create a stair in L shape', 'change width of all stairs to 1.2 meters']
        : []),
    ],
  };
}
