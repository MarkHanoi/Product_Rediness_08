// LlmPlannerBridge — §PLANNER (RAC U10.2): wiring the planner as the LAST rung.
//
//   tier 0 grammar → tier 1 synonyms/typos → NL layer → **planner** → legacy
//
// WHAT THIS FILE IS. Three wires and nothing else: the relay (the editor's
// authed `apiFetch` to the server BFF), the availability probe, and the handoff
// of a VALIDATED intent back into `ZeroTokenChatBridge`'s own executor. It owns
// no grammar, no dispatch and no refusal copy — all three already exist, and a
// second copy of any of them here would be the two-sources-of-truth defect the
// capability registry exists to delete.
//
// TOKEN COST, STATED HONESTLY. This rung is reached only when tier 0, tier 1
// and the NL layer have all missed. A sentence any of them claims never gets
// here, and `zeroTokenLadderOrder.spec.ts` pins that so the cost cannot
// regress quietly. When the planner DOES answer, the reply says so — the
// "(resolved without AI tokens)" line the deterministic paths print would be a
// lie on a planned result, so it is rewritten on the way out.
//
// THE PRODUCTION TRUTH. This deploy carries neither CF_WORKER_URL nor
// ANTHROPIC_API_KEY, so `/api/anthropic/v1/messages` answers 500 and there is
// nothing to plan with. That is not an error to surface as a mystery — the rung
// is SKIPPED cleanly, and the availability probe is the same shipped
// `/api/health` `features.anthropic` read the PDF-import ladder uses
// (§PDF-BIM-TIER-LADDER), not a second opinion about the same fact.

import {
    applySemanticIntent,
    createCfWorkerRelay,
    planUtterance,
    type PlannerDeps,
    type PlannerOutcome,
    type ResolverContext,
    type SemanticIntent,
    type ZeroTokenResolution,
} from '@pryzm/ai-host';
import { apiFetch } from '@pryzm/core-app-model';
import {
    buildZeroTokenContext,
    runZeroTokenResolution,
    type ZeroTokenUiHooks,
} from './ZeroTokenChatBridge';
import { probeAiAvailability } from './floorplan-import/FPTiers';

/** The relay's model id. The SERVER forces its own `ANTHROPIC_MODEL_ID` on
 *  every proxied request (server.js `sanitizeAiBody`), so this is the label the
 *  cost meter reads, never a client choice of a premium snapshot. */
const PLANNER_MODEL = 'claude-haiku-4-5';

/** Small — the response is a JSON intent list, not prose. A larger cap would
 *  only buy the model room to explain itself, which the contract forbids. */
const PLANNER_MAX_TOKENS = 700;

/** The injected transport + configuration probe. Both are replaceable in tests
 *  and neither lives inside the pure `ai-host` planner. */
function plannerDeps(): PlannerDeps {
    return {
        async isConfigured(): Promise<boolean> {
            // 'unknown' (the health route unreachable) is deliberately NOT
            // treated as available: attempting the call would surface a network
            // failure as an AI failure. Three states, two behaviours, and the
            // user is told which one happened.
            return (await probeAiAvailability()) === 'available';
        },
        async complete(prompt): Promise<string> {
            // MUST be the authed apiFetch — the proxy route sits behind
            // authMiddleware and a plain fetch returns 401.
            const relay = createCfWorkerRelay(undefined, apiFetch);
            const res = await relay.complete({
                model: PLANNER_MODEL,
                system: prompt.system,
                user: prompt.user,
                maxTokens: PLANNER_MAX_TOKENS,
            });
            return res.text;
        },
    };
}

/** The sentence a deterministic tier prints, and the one a PLANNED result must
 *  print instead. Kept as constants because the attribution is now applied two
 *  ways (substitution, then append) and two spellings of it would be one more
 *  thing to desync. */
const ZERO_TOKEN_LINE = '(resolved without AI tokens)';
const PLANNER_ATTRIBUTION =
    '(the quick paths did not recognise this phrasing, so the AI planner read it — ' +
    'it produced the same kind of instruction you could have typed, and it was ' +
    're-checked before anything ran)';

