// C27 INS-α-2 (BIM 3.0 Inspect Model) — public surface for the L0 inspect
// substrate.  Re-exported through the root barrel (`@pryzm/schemas`).  A
// later slice may add a `./inspect` subpath entry in `package.json` to
// mirror the annotation/view/apartment supplements.
//
// Slice INS-α-2 contents:
//   - selection:  InspectNodeKindSchema, InspectSelectionSchema (+ types)
//   - isolation:  IsolationTierSchema, IsolationOverrideSchema,
//                 SpatialRelationshipSchema (+ types)
//
// Deferred to later slices: visibility-engine wiring, master-tree
// projection, UI bindings.

export * from './selection.js';
export * from './isolation.js';
