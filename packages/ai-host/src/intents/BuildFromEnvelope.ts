// @pryzm/ai-host — BuildFromEnvelope (§RAC-BUILD-FROM-ENVELOPE, L-13176)
// =============================================================================
//
// ⭐ THE FOUNDER TYPED, IN HIS OWN WORDS: *"From Envelopes create walls, slabs,
// floors, ceilings, and roofs: 'Create Walls and Slabs from Envelope'"* — and
// the chat had no way to reach a builder that HAS SHIPPED and is GREEN.
//
// ── THIS IS A SECOND ENTRY POINT, NOT A SECOND BUILDER ──────────────────────
//
// `apps/editor/src/ui/site/buildFromDesignPlan.ts` + `buildFromDesignExecutor.ts`
// already turn the user's `role:'level'` and `role:'room'` space envelopes into
// walls and a floor plate; the Parcel Law panel's *"Create BIM from this design"*
// button drives exactly that pair. C84 EI-9 — *"for any question the system
// answers there is exactly ONE implementation, and every consumer reaches it"* —
// so this module MINTS NO PLANNER AND NO GEOMETRY. It claims the sentence, maps
// it to ONE bus command (`generation.from-envelope`), and the editor-side seam
// calls the SAME planner and the SAME executor the button calls, through the
// panel's own `defaultParcelLawCreateHouseDeps()` wiring object.
//
// The precedent it copies is the envelope tool's own log line: *"panel opened
// over a site view — ONE command path, two entry points."*
//
// ── WHY IT IS ROUTED BEFORE THE SWITCH, NOT AS A CASE ARM ───────────────────
//
// Gate 31 check 8 (C68 §6.3-G5) counts `\n    case '<intent>':` in
// `ZeroTokenResolver.ts` against `MAX_RESOLVER_CASE_ARMS`, and the count reads
// **30/30 — AT the ceiling, with zero headroom** (measured 2026-09-07 at HEAD
// 0cb27a25, `npx tsx tools/ga-gate/check-chat-capability-coverage.ts`). A
// thirty-first arm is exit 3, which §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836)
// makes non-absorbable — and raising the ceiling to make room for one's own
// change is the one forbidden fix.
//
// So this family takes the seam C67 §4 rule 5 and C68 §5.i ask for anyway:
// *"a capability of a known shape is a TABLE ROW … zero new resolver case arms."*
// `applySemanticIntent` routes to it by MEMBERSHIP, exactly as it already routes
// `create-stair-shape`, `replicate-element`, the visibility family, the property
// query and the level-change family. The ratchet is unchanged at 30/30 by this
// lane — verify, do not trust this sentence.
//
// ── FOUNDER DOCTRINE: OPEN LANGUAGE IN, HARD STOPPERS AS GATES ──────────────
//
// The vocabulary is deliberately WIDE — "create walls and slabs from my
// envelope", "build what I drew", "turn my envelopes into BIM", "make it real".
// Safety is NOT bought by narrowing what may be said; it is bought by REFUSING
// with both numbers when the ask exceeds what the pass builds, and by the
// destructive Confirm card the bridge draws before anything is dispatched.
//
// ── THE NAMING TENSION, RESOLVED DELIBERATELY ───────────────────────────────
//
// He titles it "Create Walls and Slabs from Envelope" and enumerates FIVE
// outputs. ONE capability, named `build-from-envelope`, not five:
//
//   · it is ONE GESTURE — five ids would be five grammars competing for one
//     sentence and five rows dispatching the SAME command (C84 EI-9 on purpose);
//   · his own doctrine forbids the split — five ids force the resolver to pick
//     exactly one, so "make it real" would have to be refused or arbitrarily
//     routed;
//   · the id IS the `SemanticIntent.intent` and is therefore STABLE.
//     `build-walls-and-slabs-from-envelope` would need renaming the week the
//     builder learns ceilings. HIS TITLE BECOMES THE FIRST EXAMPLE, which is
//     where a user actually reads it.
//
// ⛔ AND IT NEVER CLAIMS TO BUILD WHAT IT DOES NOT (C67 §4 rule 10). Of his five
// nouns the pass builds TWO: walls and the floor plate. Floor finishes, ceilings
// and a roof are named as unbuilt, BY NAME, with the live route for each. The
// plan's own `willNotCreate` array is relayed verbatim by the seam, so when the
// builder widens, the reply narrows in the same commit without a review
// (C84 EI-8a). The three sentences below are the LANGUAGE half of that and are
// pinned against the plan's array by
// `apps/editor/src/ui/ai/__tests__/buildFromEnvelopeChatSeam.spec.ts`.
//
// PURE — regexes and copy. No stores, no I/O, no DOM. `findLevel` is passed IN
// (the `applyMoveToLevelIntent` precedent) so there is ONE level-name resolver
// for the whole package and no import cycle back into ZeroTokenResolver.

