// §RESI-ORCH-TARGET-AREA (lane RESI-ORCH, 2026-09-04) — the session slot holding the user's
// proposed ground-floor plate, and the push channel that gets it onto the ground.
//
// Split from `targetFootprintAreaSolver.ts` deliberately: the solver is a pure function that a test
// can hammer with a thousand rings, and it must stay reachable without a store existing. This file
// is the only stateful half, and it is the same shape as `envelopeVisibility.ts` and
// `siteGeometryHighlight.ts` next door — a control WRITES, surfaces SUBSCRIBE and repaint
// themselves. That is what makes *"the panel changed the value but the scene never heard"*
// structurally impossible here rather than a branch someone remembered to write.
//
// ⛔ SESSION-ONLY, NOT PERSISTED, AND THAT IS A DECISION. The §MANUALENV159 typed HEIGHT persists
// (`userSuppliedStudyHeightState.ts`) because it stands in for a MISSING MEASUREMENT — without it
// the project has no height at all, and losing it on reload loses the only answer there was. A
// target ground-floor area is the opposite: it is an EXPLORATION inside a determination the project
// already has. Restoring it silently on next load would put a proposal on the ground that nobody in
// this session asked for, sitting inside a permitted footprint it was solved against — possibly a
// footprint that has since been re-solved. An exploration that outlives the explorer is a claim.
//
// PURE except for one module-local slot and a listener set. No DOM, no THREE, no I/O.

import { trace } from '@opentelemetry/api';
import type { TargetFootprintProposal } from './targetFootprintAreaSolver';

const _tracer = trace.getTracer('pryzm.site.targetFootprintAreaState');

type Listener = () => void;

const listeners = new Set<Listener>();

/** `null` ⇒ the user has proposed nothing and only the permitted footprint is on the ground. */
let proposal: TargetFootprintProposal | null = null;

/**
 * §USE-THIS-PLATE-KEEPS-THE-LOOP (L-13078, founder 2026-09-07: *"when I click 'use this plate' I
 * want to still be kept on the massing options — so that I can select another one"*) — WHICH
 * generated option the live proposal came from, or `null` when it came from anywhere else.
 *
 * ⛔ IT IS A SECOND SLOT, NOT A FIELD ON `TargetFootprintProposal`, and that is deliberate. A
 * proposal is also produced by the TYPED-AREA solver, which knows nothing about massing options
 * and would have to carry a permanently-null id; and `adoptProposalAsEnvelope` reads the
 * proposal as geometry. The option id is a fact about the CHOICE, not about the plate — so it
 * lives beside the plate and travels with the same write.
 *
 * ⭐ IT CANNOT GO STALE, BECAUSE IT IS WRITTEN BY THE SAME FUNCTION THAT WRITES THE PLATE. Every
 * existing caller passes no second argument and therefore CLEARS it — typing an area, or the
 * staleness gate withdrawing the proposal, both leave no chosen option marked. There is no seam
 * at which a card could show "chosen" against a plate the user did not choose.
 */
let chosenOptionId: string | null = null;

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][target-area] §RESI-ORCH-TARGET-AREA listener threw (non-fatal):', e);
        }
    }
}

/** THE ONE READ. */
export function getTargetFootprintProposal(): TargetFootprintProposal | null {
    return proposal;
}

/**
 * THE ONE WRITE. Pass `null` to withdraw the proposal.
 *
 * ⛔ ONLY AN `ok` PROPOSAL MAY BE STORED — the type says so, and it is not an accident. A REFUSAL is
 * a sentence for the user to read, never a thing to draw: storing one here would invite a renderer
 * to ask "what shape does a refusal have?", and the answer it would invent is exactly the shape the
 * refusal exists to withhold.
 */
