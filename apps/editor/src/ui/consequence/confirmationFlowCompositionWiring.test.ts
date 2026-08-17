// @vitest-environment happy-dom
/**
 * §B.4 — THE DECIDING LAYER, not the computing one.
 *
 * ════ WHY THIS FILE EXISTS BESIDE ConfirmationFlowTypedRefusal.test.ts ═════════════════
 * That suite proves `ConfirmationFlow` can TELL the four causes apart. It builds the flow
 * itself, so it proves a capability — and a capability is not a behaviour. This suite drives
 * `getConfirmationFlow()`, the module singleton the browser is actually handed, composed by
 * the production file from the production registries.
 *
 * ⭐ The distinction is not pedantic here; it is the whole defect. Until this commit,
 * `confirmationFlowComposition.ts` passed the flow a NORMALISING FUNCTION —
 * `normalize: (c) => normalizeConsequenceCommand(c)` — which folds the registry lookup and the
 * rule call into one `?.() ?? null`. That signature has ALREADY destroyed the distinction
 * between "no rule is registered for this verb" (N1, a statement about PRYZM's coverage) and
 * "a rule ran and rejected this payload" (N2/N3, a statement about the CALLER). A perfectly
 * typed `ConfirmationFlow` composed with that callback would have shipped four causes as one
 * value, with a green unit suite: the deciding layer kept its own copy of the inputs, and the
 * copy was lossy. Nothing in the unit suite could see it, because the unit suite supplies its
 * own registry.
 *
 * So the assertions below are made against the singleton, through no injection of any kind.
 *
 * ════ WHAT IS REAL HERE AND WHAT IS NOT — declared, not implied ════════════════════════
 * REAL: `CONSEQUENCE_NORMALIZERS` (every rule, every verb spelling), `createConsequencePlanners()`
 * (all seven families), `buildPlanningContext()` over the live `storeRegistry`, the production
 * `ConfirmationCard`, and the production `ConfirmationFlow`.
 * NOT REAL: the bus. It is a double, and it is never reached — every assertion below is on the
 * REFUSAL path, which by construction executes nothing (that is what makes it a refusal). The
 * EXECUTING path is certified separately, against the real bus and the real wall handler, by
 * `tools/rac-conformance/certification/gates/check-approval-binding.ts` (G-REASON-05).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsequencePlan } from '@pryzm/command-bus';
import {
    __resetConfirmationFlowForTests,
    getConfirmationCard,
    getConfirmationFlow,
} from './confirmationFlowComposition.js';
import { renderConfirmationRefusal } from './ConfirmationCard.js';
import type { ApprovalStaleRefusal } from './ConfirmationFlow.js';

/** A bus that would record a dispatch if one ever happened. None does — see the header. */
function spyBus(): { executeCommand: (t: string, p: unknown) => Promise<unknown>; calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        executeCommand: async (t: string) => { calls.push(t); return undefined; },
    };
}

