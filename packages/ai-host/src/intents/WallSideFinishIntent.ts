// §FEAT-WALL-SIDE-FINISH — the chat grammar for the founder's two sentences:
//
//   "change / make all walls in room X finish wall Y"
//   "make all inner finishes walls in ground floor to X"
//
// ⛔ PRODUCTION HAS NO AI UPSTREAM. `CF_WORKER_URL` / `ANTHROPIC_API_KEY` are
// unset, so a capability that only resolves through the LLM planner does not
// work for the founder at all. This parser is therefore PURE and lives on the
// deterministic zero-token path: it is registered once in `ZeroTokenResolver`'s
// MATCHERS ladder (tier-0) and once in `LocalNaturalLanguageResolver.classify()`
// (tier-1), exactly like `parseWallColorIntent` and `parseAddWallLayerIntent`.
// No THREE, no DOM, no stores.
//
// ═══ TOKEN-BASED, LIKE THE LAYER PARSER — AND FOR THE SAME REASON ═══
//
// The founder does not speak in one rigid shape ("make all inner finishes walls
// in ground floor to X" is not a sentence any regex author would have guessed).
// So this claims any utterance that carries a finish VERB + "wall(s)" + a SCOPE
// word + a finish MARKER, then extracts side, spatial scope and finish name
// independently of word order.
//
// ═══ WHAT IT DELIBERATELY DOES NOT STEAL ═══
//
// Three neighbouring grammars sit in the same ladder, and a greedy parser here
// would silently break all three:
//
//   • `add-wall-layer` ("add a 10mm plaster layer …") — requires `^add`, so this
//     parser REFUSES any utterance starting with "add". That ask ADDS a
//     construction layer and moves the wall's thickness; this one changes
//     appearance only. Both are correct; they are not the same command.
//   • `set-wall-color` ("make all walls white") — carries no side word and no
//     finish marker, so it never reaches the claim below.
//   • `set-wall-type` ("make all walls interior partition") — carries the word
//     "interior"! That is why a bare SIDE word is not enough to claim: without
//     the literal word "finish", a resolvable finish NAME is also required, and
//     "partition" is not in the finish table. Verified by the examples pinned
//     at the bottom of this file.
//
// ═══ THE SIDE IS SEMANTIC ═══
//
// 'interior' / 'exterior' name the AUTHORED axis (`WallLayerFunction` is
// literally 'finish-interior' / 'finish-exterior'). They are NOT the geometric
// `frontSide`/`backSide`, which have zero writers repo-wide. The one request
// shape that genuinely needs the geometric mapping — a ROOM scope against a
// partition, whose two faces are BOTH interior — is refused by name in
// `SetWallSideFinishBatchCommand`, which is where the store lives.

import { parseFilterClauses } from './FilterScope';
import type { ElementFilter, IntentScope, IntentSpatialScope } from './ScopeDescriptor';
// §FIX-WALL-FINISH-SIDE-EATS-SCOPE (L-1261) — THE one place-phrase reader.
import { parseInlineSpatialPhrase } from './SpatialScopeTail';
import type { ResolverContext } from './ZeroTokenResolver';

/** RAC U8.1 — re-attach the lifted filters. Structurally identical to
 *  `ZeroTokenResolver`'s private `withFilters`; restated rather than exported
 *  from there because this module must not import the 3.9k-line resolver (that
 *  edge would be a cycle: the resolver imports THIS). The lift runs exactly
 *  once, so `base` is never itself a filter. */
function attachFilters(
    base: 'all' | 'selection' | IntentSpatialScope,
    filters: readonly ElementFilter[],
): IntentScope {
    if (filters.length === 0) return base;
    return { kind: 'filter', base, filters };
}

/** The semantic side. Mirrors `WallFinishSide` in `@pryzm/geometry-wall`,
 *  restated structurally so this module stays pure (geometry-wall pulls THREE
 *  transitively; the same ruling `finishRef.ts` cites for transcribing hexes). */
export type WallFinishSideRef = 'interior' | 'exterior';

export interface WallSideFinishIntent {
    readonly intent: 'set-wall-side-finish';
    readonly side: WallFinishSideRef;
    /** Raw spoken finish name; resolved in the VALUE stage via `finishRef.ts`,
     *  never in the grammar — so an unknown name refuses by LISTING real
     *  options instead of failing to parse. `null` = the user said "finish"
     *  without naming one. */
    readonly finishRef: string | null;
    readonly scope: IntentScope;
}

