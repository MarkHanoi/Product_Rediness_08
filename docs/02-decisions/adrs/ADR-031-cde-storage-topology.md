# ADR-031 — CDE Storage Topology: Share L0 Event Log

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Architecture lead, Standards lead |
| Supersedes | none |
| Related | SPEC-32, SPEC-24 (storage map), SPEC-27 (DR) |

## Context

SPEC-32 introduces the CDE module (ISO 19650 status machine + revisions + suitability + comments + tags + releases). The data model overlaps L0 (event log + chunk store from S04 / S22). Two topologies are credible:

1. **Share L0** — CDE rows live in the same Postgres + R2 namespace as `events` and chunks. CDE revisions are immutable references to event-log positions.
2. **Separate namespace** — `cde_*` tables in a separate Postgres database; CDE artefacts in a dedicated R2 bucket. Cleanly isolated from authoring storage.

## Decision

**Share L0.** CDE tables live in the same Postgres database as `events`. CDE artefacts (signed packs, COBie exports) are R2 objects in the project's chunk-store namespace, prefixed `cde/`.

## Consequences

**Positive**
- Zero-copy revisions: a CDE revision is `{ projectId, eventLogSeq }` — no data duplication.
- Single backup story per SPEC-27 (one PG dump per project covers events + CDE).
- Single sovereignty story per SPEC-34 (CDE inherits region selection).
- Atomic state-transition + event commit in one Postgres transaction.

**Negative**
- CDE table growth couples to event-log growth; needs explicit retention policy (ADR for Phase 5).
- A CDE-only customer (very rare) still pays for full L0 storage.

**Risks**
- Coupling means a Postgres compaction strategy must consider both. Mitigated by per-project schema isolation.

## Alternatives considered

- **Separate namespace** — rejected: doubles backup, doubles sovereignty config, breaks atomicity.
- **CDE in event log itself (no tables)** — rejected: query patterns differ (status-by-project random read vs append-only event scan).
