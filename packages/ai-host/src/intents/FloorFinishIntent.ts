// §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the chat grammar for the founder's
// sentence, verbatim (2026-08-21):
//
//   "finish to wooden parquet"
//
// and the shapes it generalises to:
//
//   "make the living room floor oak herringbone"
//   "make all floors on the ground floor oak chevron"
//   "parquet on all floors on the ground level"
//
// ⛔ PRODUCTION HAS NO AI UPSTREAM. `CF_WORKER_URL` / `ANTHROPIC_API_KEY` are unset,
// so a capability that only resolves through the LLM planner does not work for the
// founder at all. This parser is therefore PURE and lives on the deterministic
// zero-token path, registered once in `ZeroTokenResolver`'s MATCHERS ladder
// (tier-0) and once in `LocalNaturalLanguageResolver.classify()` (tier-1) —
// exactly like `parseWallSideFinishIntent`, which it deliberately mirrors.
// No THREE, no DOM, no stores.
//
// ═══ WHY IT IS A SEPARATE GRAMMAR FROM THE WALL ONE ═══
//
// `parseWallSideFinishIntent` requires the literal word "wall(s)" and refuses
// everything else, so it can never claim these sentences; and a floor has no
// interior/exterior SIDE, which is that grammar's whole organising axis. Merging
// them would mean a `side` field that is meaningless for half the callers — the
// shape C84 EI-8 warns about. What IS shared is shared for real: `LAYER_NOUN`
// (the one token that separates "re-finish" from "add a construction layer"),
// `parseInlineSpatialPhrase` (the ONE place-phrase reader, L-1201/L-1261), and
// `finishRef.ts` (the ONE finish-name table).
//
// ═══ THE FOUR SENTENCES THIS MUST NOT STEAL, AND HOW IT DOESN'T ═══
//
//   • `finish-apartment-chain` — "finish this floor" / "finish this apartment"
//     (`CHAIN_RE` matches `finish` … `apartment|flat|floor|level|building`). It is
//     a GLOBAL capability that runs the whole generate→furnish→light chain, and it
//     is reached by the SAME verb and the SAME noun. The discriminator is that this
//     parser claims ONLY when the sentence NAMES A MATERIAL: "finish this floor"
//     carries no finish reference at all, so it is never claimed here. Pinned in
//     `FLOOR_FINISH_NON_CLAIMS`.
//   • `add-wall-layer` / `set-wall-side-finish` — both require "wall(s)", which
//     this parser REFUSES outright. One sentence cannot be about both.
//   • `move-to-level` — "change this floor to level 1". `matchMoveToLevel` runs
//     BEFORE the catalogue families and requires the storey noun to be immediately
//     followed by "to"; more importantly "level 1" names no material, so the claim
//     rule below declines it.
//   • the ceiling/slab families — a sentence naming "ceiling", "roof" or "slab" is
//     about a different element kind, and floor-vs-slab is exactly the ambiguity
//     `CatalogueFamilies.ts` records as "a decision, not a coin-flip". So a
//     sentence that says "slab" is left alone rather than absorbed.

import { parseFilterClauses } from './FilterScope';
import type { ElementFilter, IntentScope, IntentSpatialScope } from './ScopeDescriptor';
// §FIX-SCOPE-TAIL-ONE-PARSER (L-1201) / §FIX-WALL-FINISH-SIDE-EATS-SCOPE (L-1261)
// — THE one place-phrase reader. A fourth hand-written spatial tail is exactly the
// defect those two lanes retired.
import { parseInlineSpatialPhrase, readSpatialTail } from './SpatialScopeTail';
// The ONE token that separates a re-finish from a construction layer. Shared, not
// re-spelled: two copies of this word list is how a sentence ends up claimed by
// both grammars or by neither.
import { LAYER_NOUN } from './WallSideFinishIntent';
import type { ResolverContext } from './ZeroTokenResolver';

/** RAC U8.1 — re-attach the lifted filters. Structurally identical to the wall
 *  grammar's `attachFilters`; restated for the same reason it is restated there
 *  (this module must not import the 3.9k-line resolver — that edge is a cycle). */
function attachFilters(
    base: 'all' | 'selection' | IntentSpatialScope,
    filters: readonly ElementFilter[],
): IntentScope {
    if (filters.length === 0) return base;
    return { kind: 'filter', base, filters };
}

export interface FloorFinishIntent {
    readonly intent: 'set-floor-finish';
    /** Raw spoken finish name; resolved in the VALUE stage via `finishRef.ts`,
     *  never in the grammar — so an unknown name refuses by LISTING real options
     *  instead of failing to parse. `null` = the user said "finish" without
     *  naming one. */
    readonly finishRef: string | null;
    readonly scope: IntentScope;
}

// ─── Grammar tokens ──────────────────────────────────────────────────────────

const SCOPE_ALL = /\b(?:all|every|each)\b/;
const SCOPE_SEL = /\b(?:these|those|selected|this)\b/;

