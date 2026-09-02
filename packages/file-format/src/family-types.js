// .pryzm-family — public types & ZIP entry paths.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §5.
// Governed by C111 (ComponentDefinition & the .pryzm-family model).
//
// ⚠ THE CONTAINER HAS THREE INDEPENDENT VERSION FIELDS.  Confusing them
//   is easy and expensive, so they are named here once:
//     1. `FAMILY_FORMAT_SCHEMA_VERSION` (below) — the ENVELOPE: ZIP
//        layout and entry paths.  UNCHANGED at 1 by the v1.1 document
//        bump, because no entry path moved.
//     2. `manifest.formatVersion` / `document.formatVersion` — the
//        COMPONENT MODEL.  Bumped 1.0 -> 1.1; see
//        `family-schema.ts` §FORMAT-VERSION-TABLE and
//        `family-migrations/v1_0-to-v1_1.ts`.
//     3. `FamilyIfcBindingExport.formatVersion` (below) — the
//        `ifc-mapping.json` SUB-DOCUMENT.  Also unchanged.
/** ZIP entry paths for the `.pryzm-family` v1 layout (plan §5.1). */
export const FAMILY_PATHS = {
    manifest: 'manifest.json',
    document: 'document.json',
    eventLog: 'event-log.ndjson',
    ifcMapping: 'ifc-mapping.json',
    thumbnail: 'thumbnail.webp',
    icon: 'icon.svg',
    schemaHash: 'signing/schema-hash',
    signature: 'signing/signature',
};
/** Schema-version literal of the family-pack format itself.  Distinct
 *  from the in-document `formatVersion` (which is the document schema
 *  version); this is bumped only when the *envelope* (paths, ZIP layout)
 *  changes.  v1 is the only version.
 *
 *  ⛔ DELIBERATELY NOT BUMPED BY THE v1.1 DOCUMENT MIGRATION.  v1.1 adds
 *  fields INSIDE `document.json` and removes one; it moves no ZIP entry
 *  and renames no path, so `FAMILY_PATHS` above is untouched.  Bumping
 *  this too would assert an envelope change that did not happen — and a
 *  version number that moves for reasons it does not describe is how a
 *  reader stops trusting all three of them. */
export const FAMILY_FORMAT_SCHEMA_VERSION = 1;
//# sourceMappingURL=family-types.js.map