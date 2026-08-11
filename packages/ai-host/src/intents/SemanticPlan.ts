// @pryzm/ai-host — §PLAN (RAC U6): the compound-sentence parser.
// =============================================================================
//
// "Duplicate level 0 to level 1, then furnish it."
//
// WHAT THIS IS. A splitter and nothing more. It cuts a compound utterance on
// EXPLICIT sequencing connectives ("then", "and then", ", then", "after that",
// and a leading "first … then …"), hands each clause to the EXISTING
// single-intent ladder — tier 0 grammar → tier 1 synonyms/typos → the local
// natural-language layer — and packages the results as one `execute-plan`
// SemanticIntent. `applySemanticIntent` then validates and executes it
// (ZeroTokenResolver's `applyPlan`), which is where all-or-nothing validation,
// the level projection and the truthful undo cost live.
//
// WHAT THIS IS NOT.
//  • Not a second resolver. There is no plan grammar per capability; a clause
//    that no capability claims alone is not claimed inside a plan either.
//  • Not a way around a guard. Every claiming guard the single-sentence path
//    applies is applied PER CLAUSE, and two of them are checked here first so
//    the failure names the clause: `descriptiveReportReason` (report-shaped or
//    past-tense text can never command — §FIX-CHAT-REPORT-PASTEBACK) and
//    `nonImperativeReason` (negations, hypotheticals, questions). "Make all
//    walls white, then built 6 floors — 18 apartments" refuses WHOLE.
//  • Not an "and" splitter. `and` is overwhelmingly a NOUN conjunction in this
//    domain ("furnish the kitchen and the living room", "walls and slabs"), so
//    it splits only in the explicit "and then" form. When a clause does NOT
//    resolve and the single-intent ladder understands the whole sentence, that
//    capability's own answer wins and this module stands aside.
//
// PURITY: no DOM, no stores, no I/O — the caller injects the ResolverContext,
// exactly as for `resolveUtterance`.

import { descriptiveReportReason, nonImperativeReason } from '../capabilities/CapabilityRefusal.js';
import {
  applySemanticIntent,
  findLevel,
  resolveUtterance,
  resolveUtteranceIntent,
  type ResolverContext,
  type ResolverLevel,
  type SemanticIntent,
  type ZeroTokenResolution,
} from './ZeroTokenResolver.js';
import {
  resolveNaturalLanguage,
  type ConversationContext,
} from './LocalNaturalLanguageResolver.js';

/**
 * The sequencing connectives that make a sentence a PLAN. Every one of them is
 * explicitly temporal — the user said one thing happens after another. A bare
 * "and" is deliberately absent (see the header).
 */
const PLAN_CONNECTIVE =
  /(?:\s*[,;.]\s*(?:and\s+)?then\b|\s+and\s+then\b|\s*[,;.]\s*after\s+that\b,?|\s+after\s+that\b,?|\s+then\b|\s*;\s*)/i;

const PLAN_CONNECTIVE_G = new RegExp(PLAN_CONNECTIVE.source, 'gi');

/** Leftover sequencing words at the head of a clause once the connective is
 *  cut ("first duplicate…", "next, furnish it"). Removed so tier 0 — which is
 *  anchored at `^` — sees the clause the same way it would see the sentence. */
const CLAUSE_LEAD = /^(?:and\s+|then\s+|next[,]?\s+|after\s+that[,]?\s+|first[,]?\s+|finally[,]?\s+|also[,]?\s+)+/i;

/** Pronouns a later clause may use for what an earlier step produced. */
const CLAUSE_PRONOUN = /\b(?:it|them|that one|those)\b/i;

/** Why a plan could not be built. `not-a-plan` is not a failure — it means the
 *  utterance is an ordinary single sentence and the caller's normal ladder owns
 *  it. */
export type PlanParse =
  | { readonly kind: 'plan'; readonly intent: Extract<SemanticIntent, { intent: 'execute-plan' }> }
  | { readonly kind: 'refusal'; readonly reason: string; readonly suggestions: readonly string[] }
  | { readonly kind: 'not-a-plan' };

export interface PlanContext extends ResolverContext {
  readonly conversation?: ConversationContext;
}