/** `lay` is included and the others are the wall grammar's set verbatim — "lay
 *  oak parquet in the kitchen" is the one verb a flooring ask has that a wall ask
 *  does not. */
const FINISH_VERB = /^(?:make|change|set|finish|update|turn|apply|lay|re-?finish|re-?surface)\b/;

const FLOOR_NOUN = /\b(?:floors?|flooring)\b/;

/** Element nouns that belong to a DIFFERENT family's grammar. A sentence naming
 *  one of these is not this capability's, and guessing between floor and slab is
 *  the coin-flip `CatalogueFamilies.ts` refuses to make. */
const OTHER_FAMILY_NOUN = /\b(?:walls?|ceilings?|roofs?|slabs?|stairs?|doors?|windows?)\b/;

/**
 * "the living room floor" / "this kitchen floor" — a room named WITHOUT a
 * preposition, which `parseInlineSpatialPhrase` (correctly) cannot see.
 *
 * ⚠ The capture is handed to `readSpatialTail`, NOT treated as a room directly.
 * That is the whole safety property: "the GROUND floor" and "the SECOND floor"
 * come back as LEVELS from the shared classifier, and a room genuinely called
 * "Level" stays reachable — none of which a local room regex would get right, and
 * all of which is why L-1201 exists.
 */
const BARE_ROOM_FLOOR_RE = /\b(?:the|this)\s+([a-z][\w-]*(?:\s+[a-z][\w-]*)?)\s+floors?\b/i;

/**
 * Parse a floor surface-finish ask, or return `null` (no claim).
 *
 * SHARED by the tier-0 grammar and the NL classifier, exactly like
 * `parseWallSideFinishIntent` — one grammar, two entry points, so the two tiers
 * can never disagree about what a sentence means.
 *
 * @param resolvesFinish   injected `resolveFinishRef`-shaped predicate.
 * @param namesFinish      injected `finishRefCandidates(...).length > 0`-shaped
 *        predicate. ⭐ BOTH are needed and they are NOT the same question.
 *        "parquet" names thirteen real materials and resolves to NONE of them
 *        (ambiguity is a refusal, never a pick). If the claim rule tested only
 *        `resolvesFinish`, every ambiguous-but-real material word would fall
 *        through to a generic miss instead of a refusal that LISTS the thirteen —
 *        the U8.3 teach-don't-just-say-no rule, which is the entire reason the
 *        founder could not find these rows in the first place.
 *        Injected rather than imported so this module stays a pure function of
 *        its inputs and the finish table has exactly one owner.
 */