// ─── Grammar tokens ──────────────────────────────────────────────────────────

/** Byte-identical to the wall colour / type / rake grammars. The scope word is
 *  REQUIRED and never inferred: there is no reading in which a bare "make walls
 *  plaster" quietly re-finishes the whole building. */
const SCOPE_ALL = /\b(?:all|every|each)\b/;
const SCOPE_SEL = /\b(?:these|those|selected|this)\b/;

const FINISH_VERB = /^(?:make|change|set|finish|update|turn|apply|re-?finish)\b/;

/** The literal finish MARKER. Its presence alone is enough to claim (the ask is
 *  unambiguously a finish ask), which is what lets an unrecognised finish name
 *  refuse honestly instead of falling through to an LLM that is not there. */
const FINISH_MARKER = /\bfinish(?:es|ed|ing)?\b/;

const INNER_WORD = /\b(?:inner|interior|inside|internal|indoor)\b/;
const OUTER_WORD = /\b(?:outer|exterior|outside|external|outdoor|façade|facade)\b/;

/**
 * §FIX-LAYER-ASK-REPAINTED (L-1260) — THE ONE TOKEN that separates this
 * capability from `add-wall-layer`.
 *
 * ⛔ EXPORTED AND SHARED, deliberately. `parseAddWallLayerIntent` tests the SAME
 * constant to decide when it may claim a shared verb. Two hand-written copies of
 * this word list is how a sentence ends up claimed by both grammars or by
 * neither, and this file has already paid that bill twice (the `^add` verb test,
 * and the third spatial tail below).
 */
export const LAYER_NOUN = /\b(?:layers?|coat(?:ing)?s?)\b/;

// §FIX-WALL-FINISH-SIDE-EATS-SCOPE (L-1261) — the local `LEVEL_PHRASE`,
// `SPATIAL_RE` and `normaliseLevelQuery` lived here. They were the THIRD
// hand-written spatial tail in this package, and the founder's sentences proved
// what that costs: the lazy capture ran until one of only FIVE stop words
// (to/into/as/with/be/finish), and a SIDE word is not one of them — so the place
// phrase ATE IT. Measured 2026-08-19:
//
//   "make all walls in Room X exterior finish plaster"
//        → room  "room x exterior"
//   "make all walls in Level 1 exterior finish plaster"
//        → level "1 exterior"
//   "make all walls on level 2 interior finish limewash"   ← THE SHIPPED EXAMPLE
//        → level "2 interior"
//
// None of those resolve. The founder is told *"No level called '1 exterior'"* —
// a refusal quoting back words he never typed as a place. **The third sentence
// was already broken before he wrote his six**, which is exactly what L-1201
// predicted: three spellings of one concept means fixing one leaves the next
// sentence broken in another.
//
// The vocabulary was NOT lost. This file's storey list (ground / basement /
// attic / penthouse / mezzanine) was the RICHER of the two and has been lifted
// into `SpatialScopeTail.STOREY_NAME_SRC`, which every grammar now reads; the
// stop set is now DERIVED from the wall grammars' own vocabulary
// (`PLACE_STOP_SRC`) rather than remembered as five words.

// ─── The parser ──────────────────────────────────────────────────────────────

/**
 * Parse a per-side wall finish ask, or return `null` (no claim).
 *
 * SHARED by the tier-0 grammar and the NL classifier, exactly like
 * `parseWallColorIntent` — one grammar, two entry points, so the two tiers can
 * never disagree about what a sentence means.
 *
 * @param resolvesFinish injected `resolveFinishRef`-shaped predicate. Injected
 *        rather than imported so this module stays a pure function of its
 *        inputs and the finish table has exactly one owner (`finishRef.ts`).
 */