/** Split on the connectives, keeping the user's own words for each clause. */
export function splitPlanClauses(utterance: string): readonly string[] {
  const text = utterance.trim().replace(/[.!?]+$/, '');
  PLAN_CONNECTIVE_G.lastIndex = 0;
  if (!PLAN_CONNECTIVE_G.test(text)) return [];
  return text
    .split(new RegExp(PLAN_CONNECTIVE.source, 'i'))
    .map((c) => c
      .replace(/^[\s,;.]+/, '')
      .replace(/[\s,;.]+$/, '')
      .replace(CLAUSE_LEAD, '')
      .trim())
    .filter((c) => c.length > 0);
}

/**
 * What a step hands to the next clause: the SUBJECT its pronoun may refer to,
 * and the level it will create (the ONE projection — see ZeroTokenResolver's
 * `applyPlan`). Only level-producing steps hand over anything: "duplicate level
 * 0 to level 1, then furnish it" means level 1, and that is knowable purely.
 * Everything else leaves "it" unresolved, and an unresolvable clause refuses
 * out loud rather than guessing at what the user meant.
 *
 * Both facts are read off the step's OWN application — the produced `level.add`
 * payload, the `findLevel` authority — never re-derived here, so the parser and
 * the executor cannot disagree about what step 1 leaves behind.
 */
function stepHandover(
  si: SemanticIntent,
  ctx: ResolverContext,
  levels: readonly ResolverLevel[],
): { readonly subject: string | null; readonly addedLevel: ResolverLevel | null } {
  const none = { subject: null, addedLevel: null } as const;
  if (si.intent === 'duplicate-level') {
    const last = si.targetQueries[si.targetQueries.length - 1];
    if (last === undefined) return none;
    const hit = findLevel(last, levels);
    return { subject: hit !== undefined ? hit.name : `level ${last}`, addedLevel: null };
  }
  if (si.intent === 'add-level') {
    const applied = applySemanticIntent(si, { ...ctx, levels });
    if (applied.kind !== 'commands') return none;
    const p = applied.commands.find((c) => c.type === 'level.add')?.payload;
    const id = p?.['levelId'];
    const name = p?.['name'];
    if (typeof id !== 'string' || typeof name !== 'string') return none;
    const elevation = p?.['elevation'];
    return {
      subject: name,
      addedLevel: { id, name, ...(typeof elevation === 'number' ? { elevation } : {}) },
    };
  }
  return none;
}

/** Resolve ONE clause through the full single-intent ladder. */
function clauseIntent(clause: string, ctx: PlanContext): SemanticIntent | null {
  const tier01 = resolveUtteranceIntent(clause, ctx);
  if (tier01 !== null) return tier01;
  const nl = resolveNaturalLanguage(clause, ctx);
  return nl.kind === 'resolved' ? nl.semanticIntent : null;
}

/** Does the single-intent ladder claim the WHOLE utterance — as commands, a
 *  local action, or an honest refusal? Used as the tie-break when a clause does
 *  not resolve: a capability that understands the entire sentence gives a better
 *  answer than "step 2 is not something I know how to do". */
function singleLadderClaimsWhole(utterance: string, ctx: PlanContext): boolean {
  if (resolveUtterance(utterance, ctx).kind !== 'miss') return true;
  return resolveNaturalLanguage(utterance, ctx).kind === 'resolved';
}

/**
 * Parse a compound utterance into an `execute-plan` intent.
 *
 * Order of business, and each step is load-bearing:
 *  1. No sequencing connective ⇒ `not-a-plan`. Nothing else about the sentence
 *     matters; a plan is something the user explicitly sequenced.
 *  2. Per clause: the claiming guards first, then the ladder, then — for a later
 *     clause — pronoun substitution from the previous step's subject. A clause
 *     claimed by a GUARD refuses the whole plan outright; nothing may recover a
 *     report-shaped or non-imperative clause into an instruction.
 *  3. A clause the ladder cannot resolve is the ambiguous case, and the tie-break
 *     is deliberate: if the single-intent ladder claims the WHOLE utterance,
 *     `not-a-plan` — that capability's own answer (usually a much better
 *     refusal, e.g. "the furnishing engine runs a whole level at a time") wins.
 *     Only when nothing understands the sentence either way does the plan refuse
 *     by naming the clause.
 *
 * Note what is NOT here: no "whole sentence first" short-circuit. Several
 * capability parsers are token-based and ignore trailing text, so
 * "generate a 2-storey house and then furnish all rooms" IS claimed whole by two
 * different grammars — each of which would silently drop half of what the
 * founder asked for. A sentence he explicitly sequenced is a plan.
 */
