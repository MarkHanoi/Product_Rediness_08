// @pryzm/ai-host — CurtainWallParameterFamily (§CWPROPS152)
// =============================================================================
//
// THE ASK, verbatim (founder, via RAC): *"important request via RAC - i
// thought that was in place - and it should be for all curtain walls
// properties; e.g: Make mullion size of all curtain walls in ground level to
// 0.06 meters / I want to potentially do the same for all attributes / ...
// Post Spacing (m) 1.5 / Transom Spacing (m) 5 / Mullion Size (m) 0.03 / Panel
// Thickness (m) 0.019 ..."*
//
// THIS MODULE is the NATURAL-LANGUAGE GRAMMAR for that ask — turning a
// sentence into `{ parameter, value, scope }`, the exact shape
// `BulkUpdateCurtainWallParameterCommand` (@pryzm/command-registry) accepts.
// The PARAMETER VOCABULARY AND BOUNDS are NOT re-declared here: they are
// imported from `@pryzm/geometry-curtain-wall`'s `CurtainWallParameterConstraints.ts`
// — the SAME table the bulk command validates against (C84 EI-9, one answer
// per question). This module only ever recognises the four real keys that
// table declares; it never invents a fifth.
//
// ── ⭐ WIRED IN 2026-08-27 (§CWCHAT155) — this section corrected, not deleted ─
//
// This paragraph used to read "NOT WIRED INTO THE LIVE CHAT LADDER". That is
// no longer true, and the plan below is kept as a record of what was
// predicted, not because it is still accurate — item 1 in particular was
// WRONG (a `CapabilityExecutionSpec.ts` table row does not fit this
// capability's payload shape; see below).
//
// What actually shipped:
//   1. `ZeroTokenResolver.ts` — `matchCurtainWallParameter` calls
//      `parseCurtainWallParameterIntent(text, ctx)` from the tier-0 MATCHERS
//      array, positioned BEFORE `matchWallSideFinish` (the ownership rule,
//      tier-0's order-based equivalent of a confidence rank) — NOT beside
//      `matchDimensionScoped` as originally planned, because
//      `matchWallSideFinish` sits well before that position and would have
//      intercepted every sentence carrying "curtain wall(s)" first (measured;
//      see the "SELECTION-scoped sibling" section below, which is what
//      exposed the collision). A hand-written `applySemanticIntent` case arm
//      dispatches `curtain-wall.bulkUpdateParameter` directly — NOT a
//      `CapabilityExecutionSpec.ts` table row: that generic template assumes
//      a flat `idsField: 'all' | string[]` payload, and this command's scope
//      is the discriminated `{kind:'element'|'level'|'project'|'ids'}` union
//      `curtain-wall.bulkUpdatePanels` (§RACORIENT145) also uses — the exact
//      mismatch this file's own original plan did not anticipate.
//   2. `LocalNaturalLanguageResolver.ts` — the SAME parser pushed as a
//      confidence-ranked NL-layer candidate at 0.97 (above wall-side-finish's
//      0.96), for a sentence tier-0's exact grammar misses but the NL layer's
//      looser normalization still reaches.
//   3. `ChatCapabilityRegistry.ts` — a `set-curtain-wall-parameter`
//      `ChatCapability` entry replaces the `CHAT_UNAVAILABLE` row, once a
//      foreground-green test proved a real sentence reaches the bus verb
//      (`curtainWallParameterChatWiring.test.ts`).
// See ZeroTokenResolver.ts's `case 'set-curtain-wall-parameter':` and
// `matchCurtainWallParameter` for the implementation and their own comments
// for the ownership-rule reasoning.
//
// ── SHAPE — REUSE, NOT A SIXTH SPELLING OF THE SCOPE TAIL ───────────────────
//
// Level and orientation (facade) phrases are read through
// `SpatialScopeTail.ts` — `SPATIAL_TAIL_SRC` / `readSpatialTail` /
// `joinTailPhrase` for the embeddable tail, `matchTrailingSpatialScope` for a
// TRAILING one (see SHAPE 3 below) — the SAME shared parser
// `DimensionFamilies.ts` (this directory) uses, never a hand-written
// re-implementation (§FIX-SCOPE-TAIL-ONE-PARSER, L-1201; this is the
// SIXTH-plus consumer, not a new spelling).
//
// THREE sentence shapes, tried in this exact order — most-anchored first, so a
// permissive later shape never mis-reads a sentence an earlier, more specific
// shape already parses correctly:
//
//  1. PROPERTY-FIRST, explicit scope: "<verb> <param> of/for/on all/every/…
//     [curtain wall(s)] <tail> [to] <value>"
//       "make mullion size of all curtain walls in ground level to 0.06 meters"
//       "change panel thickness of all curtain walls to 0.024"
//  2. NOUN-FIRST, explicit scope: "<verb> all/every/… curtain wall(s) <tail>
//     <param> [to] <value>" — mirrors `DimensionFamilies`' base shape exactly,
//     vocabulary swapped.
//       "set all curtain walls post spacing to 1.5"
//  3. BARE PARAMETER, no scope word, no noun — legal ONLY when a TRAILING
//     spatial phrase supplies the scope (curtain-wall parameter words are
//     unique vocabulary — no other element kind has a "post spacing" — so the
//     parameter name alone identifies the family; a scope is still REQUIRED,
//     supplied by the trailing tail, never guessed):
//       "set post spacing to 1.2 on the west facade"
//       "set transom spacing to 4 m on level 3"
//     ⚠ Shape 3's tail is ALWAYS trailing (after the value) — there is no
//     scope word/noun to put it before. A completely bare sentence with
//     NEITHER a scope word/noun NOR a spatial tail ("set mullion size to
//     0.06") is NOT CLAIMED by this shape — on a mass edit, an unclaimed
//     sentence falls through to an honest miss, which is better than a coin
//     flip that resizes every curtain wall in the project.
//
//  ⭐ SHAPES 1 AND 2 EACH ACCEPT THE TAIL IN **EITHER** POSITION. The founder's
//  own four examples put it in both places ("of all curtain walls IN GROUND
//  LEVEL to 0.06 meters" — before the value; "to 4 m ON LEVEL 3" — after,
//  though that one has no noun at all and is shape 3). When the embeddable
//  `SPATIAL_TAIL_SRC` finds nothing between the noun and the value, shapes 1/2
//  fall back to `matchTrailingSpatialScope` on the value tail itself — the
//  SAME shared reader, checked at the other position, never a second spelling.
//
// ── UNIT CONVENTION (mirrors the constraints module) ────────────────────────
//
// All four parameters are metres-native. An explicit unit (mm/cm/m) converts;
// a BARE number is read as METRES. The tight per-parameter bounds
// (`checkCurtainWallParameter`) are the deliberate safety net against a unit
// mistake — this module does not attempt a SECOND unit heuristic, because a
// second heuristic disagreeing with the bounds check would be two answers to
// one question (C84 EI-9).
//
// ── MULTI-PARAMETER SENTENCES ARE NOT CLAIMED ───────────────────────────────
//
// `BulkUpdateCurtainWallParameterCommand` takes ONE `parameter` + ONE `value`
// per dispatch (the brief's own instruction: "take a parameter key + value +
// scope"), unlike `DimensionFamilies`' multi-key `dims` object. A sentence
// naming TWO DIFFERENT parameter words with values ("set mullion size to 0.06
// and panel thickness to 0.02") is therefore NOT CLAIMED — silently acting on
// only the first and dropping the second would be partial execution presented
// as success. A future compound bulk command (mirroring
// `UpdateElementDimensionsBatchCommand`'s multi-field payload) is the correct
// way to extend this, not a grammar that picks a winner.
//
// PURE — tables and regexes only. No I/O, no stores; `ctx` (for level/room
// disambiguation) is the same optional `ResolverContext` every other grammar
// in this package takes.
//
// ── ⭐ DISCOVERED WHILE BUILDING THIS: A SELECTION-SCOPED SIBLING ALREADY
// SHIPPED (§CW90 / RAC U7.3) — AND IT IS CURRENTLY REGRESSED ──────────────
//
// `PropertyVocabulary.ts` (this directory) already declares `set-mullion-size`,
// `set-panel-thickness`, `set-post-spacing` and `set-transom-spacing` as
// `scope: 'selection'` capabilities — i.e. "select some curtain walls, then
// say 'set the mullion size to 60mm'". That is a DIFFERENT, narrower
// capability than this module's (this one is unscoped-by-selection: all /
// level / project / an upstream-resolved id list), and this module does not
// duplicate its vocabulary wholesale — see `PARAM_WORD_TO_KEY` above, which
// overlaps with (but is not identical to) `PropertyVocabulary`'s `synonyms`
// arrays for the same four properties. Aligning the two tables under one
// export is a reasonable follow-up (C84 EI-9) not attempted in this pass.
//
// MEASURED 2026-08-27, via direct `resolveUtterance()` calls (not asserted —
// executed): the SELECTION-scoped sibling's OWN pinned examples are BROKEN
// for any sentence containing the word "wall" — `check-chat-capability-coverage.ts`
// itself reports it (`set-mullion-size: example "set the curtain wall mullion
// size to 50mm" resolved to set-wall-side-finish, not to itself`, and the same
// for panel-thickness/post-spacing/transom-spacing). Reproduced directly:
//   resolveUtterance("set the curtain wall mullion size to 50mm", …)
//     → { kind: 'refusal', intent: 'set-wall-side-finish', reason: 'Wall
//         finishes apply to walls, and the selection is curtain-wall.' }
//   resolveUtterance("set the mullion size to 60mm", …)          → CORRECT
//   resolveUtterance("set the post spacing to 1.5m", …)          → CORRECT
//   resolveUtterance("set the curtain wall bay width to 1m", …)  → WRONG (same defect)
// The discriminator is the literal word "wall" in the sentence — `WallSideFinishIntent.ts`
// (committed by §RACSIDE144, commit 3cf0dbc3, "… and 'white paint' now
// claims") over-claims a sentence carrying "wall" + a scope word + "to" +
// value even with NO finish marker and no resolvable finish name. NOT fixed
// here — that file is a different, concurrently active lane's territory —
// reported to the orchestrator instead (see this lane's final report).

