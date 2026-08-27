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
// §RACWALL128 — resolveCompassRef is THE one compass-word table (L-10941); the
// facing-adjective probe below consults it rather than minting a second one.
import { parseInlineSpatialPhrase, resolveCompassRef } from './SpatialScopeTail';
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
 *  transitively; the same ruling `finishRef.ts` cites for transcribing hexes).
 *
 *  §RACSIDE144 — `'both'` is this lane's addition. The founder: *"I want to
 *  also change the INTERIOR wall finish, but this still would only change the
 *  outer finish."* `@pryzm/geometry-wall`'s OWN `WallFinishSide` stays
 *  `'interior' | 'exterior'` — every SINGLE-WALL write is still one side at a
 *  time; `'both'` exists only at the BATCH boundary
 *  (`SetWallSideFinishBatchCommand` applies it as two per-wall child writes,
 *  still ONE undo entry — C16 §8.6). */
export type WallFinishSideRef = 'interior' | 'exterior' | 'both';

export interface WallSideFinishIntent {
    readonly intent: 'set-wall-side-finish';
    readonly side: WallFinishSideRef;
    /**
     * §RACSIDE144 — `true` when the user NAMED a side (inner / outer / both);
     * `false` when the grammar supplied the scope-dependent DEFAULT below. The
     * founder's whole complaint was that the scope of the change was never
     * stated back to him, so the confirmation (`CapabilityExecutionSpec.ts`)
     * reads this to say so explicitly rather than silently picking one.
     */
    readonly sideExplicit: boolean;
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
/** §RACSIDE144 — "both sides" / "both faces" / "both finishes", the spelling
 *  that does NOT already carry one INNER_WORD and one OUTER_WORD (that pair —
 *  "inner and outer", "inside and outside" — already claims `hasBoth` via the
 *  two regexes above; this one exists for the founder's OTHER spelling). */
const BOTH_SIDES_RE = /\bboth\s+(?:the\s+)?(?:sides?|faces?|finishes?)\b/;

/**
 * §RACWALL128 — the compass-facing ADJECTIVE ("all east-facing walls").
 *
 * The colour and rake grammars have carried this adjective since ADR-0315 U3
 * (`WALL_ORIENTATION_ADJ` in ZeroTokenResolver), so "make all south-facing
 * walls white" already scopes by facade — but THIS token-based grammar only
 * read a PREPOSITIONAL place phrase ("of all east-facing walls", "on the east
 * facade"). Measured before this probe: "change all east-facing walls exterior
 * finish to clay plaster" parsed with `base = 'all'` — the compass qualifier
 * was swallowed and the ask SILENTLY WIDENED to every wall in the project
 * (C84 EI-2), which on a mass re-finish is the worst available outcome.
 *
 * The captured word goes through `resolveCompassRef` — the ONE compass table —
 * so "east-facing"/"eastern-facing" resolve and "street-facing" stays inert
 * (null ⇒ the adjective is not a compass claim and the sentence reads as
 * before). Composition rule mirrors `wallSpatialScopeBase` exactly: an
 * orientation composes with the ALL scope only; against "these/selected" the
 * grammar does not claim, it never guesses.
 */
const FACING_ADJ_RE = /\b([a-z]+)[- ]facing\b/;

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
 * @param resolvesFinish injected `resolveFinishRef`-shaped predicate — TRUE
 *        only for an UNAMBIGUOUS resolution. Injected rather than imported so
 *        this module stays a pure function of its inputs and the finish table
 *        has exactly one owner (`finishRef.ts`).
 * @param hasFinishCandidates §RACSIDE144 (L-12365) — injected
 *        `finishRefCandidates(ref).length > 0`-shaped predicate: TRUE when the
 *        phrase names AT LEAST ONE real material, ambiguous or not. Optional
 *        so every existing call site still compiles; see the SCAN comment
 *        below for why this is a SEPARATE question from `resolvesFinish`.
 */
export function parseWallSideFinishIntent(
    text: string,
    resolvesFinish: (ref: string) => boolean,
    resolveWallSystemType?: (ref: string) => { id: string; name: string } | null,
    /** §FIX-WALL-FINISH-SIDE-EATS-SCOPE (L-1261) — needed only so "this floor"
     *  can name the ACTIVE level. Optional, so every existing call site is
     *  unchanged and a context-free caller simply cannot say "this floor". */
    ctx?: ResolverContext,
    hasFinishCandidates?: (ref: string) => boolean,
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
    // §RACSIDE144 — "inner and outer" / "inside and outside" already sets BOTH
    // of the above; "both sides" / "both faces" / "both finishes" carries
    // neither, so it needs its own marker.
    const hasBoth = (hasInner && hasOuter) || BOTH_SIDES_RE.test(t);

    // ── The finish NAME, by the same shrinking-window scan the layer parser
    //    uses, so word order never matters: "finish plaster", "plaster finish"
    //    and "to limewash" all resolve.
    //
    //    §RACSIDE144 (L-12365) — THE SCAN MUST NOT DROP A WORD TO MANUFACTURE A
    //    CLEAN ANSWER. Measured: "change all walls finish to grey paint" used to
    //    resolve to `Paint · Matte White`. "grey paint" (the real 2-word phrase)
    //    is AMBIGUOUS — five real rows (Pastel/Light/Mid/Slate/Anthracite Grey)
    //    — so `resolvesFinish('grey paint')` is false, and the OLD scan read
    //    that as "not a finish, keep shrinking", tried the 1-word span next, and
    //    "paint" alone IS an exact alias (`Paint · Matte White`) — so it won,
    //    silently discarding the one word ("grey") that carried the whole ask.
    //    That is L-1880 (droppedCatalogueWords) one layer OUTSIDE the function
    //    it was fixed inside: this scan never asked finishRef.ts's own guard.
    //
    //    So a span that names ANY real candidate — ambiguous or not — now stops
    //    the scan from shrinking further. A STRICT (unambiguous) match still
    //    wins immediately and outranks everything, exactly as before; an
    //    AMBIGUOUS one is remembered and used only if no strict match exists
    //    anywhere, so the VALUE stage (`resolveFinishRef`, not a second
    //    resolver — C84 EI-8) is what actually refuses and lists the real
    //    candidates. `knownFinishIsStrict` keeps the CLAIM rule below from
    //    treating an ambiguous bare guess as license to steal a sentence that
    //    belongs to a neighbour ("make all walls white" must still reach
    //    set-wall-color, not refuse as an ambiguous "white").
    let finishRef: string | null = null;
    let finishRefIsStrict = false;
    let ambiguousFinishRef: string | null = null;
    const words = t.split(/[^a-z-]+/i).filter((w) => w.length > 2);
    outer:
    for (let span = 3; span >= 1; span--) {
        for (let i = 0; i + span <= words.length; i++) {
            const candidate = words.slice(i, i + span).join(' ').toLowerCase();
            if (resolvesFinish(candidate)) { finishRef = candidate; finishRefIsStrict = true; break outer; }
            // ⛔ span >= 2 ONLY. Measured regression: "make all inner finishes
            // walls on the ground floor to unobtainium" — the bare word
            // "ground" (from "ground floor", a LEVEL phrase, not a material)
            // names 14 real "Ground · …" landscape materials on its own, so an
            // unrestricted span=1 check hijacked the scan into reporting
            // "'ground' matches 14 materials" instead of ever reaching
            // "unobtainium". A lone word is never worth stopping the shrink
            // for; only a genuine MULTI-WORD phrase (span 2 or 3) earns that.
            if (span >= 2 && ambiguousFinishRef === null && hasFinishCandidates?.(candidate) === true) {
                ambiguousFinishRef = candidate;
            }
        }
        if (ambiguousFinishRef !== null) break; // do not shrink past a span that named something real
    }
    if (finishRef === null && ambiguousFinishRef !== null) finishRef = ambiguousFinishRef;

    // ── THE UNRECOGNISED TAIL. When the scan found nothing AT ALL (not even an
    //    ambiguous candidate), carry the words the user actually typed after the
    //    connector so the refusal can QUOTE them ("I don't know the finish
    //    \"unobtainium\"") instead of the strictly weaker "tell me which
    //    finish", which makes the user guess whether they were misheard or had
    //    simply omitted it. This never widens the claim: `knownFinish` below,
    //    captured BEFORE this runs, is what the claim rule tests.
    const knownFinish = finishRef;
    const knownFinishIsStrict = finishRefIsStrict;
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
    // §RACSIDE144 (L-12363) — A RESOLVED, UNAMBIGUOUS FINISH NAME IS ALSO
    // ENOUGH ON ITS OWN, one exception aside.
    //
    // Founder-reported: "make all walls white paint" answered *"There is no
    // wall type called 'white paint' in this project… I searched compass
    // orientations, colours, levels, rooms or wall types."* The sentence has no
    // "finish" word and no side word, so the OLD rule below declined it
    // outright — even though `knownFinish` above had ALREADY resolved "white
    // paint" to `paint-matte-white` via the exact-alias tier of
    // `resolveFinishRef`. The ladder then fell through matchWallColor
    // (`resolveColorRef('white paint')` is null — the colour table is
    // exact-name-only) into `matchWallType`'s catch-all `(.+)$` tail, which
    // confidently searched the WRONG dimension (never touches the finish
    // table) and refused as though a wall-type miss were the whole story.
    //
    // So an UNAMBIGUOUS `knownFinish` now claims even bare, UNLESS the exact
    // same phrase ALSO names a real wall SYSTEM TYPE in this project — that
    // is a genuine collision between two capabilities, and rather than a
    // coin-flip this grammar defers to the type grammar (which runs after it
    // in the MATCHERS ladder), matching the pre-existing precedent that a
    // resolved TYPE always wins in `parseWallTypeIntent`'s own early-exit
    // branch. Measured: no wall-type catalogue name in this codebase collides
    // with a finish alias today, so this is a defensive guard, not a live case.
    //
    // ⛔ `knownFinishIsStrict`, NOT merely `knownFinish !== null` — an
    // AMBIGUOUS bare guess ("white" inside "make all walls white") must NOT
    // claim here: `resolveFinishRef('white')` is null (several real whites),
    // so it stays a colour ask for `set-wall-color`, exactly as before this
    // lane. Only a genuinely UNAMBIGUOUS bare finish reaches this claim.
    const typeCollision = knownFinishIsStrict && resolveWallSystemType?.(knownFinish!) != null;
    if (!hasMarker && !hasInner && !hasOuter && !hasBoth && (!knownFinishIsStrict || typeCollision)) {
        return null;
    }

    // ── The SPATIAL scope. Refused only against "these/selected", which would
    //    contradict the live selection. §FIX-BARE-FINISH-SELF-CONTRADICTS (L-998)
    //    widened this from `isAll && !isSel` to `!isSel`: with the scope word no
    //    longer required to claim, "change wall finish on the ground floor to
    //    plaster" has a spatial phrase and no "all", and dropping the phrase would
    //    silently narrow a LEVEL ask to the selection — a quieter version of the
    //    same defect. The phrase the user typed wins over the default.
    //
    //    §RACWALL128 — the compass-facing ADJECTIVE is probed FIRST, mirroring
    //    the colour/rake grammars' precedence (`wallScopeBase` consults the
    //    orientation capture before the level/room tail). It composes with the
    //    ALL scope only — "these east-facing walls" is a contradiction with the
    //    live selection and is NOT claimed, byte-identical to how
    //    `wallSpatialScopeBase` returns null for orientation ∧ selection.
    //
    //    §RACSIDE144 — the scope is resolved BEFORE the side below, because the
    //    side's own bare-form default depends on it.
    let base: 'all' | 'selection' | IntentSpatialScope;
    const facingWord = FACING_ADJ_RE.exec(t)?.[1];
    const facingCompass = facingWord !== undefined ? resolveCompassRef(facingWord) : null;
    if (facingCompass !== null) {
        if (!isAll || isSel) return null;
        base = { kind: 'orientation', orientation: facingCompass };
    } else {
        const place = parseInlineSpatialPhrase(t, ctx);
        if (place.kind === 'unusable') {
            // A place was NAMED and cannot be resolved ("this floor" with no
            // active level). Decline — never silently widen to the whole
            // building, which on a mass re-finish is the outcome this grammar
            // exists to prevent.
            return null;
        }
        base = place.kind === 'scope' && !isSel ? place.scope : (isAll ? 'all' : 'selection');
    }

    // ── The SIDE. Explicit words win, and BOTH is now a real answer, never a
    //    decline (§RACSIDE144 — the founder's actual complaint: "I want to also
    //    change the INTERIOR wall finish, but this still would only change the
    //    outer finish"). The OLD line here was `if (hasInner && hasOuter) return
    //    null;` — "inner and outer" stranded the whole sentence rather than
    //    doing what it plainly asked for.
    //
    //    Absent any side word, the default depends on the SCOPE, not one global
    //    rule:
    //      · a COMPASS scope ("west-facing walls") is inherently about the face
    //        that HAS a compass direction — the exterior one. An interior
    //        partition has no "west-facing" side at all (see the module header,
    //        and `classifyFacades` in @pryzm/spatial-index: an interior wall's
    //        `orientation` is `null`, never guessed). So a bare compass ask
    //        defaults EXTERIOR — the same side every previously-shipped compass
    //        example (§RACWALL128) already said explicitly; this generalises it
    //        to the unmarked form instead of leaving it undefined.
    //      · every other scope (all / selection / level / room) keeps the
    //        pre-existing INTERIOR default — "all walls in the kitchen" plainly
    //        means the faces you can see from inside it, and three existing
    //        pinned tests already assert 'interior' for that shape (wall-side-
    //        finish.test.ts, L998BareWallFinishRoutes.test.ts); changing it
    //        globally would be a much larger, undefended behaviour change than
    //        this ask needs.
    //    `sideExplicit` records whether the user NAMED a side at all, so the
    //    confirmation can say "exterior face only — say 'inner and outer' for
    //    both" instead of silently picking one, which is the actual defect the
    //    founder reported: the SCOPE of the change was never stated back to him
    //    (C74/CA-18).
    const isOrientationScope = typeof base === 'object' && base.kind === 'orientation';
    const sideExplicit = hasInner || hasOuter || hasBoth;
    const side: WallFinishSideRef =
        hasBoth ? 'both'
        : hasOuter ? 'exterior'
        : hasInner ? 'interior'
        : isOrientationScope ? 'exterior'
        : 'interior';

    return {
        intent: 'set-wall-side-finish',
        side,
        sideExplicit,
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
    // ── §RACWALL128 — "change layer finish outside colour of all east-facing
    //    walls": the exterior finish, scoped by compass facade. Both spellings:
    //    the -facing adjective and the prepositional facade phrase.
    'change all east-facing walls exterior finish to clay plaster',
    'change the exterior finish of all west-facing walls to limewash',
    'make all walls on the south facade exterior finish plaster',
    // ── §RACSIDE144 — the founder's actual complaint: "I want to also change
    //    the INTERIOR wall finish, but this still would only change the outer
    //    finish." BOTH spellings of the combined ask, on the SAME compass scope
    //    §RACWALL128 proved for exterior alone, plus the headline acceptance
    //    sentence (reversed-word-order material, "inside and outside" as the
    //    both-marker, resolved through the shared catalogue-token ladder).
    'change the finish of all west-facing walls to red paint, inner and outer',
    'change all west-facing walls finish to clay plaster, both sides',
    'change outside and inside finish of all west-facing walls to green pastel paint',
    // ── §RACSIDE144 (L-12363) — a RESOLVED, UNAMBIGUOUS finish name is enough
    //    on its own, even with no "finish" word and no side word. Before this
    //    lane, "make all walls white paint" fell through to `matchWallType`'s
    //    catch-all tail and refused "there is no wall type called 'white
    //    paint'" — a confident answer from the WRONG dimension.
    'make all walls white paint',
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
    // §RACWALL128 — the compass adjective must not make this grammar greedy:
    // a compass-scoped COLOUR or RAKE ask still belongs to its own grammar.
    'make all south-facing walls white',                               // set-wall-color
    'make all east-facing walls angled by 70 degrees',                 // set-wall-rake
];
