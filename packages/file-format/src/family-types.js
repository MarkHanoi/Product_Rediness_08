// .pryzm-family v1 — public types & ZIP entry paths.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §5.
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
 *  changes.  v1 is the only version. */
export const FAMILY_FORMAT_SCHEMA_VERSION = 1;
//# sourceMappingURL=family-types.js.map