import {
    CURTAIN_WALL_PARAMETER_KEYS,
    CURTAIN_WALL_PARAMETER_META,
    type CurtainWallParameterKey,
} from '@pryzm/geometry-curtain-wall';
import {
    SPATIAL_TAIL_SRC,
    joinTailPhrase,
    readSpatialTail,
    matchTrailingSpatialScope,
} from './SpatialScopeTail.js';
import type { IntentSpatialScope } from './ScopeDescriptor.js';
import type { ResolverContext } from './ZeroTokenResolver.js';

/** The intent this grammar produces — the exact shape the (not-yet-wired)
 *  `CapabilityExecutionSpec` row would forward into
 *  `BulkUpdateCurtainWallParameterInput` once wiring is possible (see header). */
export interface CurtainWallParameterIntent {
    readonly parameter: CurtainWallParameterKey;
    /** Always metres — see the unit-convention note above. */
    readonly value: number;
    readonly scope: 'all' | 'selection' | IntentSpatialScope;
}

// ─── The parameter vocabulary — WORDS, not the keys/bounds (imported above) ──

/** Longest-phrase-first is not load-bearing here (no phrase is a substring of
 *  another), but kept for consistency with `DimensionFamilies.DIM_WORD_TO_KEY`'s
 *  own convention. Aliases are deliberately modest — the founder's own words
 *  plus the one synonym each ("mullion width", "glazing thickness") an
 *  architect would reach for; not an open-ended thesaurus. */