import type {
  BusCommandRef,
  ResolverContext,
  ResolverLevel,
  SemanticApplication,
  SemanticIntent,
} from './ZeroTokenResolver.js';
import { matchTrailingSpatialScope } from './SpatialScopeTail.js';

// ─── The verb this capability's bus command is ───────────────────────────────

/**
 * The ONE bus verb. Registered in `apps/editor/src/engine/initBusHandlers.ts`
 * beside its four `generation.*` siblings.
 *
 * ⛔ IT IS NOT `wall.batch.create` / `slab.batch.create`, and that is a hard
 * constraint rather than a preference. Both are classified **C — internal
 * machinery** in `ChatCommandClassification.ts` (*"exposing the raw batch verb
 * to chat would be a footgun"*), and C68 §5.b makes the three declaration
 * surfaces DISJOINT — the coverage gate fails a verb that appears in two. An
 * OUTCOME verb over the existing batch verbs is the shape the repo already uses
 * for every generation flow.
 */
export const BUILD_FROM_ENVELOPE_VERB = 'generation.from-envelope';

// ─── The part vocabulary ─────────────────────────────────────────────────────

/**
 * What the pass CAN build today. Ordered as the executor dispatches them.
 *
 * ⭐ `ceilings` MOVED HERE FROM `BuildFromEnvelopeDeferredPart` when
 * §BIM-FROM-THE-DESIGN taught the executor `ceiling.batch.create`. It is not a
 * widening of the vocabulary — the word was already understood, it was
 * understood as a REFUSAL. Leaving it deferred after the executor started
 * dispatching ceilings would have made the Confirm card say "it does NOT build
 * ceilings" about a pass that builds them, which is worse than not knowing the
 * word at all.
 */
export type BuildFromEnvelopePart = 'walls' | 'floor-plate' | 'ceilings';

/** What the founder asked for that the pass does NOT build. Named, never dropped. */
export type BuildFromEnvelopeDeferredPart = 'floor-finishes' | 'roof';

/** Every buildable part, in dispatch order. The default when the sentence names
 *  no part at all ("make it real"). */
export const BUILDABLE_PARTS: readonly BuildFromEnvelopePart[] =
  Object.freeze(['walls', 'floor-plate', 'ceilings'] as const);

/** How each part is SPOKEN back to the user. One spelling, used by the summary,
 *  every refusal and the seam's report. */
export const PART_WORD: Readonly<Record<BuildFromEnvelopePart, string>> = {
  walls: 'walls',
  'floor-plate': 'the floor plate',
  ceilings: 'ceilings',
};

export const DEFERRED_PART_WORD: Readonly<Record<BuildFromEnvelopeDeferredPart, string>> = {
  'floor-finishes': 'floor finishes',
  roof: 'a roof',
};