export function parseWallSideFinishIntent(
    text: string,
    resolvesFinish: (ref: string) => boolean,
    resolveWallSystemType?: (ref: string) => { id: string; name: string } | null,
    /** §FIX-WALL-FINISH-SIDE-EATS-SCOPE (L-1261) — needed only so "this floor"
     *  can name the ACTIVE level. Optional, so every existing call site is
     *  unchanged and a context-free caller simply cannot say "this floor". */
    ctx?: ResolverContext,
): WallSideFinishIntent | null {
    // ⛔ Never steal the layer-ADD ask. That one moves the wall's thickness.
    if (/^add\b/.test(text)) return null;
    // ⭐⭐ §FIX-LAYER-ASK-REPAINTED (L-1260) — AND THE VERB WAS NEVER THE TEST.
    //
    // The founder sent six sentences: four WITHOUT the word "layer" and two WITH
    // it. That is not an accident — he is naming the sibling capability
    // deliberately. Measured on the real ladder BEFORE this guard:
    //
    //   "make all walls interior layer finish plaster"
    //     → set-wall-side-finish, finishRef 'layer finish plaster', scope 'all'
    //     → "Set the interior finish of every wall in the project to Plaster"
    //
    // The word "layer" was swallowed INTO the finish name and then substring-
    // matched away. **He asked for a construction layer and got a repaint,
    // reported as success** — a silent narrowing (C84 EI-2) of the one ask whose
    // whole difference is that it MOVES `wall.thickness`
    // (§03-WALL-THICKNESS-CONTRACT §1).
    //
    // The `^add` guard was never the real discriminator: it tested the VERB when
    // the distinguishing token is the NOUN. `add-wall-layer` now claims the
    // shared verbs when the sentence says "layer"/"coat", so this parser must
    // stand aside on exactly the same token — one test, two grammars, no gap and
    // no overlap.
    if (LAYER_NOUN.test(text)) return null;
    if (!FINISH_VERB.test(text)) return null;
    if (!/\bwalls?\b/.test(text)) return null;

    // RAC U8.1 — filter clauses are LIFTED first, so a filter composes with
    // every scope form below for free, in either word order.
    const lifted = parseFilterClauses(text, 'wall', resolveWallSystemType);
    const t = lifted.stripped;

    // §FIX-BARE-FINISH-SELF-CONTRADICTS (L-998) — A MISSING SCOPE WORD IS NOT A
    // MISSING CAPABILITY.
    //
    // This used to be `if (!isAll && !isSel) return null;`. Founder-reported
    // 2026-08-18: *"change wall finish to plaster white"* — a sentence with a
    // finish verb, the word "wall", the literal word "finish" and a resolvable
    // finish name — carried no scope word, so the grammar declined, the ask fell
    // through to `capabilityGapRefusal`, and the product answered
    //
    //   "Wall material isn't connected to chat yet. I can change wall height,
    //    thickness, base offset, type, colour, wall angle, window creation,
    //    WALL SIDE FINISH and FINISH LAYER."
    //
    // — a refusal that advertises the very capability it is refusing, in its own
    // sentence. (The list is GENERATED from the registry, so the contradiction is
    // real and self-evident; the other half of that defect is fixed in
    // `CapabilityRefusal.ts`.)
    //
    // WHAT DOES **NOT** CHANGE, and it is the part worth guarding: a scope-less
    // sentence still never means "the whole building". `base` below resolves it to
    // 'selection', so with walls selected it does the obvious thing, and with
    // nothing selected the spec's `noSelectionReason` refuses BY NAMING THE LIVE
    // ROUTE (C16 CA-18) — "select some walls, or say 'make all inner finishes walls
    // on the ground floor to plaster'". Either outcome is honest; the old one was
    // not, and "advertises it and refuses it" is a third state the contract forbids.
    //
    // The CLAIM RULE below is untouched, and it is what still protects the three
    // neighbouring grammars: a bare side word is not enough, and a sentence with
    // neither the word "finish" nor a resolvable finish NAME is not claimed at all.
    const isAll = SCOPE_ALL.test(t);
    const isSel = SCOPE_SEL.test(t);

    const hasMarker = FINISH_MARKER.test(t);
    const hasInner = INNER_WORD.test(t);
    const hasOuter = OUTER_WORD.test(t);

    // ── The finish NAME, by the same shrinking-window scan the layer parser
    //    uses, so word order never matters: "finish plaster", "plaster finish"
    //    and "to limewash" all resolve.
    let finishRef: string | null = null;
    const words = t.split(/[^a-z-]+/i).filter((w) => w.length > 2);
    outer:
    for (let span = 3; span >= 1; span--) {
        for (let i = 0; i + span <= words.length; i++) {
            const candidate = words.slice(i, i + span).join(' ').toLowerCase();
            if (resolvesFinish(candidate)) { finishRef = candidate; break outer; }
        }
    }

    // ── THE UNRECOGNISED TAIL. When the scan found nothing, carry the words the
    //    user actually typed after the connector so the refusal can QUOTE them
    //    ("I don't know the finish \"unobtainium\"") instead of the strictly
    //    weaker "tell me which finish", which makes the user guess whether they
    //    were misheard or had simply omitted it. This never widens the claim:
    //    `knownFinish` below, not this, is what the claim rule tests.
    const knownFinish = finishRef;
    if (finishRef === null) {
        // The leading `^.*` is GREEDY on purpose: it consumes as far right as it
        // can, so the connector matched is the LAST one in the sentence. Without
        // it, leftmost-first matching anchors on "finishes" near the start and
        // captures the entire rest of the sentence as the finish name. Capped at
        // three words, so a runaway capture cannot be quoted back at the user as
        // though it were something they had named.
        const tail = /^.*\b(?:to|into|as|finish(?:es)?)\s+(?:the\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})\s*$/i.exec(t.trim());
        const raw = tail?.[1]?.trim();
        if (raw !== undefined && raw.length > 0 && !/^(?:walls?|finish(?:es)?)$/i.test(raw)) finishRef = raw;
    }

    // ── THE CLAIM RULE. The literal word "finish" makes the ask unambiguous, so
    //    an unnamed or unknown finish still claims and refuses with real options
    //    (ADR-0313 HONESTY: recognised-but-underspecified must never reach an
    //    LLM, and here there is no LLM to reach). Without that word, a side word
    //    alone is NOT enough — "make all walls interior partition" is a wall
    //    TYPE ask, and only a resolvable finish name distinguishes the two.
    if (!hasMarker && knownFinish === null) return null;
    if (!hasMarker && !hasInner && !hasOuter) return null;

    // ── The SIDE. Explicit words win; absent, 'interior' is the default — the
    //    same default `parseAddWallLayerIntent` already ships, and the reading
    //    "all walls in the kitchen" plainly means the faces you can see from
    //    inside it. When BOTH words appear we do not guess: no claim.
    if (hasInner && hasOuter) return null;
    const side: WallFinishSideRef = hasOuter ? 'exterior' : 'interior';

    // ── The SPATIAL scope. Refused only against "these/selected", which would
    //    contradict the live selection. §FIX-BARE-FINISH-SELF-CONTRADICTS (L-998)
    //    widened this from `isAll && !isSel` to `!isSel`: with the scope word no
    //    longer required to claim, "change wall finish on the ground floor to
    //    plaster" has a spatial phrase and no "all", and dropping the phrase would
    //    silently narrow a LEVEL ask to the selection — a quieter version of the
    //    same defect. The phrase the user typed wins over the default.
    let base: 'all' | 'selection' | IntentSpatialScope;
    const place = parseInlineSpatialPhrase(t, ctx);
    if (place.kind === 'unusable') {
        // A place was NAMED and cannot be resolved ("this floor" with no active
        // level). Decline — never silently widen to the whole building, which on
        // a mass re-finish is the outcome this grammar exists to prevent.
        return null;
    }
    if (place.kind === 'scope' && !isSel) {
        base = place.scope;
    } else {
        base = isAll ? 'all' : 'selection';
    }

    return {
        intent: 'set-wall-side-finish',
        side,
        finishRef,
        scope: attachFilters(base, lifted.filters),
    };
}