const PARAM_WORD_TO_KEY: readonly (readonly [string, CurtainWallParameterKey])[] = [
    ['post spacing', 'gridXSpacing'],
    ['u-line spacing', 'gridXSpacing'],
    ['u line spacing', 'gridXSpacing'],
    ['mullion spacing', 'gridXSpacing'],
    ['transom spacing', 'gridYSpacing'],
    ['v-line spacing', 'gridYSpacing'],
    ['v line spacing', 'gridYSpacing'],
    ['mullion size', 'mullionSize'],
    ['mullion width', 'mullionSize'],
    ['mullion depth', 'mullionSize'],
    ['panel thickness', 'panelThickness'],
    ['glazing thickness', 'panelThickness'],
    ['glass thickness', 'panelThickness'],
];

// Every key in the constraints module's CLOSED set must have at least one
// spoken form here, or the grammar could never reach it — a control, not a
// runtime branch (mirrors `DimensionFamilies`' own cross-check discipline).
// Pinned by `curtainWallParameterFamily.test.ts`.
void ((): void => {
    const covered = new Set(PARAM_WORD_TO_KEY.map(([, k]) => k));
    for (const k of CURTAIN_WALL_PARAMETER_KEYS) {
        if (!covered.has(k)) throw new Error(`[CurtainWallParameterFamily] '${k}' has no spoken form`);
    }
})();

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PARAM_WORD_SRC = PARAM_WORD_TO_KEY.map(([w]) => w.replace(/ /g, String.raw`\s+`)).join('|');

