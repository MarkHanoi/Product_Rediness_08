// A.R.3 (Revit round-trip · S55) — ifc.meta.* command payloads + shared result
// types. Pattern parallels consent-commands / provenance-commands.
//
// The P6-clean mutation path for the L3 `IfcMetaStore`: the IFC/Revit import
// flow dispatches `ifc.meta.register` (rather than calling `store.add()`
// directly) so the persistence + telemetry layers see one canonical event.
//
// Strategic context: master-execution-tracker §12.6 A.R.3.

import { z } from 'zod';
import { IfcElementMeta } from '@pryzm/schemas/ifc';

/** Soft rejection reasons. Programmer errors (Zod failures) throw. */
export type IfcCommandRejection = 'invalid-payload';

export type IfcCommandResult<TEvent extends { type: string }> =
    | { readonly ok: true; readonly event: TEvent }
    | {
          readonly ok: false;
          readonly reason: IfcCommandRejection;
          readonly message: string;
      };

// ─────────────────────────────────────────────────────────────────────────────
// ifc.meta.register — bulk-register IFC/Revit element metadata (import flow)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ifc.meta.register` payload — every element produced by an IFC/Revit import
 * (Tier-1 native + Tier-2 proxy). The handler bulk-loads them into the store so
 * a later `ifc-export` rebinds the original GlobalId + psets.
 */
export const RegisterIfcMetaPayloadSchema = z.object({
    elements: z.array(IfcElementMeta).min(1),
});
export type RegisterIfcMetaPayload = z.infer<typeof RegisterIfcMetaPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// ifc.meta.deregister — drop metadata for deleted elements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ifc.meta.deregister` payload — drop the side-car metadata for elements that
 * were deleted in the editor (so a re-export doesn't resurrect a stale mapping).
 */
export const DeregisterIfcMetaPayloadSchema = z.object({
    pryzmElementIds: z.array(z.string().min(1)).min(1),
});
export type DeregisterIfcMetaPayload = z.infer<typeof DeregisterIfcMetaPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Domain events
// ─────────────────────────────────────────────────────────────────────────────

export interface IfcMetaRegisteredEvent {
    readonly type: 'ifc.meta-registered';
    readonly count: number;
    readonly globalIds: readonly string[];
}

export interface IfcMetaDeregisteredEvent {
    readonly type: 'ifc.meta-deregistered';
    /** How many of the requested ids were actually present + removed. */
    readonly removed: number;
}
