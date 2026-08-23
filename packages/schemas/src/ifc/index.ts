// @pryzm/schemas/ifc — IFC/Revit interoperability schemas (L0).
// The canonical durable element-metadata shape shared by the IfcMetaStore
// (@pryzm/stores) and the ifc-import / ifc-export plugins. See IfcElementMeta.ts.

export {
    PsetValue,
    Pset,
    Qset,
    IfcElementTier,
    IfcElementMeta,
    IfcMetaStoreSnapshot,
} from './IfcElementMeta.js';

// L-8500 — the ONE `IfcGloballyUniqueId` encoder/validator, shared by BOTH
// export pipelines (`@pryzm/file-format` L3 and `@pryzm/plugin-ifc-export` L6).
// Placed at L0 because that is the only layer both can import downward from.
export {
    IFC_GLOBAL_ID_LENGTH,
    IFC_GLOBAL_ID_ALPHABET,
    isIfcGlobalId,
    globalIdFromUuid,
    uuidFromGlobalId,
    stableUuidFromKey,
    globalIdFromStableKey,
    toIfcGlobalId,
} from './GlobalId.js';
