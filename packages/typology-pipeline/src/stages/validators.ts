// A.1 (Phase A · Sprint 1) — Stage 5 helpers: validators.
//
// Stage 5 runs typology-specific SPATIAL VALIDATORS on the plan emitted
// by Stage 4.  These are the "is this layout legal?" checks that gate
// the plan before it becomes a sequence of editor commands.
//
// Apartment pack validators (per docs/03-execution/plans/apartment/
// dimensional-constraints.md):
//   - bathroom-corridor-only (a bathroom MUST be reachable through a
//     corridor, not directly through a bedroom — except ensuite)
//   - door-presence (every room except open-plan MUST have a door)
//   - window-presence (every habitable room MUST have a window — L5)
//   - circulation gate (every room MUST be reachable from the front door)
//   - dimensional gates (10 G-classes per APARTMENT-DIMENSIONAL-CONSTRAINTS)
//
// This file ships ONLY the validator-orchestration helper — the
// validators themselves live in the pack's own package
// (`packages/typology-pack-apartment/src/validators/`).

import type { GeneratedPlan } from '../types.js';

/**
 * A validator: takes a plan + constraints, returns `null` if it passes
 * or a violation message if it fails.
 */
export type SpatialValidator = (
    plan: GeneratedPlan,
    constraints: Record<string, unknown>,
) => string | null;

export interface ValidationReport {
    readonly violations: readonly string[];
    readonly checkedCount: number;
}

/**
 * Run an array of validators in sequence; collect every violation.
 * Returns a report — the caller's Stage 5 handler decides whether to
 * fail-soft (return `ok: false`) or pass with warnings (return the plan
 * + log the violations).
 */
export function runValidators(
    validators: readonly SpatialValidator[],
    plan: GeneratedPlan,
    constraints: Record<string, unknown>,
): ValidationReport {
    const violations: string[] = [];
    for (const v of validators) {
        const msg = v(plan, constraints);
        if (msg) violations.push(msg);
    }
    return { violations, checkedCount: validators.length };
}
