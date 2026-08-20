// @pryzm/ai-host — StairCreateShape (§FEAT-RAC-STAIR-SHAPE, L-1541)
// =============================================================================
//
// ⭐ THE FOUNDER TYPED *"create stair in L shape aligned to the selected wall"*
// AND GOT `{kind:'miss'}` — while an **L-Shape button sat in the Create
// palette**, wired to `BimService.activateStairPathTool('L')`.
//
// ── WHY THIS IS A FEATURE AND NOT ANOTHER REFUSAL ───────────────────────────
//
// C84 §4F.5 names the defect class this would otherwise have been:
// **"THE WRONG-REFUSAL DEFECT CLASS — a correct-looking refusal for a
// capability that EXISTS."** The stair SHAPE axis is not missing. It shipped as
// a first-class axis on 2026-08-19 (C98 §16, §STAIR-TWO-AXES): the creation
// matrix declares `shapes: STAIR_SHAPES` on the `stair` and `stair-path` rows,
// separately from `modes`, and the palette's four buttons — Straight (I),
// L-Shape, U-Shape, Curved (C) — each call `activateStairPathTool(shape)`.
//
// It was **unreachable from language, and only from language.** The chat's
// placement grammar (`parsePlacementRef`) declines any sentence carrying a
// preposition — deliberately, so "add a bathroom in room 001" is not
// half-claimed — and every way of saying "L-shaped" that a person actually
// types carries one: *in* an L shape, *as* an L, *with* a 90° turn. So the one
// phrasing that reached the tool was the article-free "create an L shaped
// stair", which nobody says.
//
// ⛔ WHAT THIS MODULE MUST NOT BECOME. It does not create a stair. It arms the
// SAME tool the palette button arms, with the SAME shape, and the user's click
// places it — the L-906 `activate-placement` shape exactly (C83 §4.3: no
// position is ever guessed). Nothing is written, so there is nothing to undo
// until the user places.
//
// ── THE HALF IT CANNOT HONOUR, AND WHY IT SAYS SO OUT LOUD ──────────────────
//
// "aligned to the selected wall" is a SELECTION REFERENCE USED AS A GEOMETRY
// SOURCE, and C67 §4 rule 20 states in those words that it is **NOT BUILT**:
// `ResolverContext.selection` carries `{elementId, elementType}` and never a
// position. Rule 20.b is a MUST NOT — *"a capability MUST NOT guess a position
// from a selection"* — and rule 20.c forbids adding the geometry channel
// without its bridge-side filler in the same change. So the alignment is not
// applied, and this module does not pretend otherwise.
//
// ⭐ IT IS DISCLOSED, NEVER DROPPED. C68 §5.g: *"Granularity gaps are refused by
// naming the gap … never silently widened."* The operative word is SILENTLY. A
// reply that arms the L-shape tool and says nothing about the wall would be
// C84 EI-2 narrowing — the user asked for two things and would be told about
// one. So the reply names both halves and, per C16 CA-18, names the LIVE route
// for the half it dropped: **By Walls** (C98 §16.6, L-1455/L-1456), which is
// the founder's own *"select 2 walls [and] create the stair in L SHAPE AGAINST
// THE WALLS"* and is a real, shipped action on the stair mode bar.
//
// ── WHAT THIS MODULE DELIBERATELY DOES NOT CLAIM ────────────────────────────
//
// A sentence carrying a LEVEL RANGE ("from ground to level 5"). That is
// `create-stair-span`'s, it is a pinned REFUSAL (C98 §L-1441.1.a), and
// §L-1441.4.a is explicit that it must not be softened into a partial result.
// This grammar therefore stands down whenever a range is present, and the
// matcher order makes that provable rather than merely intended.
//
// PURE — regexes and copy. No stores, no I/O, no DOM.

import { STAIR_SHAPES, type StairShapeChoice } from '@pryzm/geometry-stair';
import type { SemanticApplication, SemanticIntent } from './ZeroTokenResolver.js';
import { parseSpatialAnchorRef, describeAnchorRef, ANCHOR_NOT_RESOLVABLE_REASON } from './SpatialAnchorRef.js';