function keyForWord(raw: string): CurtainWallParameterKey | null {
    const w = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const [word, key] of PARAM_WORD_TO_KEY) if (word === w) return key;
    return null;
}

/** The noun forms — "curtain wall(s)", plus the two aliases the sibling
 *  dimension family (`DimensionFamilies.DIMENSION_FAMILIES`'s curtain-wall
 *  row) already established, so the two grammars cannot disagree about what
 *  a curtain wall may be called. */
const NOUN_SRC = ['curtain wall', 'curtainwall', 'glazed wall', 'glass wall']
    .map((n) => escapeRe(n))
    .join('|');

const VERB = String.raw`(?:set|change|make|resize|update|adjust)`;
const SCOPE_ALL = String.raw`(?:all|every|each)`;
const SCOPE_SEL = String.raw`(?:these|those|selected)`;

/** Same measurement source as every other grammar in this package —
 *  `DimensionFamilies.LEN`, restated (not imported: that constant is not
 *  exported, and re-deriving three regex alternatives is not worth a second
 *  cross-file coupling for what is one line). Byte-identical unit set. */
const LEN = String.raw`(-?\d+(?:[.,]\d+)?)\s*(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?\b`;
const LEN_RE = new RegExp(LEN);

/** Metres, always — see the module header's unit-convention note. */
function toMeters(raw: string, unit: string | undefined): number {
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) return Number.NaN;
    const u = (unit ?? '').toLowerCase();
    if (u.startsWith('mm') || u.startsWith('millimet')) return n / 1000;
    if (u.startsWith('cm') || u.startsWith('centimet')) return n / 100;
    return n; // bare, or m/metre/meter — already metres.
}

/** Pull the first (param word, value) binding out of free text, scanning both
 *  word orders — byte-identical STRATEGY to `extractDimensionBindings`
 *  (this directory's `DimensionFamilies.ts`), vocabulary swapped. Returns every
 *  DISTINCT key found (first value per key wins), so the caller can refuse a
 *  sentence naming two different parameters instead of silently picking one
 *  (see the module header). */