/**
 * The founder's two sentences, pinned.
 *
 * Every entry MUST resolve to `set-wall-side-finish` through the real ladder —
 * asserted in `wall-side-finish.test.ts`, which drives `resolveNaturalLanguage`
 * rather than calling this parser directly. A grammar proven only against
 * itself is the "committed ≠ reachable" defect.
 */
export const WALL_SIDE_FINISH_EXAMPLES: readonly string[] = [
    // ── The founder's own words ──
    'change all walls in the kitchen finish plaster',
    'make all walls in the kitchen finish limewash',
    'make all inner finishes walls in ground floor to limewash',
    // ── The shapes they generalise to ──
    'make all inner finishes walls on the ground floor to plaster',
    'change the inner finish of all walls to microcement',
    'set all walls on level 2 finish tadelakt',
    'make the selected walls finish venetian plaster',
    'change all outer finishes walls to clay plaster',
];

/**
 * Utterances that MUST NOT be claimed here — each belongs to a neighbouring
 * grammar, and a regression that steals one is invisible until a founder finds
 * it. Pinned in the same test.
 */
export const WALL_SIDE_FINISH_NON_CLAIMS: readonly string[] = [
    'add a 10mm plaster layer to the inner side of the selected wall', // add-wall-layer
    'make all walls white',                                            // set-wall-color
    'make all walls interior partition',                               // set-wall-type
    'make all walls 3m high',                                          // set-wall-dimensions
];