/** The creation verbs — the same set `PlacementActivation` and `StairNotYet`
 *  claim, so the three grammars agree on what "create" looks like. */
const CREATE_VERB_SRC = String.raw`(?:create|place|add|insert|draw|put|build|make|start)`;

/** The stair noun, identical to `StairNotYet`'s. */
const STAIR_NOUN_RE = /\b(?:stairs?|staircases?|stairways?|stair cases?)\b/i;

/**
 * ⭐ THE SHAPE VOCABULARY, DERIVED FROM THE CATALOGUE — never transcribed.
 *
 * `STAIR_SHAPES` (@pryzm/geometry-stair/stairPath/StairShapeRegistry) is the
 * catalogue of record; C98 §16.1.c names it as the authority the creation
 * matrix, the palette and the param panel are all faces of. Reading the labels
 * from it means a fifth shape becomes speakable the moment it is authored, and
 * a retired one stops being speakable — the C69 discipline (one enumeration, no
 * hand-written rival), applied to a grammar rather than to a resolver.
 *
 * ⚠ `StairShapeChoice` ('I' | 'L' | 'U' | 'C') is the TOOL's shape axis, which
 * is NOT `StairShape` ('I' | 'L' | 'U' | 'spiral' | 'winder') — the command's.
 * 'C' is authorable and is not a `StairShape`; the plan handler narrows it. We
 * speak the TOOL's vocabulary here because we activate the TOOL.
 */
const SHAPE_LETTERS: readonly StairShapeChoice[] = STAIR_SHAPES.map((s) => s.label);

/** Human words per shape letter, for BOTH reading and writing. The letter is
 *  the id; these are the ways people say it. */
const SHAPE_WORDS: Readonly<Record<StairShapeChoice, readonly string[]>> = {
  I: ['straight', 'single flight', 'single-flight', 'linear', 'i'],
  L: ['l', 'l-shaped', 'quarter turn', 'quarter-turn', '90 degree turn', 'dog leg', 'dog-leg'],
  U: ['u', 'u-shaped', 'half turn', 'half-turn', '180 degree turn', 'switchback', 'scissor'],
  C: ['c', 'curved', 'curving', 'arc', 'arced', 'helical', 'sweeping'],
};

/** The shape's human label, read from the catalogue so the reply and the
 *  palette button cannot drift apart. */
export function stairShapeLabel(shape: StairShapeChoice): string {
  return STAIR_SHAPES.find((s) => s.label === shape)?.hint ?? `${shape}-shape`;
}

/**
 * ⭐ THE LETTER SHAPES — "in L shape", "L-shaped", "as an L", "in the shape of
 * a U".
 *
 * A bare capital letter is NOT enough on its own ("create a stair L" is not
 * something anyone types, and claiming it would make every stray letter a
 * shape); the letter must sit next to a shape NOUN or a hyphenated "-shaped".
 */
const LETTER_SHAPE_RE =
  /\b(?:in\s+(?:an?\s+)?|as\s+(?:an?\s+)?|shaped?\s+like\s+(?:an?\s+)?|(?:in\s+)?the\s+shape\s+of\s+(?:an?\s+)?)?([LUIC])[\s-]?shaped?\b|\b([LUIC])[\s-]shape\b|\bshape[\s:-]+([LUIC])\b/i;

/**
 * The word shapes — "straight", "curved", "switchback", "quarter turn".
 *
 * ⚠ SHAPES WITH NO WORDS ARE DROPPED, NOT COMPILED. A fifth shape authored in
 * `STAIR_SHAPES` without an entry in `SHAPE_WORDS` would otherwise build the
 * alternation `\b(?:)\b`, which matches the EMPTY STRING — i.e. every utterance
 * would claim that shape and the grammar would silently answer every stair
 * sentence with the wrong one. Deriving the letters from the catalogue is right;
 * assuming the catalogue and this table stay in step is not, so the mismatch
 * degrades to "that shape is only speakable by its letter" instead of to chaos.
 *
 * Single-character words are filtered for the same reason: a bare "i" or "c"
 * would match inside ordinary prose. Letters are `LETTER_SHAPE_RE`'s job, where
 * they must sit next to a shape noun.
 */
