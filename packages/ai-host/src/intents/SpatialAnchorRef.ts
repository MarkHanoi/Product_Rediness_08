// @pryzm/ai-host — SpatialAnchorRef (§RAC-ANCHOR-ONE-VOCABULARY, L-1540)
// =============================================================================
//
// ⭐ THE REFERENTIAL EXPRESSION — "this wall", "the selected wall", "the wall I
// picked" — AND THE RELATION THAT POINTS AT IT — "aligned to", "against",
// "parallel to", "connected to".
//
// ── WHY THIS IS ITS OWN MODULE AND NOT TWO REGEXES IN TWO GRAMMARS ──────────
//
// It was two regexes in one grammar, and the founder's sentence walked straight
// past it. `StairNotYet.ts` shipped `ANCHOR_REF_RE` (L-1444) with the relation
// verbs
//
//     connected | attached | anchored | next | adjacent | against | beside | alongside
//
// which is every word the founder used **in the sentence that was in front of
// the author at the time** ("…connected to this wall"). Days later he typed
//
//     "create stair in L shape ALIGNED TO the selected wall"
//
// and got `{kind:'miss'}` — *"I'm not sure how to help with that yet."* Not the
// carefully-written refusal that exists for precisely this ask: a MISS, which is
// indistinguishable from "I did not parse your grammar" (CapabilityRefusal.ts
// enumerates the three states and why conflating them was the whole defect).
//
// ⛔ THE FIX IS NOT TO ADD "aligned" TO THE LIST. That is the same defect with a
// longer list, and it would be minted a third time the next time the founder
// writes "facing" or "running along". The RAC doctrine is explicit and standing:
// **open language, never a narrowed vocabulary — safety comes from RULE GATES
// that refuse with both numbers, not from restricting what the user may say.**
// A refusal grammar narrower than the doctrine it serves is a gate that only
// fires on the phrasings its author happened to have on screen.
//
// So the vocabulary is lifted HERE, widened to the CLASS (spatial relation, not
// eight literals), and read by every grammar that needs it. One vocabulary, one
// place to widen, and two grammars that cannot drift — the same discipline
// `SpatialScopeTail.ts` records for the level tail (L-1201, L-1261: a THIRD
// hand-written spatial tail was found and dissolved into the shared one).
//
// ⚠ WHAT THIS MODULE DOES **NOT** DO, and must not start doing: it does not
// RESOLVE the reference. It reads that the user pointed at something and which
// words they used. Turning "the selected wall" into a position and a direction
// needs geometry that `ResolverContext.selection` does not carry — it is
// `{elementId, elementType}` and nothing else. That gap is real, it is measured,
// and it is named in the refusals this module feeds; it is deliberately NOT
// papered over here by guessing a position (C83 §4.2).
//
// PURE — regexes only. No stores, no I/O, no DOM.

/**
 * The SPATIAL RELATION class — how a user says one thing is positioned with
 * respect to another.
 *
 * ⭐ Grouped by what they mean, because that is the axis along which this list
 * is allowed to grow. A word belongs here when it expresses "where, relative to
 * that thing"; it does NOT belong here merely because it appeared in a sentence
 * once.
 *
 * `aligned` / `align` / `parallel` / `perpendicular` / `flush` are the founder's
 * live ask (L-1540) and were the whole miss. `following` / `facing` / `running
 * along` are the same class and are added now rather than after the next report.
 */
const RELATION_SRC = String.raw`(?:`
  // co-orientation — the founder's word, and its neighbours
  + String.raw`aligned?|align(?:ing)?|parallel|perpendicular|flush|square`
  // attachment
  + String.raw`|connected?|attach(?:ed)?|anchor(?:ed)?|fixed|joined?|tied`
  // adjacency
  + String.raw`|next|adjacent|beside|alongside|against|near|touching|abutting`
  // path-following
  + String.raw`|along|following|follows?|facing|running`
  // the bare locative, which English lets stand in for all of the above
  + String.raw`|starting|based|centred|centered`
  + String.raw`)`;

/**
 * The particles a relation takes before its object — "aligned **to**",
 * "parallel **with**", "along **the**", "against ∅". All optional, because
 * English drops them freely and a grammar that requires one is narrower than
 * the language it claims to read.
 */
const RELATION_PARTICLE_SRC = String.raw`(?:\s+(?:to|with|on|onto|off|of|from|against|along|by|at|towards?))?`;

/**
 * ⭐ THE DETERMINER — the half that makes it a REFERENCE rather than a
 * DESCRIPTION, and the distinction the whole capability turns on.
 *
 * "against a wall" describes a kind of place. "against **the selected** wall"
 * points at a specific object the user has already picked, which the words alone
 * cannot identify — only the live selection can. Every grammar reading this
 * module must keep that distinction, because the second one is answerable (or
 * honestly refusable) and the first one is not.
 *
 * ⚠ THE ARTICLE IS INSIDE THIS GROUP, NOT OUTSIDE IT, and that is a bug fix
 * rather than a style choice. Written as `(?:the\s+)?(this|…|selected|…)` the
 * outer optional `the` is greedy: on "the selected wall" it consumes "the " and
 * the capture comes back as `selected`, so `describeAnchorRef` renders "selected
 * wall" and the reply quotes the user in words the user did not use. Folding the
 * article in keeps the captured determiner WHOLE — which is the entire point of
 * quoting it back.
 */
const DETERMINER_SRC =
  String.raw`(?:this|that|these|those|my`
  + String.raw`|(?:the\s+)?(?:selected|picked|highlighted|chosen)`
  + String.raw`|the\s+(?:active|current)|(?:the\s+)?selection)`;

