// A.2 (Phase A · Sprint 1) — Public surface for the L0 TypologyManifest
// substrate.
//
// Re-exported through the root barrel (`@pryzm/schemas`) — a later slice
// may add a `./typology` subpath entry in `package.json`.
//
// Slice contents:
//   - manifest:   TypologyManifestSchema + TypologyId + enums + helpers
//
// Deferred to later slices:
//   - program-rules: per-typology rule database schema
//   - room-types: per-typology RoomType schemas
//   - regulatory-overlays: jurisdiction × typology regulation map
//   - furniture-presets: typology-specific furniture refs
//   - pipeline-registry: L3 store wrapper

export * from './manifest.js';
