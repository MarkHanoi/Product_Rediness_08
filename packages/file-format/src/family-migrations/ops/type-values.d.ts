import type { Migrator } from '../types.js';
/** One type's value map, in the spelling `FamilyTypeSchema.values` takes. */
export type TypeValueMap = Readonly<Record<string, number | string | boolean>>;
/**
 * ⭐ THE ONE per-type checksum. A non-cryptographic FNV-1a over the canonical
 * JSON of the values map, widened to the `sha256:<64 hex>` shape `Sha256`
 * requires.
 *
 * ⚠ IT IS NOT A SHA-256, AND THE FIELD'S NAME SAYS IT IS. That mismatch is
 *   INHERITED from `split-type` (this function is its body, moved) and is
 *   deliberately not fixed here: changing the digest changes the checksum of
 *   every type any existing document carries, which is a format-version
 *   question, not an op question. What this op guarantees is the property the
 *   field is actually used for — *"the writer can detect dirty types"* — which a
 *   STALE checksum destroyed and a consistent digest restores. Recorded so the
 *   next reader does not mistake the string for a cryptographic claim.
 */
export declare function typeValuesChecksum(values: TypeValueMap): string;
export interface SetTypeValuesParams {
    readonly typeId: string;
    /** The COMPLETE new values map — see the header: it replaces, never merges. */
    readonly values: TypeValueMap;
    /** Optional rename, applied in the same op so a rename cannot land without the
     *  values it was made alongside (one accept/refuse decision). */
    readonly name?: string;
}
export declare function makeSetTypeValuesMigrator(from: string, to: string, params: SetTypeValuesParams): Migrator;
//# sourceMappingURL=type-values.d.ts.map