describe('§B.4 — the PRODUCTION composition hands over the REGISTRY, not a collapsing callback', () => {
    beforeEach(() => { __resetConfirmationFlowForTests(); });

    it('N1 — a verb no rule normalises refuses as UNSUPPORTED_ELEMENT_TYPE / no-normalizer-for-verb', async () => {
        const bus = spyBus();
        const req = await getConfirmationFlow(bus as never).request({
            type: 'roof.move',
            payload: { id: 'r1' },
        });

        expect(req.kind).toBe('refused');
        if (req.kind !== 'refused') return;
        expect(req.refusal.reason).toBe('UNSUPPORTED_ELEMENT_TYPE');
        expect(req.refusal.subReason).toBe('no-normalizer-for-verb');
        // The typed fact reaches the sentence a human reads, and that sentence denies the
        // reading the old blanket message invited.
        expect(req.refusal.message).toContain('UNSUPPORTED_ELEMENT_TYPE');
        expect(req.refusal.message).toContain('NOT a claim that the operation would change nothing');
        // A refusal executes nothing. Stated because "refused" and "silently dispatched" would
        // otherwise both look like "no card appeared".
        expect(bus.calls).toEqual([]);
    });

    it('N2/N3 — a LIVE verb with a malformed payload refuses as INVALID_REQUEST, with no capability sub-reason', async () => {
        const bus = spyBus();
        // `wall.updateBaseline` IS normalised (it is the live wall-move verb, L-49) and IS
        // planned (the `wall.move` family is composed). Only the payload is unusable — a fact
        // about the caller, and the one cause of the four that is not a PRYZM fault.
        const req = await getConfirmationFlow(bus as never).request({
            type: 'wall.updateBaseline',
            payload: {},
        });

        expect(req.kind).toBe('refused');
        if (req.kind !== 'refused') return;
        expect(req.refusal.reason).toBe('INVALID_REQUEST');
        expect(req.refusal.subReason).toBeUndefined();
        expect(req.refusal.detail).toContain('malformed');
        expect(bus.calls).toEqual([]);
    });

    /**
     * ⭐ THE LOAD-BEARING ASSERTION OF THIS FILE. Every other test here would still pass
     * against the OLD composition callback, because each checks one case in isolation and the
     * old callback returned `null` — one value — for both. This one cannot: it asserts that the
     * production singleton produces DIFFERENT values for the two, which is precisely what a
     * `(command) => semantic | null` callback makes impossible no matter how the flow is typed.
     */
    it('DISCRIMINATION — through the singleton, N1 and N2/N3 are DIFFERENT values', async () => {
        const flow = getConfirmationFlow(spyBus() as never);

        const n1 = await flow.request({ type: 'roof.move', payload: { id: 'r1' } });
        const n23 = await flow.request({ type: 'wall.updateBaseline', payload: {} });
        if (n1.kind !== 'refused' || n23.kind !== 'refused') {
            throw new Error(`expected both to refuse; got '${n1.kind}' and '${n23.kind}'`);
        }

        expect(n1.refusal.reason).not.toBe(n23.refusal.reason);
        expect(n1.refusal.message).not.toBe(n23.refusal.message);
    });

    /**
     * CONTROL — the singleton is not a flow that refuses everything.
     *
     * A well-formed `wall.updateBaseline` over the LIVE (empty) store reaches the real
     * `wall.move` planner. What comes back is deliberately NOT asserted as `pending`: with no
     * wall in the registry the planner may legitimately answer either way, and pinning its
     * verdict here would make this file a test of the planner. What IS asserted is that the
     * four-cause refusal path is not what happens — the request either plans, or refuses for a
     * reason that is NOT one of the three coverage/caller causes above.
     */
    it('CONTROL — a well-formed dispatch is not refused by the FOUR-CAUSE path', async () => {
        const req = await getConfirmationFlow(spyBus() as never).request({
            type: 'wall.updateBaseline',
            payload: {
                wallId: 'w1',
                newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
                prevBaseLine: [{ x: 0, y: 0, z: 1 }, { x: 5, y: 0, z: 1 }],
            },
        });

        if (req.kind === 'refused') {
            // Reaching the planner and having it throw (N5) is a real outcome in a bare test
            // world; being turned away at the normaliser or the registry is not, and would mean
            // the production wiring is broken.
            expect(req.refusal.reason).not.toBe('UNSUPPORTED_ELEMENT_TYPE');
            expect(req.refusal.reason).not.toBe('INVALID_REQUEST');
            expect(req.refusal.reason).not.toBe('ENGINE_NOT_AVAILABLE');
        } else {
            expect(req.plan.command.type).toBe('wall.move');
        }
    });
});

// ─── The LAST deciding layer: the sentence on the screen ───────────────────────────────

