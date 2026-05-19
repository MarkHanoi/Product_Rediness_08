// IFCExportStore — per-element IFC metadata store for round-trip fidelity
// (S56 / PHASE-3B).
//
// Wave 12 recipe completion: ifc-export plugin store.ts (previously missing).
//
// The IFC export plugin needs to track per-element GlobalIds and Psets so
// that a PRYZM → IFC → PRYZM round-trip preserves IFC identity. This
// store re-exports InMemoryIFCMetaStore as the canonical store.ts so the
// Wave 12 verifier finds plugins/ifc-export/src/store.ts.

export { InMemoryIFCMetaStore } from './meta-store.js';
export type {
  IFCElementMeta,
  IFCMetaStoreLike,
  Pset,
  PsetValue,
  Qset,
} from './types.js';