function extractParameterBindings(rest: string): Map<CurtainWallParameterKey, number> {
    const found = new Map<CurtainWallParameterKey, number>();
    const valueFirst = new RegExp(String.raw`${LEN}\s*(?:in\s+|of\s+)?(${PARAM_WORD_SRC})\b`, 'gi');
    const paramFirst = new RegExp(String.raw`\b(${PARAM_WORD_SRC})\b\s*(?:of|to|at|is|=|:)?\s*${LEN}`, 'gi');
    let m: RegExpExecArray | null;
    valueFirst.lastIndex = 0;
    while ((m = valueFirst.exec(rest)) !== null) {
        const key = keyForWord(m[3]!);
        if (key !== null && !found.has(key)) found.set(key, toMeters(m[1]!, m[2]));
    }
    paramFirst.lastIndex = 0;
    while ((m = paramFirst.exec(rest)) !== null) {
        const key = keyForWord(m[1]!);
        if (key !== null && !found.has(key)) found.set(key, toMeters(m[2]!, m[3]));
    }
    return found;
}

/** Shape 1 — property-first: "<verb> <param> of/for/on <scope> [curtain
 *  wall(s)] <tail> [to] <value>". */
const PROPERTY_FIRST_RE = new RegExp(
    `^${VERB} (?:the )?(${PARAM_WORD_SRC})(?:'s)? (?:of|for|on) (?:the )?(${SCOPE_ALL}|${SCOPE_SEL})` +
    `(?: of)?(?: the)? (?:${NOUN_SRC})s?(?:'s?)?` +
    SPATIAL_TAIL_SRC +
    `(?: (?:to|at|as|be|into))? (.+)$`,
    'i',
);

/** Shape 2 — noun-first: "<verb> <scope> [curtain wall(s)] <tail> <param>
 *  [to] <value>". Mirrors `DimensionFamilies`' base regex exactly. */
const NOUN_FIRST_RE = new RegExp(
    `^${VERB} (?:the )?(${SCOPE_ALL}|${SCOPE_SEL})(?: of)?(?: the)? (?:${NOUN_SRC})s?(?:'s?)?` +
    SPATIAL_TAIL_SRC +
    `(?: (?:to|at|as|be|into))? (.+)$`,
    'i',
);

/** Shape 3 — bare parameter, scope supplied ONLY by a trailing spatial phrase
 *  (see the module header for why this is a different word order from 1/2). */
const BARE_PARAM_RE = new RegExp(
    `^${VERB} (?:the )?(${PARAM_WORD_SRC})(?:'s)?\\s+(?:to|at|as|be|into|is|=|:)?\\s*${LEN}\\s*$`,
    'i',
);

function baseFromScopeWord(
    scopeWord: string,
    tail: ReturnType<typeof readSpatialTail>,
): 'all' | 'selection' | IntentSpatialScope | null {
    const isAll = new RegExp(`^${SCOPE_ALL}$`, 'i').test(scopeWord);
    if (tail.kind === 'unusable') return null; // named a place, couldn't resolve — DECLINE, never widen.
    if (tail.kind === 'scope') {
        // Spatial phrases compose with the ALL scope only (§FIX-SCOPE-TAIL-ONE-PARSER's
        // own rule) — "selected curtain walls in ground level" contradicts the
        // live selection and is not claimed.
        return isAll ? tail.scope : null;
    }
    return isAll ? 'all' : 'selection';
}

function oneBinding(bindings: Map<CurtainWallParameterKey, number>): { key: CurtainWallParameterKey; value: number } | null {
    // Zero → this sentence carries no recognised parameter+value at all; more
    // than one DIFFERENT key → refuse to guess which one wins (module header).
    if (bindings.size !== 1) return null;
    const entry = bindings.entries().next().value;
    if (entry === undefined) return null;
    const [key, value] = entry;
    return { key, value };
}