const WORD_SHAPE_RES: readonly (readonly [StairShapeChoice, RegExp])[] =
  SHAPE_LETTERS.flatMap((letter) => {
    const words = (SHAPE_WORDS[letter] ?? []).filter((w) => w.length > 1);
    if (words.length === 0) return [];
    return [[
      letter,
      new RegExp(
        String.raw`\b(?:${words
          .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, String.raw`\s+`))
          .join('|')})\b`,
        'i',
      ),
    ] as const];
  });

/**
 * ⛔ THE RANGE GUARD — the one sentence shape this grammar must never take.
 *
 * Kept deliberately as a LOOSE test rather than importing `StairNotYet`'s exact
 * `LEVEL_RANGE_RE`: this is a STAND-DOWN condition, and a stand-down that is
 * looser than the claim it defers to can only ever hand a sentence over, never
 * steal one. The direction of the inequality is the safety property.
 */
const HAS_LEVEL_RANGE_RE =
  /\bfrom\s+[\w .-]+?\s+(?:to|up to|through|until)\s+|\bbetween\s+[\w .-]+?\s+and\s+/i;

/**
 * ⛔ THE BULK-SCOPE GUARD — the non-claim that matters most, and the one this
 * grammar would have got wrong without it.
 *
 * "make" is a creation verb ("make a stair") AND the shared edit verb ("make all
 * the stairs monolithic concrete"). The catalogue families run earlier and claim
 * the sentences whose value they can resolve — but *"make all the stairs
 * straight"* names a value they CANNOT resolve (it is a shape, not a stair
 * type), so it would fall through to here and be answered by ARMING A CREATION
 * TOOL. The user asked to change stairs that already exist and would have been
 * handed a draw cursor: C68 §5.j's claiming discipline, and the same shape as
 * *"a read-only visibility question silently RESIZES a wall."*
 *
 * A SCOPE WORD is the discriminator, because it is what makes a sentence be
 * about existing elements: you cannot create "all the stairs". So any sentence
 * carrying one stands down here — and lands, correctly, as an unresolvable
 * ask on the family that owns bulk stair edits rather than as a wrong action.
 *
 * ⚠ Changing the shape of stairs that already exist has no chat route at all
 * (`UpdateStairParametersInput.updates` has no `shape` field, and
 * `ChangeStairShapeCommand` has no bus id). That is a REAL gap, and standing
 * down is how it stays visible instead of being masked by a tool activation.
 *
 * ⭐⭐ THE SCOPE WORD MUST QUALIFY THE **STAIR** NOUN, NOT MERELY APPEAR.
 * The founder's own sentence — *"create stair in L shape aligned to **the
 * selected** wall"* — contains "the selected", about the WALL. A guard written
 * as a bare `\bselected\b` would have stood this grammar down on the very
 * sentence it exists to serve, which is the failure mode that produced L-1540
 * in the first place, arriving from the opposite direction.
 */
const BULK_SCOPE_RE = new RegExp(
  String.raw`\b(?:all|every|each|both|these|those|the\s+selected|selected|the\s+existing|existing)\s+`
  + String.raw`(?:the\s+)?(?:stairs?|staircases?|stairways?)\b`,
  'i',
);

/** Read the shape out of an utterance, or null when none was named. */
export function parseStairShapeRef(text: string): StairShapeChoice | null {
  const letter = LETTER_SHAPE_RE.exec(text);
  if (letter !== null) {
    const l = (letter[1] ?? letter[2] ?? letter[3] ?? '').toUpperCase() as StairShapeChoice;
    if (SHAPE_LETTERS.includes(l)) return l;
  }
  for (const [shape, re] of WORD_SHAPE_RES) {
    if (re.test(text)) return shape;
  }
  return null;
}