/** The element nouns a spatial anchor is ever expressed against. Deliberately
 *  broad: the anchor capability is not a stair feature, and the refusals that
 *  read it must be able to quote back "the selected slab" as accurately as
 *  "the selected wall". */
const ANCHOR_NOUN_SRC =
  String.raw`(?:walls?|slabs?|floors?|roofs?|columns?|beams?|stairs?|rooms?|doors?|windows?|edges?|elements?|ones?|selection)`;

/**
 * A parsed spatial anchor reference.
 *
 * `noun` is `undefined` for a bare "aligned to this" / "against the selection" —
 * still a reference, still un-resolvable, and still worth quoting back.
 */
export interface SpatialAnchorRef {
  /** The relation word the user used, lowercased ("aligned", "against"). */
  readonly relation: string;
  /** The determiner that makes it a reference ("this", "the selected"). */
  readonly determiner: string;
  /** The element noun, when one was said ("wall", "walls"). */
  readonly noun?: string;
}

/**
 * ⭐ THE FULL SHAPE — relation + determiner + optional noun.
 *
 *   "aligned to the selected wall" · "against this wall" · "parallel with those
 *   walls" · "along the picked edge" · "connected to this"
 */
const ANCHOR_RE = new RegExp(
  // ⛔ NO outer `(?:the\s+)?` — the article lives inside DETERMINER_SRC so the
  // capture comes back WHOLE ("the selected", not "selected"). See its comment.
  String.raw`\b${RELATION_SRC}${RELATION_PARTICLE_SRC}\s+(${DETERMINER_SRC})`
  + String.raw`(?:\s+(${ANCHOR_NOUN_SRC}))?\b`,
  'i',
);

/**
 * ⛔⛔ THE DETERMINER-ALONE SHAPE IS DELIBERATELY NOT READ — "the selected
 * stairs" is a SUBJECT, not an ANCHOR, and conflating them was a measured
 * over-claim, not a hypothetical one.
 *
 * This module first shipped with a second pattern that matched a determiner plus
 * a noun with no relation word ("on the selected wall", and bare "the selected
 * wall"). GA gate 31 check 4b caught what that did within one run:
 *
 *     set-stair-dimensions: example "make the selected stairs 1.2m wide"
 *     resolved to create-stair-span, not to itself.
 *
 * "make the selected stairs 1.2m wide" is a LIVE capability's own declared
 * example — the copy a refusal offers the user. The bare pattern read "the
 * selected stairs" as a spatial anchor, which made the stair-span grammar claim
 * the sentence, which turned a working bulk resize into a refusal about geometry
 * nobody asked for. C68 §6.3-G2: *"An example that does not work is a lie shipped
 * in the UI."*
 *
 * ⭐ THE RELATION WORD IS WHAT MAKES A REFERENCE SPATIAL, and C67 §4 rule 20's
 * own table is the reason: the selection as a SUBJECT ("make **this** wall 3 m
 * high") ✅ WORKS and is a different thing from the selection as a GEOMETRY
 * SOURCE ("create a stair **connected to** this wall") ⛔ NOT BUILT. Only the
 * second is this module's business, and only a relation word distinguishes them.
 * A grammar that cannot tell them apart will keep stealing sentences from the
 * arm that serves the first.
 *
 * ⛔ Do not re-add a relation-free pattern. If "create a stair on the selected
 * slab" needs reading, add `on`/`at` to the RELATION class where they are
 * bounded by the same determiner requirement — never a standalone shape.
 */

/**
 * Read a spatial anchor reference out of an utterance, or `null` when the user
 * did not point at anything.
 *
 * ⛔ It reads ONLY. It resolves nothing, and callers must not treat a non-null
 * result as "we know where that is" — see the header. The single legitimate use
 * today is to make an answer ACCURATE about the clause it could not honour,
 * rather than silently dropping the hard half of the sentence.
 */
export function parseSpatialAnchorRef(text: string): SpatialAnchorRef | null {
  const m = ANCHOR_RE.exec(text);
  if (m === null) return null;
  return {
    relation: m[0]!.trim().split(/\s+/)[0]!.toLowerCase(),
    determiner: m[1]!.trim().toLowerCase().replace(/\s+/g, ' '),
    ...(m[2] !== undefined ? { noun: m[2].trim().toLowerCase() } : {}),
  };
}

/**
 * The anchor phrased back at the user in their OWN words — "the selected wall",
 * "this wall", "the selection".
 *
 * A refusal that repeats the ask proves it was read; a refusal that paraphrases
 * it into house vocabulary reads as though the machine heard something else.
 */
export function describeAnchorRef(ref: SpatialAnchorRef): string {
  const det = ref.determiner === 'selection' ? 'the selection' : ref.determiner;
  return ref.noun === undefined ? det : `${det} ${ref.noun}`;
}

/**
 * ⭐ THE ONE HONEST SENTENCE about why an anchor cannot be honoured, shared by
 * every grammar that reads one.
 *
 * It is a single exported constant rather than copy in each refusal because the
 * moment it is true in two places it will stop being true in one of them —
 * exactly what happened to `StairNotYet.ts`'s slab-opening blocker, which stayed
 * in shipped user-facing copy for three hours after L-1433 made it false. When
 * selection geometry does reach this layer, this sentence is the thing that has
 * to change, and there is precisely one of it.
 */
export const ANCHOR_NOT_RESOLVABLE_REASON =
  'what I can see of your selection is WHICH element it is, not WHERE it is — '
  + 'positioning against it needs a start point and a direction, and I will not '
  + 'guess either';