/**
 * ⭐ WHY EACH DEFERRED PART IS DEFERRED, AND THE LIVE ROUTE FOR IT (C16 CA-18 —
 * a refusal that cannot be acted on is not a refusal).
 *
 * ⚠ THESE ARE LICENSED COPIES, NOT INVENTIONS. The roof sentence is
 * `BUILD_FROM_DESIGN_WILL_NOT_CREATE[1]` and the room-record sentence is
 * `BUILD_FROM_DESIGN_WILL_NOT_CREATE[5]` (`buildFromDesignPlan.ts`), which is an
 * `apps/editor` module this L2 package may not import (the layer runs one way).
 * So the copy lives here and is PINNED to the array by a test in `apps/editor`,
 * which can see both — C84 EI-8a: *a licensed copy is pinned by a test, never by
 * a comment*. Delete a line from that array and the pin goes red.
 */
export const DEFERRED_PART_REASON:
  Readonly<Record<BuildFromEnvelopeDeferredPart, string>> = {
  'floor-finishes':
    'floor finishes are built from ROOM records, and this pass creates none — the walls enclose '
    + 'your spaces and room detection runs over them afterwards. Build the walls first, then say '
    + '"add floor finishes to all rooms"',
  roof:
    'no space envelope carries a roof form, so any roof built here would be PRYZM choosing a form '
    + 'you did not draw. Ask for one on the house arm, where the form is an input you give',
};

// ─── The grammar ─────────────────────────────────────────────────────────────

/**
 * Creation verbs in OPENER position. Wider than `generate-building`'s four
 * because the founder's doctrine is open language in — "turn", "materialise"
 * and "realise" all mean the same gesture to a user and cost nothing to accept.
 *
 * ⛔ NO VISIBILITY VERB IS HERE. "highlight the walls from my envelope" must
 * never reach a mutation (C68 §5.j.1 — the worst recorded instance RESIZED the
 * walls). The ladder gate in `CapabilityRefusal.visibilityMisreadReason` is the
 * second, un-bypassable line; this list is the first.
 */
const CREATE_VERB_SRC =
  String.raw`(?:create|build|make|generate|construct|produce|turn|convert|materiali[sz]e|reali[sz]e)`;

const OPENER_RE = new RegExp(String.raw`^(?:i\s+want\s+(?:to|you\s+to)\s+|let'?s\s+|can\s+you\s+|could\s+you\s+)?${CREATE_VERB_SRC}\b`, 'i');

/**
 * ⭐ THE DISCRIMINATOR. The sentence must point at the thing the user DREW —
 * that is what separates this capability from `generate-building`, which
 * proposes a design of its own on the parcel.
 *
 * "my design" / "this design" / "what I drew" are included because the panel's
 * own button says *"Create BIM from this design"*, and a user who read that
 * button will type its words.
 */
