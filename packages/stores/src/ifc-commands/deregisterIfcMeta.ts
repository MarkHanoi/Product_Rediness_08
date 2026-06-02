// A.R.3 — `ifc.meta.deregister` command handler.
//
// Pure `(payload, store) → IfcCommandResult<IfcMetaDeregisteredEvent>`. Drops
// side-car metadata for deleted elements. `removed` reports how many of the
// requested ids were actually present (unknown ids are silently skipped).

import type { IfcMetaStore } from '../IfcMetaStore.js';
import {
    DeregisterIfcMetaPayloadSchema,
    type DeregisterIfcMetaPayload,
    type IfcCommandResult,
    type IfcMetaDeregisteredEvent,
} from './types.js';

export function deregisterIfcMeta(
    payload: DeregisterIfcMetaPayload,
    store: IfcMetaStore,
): IfcCommandResult<IfcMetaDeregisteredEvent> {
    const parsed = DeregisterIfcMetaPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(`ifc.meta.deregister: invalid payload — ${parsed.error.message}`);
    }
    let removed = 0;
    for (const id of parsed.data.pryzmElementIds) {
        if (store.delete(id)) removed++;
    }
    return {
        ok: true,
        event: { type: 'ifc.meta-deregistered', removed },
    };
}