export function setTargetFootprintProposal(
    next: TargetFootprintProposal | null,
    /**
     * §USE-THIS-PLATE-KEEPS-THE-LOOP — the generated massing option this plate came from.
     * DEFAULTS TO NULL so every caller that does not choose an option clears the mark rather
     * than inheriting the previous one (see `chosenOptionId`'s note).
     */
    chosenId: string | null = null,
): void {
    const span = _tracer.startSpan('pryzm.site.setTargetFootprintProposal');
    try {
        if (proposal === next && chosenOptionId === chosenId) return;
        proposal = next;
        // ⛔ A CHOSEN ID WITHOUT A PLATE IS NOT A STATE. Withdrawing the proposal withdraws the
        // mark with it, so no surface can render "chosen" beside nothing.
        chosenOptionId = next === null ? null : chosenId;
        span.setAttribute('pryzm.targetFootprint.present', next !== null);
        span.setAttribute('pryzm.targetFootprint.chosenOption', chosenOptionId ?? 'none');
        notify();
    } finally {
        span.end();
    }
}

/**
 * THE ONE READ of the choice. `null` ⇒ the live plate did not come from a generated option (it
 * was typed, or there is no plate at all).
 *
 * ⚠ NOT STALENESS-GATED ON ITS OWN. Ask `resolveLiveTargetFootprintProposal` FIRST, exactly as
 * every surface already does for the plate: a mark rendered beside a withdrawn plate would be
 * the §VERIFICATION-ARTIFACT-CAN-PREDATE-SUBJECT shape wearing a tick.
 */
export function getChosenMassingOptionId(): string | null {
    return chosenOptionId;
}

/** Subscribe a surface. Returns its own unsubscribe. */
export function subscribeTargetFootprintProposal(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/**
 * Drop the proposal because the thing it was solved AGAINST changed.
 *
 * ⚠ CALL THIS WHENEVER THE ENVELOPE OR THE PARCEL MOVES. A plate solved inside a 92 m² permitted
 * footprint is not a proposal about a re-solved 61 m² one — it is a drawing of a claim that has
 * been withdrawn. Silence here is how a stale study outlives the determination that justified it.
 */
export function clearTargetFootprintProposal(): void {
    setTargetFootprintProposal(null);
}

/** Test-only reset — clears the slot and drops every subscriber. */
export function __resetTargetFootprintProposalForTests(): void {
    proposal = null;
    chosenOptionId = null;
    listeners.clear();
}

/**
 * THE STALENESS GATE, and it is the reason this module has a function beyond get/set.
 *
 * ⛔ A PROPOSAL OUTLIVES NOTHING. It was solved INSIDE a specific permitted footprint and its whole
 * meaning is *"this fits in that"*. The moment the envelope is re-solved — a re-check, a manual
 * admin zone, a different rule pack, a redrawn parcel — the plate on the ground is a drawing of a
 * claim that has been withdrawn, and it looks exactly like a live one. That is the
 * §VERIFICATION-ARTIFACT-CAN-PREDATE-SUBJECT shape in geometry: an artefact older than its subject
 * proves nothing, and here it actively misleads.
 *
 * Every surface that renders the proposal asks THIS, never `getTargetFootprintProposal` directly,
 * so the card and the scene cannot disagree about whether the plate is still valid. Self-healing on
 * READ rather than a subscription to every mutation seam: there are ~20 `computeBuildableEnvelope`
 * call sites in `siteDispatch.ts`, and a rule that must be remembered at twenty seams is a rule
 * that will be forgotten at one.
 *
 * @param permittedAreaM2 the CURRENT permitted footprint area, or null when there is none.
 */
export function resolveLiveTargetFootprintProposal(
    permittedAreaM2: number | null,
): TargetFootprintProposal | null {
    const current = proposal;
    if (current === null) return null;
    if (permittedAreaM2 === null || !Number.isFinite(permittedAreaM2) || permittedAreaM2 <= 0) {
        clearTargetFootprintProposal();
        return null;
    }
    // 0.5 m² — below any planning decision, comfortably above the float wobble of two different
    // routes to the same shoelace sum.
    if (Math.abs(permittedAreaM2 - current.permittedAreaM2) > 0.5) {
        clearTargetFootprintProposal();
        return null;
    }
    return current;
}
