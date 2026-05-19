/**
 * ValidateBucket — VALIDATE lifecycle bucket setup.
 *
 * Layer Affected:    UI — Data Workbench › Validate Bucket
 * File:             src/ui/dataworkbench/buckets/ValidateBucket.ts
 *
 * Owns: PhysicsPanel instantiation.
 *
 * Phase B.26 (S73-WIRE) — runtime forwarded to PhysicsPanel.
 */

import { PhysicsPanel } from '../PhysicsPanel';

export function mountPhysicsPanel(
    container: HTMLElement,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {
    new PhysicsPanel(container, runtime);
}
