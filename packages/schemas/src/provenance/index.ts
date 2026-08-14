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

// C75 §1/§2 (added 2026-08-12) — the five-value AUTHORED/OBSERVED/COMPUTED/
// INFERRED/REGENERATED vocabulary and its UNKNOWN-with-reason record. Filed
// under this subpath because it is provenance, but note the SCOPE difference:
// C23 (the four schemas below) is the AI-audit lineage DAG — who called what and
// what it produced. C75's `ValueOrigin` is a per-VALUE origin label on ordinary
// model data, most of which no AI ever touched. They compose (a `regenerated`
// value's chain is a `ProvenanceEdge`) and neither restates the other.
export * from './ValueOrigin.js';
// PV-06 (C75 §1.3 · C62/ADR-0280) — the element-side confidence field lives in
// this namespace beside ValueOrigin: same axis family, deliberately SEPARATE
// values (C75 §1.2 — a computed value may be low-confidence, an observed one stale).
export * from './ElementConfidence.js';
// PV-08 (C75 §1.2) — the exhaustive, TYPE-CHECKED translation from the legacy
// per-family `detectionMethod` vocabularies into the five. Lives here, at L0,
// because the only prior translation lived at L7 (`ElementProvenanceIndex.ts`),
// covered one of the three vocabularies, and was typed `Record<string, …>` — so a
// member added upstream compiled cleanly and silently meant nothing.
export * from './DetectionMethodOrigin.js';

export * from './AIArtefact.js';
export * from './ProvenanceEdge.js';
export * from './ContextSnapshot.js';
export * from './RedactionRecord.js';
export * from './ProvenanceExport.js';