const ENVELOPE_ANCHOR_RE =
  /\b(?:space\s+)?envelopes?\b|\b(?:my|the|this|that|these|those)\s+design\b|\bwhat\s+(?:i|i've|i\s+have)\s+(?:drew|drawn|sketched)\b|\bwhat\s+i\s+drew\b|\b(?:my|the)\s+drawing\b|\bi\s+(?:drew|sketched)\b/i;

/**
 * The bare idiom, allowed WITHOUT an envelope anchor: "make it real".
 *
 * ⚠ IT IS DELIBERATELY ANCHORED TO THE WHOLE UTTERANCE. Nothing else in the
 * registry claims this sentence, and its hard stopper is real: with no envelope
 * drawn, `planBuildFromDesign` refuses in its own words and the user is told so.
 * Allowing it inside a longer sentence would let it nibble at asks it has no
 * claim on, which is C68 §5.j exactly.
 *
 * `it` → `this` is a tier-1 SYNONYM in `ZeroTokenResolver`, so both spellings
 * are written out rather than being left to survive normalisation.
 */
const MAKE_IT_REAL_RE =
  /^(?:make|build|turn)\s+(?:it|this|them|these|my\s+design|the\s+design)\s+(?:in)?to\s+(?:real|reality|bim)\b|^(?:make|build)\s+(?:it|this|them|these)\s+real\b/i;

/**
 * ⛔ STAND-DOWN 1 — A BUILDING TYPOLOGY NOUN. "build a house from the envelope"
 * is `generate-building`'s (its aliases are exactly house / residential
 * building / office building / building), and `generate-apartment-layout` owns
 * the apartment. Claiming a sentence that names a typology would be C68 §5.j's
 * *"a capability that claims a sentence it had no right to claim, and then
 * confidently does the wrong thing"* — 29 measured live instances.
 *
 * The conservative direction is the correct one here: those two capabilities
 * BUILD something for that sentence today, and standing in front of a path that
 * works is the §FIX-CHAT-HIDE-IS-NOT-NAVIGATE error.
 */
const TYPOLOGY_NOUN_RE =
  /\b(?:house|houses|villa|bungalow|apartments?|flats?|office(?:\s+(?:building|tower))?|residential\s+building|tower|block\s+of\s+flats)\b/i;

/** ⛔ STAND-DOWN 2 — COORDINATES. "create a wall from (0,0) to (5,0)" is
 *  `create-wall`'s, and it carries the word "from" too. */
const COORDINATE_RE = /\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/;

/**
 * ⛔ STAND-DOWN 3 — A FINISH-ENGINE ASK OVER ROOMS THAT ALREADY EXIST.
 * "add ceilings to every room" is `generate-room-finishes`', it is LIVE, and it
 * is the very route this module's refusal points at. Requiring the envelope
 * anchor already separates them; this guard makes it provable rather than
 * incidental for the one shape that carries both ("add ceilings to every room
 * in my design").
 */
const ROOM_SCOPE_RE = /\b(?:every|each|all(?:\s+the)?)\s+rooms?\b/i;

// ─── Part detection ──────────────────────────────────────────────────────────

const WALLS_RE = /\bwalls?\b|\bpartitions?\b/i;
const PLATE_RE = /\bslabs?\b|\bfloor\s+plates?\b|\bground\s+plates?\b|\bfloor\s+slabs?\b/i;
/** Bare "floor(s)" with no "slab"/"plate" beside it — genuinely ambiguous English. */
//
// ⛔ THE LOOKAHEAD IS LOAD-BEARING, and the founder's own sentence is why. He
// wrote *"walls, slabs, floors, ceilings, and roofs"* — SLABS and FLOORS in one
// list, so "floors" there is the FINISH layer, not the plate he already named.
// A bare `\bfloors?\b` would have been swallowed by the "slabs" clause and his
// third noun would have gone unanswered; excluding only the spellings that are
// literally the plate ("floor plate", "floor slab") and the finish ("floor
// finishes") leaves the genuinely ambiguous word to be read as BOTH.
const BARE_FLOOR_RE = /\bfloors?\b(?!\s+(?:plates?|slabs?|finish(?:es)?))/i;
const FLOOR_FINISH_RE = /\bfloor\s+finish(?:es)?\b|\bfinish(?:es)?\b|\bflooring\b/i;
const CEILING_RE = /\bceilings?\b/i;
const ROOF_RE = /\broofs?\b|\broofing\b/i;
/** "everything" / "the lot" / "BIM" — an explicit ask for the whole pass. */
const EVERYTHING_RE = /\beverything\b|\bthe\s+lot\b|\ball\s+of\s+it\b|\bbim\b|\breal\b|\breality\b/i;

/**
 * Split what the sentence NAMED into the two halves.
 *
 * ⭐ BARE "FLOORS" IS READ AS BOTH, AND SAID SO OUT LOUD. In BIM the founder's
 * own list separates "slabs" from "floors", so "floors" there means the FINISH
 * layer — but a user typing "create the floors" very often means the plate. The
 * honest reading is BOTH: the plate is built (it can be) and the finish is named
 * as not built. C68 §5.g — *a granularity gap is refused BY NAMING THE GAP,
 * never silently widened.*
 */
export function readParts(text: string): {
  readonly parts: readonly BuildFromEnvelopePart[];
  readonly deferred: readonly BuildFromEnvelopeDeferredPart[];
} {
  const parts = new Set<BuildFromEnvelopePart>();
  const deferred = new Set<BuildFromEnvelopeDeferredPart>();

  if (WALLS_RE.test(text)) parts.add('walls');
  if (PLATE_RE.test(text)) parts.add('floor-plate');
  if (CEILING_RE.test(text)) parts.add('ceilings');
  if (ROOF_RE.test(text)) deferred.add('roof');
  if (FLOOR_FINISH_RE.test(text)) deferred.add('floor-finishes');
  // Bare "floors" — neither "floor plate" nor "floor finishes". Read as BOTH:
  // the plate is built (it can be) and the finish is named as not built.
  if (BARE_FLOOR_RE.test(text)) {
    parts.add('floor-plate');
    deferred.add('floor-finishes');
  }
  if (EVERYTHING_RE.test(text) && parts.size === 0) {
    for (const p of BUILDABLE_PARTS) parts.add(p);
  }
  return {
    parts: BUILDABLE_PARTS.filter((p) => parts.has(p)),
    deferred: (['floor-finishes', 'roof'] as const).filter((d) => deferred.has(d)),
  };
}

/**
 * Claim a build-from-envelope sentence.
 *
 * Returns `null` — a MISS, never a half-claim — whenever another capability owns
 * the utterance. Every stand-down above protects a path that already does the
 * right thing.
 */
export function parseBuildFromEnvelopeIntent(
  text: string,
  ctx: ResolverContext | undefined,
): SemanticIntent | null {
  const idiom = MAKE_IT_REAL_RE.test(text);
  if (!idiom) {
    if (!OPENER_RE.test(text)) return null;
    if (!ENVELOPE_ANCHOR_RE.test(text)) return null;
  }
  if (TYPOLOGY_NOUN_RE.test(text)) return null;
  if (COORDINATE_RE.test(text)) return null;
  if (ROOM_SCOPE_RE.test(text)) return null;

  const { parts, deferred } = readParts(text);

  // C67 §4 rule 16 — a place phrase is read through the ONE shared parser.
  // A grammar MUST NOT write a place-phrase regex of its own; five recurrences
  // are on record.
  const tail = matchTrailingSpatialScope(text, ctx);
  const levelQuery =
    tail !== null && tail.reading.kind === 'scope' && tail.reading.scope.kind === 'level'
      ? tail.reading.scope.levelQuery
      : undefined;

  return {
    intent: 'build-from-envelope',
    parts,
    deferred,
    ...(levelQuery !== undefined ? { levelQuery } : {}),
  } as SemanticIntent;
}

// ─── Copy helpers ────────────────────────────────────────────────────────────

/** "walls and the floor plate" / "walls" — an Oxford-free English list. */
export function speakList(words: readonly string[]): string {
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]!}`;
}

function speakParts(parts: readonly BuildFromEnvelopePart[]): string {
  return speakList(parts.map((p) => PART_WORD[p]));
}

function speakDeferred(deferred: readonly BuildFromEnvelopeDeferredPart[]): string {
  return speakList(deferred.map((d) => DEFERRED_PART_WORD[d]));
}

/** The "and here is why, and here is the live route" half, one clause per part. */
function deferredReasons(deferred: readonly BuildFromEnvelopeDeferredPart[]): string {
  // ⭐ THE SHARED "ceilings AND floor finishes" CLAUSE IS GONE BECAUSE CEILINGS ARE BUILT NOW.
  // It read "Ceilings and floor finishes are built from ROOM records, and this pass creates
  // none" — true of both when it was written, true of neither half today for ceilings.
  // Floor finishes keep the room-record reason, which is still exactly why they are deferred.
  const out: string[] = [];
  if (deferred.includes('floor-finishes')) {
    out.push(`${capitalise(DEFERRED_PART_REASON['floor-finishes'])}.`);
  }
  if (deferred.includes('roof')) out.push(`${capitalise(DEFERRED_PART_REASON.roof)}.`);
  return out.join(' ');
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function levelName(ctx: ResolverContext): string | null {
  const id = ctx.activeLevelId;
  if (id === undefined || id === null) return null;
  return ctx.levels.find((l) => l.id === id)?.name ?? null;
}

// ─── The semantic arm ────────────────────────────────────────────────────────

/**
 * `build-from-envelope` → ONE `generation.from-envelope` bus command, or an
 * honest refusal naming BOTH numbers.
 *
 * ⚠ THE SUMMARY NAMES NO COUNT IT HAS NOT RESOLVED (C68 §5.j.3). This module is
 * PURE — it cannot read the envelope store, so it cannot know how many walls
 * will be built. The real counts, the per-room refusals and the plan's own
 * `willNotCreate` arrive on `pryzm-generation-report` AFTER dispatch and are
 * rendered verbatim, exactly as `generate-building` relays §GEN-MAXHEIGHT-GATE's
 * two heights. A Confirm card that invented "24 walls" would be the defect this
 * whole file exists to avoid.
 *
 * ⚠ AND IT SAYS **TWO UNDO STEPS**, NOT ONE. `buildFromDesignExecutor.ts`'s own
 * header states it: there is no verb in this repo that commits walls and slabs
 * together, and `batchCoordinator.runBatch` is undo-NEUTRAL (ADR-0314 /
 * `BatchCoordinator.ts:233`), so the two batch commands are two history entries.
 * C67 §4 rule 8 requires the card to say N before consent. The claim is pinned
 * against the executor's real dispatch count by
 * `apps/editor/src/ui/ai/__tests__/buildFromEnvelopeChatSeam.spec.ts`,
 * so a third batch verb turns the pin red instead of leaving this sentence to
 * rot.
 */
export function applyBuildFromEnvelope(
  si: Extract<SemanticIntent, { intent: 'build-from-envelope' }>,
  ctx: ResolverContext,
  findLevel: (query: string, levels: readonly ResolverLevel[]) => ResolverLevel | undefined,
): SemanticApplication {
  const asked = si.parts.length > 0 ? si.parts : BUILDABLE_PARTS;
  const deferred = si.deferred;

  // ── REFUSAL 1 — the sentence named ONLY things this pass does not build ────
  if (si.parts.length === 0 && deferred.length > 0) {
    return {
      kind: 'refusal',
      intent: 'build-from-envelope',
      reason:
        `Building from an envelope creates ${BUILDABLE_PARTS.length} things: `
        + `${speakParts(BUILDABLE_PARTS)}. You asked for ${deferred.length} it does not build — `
        + `${speakDeferred(deferred)}. ${deferredReasons(deferred)}`,
      suggestions: [
        'create walls and slabs from my envelope',
        'add ceilings to every room',
      ],
    };
  }

  // ── REFUSAL 2 — anything that does not name the WALLS ─────────────────────
  //
  // MEASURED, not assumed: `executeBuildFromDesign` refuses a plan with no walls
  // in its own words — "The plan carries no walls, so there is nothing to build."
  // Dispatching a walls-free ask would spend a Confirm card on a certain refusal,
  // so it is refused HERE, before the card, naming the real route.
  //
  // ⛔ THIS USED TO TEST `parts[0] === 'floor-plate'` AND THAT WAS ONLY SAFE
  // WHILE THE PLATE WAS THE SOLE NON-WALL PART. `ceilings` becoming buildable
  // opened a hole: the seam's `applyPartSelection` projects the plate and the
  // ceilings off a plan but NEVER the walls, so "add ceilings from my envelope"
  // would have sailed past this guard and quietly built a whole storey of walls
  // the user never named — the silent widening C68 §7.d forbids, arriving
  // through a Confirm card that did not mention them.
  if (si.parts.length > 0 && !si.parts.includes('walls')) {
    const named = speakList(si.parts.map((p) => PART_WORD[p]));
    const modeName = si.parts.length > 1 ? 'walls-free'
      : si.parts[0] === 'floor-plate' ? 'plate' : 'ceilings';
    return {
      kind: 'refusal',
      intent: 'build-from-envelope',
      reason:
        `${capitalise(named)} ${si.parts.length === 1 ? 'is' : 'are'} cut from the same level `
        + 'envelope the walls are built from, and this pass dispatches them in that order — it has '
        + `no ${modeName}-only mode. Ask for the walls too ("create walls and slabs from my `
        + 'envelope") and I will build the walls first, then the rest.',
      suggestions: ['create walls and slabs from my envelope'],
    };
  }

  // ── REFUSAL 3 — a level other than the one being viewed ───────────────────
  //
  // The builder lands everything on the ACTIVE level and CREATES NO LEVEL
  // (`buildFromDesignPlan.ts`'s header: `AddLevelCommand` executes synchronously
  // while the bus is async, so a pass that minted a storey and read it back in
  // the same beat would read STALE). Silently building on a different level than
  // the one the user named is the widening C68 §7.d forbids; the honest answer
  // names the switch, exactly as `generate-apartment-layout` does.
  if (si.levelQuery !== undefined) {
    const named = findLevel(si.levelQuery, ctx.levels);
    if (named === undefined) {
      return {
        kind: 'refusal',
        intent: 'build-from-envelope',
        reason:
          `I could not find a level called "${si.levelQuery}" in this project. `
          + `The levels are: ${speakList(ctx.levels.map((l) => l.name))}.`,
        suggestions: ['create walls and slabs from my envelope'],
      };
    }
    if (named.id !== ctx.activeLevelId) {
      const active = levelName(ctx) ?? 'the level you are viewing';
      return {
        kind: 'refusal',
        intent: 'build-from-envelope',
        reason:
          `This builds on the level you are viewing — ${active}. You asked for ${named.name}. `
          + `Switch first ("go to ${named.name.toLowerCase()}"), then ask again: this pass creates `
          + 'no level and moves nothing between them.',
        suggestions: [`go to ${named.name.toLowerCase()}`, 'create walls and slabs from my envelope'],
      };
    }
  }

  // ── THE COMMAND ───────────────────────────────────────────────────────────
  const where = levelName(ctx);
  const undoSteps = asked.length;
  const command: BusCommandRef = {
    type: BUILD_FROM_ENVELOPE_VERB,
    payload: { parts: [...asked], deferred: [...deferred] },
  };
  const deferredNote = deferred.length === 0
    ? ''
    : ` It does NOT build ${speakDeferred(deferred)}. ${deferredReasons(deferred)}`;
  return {
    kind: 'commands',
    intent: 'build-from-envelope',
    summary:
      `Build ${speakParts(asked)} from the space envelopes you drew`
      + `${where === null ? '' : `, on ${where}`}. `
      // ⛔ COMPUTED FROM `asked`, NEVER THE LITERAL "Two". This card stated a cost of TWO while
      // §BIM-FROM-THE-DESIGN was teaching the executor a THIRD batch (`ceiling.batch.create`),
      // and a Confirm card that understates undo depth is the one place the understatement is
      // acted on: the user accepts a cost they were told, then finds one gesture is not undone.
      // The parts are NAMED in dispatch order so the number and the list cannot drift apart.
      + `${undoSteps === 1
        ? 'One batch command, so one undo step'
        : `${undoSteps} batch commands — ${speakList(asked.map((p) => PART_WORD[p]))} — so `
          + `${undoSteps} undo steps, not one`}. `
      + 'The report names the real counts, every room it could not build and everything it did '
      + `not create.${deferredNote}`,
    commands: [command],
    // A whole storey of walls is consequential and the pass is not reversible in
    // one step — the Confirm card states the parts, the level and the undo cost
    // before anything is dispatched.
    destructive: true,
  };
}