export function parsePlanIntent(utterance: string, ctx: PlanContext): PlanParse {
  const clauses = splitPlanClauses(utterance);
  if (clauses.length < 2) return { kind: 'not-a-plan' };

  const steps: SemanticIntent[] = [];
  const kept: string[] = [];
  let levels = ctx.levels;
  let subject: string | null = null;

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i]!;
    const where = `Step ${i + 1} — "${clause}"`;
    // (3) The claiming guards, per clause. A plan may never reach a grammar the
    // same words typed alone could not.
    if (descriptiveReportReason(clause) !== null) {
      return {
        kind: 'refusal',
        reason:
          `${where} reads like a report of something that already happened, not an instruction — ` +
          `so I will not act on it, and I did not run any of the other steps either.`,
        suggestions: [],
      };
    }
    const nonImperative = nonImperativeReason(clause);
    if (nonImperative !== null) {
      return {
        kind: 'refusal',
        reason:
          `${where} is ${nonImperative === 'interrogative' ? 'a question' : `${nonImperative}`}, not an instruction — ` +
          `nothing in the plan was run.`,
        suggestions: [],
      };
    }

    const clauseCtx: PlanContext = { ...ctx, levels };
    // ANAPHORA. "…, then furnish it" — the pronoun is the previous step's
    // subject. Two readings are resolved and the one that WORKS wins: the
    // literal clause first (so "make it white" keeps meaning the selection),
    // the substituted clause when the literal one misses or would refuse.
    // The substitution replaces a NOUN, never a verb: the clause already
    // carried its own imperative, so nothing here can manufacture the authority
    // to mutate (§FIX-CHAT-STOPWORD-CORRECTION's rule, applied to anaphora).
    const readings = [clause];
    if (i > 0 && subject !== null && CLAUSE_PRONOUN.test(clause)) {
      readings.push(clause.replace(CLAUSE_PRONOUN, subject));
    }
    let si: SemanticIntent | null = null;
    let fallback: SemanticIntent | null = null;
    for (const reading of readings) {
      const candidate = clauseIntent(reading, clauseCtx);
      if (candidate === null) continue;
      fallback ??= candidate;
      if (applySemanticIntent(candidate, clauseCtx).kind !== 'refusal') { si = candidate; break; }
    }
    // Keep the refusing reading when neither works: `applyPlan` then reports the
    // capability's OWN reason for step i, which is the honest answer.
    si ??= fallback;
    if (si === null) {
      // The tie-break (3): a capability that understands the whole sentence
      // answers better than a plan that understands most of it.
      if (singleLadderClaimsWhole(utterance, ctx)) return { kind: 'not-a-plan' };
      return {
        kind: 'refusal',
        reason:
          `${where} is not something I know how to do${CLAUSE_PRONOUN.test(clause) && subject === null ? ` — and I could not tell what "it" refers to` : ''}. ` +
          `Nothing in the plan was run.`,
        suggestions: [],
      };
    }
    if (si.intent === 'execute-plan') {
      return { kind: 'refusal', reason: `${where} is itself a plan — I run one plan at a time.`, suggestions: [] };
    }

    steps.push(si);
    kept.push(clause);
    const handover = stepHandover(si, ctx, levels);
    subject = handover.subject;
    if (handover.addedLevel !== null) levels = [...levels, handover.addedLevel];
  }

  return { kind: 'plan', intent: { intent: 'execute-plan', steps, clauses: kept } };
}

/**
 * The plan stage of the resolution ladder, as the editor bridge uses it: parse,
 * then hand the plan to `applySemanticIntent` (the single authority) exactly
 * like any other intent. Returns `null` when the utterance is not a plan, so
 * the caller falls through to its normal single-intent path unchanged.
 */
export function resolveCompoundUtterance(
  utterance: string,
  ctx: PlanContext,
): ZeroTokenResolution | null {
  const parsed = parsePlanIntent(utterance, ctx);
  if (parsed.kind === 'not-a-plan') return null;
  if (parsed.kind === 'refusal') {
    return {
      kind: 'refusal', intent: 'execute-plan',
      reason: parsed.reason, suggestions: parsed.suggestions,
    };
  }
  const applied = applySemanticIntent(parsed.intent, ctx);
  return applied.kind === 'refusal' ? applied : { ...applied, tier: 0 };
}
