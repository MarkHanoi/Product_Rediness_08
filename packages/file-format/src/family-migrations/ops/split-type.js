// Op #8: split-type (S57 §19.6).
//
// Clones a `FamilyType` into a brand-new type with its own id, name,
// and (optionally) value overrides.  The source type is preserved.
//
// ⛔ CORRECTED 2026-09-04 (lane UCE-FAMILY, §UCE-TYPE-CHECKSUM-IS-COMPUTED).
//    This header used to end: *"The real sha256 is recomputed async when the
//    family is packed via family-pack.ts."* **It is not, and it never was.**
//
//        grep -c checksum packages/file-format/src/family-pack.ts    -> 0
//        grep -c checksum packages/file-format/src/family-unpack.ts  -> 0
//
//    Nothing recomputes a type checksum at pack time and nothing verifies one at
//    load time, so the value written HERE is the only value the field will ever
//    hold. The comment described a downstream repair that does not exist — which
//    is why `ComponentTypeCatalog`'s edit path felt safe carrying the checksum
//    unchanged, and why an edited type's checksum was stale forever.
//
// ⭐ The digest itself now lives in ONE place — `./type-values.ts`'s
//    `typeValuesChecksum`, which `set-type-values` also uses. Two ops writing one
//    field with two private hash implementations is how the create path and the
//    edit path start disagreeing (C84 EI-9).
import { typeValuesChecksum } from './type-values.js';
export function makeSplitTypeMigrator(from, to, params) {
    return {
        id: `split-type:${params.sourceTypeId}->${params.newTypeId}`,
        from,
        to,
        description: `split type ${params.sourceTypeId} → ${params.newTypeId} ("${params.newTypeName}")`,
        apply(input) {
            if (params.sourceTypeId === params.newTypeId) {
                throw new Error('sourceTypeId and newTypeId must differ');
            }
            const source = input.document.types.find((t) => t.id === params.sourceTypeId);
            if (!source)
                throw new Error(`source type ${params.sourceTypeId} not found`);
            if (input.document.types.some((t) => t.id === params.newTypeId)) {
                throw new Error(`new type id ${params.newTypeId} already present in document`);
            }
            const mergedValues = {
                ...source.values,
                ...(params.valueOverrides ?? {}),
            };
            const checksum = typeValuesChecksum(mergedValues);
            const types = [
                ...input.document.types,
                {
                    id: params.newTypeId,
                    name: params.newTypeName,
                    values: mergedValues,
                    checksum,
                },
            ];
            return {
                manifest: { ...input.manifest },
                document: {
                    ...input.document,
                    formatVersion: to,
                    types,
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=split-type.js.map