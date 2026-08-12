/**
 * confirmationFlowComposition — the COMPOSITION SITE for the R6 confirmation flow.
 *
 * Same split, same reason as the R2/R3/R4 composition files: `ConfirmationFlow` takes every
 * collaborator by injection and imports only types, so the flow can be certified window-free;
 * THIS file is the one that reaches for production singletons (the live planner, the live
 * store registry, the DOM card).
 *
 * ── THE PRODUCTION SEAM, AND WHAT IT IS HONESTLY WORTH ────────────────────────────────
 * `requestWallMoveConfirmation()` below is what a tool handler calls when a gesture FINISHES.
 * It mints a FRESH plan over CURRENT state, classifies it, and either returns
 * `autoProceed` (policy `none` — the caller dispatches normally, no nagging) or shows the card
 * and waits for a decision bound to that plan's hash.
 *
 * MEASURED STATUS, stated the way the R4 composition file states its own: this factory is
 * REACHABLE and is CALLED by MovePlanToolHandler's wall-move commit. Whether a human dragging
 * a wall in a live browser sees the card has NOT been observed by this phase — the flow, the
 * policy, the binding and the card are proven by the certification gate
 * (`check-approval-binding`, G-REASON-05) driving the production modules over the real bus and
 * the real handler. LIVE-UNPROVEN is the honest word for the browser half, and it is written
 * here rather than left for someone to assume.
 *
 * The flow is a module-level singleton because the CARD is: exactly one confirmation may be
 * outstanding at a time, and that is a property of the screen, not a convenience. Two flows
 * would mean two pending plans and an approval that could bind to either.
 */

import type { ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import type { PreviewCommand } from '@app/engine/consequence/ConsequencePreviewService';
import { normalizeToWallMove } from '@app/engine/consequence/ConsequencePreviewService';
import type { WallMoveCommand } from '@app/engine/consequence/WallMoveConsequencePlanner';
import { createWallMoveConsequencePlanner } from '@app/engine/consequence/wallMovePlannerComposition';
import { buildPlanningContext } from '@app/engine/consequence/consequencePreviewServiceComposition';
import { createConsequenceExecutionServiceWithReportView } from '@app/engine/consequence/consequenceExecutionServiceComposition';
import type { ConsequenceDispatcher } from '@app/engine/consequence/ConsequenceExecutionService';
import {
    ConfirmationFlow,
    type ConfirmationRequest,
    type ConfirmationOutcome,
} from './ConfirmationFlow.js';
import { ConfirmationCard } from './ConfirmationCard.js';

let _flow: ConfirmationFlow | null = null;
let _card: ConfirmationCard | null = null;

/**
 * Build (once) the production confirmation flow over the live bus.
 *
 * The bus is a PARAMETER, not an import — the live `CommandBus` is owned by `composeRuntime`
 * (P1, another phase's territory), and taking it as an argument keeps this file free of any
 * runtime-acquisition path that could rival the single composition root.
 */
export function getConfirmationFlow(bus: ConsequenceDispatcher): ConfirmationFlow {
    if (_flow) return _flow;

    const planners = new Map<string, ConsequencePlanner<WallMoveCommand>>();
    planners.set('wall.move', createWallMoveConsequencePlanner());

    // The R4 executor with the R5 report view as its sink: confirming a plan therefore ends
    // in a rendered predicted-vs-actual report. Confirm and report are the same loop.
    const { service } = createConsequenceExecutionServiceWithReportView(bus);

    const card = new ConfirmationCard();
    _card = card;

    const flow = new ConfirmationFlow({
        planners: planners as unknown as ReadonlyMap<string, ConsequencePlanner<never>>,
        normalize: (c: PreviewCommand) => normalizeToWallMove(c),
        context: (): PlanningContext => buildPlanningContext(),
        executor: service,
        prompt: card,
    });

    // The card's confirm button hands back the hash IT was rendered with; the flow refuses
    // any hash that is not the pending plan's. That pairing is the whole binding.
    card.setHandlers(
        (approvedPlanHash: string) => {
            void flow.confirm(approvedPlanHash, {
                actor: { kind: 'human' },
                origin: { surface: 'plan-tool' },
            });
        },
        () => { flow.cancel(); },
    );

    _flow = flow;
    return flow;
}

/** The live card, when one has been composed — exposed for tests and diagnostics. */
export function getConfirmationCard(): ConfirmationCard | null {
    return _card;
}

/**
 * THE PRODUCTION ENTRY POINT for a finished gesture. Returns the request so the caller can
 * read `autoProceed` — R6 point 5: an operation below the confirmation threshold must not be
 * nagged about, and the CALLER learns that from DATA rather than from the card's silence.
 */
export async function requestWallMoveConfirmation(
    bus: ConsequenceDispatcher,
    command: PreviewCommand,
): Promise<ConfirmationRequest> {
    return getConfirmationFlow(bus).request(command);
}

/**
 * Execute a plan the flow already minted, without a card — the `autoProceed` path. The plan is
 * still BOUND (the executor re-verifies its hash at dispatch), so "no confirmation" never
 * means "no prediction": the report still reconciles predicted-vs-actual.
 */
export async function proceedWithoutConfirmation(
    bus: ConsequenceDispatcher,
    approvedPlanHash: string,
): Promise<ConfirmationOutcome> {
    return getConfirmationFlow(bus).confirm(approvedPlanHash, {
        actor: { kind: 'human' },
        origin: { surface: 'plan-tool' },
    });
}

/** Test seam — drop the singletons so a suite can compose a fresh flow. */
export function __resetConfirmationFlowForTests(): void {
    _flow = null;
    _card = null;
}
