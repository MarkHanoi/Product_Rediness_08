// A.R.3 (Revit round-trip · S55) — ifc.meta.* command handler barrel.
//
// 2 pure handlers `(payload, store) → IfcCommandResult<Event>` — the P6-clean
// mutation path for the L3 IfcMetaStore:
//   - ifc.meta.register    — bulk-load import metadata (GlobalId round-trip)
//   - ifc.meta.deregister  — drop metadata for deleted elements
//
// Strategic context: master-execution-tracker §12.6 A.R.3.

export {
    RegisterIfcMetaPayloadSchema,
    DeregisterIfcMetaPayloadSchema,
    type RegisterIfcMetaPayload,
    type DeregisterIfcMetaPayload,
    type IfcCommandResult,
    type IfcCommandRejection,
    type IfcMetaRegisteredEvent,
    type IfcMetaDeregisteredEvent,
} from './types.js';
export { registerIfcMeta } from './registerIfcMeta.js';
export { deregisterIfcMeta } from './deregisterIfcMeta.js';
