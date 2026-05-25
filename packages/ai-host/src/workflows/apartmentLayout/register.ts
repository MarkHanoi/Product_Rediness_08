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
import type { ScoredLayoutOption } from './types.js';
import {
    apartmentLayoutDescriptor,
    createApartmentLayoutImpl,
    type ApartmentLayoutDeps,
} from './workflow.js';
import { createStoreShellReader, type ShellReaderDeps } from './shellReader.js';

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

// ── A5.3 — the registration ROOT ──────────────────────────────────────────────
//
// The single composition the runtime/editor invokes: narrows the AiPlane off the
// loaded host, guards idempotency, assembles the store-backed shellReader, and
// registers. It composes every A4/A5 piece (shellReader + workflow + plane
// binding) so the call site (composeRuntime AI slot / editor bootstrap) is a thin
// pass-through of injected accessors. The heavy store/service accessors
// (getWall via storeRegistry, getOrientation via FacadeOrientationService) are
// INJECTED from L5 — keeps ai-host + the P1 composition root dep-clean.

/** A plane with the bits this root needs (structural — the real AiPlane fits). */
export interface PlaneLike extends WorkflowRegistrarLike {
    readonly workflowRegistry?: { has(id: string): boolean };
}

export interface ApartmentLayoutRegistrationDeps {
    /** The loaded AiHost; its `.plane` is used (no-op when absent — i.e. when
     *  the host was created without an approvalQueue, so no plane exists). */
    readonly host: { readonly plane?: unknown } | null | undefined;
    /** AIStore setter — LayoutOptionsStore.setLayouts. */
    readonly setPendingLayouts: (runId: string, options: readonly ScoredLayoutOption[]) => void;
    /** Cross-cutting event emit (runtime.events). */
    readonly emit?: (event: string, payload: unknown) => void;
    /** Wall-store accessor (editor supplies via storeRegistry). */
    readonly getWall: ShellReaderDeps['getWall'];
    /** SL-3 orientation accessor (editor supplies via FacadeOrientationService). */
    readonly getOrientation?: ShellReaderDeps['getOrientation'];
    /** Relay override (defaults to MockAnthropicRelay — SPEC-47 §7). */
    readonly relay?: RelayPorter;
}

export interface ApartmentLayoutRegistrationResult {
    readonly registered: boolean;
    readonly workflowId: string | null;
    /** Why registration was skipped (no plane / already registered). */
    readonly reason?: string;
}

/**
 * Register the apartment-layout workflow onto the loaded host's plane. Idempotent
 * + defensive: returns `{ registered:false, reason }` (never throws) when there
 * is no plane or the workflow is already registered.
 */
export function createApartmentLayoutRegistration(
    deps: ApartmentLayoutRegistrationDeps,
): ApartmentLayoutRegistrationResult {
    const plane = (deps.host?.plane ?? null) as PlaneLike | null;
    if (!plane || typeof plane.registerWorkflow !== 'function') {
        return { registered: false, workflowId: null, reason: 'no AiPlane on host (approvalQueue not wired)' };
    }
    if (plane.workflowRegistry?.has?.(APARTMENT_LAYOUT_WORKFLOW_ID)) {
        return { registered: false, workflowId: APARTMENT_LAYOUT_WORKFLOW_ID, reason: 'already registered' };
    }

    const shellReader = createStoreShellReader({
        getWall: deps.getWall,
        ...(deps.getOrientation ? { getOrientation: deps.getOrientation } : {}),
    });

    const id = registerApartmentLayoutWorkflow(plane, {
        shellReader,
        setPendingLayouts: deps.setPendingLayouts,
        ...(deps.emit ? { emit: deps.emit } : {}),
        ...(deps.relay ? { relay: deps.relay } : {}),
    });
    return { registered: true, workflowId: id };
}