export function parseFloorFinishIntent(
    text: string,
    resolvesFinish: (ref: string) => boolean,
    namesFinish: (ref: string) => boolean,
    ctx?: ResolverContext,
): FloorFinishIntent | null {
    // ⛔ Never steal a layer ADD. That one moves the floor's build-up thickness.
    if (/^add\b/.test(text)) return null;
    if (LAYER_NOUN.test(text)) return null;
    if (!FINISH_VERB.test(text)) return null;
    // ⛔ Another family's noun ⇒ another family's grammar. See the header.
    if (OTHER_FAMILY_NOUN.test(text)) return null;

    // RAC U8.1 — filter clauses are LIFTED first, so a filter composes with every
    // scope form below for free, in either word order.
    const lifted = parseFilterClauses(text, 'floor');
    const t = lifted.stripped;

    const isAll = SCOPE_ALL.test(t);
    const isSel = SCOPE_SEL.test(t);
    const hasFloorNoun = FLOOR_NOUN.test(t);

    // ── The finish NAME, by the same shrinking-window scan the wall grammars use,
    //    so word order never matters: "finish oak chevron", "oak chevron finish"
    //    and "to oak chevron" all reach the same span.
    //
    // ⭐ THE CONNECTOR TAIL IS TRIED FIRST, and that inverts the wall grammar's
    //    order on purpose. Measured 2026-08-21 on the founder's own sentence:
    //    "finish to wooden parquet". The scan runs longest-span-first, but
    //    `resolveFinishRef('wooden')` returns **Wood · Oak (Light)** (the loose
    //    alias arm: 'wooden'.includes('wood')), so a scan-first reading would have
    //    picked the one-word span, applied PLAIN OAK, and reported success — the
    //    §L960-WOOD-IS-A-SURFACE defect with the founder's exact words. When the
    //    user wrote "to X", X is what they named, whole; the scan is the fallback
    //    for sentences with no connector.
    //    (The other half of that defect is fixed in `finishRef.ts` itself, where a
    //    loose alias match may no longer DROP a word the catalogue knows.)
    let finishRef: string | null = null;
    const tail = /\b(?:to|into|as|in|with|using|finish(?:es|ed|ing)?)\s+(?:the\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3})\s*$/i.exec(t.trim());
    const rawTail = tail?.[1]?.trim().toLowerCase();
    if (rawTail !== undefined && rawTail.length > 0 && !FLOOR_NOUN.test(rawTail)) {
        if (resolvesFinish(rawTail) || namesFinish(rawTail)) finishRef = rawTail;
    }
    if (finishRef === null) {
        const words = t.split(/[^a-z-]+/i).filter((w) => w.length > 2);
        outer:
        for (let span = 3; span >= 1; span--) {
            for (let i = 0; i + span <= words.length; i++) {
                const candidate = words.slice(i, i + span).join(' ').toLowerCase();
                if (resolvesFinish(candidate) || namesFinish(candidate)) {
                    finishRef = candidate;
                    break outer;
                }
            }
        }
    }
    // ── THE UNRECOGNISED TAIL. When neither arm found anything the catalogue
    //    knows, carry the words the user actually typed so the refusal can QUOTE
    //    them ("I don't have a material called \"unobtainium\"") instead of the
    //    strictly weaker "tell me which finish". This never widens the claim:
    //    `named` below, not this, is what the claim rule tests.
    const named = finishRef;
    if (finishRef === null && rawTail !== undefined && rawTail.length > 0 && !FLOOR_NOUN.test(rawTail)) {
        finishRef = rawTail;
    }

    // ── THE CLAIM RULE. A material must be NAMED — that is the only thing that
    //    separates this from `finish-apartment-chain`, which owns "finish this
    //    floor" and runs an entire generation chain. Naming a material is
    //    unambiguous evidence of a finish ask; the floor NOUN alone is not.
    if (named === null) return null;
    // ── ...and the sentence must be ABOUT floors. Either it says so, or the live
    //    selection does. The second arm is what makes the founder's bare "finish
    //    to wooden parquet" work with a floor selected, and what stops it claiming
    //    a sentence typed with a wall selected — where the wall grammar's own
    //    §FIX-BARE-FINISH-SELF-CONTRADICTS arm (L-998) is the right owner.
    const selectionIsFloor =
        ctx !== undefined
        && ctx.selection.length > 0
        && ctx.selection.every((s) => s.elementType?.toLowerCase() === 'floor');
    if (!hasFloorNoun && !selectionIsFloor) return null;

    // ── The SPATIAL scope. Refused only against "these/selected", which would
    //    contradict the live selection.
    let base: 'all' | 'selection' | IntentSpatialScope;
    const place = parseInlineSpatialPhrase(t, ctx);
    if (place.kind === 'unusable') {
        // A place was NAMED and cannot be resolved ("this floor" with no active
        // level). Decline — never silently widen to the whole building, which on a
        // mass re-finish is the outcome this grammar exists to prevent.
        return null;
    }
    if (place.kind === 'scope' && !isSel) {
        base = place.scope;
    } else if (!isAll && !isSel) {
        // "make the living room floor oak herringbone" — a room named with no
        // preposition, which the shared inline reader cannot see. Classified by
        // `readSpatialTail`, so "the ground floor" still comes back as a LEVEL.
        const bare = BARE_ROOM_FLOOR_RE.exec(t);
        const phrase = bare?.[1]?.trim().toLowerCase();
        const reading = phrase === undefined || phrase.length === 0
            ? { kind: 'none' as const }
            : readSpatialTail(undefined, phrase, ctx);
        if (reading.kind === 'unusable') return null;
        base = reading.kind === 'scope' ? reading.scope : 'selection';
    } else {
        base = isAll ? 'all' : 'selection';
    }

    return {
        intent: 'set-floor-finish',
        finishRef,
        scope: attachFilters(base, lifted.filters),
    };
}

/**
 * The founder's sentence and the shapes it generalises to, pinned.
 *
 * Every entry MUST resolve to `set-floor-finish` through the REAL ladder —
 * asserted in `floor-finish.test.ts`, which drives `resolveNaturalLanguage`
 * rather than calling this parser directly. A grammar proven only against itself
 * is the §COMMITTED-IS-NOT-REACHABLE defect.
 */
export const FLOOR_FINISH_EXAMPLES: readonly string[] = [
    // ── The shapes that carry the floor noun ──
    'make all floors oak chevron',
    'change all floors to oak chevron',
    'set all floors on level 2 to walnut herringbone',
    'make the living room floor oak chevron',
    'lay oak chevron on all floors',
    // ── The founder's own words need a floor SELECTED; they are pinned in the
    //    test with a selection, not here, because this list is driven scope-free.
];

/**
 * Utterances that MUST NOT be claimed here — each belongs to a neighbouring
 * capability, and a regression that steals one is invisible until a founder
 * finds it. Pinned in the same test.
 */
export const FLOOR_FINISH_NON_CLAIMS: readonly string[] = [
    'finish this floor',                                   // finish-apartment-chain
    'finish this apartment',                               // finish-apartment-chain
    'make all walls interior finish plaster',              // set-wall-side-finish
    'add a 10mm plaster layer to all floors',              // (layer ADD — reserved)
    'change this floor to level 1',                        // move-to-level
    'change all slabs to concrete 200',                    // set-slab-type
];
