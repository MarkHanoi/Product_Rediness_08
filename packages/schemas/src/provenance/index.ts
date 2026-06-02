// A.31.a (Phase A · Sprint 2) — Public surface for the L0 C23 Provenance
// substrate.
//
// Subpath-only — `import { AIArtefactSchema } from '@pryzm/schemas/provenance'`.
// Not re-exported via the root barrel to keep the C23 namespace independent
// of the other Phase A substrates.
//
// Slice contents (A.31.a):
//   - AIArtefact      append-only audit row per §2.1
//   - ProvenanceEdge  one directed edge in the lineage DAG per §2.2
//   - ContextSnapshot serialised model context per §2.3
//   - RedactionRecord PII redaction audit per §2.4
//
// Deferred to later slices:
//   - A.31.b ProvenanceExport (composes the 4 above) per §2.5
//   - A.31.c L3 ProvenanceStore (append-only with composeRuntime wiring)
//   - A.31.d L3 provenance.* commands per §4
//
// Strategic context: docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md.

export * from './AIArtefact.js';
export * from './ProvenanceEdge.js';
export * from './ContextSnapshot.js';
export * from './RedactionRecord.js';
export * from './ProvenanceExport.js';