/**
 * Parse a scoped curtain-wall PARAMETER sentence into
 * `{ parameter, value, scope }`, or `null` when no shape claims it.
 *
 * `ctx` is the same optional `ResolverContext` every grammar in this package
 * takes (for level-name / active-level / room-name disambiguation); omit it
 * to get the context-free reading (a level phrase still resolves to a
 * `levelQuery`, just without "this floor" support).
 */
export function parseCurtainWallParameterIntent(
    text: string,
    ctx?: ResolverContext,
): CurtainWallParameterIntent | null {
    const trimmed = text.trim();

    // ── Shape 1 — property-first ──────────────────────────────────────────
    {
        const m = PROPERTY_FIRST_RE.exec(trimmed);
        if (m !== null) {
            const key = keyForWord(m[1]!);
            const scopeWord = m[2]!;
            let tail = readSpatialTail(m[3], joinTailPhrase(m[4], m[5]), ctx);
            let valueTail = m[6]!;
            // No tail found BEFORE the value ("… curtain walls to 0.06 m") —
            // the founder's OTHER preferred order puts the place AFTER the
            // value ("… curtain walls to 0.06 m in ground level"). Same
            // shared reader, the other position — never a second spelling.
            if (tail.kind === 'none') {
                const trailing = matchTrailingSpatialScope(valueTail, ctx);
                if (trailing !== null) {
                    tail = trailing.reading;
                    valueTail = valueTail.slice(0, trailing.start).trim();
                }
            }
            const lenMatch = LEN_RE.exec(valueTail);
            if (key !== null && lenMatch !== null) {
                const base = baseFromScopeWord(scopeWord, tail);
                if (base !== null) {
                    return { parameter: key, value: toMeters(lenMatch[1]!, lenMatch[2]), scope: base };
                }
            }
        }
    }

    // ── Shape 2 — noun-first (param word scanned out of the free tail) ────
    {
        const m = NOUN_FIRST_RE.exec(trimmed);
        if (m !== null) {
            const scopeWord = m[1]!;
            let tail = readSpatialTail(m[2], joinTailPhrase(m[3], m[4]), ctx);
            let rest = m[5]!;
            // Same trailing-position fallback as shape 1 — "all curtain
            // walls mullion size to 0.06 m on level 2" (place AFTER the
            // value) is the founder's own preferred order for this shape.
            if (tail.kind === 'none') {
                const trailing = matchTrailingSpatialScope(rest, ctx);
                if (trailing !== null) {
                    tail = trailing.reading;
                    rest = rest.slice(0, trailing.start).trim();
                }
            }
            const bindings = extractParameterBindings(rest);
            const one = oneBinding(bindings);
            if (one !== null) {
                const base = baseFromScopeWord(scopeWord, tail);
                if (base !== null) {
                    return { parameter: one.key, value: one.value, scope: base };
                }
            }
        }
    }

    // ── Shape 3 — bare parameter, TRAILING spatial tail supplies the scope ─
    {
        const trailing = matchTrailingSpatialScope(trimmed, ctx);
        // A scope is MANDATORY for this shape (see header) — no trailing
        // phrase, or one that could not resolve, means this shape declines.
        if (trailing !== null && trailing.reading.kind === 'scope') {
            const withoutTail = trimmed.slice(0, trailing.start).trim();
            const m = BARE_PARAM_RE.exec(withoutTail);
            if (m !== null) {
                const key = keyForWord(m[1]!);
                if (key !== null) {
                    return { parameter: key, value: toMeters(m[2]!, m[3]), scope: trailing.reading.scope };
                }
            }
        }
    }

    return null;
}

/** Every parameter's spoken forms — for capability-registry `examples[]` and
 *  refusal copy once this is wired in (see the module header). */
export function curtainWallParameterSpokenForms(key: CurtainWallParameterKey): readonly string[] {
    return PARAM_WORD_TO_KEY.filter(([, k]) => k === key).map(([w]) => w);
}

export { CURTAIN_WALL_PARAMETER_META };
