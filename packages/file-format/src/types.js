// .pryzm v1 — public types.
//
// Spec source: phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md §S20
// (lines 418-611) and ADR-0018 (docs/02-decisions/adrs/0018-pryzm-zip-format-v1.md).
//
// The .pryzm container is a ZIP whose layout is:
//
//   manifest.json                Manifest (JSON, Zod-validated on unpack)
//   events/000000.evt.bin       MessagePack event batches (1000 events each)
//   events/000001.evt.bin       ...
//   chunks/<sha256>.glb         Content-addressed compressed geometry (STORE)
//   thumbnails/project.png      Optional 512x512 PNG (DEFLATE)
//   signatures/manifest.sig     Optional Ed25519 signature of manifest bytes
//
// All event batches and chunks are stored with ZIP `STORE` (no
// compression) because each entry is already pre-compressed
// (MessagePack for events, Draco/Meshopt-encoded GLB for chunks).
// Adding a second compression layer slows pack/unpack without
// meaningfully reducing size.
/** Number of events per `events/NNNNNN.evt.bin` batch.  Frozen by ADR-0018. */
export const EVENT_BATCH_SIZE = 1000;
/** Current schema version of the .pryzm format.  Frozen by ADR-0018. */
export const PRYZM_FORMAT_SCHEMA_VERSION = 1;
/** ZIP entry paths.  Centralised to keep pack/unpack/cli in lockstep. */
export const PATHS = {
    manifest: 'manifest.json',
    eventsDir: 'events/',
    chunksDir: 'chunks/',
    thumbnail: 'thumbnails/project.png',
    signature: 'signatures/manifest.sig',
};
//# sourceMappingURL=types.js.map