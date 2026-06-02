// A.R.3 — `ifc.meta.register` command handler.
//
// Pure `(payload, store) → IfcCommandResult<IfcMetaRegisteredEvent>`. Bulk-loads
// the import's element metadata into the L3 IfcMetaStore in one notify.

import type { IfcMetaStore } from '../IfcMetaStore.js';
import {
    RegisterIfcMetaPayloadSchema,
    type RegisterIfcMetaPayload,
    type IfcCommandResult,
    type IfcMetaRegisteredEvent,
} from './types.js';

export function registerIfcMeta(
    payload: RegisterIfcMetaPayload,
    store: IfcMetaStore,
): IfcCommandResult<IfcMetaRegisteredEvent> {
    const parsed = RegisterIfcMetaPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(`ifc.meta.register: invalid payload — ${parsed.error.message}`);
    }
    const { elements } = parsed.data;
    store.addMany(elements);
    return {
        ok: true,
        event: {
            type: 'ifc.meta-registered',
            count: elements.length,
            globalIds: elements.map((e) => e.globalId),
        },
    };
}
