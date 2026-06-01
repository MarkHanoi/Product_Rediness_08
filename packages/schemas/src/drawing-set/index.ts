// C30 DSM-α-1 (Drawing Set Management) — public surface for the L0
// drawing-set substrate.  Re-exported through the root barrel
// (`@pryzm/schemas`).  A later slice may add a `./drawing-set` subpath
// entry in `package.json` to mirror the annotation/view/apartment
// supplements.
//
// Slice DSM-α-1 contents:
//   - Revision:        RevisionSchema (+ type)
//   - SheetReference:  SheetReferenceSchema, DisciplineSchema (+ types)
//   - DrawingSet:      DrawingSetSchema, DrawingSetStatusSchema (+ types)
//   - SheetIssue:      SheetIssueSchema, SheetIssueAcknowledgementSchema
//                      (+ types)
//
// Deferred to later slices: SheetSetStore (L3), TransmittalPackage
// schemas, DrawingRegister derived view, revision-cloud annotation
// (extends `plugins/annotations/`), transmittal PDF generator (L4+),
// SheetSet UI panel (L7.5).

export * from './Revision.js';
export * from './SheetReference.js';
export * from './DrawingSet.js';
export * from './SheetIssue.js';
