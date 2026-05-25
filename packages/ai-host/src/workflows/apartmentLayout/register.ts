// Apartment Layout Generator — AiPlane registration (SPEC §16, step A4-register).
//
// The single binding unit: registers `apartmentLayoutDescriptor` + the
// `createApartmentLayoutImpl` impl onto a live AiPlane's WorkflowRegistry, so a
// `plane.submit({ workflow: APARTMENT_LAYOUT_WORKFLOW_ID, ... })` runs the real
// generation pipeline (budget gate → relay → validate → score → AIStore + event).
//
// The relay defaults to the shared MockAnthropicRelay (SPEC-47 §7) until the CF
// Worker adapter ships (S52 D3); the caller (editor, at A5) supplies the live
// `shellReader`, `setPendingLayouts`, and `emit` deps. Everything is injected so
// the binding is exercisable end-to-end against a real AiPlane in tests with no
// live AI, no DOM, and no editor stores — the mock relay returns a deterministic
// layout fixture so the in-process path yields scored options.

import { MockAnthropicRelay } from '../../AnthropicRelay.js';
import type { RelayPorter } from '../../AnthropicRelay.js';
import type { WorkflowDescriptor, WorkflowImpl } from '../../types.js';
import {
    apartmentLayoutDescriptor,
    createApartmentLayoutImpl,
    type ApartmentLayoutDeps,
} from './workflow.js';

/** The workflow id callers pass to `plane.submit({ workflow })`. */
export const APARTMENT_LAYOUT_WORKFLOW_ID = apartmentLayoutDescriptor.id;

/** Minimal structural surface this binding needs from the AiPlane —
 *  keeps the registration decoupled from the concrete `AiPlane` class
 *  (porter pattern), so it is testable against any registry-like host. */
export interface WorkflowRegistrarLike {
    registerWorkflow(descriptor: WorkflowDescriptor, impl: WorkflowImpl): void;
}

/** Registration deps: identical to the impl deps, but `relay` is
 *  OPTIONAL — it defaults to the MockAnthropicRelay (SPEC-47 §7). */
export type ApartmentLayoutRegisterDeps = Omit<ApartmentLayoutDeps, 'relay'> & {
    readonly relay?: RelayPorter;
};

/**
 * Bind the apartment-layout workflow onto a live AiPlane.
 *
 * @returns the registered workflow id (so callers can immediately
 *          `plane.submit({ workflow: <returned id> })`).
 * @throws  if the id is already registered (WorkflowRegistry is loud on
 *          collision — registration is idempotent only if guarded by the
 *          caller).
 */
export function registerApartmentLayoutWorkflow(
    plane: WorkflowRegistrarLike,
    deps: ApartmentLayoutRegisterDeps,
): string {
    const relay = deps.relay ?? new MockAnthropicRelay();
    plane.registerWorkflow(apartmentLayoutDescriptor, createApartmentLayoutImpl({ ...deps, relay }));
    return APARTMENT_LAYOUT_WORKFLOW_ID;
}