/**
 * Claim a stair-CREATION sentence that names a SHAPE.
 *
 * ⛔ THREE NON-CLAIM GUARDS, each protecting a path that already does the right
 * thing (§FIX-PLACEMENT-OVERCLAIM records eight pills lost to exactly this
 * mistake, and §FIX-CHAT-HIDE-IS-NOT-NAVIGATE names the shape of the error —
 * "the ladder was not covering a gap, it was STANDING IN FRONT of the path that
 * does the right thing"):
 *
 *   1. no creation verb, or no stair noun ⇒ not ours;
 *   2. no SHAPE named ⇒ `parsePlacementRef` owns "create a stair" and activates
 *      the tool with its own default — which WORKS, and is pinned by test;
 *   3. a LEVEL RANGE present ⇒ `create-stair-span`'s pinned refusal owns it
 *      (C98 §L-1441.1.a), and softening that into a partial success is
 *      forbidden by §L-1441.4.a.
 */
export function parseCreateStairShapeIntent(text: string): SemanticIntent | null {
  if (!new RegExp(`^${CREATE_VERB_SRC}\\b`, 'i').test(text)) return null;
  if (!STAIR_NOUN_RE.test(text)) return null;
  if (HAS_LEVEL_RANGE_RE.test(text)) return null;
  // ⛔ "make all the stairs straight" is an EDIT of existing stairs, not a
  // creation. See BULK_SCOPE_RE for why standing down is the honest answer.
  if (BULK_SCOPE_RE.test(text)) return null;
  const shape = parseStairShapeRef(text);
  if (shape === null) return null;
  const anchor = parseSpatialAnchorRef(text);
  return {
    intent: 'create-stair-shape',
    shape,
    ...(anchor !== null ? { anchorRef: describeAnchorRef(anchor) } : {}),
  } as SemanticIntent;
}

/**
 * ⭐ THE ANCHOR DISCLOSURE — the sentence appended to the activation reply when
 * the user asked for an alignment this layer cannot apply.
 *
 * Exported because the EDITOR bridge is what finally speaks it, and only the
 * bridge knows whether the tool actually armed. A note promising "I armed the
 * L-shape but did not align it" would be a second false statement if the tool
 * was not ready — so the copy is authored here (where the language knowledge
 * is) and ATTACHED there (where the outcome is known).
 */
export function anchorNotHonouredNote(anchorRef: string): string {
  return (
    ` I did NOT align it to ${anchorRef} — ${ANCHOR_NOT_RESOLVABLE_REASON}. `
    + 'For that, use the stair bar\'s "By Walls" action and pick the two walls you want '
    + 'the stair in the corner of — that route reads the walls\' real geometry, which I cannot.'
  );
}

/**
 * The `create-stair-shape` semantic → a LOCAL `activateTool` action carrying
 * the shape.
 *
 * ⭐ THE SHAPE RIDES THE EXISTING PLACEMENT CHANNEL rather than minting a
 * second activation path. The bridge publishes it to `StairToolConfigStore` —
 * the single chokepoint `activateStairPathTool` itself writes, whose own
 * comment says it exists *"so the plan tool, the 3D sketch tool and any
 * batch/AI path all author from the SAME resolved config (P2)"*. The AI path it
 * names had never been connected; this is that connection, not a rival to it.
 */
export function applyCreateStairShape(
  si: Extract<SemanticIntent, { intent: 'create-stair-shape' }>,
  _ctx: unknown,
): SemanticApplication {
  const label = stairShapeLabel(si.shape);
  return {
    kind: 'local',
    intent: 'create-stair-shape',
    summary: `Activate ${label} stair placement`,
    action: 'activateTool',
    placement: {
      itemRef: 'stair',
      stairShape: si.shape,
      ...(si.anchorRef !== undefined ? { unhonouredNote: anchorNotHonouredNote(si.anchorRef) } : {}),
    },
  };
}
