// Op #16: set-type-values (lane UCE-FAMILY · §UCE-TYPE-CHECKSUM-IS-COMPUTED).
//
// ⭐⭐ WHAT THIS CLOSES, AND IT IS A CORRECTNESS DEFECT RATHER THAN A MISSING
//     FEATURE. `ComponentTypeCatalog` — the LIVE, reachable type editor — can
//     already create a type (through `split-type`) and delete one, but EDITING a
//     type's values went through no op at all. Its own comment says so:
//
//       *"EDIT has NO dedicated migrator (OWED §Owed O-2). … The per-type
//        `checksum` is carried UNCHANGED — no op recomputes it and the loader
//        does not verify it, so recomputing here would be a rival writer."*
//
//     Both halves of that were true and both were bad:
//
//     1. **A raw `document.types` transform beside the ops** is the rival
//        mutation path the whole gateway exists to prevent (C84 EI-9). Every
//        other edit in the component surfaces is an op whose typed throw IS the
//        refusal; this one was a hand-rolled object spread with its own
//        hand-rolled guards.
//     2. **The persisted `checksum` went stale on every value edit** — silently,
//        permanently, in a CONTENT-ADDRESSED format. `FamilyTypeSchema` says the
//        field is *"canonical-JSON sha256 of the values map"*; after one edit it
//        was the sha256 of a values map that no longer existed.
//
// ─── ⛔ AND `split-type`'s COMMENT ABOUT THIS WAS FALSE — MEASURED ────────────
//     `split-type.ts` carried: *"The real sha256 is recomputed async when the
//     family is packed via family-pack.ts."* It is not.
//
//         grep -c checksum packages/file-format/src/family-pack.ts    -> 0
//         grep -c checksum packages/file-format/src/family-unpack.ts  -> 0
//
//     Nothing recomputes a type checksum at pack time and nothing verifies one at
//     load time. So the value this op writes is the ONLY value the field will
//     ever hold — which is exactly why it must be computed here and not deferred
//     to a step that does not exist. That comment is corrected in `split-type.ts`
//     by the same change that introduced this file, so the false claim does not
//     outlive the code it described (the repository's signature defect class: a
//     document asserting an enforcement that is not there).
//
// ─── ⭐ ONE CHECKSUM FUNCTION, NOT TWO ────────────────────────────────────────
//     `typeValuesChecksum` is MOVED here from `split-type.ts`, not copied, and
//     `split-type` now imports it. Two ops writing the same field with two
//     private hash implementations is how the create path and the edit path start
//     disagreeing about what a type's checksum means.
//
// ─── ⛔ IT REPLACES THE VALUES MAP, IT DOES NOT MERGE ─────────────────────────
//     A type's `values` is the complete set of parameters that type pins; a merge
//     could never CLEAR one, and "this type no longer pins Width" is a real
//     authoring act. The caller sends the whole map, which is also what lets this
//     op prove every key against the document's parameters in one pass.

import { canonicalise } from '../../canonical-json.js';
import type { FamilyDocument, FamilyParameter } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

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
export function typeValuesChecksum(values: TypeValueMap): string {
  const json = canonicalise(values as Record<string, unknown>);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, '0').repeat(8);
  return 'sha256:' + hex;
}

export interface SetTypeValuesParams {
  readonly typeId: string;
  /** The COMPLETE new values map — see the header: it replaces, never merges. */
  readonly values: TypeValueMap;
  /** Optional rename, applied in the same op so a rename cannot land without the
   *  values it was made alongside (one accept/refuse decision). */
  readonly name?: string;
}

/** Does `value` fit what `dataType` declares? C110 owns the model; this is the
 *  DOCUMENT's own guard at the one place a type value is written. */
function valueFitsDataType(p: FamilyParameter, value: number | string | boolean): boolean {
  switch (p.dataType) {
    case 'length':
    case 'angle':
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'count':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    default:
      return false;
  }
}

export function makeSetTypeValuesMigrator(
  from: string,
  to: string,
  params: SetTypeValuesParams,
): Migrator {
  return {
    id: `set-type-values:${params.typeId}`,
    from,
    to,
    description:
      `set ${Object.keys(params.values).length} value(s) on type ${params.typeId}` +
      (params.name === undefined ? '' : ` and rename it to "${params.name}"`),
    apply(input: RawFamily): RawFamily {
      const doc = input.document;
      const target = doc.types.find((t) => t.id === params.typeId);
      if (!target) throw new Error(`type ${params.typeId} not found`);

      // ── the rename, if one was asked for ──────────────────────────────────
      let nextName = target.name;
      if (params.name !== undefined) {
        const trimmed = params.name.trim();
        if (trimmed.length === 0) {
          throw new Error(
            `a type name cannot be empty; type ${params.typeId} keeps the name '${target.name}'`,
          );
        }
        // ⭐ UNIQUENESS LIVES HERE, at the document, because nothing else
        //    enforces it — `FamilyTypeSchema` constrains only `min(1)` on the
        //    string. A UI guard alone is one deleted line away from two types a
        //    user cannot tell apart in any picker.
        const clash = doc.types.find(
          (t) => t.id !== params.typeId && t.name.trim().toLowerCase() === trimmed.toLowerCase(),
        );
        if (clash) {
          throw new Error(
            `a type named '${trimmed}' already exists in this definition (${clash.id}); ` +
              'type names must be unique — nothing was changed',
          );
        }
        nextName = trimmed;
      }

      // ── every key must name a parameter, and fit its declared type ─────────
      const byId = new Map(
        (doc.parameters as readonly FamilyParameter[]).map((p) => [p.id, p] as const),
      );
      for (const [pid, value] of Object.entries(params.values)) {
        const p = byId.get(pid);
        if (p === undefined) {
          throw new Error(
            `type '${nextName}' was given a value for ${pid}, which this definition declares no ` +
              'parameter for; a type value keyed to nothing is a value no resolver will ever read',
          );
        }
        if (!valueFitsDataType(p, value)) {
          throw new Error(
            `parameter '${p.name}' is declared as ${p.dataType} and the value given for it is a ` +
              `${typeof value}${typeof value === 'number' && !Number.isFinite(value) ? ' (non-finite)' : ''}; ` +
              'a type value of the wrong shape resolves to nothing and the parameter reads as ' +
              'unresolved wherever it is placed',
          );
        }
      }

      // ⭐ Copy the map so the caller's object cannot be mutated into the
      //    document afterwards, and compute the checksum from the SAME object
      //    that is stored — the two can never describe different values.
      const values: Record<string, number | string | boolean> = { ...params.values };
      const types = doc.types.map((t) =>
        t.id === params.typeId
          ? { ...t, name: nextName, values, checksum: typeValuesChecksum(values) }
          : t,
      );

      return {
        manifest: { ...input.manifest },
        document: { ...doc, formatVersion: to, types } as FamilyDocument,
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
