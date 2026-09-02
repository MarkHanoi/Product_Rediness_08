/**
 * activeComponentPlacement — Lane U1 (§COMPONENT-PLACE-TOOL) · UIUX-PLAN §U1 ·
 * ADR-0376 D5/D9/D10 · C111 §1.1-a · C16 CA-21.
 *
 * The surface-independent single source of truth for WHAT the Component place
 * tool places next: the `(definitionId, typeId)` pair the user chose in the
 * Component browser, plus the definition's semver recorded as provenance.
 *
 * ⭐ WHY A STORE AND NOT A FIELD ON A TOOL — the `activeBalconyPlacement.ts`
 * lesson, applied before it bites (L-239/L-240/L-243/L-246/L-251/L-255/L-260,
 * enumerated in `elementCreationMatrix.ts`): a selection stored on ONE surface's
 * tool instance is invisible to the other surface. There are TWO live create
 * surfaces (`CreatePanelLayout`, `CreateRailPanel` — L-1380) and both plan
 * overlays get their OWN `ComponentPlanToolHandler` instance from the shared
 * registry (L-73 state isolation), so the chosen pair lives HERE, below all of
 * them, and every handler instance reads the identical truth.
 *
 * ⚠ IDs are NOT validated here. `component.place` owns the `fam_`/`typ_` ULID
 * refusals (C111 §1.1-a) and the catalogue-membership refusals (lane U0); a
 * second validator in front of the bus would be a rival refusal channel. This
 * store carries the user's choice; the bus judges it.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('@pryzm/editor.active-component-placement', '0.1.0');

export interface ActiveComponentPlacement {
    /** `.pryzm-family` manifest id (`fam_` + ULID) of the chosen definition. */
    readonly definitionId: string;
    /** The chosen type within that definition (`typ_` + ULID). */
    readonly typeId: string;
    /** The definition's semver at selection time — provenance only (it pins nothing). */
    readonly definitionVersion?: string;
    /** Display strings for the plan-preview label — NEVER dispatched. */
    readonly definitionName?: string;
    readonly typeName?: string;
}

let _active: ActiveComponentPlacement | null = null;

/** Record the pair the Component browser's "Place" chose. */
export function setActiveComponentPlacement(sel: ActiveComponentPlacement): void {
    _tracer.startActiveSpan('pryzm.component_placement.set_active', (span) => {
        span.setAttribute('pryzm.component.definition_id', sel.definitionId);
        span.setAttribute('pryzm.component.type_id', sel.typeId);
        _active = sel;
        span.end();
    });
}

/**
 * The pair the NEXT plan click will place, or `null` when nothing is chosen.
 * `null` is an answer, not an error — the handler refuses BY NAME on it
 * ([[context-data-honesty-family]]).
 */
export function getActiveComponentPlacement(): ActiveComponentPlacement | null {
    return _active;
}

/** Clear on tool put-down / project close, so a stale pair can never place. */
export function clearActiveComponentPlacement(): void {
    _tracer.startActiveSpan('pryzm.component_placement.clear_active', (span) => {
        _active = null;
        span.end();
    });
}