/**
 * ⭐ §B.4 / C78 §9.3 — THE HEADING IS A CLAIM, AND IT WAS A FALSE ONE.
 *
 * `renderConfirmationRefusal` opened with the literal `APPROVAL REFUSED — THE PLAN IS STALE`
 * for EVERY refusal the flow could produce. A typed `ConfirmationFlow` underneath changes
 * nothing about what the user reads, and what the user reads is where the inference actually
 * gets made: told "the plan is stale", an architect goes looking for the collaborator who
 * moved the wall. For `APPROVAL_UNKNOWN_PLAN` that heading is merely wrong; for the arm where
 * the confirm-time re-plan could not be COMPUTED it is the §9.3 defect itself — a capability
 * gap reported as a measurement of the world.
 */
describe('§B.4 / C78 §9.3 — the CARD says which refusal happened, and never claims staleness it did not measure', () => {
    beforeEach(() => { __resetConfirmationFlowForTests(); });

    it('an APPROVAL_UNKNOWN refusal reaches the PRODUCTION card, and it does not say "THE PLAN IS STALE"', async () => {
        const flow = getConfirmationFlow(spyBus() as never);
        // Nothing is pending, so any hash is a plan this flow is not holding.
        const outcome = await flow.confirm('a-hash-nobody-showed');
        expect(outcome.kind).toBe('approval-unknown');

        const html = getConfirmationCard()?.element.innerHTML ?? '';
        expect(html).toContain('THAT IS NOT THE PLAN ON SCREEN');
        // ⭐ The claim that was printed for this case and never held.
        expect(html).not.toContain('THE PLAN IS STALE');
    });

    it('an UNVERIFIABLE re-plan renders as unverifiable — typed reason shown, staleness NOT claimed', () => {
        const panel = document.createElement('div');
        const approved = { planHash: 'h-approved', stateHash: 's-approved', changed: ['w1'] } as unknown as ConsequencePlan;
        const refusal: ApprovalStaleRefusal = {
            kind: 'APPROVAL_STALE',
            approvedPlanHash: 'h-approved',
            livePlanHash: 'h-approved',
            approvedStateHash: 's-approved',
            liveStateHash: 's-approved',
            liveVerification: { kind: 'unverifiable', reason: 'PLANNER_THREW', detail: 'the store view vanished' },
            replan: approved,
            message: 'Your approval could not be RE-VERIFIED — PLANNER_THREW (the store view vanished).',

        };

        renderConfirmationRefusal(panel, refusal.message, approved, refusal);

        expect(panel.innerHTML).toContain('COULD NOT BE RE-VERIFIED');
        expect(panel.innerHTML).toContain('PLANNER_THREW');
        expect(panel.innerHTML).not.toContain('THE PLAN IS STALE');
        // The re-offered plan is the one already approved, so it must not be announced as new.
        expect(panel.innerHTML).not.toContain('the NEW plan');
        // …and the way through must still be on the panel (C83 §10.6.7): a refusal with no
        // action left is a dead end, and dead ends teach people to click past warnings.
        expect(panel.innerHTML).toContain('data-role="confirm"');
        expect(panel.innerHTML).toContain('h-approved');
    });

    it('CONTROL — a VERIFIED stale refusal still says THE PLAN IS STALE (so the arm above is a decision)', () => {
        const panel = document.createElement('div');
        const replan = { planHash: 'h-moved', stateHash: 's-moved', changed: ['w1'] } as unknown as ConsequencePlan;
        const refusal: ApprovalStaleRefusal = {
            kind: 'APPROVAL_STALE',
            approvedPlanHash: 'h-approved',
            livePlanHash: 'h-moved',
            approvedStateHash: 's-approved',
            liveStateHash: 's-moved',
            liveVerification: { kind: 'verified' },
            replan,
            message: 'The model changed while this was on screen.',
        };

        renderConfirmationRefusal(panel, refusal.message, replan, refusal);

        expect(panel.innerHTML).toContain('THE PLAN IS STALE');
        expect(panel.innerHTML).toContain('the NEW plan');
    });
});