/**
 * The deterministic tiers print "(resolved without AI tokens)". On a PLANNED
 * result that sentence is false, and the difference is exactly the thing the
 * founder is entitled to see, so it is rewritten here rather than duplicating
 * every summary-building site in the bridge.
 *
 * §FIX-PLANNER-ATTRIBUTION-HOLE. Substitution ALONE was not enough, and had
 * silently stopped being enough. `30b2e975` ("the engine was honest and the
 * last layer rendered Done") turned `DispatchOutcome` from a boolean triple
 * into a 5-arm union, and FOUR of those five arms — dispatch-failed, refused,
 * partial, indeterminate — say their piece WITHOUT the zero-token parenthetical
 * (correctly: none of them is a "Done" line). The substitution had nothing to
 * bite on, so from that commit onward a planner-sourced reply on any arm but
 * `applied` never told the user the AI planner had read their sentence — i.e.
 * the token-cost disclosure this file's header promises silently disappeared on
 * exactly the outcomes a user is most likely to question. The attribution is
 * therefore ATTACHED, not substituted: replaced in place when the zero-token
 * line is present, appended to the first line spoken when it is not, and never
 * repeated within one planned run.
 */
function plannedHooks(hooks: ZeroTokenUiHooks): ZeroTokenUiHooks {
    let attributed = false;
    return {
        confirm: (summary) => hooks.confirm(summary),
        say: (text) => {
            if (text.includes(ZERO_TOKEN_LINE)) {
                attributed = true;
                hooks.say(text.split(ZERO_TOKEN_LINE).join(PLANNER_ATTRIBUTION));
                return;
            }
            if (!attributed) {
                attributed = true;
                hooks.say(`${text} ${PLANNER_ATTRIBUTION}`);
                return;
            }
            hooks.say(text);
        },
    };
}

/** Turn a validated planner intent into the resolution the bridge executes. */
function toResolution(intent: SemanticIntent, ctx: ResolverContext): ZeroTokenResolution {
    // The SINGLE authority. A planned intent is applied by exactly the function
    // a typed sentence is applied by — same guards, same refusals, same
    // destructive flag (so the same Confirm card), same plan report.
    const applied = applySemanticIntent(intent, ctx);
    // A refusal carries no tier — it is the same shape either way (this is the
    // identical widening `resolveCompoundUtterance` performs for a plan).
    return applied.kind === 'refusal' ? applied : { ...applied, tier: 'nl' };
}

/** What the user is told when the planner had nothing to offer. Every branch
 *  says WHICH thing happened; none of them is silence. */
function reportNonAnswer(outcome: Exclude<PlannerOutcome, { kind: 'intent' }>, hooks: ZeroTokenUiHooks): boolean {
    switch (outcome.kind) {
        case 'unavailable':
            // Not handled: fall through to the legacy path, which may still
            // answer a read-only question. Nothing is said here, because
            // "no AI is configured" is only worth saying if nothing else
            // answers — and AIPanel says it there.
            return false;
        case 'cannot':
            hooks.say(
                `I read that as: ${outcome.understoodAs}. That is not something I can do in the model — ` +
                `nothing was changed.`,
            );
            return true;
        case 'rejected':
            hooks.say(
                outcome.understoodAs === null
                    ? `I could not turn that into something the editor can do — nothing was changed.`
                    : `I understood it as ${outcome.understoodAs}, but that isn't something I can do — ` +
                      `${outcome.reason}. Nothing was changed.`,
            );
            return true;
    }
}

/**
 * The planner rung. Returns true when the utterance was HANDLED (planned and
 * executed, refused, or answered with an honest "that isn't something I can
 * do"); false only when the caller should fall through to the legacy path.
 *
 * `false` covers exactly two cases: no AI upstream is configured (or the relay
 * failed), and an internal error. Neither is ever silent — the caller reports
 * the first, and the second is logged and falls through unchanged.
 */
export async function tryHandleWithPlanner(query: string, hooks: ZeroTokenUiHooks): Promise<boolean> {
    let ctx: ResolverContext;
    try {
        ctx = await buildZeroTokenContext();
    } catch (err) {
        console.error('[LlmPlannerBridge] could not build the resolver context:', err);
        return false;
    }
    let outcome: PlannerOutcome;
    try {
        outcome = await planUtterance(query, ctx, plannerDeps());
    } catch (err) {
        console.error('[LlmPlannerBridge] planner failed, falling through:', err);
        return false;
    }
    if (outcome.kind !== 'intent') return reportNonAnswer(outcome, hooks);
    try {
        await runZeroTokenResolution(toResolution(outcome.intent, ctx), ctx, plannedHooks(hooks));
        return true;
    } catch (err) {
        console.error('[LlmPlannerBridge] planned intent failed to execute:', err);
        hooks.say('I understood that, but it failed while running — nothing may have changed. Please check and try again.');
        return true;
    }
}

/** Was an AI upstream configured at all? The panel uses this to explain a
 *  fall-through honestly instead of leaving the user with a bare "not sure". */
export async function plannerIsConfigured(): Promise<boolean> {
    try {
        return await plannerDeps().isConfigured();
    } catch {
        return false;
    }
}
