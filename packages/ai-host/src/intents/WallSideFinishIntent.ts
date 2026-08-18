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
 * "in the kitchen" vs "in ground floor" — the founder writes BOTH with "in".
 *
 * The discriminator is LEXICAL, applied to the captured phrase itself: a phrase
 * that names a storey is a level, anything else is a room. This is a fact about
 * the words the user typed, not an inference about geometry, and it is the same
 * vocabulary `DimensionFamilies.levelScope()` strips.
 */
const LEVEL_PHRASE = /(?:^|\s)(?:floors?|levels?|stor(?:e?ys?|ies)|ground|basement|attic|roof|penthouse|mezzanine)(?:\s|$)/;

/** "on the ground floor" / "in room 3" / "in the kitchen" / "on level 2". */
const SPATIAL_RE = /\b(?:on|in|of)\s+(?:the\s+)?([\w .-]+?)(?=\s+(?:to|into|as|with|be|finish)\b|$)/;

/** Strips the trailing storey noun the level index does not carry: "ground
 *  floor" → "ground". `findLevel` already matches level names case-folded. */
function normaliseLevelQuery(phrase: string): string {
    return phrase.replace(/\s*\b(?:floors?|levels?|stor(?:e?ys?|ies))\b\s*/g, ' ').trim() || phrase.trim();
}

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
): WallSideFinishIntent | null {
    // ⛔ Never steal the layer-ADD ask. That one moves the wall's thickness.
    if (/^add\b/.test(text)) return null;
    if (!FINISH_VERB.test(text)) return null;
    if (!/\bwalls?\b/.test(text)) return null;

    // RAC U8.1 — filter clauses are LIFTED first, so a filter composes with
    // every scope form below for free, in either word order.
    const lifted = parseFilterClauses(text, 'wall', resolveWallSystemType);
    const t = lifted.stripped;

    const isAll = SCOPE_ALL.test(t);
    const isSel = SCOPE_SEL.test(t);
    if (!isAll && !isSel) return null;

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

    // ── The SPATIAL scope. Composes with ALL only: pairing it with
    //    "these/selected" would contradict the live selection, and that reading
    //    is not claimed (byte-identical rule to `wallScopeBase`).
    let base: 'all' | 'selection' | IntentSpatialScope;
    const sp = SPATIAL_RE.exec(t);
    const phrase = sp?.[1]?.trim();
    if (phrase !== undefined && phrase.length > 0 && isAll && !isSel) {
        base = LEVEL_PHRASE.test(` ${phrase} `)
            ? { kind: 'level', levelQuery: normaliseLevelQuery(phrase) }
            : { kind: 'room', roomRef: phrase };
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
